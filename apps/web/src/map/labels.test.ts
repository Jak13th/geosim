import { describe, expect, it } from 'vitest';
import { unitLabelPixels } from './labels.ts';

describe('points d’étiquette des unités', () => {
  it('place l’étiquette au cœur de chaque unité', () => {
    const w = 30;
    const h = 12;
    const unit = new Uint16Array(w * h);
    // Unité 1 : rectangle x 1–10 ; unité 2 : rectangle x 15–28 (plus grand).
    for (let y = 1; y < 11; y++) {
      for (let x = 1; x <= 10; x++) unit[y * w + x] = 1;
      for (let x = 15; x <= 28; x++) unit[y * w + x] = 2;
    }
    const labels = unitLabelPixels(unit, (p) => unit[p] !== 0, w, h, 3);
    const at = (u: number): [number, number] => {
      const p = labels[u] ?? -1;
      return [p % w, Math.floor(p / w)];
    };
    const [x1, y1] = at(1);
    expect(x1).toBeGreaterThanOrEqual(4);
    expect(x1).toBeLessThanOrEqual(7);
    expect(y1).toBeGreaterThanOrEqual(4);
    expect(y1).toBeLessThanOrEqual(7);
    const [x2] = at(2);
    expect(x2).toBeGreaterThanOrEqual(19);
    expect(x2).toBeLessThanOrEqual(24);
    expect(labels[3]).toBe(-1);
  });

  it('traite une unité voisine comme un bord', () => {
    const w = 20;
    const h = 5;
    const unit = new Uint16Array(w * h).fill(1);
    for (let y = 0; y < h; y++) for (let x = 10; x < w; x++) unit[y * w + x] = 2;
    const labels = unitLabelPixels(unit, () => true, w, h, 2);
    const x1 = (labels[1] ?? 0) % w;
    expect(x1).toBeGreaterThanOrEqual(3);
    expect(x1).toBeLessThanOrEqual(6);
  });
});
