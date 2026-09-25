import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid.ts';
import { makeTopology } from './gridops.ts';
import { buildCoarseGraph, components, dijkstra, pathTo } from './graph.ts';

/**
 * Océan synthétique sur une vraie grille (256 px) : une bande de terre verticale coupe le monde,
 * sauf un détroit d'un pixel de large ; les pixels du détroit sont de classe 2 (porte).
 */
function setup() {
  const grid = makeGrid(256);
  const t = makeTopology(grid);
  const cls = new Int32Array(grid.width * grid.height);
  const wall = 128;
  const strait = Math.floor(grid.height / 2);
  for (let j = 0; j < grid.height; j++) {
    for (let i = t.left[j] as number; i <= (t.right[j] as number); i++) {
      if (t.left[j] === -1) continue;
      const onWall = i >= wall - 2 && i <= wall + 2;
      cls[j * grid.width + i] = onWall ? (j === strait ? 2 : 0) : 1;
    }
  }
  // Coupe aussi le raccord à l'antiméridien : bande de terre sur les bords.
  for (let j = 0; j < grid.height; j++) {
    const l = t.left[j] as number;
    const r = t.right[j] as number;
    if (l < 0) continue;
    cls[j * grid.width + l] = 0;
    cls[j * grid.width + r] = 0;
  }
  return { grid, t, cls, wall, strait };
}

describe('graphe grossier', () => {
  it('préserve la connexité fine et ne saute jamais par-dessus une porte', () => {
    const { grid, t, cls, wall, strait } = setup();
    const g = buildCoarseGraph(grid, t, cls, 8);
    expect(new Set(components(g)).size).toBe(1);
    const west = g.nodeOf[strait * grid.width + wall - 40] as number;
    const east = g.nodeOf[strait * grid.width + wall + 40] as number;
    const paths = dijkstra(g, [{ node: west, dist: 0 }]);
    const path = pathTo(paths, east);
    expect(path.length).toBeGreaterThan(2);
    expect(path.some((u) => g.cls[u] === 2)).toBe(true);

    // Porte fermée : plus de passage.
    const blocked = new Uint8Array(g.nodeCount);
    for (let u = 0; u < g.nodeCount; u++) if (g.cls[u] === 2) blocked[u] = 1;
    expect(
      Number.isFinite(dijkstra(g, [{ node: west, dist: 0 }], blocked).dist[east] as number),
    ).toBe(false);
  });

  it('donne des distances proches de l’orthodromie grâce aux arêtes en ligne de vue', () => {
    const grid = makeGrid(512);
    const t = makeTopology(grid);
    const cls = new Int32Array(grid.width * grid.height);
    for (let j = 0; j < grid.height; j++) {
      for (
        let i = t.left[j] as number;
        i <= (t.right[j] as number) && (t.left[j] as number) >= 0;
        i++
      ) {
        cls[j * grid.width + i] = 1;
      }
    }
    const g = buildCoarseGraph(grid, t, cls, 6);
    const a = g.nodeOf[80 * grid.width + 150] as number;
    const b = g.nodeOf[170 * grid.width + 330] as number;
    expect(a >= 0 && b >= 0).toBe(true);
    const d = dijkstra(g, [{ node: a, dist: 0 }]).dist[b] as number;
    const toRad = Math.PI / 180;
    const direct =
      2 *
      6371.0072 *
      Math.asin(
        Math.sqrt(
          Math.sin((((g.lat[b] as number) - (g.lat[a] as number)) * toRad) / 2) ** 2 +
            Math.cos((g.lat[a] as number) * toRad) *
              Math.cos((g.lat[b] as number) * toRad) *
              Math.sin((((g.lon[b] as number) - (g.lon[a] as number)) * toRad) / 2) ** 2,
        ),
      );
    expect(d / direct).toBeGreaterThanOrEqual(0.999);
    expect(d / direct).toBeLessThan(1.06);
  });

  it('arrête Dijkstra dès que les cibles sont atteintes', () => {
    const { grid, t, cls } = setup();
    const g = buildCoarseGraph(grid, t, cls, 8);
    const full = dijkstra(g, [{ node: 0, dist: 0 }]);
    const target = g.nodeCount - 1;
    const early = dijkstra(g, [{ node: 0, dist: 0 }], null, new Set([target]));
    expect(early.dist[target]).toBe(full.dist[target]);
  });
});
