/**
 * Données construites (data/build/) servies en lecture seule à l'interface : état des builds et
 * fichiers d'une liste blanche. Aucun autre fichier du disque n'est accessible.
 */
import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_FILES_PREFIX,
  DATA_STATUS_PATH,
  type DataStatus,
  type MapBuildInfo,
} from '../src/data/status.ts';

export const DEFAULT_BUILD_DIR = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../data/build',
);

const ROOT_FILES = new Set(['countries.base.json', 'pairs.base.json', 'world.base.json']);
const MAP_JSON = /^(map|geo|routes)-(\d{3,5})\.json$/;
const MAP_BINARY = /^(map|land)-(\d{3,5})\.bin\.gz$/;

/** Chemin d'un fichier servi, ou null s'il n'est pas dans la liste blanche. */
export function resolveDataFile(buildDir: string, name: string): string | null {
  if (ROOT_FILES.has(name)) return join(buildDir, name);
  if (MAP_JSON.test(name) || MAP_BINARY.test(name)) return join(buildDir, 'map', name);
  return null;
}

/**
 * Les archives gzip sont servies telles quelles (sans `Content-Encoding`) : l'interface les
 * décompresse en flux avec DecompressionStream.
 */
export function contentTypeOf(name: string): string {
  return name.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream';
}

async function readHead(path: string, bytes = 512): Promise<string | null> {
  try {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

/** Champ texte d'un en-tête JSON (les champs d'identification sont écrits en premier). */
export function headField(head: string | null, field: string): string | null {
  if (head === null) return null;
  const match = new RegExp(`"${field}":"([^"]+)"`).exec(head);
  return match?.[1] ?? null;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function dataStatus(buildDir: string): Promise<DataStatus> {
  const mapDir = join(buildDir, 'map');
  let names: string[] = [];
  try {
    names = await readdir(mapDir);
  } catch {
    names = [];
  }
  const resolutions = new Set<number>();
  for (const name of names) {
    const m = MAP_JSON.exec(name) ?? MAP_BINARY.exec(name);
    if (m?.[2] !== undefined) resolutions.add(Number(m[2]));
  }
  const maps: MapBuildInfo[] = [];
  for (const resolution of [...resolutions].sort((a, b) => a - b)) {
    const has = (file: string): boolean => names.includes(file);
    const buildId = headField(await readHead(join(mapDir, `map-${resolution}.json`)), 'buildId');
    maps.push({
      resolution,
      buildId: buildId ?? '',
      files: {
        map: has(`map-${resolution}.bin.gz`),
        meta: has(`map-${resolution}.json`),
        land: has(`land-${resolution}.bin.gz`),
        geo: has(`geo-${resolution}.json`),
        routes: has(`routes-${resolution}.json`),
      },
    });
  }

  const countriesHead = await readHead(join(buildDir, 'countries.base.json'));
  const buildDate = headField(countriesHead, 'buildDate');
  const mapBuildId = headField(countriesHead, 'mapBuildId');
  const base = { buildDate, mapBuildId, maps };
  const missing = [...ROOT_FILES];
  const present = await Promise.all(missing.map((f) => exists(join(buildDir, f))));
  const absent = missing.filter((_, i) => !present[i]);
  if (absent.length > 0) {
    return {
      ...base,
      ready: false,
      resolution: null,
      problem: `Données absentes (${absent.join(', ')}) : lance « npm run data ».`,
    };
  }
  const map = maps.find((m) => m.buildId === mapBuildId);
  if (map === undefined) {
    return {
      ...base,
      ready: false,
      resolution: null,
      problem:
        maps.length === 0
          ? 'Carte absente : lance « npm run data ».'
          : `Aucune carte ne correspond aux données pays (carte ${mapBuildId ?? '?'}) : relance « npm run data ».`,
    };
  }
  const lacking = (['map', 'meta', 'land'] as const).filter((f) => !map.files[f]);
  if (lacking.length > 0) {
    return {
      ...base,
      ready: false,
      resolution: map.resolution,
      problem: `Carte ${map.resolution} incomplète (${lacking.join(', ')}) : relance « npm run data ».`,
    };
  }
  return { ...base, ready: true, resolution: map.resolution, problem: null };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Middleware Connect : `/api/data/status` et `/api/data/files/<nom>`. */
export function dataMiddleware(buildDir: string = DEFAULT_BUILD_DIR) {
  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (path !== DATA_STATUS_PATH && !path.startsWith(DATA_FILES_PREFIX)) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Méthode non autorisée' });
      return;
    }
    if (path === DATA_STATUS_PATH) {
      dataStatus(buildDir).then(
        (status) => sendJson(res, 200, status),
        (e: unknown) => next(e),
      );
      return;
    }
    let name: string;
    try {
      name = decodeURIComponent(path.slice(DATA_FILES_PREFIX.length));
    } catch {
      sendJson(res, 400, { error: 'Nom de fichier invalide' });
      return;
    }
    const file = resolveDataFile(buildDir, name);
    if (file === null) {
      sendJson(res, 404, { error: `Fichier non servi : ${name}` });
      return;
    }
    stat(file).then(
      (info) => {
        const etag = `"${info.size.toString(36)}-${Math.round(info.mtimeMs).toString(36)}"`;
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-cache');
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', contentTypeOf(name));
        res.setHeader('Content-Length', String(info.size));
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(file).on('error', next).pipe(res);
      },
      () => sendJson(res, 404, { error: `Fichier absent : ${name} (lance « npm run data »)` }),
    );
  };
}
