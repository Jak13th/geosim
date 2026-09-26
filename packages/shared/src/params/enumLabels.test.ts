import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog.ts';
import { ENUM_LABELS, componentLabel, enumLabel } from './enumLabels.ts';

describe('libellés des valeurs catégorielles', () => {
  it('couvrent chaque valeur de chaque paramètre catégoriel du catalogue', () => {
    for (const def of CATALOG.filter((d) => d.valueType === 'enum')) {
      for (const value of def.enumValues ?? []) {
        expect(ENUM_LABELS[def.id]?.[value], `${def.id} = ${value}`).toBeTruthy();
      }
    }
  });

  it('ne décrivent que des paramètres et des valeurs du catalogue', () => {
    for (const [id, labels] of Object.entries(ENUM_LABELS)) {
      const def = CATALOG.find((d) => d.id === id);
      expect(def?.valueType, id).toBe('enum');
      for (const value of Object.keys(labels)) expect(def?.enumValues, id).toContain(value);
    }
  });

  it('renvoie la valeur brute à défaut de libellé', () => {
    expect(enumLabel('pol.regime_type', 'junta')).toBe('Junte militaire');
    expect(enumLabel('pol.regime_type', 'inconnu')).toBe('inconnu');
  });
});

describe('libellés des composantes', () => {
  it('traduit les composantes connues et garde les autres', () => {
    expect(componentLabel('bud.defense_domains', 'air_defense')).toBe('Défense aérienne');
    expect(componentLabel('pair.distance', 'land')).toBe('Par voie de terre');
    expect(componentLabel('bud.defense_domains', 'land')).toBe('Terre');
    expect(componentLabel('geo.terrain_mix', 'biome:Désert')).toBe('Biome : Désert');
    expect(componentLabel('x', 'inconnue')).toBe('inconnue');
  });
});
