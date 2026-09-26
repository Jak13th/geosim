import { describe, expect, it } from 'vitest';
import { DIVERGING, POLITICAL, SEQUENTIAL, colorEntities, hex, oklch, ramp } from './colors.ts';

describe('couleurs de la carte', () => {
  it('convertit OKLCH en sRGB', () => {
    expect(oklch(1, 0, 0)).toEqual([255, 255, 255]);
    expect(oklch(0, 0, 0)).toEqual([0, 0, 0]);
    const red = oklch(0.628, 0.2577, 29.23);
    expect(red[0]).toBeGreaterThan(250);
    expect(red[1]).toBeLessThan(10);
  });

  it('interpole les rampes entre leurs jalons', () => {
    const r = ramp(['#000000', '#ffffff']);
    expect(r(0)).toEqual([0, 0, 0]);
    expect(r(1)).toEqual([255, 255, 255]);
    expect(r(-3)).toEqual([0, 0, 0]);
    expect(r(Number.NaN)).toEqual([0, 0, 0]);
    expect(SEQUENTIAL(1)).toEqual(hex('#fde725'));
    const mid = DIVERGING(0.5);
    expect(Math.abs(mid[0] - mid[1])).toBeLessThan(20);
  });

  it('donne des couleurs politiques distinctes', () => {
    expect(new Set(POLITICAL.map((c) => c.join(','))).size).toBe(POLITICAL.length);
  });

  it('ne donne jamais la même couleur à deux voisins', () => {
    // Graphe en roue : un centre voisin de 8 entités disposées en cercle.
    const ids = ['C', ...Array.from({ length: 8 }, (_, i) => `R${i}`)];
    const neighbors = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
    const link = (a: string, b: string): void => {
      neighbors.get(a)?.add(b);
      neighbors.get(b)?.add(a);
    };
    for (let i = 0; i < 8; i++) {
      link('C', `R${i}`);
      link(`R${i}`, `R${(i + 1) % 8}`);
    }
    const colors = colorEntities(ids, neighbors, 4);
    for (const [a, set] of neighbors)
      for (const b of set) expect(colors.get(a), `${a}–${b}`).not.toBe(colors.get(b));
    // Déterministe.
    expect(colorEntities(ids, neighbors, 4)).toEqual(colors);
  });
});
