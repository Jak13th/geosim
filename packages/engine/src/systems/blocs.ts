/**
 * Blocs et organisations (blocs.yaml) vus par les systèmes : règles de chaque bloc (données) et
 * appartenances courantes des pays (`dip.memberships`, modifiables : adhésion, retrait).
 */
import type { BlocRecord, ParamValue } from '@geosim/shared';
import type { State } from '../state.ts';
import { listOf } from './pairs.ts';

/** Bloc commercial : accord de libre-échange ou politique commerciale commune. */
export function isTradeBloc(b: BlocRecord): boolean {
  return b.kind === 'trade_agreement' || b.rules.common_trade_policy === true;
}

export function blocById(state: State, id: string): BlocRecord | undefined {
  return state.data.world.blocs.find((b) => b.id === id);
}

/** Appartenances (identifiants de blocs) de chaque entité : courantes ou de départ. */
export function memberships(state: State, base = false): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < state.n; i++) {
    const v: ParamValue = base
      ? state.genericBaseValue('dip.memberships', i)
      : state.genericValue('dip.memberships', i);
    out.push(listOf(v));
  }
  return out;
}

/** Membres (indices) de chaque bloc connu, selon des appartenances. */
export function membersByBloc(state: State, lists: readonly string[][]): Map<string, number[]> {
  const known = new Set(state.data.world.blocs.map((b) => b.id));
  const out = new Map<string, number[]>();
  lists.forEach((list, i) => {
    for (const id of list) {
      if (!known.has(id)) continue;
      const members = out.get(id);
      if (members) members.push(i);
      else out.set(id, [i]);
    }
  });
  return out;
}

/** Paires qui partagent au moins un bloc satisfaisant `keep` (tableau N × N de 0 et 1). */
export function sharedBlocGrid(
  state: State,
  lists: readonly string[][],
  keep: (b: BlocRecord) => boolean,
): Uint8Array {
  const n = state.n;
  const grid = new Uint8Array(n * n);
  const byBloc = membersByBloc(state, lists);
  for (const b of state.data.world.blocs) {
    if (!keep(b)) continue;
    const members = byBloc.get(b.id) ?? [];
    for (const i of members) for (const j of members) if (i !== j) grid[i * n + j] = 1;
  }
  return grid;
}

const baseTradeCache = new WeakMap<object, Uint8Array>();

/** Paires qui partageaient un bloc commercial au départ. */
export function baseTradeBlocGrid(state: State): Uint8Array {
  let grid = baseTradeCache.get(state.data);
  if (grid === undefined) {
    grid = sharedBlocGrid(state, memberships(state, true), isTradeBloc);
    baseTradeCache.set(state.data, grid);
  }
  return grid;
}
