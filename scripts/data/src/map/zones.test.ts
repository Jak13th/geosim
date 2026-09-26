import { Terrain } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import type { Position, ShapeFeature } from '../io/shapefile.ts';
import { makeGrid, pixelOf } from './grid.ts';
import { applyControlZones, parseControlZones } from './zones.ts';

const provenance = { source: 'test', date: '2026-09-25', confidence: 'medium' };
const box = (w: number, s: number, e: number, n: number): Position[][] => [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
];
const feature = (properties: Record<string, unknown>, coordinates: Position[][] | null) => ({
  type: 'Feature',
  properties: { ...provenance, ...properties },
  geometry: coordinates === null ? null : { type: 'Polygon', coordinates },
});
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

describe('lecture des zones de contrôle', () => {
  it('lit contrôleur, souverain, filtres et géométries', () => {
    const [zone] = parseControlZones(
      collection(
        feature({ id: 'z', controller: 'B', within: ['A'], admin1: ['XX-01'] }, box(0, 0, 1, 1)),
      ),
    );
    expect(zone).toMatchObject({
      id: 'z',
      controller: 'B',
      sovereign: null,
      within: ['A'],
      admin1: ['XX-01'],
    });
    expect(zone?.polygons).toHaveLength(1);
  });

  it('refuse les zones incomplètes ou en double', () => {
    const ok = feature({ id: 'z', controller: 'B' }, box(0, 0, 1, 1));
    expect(() => parseControlZones(collection(ok, ok))).toThrow(/double/);
    expect(() => parseControlZones(collection(feature({ id: 'z' }, box(0, 0, 1, 1))))).toThrow(
      /controller ou sovereign/,
    );
    expect(() =>
      parseControlZones(collection(feature({ id: 'z', controller: 'B' }, null))),
    ).toThrow(/géométrie/);
    const noSource = { ...ok, properties: { id: 'z', controller: 'B' } };
    expect(() => parseControlZones(collection(noSource))).toThrow(/provenance/);
  });
});

describe('application des zones sur la grille', () => {
  const grid = makeGrid(360);
  const n = grid.width * grid.height;
  const setup = () => {
    const terrain = new Uint8Array(n).fill(Terrain.Plain);
    const owner = new Uint16Array(n);
    // A (1) à l'ouest du méridien d'origine, C (3) à l'est.
    for (let j = 0; j < grid.height; j++) {
      for (let i = 0; i < grid.width; i++) owner[j * grid.width + i] = i < grid.width / 2 ? 1 : 3;
    }
    return { terrain, owner, sovereign: owner.slice() };
  };
  const index = new Map([
    ['A', 1],
    ['B', 2],
    ['C', 3],
  ]);

  it('change le contrôle dans la zone seulement, et le souverain selon le filtre within', () => {
    const { terrain, owner, sovereign } = setup();
    const zones = parseControlZones(
      collection(
        feature({ id: 'occupation', controller: 'B' }, box(-40, 0, -20, 20)),
        feature({ id: 'annexion', sovereign: 'C', within: ['A'] }, box(-10, 0, 10, 10)),
      ),
    );
    const results = applyControlZones(grid, terrain, owner, sovereign, zones, index, [], []);
    expect(results.map((r) => r.missing)).toEqual([[], []]);
    expect(results[0]?.pixels).toBeGreaterThan(0);
    expect(results[0]?.areaPx).toBeGreaterThan(0);
    const inside = pixelOf(grid, -30, 10);
    expect(owner[inside]).toBe(2);
    expect(sovereign[inside]).toBe(1);
    expect(owner[pixelOf(grid, -60, 10)]).toBe(1);
    // Zone « annexion » : seuls les pixels contrôlés par A changent de souverain.
    expect(sovereign[pixelOf(grid, -5, 5)]).toBe(3);
    expect(owner[pixelOf(grid, -5, 5)]).toBe(1);
    expect(sovereign[pixelOf(grid, 5, 5)]).toBe(3);
    expect(owner[pixelOf(grid, 5, 5)]).toBe(3);
  });

  it('résout les subdivisions et signale les références introuvables', () => {
    const { terrain, owner, sovereign } = setup();
    const admin1: ShapeFeature[] = [
      {
        properties: { iso_3166_2: 'XX-01' },
        geometry: { type: 'Polygon', coordinates: box(-80, -20, -60, 0) },
      },
    ];
    const zones = parseControlZones(
      collection(
        { ...feature({ id: 'province', controller: 'B', admin1: ['XX-01'] }, null) },
        feature({ id: 'inconnue', controller: 'Z', admin1: ['XX-99'] }, box(-40, 0, -20, 20)),
      ),
    );
    const results = applyControlZones(grid, terrain, owner, sovereign, zones, index, [], admin1);
    expect(results[0]?.missing).toEqual([]);
    expect(owner[pixelOf(grid, -70, -10)]).toBe(2);
    expect(results[1]?.missing).toEqual(['entité « Z »', 'subdivision « XX-99 »']);
  });

  it("n'attribue aucun pixel d'eau", () => {
    const { terrain, owner, sovereign } = setup();
    const water = pixelOf(grid, -30, 10);
    terrain[water] = Terrain.Sea;
    owner[water] = 0;
    const zones = parseControlZones(
      collection(feature({ id: 'z', controller: 'B' }, box(-40, 0, -20, 20))),
    );
    applyControlZones(grid, terrain, owner, sovereign, zones, index, [], []);
    expect(owner[water]).toBe(0);
  });
});
