import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentTypeOf, dataStatus, headField, resolveDataFile } from './dataFiles.ts';

describe('liste blanche des fichiers de données', () => {
  const dir = '/build';
  it('sert les fichiers de données et de carte attendus', () => {
    expect(resolveDataFile(dir, 'countries.base.json')).toBe('/build/countries.base.json');
    expect(resolveDataFile(dir, 'map-4096.bin.gz')).toBe('/build/map/map-4096.bin.gz');
    expect(resolveDataFile(dir, 'land-2048.bin.gz')).toBe('/build/map/land-2048.bin.gz');
    expect(resolveDataFile(dir, 'routes-8192.json')).toBe('/build/map/routes-8192.json');
  });
  it('refuse tout le reste, dont les chemins relatifs', () => {
    for (const name of [
      '../manifest.json',
      'map/../../secret',
      'report.md',
      'preview-political-4096.png',
      'map-4096.json/../x',
      '',
      'countries.base.json.bak',
    ]) {
      expect(resolveDataFile(dir, name), name).toBeNull();
    }
  });
  it('sert les archives sans les décompresser', () => {
    expect(contentTypeOf('map-4096.bin.gz')).toBe('application/octet-stream');
    expect(contentTypeOf('world.base.json')).toMatch(/^application\/json/);
  });
  it('lit un champ dans le début d’un JSON', () => {
    expect(headField('{"version":1,"buildId":"abc123","width":4', 'buildId')).toBe('abc123');
    expect(headField('{"version":1}', 'buildId')).toBeNull();
    expect(headField(null, 'buildId')).toBeNull();
  });
});

describe('état des données', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'geosim-data-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('signale des données absentes', async () => {
    const status = await dataStatus(join(dir, 'absent'));
    expect(status.ready).toBe(false);
    expect(status.problem).toMatch(/npm run data/);
  });

  it('retient la carte sur laquelle les données pays ont été construites', async () => {
    await mkdir(join(dir, 'map'), { recursive: true });
    await writeFile(
      join(dir, 'countries.base.json'),
      '{"version":1,"buildDate":"2026-09-26","mapBuildId":"bbb","entities":[]}',
    );
    await writeFile(join(dir, 'pairs.base.json'), '{}');
    await writeFile(join(dir, 'world.base.json'), '{}');
    for (const [res, id] of [
      [2048, 'aaa'],
      [4096, 'bbb'],
    ] as const) {
      await writeFile(join(dir, 'map', `map-${res}.json`), `{"version":1,"buildId":"${id}"}`);
      await writeFile(join(dir, 'map', `map-${res}.bin.gz`), '');
    }
    const incomplete = await dataStatus(dir);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.resolution).toBe(4096);
    expect(incomplete.problem).toMatch(/land/);

    await writeFile(join(dir, 'map', 'land-4096.bin.gz'), '');
    const status = await dataStatus(dir);
    expect(status).toMatchObject({
      ready: true,
      resolution: 4096,
      buildDate: '2026-09-26',
      mapBuildId: 'bbb',
      problem: null,
    });
    expect(status.maps.map((m) => m.resolution)).toEqual([2048, 4096]);
  });
});
