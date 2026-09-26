/**
 * Population et valeur économique par pixel (SPEC §4.3, §8.2).
 *
 * Pour chaque « unité statistique » (l'entité dont les statistiques couvrent le pixel : son
 * souverain de jure, ou l'entité de facto qui publie ses propres chiffres) :
 * - population urbaine = total × taux d'urbanisation, répartie selon des noyaux gaussiens
 *   autour des villes (masse = population de l'agglomération) et les zones urbaines Natural Earth ;
 * - population rurale = le reste, répartie selon l'habitabilité (biome × relief, bonus fleuve et
 *   côte) ;
 * - valeur économique = PIB × population du pixel × (1 + prime urbaine × part urbaine du pixel),
 *   normalisée.
 * Les totaux par unité sont conservés exactement (à l'arrondi flottant près).
 * Coefficients : `config/model.yaml`, famille `geo.population` ; équations : docs/MODELES.md §1.9.
 */
import { Biome, MapFlag, Terrain, isLand } from '@geosim/shared';
import type { ModelConfig } from '../config.ts';
import type { City } from './features.ts';
import type { Grid } from './grid.ts';

export interface UnitTotals {
  population: number;
  /** PIB annuel (millions de $). */
  gdp: number;
  /** Taux d'urbanisation (0–1). */
  urbanShare: number;
}

export interface PopulationInput {
  grid: Grid;
  terrain: Uint8Array;
  biome: Uint8Array;
  urban: Uint8Array;
  flags: Uint16Array;
  /** Unité statistique de chaque pixel (index d'entité, 0 = aucune). */
  unitOf: Uint16Array;
  cities: readonly Pick<City, 'pixel' | 'population'>[];
  /** Totaux par index d'entité. */
  totals: ReadonlyMap<number, UnitTotals>;
  config: ModelConfig;
}

export interface PopulationResult {
  /** Habitants par pixel (grille pleine ; 0 hors des terres). */
  population: Float64Array;
  /** Valeur économique par pixel (millions de $ de PIB annuel). */
  economicValue: Float64Array;
  /** Écart relatif maximal entre la somme des pixels et le total national. */
  maxRelativeError: number;
  /** Unités sans aucun pixel (population non répartie). */
  unplaced: number[];
}

export function habitability(
  config: ModelConfig,
  terrain: number,
  biome: number,
  flags: number,
): number {
  const c = (k: string): number => config.get(`geo.population.${k}`);
  const byBiome: Record<number, number> = {
    [Biome.TemperateForest]: c('habitability_temperate_forest'),
    [Biome.TropicalForest]: c('habitability_tropical_forest'),
    [Biome.SteppeSavanna]: c('habitability_steppe_savanna'),
    [Biome.Desert]: c('habitability_desert'),
    [Biome.Tundra]: c('habitability_tundra'),
    [Biome.Ice]: 0,
    [Biome.Wetland]: c('habitability_wetland'),
  };
  const byTerrain: Record<number, number> = {
    [Terrain.Plain]: 1,
    [Terrain.Hills]: c('terrain_factor_hills'),
    [Terrain.Mountain]: c('terrain_factor_mountain'),
    [Terrain.HighMountain]: c('terrain_factor_high_mountain'),
  };
  let h = (byBiome[biome] ?? 0) * (byTerrain[terrain] ?? 0);
  if (flags & MapFlag.River) h += c('river_bonus');
  if (flags & MapFlag.Coast) h *= c('coast_factor');
  return h;
}

export function distributePopulation(input: PopulationInput): PopulationResult {
  const { grid, terrain, biome, urban, flags, unitOf, cities, totals, config } = input;
  const n = grid.width * grid.height;
  const sigma1M = config.get('geo.population.city_kernel_sigma_km');
  const urbanDensity = config.get('geo.population.urban_area_density');
  const premium = config.get('geo.population.urban_productivity_premium');
  const pixelKm = grid.pixelSideKm;

  // Poids urbain : noyaux des villes + zones urbaines.
  const urbanW = new Float64Array(n);
  for (const city of cities) {
    const unit = unitOf[city.pixel] as number;
    if (unit === 0 || !(city.population > 0)) continue;
    const sigma = Math.max(0.5 * pixelKm, sigma1M * Math.sqrt(city.population / 1e6));
    const radius = Math.ceil((3 * sigma) / pixelKm);
    const j0 = Math.floor(city.pixel / grid.width);
    const i0 = city.pixel - j0 * grid.width;
    const cells: number[] = [];
    const weights: number[] = [];
    let sum = 0;
    for (let dj = -radius; dj <= radius; dj++) {
      const j = j0 + dj;
      if (j < 0 || j >= grid.height) continue;
      for (let di = -radius; di <= radius; di++) {
        let i = i0 + di;
        if (i < 0) i += grid.width;
        if (i >= grid.width) i -= grid.width;
        const p = j * grid.width + i;
        if (unitOf[p] !== unit || !isLand(terrain[p] as number)) continue;
        const d2 = (di * di + dj * dj) * pixelKm * pixelKm;
        const w = Math.exp(-d2 / (2 * sigma * sigma));
        cells.push(p);
        weights.push(w);
        sum += w;
      }
    }
    if (sum === 0) continue;
    for (let k = 0; k < cells.length; k++) {
      const p = cells[k] as number;
      urbanW[p] = (urbanW[p] as number) + (city.population * (weights[k] as number)) / sum;
    }
  }
  const areaKm2 = grid.pixelAreaKm2;
  for (let p = 0; p < n; p++) {
    if (unitOf[p] !== 0 && (urban[p] as number) > 0) {
      urbanW[p] = (urbanW[p] as number) + (urbanDensity * areaKm2 * (urban[p] as number)) / 255;
    }
  }

  // Poids rural : habitabilité.
  const ruralW = new Float64Array(n);
  const unitCount = Math.max(0, ...totals.keys()) + 1;
  const sumU = new Float64Array(unitCount);
  const sumR = new Float64Array(unitCount);
  const land = new Float64Array(unitCount);
  for (let p = 0; p < n; p++) {
    const u = unitOf[p] as number;
    if (u === 0 || u >= unitCount || !isLand(terrain[p] as number)) continue;
    ruralW[p] = habitability(config, terrain[p] as number, biome[p] as number, flags[p] as number);
    sumU[u] = (sumU[u] as number) + (urbanW[p] as number);
    sumR[u] = (sumR[u] as number) + (ruralW[p] as number);
    land[u] = (land[u] as number) + 1;
  }

  const population = new Float64Array(n);
  const urbanPop = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    const u = unitOf[p] as number;
    const t = totals.get(u);
    if (t === undefined || !isLand(terrain[p] as number)) continue;
    let urbanShare = Math.min(1, Math.max(0, t.urbanShare));
    if (!((sumU[u] as number) > 0)) urbanShare = 0;
    // Aucun pixel habitable (glace) : la population rurale est répartie uniformément.
    const rural =
      (sumR[u] as number) > 0
        ? (ruralW[p] as number) / (sumR[u] as number)
        : 1 / (land[u] as number);
    const up =
      urbanShare > 0
        ? (t.population * urbanShare * (urbanW[p] as number)) / (sumU[u] as number)
        : 0;
    urbanPop[p] = up;
    population[p] = up + t.population * (1 - urbanShare) * rural;
  }

  // Valeur économique.
  const econW = new Float64Array(n);
  const sumE = new Float64Array(unitCount);
  for (let p = 0; p < n; p++) {
    const u = unitOf[p] as number;
    if (!totals.has(u) || !((population[p] as number) > 0)) continue;
    const urbanFraction = (urbanPop[p] as number) / (population[p] as number);
    const w = (population[p] as number) * (1 + premium * urbanFraction);
    econW[p] = w;
    sumE[u] = (sumE[u] as number) + w;
  }
  const economicValue = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    const u = unitOf[p] as number;
    const t = totals.get(u);
    if (t === undefined || !((sumE[u] as number) > 0)) continue;
    economicValue[p] = (t.gdp * (econW[p] as number)) / (sumE[u] as number);
  }

  // Contrôle de conservation.
  const popSum = new Float64Array(unitCount);
  const gdpSum = new Float64Array(unitCount);
  for (let p = 0; p < n; p++) {
    const u = unitOf[p] as number;
    if (u === 0 || u >= unitCount) continue;
    popSum[u] = (popSum[u] as number) + (population[p] as number);
    gdpSum[u] = (gdpSum[u] as number) + (economicValue[p] as number);
  }
  let maxRelativeError = 0;
  const unplaced: number[] = [];
  for (const [u, t] of totals) {
    if (!((land[u] ?? 0) > 0)) {
      unplaced.push(u);
      continue;
    }
    if (t.population > 0) {
      maxRelativeError = Math.max(
        maxRelativeError,
        Math.abs((popSum[u] as number) - t.population) / t.population,
      );
    }
    if (t.gdp > 0) {
      maxRelativeError = Math.max(
        maxRelativeError,
        Math.abs((gdpSum[u] as number) - t.gdp) / t.gdp,
      );
    }
  }
  return { population, economicValue, maxRelativeError, unplaced };
}
