/**
 * Lecture de fichiers CSV (RFC 4180 : champs entre guillemets, guillemets doublés).
 * `parseCsv` travaille sur un texte en mémoire ; `readCsvLines` et `zipEntryLines` lisent ligne
 * à ligne les gros fichiers (FAOSTAT, BACI) sans les charger en entier.
 */
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createInflateRaw } from 'node:zlib';
import type { Readable } from 'node:stream';

/** Découpe une ligne CSV en champs. */
export function splitCsvLine(line: string, separator = ','): string[] {
  if (!line.includes('"')) return line.split(separator);
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) {
      fields.push(field);
      field = '';
    } else field += c;
  }
  fields.push(field);
  return fields;
}

/**
 * Analyse un CSV complet (champs entre guillemets pouvant contenir des retours à la ligne).
 * Renvoie une ligne d'objets indexés par les noms de colonnes de l'en-tête.
 */
export function parseCsv(text: string, separator = ','): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  const [header, ...rows] = records;
  if (header === undefined) return [];
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? '') !== '')
    .map((r) => Object.fromEntries(header.map((name, k) => [name, r[k] ?? ''])));
}

async function* lines(stream: Readable): AsyncGenerator<string> {
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of reader) yield line;
}

/** Lignes d'un fichier texte, lues en flux. */
export function readCsvLines(path: string): AsyncGenerator<string> {
  return lines(createReadStream(path));
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

/** Répertoire central d'une archive ZIP (sans ZIP64 : archives < 4 Go). */
export async function listZip(path: string): Promise<ZipEntry[]> {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const tailLength = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`${path} : fin du répertoire central introuvable`);
    const count = tail.readUInt16LE(eocd + 10);
    const dirSize = tail.readUInt32LE(eocd + 12);
    const dirOffset = tail.readUInt32LE(eocd + 16);
    const dir = Buffer.alloc(dirSize);
    await handle.read(dir, 0, dirSize, dirOffset);
    const entries: ZipEntry[] = [];
    let at = 0;
    for (let k = 0; k < count; k++) {
      if (dir.readUInt32LE(at) !== 0x02014b50)
        throw new Error(`${path} : répertoire central invalide`);
      const nameLength = dir.readUInt16LE(at + 28);
      const extraLength = dir.readUInt16LE(at + 30);
      const commentLength = dir.readUInt16LE(at + 32);
      entries.push({
        method: dir.readUInt16LE(at + 10),
        compressedSize: dir.readUInt32LE(at + 20),
        size: dir.readUInt32LE(at + 24),
        localHeaderOffset: dir.readUInt32LE(at + 42),
        name: dir.toString('utf8', at + 46, at + 46 + nameLength),
      });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

/** Lignes d'un fichier d'une archive ZIP, décompressées en flux (méthodes 0 et 8). */
export async function* zipEntryLines(path: string, entry: ZipEntry): AsyncGenerator<string> {
  const handle = await open(path, 'r');
  const header = Buffer.alloc(30);
  await handle.read(header, 0, 30, entry.localHeaderOffset);
  await handle.close();
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path} : en-tête local invalide`);
  const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const raw = createReadStream(path, { start, end: start + entry.compressedSize - 1 });
  if (entry.method === 0) yield* lines(raw);
  else if (entry.method === 8) yield* lines(raw.pipe(createInflateRaw()));
  else
    throw new Error(`${path} › ${entry.name} : méthode de compression ${entry.method} non gérée`);
}
