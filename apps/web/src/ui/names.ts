import { componentLabel } from '@geosim/shared';
import type { Dataset } from '../data/dataset.ts';
import { formatNumber, type ValueContext } from '../format.ts';

/**
 * Noms des éléments de listes : entités, blocs, détroits, conflits ; « produit:intensité »
 * (restrictions à l'export, revendications) en clair.
 */
export function namesFor(data: Dataset): ValueContext {
  const blocs = new Map(data.raw.world.blocs.map((b) => [b.id, b.nameFr]));
  const chokepoints = new Map(data.raw.world.chokepoints.map((c) => [c.id, c.nameFr]));
  const conflicts = new Map(data.raw.world.conflicts.map((c) => [c.id, c.nameFr]));
  const zones = new Map(data.raw.meta.controlZones.map((z) => [z.id, z.nameFr]));
  const one = (code: string): string | null =>
    data.byId.get(code)?.nameFr ??
    blocs.get(code) ??
    chokepoints.get(code) ??
    conflicts.get(code) ??
    zones.get(code) ??
    null;
  return {
    itemName(code) {
      const direct = one(code);
      if (direct !== null) return direct;
      const m = /^([^:]+):(-?\d+(?:\.\d+)?)$/.exec(code);
      if (m?.[1] !== undefined && m[2] !== undefined) {
        const key = m[1];
        return `${one(key) ?? componentLabel('', key)} (${formatNumber(Number(m[2]))})`;
      }
      return null;
    },
  };
}
