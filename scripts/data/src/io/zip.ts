/** Extraction d'archives ZIP en mémoire (fflate, JavaScript pur). */
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

/** Extrait les fichiers dont le nom (sans dossier) satisfait `keep`. Clés : noms sans dossier. */
export async function readZip(
  path: string,
  keep: (name: string) => boolean = () => true,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await readFile(path));
  const files = unzipSync(bytes, { filter: (file) => keep(baseName(file.name)) });
  const out = new Map<string, Uint8Array>();
  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith('/')) out.set(baseName(name), content);
  }
  return out;
}

function baseName(name: string): string {
  return name.split('/').pop() ?? name;
}
