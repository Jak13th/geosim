/**
 * Classes de terrain et de biome d'un pixel terrestre (SPEC §4.3). Tous les seuils viennent de
 * config/model.yaml (famille geo) ; équations détaillées dans docs/MODELES.md §1.
 */
import { Biome, Terrain, type BiomeId, type TerrainId } from '@geosim/shared';
import type { ModelConfig } from '../config.ts';

export interface TerrainThresholds {
  hillsMinRelief: number;
  mountainMinRelief: number;
  highMountainMinElevation: number;
}

export function terrainThresholds(config: ModelConfig): TerrainThresholds {
  return {
    hillsMinRelief: config.get('geo.terrain.hills_min_relief'),
    mountainMinRelief: config.get('geo.terrain.mountain_min_relief'),
    highMountainMinElevation: config.get('geo.terrain.high_mountain_min_elevation'),
  };
}

/** Terrain d'un pixel terrestre d'après son altitude et le relief local (max − min), en mètres. */
export function classifyTerrain(
  elevation: number,
  relief: number,
  t: TerrainThresholds,
): TerrainId {
  if (elevation >= t.highMountainMinElevation) return Terrain.HighMountain;
  if (relief >= t.mountainMinRelief) return Terrain.Mountain;
  if (relief >= t.hillsMinRelief) return Terrain.Hills;
  return Terrain.Plain;
}

/** Variables bioclimatiques WorldClim d'un pixel. */
export interface Climate {
  /** bio1 : température moyenne annuelle (°C). */
  tAnnual: number;
  /** bio10 : température moyenne du trimestre le plus chaud (°C). */
  tWarmQuarter: number;
  /** bio11 : température moyenne du trimestre le plus froid (°C). */
  tColdQuarter: number;
  /** bio12 : précipitations annuelles (mm). */
  pAnnual: number;
  /** bio14 : précipitations du mois le plus sec (mm). */
  pDriestMonth: number;
}

export interface BiomeThresholds {
  tundraMaxWarmQuarterTemp: number;
  aridSlope: number;
  aridIntercept: number;
  desertFactor: number;
  steppeFactor: number;
  tropicalMinColdQuarterTemp: number;
  rainforestMinDriestMonth: number;
  monsoonIntercept: number;
  monsoonDivisor: number;
  temperateSteppeMaxIndex: number;
  temperateSteppeMinAnnualTemp: number;
}

export function biomeThresholds(config: ModelConfig): BiomeThresholds {
  const g = (key: string): number => config.get(`geo.biome.${key}`);
  return {
    tundraMaxWarmQuarterTemp: g('tundra_max_warm_quarter_temp'),
    aridSlope: g('arid_threshold_slope'),
    aridIntercept: g('arid_threshold_intercept'),
    desertFactor: g('desert_factor'),
    steppeFactor: g('steppe_factor'),
    tropicalMinColdQuarterTemp: g('tropical_min_cold_quarter_temp'),
    rainforestMinDriestMonth: g('rainforest_min_driest_month'),
    monsoonIntercept: g('monsoon_intercept'),
    monsoonDivisor: g('monsoon_divisor'),
    temperateSteppeMaxIndex: g('temperate_steppe_max_index'),
    temperateSteppeMinAnnualTemp: g('temperate_steppe_min_annual_temp'),
  };
}

/**
 * Biome d'un pixel terrestre d'après une version simplifiée de la classification de
 * Köppen-Geiger (Kottek et al., 2006 ; Peel et al., 2007). La glace et les zones humides
 * viennent de polygones Natural Earth et sont traitées avant cet appel.
 *
 * Ordre : toundra (E) → désert (BW) → steppe (BS) → tropical (A : forêt si Af ou Am, savane
 * si Aw) → steppe tempérée (indice d'aridité estival, hors climats froids) → forêt tempérée
 * ou boréale (C, D).
 */
export function classifyBiome(c: Climate, t: BiomeThresholds): BiomeId {
  if (c.tWarmQuarter < t.tundraMaxWarmQuarterTemp) return Biome.Tundra;
  const threshold = Math.max(0, t.aridSlope * c.tAnnual + t.aridIntercept);
  if (c.pAnnual < t.desertFactor * threshold) return Biome.Desert;
  if (c.pAnnual < t.steppeFactor * threshold) return Biome.SteppeSavanna;
  if (c.tColdQuarter >= t.tropicalMinColdQuarterTemp) {
    const rainforest = c.pDriestMonth >= t.rainforestMinDriestMonth;
    const monsoon = c.pDriestMonth >= t.monsoonIntercept - c.pAnnual / t.monsoonDivisor;
    return rainforest || monsoon ? Biome.TropicalForest : Biome.SteppeSavanna;
  }
  if (
    c.tAnnual >= t.temperateSteppeMinAnnualTemp &&
    c.pAnnual / (c.tWarmQuarter + 10) < t.temperateSteppeMaxIndex
  ) {
    return Biome.SteppeSavanna;
  }
  return Biome.TemperateForest;
}
