/**
 * Couches politiques : unité Natural Earth, contrôle de facto (owner) et souveraineté (sovereign).
 *
 * - Chaque unité est rasterisée par balayage pair-impair au centre des pixels.
 * - Micro-États et petits territoires (SPEC §4.3) : une unité rattachée à une entité qui
 *   n'obtient aucun pixel reçoit celui de son point d'étiquette Natural Earth, pris au voisin
 *   si nécessaire (Vatican, Monaco…).
 * - Unités partagées (`split`) : chaque pixel va à l'entité revendicatrice la plus proche.
 */
import type { ShapeFeature } from '../io/shapefile.ts';
import { pixelOf, type Grid } from './grid.ts';
import { bfsFill, type Topology } from './gridops.ts';
import { polygonRings, projectRings, scanPolygon, type ProjectedRing } from './raster.ts';
import type { EntityTable } from './entities.ts';

export interface ForcedPixel {
  unit: number;
  pixel: number;
  /** Unité qui occupait le pixel (0 si c'était de l'eau). */
  takenFrom: number;
}

export interface PoliticalLayers {
  unit: Uint16Array;
  owner: Uint16Array;
  sovereign: Uint16Array;
  /** Nombre de pixels par unité (index d'unité). */
  unitPixels: Int32Array;
  /** Surface exacte de chaque unité en pixels (aire projetée des polygones, à surface égale). */
  unitExactPixels: Float64Array;
  forced: ForcedPixel[];
  /** Pixels où deux unités se chevauchaient (la dernière dessinée l'emporte). */
  overlaps: number;
}

/** Aire projetée (pixels²) d'un ensemble d'anneaux, trous déduits par l'orientation. */
export function ringsArea(rings: readonly ProjectedRing[]): number {
  let total = 0;
  for (const ring of rings) {
    const n = ring.length / 2;
    let s = 0;
    for (let k = 0; k < n; k++) {
      const next = (k + 1) % n;
      s +=
        (ring[2 * k] as number) * (ring[2 * next + 1] as number) -
        (ring[2 * next] as number) * (ring[2 * k + 1] as number);
    }
    total += s / 2;
  }
  return Math.abs(total);
}

export function rasterizePolitical(
  grid: Grid,
  topology: Topology,
  features: readonly ShapeFeature[],
  table: EntityTable,
): PoliticalLayers {
  const n = grid.width * grid.height;
  const unit = new Uint16Array(n);
  const unitCount = table.units.length;
  const unitPixels = new Int32Array(unitCount + 1);
  const unitExactPixels = new Float64Array(unitCount + 1);
  const centroids: ([number, number] | null)[] = new Array(unitCount + 1).fill(null);
  let overlaps = 0;

  features.forEach((feature, f) => {
    const u = table.unitOfFeature[f] as number;
    const rings = projectRings(grid, polygonRings(feature.geometry));
    unitExactPixels[u] = ringsArea(rings);
    centroids[u] = largestRingCentroid(rings);
    scanPolygon(rings, grid.width, grid.height, (row, x0, x1) => {
      const base = row * grid.width;
      for (let i = x0; i < x1; i++) {
        if (unit[base + i] !== 0) overlaps++;
        unit[base + i] = u;
      }
    });
  });
  for (let p = 0; p < n; p++) {
    const u = unit[p] as number;
    unitPixels[u] = (unitPixels[u] as number) + 1;
  }

  // Au moins un pixel pour chaque unité rattachée à une entité.
  const forced: ForcedPixel[] = [];
  const forcedSet = new Set<number>();
  for (const def of table.units) {
    if ((unitPixels[def.index] as number) > 0) continue;
    if (def.owner === 0 && def.split.length === 0) continue;
    const anchor = def.labelLonLat ?? centroidLonLat(grid, centroids[def.index] ?? null);
    if (anchor === null) continue;
    let pixel = pixelOf(grid, anchor[0], anchor[1]);
    // On ne prend jamais le dernier pixel d'une autre unité.
    pixel = nearestFree(
      grid,
      pixel,
      (p) =>
        !forcedSet.has(p) &&
        isOnGlobe(topology, p) &&
        (unit[p] === 0 || (unitPixels[unit[p] as number] as number) > 1),
    );
    const takenFrom = unit[pixel] as number;
    if (takenFrom !== 0) unitPixels[takenFrom] = (unitPixels[takenFrom] as number) - 1;
    unit[pixel] = def.index;
    unitPixels[def.index] = (unitPixels[def.index] as number) + 1;
    forcedSet.add(pixel);
    forced.push({ unit: def.index, pixel, takenFrom });
  }

  const owner = new Uint16Array(n);
  const sovereign = new Uint16Array(n);
  const ownerOfUnit = new Uint16Array(unitCount + 1);
  const sovereignOfUnit = new Uint16Array(unitCount + 1);
  for (const def of table.units) {
    ownerOfUnit[def.index] = def.owner;
    sovereignOfUnit[def.index] = def.sovereign;
  }
  for (let p = 0; p < n; p++) {
    const u = unit[p] as number;
    if (u === 0) continue;
    owner[p] = ownerOfUnit[u] as number;
    sovereign[p] = sovereignOfUnit[u] as number;
  }

  // Unités partagées : propagation depuis les pixels des entités revendicatrices.
  for (const def of table.units) {
    if (def.split.length === 0) continue;
    const mask = new Uint8Array(n);
    const labels = new Int32Array(n);
    const claimants = new Set(def.split);
    for (let p = 0; p < n; p++) {
      if (unit[p] === def.index) mask[p] = 1;
      else if (claimants.has(owner[p] as number)) {
        mask[p] = 1;
        labels[p] = owner[p] as number;
      }
    }
    bfsFill(topology, mask, labels);
    for (let p = 0; p < n; p++) {
      if (unit[p] === def.index) owner[p] = sovereign[p] = labels[p] as number;
    }
  }

  return { unit, owner, sovereign, unitPixels, unitExactPixels, forced, overlaps };
}

function largestRingCentroid(rings: readonly ProjectedRing[]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestArea = 0;
  for (const ring of rings) {
    const area = ringsArea([ring]);
    if (area <= bestArea) continue;
    let sx = 0;
    let sy = 0;
    const n = ring.length / 2;
    for (let k = 0; k < n; k++) {
      sx += ring[2 * k] as number;
      sy += ring[2 * k + 1] as number;
    }
    best = [sx / n, sy / n];
    bestArea = area;
  }
  return best;
}

function centroidLonLat(grid: Grid, xy: [number, number] | null): [number, number] | null {
  if (xy === null) return null;
  const ll = grid.projection.invert?.(xy);
  return ll ? [ll[0], ll[1]] : null;
}

function isOnGlobe(t: Topology, p: number): boolean {
  const j = (p / t.width) | 0;
  const i = p - j * t.width;
  return (t.left[j] as number) >= 0 && i >= (t.left[j] as number) && i <= (t.right[j] as number);
}

/** Pixel le plus proche (spirale carrée) satisfaisant `ok`. */
function nearestFree(grid: Grid, start: number, ok: (p: number) => boolean): number {
  if (ok(start)) return start;
  const j0 = (start / grid.width) | 0;
  const i0 = start - j0 * grid.width;
  for (let r = 1; r < 50; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) continue;
        const p = j * grid.width + i;
        if (ok(p)) return p;
      }
    }
  }
  throw new Error(`Aucun pixel libre près de ${i0}, ${j0}`);
}
