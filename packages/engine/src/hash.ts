/**
 * Hash de l'état (SPEC §7.2) : empreinte de 64 bits (deux hachages de 32 bits indépendants) de
 * tout ce qui détermine la suite de la simulation — date, graine, coefficients, valeurs, verrous,
 * surcharges, modificateurs, états internes des systèmes et des générateurs aléatoires. Même
 * graine + même journal ⇒ même hash (test automatique de relecture).
 *
 * Le journal et l'historique n'en font pas partie : ils décrivent le passé sans le déterminer.
 * Les NaN sont normalisés (leur représentation binaire peut varier).
 */
import type { Model } from './model.ts';
import type { State } from './state.ts';

const scratch = new Float64Array(1);
const words = new Uint32Array(scratch.buffer);

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export class Hasher {
  private a = 0x811c9dc5;
  private b = 0x9747b28c;

  word(x: number): void {
    const w = x >>> 0;
    // FNV-1a sur des mots de 32 bits.
    this.a = Math.imul(this.a ^ w, 0x01000193) >>> 0;
    // Mélange de MurmurHash3.
    let k = Math.imul(w, 0xcc9e2d51);
    k = rotl(k >>> 0, 15);
    k = Math.imul(k, 0x1b873593);
    this.b = (this.b ^ k) >>> 0;
    this.b = rotl(this.b, 13);
    this.b = (Math.imul(this.b, 5) + 0xe6546b64) >>> 0;
  }

  number(x: number): void {
    if (Number.isNaN(x)) {
      this.word(0x7ff80000);
      this.word(0);
      return;
    }
    scratch[0] = x === 0 ? 0 : x; // −0 et +0 confondus
    this.word(words[0] as number);
    this.word(words[1] as number);
  }

  numbers(a: ArrayLike<number>): void {
    this.word(a.length);
    for (let k = 0; k < a.length; k++) this.number(a[k] as number);
  }

  bytes(a: Uint8Array): void {
    this.word(a.length);
    for (let k = 0; k < a.length; k++) this.word(a[k] as number);
  }

  string(s: string): void {
    this.word(s.length);
    for (let k = 0; k < s.length; k++) this.word(s.charCodeAt(k));
  }

  /** Valeur JSON sous forme canonique (clés triées). */
  value(v: unknown): void {
    this.string(canonicalJson(v));
  }

  hex(): string {
    return (
      (this.a >>> 0).toString(16).padStart(8, '0') + (this.b >>> 0).toString(16).padStart(8, '0')
    );
  }
}

/** JSON à clés triées (objets imbriqués compris) ; NaN et infinis notés comme des chaînes. */
export function canonicalJson(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : `"${String(v)}"`;
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(',')}}`;
}

function sortedKeys<T>(m: Map<string, T>): string[] {
  return [...m.keys()].sort();
}

export function hashState(state: State, model: Model): string {
  const h = new Hasher();
  h.number(state.tick);
  h.number(state.seed);
  for (const path of model.paths()) {
    h.string(path);
    h.number(model.get(path));
  }
  h.numbers(state.values);
  h.bytes(state.locked);
  for (const column of state.generic) h.value(column);
  for (const id of sortedKeys(state.pairNum)) {
    h.string(id);
    h.numbers(state.pairNum.get(id) as Float64Array);
  }
  for (const id of sortedKeys(state.pairGen)) {
    h.string(id);
    const table = state.pairGen.get(id) as Map<number, unknown>;
    for (const k of [...table.keys()].sort((x, y) => x - y)) {
      h.number(k);
      h.value(table.get(k));
    }
  }
  for (const id of sortedKeys(state.world)) {
    h.string(id);
    h.value(state.world.get(id));
  }
  for (const id of sortedKeys(state.zone)) {
    h.string(id);
    const table = state.zone.get(id) as Map<string, unknown>;
    for (const k of sortedKeys(table)) {
      h.string(k);
      h.value(table.get(k));
    }
  }
  for (const id of sortedKeys(state.sim)) {
    h.string(id);
    h.value(state.sim.get(id));
  }
  for (const key of [...state.slotLocks].sort()) h.string(key);
  for (const key of sortedKeys(state.overrides)) h.string(key);
  h.value(state.modifiers);
  h.number(state.nextModifierId);
  for (const name of sortedKeys(state.internal)) {
    h.string(name);
    h.numbers(state.internal.get(name) as Float64Array);
  }
  for (const name of sortedKeys(state.worldInternal)) {
    h.string(name);
    h.number(state.worldInternal.get(name) as number);
  }
  const rng = state.rngStates();
  for (const name of Object.keys(rng)) {
    h.string(name);
    for (const w of rng[name] ?? []) h.word(w);
  }
  return h.hex();
}
