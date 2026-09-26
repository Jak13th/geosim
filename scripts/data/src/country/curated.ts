/**
 * Valeurs pays curées (`data/curated/country_*.yaml`) et hypothèses par défaut
 * (`data/curated/defaults.yaml`).
 *
 * Format d'un fichier `country_*.yaml` : une section par paramètre du catalogue, avec une
 * provenance commune (source, date, confiance, note) et une table de valeurs par code pays.
 * Une valeur peut porter sa propre provenance :
 *
 *   params:
 *     eco.credit_rating:
 *       source: https://…
 *       date: 2026-09-25
 *       confidence: medium
 *       values:
 *         USA: 19
 *         RUS: { value: 0, source: https://…, note: … }
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { paramById, type Confidence, type ParamValue } from '@geosim/shared';
import { checkProvenance, loadYaml, type CuratedProvenance } from '../config.ts';

export type { ParamValue };

export interface CuratedValue extends CuratedProvenance {
  value: ParamValue;
  /** Fichier d'origine (ex. `country_economy.yaml`). */
  file: string;
}

/** paramètre → code pays → valeur curée. */
export type CuratedTables = Map<string, Map<string, CuratedValue>>;

interface Section extends Partial<CuratedProvenance> {
  values?: Record<string, unknown>;
}

function isProvenanced(v: unknown): v is { value: ParamValue } & Partial<CuratedProvenance> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && 'value' in v;
}

export function parseCountryValues(raw: unknown, file: string, into: CuratedTables): void {
  const doc = raw as { version?: number; params?: Record<string, Section> };
  if (doc?.version !== 1) throw new Error(`${file} : version 1 attendue`);
  for (const [id, section] of Object.entries(doc.params ?? {})) {
    if (paramById(id) === undefined)
      throw new Error(`${file} › ${id} : paramètre absent du catalogue`);
    const values = section.values ?? {};
    let table = into.get(id);
    if (table === undefined) into.set(id, (table = new Map()));
    for (const [code, entry] of Object.entries(values)) {
      const where = `${file} › ${id}.${code}`;
      const own = isProvenanced(entry) ? entry : { value: entry as ParamValue };
      const merged = {
        source: own.source ?? section.source,
        date: own.date ?? section.date,
        confidence: own.confidence ?? section.confidence,
        ...((own.note ?? section.note) ? { note: own.note ?? section.note } : {}),
      };
      const provenance = checkProvenance(merged, where);
      if (table.has(code)) throw new Error(`${where} : valeur en double`);
      table.set(code, { ...provenance, value: own.value, file });
    }
  }
}

export async function loadCountryValues(curatedDir: string): Promise<CuratedTables> {
  const files = (await readdir(curatedDir)).filter((f) => /^country_.*\.yaml$/.test(f)).sort();
  const tables: CuratedTables = new Map();
  for (const file of files)
    parseCountryValues(await loadYaml(join(curatedDir, file)), file, tables);
  return tables;
}

/** Hypothèse par défaut d'un paramètre, éventuellement modulée par groupe de revenu ou régime. */
export interface DefaultRule {
  value: ParamValue;
  note: string;
  byIncome?: Record<string, ParamValue>;
  byRegime?: Record<string, ParamValue>;
  byKind?: Record<string, ParamValue>;
}

export interface Defaults {
  date: string;
  source: string;
  rules: Map<string, DefaultRule>;
}

export function parseDefaults(raw: unknown): Defaults {
  const doc = raw as {
    version?: number;
    date?: string;
    source?: string;
    params?: Record<
      string,
      {
        value?: ParamValue;
        note?: string;
        by_income?: Record<string, ParamValue>;
        by_regime?: Record<string, ParamValue>;
        by_kind?: Record<string, ParamValue>;
      }
    >;
  };
  if (doc?.version !== 1) throw new Error('defaults.yaml : version 1 attendue');
  checkProvenance(
    { source: doc.source, date: doc.date, confidence: 'assumption' },
    'defaults.yaml',
  );
  const rules = new Map<string, DefaultRule>();
  for (const [id, rule] of Object.entries(doc.params ?? {})) {
    if (paramById(id) === undefined)
      throw new Error(`defaults.yaml › ${id} : paramètre absent du catalogue`);
    if (rule.value === undefined || typeof rule.note !== 'string' || rule.note.trim() === '') {
      throw new Error(`defaults.yaml › ${id} : value et note (justification) obligatoires`);
    }
    rules.set(id, {
      value: rule.value,
      note: rule.note,
      ...(rule.by_income ? { byIncome: rule.by_income } : {}),
      ...(rule.by_regime ? { byRegime: rule.by_regime } : {}),
      ...(rule.by_kind ? { byKind: rule.by_kind } : {}),
    });
  }
  return { date: doc.date as string, source: doc.source as string, rules };
}

export const ASSUMPTION: Confidence = 'assumption';
