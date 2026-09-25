import { describe, expect, it } from 'vitest';
import {
  coefficient,
  isCoefficient,
  validateCoefficients,
  type CoefficientTree,
} from './coefficients.ts';

const ok = {
  value: 0.35,
  range: [0, 1] as [number, number],
  unit: '',
  description: 'Part transmise.',
};

describe('coefficients de modèle', () => {
  it('accepte un arbre bien formé et donne accès aux valeurs par chemin', () => {
    const tree: CoefficientTree = {
      economy: { trade_spillover: ok },
      geo: { terrain: { hills: { ...ok, value: 0.5 } } },
    };
    expect(validateCoefficients(tree)).toEqual([]);
    expect(coefficient(tree, 'geo.terrain.hills')).toBe(0.5);
  });

  it('signale une valeur hors plage, une plage inversée ou une description vide', () => {
    const errors = validateCoefficients({
      a: { ...ok, value: 2 },
      b: { ...ok, range: [1, 0], value: 0.5 },
      c: { ...ok, description: ' ' },
    });
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/a : 2 hors de la plage/);
    expect(errors.join('\n')).toMatch(/b : plage inversée/);
    expect(errors.join('\n')).toMatch(/c : description vide/);
  });

  it('signale un coefficient incomplet', () => {
    expect(validateCoefficients({ a: { value: 1 } })).toEqual([
      'a : il faut value, range [min, max], unit et description',
    ]);
    expect(isCoefficient({ value: 1, range: [0, 1], unit: 'm' })).toBe(false);
  });

  it('lève une erreur explicite pour un coefficient absent', () => {
    expect(() => coefficient({ geo: {} }, 'geo.terrain.hills')).toThrow(/geo\.terrain\.hills/);
  });
});
