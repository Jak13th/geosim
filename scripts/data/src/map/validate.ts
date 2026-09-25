/**
 * Contrôles de cohérence de la carte construite. Chaque erreur arrête le pipeline.
 * Les écarts tolérés sont documentés dans docs/MODELES.md §1.
 */
import { Biome, NO_OWNER, isLand, type MapLayers } from '@geosim/shared';
import type { Grid } from './grid.ts';
import type { EntityTable } from './entities.ts';
import type { Capital } from './features.ts';
import type { PoliticalLayers } from './political.ts';

/** Écart relatif toléré entre la surface rasterisée et la surface exacte d'une grande unité. */
export const AREA_TOLERANCE = 0.02;
/** Taille (en pixels exacts) à partir de laquelle la tolérance de surface s'applique. */
export const AREA_CHECK_MIN_PIXELS = 1000;

/** Écart relatif entre surface rasterisée et surface exacte de chaque unité assez grande. */
export function areaErrors(
  table: EntityTable,
  political: PoliticalLayers,
): { neA3: string; exact: number; raster: number; error: number }[] {
  return table.units
    .map((u) => {
      const exact = political.unitExactPixels[u.index] as number;
      const raster = political.unitPixels[u.index] as number;
      return { neA3: u.neA3, exact, raster, error: exact > 0 ? (raster - exact) / exact : 0 };
    })
    .filter((r) => r.exact >= AREA_CHECK_MIN_PIXELS)
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
}

export function validateMap(
  grid: Grid,
  layers: MapLayers,
  table: EntityTable,
  political: PoliticalLayers,
  capitals: readonly Capital[],
): string[] {
  const errors: string[] = [];
  const n = grid.width * grid.height;
  const entityCount = table.entities.length;
  const owned = new Int32Array(entityCount + 1);
  let badLand = 0;
  let badWater = 0;
  for (let p = 0; p < n; p++) {
    const t = layers.terrain[p] as number;
    const o = layers.owner[p] as number;
    if (o > entityCount || (layers.sovereign[p] as number) > entityCount) {
      errors.push(`pixel ${p} : propriétaire hors limites`);
      break;
    }
    if (isLand(t)) {
      owned[o] = (owned[o] as number) + 1;
      if (layers.biome[p] === Biome.None || layers.unit[p] === 0) badLand++;
    } else if (o !== NO_OWNER || layers.unit[p] !== 0) {
      badWater++;
    }
  }
  if (badLand > 0) errors.push(`${badLand} pixels terrestres sans unité ou sans biome`);
  if (badWater > 0) errors.push(`${badWater} pixels d'eau avec un propriétaire`);

  for (const e of table.entities) {
    if ((owned[e.index] as number) === 0) errors.push(`${e.id} : aucun pixel`);
    if (!capitals.some((c) => c.entity === e.index)) errors.push(`${e.id} : pas de capitale`);
  }
  for (const c of capitals) {
    if (layers.owner[c.city.pixel] !== c.entity)
      errors.push(`capitale de l'entité ${c.entity} hors de son territoire`);
  }
  for (const r of areaErrors(table, political)) {
    if (Math.abs(r.error) > AREA_TOLERANCE) {
      errors.push(
        `${r.neA3} : surface rasterisée ${r.raster} px pour ${r.exact.toFixed(0)} px exacts (${(100 * r.error).toFixed(2)} %)`,
      );
    }
  }
  return errors;
}
