import { paramById, type ParamDef } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { SLIDER_STEPS, parseNumber, roundSig, roundValue, sliderScale } from './sliders.ts';

function def(id: string): ParamDef {
  const d = paramById(id);
  if (d === undefined) throw new Error(id);
  return d;
}

describe('curseurs', () => {
  it('arrondit au pas du catalogue ou à quatre chiffres significatifs', () => {
    expect(roundSig(123456)).toBe(123500);
    expect(roundSig(0.000123456)).toBe(0.0001235);
    expect(roundValue(def('eco.inflation'), 2.345)).toBe(2.3);
    expect(roundValue(def('eco.inflation'), 0.1 + 0.2)).toBe(0.3);
    expect(roundValue(def('demo.population'), 68_123_456)).toBe(68_120_000);
    expect(roundValue(def('eco.inflation'), -50)).toBe(-10);
  });

  it('échelle linéaire sur les bornes du catalogue', () => {
    const d = def('bud.defense');
    const s = sliderScale(d, 2);
    expect(s.log).toBe(false);
    expect(s.toPos(d.min ?? 0)).toBe(0);
    expect(s.toPos(d.max ?? 0)).toBe(SLIDER_STEPS);
    expect(s.fromPos(s.toPos(3))).toBeCloseTo(3, 1);
  });

  it('échelle logarithmique pour la population et le PIB', () => {
    const s = sliderScale(def('demo.population'), 68e6);
    expect(s.log).toBe(true);
    expect(s.fromPos(0)).toBe(0);
    expect(s.fromPos(SLIDER_STEPS)).toBe(2e9);
    // Aller-retour à moins d'un cran près.
    const x = s.fromPos(s.toPos(68e6));
    expect(Math.abs(x - 68e6) / 68e6).toBeLessThan(0.02);
  });

  it('plage autour de la valeur de départ sans bornes au catalogue', () => {
    const { min: _min, max: _max, ...unbounded } = def('bud.defense');
    const s = sliderScale(unbounded, 5);
    expect(s.min).toBe(0);
    expect(s.max).toBe(20);
  });

  it('lit les nombres saisis à la française', () => {
    expect(parseNumber('2,5')).toBe(2.5);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});
