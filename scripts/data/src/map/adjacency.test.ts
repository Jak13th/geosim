import { Terrain } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { buildAdjacency, edgeLength } from './adjacency.ts';
import type { Grid } from './grid.ts';
import { flatTopology } from './gridops.ts';

describe('longueur des limites', () => {
  it('compte un côté de pixel pour une limite alignée sur la grille', () => {
    const w = 10;
    const inside = (r: number): boolean => r % w < 5; // demi-plan gauche
    expect(edgeLength(w, 10, inside, 5 * w + 4, 5 * w + 5)).toBeCloseTo(1, 6);
  });

  it('corrige l’escalier d’une limite diagonale (1/√2)', () => {
    const w = 20;
    const inside = (r: number): boolean => (r % w) + Math.floor(r / w) < 20;
    const p = 10 * w + 9; // i + j = 19 : dedans ; voisin de droite dehors
    expect(edgeLength(w, 20, inside, p, p + 1)).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe('voisinages', () => {
  // Grille 12 × 6 : A (cols 0–3) et B (cols 4–7) à terre, mer à droite (cols 8–11).
  const w = 12;
  const h = 6;
  const grid = { width: w, height: h, pixelSideKm: 10 } as Grid;
  const t = flatTopology(w, h);
  const globe = new Uint8Array(w * h).fill(1);
  const terrain = new Uint8Array(w * h);
  const owner = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      if (i < 8) {
        terrain[p] = Terrain.Plain;
        owner[p] = i < 4 ? 1 : 2;
      } else terrain[p] = Terrain.Sea;
    }
  }
  // C : une île au large, à 2 pixels de la côte de B.
  terrain[2 * w + 11] = Terrain.Plain;
  owner[2 * w + 11] = 3;
  const adjacency = buildAdjacency(grid, t, globe, terrain, owner, 3, 100);

  it('mesure la frontière terrestre A–B', () => {
    expect(adjacency.land).toEqual([{ a: 1, b: 2, km: 60 }]);
  });

  it('mesure les façades maritimes et détecte le voisinage maritime avec l’île', () => {
    expect(adjacency.coastlineKm[1]).toBe(0);
    expect(adjacency.coastlineKm[2]).toBe(60);
    expect(adjacency.maritime.map((m) => [m.a, m.b])).toEqual([[2, 3]]);
  });
});
