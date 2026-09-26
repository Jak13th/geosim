/**
 * Routes maritimes et détroits (SPEC §4.4, §8.3).
 *
 * - Graphe océanique grossier (graph.ts) sur les pixels de mer, plus les chenaux forcés des
 *   canaux et des détroits trop étroits pour la grille.
 * - Les pixels situés sur une porte de détroit forment des nœuds à part : une route traverse
 *   le détroit si et seulement si elle passe par l'un d'eux.
 * - Ports d'une entité : ports Natural Earth ; à défaut, pixel côtier le plus proche de la
 *   capitale ; pour un pays sans accès à l'océan mondial, accès par voie de terre jusqu'à la
 *   côte la plus proche (pays de transit consigné).
 * - Pour chaque paire d'entités : route principale (plus courte) et route alternative, qui
 *   évite tous les détroits de la route principale (null si aucune n'existe).
 */
import { MapFlag, Terrain, isLand } from '@geosim/shared';
import type { Position } from '../io/shapefile.ts';
import { checkProvenance, type CuratedProvenance } from '../config.ts';
import { greatCircleKm, pixelLonLat, pixelOf, project, type Grid } from './grid.ts';
import { CHAMFER_ORTHO, forEachChamferStep, neighbors4, type Topology } from './gridops.ts';
import { buildCoarseGraph, components, dijkstra, pathTo, type CoarseGraph } from './graph.ts';
import { tracePolyline } from './raster.ts';
import type { Port } from './features.ts';

export interface ChokepointDef extends CuratedProvenance {
  id: string;
  name: string;
  nameFr: string;
  kind: 'strait' | 'canal' | 'cape';
  gates: Position[][];
  channel?: Position[];
  test: { a: Position; b: Position };
  /** Statut au jour du build (phase 1b) : ouvert, contesté ou fermé, trafic en % de la normale. */
  status: ChokepointStatus;
}

export interface ChokepointStatus extends CuratedProvenance {
  value: 'open' | 'contested' | 'closed';
  /** Trafic actuel en % du trafic d'avant crise. */
  traffic_pct: number;
  /** Trafic normal (ordre de grandeur), texte libre avec unité. */
  normal_traffic: string;
}

export function parseChokepoints(raw: unknown): ChokepointDef[] {
  const doc = raw as { version?: number; chokepoints?: unknown[] };
  if (doc?.version !== 1 || !Array.isArray(doc.chokepoints)) {
    throw new Error('chokepoints.yaml : version 1 et liste « chokepoints » attendues');
  }
  const isPos = (p: unknown): p is Position =>
    Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number');
  return doc.chokepoints.map((entry, k) => {
    const c = entry as Partial<ChokepointDef>;
    const where = `chokepoints.yaml › ${c.id ?? `#${k}`}`;
    checkProvenance(c, where);
    if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.nameFr !== 'string') {
      throw new Error(`${where} : id, name et nameFr requis`);
    }
    if (!['strait', 'canal', 'cape'].includes(c.kind ?? ''))
      throw new Error(`${where} : kind invalide`);
    if (
      !Array.isArray(c.gates) ||
      c.gates.length === 0 ||
      !c.gates.every((g) => g.length >= 2 && g.every(isPos))
    ) {
      throw new Error(`${where} : gates invalides`);
    }
    if (c.channel !== undefined && !(c.channel.length >= 2 && c.channel.every(isPos))) {
      throw new Error(`${where} : channel invalide`);
    }
    if (!c.test || !isPos(c.test.a) || !isPos(c.test.b))
      throw new Error(`${where} : test invalide`);
    const st = c.status;
    checkProvenance(st, `${where}.status`);
    if (!st || !['open', 'contested', 'closed'].includes(st.value)) {
      throw new Error(`${where} : status.value doit valoir open, contested ou closed`);
    }
    if (typeof st.traffic_pct !== 'number' || st.traffic_pct < 0 || st.traffic_pct > 150) {
      throw new Error(`${where} : status.traffic_pct invalide`);
    }
    if (typeof st.normal_traffic !== 'string')
      throw new Error(`${where} : status.normal_traffic requis`);
    return c as ChokepointDef;
  });
}

export interface ChokepointCheck {
  id: string;
  /** Longueur de la route de test, porte ouverte puis fermée (km ; null si inaccessible). */
  openKm: number | null;
  closedKm: number | null;
  traversesGate: boolean;
  gatePixels: number;
  carvedPixels: number;
  /** Extrémités des portes qui ne tombent pas à terre. */
  endpointsInWater: number;
}

export interface SeaNetwork {
  /** Graphe dont les coûts incluent le surcoût polaire. */
  graph: CoarseGraph;
  /** Longueur réelle (km) de chaque arc, dans l'ordre de `graph.targets`. */
  km: Float64Array;
  /** Détroit de chaque nœud (index dans la liste + 1 ; 0 sinon). */
  nodeChokepoint: Int32Array;
  /** Composante connexe de l'océan mondial (la plus grande). */
  mainComponent: number;
  comp: Int32Array;
  checks: ChokepointCheck[];
  /** Pixels de porte (eau) de chaque détroit, pour les riverains. */
  gatePixels: number[][];
  /** Pixels terrestres traversés par les portes (rives, canaux), pour les riverains. */
  gateLand: number[][];
}

export function buildSeaNetwork(
  grid: Grid,
  t: Topology,
  globe: Uint8Array,
  terrain: Uint8Array,
  flags: Uint16Array,
  chokepoints: readonly ChokepointDef[],
  cellKm: number,
  polar: { minLat: number; costFactor: number },
): SeaNetwork {
  const n = grid.width * grid.height;
  const cls = new Int32Array(n);
  for (let p = 0; p < n; p++) if (globe[p] && terrain[p] === Terrain.Sea) cls[p] = 1;

  const carved = chokepoints.map(() => 0);
  chokepoints.forEach((c, k) => {
    if (!c.channel) return;
    tracePolyline(grid, c.channel, (p) => {
      if (cls[p] === 0 && globe[p]) {
        cls[p] = 1;
        carved[k] = (carved[k] as number) + 1;
      }
    });
  });

  const gatePixels: number[][] = chokepoints.map(() => []);
  const gateLand: number[][] = chokepoints.map(() => []);
  const endpointsInWater = chokepoints.map(() => 0);
  chokepoints.forEach((c, k) => {
    for (const gate of c.gates) {
      for (const end of [gate[0] as Position, gate[gate.length - 1] as Position]) {
        if (!isLand(terrain[pixelOf(grid, end[0], end[1])] as number)) {
          endpointsInWater[k] = (endpointsInWater[k] as number) + 1;
        }
      }
      tracePolyline(grid, gate, (p) => {
        if (cls[p] === 0) {
          if (isLand(terrain[p] as number)) (gateLand[k] as number[]).push(p);
          return;
        }
        cls[p] = 2 + k;
        flags[p] = (flags[p] as number) | MapFlag.Strait;
        (gatePixels[k] as number[]).push(p);
      });
    }
  });

  const block = Math.max(2, Math.round(cellKm / grid.pixelSideKm));
  const graph = buildCoarseGraph(grid, t, cls, block);
  // Surcoût polaire (glaces) : il oriente le choix des routes, pas leur longueur rapportée.
  const km = Float64Array.from(graph.costs);
  for (let u = 0; u < graph.nodeCount; u++) {
    for (let e = graph.offsets[u] as number; e < (graph.offsets[u + 1] as number); e++) {
      const v = graph.targets[e] as number;
      if (
        Math.max(Math.abs(graph.lat[u] as number), Math.abs(graph.lat[v] as number)) >= polar.minLat
      ) {
        graph.costs[e] = (graph.costs[e] as number) * polar.costFactor;
      }
    }
  }
  const nodeChokepoint = new Int32Array(graph.nodeCount);
  for (let u = 0; u < graph.nodeCount; u++) {
    const c = graph.cls[u] as number;
    if (c >= 2) nodeChokepoint[u] = c - 1;
  }
  const comp = components(graph);
  const size = new Map<number, number>();
  for (let u = 0; u < graph.nodeCount; u++) {
    size.set(comp[u] as number, (size.get(comp[u] as number) ?? 0) + (graph.pixels[u] as number));
  }
  const mainComponent = [...size.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const network: SeaNetwork = {
    graph,
    km,
    nodeChokepoint,
    mainComponent,
    comp,
    checks: [],
    gatePixels,
    gateLand,
  };
  network.checks = chokepoints.map((c, k) => {
    const a = seaNodeNear(grid, t, network, c.test.a);
    const b = seaNodeNear(grid, t, network, c.test.b);
    let openKm: number | null = null;
    let closedKm: number | null = null;
    let traversesGate = false;
    if (a >= 0 && b >= 0) {
      const open = dijkstra(graph, [{ node: a, dist: 0 }]);
      if (Number.isFinite(open.dist[b] as number)) {
        const path = pathTo(open, b);
        openKm = Math.round(pathKm(network, path));
        traversesGate = path.some((u) => nodeChokepoint[u] === k + 1);
      }
      const blocked = new Uint8Array(graph.nodeCount);
      for (let u = 0; u < graph.nodeCount; u++) if (nodeChokepoint[u] === k + 1) blocked[u] = 1;
      const closed = dijkstra(graph, [{ node: a, dist: 0 }], blocked);
      if (Number.isFinite(closed.dist[b] as number))
        closedKm = Math.round(pathKm(network, pathTo(closed, b)));
    }
    return {
      id: c.id,
      openKm,
      closedKm,
      traversesGate,
      gatePixels: (gatePixels[k] as number[]).length,
      carvedPixels: carved[k] as number,
      endpointsInWater: endpointsInWater[k] as number,
    };
  });
  return network;
}

/** Longueur réelle (km) d'un chemin de nœuds. */
export function pathKm(net: SeaNetwork, path: readonly number[]): number {
  const g = net.graph;
  let total = 0;
  for (let k = 1; k < path.length; k++) {
    const u = path[k - 1] as number;
    const v = path[k] as number;
    for (let e = g.offsets[u] as number; e < (g.offsets[u + 1] as number); e++) {
      if (g.targets[e] === v) {
        total += net.km[e] as number;
        break;
      }
    }
  }
  return total;
}

/** Nœud de l'océan mondial le plus proche d'un point (-1 si aucun à moins de 30 pixels). */
function seaNodeNear(grid: Grid, t: Topology, net: SeaNetwork, pos: Position): number {
  const start = pixelOf(grid, pos[0], pos[1]);
  const seen = new Set([start]);
  let frontier = [start];
  const nb = new Int32Array(4);
  for (let step = 0; step <= 30; step++) {
    for (const p of frontier) {
      const u = net.graph.nodeOf[p] as number;
      if (u >= 0 && net.comp[u] === net.mainComponent) return u;
    }
    const next: number[] = [];
    for (const p of frontier) {
      const k = neighbors4(t, p, nb);
      for (let m = 0; m < k; m++) {
        const q = nb[m] as number;
        if (!seen.has(q)) {
          seen.add(q);
          next.push(q);
        }
      }
    }
    frontier = next;
  }
  return -1;
}

/** Validation des portes : chaque détroit doit être sur la route naturelle de son test. */
export function chokepointErrors(checks: readonly ChokepointCheck[]): string[] {
  const errors: string[] = [];
  for (const c of checks) {
    if (c.gatePixels === 0) errors.push(`${c.id} : la porte ne croise aucun pixel navigable`);
    if (c.endpointsInWater > 0)
      errors.push(`${c.id} : ${c.endpointsInWater} extrémité(s) de porte en mer`);
    if (c.openKm === null) errors.push(`${c.id} : points de test non reliés`);
    else if (!c.traversesGate) errors.push(`${c.id} : la route de test ne franchit pas la porte`);
    else if (c.closedKm !== null && c.closedKm <= c.openKm) {
      errors.push(`${c.id} : fermer la porte n'allonge pas la route de test`);
    }
  }
  return errors;
}

export interface Access {
  entity: number;
  /** Nœuds de départ (ports) et distance terrestre à ajouter (km). */
  nodes: { node: number; landKm: number }[];
  /** Pays dont on emprunte le territoire jusqu'à la côte (accès par voie de terre). */
  transit: number | null;
  kind: 'ports' | 'coast' | 'overland' | 'none';
  /** Entité ayant une façade sur l'océan mondial. */
  oceanAccess: boolean;
}

/**
 * Accès de chaque entité à l'océan mondial.
 * `capitalPixel[e]` : pixel de la capitale (-1 si inconnue).
 */
export function buildAccess(
  grid: Grid,
  t: Topology,
  terrain: Uint8Array,
  owner: Uint16Array,
  net: SeaNetwork,
  ports: readonly Port[],
  capitalPixel: Int32Array,
  entityCount: number,
): Access[] {
  const nb = new Int32Array(4);
  const w = grid.width;
  /** Nœud de l'océan mondial voisin d'un pixel terrestre, ou -1. */
  const oceanNodeNextTo = (p: number): number => {
    const k = neighbors4(t, p, nb);
    for (let m = 0; m < k; m++) {
      const u = net.graph.nodeOf[nb[m] as number] as number;
      if (u >= 0 && net.comp[u] === net.mainComponent && net.nodeChokepoint[u] === 0) return u;
    }
    return -1;
  };

  // Pixels terrestres de chaque entité bordant l'océan mondial.
  const oceanCoast = new Map<number, number[]>();
  for (let p = 0; p < owner.length; p++) {
    const o = owner[p] as number;
    if (o === 0 || !isLand(terrain[p] as number)) continue;
    if (oceanNodeNextTo(p) < 0) continue;
    if (!oceanCoast.has(o)) oceanCoast.set(o, []);
    oceanCoast.get(o)?.push(p);
  }
  const lonLatOf = (p: number): [number, number] => {
    const j = (p / w) | 0;
    return pixelLonLat(grid, p - j * w, j) ?? [0, 0];
  };

  // Territoire « métropolitain » : partie du territoire contiguë à la capitale. Ses ports
  // servent de départ aux routes, pour que la route États-Unis–Japon ne parte pas de Guam.
  const homeOf = new Int32Array(owner.length);
  for (let e = 1; e <= entityCount; e++) {
    const cap = capitalPixel[e] as number;
    if (cap < 0 || owner[cap] !== e) continue;
    const stack = [cap];
    homeOf[cap] = e;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const k = neighbors4(t, p, nb);
      for (let m = 0; m < k; m++) {
        const q = nb[m] as number;
        if (homeOf[q] === 0 && owner[q] === e) {
          homeOf[q] = e;
          stack.push(q);
        }
      }
    }
  }

  const access: Access[] = [];
  for (let e = 1; e <= entityCount; e++) {
    const nodes = new Map<number, number>();
    const own = ports.filter((port) => port.entity === e);
    const home = own.filter((port) => homeOf[port.pixel] === e);
    for (const port of home.length > 0 ? home : own) {
      const u = oceanNodeNextTo(port.pixel);
      if (u >= 0) nodes.set(u, 0);
    }
    if (nodes.size > 0) {
      access.push({
        entity: e,
        nodes: toList(nodes),
        transit: null,
        kind: 'ports',
        oceanAccess: true,
      });
      continue;
    }
    const cap = capitalPixel[e] as number;
    // Côte propre la plus proche de la capitale (même sur une autre partie du territoire),
    // puis, à défaut, accès par voie de terre.
    const coast = oceanCoast.get(e);
    if (coast && cap >= 0) {
      const [clon, clat] = lonLatOf(cap);
      let best = -1;
      let bestKm = Infinity;
      for (const p of coast) {
        const [lon, lat] = lonLatOf(p);
        const km = greatCircleKm(clon, clat, lon, lat);
        if (km < bestKm) {
          bestKm = km;
          best = p;
        }
      }
      access.push({
        entity: e,
        nodes: [{ node: oceanNodeNextTo(best), landKm: 0 }],
        transit: null,
        kind: 'coast',
        oceanAccess: true,
      });
      continue;
    }
    const overland = cap >= 0 ? nearestOceanFrom(cap, (p) => isLand(terrain[p] as number)) : null;
    if (overland) {
      const via = owner[overland.pixel] as number;
      access.push({
        entity: e,
        nodes: [{ node: overland.node, landKm: overland.km }],
        transit: via !== e && via !== 0 ? via : null,
        kind: 'overland',
        oceanAccess: false,
      });
    } else {
      access.push({ entity: e, nodes: [], transit: null, kind: 'none', oceanAccess: false });
    }
  }
  return access;

  /** Parcours (chanfrein) sur les pixels `allowed` depuis `start` jusqu'à une côte océanique. */
  function nearestOceanFrom(
    start: number,
    allowed: (p: number) => boolean,
  ): { pixel: number; node: number; km: number } | null {
    if (!allowed(start)) return null;
    const dist = new Map<number, number>([[start, 0]]);
    const buckets: number[][] = [[start]];
    for (let c = 0; c < buckets.length; c++) {
      const bucket = buckets[c];
      if (!bucket) continue;
      for (const p of bucket) {
        if (dist.get(p) !== c) continue;
        const u = oceanNodeNextTo(p);
        if (u >= 0) return { pixel: p, node: u, km: (c / CHAMFER_ORTHO) * grid.pixelSideKm };
        forEachChamferStep(t, p, allowed, (q, step) => {
          const nd = c + step;
          const old = dist.get(q);
          if (old !== undefined && old <= nd) return;
          dist.set(q, nd);
          (buckets[nd] ??= []).push(q);
        });
      }
    }
    return null;
  }
}

function toList(nodes: Map<number, number>): { node: number; landKm: number }[] {
  return [...nodes.entries()]
    .map(([node, landKm]) => ({ node, landKm }))
    .sort((a, b) => a.node - b.node);
}

export interface RouteLeg {
  km: number;
  /** Détroits franchis, dans l'ordre (identifiants). */
  straits: string[];
  /** Tracé simplifié [lon, lat] (arrondi au centième de degré). */
  path: [number, number][];
}

export interface Route {
  a: number;
  b: number;
  primary: RouteLeg;
  /** Route évitant tous les détroits de la principale ; null si elle n'en franchit aucun ou si aucune n'existe. */
  alternative: RouteLeg | null;
  /** Vrai si la principale franchit des détroits mais qu'aucune alternative n'existe. */
  noAlternative: boolean;
}

/** Routes principale et alternative pour toutes les paires d'entités ayant un accès à la mer. */
export function buildRoutes(
  grid: Grid,
  net: SeaNetwork,
  access: readonly Access[],
  chokepoints: readonly ChokepointDef[],
  simplifyPx: number,
): Route[] {
  const g = net.graph;
  const routes: Route[] = [];
  const withAccess = access.filter((a) => a.nodes.length > 0);

  type Target = { node: number; cost: number; landKm: number };
  const bestTarget = (dist: Float64Array, target: Access): Target | null => {
    let best: Target | null = null;
    for (const s of target.nodes) {
      const cost = (dist[s.node] as number) + s.landKm;
      if (Number.isFinite(cost) && (best === null || cost < best.cost)) {
        best = { node: s.node, cost, landKm: s.landKm };
      }
    }
    return best;
  };
  const legOf = (paths: ReturnType<typeof dijkstra>, from: Access, target: Target): RouteLeg => {
    const nodes = pathTo(paths, target.node);
    const sourceLand = from.nodes.find((s) => s.node === nodes[0])?.landKm ?? 0;
    const km = sourceLand + pathKm(net, nodes) + target.landKm;
    const straits: string[] = [];
    for (const u of nodes) {
      const c = net.nodeChokepoint[u] as number;
      const id = c > 0 ? (chokepoints[c - 1]?.id ?? '') : '';
      if (id && straits[straits.length - 1] !== id) straits.push(id);
    }
    return {
      km: Math.round(km),
      straits: [...new Set(straits)],
      path: simplifyPath(grid, g, nodes, simplifyPx),
    };
  };

  for (const from of withAccess) {
    const sources = from.nodes.map((s) => ({ node: s.node, dist: s.landKm }));
    const primary = dijkstra(g, sources);
    const targets = withAccess.filter((to) => to.entity > from.entity);
    const pending = new Map<string, { to: Access; route: Route }[]>();
    for (const to of targets) {
      const best = bestTarget(primary.dist, to);
      if (best === null) continue;
      const leg = legOf(primary, from, best);
      const route: Route = {
        a: from.entity,
        b: to.entity,
        primary: leg,
        alternative: null,
        noAlternative: false,
      };
      routes.push(route);
      if (leg.straits.length > 0) {
        const key = [...leg.straits].sort().join(',');
        if (!pending.has(key)) pending.set(key, []);
        pending.get(key)?.push({ to, route });
      }
    }
    // Alternatives : un Dijkstra par ensemble de détroits à éviter.
    for (const [key, group] of pending) {
      const avoid = new Set(key.split(','));
      const blocked = new Uint8Array(g.nodeCount);
      for (let u = 0; u < g.nodeCount; u++) {
        const c = net.nodeChokepoint[u] as number;
        if (c > 0 && avoid.has(chokepoints[c - 1]?.id ?? '')) blocked[u] = 1;
      }
      const wanted = new Set(group.flatMap(({ to }) => to.nodes.map((s) => s.node)));
      const alt = dijkstra(g, sources, blocked, wanted);
      for (const { to, route } of group) {
        const best = bestTarget(alt.dist, to);
        if (best === null) route.noAlternative = true;
        else route.alternative = legOf(alt, from, best);
      }
    }
  }
  return routes;
}

/** Tracé des nœuds simplifié (Douglas-Peucker en coordonnées projetées), coupé à l'antiméridien. */
function simplifyPath(
  grid: Grid,
  g: CoarseGraph,
  nodes: readonly number[],
  tolerancePx: number,
): [number, number][] {
  if (nodes.length === 0) return [];
  const pts = nodes.map((u) => {
    const lon = g.lon[u] as number;
    const lat = g.lat[u] as number;
    const [x, y] = project(grid, lon, lat);
    return { lon, lat, x, y };
  });
  const keep = new Uint8Array(pts.length);
  // Segments continus (pas de saut d'un bord à l'autre de la carte).
  let start = 0;
  for (let k = 1; k <= pts.length; k++) {
    const jump =
      k < pts.length &&
      Math.abs((pts[k]?.x as number) - (pts[k - 1]?.x as number)) > grid.width / 2;
    if (k === pts.length || jump) {
      douglasPeucker(pts, start, k - 1, tolerancePx, keep);
      start = k;
    }
  }
  const round = (v: number): number => Math.round(v * 100) / 100;
  return pts.filter((_, k) => keep[k]).map((p) => [round(p.lon), round(p.lat)]);
}

function douglasPeucker(
  pts: readonly { x: number; y: number }[],
  first: number,
  last: number,
  tol: number,
  keep: Uint8Array,
): void {
  keep[first] = 1;
  keep[last] = 1;
  if (last - first < 2) return;
  const a = pts[first] as { x: number; y: number };
  const b = pts[last] as { x: number; y: number };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let maxD = -1;
  let index = -1;
  for (let k = first + 1; k < last; k++) {
    const p = pts[k] as { x: number; y: number };
    const d = Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
    if (d > maxD) {
      maxD = d;
      index = k;
    }
  }
  if (maxD > tol) {
    douglasPeucker(pts, first, index, tol, keep);
    douglasPeucker(pts, index, last, tol, keep);
  }
}
