/** Validité des fichiers versionnés : config/model.yaml et fichiers curés de la phase 1a. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadYaml, parseModelConfig } from './config.ts';
import { parseCuratedUnits } from './map/entities.ts';
import { chokepointErrors, parseChokepoints } from './map/routing.ts';
import { CURATED_DIR, MODEL_CONFIG_PATH } from './paths.ts';

describe('config/model.yaml', () => {
  it('est bien formé : chaque coefficient a valeur, plage, unité et description', async () => {
    const config = parseModelConfig(await readFile(MODEL_CONFIG_PATH, 'utf8'));
    expect(config.get('geo.terrain.hills_min_relief')).toBeGreaterThan(0);
    expect(() => config.get('geo.nexiste.pas')).toThrow();
  });

  it('refuse un coefficient hors de sa plage', () => {
    expect(() =>
      parseModelConfig(
        'version: 1\ngeo:\n  x:\n    value: 5\n    range: [0, 1]\n    unit: ""\n    description: "d"\n',
      ),
    ).toThrow(/hors de la plage/);
  });
});

describe('fichiers curés', () => {
  it('ne_units.yaml : structure et provenance complètes', async () => {
    const curated = parseCuratedUnits(await loadYaml(join(CURATED_DIR, 'ne_units.yaml')));
    expect(Object.keys(curated.kinds).sort()).toEqual(['CYN', 'ESH', 'SOL', 'TWN', 'XKX']);
  });

  it('chokepoints.yaml : les 17 passages de la SPEC, avec provenance', async () => {
    const chokepoints = parseChokepoints(await loadYaml(join(CURATED_DIR, 'chokepoints.yaml')));
    expect(chokepoints.map((c) => c.id)).toEqual([
      'hormuz',
      'bab_el_mandeb',
      'suez',
      'malacca',
      'singapore',
      'sunda',
      'lombok',
      'taiwan',
      'luzon',
      'turkish_straits',
      'gibraltar',
      'danish_straits',
      'dover',
      'panama',
      'kerch',
      'cape_of_good_hope',
      'drake',
    ]);
  });

  it('signale une porte qui ne franchit pas son passage', () => {
    const base = { id: 'x', gatePixels: 3, carvedPixels: 0, endpointsInWater: 0 };
    expect(
      chokepointErrors([{ ...base, openKm: 100, closedKm: 500, traversesGate: true }]),
    ).toEqual([]);
    expect(
      chokepointErrors([{ ...base, openKm: 100, closedKm: null, traversesGate: false }]),
    ).toHaveLength(1);
    expect(
      chokepointErrors([{ ...base, openKm: 100, closedKm: 90, traversesGate: true }]),
    ).toHaveLength(1);
    expect(
      chokepointErrors([
        {
          ...base,
          gatePixels: 0,
          endpointsInWater: 1,
          openKm: null,
          closedKm: null,
          traversesGate: false,
        },
      ]),
    ).toHaveLength(3);
  });
});
