import { describe, expect, it } from 'vitest';
import { makeGrid } from './grid.ts';
import {
  CHAMFER_ORTHO,
  bfsFill,
  chamferDistance,
  flatTopology,
  labelPoints,
  makeTopology,
  neighbors4,
} from './gridops.ts';

describe('voisinage sur le globe', () => {
  it('relie le premier et le dernier pixel d’une ligne (antiméridien)', () => {
    const grid = makeGrid(256);
    const t = makeTopology(grid);
    const j = Math.floor(grid.height / 2);
    const left = j * grid.width + (t.left[j] as number);
    const right = j * grid.width + (t.right[j] as number);
    const out = new Int32Array(4);
    const k = neighbors4(t, left, out);
    expect(Array.from(out.subarray(0, k))).toContain(right);
  });

  it('ne sort pas du globe par le haut ou le bas', () => {
    const grid = makeGrid(256);
    const t = makeTopology(grid);
    const out = new Int32Array(4);
    const top = 0 * grid.width + (t.left[0] as number);
    const k = neighbors4(t, top, out);
    for (const q of out.subarray(0, k)) {
      const j = Math.floor(q / grid.width);
      const i = q - j * grid.width;
      expect(i >= (t.left[j] as number) && i <= (t.right[j] as number)).toBe(true);
    }
  });
});

describe('propagation sur une grille', () => {
  it('attribue chaque pixel à la source la plus proche, sans traverser les obstacles', () => {
    // 7 × 3, mur au milieu (colonne 3) sauf en bas.
    const t = flatTopology(7, 3);
    const mask = Uint8Array.from([1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const labels = new Int32Array(21);
    labels[0] = 1;
    labels[6] = 2;
    bfsFill(t, mask, labels);
    expect(labels[2]).toBe(1);
    expect(labels[4]).toBe(2);
    expect(labels[3]).toBe(0);
    expect(labels[17]).not.toBe(0); // passage par le bas du mur
  });

  it('approche la distance euclidienne (chanfrein 5-7-11) et respecte la borne', () => {
    const t = flatTopology(50, 50);
    const mask = new Uint8Array(2500).fill(1);
    const source = (): Int32Array => {
      const labels = new Int32Array(2500);
      labels[0] = 1;
      return labels;
    };
    const dist = chamferDistance(t, mask, source());
    for (const [x, y] of [
      [30, 40],
      [49, 20],
      [10, 45],
      [35, 35],
    ] as const) {
      const d = (dist[y * 50 + x] as number) / CHAMFER_ORTHO;
      expect(Math.abs(d - Math.hypot(x, y)) / Math.hypot(x, y)).toBeLessThan(0.025);
    }
    const bounded = chamferDistance(t, mask, source(), 10 * CHAMFER_ORTHO);
    expect(bounded[20]).toBe(-1);
    expect(bounded[10]).toBe(10 * CHAMFER_ORTHO);
  });

  it('ne coupe pas un coin en diagonale', () => {
    // Deux pixels d'eau reliés seulement par un coin : pas de passage.
    const t = flatTopology(2, 2);
    const mask = Uint8Array.from([1, 0, 0, 1]);
    const labels = Int32Array.from([1, 0, 0, 0]);
    expect(chamferDistance(t, mask, labels)[3]).toBe(-1);
  });

  it('place le point d’étiquette au cœur de la région', () => {
    const t = flatTopology(11, 11);
    const region = new Uint8Array(121);
    for (let j = 1; j < 10; j++) for (let i = 1; i < 10; i++) region[j * 11 + i] = 1;
    expect(labelPoints(t, region, 1)[1]).toBe(5 * 11 + 5);
  });
});
