/**
 * Accès aux paramètres bilatéraux pour les systèmes : valeurs de départ (données construites),
 * sanctions par volet et états de la relation (paix, guerre…) en tableaux denses N × N.
 */
import { SANCTION_TRACKS, type ParamValue } from '@geosim/shared';
import type { State } from '../state.ts';

export type Track = (typeof SANCTION_TRACKS)[number];
export const TRACKS: readonly Track[] = SANCTION_TRACKS;
export const TRACK_INDEX: Readonly<Record<Track, number>> = Object.fromEntries(
  SANCTION_TRACKS.map((t, k) => [t, k]),
) as Record<Track, number>;

/** États de la relation bilatérale (`pair.war_state`), codés du plus calme au plus grave. */
export const WAR_STATES = ['peace', 'tension', 'ceasefire', 'crisis', 'blockade', 'war'] as const;
export type WarState = (typeof WAR_STATES)[number];
const WAR_CODE = new Map<string, number>(WAR_STATES.map((s, k) => [s, k]));
export const WAR = { peace: 0, tension: 1, ceasefire: 2, crisis: 3, blockade: 4, war: 5 } as const;

export function warCode(v: ParamValue): number {
  return typeof v === 'string' ? (WAR_CODE.get(v) ?? 0) : 0;
}

const baseCache = new WeakMap<object, Map<string, Map<number, ParamValue>>>();

/**
 * Valeurs de départ (données) d'un paramètre bilatéral : i × N + j → valeur, hors valeur par
 * défaut. Calculées une fois par jeu de données.
 */
export function pairBase(state: State, id: string): Map<number, ParamValue> {
  let byParam = baseCache.get(state.data);
  if (byParam === undefined) {
    byParam = new Map();
    baseCache.set(state.data, byParam);
  }
  let table = byParam.get(id);
  if (table === undefined) {
    table = new Map();
    for (const [a, b, v] of state.data.pairs.params[id]?.entries ?? []) {
      const i = state.byId.get(a);
      const j = state.byId.get(b);
      if (i !== undefined && j !== undefined) table.set(i * state.n + j, v);
    }
    byParam.set(id, table);
  }
  return table;
}

/** Valeur de départ d'un paramètre bilatéral numérique (défaut des données si absente). */
export function pairBaseNumber(state: State, id: string, i: number, j: number): number {
  const v = pairBase(state, id).get(i * state.n + j);
  if (typeof v === 'number') return v;
  const d = state.data.pairs.params[id]?.default;
  return typeof d === 'number' ? d : Number.NaN;
}

function vectorOf(v: ParamValue | undefined): Record<string, number> | null {
  return v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * Sanctions de i contre j, par volet (0–1) : tableau de 6 × N × N valeurs, volet k de la paire
 * (i, j) à l'indice k × N² + i × N + j.
 */
export function sanctionGrid(state: State, table: ReadonlyMap<number, ParamValue>): Float32Array {
  const n2 = state.n * state.n;
  const grid = new Float32Array(TRACKS.length * n2);
  for (const [k, v] of table) {
    const vec = vectorOf(v);
    if (vec === null) continue;
    TRACKS.forEach((t, ti) => {
      const x = vec[t];
      if (typeof x === 'number' && x > 0) grid[ti * n2 + k] = Math.min(1, x);
    });
  }
  return grid;
}

const sanctionBaseCache = new WeakMap<object, Float32Array>();

/** Sanctions de départ (données), par volet. */
export function baseSanctionGrid(state: State): Float32Array {
  let grid = sanctionBaseCache.get(state.data);
  if (grid === undefined) {
    grid = sanctionGrid(state, pairBase(state, 'pair.sanctions'));
    sanctionBaseCache.set(state.data, grid);
  }
  return grid;
}

/** Sanctions courantes, par volet. */
export function currentSanctionGrid(state: State): Float32Array {
  return sanctionGrid(state, state.pairGen.get('pair.sanctions') ?? new Map());
}

/** Code de l'état de la relation de chaque paire (le plus grave des deux sens). */
export function warGrid(state: State, table: ReadonlyMap<number, ParamValue>): Uint8Array {
  const n = state.n;
  const grid = new Uint8Array(n * n);
  const fallback = warCode(state.pairDefault.get('pair.war_state') ?? 'peace');
  if (fallback > 0) grid.fill(fallback);
  for (const [k, v] of table) {
    const c = warCode(v);
    const i = Math.floor(k / n);
    const j = k % n;
    const kr = j * n + i;
    grid[k] = Math.max(grid[k] as number, c);
    grid[kr] = Math.max(grid[kr] as number, c);
  }
  return grid;
}

const warBaseCache = new WeakMap<object, Uint8Array>();

export function baseWarGrid(state: State): Uint8Array {
  let grid = warBaseCache.get(state.data);
  if (grid === undefined) {
    grid = warGrid(state, pairBase(state, 'pair.war_state'));
    warBaseCache.set(state.data, grid);
  }
  return grid;
}

export function currentWarGrid(state: State): Uint8Array {
  return warGrid(state, state.pairGen.get('pair.war_state') ?? new Map());
}

/** Paires verrouillées d'un paramètre bilatéral (indices i × N + j). */
export function lockedPairs(state: State, param: string): Set<number> {
  const out = new Set<number>();
  const prefix = `p|${param}|`;
  for (const key of state.slotLocks) {
    if (!key.startsWith(prefix)) continue;
    const [a, b] = key.slice(prefix.length).split('|');
    const i = state.byId.get(a ?? '');
    const j = state.byId.get(b ?? '');
    if (i !== undefined && j !== undefined) out.add(i * state.n + j);
  }
  return out;
}

/** Liste de codes (blocs, pays) d'un paramètre pays de type liste. */
export function listOf(v: ParamValue): string[] {
  return Array.isArray(v) ? v : [];
}

/** Composantes d'un paramètre vectoriel (objet vide à défaut). */
export function vectorValue(v: ParamValue): Record<string, number> {
  return vectorOf(v) ?? {};
}
