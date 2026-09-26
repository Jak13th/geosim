import { describe, expect, it } from 'vitest';
import type { EntityInfo } from './context.ts';
import { checkRules, clampToCatalog, groupMedian, type Pool } from './resolve.ts';

const entity = (id: string, region: string, income: string): EntityInfo => ({
  index: 0,
  id,
  name: id,
  nameFr: id,
  kind: 'state',
  detail: 'standard',
  region,
  income,
  classification: 'world_bank',
  parent: null,
});

describe('résolution des paramètres pays', () => {
  it('prévoit une règle pour chaque paramètre pays du catalogue', () => {
    expect(checkRules()).toEqual([]);
  });

  it('prend la médiane du groupe le plus proche comptant au moins trois pays', () => {
    const pool: Pool[] = [
      { entity: entity('A', 'SSF', 'LIC'), value: 1 },
      { entity: entity('B', 'SSF', 'LIC'), value: 2 },
      { entity: entity('C', 'SSF', 'LIC'), value: 30 },
      { entity: entity('D', 'ECS', 'HIC'), value: 100 },
    ];
    const target = entity('X', 'SSF', 'LIC');
    expect(groupMedian(pool, target)).toEqual({ value: 2, label: 'région SSF, revenu LIC', n: 3 });
    // L'entité elle-même n'entre pas dans son groupe : 2 pays seulement → repli sur le revenu.
    const self = entity('A', 'SSF', 'LIC');
    const r = groupMedian(pool, self);
    expect(r?.label).toBe('monde');
    expect(r?.value).toBe(30);
  });

  it('ne renvoie rien sans aucun pays comparable', () => {
    expect(groupMedian([], entity('X', 'SSF', 'LIC'))).toBeNull();
  });

  it('calcule la médiane des vecteurs par composante, renormalisée à la somme médiane', () => {
    const pool: Pool[] = ['A', 'B', 'C'].map((id, k) => ({
      entity: entity(id, 'EAS', 'UMC'),
      value: { plain: 50 + 10 * k, mountain: 50 - 10 * k },
    }));
    const r = groupMedian(pool, entity('X', 'EAS', 'UMC'));
    expect(r?.value).toEqual({ plain: 60, mountain: 40 });
  });

  it('écrête à la plage du catalogue en conservant la valeur source', () => {
    const r = {
      value: -1303,
      source: 'WB:x',
      date: '2024',
      confidence: 'high' as const,
      method: 'source' as const,
    };
    const c = clampToCatalog('eco.fdi_inflows', r);
    expect(c.value).toBe(-100);
    expect(c.clampedFrom).toBe(-1303);
    expect(c.note).toMatch(/écrêtée/);
    expect(clampToCatalog('eco.fdi_inflows', { ...r, value: 3 })).toEqual({ ...r, value: 3 });
  });
});
