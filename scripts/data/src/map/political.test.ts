import { describe, expect, it } from 'vitest';
import type { Position, ShapeFeature } from '../io/shapefile.ts';
import { makeGrid } from './grid.ts';
import { makeTopology } from './gridops.ts';
import { buildEntities, type CuratedUnits } from './entities.ts';
import { rasterizePolitical } from './political.ts';

const prov = { source: 'test', date: '2026-09-25', confidence: 'high' as const };

function box(lon0: number, lat0: number, lon1: number, lat1: number): Position[][] {
  return [
    [
      [lon0, lat0],
      [lon0, lat1],
      [lon1, lat1],
      [lon1, lat0],
      [lon0, lat0],
    ],
  ];
}

function country(a3: string, rings: Position[][], label: [number, number]): ShapeFeature {
  return {
    geometry: { type: 'Polygon', coordinates: rings },
    properties: {
      ADM0_A3: a3,
      SOV_A3: a3,
      ADMIN: a3,
      SOVEREIGNT: a3,
      ISO_A3_EH: a3,
      TYPE: 'Sovereign country',
      LABEL_X: label[0],
      LABEL_Y: label[1],
    },
  };
}

describe('couches politiques', () => {
  const grid = makeGrid(512);
  const topology = makeTopology(grid);
  const features = [
    country('AAA', box(0, 0, 20, 20), [10, 10]),
    country('BBB', box(20, 0, 40, 20), [30, 10]),
    // Micro-État sans pixel, au milieu d'AAA.
    country('MIC', box(10.01, 10.01, 10.02, 10.02), [10.015, 10.015]),
    // Zone partagée entre AAA et BBB.
    country('SPL', box(15, 20, 25, 30), [20, 25]),
  ];
  const curated: CuratedUnits = {
    codes: {},
    kinds: {},
    promote: {},
    units: { SPL: { split: ['AAA', 'BBB'], ...prov } },
    capitals: {},
  };
  const table = buildEntities(features, curated);
  const political = rasterizePolitical(grid, topology, features, table);
  const index = (id: string) => table.entities.find((e) => e.id === id)?.index ?? -1;
  const count = (layer: Uint16Array, value: number) =>
    layer.reduce((s, v) => s + (v === value ? 1 : 0), 0);

  it('garantit un pixel au micro-État, pris à son voisin', () => {
    expect(count(political.owner, index('MIC'))).toBe(1);
    expect(political.forced).toHaveLength(1);
    expect(political.forced[0]?.takenFrom).toBe(table.units.find((u) => u.neA3 === 'AAA')?.index);
  });

  it('conserve le nombre total de pixels', () => {
    const total = Array.from(political.unitPixels).reduce((s, v, k) => s + (k === 0 ? 0 : v), 0);
    expect(total).toBe(political.unit.reduce((s, v) => s + (v !== 0 ? 1 : 0), 0));
    expect(political.overlaps).toBe(0);
  });

  it('partage une zone disputée entre les revendicateurs les plus proches', () => {
    const spl = table.units.find((u) => u.neA3 === 'SPL')?.index ?? -1;
    let a = 0;
    let b = 0;
    for (let p = 0; p < political.unit.length; p++) {
      if (political.unit[p] !== spl) continue;
      if (political.owner[p] === index('AAA')) a++;
      else if (political.owner[p] === index('BBB')) b++;
      else throw new Error('pixel partagé sans propriétaire');
    }
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(Math.abs(a - b) / (a + b)).toBeLessThan(0.15);
  });

  it('rasterise chaque unité à sa surface exacte près', () => {
    for (const u of table.units) {
      const exact = political.unitExactPixels[u.index] as number;
      if (exact < 500) continue;
      expect(Math.abs((political.unitPixels[u.index] as number) - exact) / exact).toBeLessThan(
        0.03,
      );
    }
  });
});
