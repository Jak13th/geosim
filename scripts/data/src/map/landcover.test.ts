import { readFile } from 'node:fs/promises';
import { Biome, Terrain } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { parseModelConfig } from '../config.ts';
import { MODEL_CONFIG_PATH } from '../paths.ts';
import {
  biomeThresholds,
  classifyBiome,
  classifyTerrain,
  terrainThresholds,
  type Climate,
} from './landcover.ts';

const config = parseModelConfig(await readFile(MODEL_CONFIG_PATH, 'utf8'));
const tt = terrainThresholds(config);
const bt = biomeThresholds(config);

describe('classes de terrain', () => {
  it('classe selon le relief local, et en haute montagne au-delà de l’altitude seuil', () => {
    expect(classifyTerrain(50, 20, tt)).toBe(Terrain.Plain);
    expect(classifyTerrain(1600, 40, tt)).toBe(Terrain.Plain); // hautes plaines (Denver)
    expect(classifyTerrain(400, 250, tt)).toBe(Terrain.Hills);
    expect(classifyTerrain(1500, 900, tt)).toBe(Terrain.Mountain);
    expect(classifyTerrain(4500, 100, tt)).toBe(Terrain.HighMountain); // Tibet, Altiplano
  });
});

describe('biomes (Köppen-Geiger simplifié)', () => {
  const climate = (c: Partial<Climate>): Climate => ({
    tAnnual: 12,
    tWarmQuarter: 19,
    tColdQuarter: 5,
    pAnnual: 700,
    pDriestMonth: 40,
    ...c,
  });

  it('reconnaît les grands biomes de sites connus', () => {
    // Paris : tempéré océanique.
    expect(classifyBiome(climate({}), bt)).toBe(Biome.TemperateForest);
    // Sahara (Tamanrasset) : désert.
    expect(
      classifyBiome(
        climate({ tAnnual: 22, tWarmQuarter: 28, tColdQuarter: 14, pAnnual: 45, pDriestMonth: 0 }),
        bt,
      ),
    ).toBe(Biome.Desert);
    // Amazonie (Manaus) : forêt tropicale.
    expect(
      classifyBiome(
        climate({
          tAnnual: 27,
          tWarmQuarter: 28,
          tColdQuarter: 26,
          pAnnual: 2300,
          pDriestMonth: 60,
        }),
        bt,
      ),
    ).toBe(Biome.TropicalForest);
    // Savane soudanienne : saison sèche marquée.
    expect(
      classifyBiome(
        climate({
          tAnnual: 27,
          tWarmQuarter: 30,
          tColdQuarter: 24,
          pAnnual: 1000,
          pDriestMonth: 0,
        }),
        bt,
      ),
    ).toBe(Biome.SteppeSavanna);
    // Steppe kazakhe (Astana) : Dfb pour Köppen, steppe par l'indice d'aridité estival.
    expect(
      classifyBiome(
        climate({
          tAnnual: 3.5,
          tWarmQuarter: 19.5,
          tColdQuarter: -14,
          pAnnual: 330,
          pDriestMonth: 12,
        }),
        bt,
      ),
    ).toBe(Biome.SteppeSavanna);
    // Taïga (Iakoutsk) : été assez chaud pour la forêt malgré une moyenne annuelle très basse.
    expect(
      classifyBiome(
        climate({
          tAnnual: -8.8,
          tWarmQuarter: 15,
          tColdQuarter: -35,
          pAnnual: 240,
          pDriestMonth: 8,
        }),
        bt,
      ),
    ).toBe(Biome.TemperateForest);
    // Toundra arctique.
    expect(
      classifyBiome(
        climate({
          tAnnual: -12,
          tWarmQuarter: 4,
          tColdQuarter: -28,
          pAnnual: 200,
          pDriestMonth: 8,
        }),
        bt,
      ),
    ).toBe(Biome.Tundra);
  });
});
