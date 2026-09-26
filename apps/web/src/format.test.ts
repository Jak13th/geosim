import { paramById } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import {
  formatCount,
  formatDataDate,
  formatDate,
  formatNumber,
  formatQuantity,
  formatShort,
  formatValue,
} from './format.ts';

const ctx = { itemName: (code: string) => (code === 'FRA' ? 'France' : null) };
// Espaces insécables (U+00A0, U+202F) remplacées par des espaces pour lisibilité des attentes.
const plain = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ');

describe('mise en forme des valeurs', () => {
  it('adapte la précision à l’ordre de grandeur', () => {
    expect(plain(formatNumber(3596.09))).toBe('3 596');
    expect(formatNumber(48.1554)).toBe('48,2');
    expect(formatNumber(1.8)).toBe('1,8');
    expect(formatNumber(0.0456)).toBe('0,046');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('—');
  });

  it('écrit les grands effectifs en toutes lettres', () => {
    expect(plain(formatCount(68_720_337))).toBe('68,7 millions');
    expect(plain(formatCount(1_420_000_000))).toBe('1,42 milliard');
    expect(plain(formatCount(12_345))).toBe('12 345');
  });

  it('abrège pour les légendes', () => {
    expect(plain(formatShort(25_000))).toBe('25 k');
    expect(plain(formatShort(3.2e9))).toBe('3,2 Md');
    expect(formatShort(12)).toBe('12');
  });

  it('ajoute l’unité du catalogue', () => {
    expect(plain(formatQuantity(1.8, '%/an'))).toBe('1,8 %/an');
    expect(plain(formatQuantity(68_720_337, 'habitants'))).toBe('68,7 millions d’habitants');
    expect(plain(formatQuantity(2.5e6, 'personnes'))).toBe('2,5 millions de personnes');
    expect(formatQuantity(48.2, 'indice')).toBe('48,2');
    expect(plain(formatQuantity(1, 'multiplicateur'))).toBe('× 1');
    expect(plain(formatQuantity(12, 'cran'))).toBe('12 crans');
    expect(plain(formatQuantity(1, 'cran'))).toBe('1 cran');
  });

  it('écrit les dates en toutes lettres', () => {
    expect(formatDate('2027-04-11')).toBe('11 avril 2027');
    expect(formatDate('2026-09-01')).toBe('1er septembre 2026');
    expect(formatDate('2025')).toBe('2025');
    expect(formatDataDate('2024')).toBe('2024');
    expect(formatDataDate('2026-09-25')).toBe('25 septembre 2026');
  });

  it('met en forme chaque type de valeur', () => {
    expect(formatValue('junta', paramById('pol.regime_type'), ctx)).toBe('Junte militaire');
    expect(formatValue(true, paramById('geo.landlocked'), ctx)).toBe('Oui');
    expect(formatValue(['FRA', 'XYZ'], paramById('mil.overseas_bases'), ctx)).toBe('France, XYZ');
    expect(formatValue([], paramById('mil.overseas_bases'), ctx)).toBe('Aucun');
    expect(formatValue(null, paramById('eco.inflation'), ctx)).toBe('—');
    expect(formatValue('2027-04-11', paramById('pol.next_election'), ctx)).toBe('11 avril 2027');
  });
});
