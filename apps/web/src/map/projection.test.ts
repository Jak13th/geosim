import { geoEqualEarth } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { makeProjector, splitAtAntimeridian } from './projection.ts';

// En-tête d'une carte 4096 px, avec le calcul d'échelle du pipeline (scripts/data/src/map/grid.ts).
const xMax = Math.abs(geoEqualEarth().scale(1).translate([0, 0])([180, 0])?.[0] ?? NaN);
const header = {
  width: 4096,
  height: 1994,
  projection: {
    type: 'equalEarth' as const,
    scale: 4096 / (2 * xMax),
    translate: [2048, 997] as [number, number],
  },
};

describe('projection de la carte', () => {
  const p = makeProjector(header);

  it('place l’origine au centre et l’équateur à mi-hauteur', () => {
    const [x, y] = p.project(0, 0) ?? [NaN, NaN];
    expect(x).toBeCloseTo(2048);
    expect(y).toBeCloseTo(997);
  });

  it('donne un globe presque aussi large que la carte à l’équateur, étroit aux pôles', () => {
    const equator = p.rowHalfWidth[997] ?? 0;
    expect(equator).toBeGreaterThan(2040);
    expect(equator).toBeLessThanOrEqual(2048.5);
    expect(p.rowHalfWidth[0] ?? 0).toBeLessThan(equator * 0.7);
    expect(p.rowHalfWidth[0]).toBeCloseTo(p.rowHalfWidth[1993] ?? 0, 3);
  });

  it('distingue le globe de l’espace autour', () => {
    expect(p.onGlobe(2048, 997)).toBe(true);
    expect(p.onGlobe(5, 5)).toBe(false);
    expect(p.onGlobe(2048, -1)).toBe(false);
  });

  it('découpe les routes qui franchissent l’antiméridien', () => {
    const parts = splitAtAntimeridian([
      [170, 10],
      [179, 12],
      [-179, 13],
      [-170, 15],
    ]);
    expect(parts).toEqual([
      [
        [170, 10],
        [179, 12],
      ],
      [
        [-179, 13],
        [-170, 15],
      ],
    ]);
    expect(splitAtAntimeridian([[0, 0]])).toEqual([]);
  });
});
