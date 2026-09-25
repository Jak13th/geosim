/**
 * Couches physiques : eau (mer ou lac), altitude, terrain et biome.
 * Altitude et climat : WorldClim 2.1 à 5′ (≈ 9 km), échantillonné au centre des pixels.
 */
import { Biome, Terrain } from '@geosim/shared';
import type { ShapeFeature } from '../io/shapefile.ts';
import { localRelief, sampleNearestValid, type Raster } from '../io/tiff.ts';
import type { ModelConfig } from '../config.ts';
import { pixelLonLat, type Grid } from './grid.ts';
import {
  biomeThresholds,
  classifyBiome,
  classifyTerrain,
  terrainThresholds,
  type Climate,
} from './landcover.ts';
import { polygonRings, projectRings, scanPolygon } from './raster.ts';

export interface ClimateRasters {
  bio1: Raster;
  bio10: Raster;
  bio11: Raster;
  bio12: Raster;
  bio14: Raster;
}

export interface PhysicalLayers {
  terrain: Uint8Array;
  biome: Uint8Array;
  elevation: Int16Array;
  /** Pixels terrestres sans donnée WorldClim proche (altitude mise à 0). */
  missingElevation: number;
  /** Pixels terrestres sans climat proche (biome déduit de la latitude). */
  missingClimate: number;
}

/** Masque (0/1) des pixels couverts par un ensemble de polygones. */
export function polygonMask(grid: Grid, features: readonly ShapeFeature[]): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  for (const feature of features) {
    const rings = projectRings(grid, polygonRings(feature.geometry));
    scanPolygon(rings, grid.width, grid.height, (row, x0, x1) => {
      mask.fill(1, row * grid.width + x0, row * grid.width + x1);
    });
  }
  return mask;
}

export function buildPhysical(
  grid: Grid,
  globe: Uint8Array,
  unit: Uint16Array,
  inputs: {
    lakes: readonly ShapeFeature[];
    glaciers: readonly ShapeFeature[];
    wetlands: readonly ShapeFeature[];
    elevation: Raster;
    climate: ClimateRasters;
  },
  config: ModelConfig,
): PhysicalLayers {
  const n = grid.width * grid.height;
  const terrain = new Uint8Array(n);
  const biome = new Uint8Array(n);
  const elevation = new Int16Array(n);
  const lakeMask = polygonMask(grid, inputs.lakes);
  const iceMask = polygonMask(grid, inputs.glaciers);
  const wetMask = polygonMask(grid, inputs.wetlands);
  const relief = {
    ...inputs.elevation,
    data: localRelief(inputs.elevation, config.get('geo.terrain.relief_radius_cells')),
  };
  const tt = terrainThresholds(config);
  const bt = biomeThresholds(config);
  let missingElevation = 0;
  let missingClimate = 0;

  for (let j = 0; j < grid.height; j++) {
    for (let i = 0; i < grid.width; i++) {
      const p = j * grid.width + i;
      if (!globe[p]) continue;
      if (unit[p] === 0) {
        terrain[p] = lakeMask[p] ? Terrain.Lake : Terrain.Sea;
        continue;
      }
      const ll = pixelLonLat(grid, i, j);
      if (ll === null) continue;
      const [lon, lat] = ll;

      let elev = sampleNearestValid(inputs.elevation, lon, lat, 2);
      let rel = sampleNearestValid(relief, lon, lat, 2);
      if (Number.isNaN(elev)) {
        missingElevation++;
        elev = 0;
        rel = 0;
      }
      elevation[p] = Math.round(Math.max(-32768, Math.min(32767, elev)));
      terrain[p] = classifyTerrain(elev, rel, tt);

      if (iceMask[p]) {
        biome[p] = Biome.Ice;
        continue;
      }
      if (wetMask[p]) {
        biome[p] = Biome.Wetland;
        continue;
      }
      const climate =
        sampleClimate(inputs.climate, lon, lat, 3) ?? sampleClimate(inputs.climate, lon, lat, 12);
      if (climate === null) {
        missingClimate++;
        biome[p] = latitudeBiome(lat);
        continue;
      }
      biome[p] = classifyBiome(climate, bt);
    }
  }
  return { terrain, biome, elevation, missingElevation, missingClimate };
}

function sampleClimate(
  c: ClimateRasters,
  lon: number,
  lat: number,
  radius: number,
): Climate | null {
  const tAnnual = sampleNearestValid(c.bio1, lon, lat, radius);
  if (Number.isNaN(tAnnual)) return null;
  const values = {
    tAnnual,
    tWarmQuarter: sampleNearestValid(c.bio10, lon, lat, radius),
    tColdQuarter: sampleNearestValid(c.bio11, lon, lat, radius),
    pAnnual: sampleNearestValid(c.bio12, lon, lat, radius),
    pDriestMonth: sampleNearestValid(c.bio14, lon, lat, radius),
  };
  return Object.values(values).some(Number.isNaN) ? null : values;
}

/**
 * Repli documenté pour les rares pixels sans climat WorldClim à proximité (atolls isolés) :
 * forêt tropicale sous les tropiques, forêt tempérée ailleurs, toundra au-delà du cercle polaire.
 */
function latitudeBiome(lat: number): number {
  const a = Math.abs(lat);
  if (a < 23.44) return Biome.TropicalForest;
  if (a < 66.56) return Biome.TemperateForest;
  return Biome.Tundra;
}
