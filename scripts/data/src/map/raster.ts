/**
 * Rasterisation sans anticrénelage (SPEC §4.3).
 *
 * - Polygones : remplissage par lignes de balayage, règle pair-impair, échantillonné au centre
 *   des pixels. Trous et multipolygones sont gérés par la règle pair-impair elle-même.
 * - Polylignes : parcours « supercover » (Amanatides et Woo) : tous les pixels traversés, en
 *   4-connexité, pour qu'un fleuve ou une porte de détroit forme une barrière continue.
 */
import type { Position, ShapeGeometry } from '../io/shapefile.ts';
import { project, type Grid } from './grid.ts';

/** Anneau projeté : coordonnées x, y alternées, en pixels. */
export type ProjectedRing = Float64Array;

/**
 * Projette les anneaux d'un polygone. Les pays Natural Earth sont déjà découpés à
 * l'antiméridien ; les autres anneaux qui le franchissent (océans, mers) sont découpés par
 * `splitAntimeridian` pour ne pas tracer de bande sur toute la largeur de la carte.
 */
export function projectRings(grid: Grid, rings: readonly Position[][]): ProjectedRing[] {
  const out: ProjectedRing[] = [];
  for (const source of rings) {
    for (const ring of splitAntimeridian(source)) {
      if (ring.length < 3) continue;
      const projected = new Float64Array(ring.length * 2);
      for (let k = 0; k < ring.length; k++) {
        const [lon, lat] = ring[k] as Position;
        const [x, y] = project(grid, lon, lat);
        projected[2 * k] = x;
        projected[2 * k + 1] = y;
      }
      out.push(projected);
    }
  }
  return out;
}

/**
 * Découpe un anneau [lon, lat] qui franchit l'antiméridien en morceaux contenus dans
 * [-180, 180]. Les longitudes sont d'abord déroulées (sans saut de plus de 180°) ; un anneau
 * qui fait le tour d'un pôle est refermé le long de ce pôle ; chaque fenêtre de 360° est
 * ensuite découpée (Sutherland-Hodgman) et ramenée dans [-180, 180].
 */
export function splitAntimeridian(ring: readonly Position[]): Position[][] {
  let crosses = false;
  for (let k = 1; k < ring.length; k++) {
    if (Math.abs((ring[k] as Position)[0] - (ring[k - 1] as Position)[0]) > 180) {
      crosses = true;
      break;
    }
  }
  if (!crosses) return [ring as Position[]];

  const unwrapped: Position[] = [];
  let offset = 0;
  for (let k = 0; k < ring.length; k++) {
    const [lon, lat] = ring[k] as Position;
    if (k > 0) {
      const prev = (ring[k - 1] as Position)[0];
      if (lon - prev > 180) offset -= 360;
      else if (prev - lon > 180) offset += 360;
    }
    unwrapped.push([lon + offset, lat]);
  }
  const first = unwrapped[0] as Position;
  const last = unwrapped[unwrapped.length - 1] as Position;
  const turn = last[0] - first[0];
  if (Math.abs(turn) > 180) {
    // L'anneau entoure un pôle : on le referme le long de ce pôle.
    const meanLat = unwrapped.reduce((s, p) => s + p[1], 0) / unwrapped.length;
    const pole = meanLat >= 0 ? 90 : -90;
    unwrapped.push([last[0], pole], [first[0], pole]);
  }

  let min = Infinity;
  let max = -Infinity;
  for (const [lon] of unwrapped) {
    min = Math.min(min, lon);
    max = Math.max(max, lon);
  }
  const pieces: Position[][] = [];
  for (let shift = -720; shift <= 720; shift += 360) {
    const lo = -180 - shift;
    const hi = 180 - shift;
    if (max <= lo || min >= hi) continue;
    const clipped = clipLon(clipLon(unwrapped, lo, true), hi, false);
    if (clipped.length >= 3) pieces.push(clipped.map(([lon, lat]) => [lon + shift, lat]));
  }
  return pieces;
}

/** Sutherland-Hodgman sur un demi-plan en longitude (lon ≥ bound, ou lon ≤ bound). */
function clipLon(ring: readonly Position[], bound: number, keepAbove: boolean): Position[] {
  const inside = (p: Position): boolean => (keepAbove ? p[0] >= bound : p[0] <= bound);
  const out: Position[] = [];
  for (let k = 0; k < ring.length; k++) {
    const cur = ring[k] as Position;
    const prev = ring[(k + ring.length - 1) % ring.length] as Position;
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn !== prevIn) {
      const t = (bound - prev[0]) / (cur[0] - prev[0]);
      out.push([bound, prev[1] + t * (cur[1] - prev[1])]);
    }
    if (curIn) out.push(cur);
  }
  return out;
}

/**
 * Parcourt les segments horizontaux [x0, x1) de pixels dont le centre est dans le polygone.
 * `scale` sur-échantillonne la grille (ex. 4 : sous-pixels de 1/4 de pixel), pour estimer
 * une fraction de couverture ; les coordonnées rendues sont alors en sous-pixels.
 */
export function scanPolygon(
  rings: readonly ProjectedRing[],
  width: number,
  height: number,
  visit: (row: number, x0: number, x1: number) => void,
  scale = 1,
): void {
  // Intersections de chaque ligne de balayage avec les arêtes, regroupées par ligne.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const ring of rings) {
    for (let k = 1; k < ring.length; k += 2) {
      const y = (ring[k] as number) * scale;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  const rowStart = Math.max(0, Math.ceil(yMin - 0.5));
  const rowEnd = Math.min(height * scale - 1, Math.floor(yMax - 0.5));
  if (rowEnd < rowStart) return;
  const buckets: number[][] = Array.from({ length: rowEnd - rowStart + 1 }, () => []);

  for (const ring of rings) {
    const n = ring.length / 2;
    for (let k = 0; k < n; k++) {
      const next = (k + 1) % n;
      const xa = (ring[2 * k] as number) * scale;
      const ya = (ring[2 * k + 1] as number) * scale;
      const xb = (ring[2 * next] as number) * scale;
      const yb = (ring[2 * next + 1] as number) * scale;
      if (ya === yb) continue;
      const [x0, y0, x1, y1] = ya < yb ? [xa, ya, xb, yb] : [xb, yb, xa, ya];
      // Ligne j échantillonnée en y = j + 0,5 ; intervalle semi-ouvert [y0, y1) pour ne compter
      // qu'une fois un sommet partagé par deux arêtes.
      const jFrom = Math.max(rowStart, Math.ceil(y0 - 0.5));
      const jTo = Math.min(rowEnd, Math.ceil(y1 - 0.5) - 1);
      const slope = (x1 - x0) / (y1 - y0);
      for (let j = jFrom; j <= jTo; j++) {
        (buckets[j - rowStart] as number[]).push(x0 + (j + 0.5 - y0) * slope);
      }
    }
  }

  const maxX = width * scale;
  for (let r = 0; r < buckets.length; r++) {
    const xs = buckets[r] as number[];
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // Pixels i tels que i + 0,5 ∈ [xa, xb).
      const x0 = Math.max(0, Math.ceil((xs[k] as number) - 0.5));
      const x1 = Math.min(maxX, Math.ceil((xs[k + 1] as number) - 0.5));
      if (x1 > x0) visit(rowStart + r, x0, x1);
    }
  }
}

/** Remplit `target` avec `value` sur les pixels couverts par le polygone ; renvoie leur nombre. */
export function fillPolygon(
  grid: Grid,
  rings: readonly ProjectedRing[],
  target: { [index: number]: number },
  value: number,
): number {
  let count = 0;
  scanPolygon(rings, grid.width, grid.height, (row, x0, x1) => {
    const base = row * grid.width;
    for (let i = x0; i < x1; i++) target[base + i] = value;
    count += x1 - x0;
  });
  return count;
}

/**
 * Parcours supercover d'un segment : appelle `visit` pour chaque pixel traversé, dans l'ordre,
 * chaque pixel étant voisin (4-connexité) du précédent.
 */
export function traceSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
  visit: (index: number) => void,
): void {
  let i = Math.floor(x0);
  let j = Math.floor(y0);
  const iEnd = Math.floor(x1);
  const jEnd = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepI = dx > 0 ? 1 : -1;
  const stepJ = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? i + 1 - x0 : x0 - i) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? j + 1 - y0 : y0 - j) * tDeltaY : Infinity;
  const emit = (): void => {
    if (i >= 0 && i < width && j >= 0 && j < height) visit(j * width + i);
  };
  emit();
  let guard = Math.abs(iEnd - i) + Math.abs(jEnd - j) + 2;
  while ((i !== iEnd || j !== jEnd) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      i += stepI;
    } else {
      tMaxY += tDeltaY;
      j += stepJ;
    }
    emit();
  }
}

/** Trace une polyligne [lon, lat] projetée. Les segments franchissant l'antiméridien sont ignorés. */
export function tracePolyline(
  grid: Grid,
  line: readonly Position[],
  visit: (index: number) => void,
): void {
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k] as Position;
    const b = line[k + 1] as Position;
    if (Math.abs(a[0] - b[0]) > 180) continue;
    const [x0, y0] = project(grid, a[0], a[1]);
    const [x1, y1] = project(grid, b[0], b[1]);
    traceSegment(x0, y0, x1, y1, grid.width, grid.height, visit);
  }
}

/** Polygones d'une géométrie (liste d'anneaux) ; vide pour les autres types. */
export function polygonRings(geometry: ShapeGeometry | null): Position[][] {
  return geometry?.type === 'Polygon' ? geometry.coordinates : [];
}

/** Lignes d'une géométrie linéaire. */
export function lineParts(geometry: ShapeGeometry | null): Position[][] {
  return geometry?.type === 'LineString' ? geometry.coordinates : [];
}
