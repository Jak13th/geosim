/** Validité des fichiers versionnés : config/model.yaml et fichiers curés (phases 1a et 1b). */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATALOG } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { loadYaml, parseModelConfig } from './config.ts';
import { loadCountryValues, parseDefaults } from './country/curated.ts';
import { loadEntitiesFile } from './country/entities.ts';
import { parseGeoZones } from './country/geozones.ts';
import { loadTopics } from './country/topics.ts';
import { parseControlZones } from './map/zones.ts';
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

describe('fichiers curés de la phase 1b', () => {
  const AI = CATALOG.filter((d) => d.id.startsWith('ai.') && d.valueType === 'number').map(
    (d) => d.id,
  );

  it('se chargent avec une provenance complète (source, date, confiance)', async () => {
    const topics = await loadTopics(CURATED_DIR);
    expect(topics.conflicts.length).toBeGreaterThan(20);
    const tables = await loadCountryValues(CURATED_DIR);
    expect(tables.size).toBeGreaterThan(20);
    const defaults = parseDefaults(await loadYaml(join(CURATED_DIR, 'defaults.yaml')));
    expect(defaults.rules.size).toBeGreaterThan(50);
    for (const file of ['separatism.geojson', 'fortifications.geojson', 'claims.geojson']) {
      expect(parseGeoZones(await loadYaml(join(CURATED_DIR, file)), file).length).toBeGreaterThan(
        0,
      );
    }
    const zones = parseControlZones(await loadYaml(join(CURATED_DIR, 'control_zones.geojson')));
    expect(zones.map((z) => z.id)).toContain('ukraine_occupied');
  });

  it('profils décisionnels : un profil complet et justifié par pays au niveau de détail complet', async () => {
    const [topics, entities] = await Promise.all([
      loadTopics(CURATED_DIR),
      loadEntitiesFile(CURATED_DIR),
    ]);
    expect(entities.fullDetail).toHaveLength(44);
    expect(Object.keys(topics.profiles).sort()).toEqual([...entities.fullDetail].sort());
    for (const [code, profile] of Object.entries(topics.profiles)) {
      expect(profile.confidence, code).toBe('assumption');
      expect(Object.keys(profile.values).sort(), code).toEqual([...AI].sort());
      expect(profile.strategic_goals.length, code).toBeGreaterThan(0);
      if (profile.opposition)
        expect(Object.keys(profile.opposition.values).sort(), code).toEqual([...AI].sort());
    }
  });

  it('relations initiales : bornées, justifiées, sans paire en double', async () => {
    const { relations } = await loadTopics(CURATED_DIR);
    const seen = new Set<string>();
    for (const r of relations) {
      const key = [r.a, r.b].sort().join('-');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
      expect(r.a).not.toBe(r.b);
      expect(r.why.trim().length, key).toBeGreaterThan(0);
      for (const v of [r.value, r.reverse ?? 0]) expect(Math.abs(v)).toBeLessThanOrEqual(100);
    }
  });
});
