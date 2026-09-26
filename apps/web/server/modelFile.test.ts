import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MODEL_PATH,
  applyCoefficientChanges,
  parseModelText,
  readModelFile,
  saveCoefficients,
} from './modelFile.ts';

const SMALL = `# Commentaire d'en-tête
version: 1
economy:
  # Commentaire de famille
  cycle:
    persistence:
      value: 0.95
      range: [0, 0.99]
      unit: '/mois'
      description: "Persistance mensuelle de l'écart de production."
`;

describe('config/model.yaml', () => {
  it('le fichier du dépôt est valide et complet pour le moteur', async () => {
    const state = await readModelFile();
    expect(state.errors).toEqual([]);
    expect(state.tree).not.toBeNull();
    expect(state.path).toBe(join('config', 'model.yaml'));
  });

  it('signale les erreurs de syntaxe et de structure', () => {
    expect(parseModelText('economy: [').errors.length).toBeGreaterThan(0);
    const outOfRange = parseModelText(SMALL.replace('value: 0.95', 'value: 2'));
    expect(outOfRange.tree).toBeNull();
    expect(outOfRange.errors.some((e) => e.includes('hors de la plage'))).toBe(true);
    // Coefficients requis par les systèmes absents d'un fichier partiel.
    expect(parseModelText(SMALL).errors.some((e) => e.includes('requis absent'))).toBe(true);
  });

  it('modifie une valeur en conservant commentaires et mise en forme', () => {
    const out = applyCoefficientChanges(SMALL, [{ path: 'economy.cycle.persistence', value: 0.9 }]);
    expect(out).toBe(SMALL.replace('value: 0.95', 'value: 0.9'));
  });

  it('refuse un chemin inconnu ou une valeur hors plage', () => {
    expect(() =>
      applyCoefficientChanges(SMALL, [{ path: 'economy.cycle.inconnu', value: 1 }]),
    ).toThrow(/coefficient inconnu/);
    expect(() => applyCoefficientChanges(SMALL, [{ path: 'economy.cycle', value: 1 }])).toThrow(
      /coefficient inconnu/,
    );
    expect(() =>
      applyCoefficientChanges(SMALL, [{ path: 'economy.cycle.persistence', value: 1.5 }]),
    ).toThrow(/hors de la plage/);
  });

  describe('enregistrement', () => {
    let dir = '';
    let path = '';
    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'geosim-model-'));
      path = join(dir, 'model.yaml');
      await copyFile(MODEL_PATH, path);
    });
    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('ne change que la ligne de la valeur (mise en forme Prettier du dépôt)', async () => {
      const before = await readFile(path, 'utf8');
      const state = await saveCoefficients(
        [{ path: 'economy.cycle.persistence', value: 0.9 }],
        path,
      );
      const after = await readFile(path, 'utf8');
      const a = before.split('\n');
      const b = after.split('\n');
      expect(b.length).toBe(a.length);
      const changed = a.flatMap((line, k) => (line === b[k] ? [] : [[line, b[k]]]));
      expect(changed).toEqual([['      value: 0.95', '      value: 0.9']]);
      expect(state.errors).toEqual([]);
    });
  });
});
