import { describe, expect, it } from 'vitest';
import { dataYear, sourceName, sourcePrefix, splitLinks } from './provenance.ts';

describe('provenance', () => {
  it('nomme la source depuis sa référence', () => {
    expect(sourcePrefix('WB:SP.POP.TOTL')).toBe('WB');
    expect(sourceName('WB:SP.POP.TOTL')).toBe('Banque mondiale');
    expect(sourceName('CUR:blocs.yaml (https://www.nato.int)')).toBe('Donnée curée');
    expect(sourceName('MED:eco.gini')).toBe('Médiane régionale');
    expect(sourceName('inconnue')).toBe('inconnue');
  });

  it('extrait l’année d’une date', () => {
    expect(dataYear('2025')).toBe('2025');
    expect(dataYear('2026-09-25')).toBe('2026');
  });

  it('repère les liens dans un texte', () => {
    expect(splitLinks('voir https://a.org/x (consulté) et fin')).toEqual([
      { text: 'voir ', href: null },
      { text: 'https://a.org/x', href: 'https://a.org/x' },
      { text: ' (consulté) et fin', href: null },
    ]);
    expect(splitLinks('sans lien')).toEqual([{ text: 'sans lien', href: null }]);
  });
});
