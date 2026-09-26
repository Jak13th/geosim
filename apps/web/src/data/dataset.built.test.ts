/**
 * Invariants de l'interface sur les données construites par `npm run data` (ignorés sinon) :
 * chaque paramètre de chaque entité s'affiche avec sa source et sa date (critère de la phase 2),
 * chaque couche se construit sans couleur invalide, chaque entité a une emprise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  CATALOG,
  decodeLand,
  decodeMap,
  landIndex,
  type CountriesBase,
  type MapGeo,
  type MapMeta,
  type PairsBase,
  type WorldBaseFile,
} from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { LAYERS, buildLayer, indicatorOptions } from '../map/layers.ts';
import { Dataset } from './dataset.ts';
import type { RawData } from './load.ts';

const BUILD = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../data/build');
const RESOLUTION = 4096;
const built =
  existsSync(join(BUILD, 'countries.base.json')) &&
  existsSync(join(BUILD, 'map', `map-${RESOLUTION}.bin.gz`));

function arrayBuffer(path: string): ArrayBuffer {
  const b = gunzipSync(readFileSync(path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function load(): Dataset {
  const json = <T>(name: string): T => JSON.parse(readFileSync(join(BUILD, name), 'utf8')) as T;
  const grid = decodeMap(arrayBuffer(join(BUILD, 'map', `map-${RESOLUTION}.bin.gz`)));
  const land = decodeLand(arrayBuffer(join(BUILD, 'map', `land-${RESOLUTION}.bin.gz`)));
  const raw: RawData = {
    status: {
      ready: true,
      buildDate: null,
      mapBuildId: grid.header.buildId,
      resolution: RESOLUTION,
      maps: [],
      problem: null,
    },
    grid,
    meta: json<MapMeta>(`map/map-${RESOLUTION}.json`),
    geo: json<MapGeo>(`map/geo-${RESOLUTION}.json`),
    land: { layers: land.layers, index: landIndex(grid.layers.terrain) },
    countries: json<CountriesBase>('countries.base.json'),
    pairs: json<PairsBase>('pairs.base.json'),
    world: json<WorldBaseFile>('world.base.json'),
  };
  return new Dataset(raw);
}

describe.skipIf(!built)('interface sur les données construites', () => {
  const data = built ? load() : (null as unknown as Dataset);

  it('indexe toutes les entités de la carte', () => {
    expect(data.list.length).toBe(data.raw.meta.entities.length);
    for (const e of data.list) {
      expect(data.byIndex[e.index], e.id).toBe(e);
      expect(e.extent, e.id).not.toBeNull();
    }
  });

  it('affiche chaque paramètre pays avec sa source et sa date', () => {
    const runtimeWithoutValue = new Set<string>();
    for (const def of CATALOG.filter((d) => d.scope === 'country')) {
      for (const e of data.list) {
        const r = data.param(e, def.id);
        expect(r.state, `${e.id} ${def.id}`).not.toBe('absent');
        if (r.state === 'runtime') {
          runtimeWithoutValue.add(def.id);
          continue;
        }
        if (r.state === 'value') {
          expect(r.value.source.length, `${e.id} ${def.id}`).toBeGreaterThan(0);
          expect(r.value.date, `${e.id} ${def.id}`).toMatch(/^\d{4}/);
        }
      }
    }
    // Les seuls paramètres sans valeur sont les dérivés calculés par le moteur (phase 3+).
    for (const id of runtimeWithoutValue) expect(data.runtimeParams.has(id), id).toBe(true);
  });

  it('calcule le PIB par habitant de chaque entité', () => {
    for (const e of data.list) {
      const v = data.numeric(e, 'eco.gdp_per_capita');
      expect(v, e.id).not.toBeNull();
      expect(Number.isFinite(v)).toBe(true);
    }
    const fra = data.byId.get('FRA');
    expect(fra && data.numeric(fra, 'eco.gdp_per_capita')).toBeGreaterThan(20_000);
  });

  it('construit chaque couche et chaque indicateur sans couleur invalide', () => {
    const selected = data.byId.get('FRA')?.index ?? 0;
    const contexts = [
      ...LAYERS.map((l) => ({
        layer: l.id,
        indicator: 'pol.stability',
        bloc: 'military',
        selected,
      })),
      ...LAYERS.map((l) => ({
        layer: l.id,
        indicator: 'pol.stability',
        bloc: 'military',
        selected: 0,
      })),
      ...indicatorOptions(data).map((d) => ({
        layer: 'indicator' as const,
        indicator: d.id,
        bloc: 'military',
        selected: 0,
      })),
      ...data.raw.world.blocs.map((b) => ({
        layer: 'blocs' as const,
        indicator: 'pol.stability',
        bloc: b.id,
        selected: 0,
      })),
    ];
    expect(indicatorOptions(data).length).toBeGreaterThan(100);
    for (const ctx of contexts) {
      const view = buildLayer(data, ctx);
      expect(view.legend.items.length, `${ctx.layer} ${ctx.indicator}`).toBeGreaterThan(0);
      for (const x of view.palette.data)
        expect(Number.isInteger(x) && x >= 0 && x <= 255).toBe(true);
      for (const e of data.list) {
        const text = view.describe(e);
        if (text !== null) expect(text, `${ctx.layer} ${e.id}`).not.toMatch(/NaN|undefined/);
      }
    }
  });
});
