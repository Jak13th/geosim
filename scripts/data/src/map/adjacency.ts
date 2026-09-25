/**
 * Voisinages entre entités (SPEC §4.4).
 *
 * - Frontières terrestres : arêtes de pixels (4-connexité) entre propriétaires différents.
 * - Façades maritimes : arêtes entre un pixel terrestre et un pixel de mer.
 * - Voisinages maritimes : partage de la mer par équidistance (chaque pixel de mer va à la côte
 *   la plus proche, dans la limite de 200 milles marins, comme une ZEE) ; deux entités sont
 *   voisines si leurs espaces se touchent.
 *
 * Longueurs : une limite droite d'angle θ produit un escalier de |cos θ| + |sin θ| arêtes de
 * pixel par unité de longueur. On estime l'orientation locale de la limite par le gradient
 * (filtre de Sobel 3 × 3) de l'indicatrice d'une des deux régions, et chaque arête compte pour
 * |n| / (|nx| + |ny|) côté de pixel : 1 pour une limite alignée sur la grille, 1/√2 en
 * diagonale. Les limites sinueuses restent sous-estimées à l'échelle du pixel (8 km à 4096 px).
 */
import { Terrain, isLand } from '@geosim/shared';
import type { Grid } from './grid.ts';
import { CHAMFER_ORTHO, chamferDistance, neighbors4, type Topology } from './gridops.ts';

/**
 * Longueur (en côtés de pixel) de l'arête entre les pixels voisins p et q, d'après l'orientation
 * locale de la limite de la région `inside` (vrai pour p, faux pour q).
 */
export function edgeLength(
  width: number,
  height: number,
  inside: (r: number) => boolean,
  p: number,
  q: number,
): number {
  let nx = 0;
  let ny = 0;
  for (const c of [p, q]) {
    const j = (c / width) | 0;
    const i = c - j * width;
    // Bords de la grille : on répète le pixel du bord (pas de gradient fictif).
    const v = (di: number, dj: number): number => {
      const ii = Math.min(width - 1, Math.max(0, i + di));
      const jj = Math.min(height - 1, Math.max(0, j + dj));
      return inside(jj * width + ii) ? 1 : 0;
    };
    nx += v(1, -1) + 2 * v(1, 0) + v(1, 1) - v(-1, -1) - 2 * v(-1, 0) - v(-1, 1);
    ny += v(-1, 1) + 2 * v(0, 1) + v(1, 1) - v(-1, -1) - 2 * v(0, -1) - v(1, -1);
  }
  const l1 = Math.abs(nx) + Math.abs(ny);
  return l1 === 0 ? 1 : Math.hypot(nx, ny) / l1;
}

export interface PairLength {
  /** Index des deux entités, a < b. */
  a: number;
  b: number;
  km: number;
}

export interface Adjacency {
  land: PairLength[];
  maritime: PairLength[];
  /** Façade maritime par entité (km), index d'entité. */
  coastlineKm: Float64Array;
  /** Propriétaire « maritime » de chaque pixel de mer (équidistance, 0 au-delà de la portée). */
  seaOwner: Int32Array;
}

function addPair(
  map: Map<number, number>,
  a: number,
  b: number,
  entityCount: number,
  length: number,
): void {
  const key = a < b ? a * (entityCount + 1) + b : b * (entityCount + 1) + a;
  map.set(key, (map.get(key) ?? 0) + length);
}

function toPairs(map: Map<number, number>, entityCount: number, edgeKm: number): PairLength[] {
  return [...map.entries()]
    .map(([key, edges]) => ({
      a: Math.floor(key / (entityCount + 1)),
      b: key % (entityCount + 1),
      km: Math.round(edges * edgeKm),
    }))
    .sort((x, y) => x.a - y.a || x.b - y.b);
}

export function buildAdjacency(
  grid: Grid,
  t: Topology,
  globe: Uint8Array,
  terrain: Uint8Array,
  owner: Uint16Array,
  entityCount: number,
  maritimeRangeKm: number,
): Adjacency {
  const n = grid.width * grid.height;
  const w = grid.width;
  const h = grid.height;
  const edgeKm = grid.pixelSideKm;
  const nb = new Int32Array(4);
  const isLandAt = (r: number): boolean => isLand(terrain[r] as number);
  const landEdges = new Map<number, number>();
  const coastEdges = new Float64Array(entityCount + 1);

  for (let p = 0; p < n; p++) {
    if (!isLand(terrain[p] as number)) continue;
    const a = owner[p] as number;
    const k = neighbors4(t, p, nb);
    for (let m = 0; m < k; m++) {
      const q = nb[m] as number;
      const tq = terrain[q] as number;
      if (tq === Terrain.Sea && globe[q]) {
        coastEdges[a] = (coastEdges[a] as number) + edgeLength(w, h, isLandAt, p, q);
      } else if (isLand(tq) && q > p) {
        const b = owner[q] as number;
        if (a !== b && a !== 0 && b !== 0) {
          const length = edgeLength(w, h, (r) => owner[r] === a && isLandAt(r), p, q);
          addPair(landEdges, a, b, entityCount, length);
        }
      }
    }
  }

  // Partage de la mer par équidistance depuis les côtes.
  const mask = new Uint8Array(n);
  const labels = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    const tp = terrain[p] as number;
    if (!globe[p]) continue;
    if (tp === Terrain.Sea) mask[p] = 1;
    else if (isLand(tp) && owner[p] !== 0) {
      const k = neighbors4(t, p, nb);
      for (let m = 0; m < k; m++) {
        if (terrain[nb[m] as number] === Terrain.Sea) {
          mask[p] = 1;
          labels[p] = owner[p] as number;
          break;
        }
      }
    }
  }
  const maxCost = (maritimeRangeKm / grid.pixelSideKm) * CHAMFER_ORTHO;
  chamferDistance(t, mask, labels, maxCost);
  const seaOwner = new Int32Array(n);
  const seaEdges = new Map<number, number>();
  for (let p = 0; p < n; p++) {
    if (!globe[p] || terrain[p] !== Terrain.Sea) continue;
    const a = labels[p] as number;
    seaOwner[p] = a;
    if (a === 0) continue;
    const k = neighbors4(t, p, nb);
    for (let m = 0; m < k; m++) {
      const q = nb[m] as number;
      if (q < p || !globe[q] || terrain[q] !== Terrain.Sea) continue;
      const b = labels[q] as number;
      if (b !== 0 && b !== a) {
        const length = edgeLength(w, h, (r) => labels[r] === a && terrain[r] === Terrain.Sea, p, q);
        addPair(seaEdges, a, b, entityCount, length);
      }
    }
  }

  const coastlineKm = new Float64Array(entityCount + 1);
  for (let e = 0; e <= entityCount; e++)
    coastlineKm[e] = Math.round((coastEdges[e] as number) * edgeKm);
  return {
    land: toPairs(landEdges, entityCount, edgeKm),
    maritime: toPairs(seaEdges, entityCount, edgeKm),
    coastlineKm,
    seaOwner,
  };
}
