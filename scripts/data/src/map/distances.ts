/**
 * Distances entre entités (SPEC §4.4) : capitale ↔ capitale à vol d'oiseau (orthodromie) et par
 * voie de terre (plus court chemin sur les terres émergées, tous territoires confondus).
 * La distance par mer est celle des routes maritimes (routing.ts).
 */
import { isLand } from '@geosim/shared';
import { greatCircleKm, type Grid } from './grid.ts';
import type { Topology } from './gridops.ts';
import { buildCoarseGraph, dijkstra } from './graph.ts';
import type { Capital } from './features.ts';

export interface DistanceMatrices {
  /** Codes des entités, dans l'ordre des lignes et colonnes. */
  ids: string[];
  greatCircleKm: (number | null)[][];
  /** Null si les deux capitales ne sont pas reliées par la terre. */
  landKm: (number | null)[][];
}

export function buildDistances(
  grid: Grid,
  t: Topology,
  terrain: Uint8Array,
  capitals: readonly Capital[],
  ids: readonly string[],
  cellKm: number,
): DistanceMatrices {
  const count = ids.length;
  const capitalOf = new Map(capitals.map((c) => [c.entity, c.city]));
  const cls = new Int32Array(grid.width * grid.height);
  for (let p = 0; p < cls.length; p++) if (isLand(terrain[p] as number)) cls[p] = 1;
  const block = Math.max(2, Math.round(cellKm / grid.pixelSideKm));
  const land = buildCoarseGraph(grid, t, cls, block);

  const great: (number | null)[][] = [];
  const landKm: (number | null)[][] = [];
  for (let a = 1; a <= count; a++) {
    const ca = capitalOf.get(a);
    const rowGreat: (number | null)[] = [];
    const rowLand: (number | null)[] = [];
    const paths = ca ? dijkstra(land, [{ node: land.nodeOf[ca.pixel] as number, dist: 0 }]) : null;
    for (let b = 1; b <= count; b++) {
      const cb = capitalOf.get(b);
      if (!ca || !cb) {
        rowGreat.push(null);
        rowLand.push(null);
        continue;
      }
      const direct = Math.round(greatCircleKm(ca.lon, ca.lat, cb.lon, cb.lat));
      rowGreat.push(direct);
      // Le graphe grossier sous-estime les courtes distances (même nœud) : la distance à vol
      // d'oiseau sert de borne inférieure.
      const d = paths?.dist[land.nodeOf[cb.pixel] as number];
      rowLand.push(d !== undefined && Number.isFinite(d) ? Math.max(direct, Math.round(d)) : null);
    }
    great.push(rowGreat);
    landKm.push(rowLand);
  }
  return { ids: [...ids], greatCircleKm: great, landKm };
}
