/** Lecture de config/model.yaml et des fichiers curés YAML. */
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import {
  coefficient,
  validateCoefficients,
  type CoefficientTree,
  type Confidence,
} from '@geosim/shared';

export interface ModelConfig {
  tree: CoefficientTree;
  /** Valeur d'un coefficient, ex. `geo.terrain.hills_min_relief`. */
  get(path: string): number;
}

export function parseModelConfig(text: string): ModelConfig {
  const raw = parse(text) as Record<string, unknown> | null;
  if (raw === null || typeof raw !== 'object')
    throw new Error('config/model.yaml vide ou invalide');
  const { version: _version, ...families } = raw;
  const errors = validateCoefficients(families);
  if (errors.length > 0) {
    throw new Error(`config/model.yaml invalide :\n  ${errors.join('\n  ')}`);
  }
  const tree = families as CoefficientTree;
  return { tree, get: (path) => coefficient(tree, path) };
}

export async function loadModelConfig(path: string): Promise<ModelConfig> {
  return parseModelConfig(await readFile(path, 'utf8'));
}

/** Provenance obligatoire de toute valeur curée (CLAUDE.md, « Données »). */
export interface CuratedProvenance {
  source: string;
  date: string;
  confidence: Confidence;
  note?: string;
}

const CONFIDENCES: readonly string[] = ['high', 'medium', 'low', 'assumption'];

/** Vérifie qu'une entrée curée porte source, date (AAAA-MM-JJ) et niveau de confiance. */
export function checkProvenance(entry: unknown, where: string): CuratedProvenance {
  const e = entry as Partial<CuratedProvenance> | null;
  const problems: string[] = [];
  if (!e || typeof e.source !== 'string' || e.source.trim() === '') problems.push('source');
  if (!e || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date))
    problems.push('date');
  if (!e || typeof e.confidence !== 'string' || !CONFIDENCES.includes(e.confidence)) {
    problems.push('confidence');
  }
  if (problems.length > 0) {
    throw new Error(`${where} : provenance incomplète (${problems.join(', ')})`);
  }
  return e as CuratedProvenance;
}

export async function loadYaml(path: string): Promise<unknown> {
  return parse(await readFile(path, 'utf8')) as unknown;
}
