import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_KM,
  globeMask,
  greatCircleKm,
  makeGrid,
  pixelLonLat,
  pixelOf,
  project,
} from './grid.ts';

describe('grille Equal Earth', () => {
  it('a les dimensions et la surface par pixel attendues à 4096 px', () => {
    const grid = makeGrid(4096);
    expect(grid.height).toBe(1994);
    expect(grid.pixelAreaKm2).toBeCloseTo(70.9, 1);
    // La surface de tous les pixels du globe vaut celle de la Terre (projection à surface égale).
    const globe = globeMask(grid);
    const count = globe.reduce((s, v) => s + v, 0);
    const earth = 4 * Math.PI * EARTH_RADIUS_KM ** 2;
    expect(Math.abs(count * grid.pixelAreaKm2 - earth) / earth).toBeLessThan(0.002);
  });

  it('est à surface égale : une bande de latitude a le bon nombre de pixels', () => {
    const grid = makeGrid(2048);
    const globe = globeMask(grid);
    let pixels = 0;
    let first = -1;
    let last = -1;
    for (let j = 0; j < grid.height; j++) {
      const lat = grid.rowLat[j] as number;
      if (lat < 40 || lat >= 60) continue;
      if (first < 0) first = j;
      last = j;
      for (let i = 0; i < grid.width; i++) pixels += globe[j * grid.width + i] as number;
    }
    // Surface exacte entre le bord haut de la première rangée et le bord bas de la dernière.
    const latAt = (y: number): number => grid.projection.invert?.([grid.width / 2, y])?.[1] ?? NaN;
    const rad = Math.PI / 180;
    const exact =
      2 *
      Math.PI *
      EARTH_RADIUS_KM ** 2 *
      Math.abs(Math.sin(latAt(first) * rad) - Math.sin(latAt(last + 1) * rad));
    expect(Math.abs(pixels * grid.pixelAreaKm2 - exact) / exact).toBeLessThan(0.005);
  });

  it('inverse la projection au centre des pixels', () => {
    const grid = makeGrid(1024);
    for (const [lon, lat] of [
      [2.35, 48.85],
      [-122.4, 37.8],
      [151.2, -33.9],
      [179.9, 0],
      [-179.9, -65],
    ] as [number, number][]) {
      const p = pixelOf(grid, lon, lat);
      const j = Math.floor(p / grid.width);
      const ll = pixelLonLat(grid, p - j * grid.width, j);
      expect(ll).not.toBeNull();
      const [x, y] = project(grid, (ll as [number, number])[0], (ll as [number, number])[1]);
      expect(Math.floor(x)).toBe(p - j * grid.width);
      expect(Math.floor(y)).toBe(j);
    }
  });

  it('place l’antiméridien sur les bords gauche et droit de la carte', () => {
    const grid = makeGrid(1024);
    const [xEast] = project(grid, 180, 0);
    const [xWest] = project(grid, -180, 0);
    expect(xEast).toBeCloseTo(1024, 6);
    expect(xWest).toBeCloseTo(0, 6);
    expect(pixelLonLat(grid, 0, 0)).toBeNull();
  });

  it('calcule les distances orthodromiques', () => {
    expect(greatCircleKm(2.35, 48.85, -0.13, 51.51)).toBeCloseTo(343, -1);
    expect(greatCircleKm(0, 0, 180, 0)).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 3);
  });
});
