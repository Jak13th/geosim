import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureSources, readManifest, recordVersion, type FetchLike } from './download.ts';
import type { SourceDef } from './sources.ts';

const source: SourceDef = {
  id: 'demo',
  url: 'https://example.org/data/demo.zip',
  provider: 'Test',
  description: 'Source de test',
  license: 'Domaine public',
  licenseUrl: 'https://example.org/licence',
  version: '1.0',
};

describe('téléchargements en cache', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'geosim-dl-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fakeFetch = (calls: string[], status = 200): FetchLike => {
    return async (url) => {
      calls.push(url);
      return {
        ok: status === 200,
        status,
        headers: {
          get: (name) => (name === 'last-modified' ? 'Tue, 01 Sep 2026 00:00:00 GMT' : null),
        },
        arrayBuffer: async () => new TextEncoder().encode('contenu').buffer as ArrayBuffer,
      };
    };
  };

  it('télécharge une fois, trace la source, puis fonctionne hors ligne', async () => {
    const calls: string[] = [];
    const options = {
      rawDir: join(dir, 'raw'),
      manifestPath: join(dir, 'manifest.json'),
      refresh: false,
      fetch: fakeFetch(calls),
      today: '2026-09-25',
    };
    const paths = await ensureSources([source], options);
    expect(calls).toEqual([source.url]);
    expect(await readFile(paths.get('demo') as string, 'utf8')).toBe('contenu');
    const manifest = await readManifest(options.manifestPath);
    expect(manifest.sources[0]).toMatchObject({
      id: 'demo',
      url: source.url,
      file: 'demo.zip',
      accessed: '2026-09-25',
      version: '1.0',
      bytes: 7,
      lastModified: 'Tue, 01 Sep 2026 00:00:00 GMT',
    });
    expect(manifest.sources[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Second passage : aucun accès réseau, même sans connexion.
    const offline: FetchLike = () => Promise.reject(new Error('hors ligne'));
    await ensureSources([source], { ...options, fetch: offline, today: '2026-10-01' });
    expect((await readManifest(options.manifestPath)).sources[0]?.accessed).toBe('2026-09-25');

    // --refresh : nouveau téléchargement et nouvelle date d'accès.
    await ensureSources([source], { ...options, refresh: true, today: '2026-10-02' });
    expect(calls).toHaveLength(2);
    expect((await readManifest(options.manifestPath)).sources[0]?.accessed).toBe('2026-10-02');

    await recordVersion(options.manifestPath, 'demo', '5.1.1');
    expect((await readManifest(options.manifestPath)).sources[0]?.version).toBe('5.1.1');
  });

  it('trace sans réseau un fichier déposé à la main', async () => {
    const rawDir = join(dir, 'raw');
    await ensureSources([source], {
      rawDir,
      manifestPath: join(dir, 'm.json'),
      refresh: false,
      fetch: fakeFetch([]),
      today: '2026-09-25',
    });
    await writeFile(join(dir, 'm.json'), '{"version":1,"description":"x","sources":[]}');
    const calls: string[] = [];
    await ensureSources([source], {
      rawDir,
      manifestPath: join(dir, 'm.json'),
      refresh: false,
      fetch: fakeFetch(calls),
      today: '2026-09-26',
    });
    expect(calls).toEqual([]);
    expect((await readManifest(join(dir, 'm.json'))).sources).toHaveLength(1);
  });

  it('échoue clairement sur une erreur HTTP', async () => {
    await expect(
      ensureSources([source], {
        rawDir: join(dir, 'raw'),
        manifestPath: join(dir, 'manifest.json'),
        refresh: false,
        fetch: fakeFetch([], 404),
        today: '2026-09-25',
      }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
