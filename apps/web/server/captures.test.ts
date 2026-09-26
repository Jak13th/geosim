import type { IncomingMessage } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isCaptureName } from '../src/api/contract.ts';
import { captureFile, captureHead, listCaptures, writeCapture } from './captures.ts';
import { checkWrite } from './http.ts';

describe('noms de capture', () => {
  it('accepte des noms simples, accents compris', () => {
    for (const name of ['avant-crise', 'Crise 2027', 'essai_1.2', 'été']) {
      expect(isCaptureName(name), name).toBe(true);
    }
  });
  it('refuse les chemins et les caractères spéciaux', () => {
    for (const name of [
      '',
      '../x',
      'a/b',
      'a\\b',
      '.cache',
      'x..y',
      'fin.',
      'a:b',
      'x'.repeat(81),
    ]) {
      expect(isCaptureName(name), name).toBe(false);
      expect(captureFile('/c', name)).toBeNull();
    }
    expect(captureFile('/c', 'ok')).toBe(join('/c', 'ok.json'));
  });
});

describe('fichiers de capture', () => {
  let dir = '';
  const content =
    '{"format":"geosim-capture","version":1,"engine":"0.3.0","dataId":"2026-09-25|abc","tick":42,"seed":1,"startDate":"2026-09-25","label":"Avant la crise","model":{}}';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'geosim-captures-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('lit les champs d’identification dans l’en-tête', () => {
    expect(captureHead(content)).toEqual({
      tick: 42,
      startDate: '2026-09-25',
      dataId: '2026-09-25|abc',
      label: 'Avant la crise',
    });
  });

  it('enregistre, liste et ignore ce qui n’est pas une capture', async () => {
    await writeCapture(dir, 'essai', content);
    await writeFile(join(dir, 'autre.json'), '{"x":1}');
    expect(await readFile(join(dir, 'essai.json'), 'utf8')).toBe(content);
    const list = await listCaptures(dir);
    expect(list.map((c) => c.name)).toEqual(['essai']);
    expect(list[0]?.tick).toBe(42);
    await expect(writeCapture(dir, 'x', '{"x":1}')).rejects.toThrow(/pas une capture/);
    await expect(writeCapture(dir, '../x', content)).rejects.toThrow(/refusé/);
  });

  it('liste vide si le dossier n’existe pas', async () => {
    expect(await listCaptures(join(dir, 'absent'))).toEqual([]);
  });
});

describe('garde des écritures', () => {
  const req = (headers: Record<string, string>): IncomingMessage =>
    ({ headers }) as unknown as IncomingMessage;
  it('exige l’en-tête du client et une origine locale', () => {
    expect(() => checkWrite(req({}))).toThrow(/en-tête/);
    expect(() => checkWrite(req({ 'x-geosim-client': '1' }))).not.toThrow();
    expect(() =>
      checkWrite(req({ 'x-geosim-client': '1', origin: 'http://localhost:5173' })),
    ).not.toThrow();
    expect(() =>
      checkWrite(req({ 'x-geosim-client': '1', origin: 'https://example.com' })),
    ).toThrow(/origine/);
  });
});
