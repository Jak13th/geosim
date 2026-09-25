import { describe, expect, it } from 'vitest';
import type { Position } from '../io/shapefile.ts';
import { makeGrid } from './grid.ts';
import { ringsArea } from './political.ts';
import { projectRings, scanPolygon, splitAntimeridian, traceSegment } from './raster.ts';

const rect = (x0: number, y0: number, x1: number, y1: number): Float64Array =>
  Float64Array.from([x0, y0, x1, y0, x1, y1, x0, y1]);

function count(rings: Float64Array[], width = 20, height = 20, scale = 1): number {
  let n = 0;
  scanPolygon(rings, width, height, (_row, x0, x1) => (n += x1 - x0), scale);
  return n;
}

function cells(rings: Float64Array[], width = 20, height = 20): Set<number> {
  const out = new Set<number>();
  scanPolygon(rings, width, height, (row, x0, x1) => {
    for (let i = x0; i < x1; i++) out.add(row * width + i);
  });
  return out;
}

describe('rasterisation par balayage (pair-impair, centre des pixels)', () => {
  it('remplit exactement un rectangle aligné sur la grille', () => {
    expect(count([rect(2, 3, 7, 9)])).toBe(30);
  });

  it('retire les trous et accepte les deux sens de parcours', () => {
    const outer = rect(0, 0, 10, 10);
    const hole = Float64Array.from([2, 2, 2, 8, 8, 8, 8, 2]);
    expect(count([outer, hole])).toBe(100 - 36);
  });

  it('partage sans trou ni recouvrement deux polygones contigus', () => {
    const a = Float64Array.from([1.3, 1.1, 9.7, 2.2, 5.5, 14.9]);
    const b = Float64Array.from([9.7, 2.2, 17.2, 12.4, 5.5, 14.9]);
    const both = Float64Array.from([1.3, 1.1, 9.7, 2.2, 17.2, 12.4, 5.5, 14.9]);
    const ca = cells([a]);
    const cb = cells([b]);
    for (const c of ca) expect(cb.has(c)).toBe(false);
    expect(ca.size + cb.size).toBe(cells([both]).size);
  });

  it('approche l’aire exacte d’un polygone quelconque', () => {
    const ring = Float64Array.from([10.2, 5.1, 180.7, 30.3, 150.1, 170.9, 20.4, 120.6]);
    const exact = ringsArea([ring]);
    expect(Math.abs(count([ring], 200, 200) - exact) / exact).toBeLessThan(0.01);
  });

  it('sur-échantillonne pour estimer une couverture', () => {
    // Un carré de 1,5 × 1,5 pixel couvre 9 sous-pixels sur 4 × 4 par pixel… soit 36 sous-pixels.
    expect(count([rect(1, 1, 2.5, 2.5)], 5, 5, 4)).toBe(36);
  });
});

describe('tracé supercover', () => {
  it('produit un chemin 4-connexe, du premier au dernier pixel', () => {
    const visited: number[] = [];
    traceSegment(0.5, 0.5, 7.2, 4.9, 10, 10, (p) => visited.push(p));
    expect(visited[0]).toBe(0);
    expect(visited[visited.length - 1]).toBe(4 * 10 + 7);
    for (let k = 1; k < visited.length; k++) {
      const a = visited[k - 1] as number;
      const b = visited[k] as number;
      const d = Math.abs((a % 10) - (b % 10)) + Math.abs(Math.floor(a / 10) - Math.floor(b / 10));
      expect(d).toBe(1);
    }
  });
});

describe('découpage à l’antiméridien', () => {
  it('ne touche pas un anneau qui ne franchit pas l’antiméridien', () => {
    const ring: Position[] = [
      [170, 10],
      [180, 10],
      [180, 20],
      [170, 20],
      [170, 10],
    ];
    expect(splitAntimeridian(ring)).toEqual([ring]);
  });

  it('coupe un anneau à cheval sur ±180° en deux morceaux de même aire totale', () => {
    const ring: Position[] = [
      [170, 10],
      [-170, 10],
      [-170, 20],
      [170, 20],
      [170, 10],
    ];
    const pieces = splitAntimeridian(ring);
    expect(pieces).toHaveLength(2);
    for (const piece of pieces)
      for (const [lon] of piece) expect(Math.abs(lon)).toBeLessThanOrEqual(180);
    const grid = makeGrid(1024);
    const total = ringsArea(projectRings(grid, [ring]));
    const east = ringsArea(
      projectRings(grid, [
        [
          [170, 10],
          [180, 10],
          [180, 20],
          [170, 20],
          [170, 10],
        ],
      ]),
    );
    expect(total).toBeCloseTo(2 * east, 3);
  });

  it('referme par le pôle un anneau qui en fait le tour', () => {
    const ring: Position[] = [];
    for (let lon = -180; lon <= 180; lon += 30) ring.push([lon === -180 ? 179.9 : lon, 70]);
    const grid = makeGrid(512);
    const area = ringsArea(projectRings(grid, [ring]));
    // Calotte au-delà de 70°N : environ 3 % de la surface du globe.
    const globe = 4 * Math.PI * grid.projectionSpec.scale ** 2;
    expect(area / globe).toBeGreaterThan(0.025);
    expect(area / globe).toBeLessThan(0.035);
  });
});
