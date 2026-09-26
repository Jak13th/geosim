/**
 * Sérialisation des captures en texte JSON (fichiers de sauvegarde) : les tableaux typés sont
 * encodés en base64 (petit-boutiste, l'ordre des octets de toutes les plateformes visées), le
 * reste tel quel. Aucune API propre au navigateur ou à Node (`btoa`, `Buffer`) : le moteur reste
 * pur.
 */
import type { EngineSnapshot } from './engine.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63];
    out += c === undefined ? '=' : ALPHABET[n & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let k = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      ((LOOKUP.get(clean[i] ?? 'A') ?? 0) << 18) |
      ((LOOKUP.get(clean[i + 1] ?? 'A') ?? 0) << 12) |
      ((LOOKUP.get(clean[i + 2] ?? 'A') ?? 0) << 6) |
      (LOOKUP.get(clean[i + 3] ?? 'A') ?? 0);
    if (k < out.length) out[k++] = (n >> 16) & 255;
    if (k < out.length) out[k++] = (n >> 8) & 255;
    if (k < out.length) out[k++] = n & 255;
  }
  return out;
}

type Encoded = { $f64: string } | { $f32: string } | { $u8: string };

function encode(value: unknown): unknown {
  if (value instanceof Float64Array)
    return { $f64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (value instanceof Float32Array)
    return { $f32: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (value instanceof Uint8Array) return { $u8: toBase64(value) };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $num: String(value) };
  if (Array.isArray(value)) return value.map(encode);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = encode(v);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$f64 === 'string') {
      const bytes = fromBase64(o.$f64);
      return new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8).slice();
    }
    if (typeof o.$f32 === 'string') {
      const bytes = fromBase64(o.$f32);
      return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
    }
    if (typeof o.$u8 === 'string') return fromBase64(o.$u8);
    if (typeof o.$num === 'string') return Number(o.$num);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = decode(v);
    return out;
  }
  return value;
}

/** Capture → texte JSON. */
export function serializeSnapshot(snapshot: EngineSnapshot): string {
  return JSON.stringify(encode(snapshot));
}

/** Texte JSON → capture (le format est vérifié à la restauration). */
export function parseSnapshot(text: string): EngineSnapshot {
  const raw = decode(JSON.parse(text)) as Partial<EngineSnapshot> & Encoded;
  if (raw.format !== 'geosim-capture') throw new Error('Ce fichier n’est pas une capture GeoSim');
  return raw as EngineSnapshot;
}
