/**
 * Graphe grossier d'une grille : chaque bloc de k × k pixels est découpé en composantes
 * connexes (4-connexité) de pixels de même classe ; chaque composante devient un nœud.
 * Deux nœuds sont reliés si deux de leurs pixels sont voisins. On garde ainsi la connexité
 * exacte de la grille fine (pas de passage fictif à travers un isthme) avec un graphe
 * environ k² fois plus petit.
 *
 * Les nœuds de blocs voisins (jusqu'à `losRadius` blocs) sont aussi reliés en ligne de vue,
 * si le segment entre leurs pixels représentatifs reste dans le graphe : les chemins ne sont
 * plus contraints aux quatre directions de la grille (erreur de longueur de quelques %, au
 * lieu de 41 % en diagonale). Un segment ne peut pas traverser un pixel de classe ≥ 2 (porte
 * de détroit) d'un autre nœud : on ne saute jamais par-dessus une porte.
 *
 * Coût d'une arête : distance orthodromique entre les centres des deux nœuds (km).
 */
import { greatCircleKm, pixelLonLat, type Grid } from './grid.ts';
import { neighbors4, type Topology } from './gridops.ts';
import { traceSegment } from './raster.ts';

export interface CoarseGraph {
  nodeCount: number;
  /** Nœud de chaque pixel (-1 hors du graphe). */
  nodeOf: Int32Array;
  /** Classe des pixels du nœud. */
  cls: Int32Array;
  lon: Float64Array;
  lat: Float64Array;
  pixels: Int32Array;
  /** Adjacence au format CSR : voisins de u dans targets[offsets[u] … offsets[u+1]). */
  offsets: Int32Array;
  targets: Int32Array;
  costs: Float64Array;
}

/** `cls[p]` > 0 : pixel du graphe, de cette classe ; 0 : hors graphe. */
export function buildCoarseGraph(
  grid: Grid,
  t: Topology,
  cls: Int32Array,
  block: number,
  losRadius = 2,
): CoarseGraph {
  const w = grid.width;
  const n = w * grid.height;
  const nodeOf = new Int32Array(n).fill(-1);
  const nodeCls: number[] = [];
  const sumLon: number[] = [];
  const sumLat: number[] = [];
  const count: number[] = [];
  const sumX: number[] = [];
  const sumY: number[] = [];
  const stack = new Int32Array(block * block * 4);
  const nb = new Int32Array(4);
  const lonLat = (p: number): [number, number] => {
    const j = (p / w) | 0;
    return pixelLonLat(grid, p - j * w, j) ?? [0, 0];
  };

  for (let bj = 0; bj < grid.height; bj += block) {
    for (let bi = 0; bi < w; bi += block) {
      for (let j = bj; j < Math.min(grid.height, bj + block); j++) {
        for (let i = bi; i < Math.min(w, bi + block); i++) {
          const start = j * w + i;
          const c = cls[start] as number;
          if (c === 0 || nodeOf[start] !== -1) continue;
          const node = nodeCls.length;
          nodeCls.push(c);
          let sl = 0;
          let sa = 0;
          let sx = 0;
          let sy = 0;
          let k = 0;
          let top = 0;
          stack[top++] = start;
          nodeOf[start] = node;
          while (top > 0) {
            const p = stack[--top] as number;
            const [lo, la] = lonLat(p);
            sl += lo;
            sa += la;
            sx += p % w;
            sy += (p / w) | 0;
            k++;
            const m = neighbors4(t, p, nb);
            for (let e = 0; e < m; e++) {
              const q = nb[e] as number;
              if (nodeOf[q] !== -1 || cls[q] !== c) continue;
              const qj = (q / w) | 0;
              const qi = q - qj * w;
              if (qi < bi || qi >= bi + block || qj < bj || qj >= bj + block) continue;
              nodeOf[q] = node;
              stack[top++] = q;
            }
          }
          sumLon.push(sl);
          sumLat.push(sa);
          sumX.push(sx);
          sumY.push(sy);
          count.push(k);
        }
      }
    }
  }

  const nodeCount = nodeCls.length;
  const lon = new Float64Array(nodeCount);
  const lat = new Float64Array(nodeCount);
  for (let u = 0; u < nodeCount; u++) {
    lon[u] = (sumLon[u] as number) / (count[u] as number);
    lat[u] = (sumLat[u] as number) / (count[u] as number);
  }

  // Arêtes : paires de nœuds dont deux pixels sont voisins (raccord à l'antiméridien compris).
  const edgeSet = new Set<number>();
  for (let p = 0; p < n; p++) {
    const a = nodeOf[p] as number;
    if (a < 0) continue;
    const m = neighbors4(t, p, nb);
    for (let e = 0; e < m; e++) {
      const b = nodeOf[nb[e] as number] as number;
      if (b >= 0 && b !== a) edgeSet.add(a * nodeCount + b);
    }
  }

  // Pixel représentatif de chaque nœud : le plus proche de son centre de gravité.
  const repr = new Int32Array(nodeCount).fill(-1);
  const reprD = new Float64Array(nodeCount).fill(Infinity);
  for (let p = 0; p < n; p++) {
    const u = nodeOf[p] as number;
    if (u < 0) continue;
    const k = count[u] as number;
    const d =
      ((p % w) - (sumX[u] as number) / k) ** 2 + (((p / w) | 0) - (sumY[u] as number) / k) ** 2;
    if (d < (reprD[u] as number)) {
      reprD[u] = d;
      repr[u] = p;
    }
  }

  // Arêtes en ligne de vue entre nœuds de blocs proches.
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(grid.height / block);
  const blockOf = (p: number): number =>
    Math.floor(((p / w) | 0) / block) * bw + Math.floor((p % w) / block);
  const blockStart = new Int32Array(bw * bh + 1);
  for (let u = 0; u < nodeCount; u++) {
    const b = blockOf(repr[u] as number) + 1;
    blockStart[b] = (blockStart[b] as number) + 1;
  }
  for (let b = 0; b < bw * bh; b++)
    blockStart[b + 1] = (blockStart[b + 1] as number) + (blockStart[b] as number);
  const blockNodes = new Int32Array(nodeCount);
  const cursor = blockStart.slice(0, bw * bh);
  for (let u = 0; u < nodeCount; u++) {
    const b = blockOf(repr[u] as number);
    blockNodes[cursor[b] as number] = u;
    cursor[b] = (cursor[b] as number) + 1;
  }
  const lineOfSight = (a: number, b: number): boolean => {
    const pa = repr[a] as number;
    const pb = repr[b] as number;
    let ok = true;
    traceSegment(
      (pa % w) + 0.5,
      ((pa / w) | 0) + 0.5,
      (pb % w) + 0.5,
      ((pb / w) | 0) + 0.5,
      w,
      grid.height,
      (q) => {
        const c = cls[q] as number;
        if (c === 0 || (c >= 2 && nodeOf[q] !== a && nodeOf[q] !== b)) ok = false;
      },
    );
    return ok;
  };
  for (let a = 0; a < nodeCount; a++) {
    const ba = blockOf(repr[a] as number);
    const bx = ba % bw;
    const by = Math.floor(ba / bw);
    for (let dy = -losRadius; dy <= losRadius; dy++) {
      for (let dx = -losRadius; dx <= losRadius; dx++) {
        // Directions redondantes (2, 0), (2, 2)… : déjà couvertes par deux pas plus courts.
        if (gcd(Math.abs(dx), Math.abs(dy)) > 1) continue;
        const x = bx + dx;
        const y = by + dy;
        if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
        const b0 = y * bw + x;
        for (let k = blockStart[b0] as number; k < (blockStart[b0 + 1] as number); k++) {
          const b = blockNodes[k] as number;
          if (b <= a || edgeSet.has(a * nodeCount + b)) continue;
          if (lineOfSight(a, b)) {
            edgeSet.add(a * nodeCount + b);
            edgeSet.add(b * nodeCount + a);
          }
        }
      }
    }
  }

  const degree = new Int32Array(nodeCount + 1);
  for (const key of edgeSet) {
    const slot = Math.floor(key / nodeCount) + 1;
    degree[slot] = (degree[slot] as number) + 1;
  }
  const offsets = new Int32Array(nodeCount + 1);
  for (let u = 0; u < nodeCount; u++)
    offsets[u + 1] = (offsets[u] as number) + (degree[u + 1] as number);
  const targets = new Int32Array(edgeSet.size);
  const costs = new Float64Array(edgeSet.size);
  const fill = offsets.slice(0, nodeCount);
  for (const key of [...edgeSet].sort((x, y) => x - y)) {
    const a = Math.floor(key / nodeCount);
    const b = key - a * nodeCount;
    const slot = fill[a] as number;
    fill[a] = slot + 1;
    targets[slot] = b;
    costs[slot] = greatCircleKm(
      lon[a] as number,
      lat[a] as number,
      lon[b] as number,
      lat[b] as number,
    );
  }

  return {
    nodeCount,
    nodeOf,
    cls: Int32Array.from(nodeCls),
    lon,
    lat,
    pixels: Int32Array.from(count),
    offsets,
    targets,
    costs,
  };
}

/** Tas binaire minimal (clés réelles, valeurs entières), sur tableaux typés extensibles. */
class MinHeap {
  private keys = new Float64Array(1024);
  private values = new Int32Array(1024);
  size = 0;
  push(key: number, value: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      keys.set(this.keys);
      this.keys = keys;
      const values = new Int32Array(this.size * 2);
      values.set(this.values);
      this.values = values;
    }
    const keys = this.keys;
    const values = this.values;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      keys[i] = keys[parent] as number;
      values[i] = values[parent] as number;
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }
  /** Retire le minimum ; sa clé et sa valeur sont lues dans `topKey` et `topValue`. */
  topKey = 0;
  topValue = 0;
  pop(): void {
    const keys = this.keys;
    const values = this.values;
    this.topKey = keys[0] as number;
    this.topValue = values[0] as number;
    const size = --this.size;
    if (size === 0) return;
    const lastKey = keys[size] as number;
    const lastValue = values[size] as number;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= size) break;
      const r = l + 1;
      const c = r < size && (keys[r] as number) < (keys[l] as number) ? r : l;
      if ((keys[c] as number) >= lastKey) break;
      keys[i] = keys[c] as number;
      values[i] = values[c] as number;
      i = c;
    }
    keys[i] = lastKey;
    values[i] = lastValue;
  }
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export interface ShortestPaths {
  dist: Float64Array;
  prev: Int32Array;
}

/**
 * Dijkstra multi-sources. `sources` : nœud et distance initiale ; `blocked[u]` = 1 interdit u.
 * Si `targets` est donné, le calcul s'arrête dès que tous ces nœuds sont atteints
 * définitivement (les distances des autres nœuds restent alors provisoires).
 */
export function dijkstra(
  g: CoarseGraph,
  sources: readonly { node: number; dist: number }[],
  blocked: Uint8Array | null = null,
  targets: ReadonlySet<number> | null = null,
): ShortestPaths {
  let remaining = targets ? targets.size : -1;
  const dist = new Float64Array(g.nodeCount).fill(Infinity);
  const prev = new Int32Array(g.nodeCount).fill(-1);
  const heap = new MinHeap();
  for (const s of sources) {
    if (blocked?.[s.node]) continue;
    if (s.dist < (dist[s.node] as number)) {
      dist[s.node] = s.dist;
      heap.push(s.dist, s.node);
    }
  }
  while (heap.size > 0) {
    heap.pop();
    const d = heap.topKey;
    const u = heap.topValue;
    if (d > (dist[u] as number)) continue;
    if (targets?.has(u) && --remaining === 0) break;
    for (let e = g.offsets[u] as number; e < (g.offsets[u + 1] as number); e++) {
      const v = g.targets[e] as number;
      if (blocked?.[v]) continue;
      const nd = d + (g.costs[e] as number);
      if (nd < (dist[v] as number)) {
        dist[v] = nd;
        prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  return { dist, prev };
}

/** Chemin depuis une source jusqu'à `target` (liste de nœuds), vide si inaccessible. */
export function pathTo(paths: ShortestPaths, target: number): number[] {
  if (!Number.isFinite(paths.dist[target] as number)) return [];
  const path: number[] = [];
  for (let u = target; u !== -1; u = paths.prev[u] as number) path.push(u);
  return path.reverse();
}

/** Composantes connexes du graphe (identifiant par nœud). */
export function components(g: CoarseGraph): Int32Array {
  const comp = new Int32Array(g.nodeCount).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let s = 0; s < g.nodeCount; s++) {
    if (comp[s] !== -1) continue;
    comp[s] = next;
    stack.push(s);
    while (stack.length > 0) {
      const u = stack.pop() as number;
      for (let e = g.offsets[u] as number; e < (g.offsets[u + 1] as number); e++) {
        const v = g.targets[e] as number;
        if (comp[v] === -1) {
          comp[v] = next;
          stack.push(v);
        }
      }
    }
    next++;
  }
  return comp;
}
