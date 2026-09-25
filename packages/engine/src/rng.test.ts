import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed } from './rng.ts';

describe('Rng (xoshiro128**)', () => {
  it("reproduit l'implémentation C de référence", () => {
    // Vecteurs obtenus en compilant le code C de Blackman et Vigna, état initial {1, 2, 3, 4}.
    const rng = Rng.fromState([1, 2, 3, 4]);
    const out = Array.from({ length: 8 }, () => rng.nextU32());
    expect(out).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849,
    ]);
  });

  it("reproduit l'état de référence après 1001 tirages", () => {
    const rng = Rng.fromState([0xdeadbeef, 0x01234567, 0x89abcdef, 0x0badf00d]);
    for (let i = 0; i < 1000; i++) rng.nextU32();
    expect(rng.nextU32()).toBe(2776238660);
    expect(rng.getState()).toEqual([2943870112, 2457060070, 1409035132, 3277646748]);
  });

  it('est déterministe : même graine, même suite', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('reprend exactement depuis un état sauvegardé', () => {
    const a = new Rng(7);
    for (let i = 0; i < 10; i++) a.nextFloat();
    const b = Rng.fromState(a.getState());
    for (let i = 0; i < 50; i++) expect(b.nextFloat()).toBe(a.nextFloat());
  });

  it('donne des flux distincts par système', () => {
    expect(deriveSeed(1, 'economy')).not.toBe(deriveSeed(1, 'combat'));
    expect(Rng.forStream(1, 'economy').nextU32()).not.toBe(Rng.forStream(1, 'combat').nextU32());
  });

  it('reste dans ses bornes et ne produit ni NaN ni infini', () => {
    const rng = new Rng(123);
    for (let i = 0; i < 10_000; i++) {
      const f = rng.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
      const k = rng.nextInt(6);
      expect(Number.isInteger(k) && k >= 0 && k < 6).toBe(true);
      expect(Number.isFinite(rng.nextNormal())).toBe(true);
    }
  });

  it('a une moyenne et une variance plausibles', () => {
    const rng = new Rng(2026);
    const n = 20_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.nextNormal();
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sumSq / n - mean * mean - 1)).toBeLessThan(0.05);
  });

  it("refuse l'état nul", () => {
    expect(() => Rng.fromState([0, 0, 0, 0])).toThrow();
  });
});
