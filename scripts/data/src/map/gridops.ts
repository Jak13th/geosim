/**
 * Opérations sur la grille : voisinage (avec raccord à l'antiméridien), parcours en largeur,
 * distances de chanfrein et points d'étiquette.
 *
 * En projection Equal Earth, le premier et le dernier pixel d'une ligne sont tous deux sur le
 * méridien ±180° : on les considère voisins, pour que le Pacifique, la mer de Béring ou les
 * Fidji ne soient pas coupés en deux.
 */
import type { Grid } from './grid.ts';

export interface Topology {
  width: number;
  height: number;
  /** Premier et dernier pixel de chaque ligne dont le centre est sur le globe (-1 si aucun). */
  left: Int32Array;
  right: Int32Array;
  /** Raccord est-ouest aux extrémités de ligne (vrai pour le globe). */
  wrap: boolean;
}

export function makeTopology(grid: Grid): Topology {
  const left = new Int32Array(grid.height).fill(-1);
  const right = new Int32Array(grid.height).fill(-1);
  const cx = grid.width / 2;
  for (let j = 0; j < grid.height; j++) {
    const half = grid.rowHalfWidth[j] ?? 0;
    const l = Math.max(0, Math.ceil(cx - half - 0.5));
    const r = Math.min(grid.width - 1, Math.floor(cx + half - 0.5));
    if (r >= l) {
      left[j] = l;
      right[j] = r;
    }
  }
  return { width: grid.width, height: grid.height, left, right, wrap: true };
}

/** Topologie d'une grille rectangulaire sans raccord (tests). */
export function flatTopology(width: number, height: number): Topology {
  return {
    width,
    height,
    left: new Int32Array(height).fill(0),
    right: new Int32Array(height).fill(width - 1),
    wrap: false,
  };
}

/**
 * Voisins en 4-connexité du pixel p (raccord est-ouest aux extrémités de ligne).
 * Écrit jusqu'à 4 indices dans `out` et renvoie leur nombre.
 */
export function neighbors4(t: Topology, p: number, out: Int32Array): number {
  const w = t.width;
  const j = (p / w) | 0;
  const i = p - j * w;
  let n = 0;
  const l = t.left[j] as number;
  const r = t.right[j] as number;
  if (l >= 0) {
    if (i > l) out[n++] = p - 1;
    else if (t.wrap && r > l) out[n++] = j * w + r;
    if (i < r) out[n++] = p + 1;
    else if (t.wrap && r > l) out[n++] = j * w + l;
  }
  // Voisins verticaux, seulement s'ils sont sur le globe.
  if (j > 0 && i >= (t.left[j - 1] as number) && i <= (t.right[j - 1] as number)) out[n++] = p - w;
  if (j < t.height - 1 && i >= (t.left[j + 1] as number) && i <= (t.right[j + 1] as number)) {
    out[n++] = p + w;
  }
  return n;
}

/**
 * Parcours en largeur multi-sources dans `mask` : chaque pixel atteint reçoit le label de la
 * source la plus proche (en nombre de pas, 4-connexité). Les pixels déjà labellisés (≠ 0)
 * servent de sources ; renvoie le nombre de pixels labellisés en plus.
 */
export function bfsFill(t: Topology, mask: Uint8Array, labels: Uint16Array | Int32Array): number {
  const n = t.width * t.height;
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let p = 0; p < n; p++) if (mask[p] && labels[p] !== 0) queue[tail++] = p;
  const nb = new Int32Array(4);
  let filled = 0;
  while (head < tail) {
    const p = queue[head++] as number;
    const k = neighbors4(t, p, nb);
    for (let m = 0; m < k; m++) {
      const q = nb[m] as number;
      if (mask[q] && labels[q] === 0) {
        labels[q] = labels[p] as number;
        queue[tail++] = q;
        filled++;
      }
    }
  }
  return filled;
}

/**
 * Masque de chanfrein 5-7-11 (Borgefors, 1986) : pas orthogonaux, diagonaux et « cavalier »,
 * en cinquièmes de pixel ; distance euclidienne approchée à 2 % près.
 */
export const CHAMFER_ORTHO = 5;
export const CHAMFER_DIAG = 7;
export const CHAMFER_KNIGHT = 11;

const DIAGONALS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const KNIGHTS: readonly [number, number][] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

/**
 * Pas de chanfrein depuis p vers les pixels autorisés : voisins orthogonaux (raccord à
 * l'antiméridien compris), diagonaux et en cavalier. Un pas diagonal ou en cavalier exige que
 * les pixels qu'il enjambe soient autorisés : on ne coupe jamais un coin de terre ou de mer.
 */
export function forEachChamferStep(
  t: Topology,
  p: number,
  allowed: (q: number) => boolean,
  visit: (q: number, cost: number) => void,
  nb: Int32Array = new Int32Array(4),
): void {
  const w = t.width;
  const k = neighbors4(t, p, nb);
  for (let m = 0; m < k; m++) {
    const q = nb[m] as number;
    if (allowed(q)) visit(q, CHAMFER_ORTHO);
  }
  const j = (p / w) | 0;
  const i = p - j * w;
  const ok = (di: number, dj: number): boolean => {
    const ii = i + di;
    const jj = j + dj;
    return ii >= 0 && jj >= 0 && ii < w && jj < t.height && allowed(jj * w + ii);
  };
  for (const [di, dj] of DIAGONALS) {
    if (ok(di, dj) && ok(di, 0) && ok(0, dj)) visit((j + dj) * w + i + di, CHAMFER_DIAG);
  }
  for (const [di, dj] of KNIGHTS) {
    // Pixels enjambés : la case orthogonale et la case diagonale sur le trajet.
    const si = Math.abs(di) === 2 ? Math.sign(di) : 0;
    const sj = Math.abs(dj) === 2 ? Math.sign(dj) : 0;
    if (ok(di, dj) && ok(si, sj) && ok(di - si, dj - sj))
      visit((j + dj) * w + i + di, CHAMFER_KNIGHT);
  }
}

/**
 * Distance de chanfrein multi-sources, restreinte à `mask`, avec propagation du label de la
 * source la plus proche (algorithme de Dial, file à seaux). `maxCost` borne la propagation
 * (en unités de chanfrein ; Infinity pour aucune borne). Les sources sont les pixels dont
 * `labels` est non nul ; en sortie, `dist` vaut -1 pour les pixels non atteints.
 */
export function chamferDistance(
  t: Topology,
  mask: Uint8Array,
  labels: Int32Array,
  maxCost = Infinity,
): Int32Array {
  const n = t.width * t.height;
  const dist = new Int32Array(n).fill(-1);
  const buckets: number[][] = [[]];
  for (let p = 0; p < n; p++) {
    if (mask[p] && labels[p] !== 0) {
      dist[p] = 0;
      (buckets[0] as number[]).push(p);
    }
  }
  const nb = new Int32Array(4);
  const inMask = (q: number): boolean => mask[q] === 1;
  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c];
    if (!bucket) continue;
    for (let b = 0; b < bucket.length; b++) {
      const p = bucket[b] as number;
      if (dist[p] !== c) continue; // entrée périmée
      forEachChamferStep(
        t,
        p,
        inMask,
        (q, step) => {
          const cost = c + step;
          if (cost > maxCost) return;
          const d = dist[q] as number;
          if (d !== -1 && d <= cost) return;
          dist[q] = cost;
          labels[q] = labels[p] as number;
          (buckets[cost] ??= []).push(q);
        },
        nb,
      );
    }
    buckets[c] = [];
  }
  return dist;
}

/**
 * Point d'étiquette de chaque région : pixel le plus éloigné du bord de sa région
 * (approximation du « pôle d'inaccessibilité »). `region[p]` = identifiant (0 = ignoré).
 * Renvoie, pour chaque identifiant, l'index du pixel retenu (-1 si région vide).
 */
export function labelPoints(t: Topology, region: ArrayLike<number>, count: number): Int32Array {
  const n = t.width * t.height;
  const mask = new Uint8Array(n);
  const seeds = new Int32Array(n);
  const nb = new Int32Array(4);
  for (let p = 0; p < n; p++) {
    const r = region[p] as number;
    if (r === 0) continue;
    mask[p] = 1;
    // Pixel de bord : un voisin appartient à une autre région, ou le pixel touche le bord.
    const k = neighbors4(t, p, nb);
    let edge = k < 4;
    for (let m = 0; m < k && !edge; m++) if (region[nb[m] as number] !== r) edge = true;
    if (edge) seeds[p] = 1;
  }
  const dist = chamferDistance(t, mask, seeds);
  const best = new Int32Array(count + 1).fill(-1);
  const bestD = new Int32Array(count + 1).fill(-1);
  for (let p = 0; p < n; p++) {
    const r = region[p] as number;
    if (r === 0) continue;
    const d = dist[p] as number;
    if (d > (bestD[r] as number)) {
      bestD[r] = d;
      best[r] = p;
    }
  }
  return best;
}
