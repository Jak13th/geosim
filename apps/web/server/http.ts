/**
 * Utilitaires HTTP de l'API locale : réponses JSON, lecture bornée du corps des requêtes et garde
 * des requêtes qui écrivent sur le disque.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CLIENT_HEADER } from '../src/api/contract.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function sendError(res: ServerResponse, e: unknown): void {
  if (e instanceof HttpError) sendJson(res, e.status, { error: e.message });
  else sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
}

/** Corps d'une requête en texte UTF-8, refusé au-delà de `limit` octets. */
export function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new HttpError(413, `Requête trop volumineuse (plus de ${limit} octets)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Vérifie qu'une requête d'écriture vient de l'interface locale : en-tête propre au client et,
 * si le navigateur l'indique, origine locale. Lève une `HttpError` sinon.
 */
export function checkWrite(req: IncomingMessage): void {
  if (req.headers[CLIENT_HEADER] !== '1') {
    throw new HttpError(403, `Écriture refusée : en-tête ${CLIENT_HEADER} absent`);
  }
  const origin = req.headers.origin;
  if (origin !== undefined && !LOCAL_ORIGIN.test(origin)) {
    throw new HttpError(403, `Écriture refusée depuis l'origine ${origin}`);
  }
}
