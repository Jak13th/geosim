/**
 * Points d'étiquette par unité territoriale (pays principal, territoire dépendant) : le pixel le
 * plus éloigné du bord de l'unité, par transformée de distance du chanfrein (3-4) en deux passes.
 *
 * Sert à écrire « Danemark » sur le Danemark et « Groenland » sur le Groenland, alors que le
 * point d'étiquette de l'entité (le plus intérieur de tout son territoire) tombe au Groenland.
 */

const ORTHO = 3;
const DIAG = 4;
const MAX = 0xffff;

/**
 * Renvoie, pour chaque unité (index), le pixel le plus intérieur, ou -1 si l'unité n'a aucun
 * pixel. `land(p)` indique si le pixel est terrestre.
 */
export function unitLabelPixels(
  unit: Uint16Array,
  land: (p: number) => boolean,
  width: number,
  height: number,
  unitCount: number,
): Int32Array {
  const n = width * height;
  const d = new Uint16Array(n);
  for (let p = 0; p < n; p++) d[p] = land(p) && unit[p] !== 0 ? MAX : 0;
  const relax = (q: number, w: number, u: number): number => {
    // Un voisin d'une autre unité (ou d'eau) est à la frontière : distance w.
    const cand = unit[q] === u && (d[q] as number) > 0 ? (d[q] as number) + w : w;
    return cand;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (d[p] === 0) continue;
      const u = unit[p] as number;
      let best = d[p] as number;
      best = Math.min(best, x > 0 ? relax(p - 1, ORTHO, u) : ORTHO);
      if (y > 0) {
        best = Math.min(best, relax(p - width, ORTHO, u));
        best = Math.min(best, x > 0 ? relax(p - width - 1, DIAG, u) : DIAG);
        best = Math.min(best, x < width - 1 ? relax(p - width + 1, DIAG, u) : DIAG);
      } else {
        best = Math.min(best, ORTHO);
      }
      d[p] = Math.min(MAX, best);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (d[p] === 0) continue;
      const u = unit[p] as number;
      let best = d[p] as number;
      best = Math.min(best, x < width - 1 ? relax(p + 1, ORTHO, u) : ORTHO);
      if (y < height - 1) {
        best = Math.min(best, relax(p + width, ORTHO, u));
        best = Math.min(best, x < width - 1 ? relax(p + width + 1, DIAG, u) : DIAG);
        best = Math.min(best, x > 0 ? relax(p + width - 1, DIAG, u) : DIAG);
      } else {
        best = Math.min(best, ORTHO);
      }
      d[p] = best;
    }
  }
  // Distance maximale par unité, puis, parmi les pixels qui l'atteignent, le plus proche de
  // leur barycentre (une bande uniforme est étiquetée en son milieu, pas à une extrémité).
  const maxD = new Uint16Array(unitCount + 1);
  for (let p = 0; p < n; p++) {
    const u = unit[p] as number;
    if (u <= unitCount && (d[p] as number) > (maxD[u] as number)) maxD[u] = d[p] as number;
  }
  const sx = new Float64Array(unitCount + 1);
  const sy = new Float64Array(unitCount + 1);
  const count = new Uint32Array(unitCount + 1);
  for (let p = 0; p < n; p++) {
    const u = unit[p] as number;
    if (u > unitCount || d[p] === 0 || d[p] !== maxD[u]) continue;
    sx[u] = (sx[u] as number) + (p % width);
    sy[u] = (sy[u] as number) + Math.floor(p / width);
    count[u] = (count[u] as number) + 1;
  }
  const out = new Int32Array(unitCount + 1).fill(-1);
  const bestDist = new Float64Array(unitCount + 1).fill(Infinity);
  for (let p = 0; p < n; p++) {
    const u = unit[p] as number;
    if (u > unitCount || d[p] === 0 || d[p] !== maxD[u]) continue;
    const c = count[u] as number;
    const dx = (p % width) - (sx[u] as number) / c;
    const dy = Math.floor(p / width) - (sy[u] as number) / c;
    const dist = dx * dx + dy * dy;
    if (dist < (bestDist[u] as number)) {
      bestDist[u] = dist;
      out[u] = p;
    }
  }
  return out;
}
