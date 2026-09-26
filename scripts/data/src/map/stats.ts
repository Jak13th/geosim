/** Statistiques géographiques par entité (paramètres `geo.*` de source MAP). */
import { BIOME_LABELS, TERRAIN_LABELS, isLand, type EntityGeoStats } from '@geosim/shared';
import type { Grid } from './grid.ts';
import type { Access } from './routing.ts';

export function entityStats(
  grid: Grid,
  terrain: Uint8Array,
  biome: Uint8Array,
  owner: Uint16Array,
  sovereign: Uint16Array,
  coastlineKm: Float64Array,
  access: readonly Access[],
  ids: readonly string[],
  population: Float64Array,
  economicValue: Float64Array,
): EntityGeoStats[] {
  const count = ids.length;
  const pixels = new Int32Array(count + 1);
  const sovPixels = new Int32Array(count + 1);
  const terrainCounts = Array.from({ length: count + 1 }, () => new Int32Array(8));
  const biomeCounts = Array.from({ length: count + 1 }, () => new Int32Array(8));
  const pop = new Float64Array(count + 1);
  const sovPop = new Float64Array(count + 1);
  const econ = new Float64Array(count + 1);
  for (let p = 0; p < terrain.length; p++) {
    if (!isLand(terrain[p] as number)) continue;
    const o = owner[p] as number;
    const s = sovereign[p] as number;
    pixels[o] = (pixels[o] as number) + 1;
    sovPixels[s] = (sovPixels[s] as number) + 1;
    pop[o] = (pop[o] as number) + (population[p] as number);
    sovPop[s] = (sovPop[s] as number) + (population[p] as number);
    econ[o] = (econ[o] as number) + (economicValue[p] as number);
    increment(terrainCounts[o] as Int32Array, terrain[p] as number);
    increment(biomeCounts[o] as Int32Array, biome[p] as number);
  }
  const mix = (counts: Int32Array, total: number, labels: Readonly<Record<number, string>>) => {
    const out: Record<string, number> = {};
    counts.forEach((c, k) => {
      if (c > 0 && labels[k] !== undefined) out[labels[k]] = Math.round((1000 * c) / total) / 10;
    });
    return out;
  };
  const stats: EntityGeoStats[] = [];
  for (let e = 1; e <= count; e++) {
    const a = access[e - 1];
    const total = Math.max(1, pixels[e] as number);
    stats.push({
      pixels: pixels[e] as number,
      areaKm2: Math.round((pixels[e] as number) * grid.pixelAreaKm2),
      sovereignAreaKm2: Math.round((sovPixels[e] as number) * grid.pixelAreaKm2),
      coastlineKm: coastlineKm[e] as number,
      landlocked: !(a?.oceanAccess ?? false),
      seaAccess: a?.kind ?? 'none',
      transit: a?.transit ? (ids[a.transit - 1] ?? null) : null,
      terrainMix: mix(terrainCounts[e] as Int32Array, total, TERRAIN_LABELS),
      biomeMix: mix(biomeCounts[e] as Int32Array, total, BIOME_LABELS),
      population: Math.round(pop[e] as number),
      economicValue: Math.round(econ[e] as number),
      sovereignPopulation: Math.round(sovPop[e] as number),
    });
  }
  return stats;
}

function increment(counts: Int32Array, k: number): void {
  counts[k] = (counts[k] as number) + 1;
}
