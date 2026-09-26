/**
 * Chargement des données construites (data/build/) et des coefficients (config/model.yaml) pour
 * les simulations sans interface.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coefficientTree, type EngineData } from '@geosim/engine';
import type { CoefficientTree, CountriesBase, PairsBase, WorldBaseFile } from '@geosim/shared';
import { parse } from 'yaml';

export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
export const BUILD_DIR = join(ROOT, 'data', 'build');
export const MODEL_PATH = join(ROOT, 'config', 'model.yaml');

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`${path} absent : lance d'abord « npm run data »`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadData(buildDir = BUILD_DIR): EngineData {
  return {
    countries: readJson<CountriesBase>(join(buildDir, 'countries.base.json')),
    pairs: readJson<PairsBase>(join(buildDir, 'pairs.base.json')),
    world: readJson<WorldBaseFile>(join(buildDir, 'world.base.json')),
  };
}

export function loadModel(path = MODEL_PATH): CoefficientTree {
  return coefficientTree(parse(readFileSync(path, 'utf8')));
}
