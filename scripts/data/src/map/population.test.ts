import { readFile } from 'node:fs/promises';
import { Biome, MapFlag, Terrain } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { parseModelConfig } from '../config.ts';
import { MODEL_CONFIG_PATH } from '../paths.ts';
import { makeGrid, pixelOf } from './grid.ts';
import { distributePopulation, habitability, type UnitTotals } from './population.ts';

const config = parseModelConfig(await readFile(MODEL_CONFIG_PATH, 'utf8'));

describe('habitabilité', () => {
  const h = (terrain: number, biome: number, flags = 0) =>
    habitability(config, terrain, biome, flags);

  it('ordonne les milieux : forêt tempérée > désert, plaine > haute montagne, glace nulle', () => {
    expect(h(Terrain.Plain, Biome.TemperateForest)).toBeGreaterThan(h(Terrain.Plain, Biome.Desert));
    expect(h(Terrain.Plain, Biome.SteppeSavanna)).toBeGreaterThan(
      h(Terrain.HighMountain, Biome.SteppeSavanna),
    );
    expect(h(Terrain.Plain, Biome.Ice)).toBe(0);
  });

  it('favorise les fleuves', () => {
    expect(h(Terrain.Plain, Biome.Desert, MapFlag.River)).toBeGreaterThan(
      h(Terrain.Plain, Biome.Desert),
    );
  });
});

describe('répartition de la population et du PIB', () => {
  const grid = makeGrid(240);
  const n = grid.width * grid.height;
  const terrain = new Uint8Array(n).fill(Terrain.Plain);
  const biome = new Uint8Array(n).fill(Biome.TemperateForest);
  const urban = new Uint8Array(n);
  const flags = new Uint16Array(n);
  const unitOf = new Uint16Array(n);
  for (let p = 0; p < n; p++) unitOf[p] = p % grid.width < grid.width / 2 ? 1 : 2;
  // Unité 2 : moitié désertique, un pixel de mer.
  for (let p = 0; p < n; p++)
    if (unitOf[p] === 2 && (p / grid.width) % 2 < 1) biome[p] = Biome.Desert;
  const sea = pixelOf(grid, 60, 0);
  terrain[sea] = Terrain.Sea;
  const city = pixelOf(grid, -60, 20);
  urban[pixelOf(grid, -30, -10)] = 255;
  const totals = new Map<number, UnitTotals>([
    [1, { population: 50e6, gdp: 2e6, urbanShare: 0.7 }],
    // Aucune ville ni zone urbaine : la part urbaine est reportée sur le rural.
    [2, { population: 8e6, gdp: 1e5, urbanShare: 0.4 }],
    // Unité sans pixel : signalée.
    [3, { population: 1e6, gdp: 1e4, urbanShare: 0.5 }],
  ]);
  const result = distributePopulation({
    grid,
    terrain,
    biome,
    urban,
    flags,
    unitOf,
    cities: [{ pixel: city, population: 10e6 }],
    totals,
    config,
  });

  it('conserve exactement les totaux de chaque unité', () => {
    expect(result.maxRelativeError).toBeLessThan(1e-9);
    for (const u of [1, 2]) {
      let pop = 0;
      let gdp = 0;
      for (let p = 0; p < n; p++) {
        if (unitOf[p] !== u) continue;
        pop += result.population[p] as number;
        gdp += result.economicValue[p] as number;
      }
      expect(pop / (totals.get(u)?.population as number)).toBeCloseTo(1, 9);
      expect(gdp / (totals.get(u)?.gdp as number)).toBeCloseTo(1, 9);
    }
    expect(result.unplaced).toEqual([3]);
  });

  it('ne produit ni valeur négative, ni NaN, ni habitant en mer', () => {
    for (let p = 0; p < n; p++) {
      const pop = result.population[p] as number;
      const gdp = result.economicValue[p] as number;
      expect(Number.isFinite(pop) && pop >= 0 && Number.isFinite(gdp) && gdp >= 0).toBe(true);
    }
    expect(result.population[sea]).toBe(0);
  });

  it('concentre la population dans les villes et les zones urbaines, et la valeur par habitant', () => {
    const rural = pixelOf(grid, -150, -40);
    expect(result.population[city]).toBeGreaterThan(10 * (result.population[rural] as number));
    expect(result.population[pixelOf(grid, -30, -10)]).toBeGreaterThan(
      10 * (result.population[rural] as number),
    );
    const perCapita = (p: number) =>
      (result.economicValue[p] as number) / (result.population[p] as number);
    expect(perCapita(city)).toBeGreaterThan(perCapita(rural));
    // Unité 2 : les déserts sont moins peuplés que les forêts.
    const forest = pixelOf(grid, 120, 30);
    const other = forest + grid.width;
    const [f, d] = biome[forest] === Biome.Desert ? [other, forest] : [forest, other];
    expect(result.population[f]).toBeGreaterThan(result.population[d] as number);
  });
});
