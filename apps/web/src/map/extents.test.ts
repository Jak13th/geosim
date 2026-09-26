import { describe, expect, it } from 'vitest';
import { computeExtents } from './extents.ts';

function grid(width: number, height: number, paint: (x: number, y: number) => number): Uint16Array {
  const g = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) g[y * width + x] = paint(x, y);
  return g;
}

describe('emprises des entités', () => {
  it('encadre un territoire compact', () => {
    const w = 400;
    const h = 200;
    const owner = grid(w, h, (x, y) => (x >= 100 && x < 200 && y >= 50 && y < 150 ? 1 : 0));
    expect(computeExtents(owner, w, h, 1, () => null)[1]).toEqual([100, 50, 200, 150]);
  });

  it('écarte un territoire lointain, même grand, et garde les îles proches', () => {
    const w = 1000;
    const h = 200;
    const owner = grid(w, h, (x, y) => {
      if (x >= 500 && x < 600 && y >= 50 && y < 150) return 1; // territoire principal
      if (x >= 610 && x < 622 && y >= 60 && y < 72) return 1; // île proche (> 1 % du total)
      if (x >= 50 && x < 90 && y >= 100 && y < 150) return 1; // outre-mer : 17 % du total
      return 0;
    });
    const capital = 100 * w + 550;
    expect(computeExtents(owner, w, h, 1, () => capital)[1]).toEqual([500, 50, 622, 150]);
  });

  it('part de la composante de la capitale plutôt que de la plus grande', () => {
    const w = 600;
    const h = 200;
    const owner = grid(w, h, (x, y) => {
      if (x >= 10 && x < 200 && y >= 10 && y < 190) return 1; // grand territoire lointain
      if (x >= 500 && x < 540 && y >= 80 && y < 120) return 1; // territoire de la capitale
      return 0;
    });
    const e = computeExtents(owner, w, h, 1, () => 100 * w + 520)[1];
    expect(e).toEqual([500, 80, 540, 120]);
  });

  it('donne une taille minimale aux micro-États et rien aux entités sans pixel', () => {
    const w = 100;
    const h = 100;
    const owner = grid(w, h, (x, y) => (x === 50 && y === 50 ? 1 : 0));
    const extents = computeExtents(owner, w, h, 2, () => null);
    const e = extents[1] ?? [0, 0, 0, 0];
    expect(e[2] - e[0]).toBeGreaterThanOrEqual(40);
    expect(extents[2]).toBeNull();
  });
});
