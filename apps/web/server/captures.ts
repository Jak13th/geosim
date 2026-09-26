/**
 * Captures de simulation enregistrées sur le disque (`captures/`, hors du dépôt git) :
 * - `GET /api/captures` : liste (nom, taille, date, tick et date de départ lus dans l'en-tête) ;
 * - `GET /api/captures/<nom>` : contenu (JSON produit par `serializeSnapshot`) ;
 * - `PUT /api/captures/<nom>` : enregistrement ; `DELETE /api/captures/<nom>` : suppression.
 * Les noms sont filtrés (lettres, chiffres, espace, `_`, `.`, `-`) : aucun chemin arbitraire.
 */
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { CAPTURES_API, isCaptureName, type CaptureFileInfo } from '../src/api/contract.ts';
import { HttpError, checkWrite, readBody, sendError, sendJson } from './http.ts';
import { REPO_ROOT } from './modelFile.ts';

export const CAPTURES_DIR = resolve(REPO_ROOT, 'captures');

/** Taille maximale d'une capture (20 ans d'historique pèsent environ 15 Mo). */
const MAX_CAPTURE_BYTES = 512 * 1024 * 1024;
const SIGNATURE = '{"format":"geosim-capture"';

/** Chemin du fichier d'une capture, ou null si le nom est refusé. */
export function captureFile(dir: string, name: string): string | null {
  return isCaptureName(name) ? join(dir, `${name}.json`) : null;
}

async function readHead(path: string, bytes = 1024): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** Champs d'identification lus dans l'en-tête d'une capture (écrits en premier). */
export function captureHead(
  head: string,
): Pick<CaptureFileInfo, 'tick' | 'startDate' | 'dataId' | 'label'> {
  const text = (field: string): string | null =>
    new RegExp(`"${field}":"([^"]*)"`).exec(head)?.[1] ?? null;
  const tick = /"tick":(\d+)/.exec(head)?.[1];
  return {
    tick: tick === undefined ? null : Number(tick),
    startDate: text('startDate'),
    dataId: text('dataId'),
    label: text('label'),
  };
}

export async function listCaptures(dir: string = CAPTURES_DIR): Promise<CaptureFileInfo[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: CaptureFileInfo[] = [];
  for (const file of names) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -'.json'.length);
    if (!isCaptureName(name)) continue;
    const path = join(dir, file);
    try {
      const [info, head] = await Promise.all([stat(path), readHead(path)]);
      if (!head.startsWith(SIGNATURE)) continue;
      out.push({ name, size: info.size, mtime: info.mtimeMs, ...captureHead(head) });
    } catch {
      // Fichier supprimé entre-temps ou illisible : ignoré.
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export async function writeCapture(dir: string, name: string, text: string): Promise<void> {
  const path = captureFile(dir, name);
  if (path === null) throw new HttpError(400, `Nom de capture refusé : ${name}`);
  if (!text.startsWith(SIGNATURE)) throw new HttpError(400, 'Ce contenu n’est pas une capture');
  await mkdir(dir, { recursive: true });
  // Écriture atomique : un fichier à moitié écrit ne remplace jamais une capture.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, path);
}

function nameOf(pathname: string): string {
  try {
    return decodeURIComponent(pathname.slice(CAPTURES_API.length + 1));
  } catch {
    throw new HttpError(400, 'Nom de capture invalide');
  }
}

/** Middleware Connect des captures. */
export function capturesMiddleware(dir: string = CAPTURES_DIR) {
  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (path !== CAPTURES_API && !path.startsWith(`${CAPTURES_API}/`)) {
      next();
      return;
    }
    (async () => {
      if (path === CAPTURES_API || path === `${CAPTURES_API}/`) {
        if (req.method !== 'GET') throw new HttpError(405, 'Méthode non autorisée');
        sendJson(res, 200, await listCaptures(dir));
        return;
      }
      const name = nameOf(path);
      const file = captureFile(dir, name);
      if (file === null) throw new HttpError(400, `Nom de capture refusé : ${name}`);
      switch (req.method) {
        case 'GET': {
          const info = await stat(file).catch(() => null);
          if (info === null) throw new HttpError(404, `Capture absente : ${name}`);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', String(info.size));
          res.setHeader('Cache-Control', 'no-store');
          createReadStream(file)
            .on('error', (e) => next(e))
            .pipe(res);
          return;
        }
        case 'PUT':
          checkWrite(req);
          await writeCapture(dir, name, await readBody(req, MAX_CAPTURE_BYTES));
          sendJson(res, 200, { ok: true, name });
          return;
        case 'DELETE':
          checkWrite(req);
          await unlink(file).catch(() => {
            throw new HttpError(404, `Capture absente : ${name}`);
          });
          sendJson(res, 200, { ok: true, name });
          return;
        default:
          throw new HttpError(405, 'Méthode non autorisée');
      }
    })().catch((e: unknown) => sendError(res, e));
  };
}
