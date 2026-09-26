import { describe, expect, it } from 'vitest';
import { loadModelTree } from '../test/fixture.ts';
import { REQUIRED_COEFFICIENTS } from './engine.ts';
import { Model, checkModel, coefficientTree } from './model.ts';

describe('coefficients du modèle', () => {
  it('config/model.yaml contient chaque coefficient requis par les systèmes, bien formé', () => {
    const tree = loadModelTree();
    expect(checkModel(tree, REQUIRED_COEFFICIENTS)).toEqual([]);
    expect(REQUIRED_COEFFICIENTS.length).toBeGreaterThan(100);
  });

  it('signale un coefficient requis absent', () => {
    const errors = checkModel({ economy: {} }, ['economy.labor.okun']);
    expect(errors).toEqual(['economy.labor.okun : coefficient requis absent de config/model.yaml']);
    expect(() => new Model({ economy: {} }, ['economy.labor.okun'])).toThrow(/invalide/);
  });

  it('modifie une valeur dans sa plage seulement, et reconstruit l’arbre', () => {
    const model = new Model(loadModelTree(), REQUIRED_COEFFICIENTS);
    const before = model.get('economy.labor.okun');
    expect(model.set('economy.labor.okun', 0.5)).toBe(before);
    expect(model.get('economy.labor.okun')).toBe(0.5);
    expect(() => model.set('economy.labor.okun', 5)).toThrow(/hors de la plage/);
    expect(() => model.get('economy.inconnu')).toThrow(/absent/);
    const copy = new Model(model.tree(), REQUIRED_COEFFICIENTS);
    expect(copy.paths()).toEqual(model.paths());
    expect(copy.get('economy.labor.okun')).toBe(0.5);
  });

  it('ignore la version du fichier', () => {
    expect(Object.keys(coefficientTree({ version: 1, geo: {} }))).toEqual(['geo']);
    expect(() => coefficientTree([])).toThrow(/objet/);
  });
});
