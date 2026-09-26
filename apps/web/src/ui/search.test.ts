import { describe, expect, it } from 'vitest';
import { normalize, search, type Searchable } from './search.ts';

const items: Searchable[] = [
  { index: 1, id: 'FRA', nameFr: 'France', name: 'France', weight: 68e6 },
  { index: 2, id: 'CIV', nameFr: 'Côte d’Ivoire', name: "Côte d'Ivoire", weight: 31e6 },
  { index: 3, id: 'GUF', nameFr: 'Guinée', name: 'Guinea', weight: 14e6 },
  { index: 4, id: 'GNQ', nameFr: 'Guinée équatoriale', name: 'Equatorial Guinea', weight: 1.7e6 },
  {
    index: 5,
    id: 'PNG',
    nameFr: 'Papouasie-Nouvelle-Guinée',
    name: 'Papua New Guinea',
    weight: 10e6,
  },
  { index: 6, id: 'DEU', nameFr: 'Allemagne', name: 'Germany', weight: 84e6 },
];

describe('recherche de pays', () => {
  it('ignore la casse, les accents et la ponctuation', () => {
    expect(normalize('  Côte d’Ivoire ')).toBe('cote d ivoire');
    expect(search(items, 'cote').map((i) => i.id)).toEqual(['CIV']);
    expect(search(items, 'IVOIRE').map((i) => i.id)).toEqual(['CIV']);
  });

  it('classe le nom exact, puis le début de nom, puis un mot, puis le reste', () => {
    expect(search(items, 'guinee').map((i) => i.id)).toEqual(['GUF', 'GNQ', 'PNG']);
  });

  it('trouve par code et par nom anglais', () => {
    expect(search(items, 'deu').map((i) => i.id)).toEqual(['DEU']);
    expect(search(items, 'germ').map((i) => i.id)).toEqual(['DEU']);
  });

  it('ne renvoie rien pour une requête vide', () => {
    expect(search(items, '   ')).toEqual([]);
  });
});
