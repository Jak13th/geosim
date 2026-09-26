import { describe, expect, it } from 'vitest';
import { makeScale, normalize, scaleTicks } from './scales.ts';

describe('échelles des choroplèthes', () => {
  it('résiste aux valeurs extrêmes', () => {
    const values = [...Array.from({ length: 100 }, (_, i) => i), 1e6];
    const s = makeScale(values, false);
    expect(s.max).toBeLessThan(200);
    expect(normalize(s, 1e6)).toBe(1);
    expect(normalize(s, -5)).toBe(0);
  });

  it('passe en logarithmique si le catalogue le demande', () => {
    const s = makeScale([0, 0, 1e3, 1e4, 1e5, 1e6, 1e7], true);
    expect(s.kind).toBe('log');
    expect(normalize(s, 0)).toBe(0);
    const mid = normalize(s, Math.sqrt(s.min * s.max));
    expect(mid).toBeCloseTo(0.5);
  });

  it('reste défini pour des valeurs toutes égales ou absentes', () => {
    const same = makeScale([5, 5, 5], false);
    expect(same.max).toBeGreaterThan(same.min);
    expect(Number.isFinite(normalize(same, 5))).toBe(true);
    const empty = makeScale([], true);
    expect(empty.kind).toBe('linear');
    expect(normalize(empty, Number.NaN)).toBe(0);
  });

  it('gradue avec des valeurs rondes dans le domaine', () => {
    expect(scaleTicks({ kind: 'linear', min: 0, max: 100 })).toEqual([0, 25, 50, 75, 100]);
    expect(scaleTicks({ kind: 'linear', min: 3, max: 17 }, 4)).toEqual([5, 10, 15]);
    expect(scaleTicks({ kind: 'log', min: 1, max: 10_000 })).toEqual([1, 10, 100, 1000, 10_000]);
    expect(scaleTicks({ kind: 'log', min: 2, max: 60 })).toEqual([2, 5, 10, 20, 50]);
  });
});
