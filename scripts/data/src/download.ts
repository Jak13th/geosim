/**
 * Téléchargements mis en cache dans data/raw et tracés dans data/manifest.json
 * (URL, date d'accès, version, licence, taille, empreinte SHA-256).
 *
 * Un fichier déjà présent dans le cache n'est jamais retéléchargé, sauf avec `--refresh` :
 * le second passage de `npm run data` fonctionne donc hors ligne.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceDef } from './sources.ts';

export interface ManifestEntry {
  id: string;
  url: string;
  file: string;
  provider: string;
  description: string;
  license: string;
  licenseUrl: string;
  version: string;
  /** Date d'accès (AAAA-MM-JJ). */
  accessed: string;
  /** En-tête HTTP Last-Modified, s'il existe. */
  lastModified: string | null;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  version: 1;
  description: string;
  sources: ManifestEntry[];
}

/** Réponse HTTP minimale : permet d'injecter un faux `fetch` dans les tests. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string) => Promise<FetchResponse>;

export interface DownloadOptions {
  rawDir: string;
  manifestPath: string;
  refresh: boolean;
  fetch: FetchLike;
  /** Date d'accès consignée dans le manifeste. */
  today: string;
  log?: (message: string) => void;
}

const MANIFEST_DESCRIPTION =
  'Sources téléchargées par `npm run data` : URL, date d’accès, version et licence. Tenu à jour par le pipeline.';

export async function readManifest(path: string): Promise<Manifest> {
  if (!existsSync(path)) return { version: 1, description: MANIFEST_DESCRIPTION, sources: [] };
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Manifest;
  return { version: 1, description: parsed.description, sources: parsed.sources ?? [] };
}

export async function writeManifest(path: string, manifest: Manifest): Promise<void> {
  const sorted = [...manifest.sources].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(path, `${JSON.stringify({ ...manifest, sources: sorted }, null, 2)}\n`);
}

export function fileNameFor(source: SourceDef): string {
  const extension = source.url.split('?')[0]?.split('.').pop() ?? 'bin';
  return `${source.id}.${extension}`;
}

/**
 * Garantit la présence locale de chaque source et renvoie le chemin de chacune.
 * Le manifeste n'est réécrit que si un téléchargement a eu lieu.
 */
export async function ensureSources(
  sources: readonly SourceDef[],
  options: DownloadOptions,
): Promise<Map<string, string>> {
  const log = options.log ?? (() => undefined);
  await mkdir(options.rawDir, { recursive: true });
  const manifest = await readManifest(options.manifestPath);
  const paths = new Map<string, string>();
  let changed = false;

  for (const source of sources) {
    const file = fileNameFor(source);
    const path = join(options.rawDir, file);
    paths.set(source.id, path);
    const known = manifest.sources.find((entry) => entry.id === source.id);
    if (existsSync(path) && !options.refresh) {
      if (known === undefined) {
        // Fichier présent mais jamais tracé (copie manuelle) : on le trace sans réseau.
        const bytes = await readFile(path);
        manifest.sources.push(entryFor(source, file, bytes, null, options.today));
        changed = true;
      }
      continue;
    }

    log(`Téléchargement de ${source.url}`);
    const response = await options.fetch(source.url);
    if (!response.ok) {
      throw new Error(`Échec du téléchargement de ${source.url} : HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const partial = `${path}.part`;
    await writeFile(partial, bytes);
    await rm(path, { force: true });
    await rename(partial, path);
    log(`  ${(bytes.byteLength / 1e6).toFixed(1)} Mo → data/raw/${file}`);

    const entry = entryFor(
      source,
      file,
      bytes,
      response.headers.get('last-modified'),
      options.today,
    );
    manifest.sources = manifest.sources.filter((e) => e.id !== source.id);
    manifest.sources.push(entry);
    changed = true;
  }

  if (changed) await writeManifest(options.manifestPath, manifest);
  return paths;
}

function entryFor(
  source: SourceDef,
  file: string,
  bytes: Uint8Array,
  lastModified: string | null,
  today: string,
): ManifestEntry {
  return {
    id: source.id,
    url: source.url,
    file,
    provider: source.provider,
    description: source.description,
    license: source.license,
    licenseUrl: source.licenseUrl,
    version: source.version,
    accessed: today,
    lastModified,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

/** Met à jour la version d'une source (relue dans l'archive) si elle diffère du manifeste. */
export async function recordVersion(
  manifestPath: string,
  id: string,
  version: string,
): Promise<void> {
  const manifest = await readManifest(manifestPath);
  const entry = manifest.sources.find((e) => e.id === id);
  if (entry === undefined || entry.version === version) return;
  entry.version = version;
  await writeManifest(manifestPath, manifest);
}
