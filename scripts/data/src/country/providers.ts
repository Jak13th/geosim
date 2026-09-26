/**
 * Analyse des réponses des sources automatisées (SPEC §5.1) en séries par pays.
 * Les codes sont ramenés aux codes GeoSim (ISO 3166-1 alpha-3, XKX pour le Kosovo, PSE pour
 * la Palestine) ; les agrégats régionaux sont ignorés par la suite (aucune entité ne les porte).
 */
import { parseCsv } from '../io/csv.ts';
import { addObs, finalize, type Series } from './series.ts';

/** Codes non ISO de certaines sources → codes GeoSim. */
const CODE_ALIASES: Record<string, string> = {
  UVK: 'XKX', // FMI : Kosovo
  WBG: 'PSE', // FMI : Cisjordanie et Gaza
  OWID_KOS: 'XKX', // OWID : Kosovo
  KSV: 'XKX',
  XKV: 'XKX',
  S19: 'TWN', // BACI : « Other Asia, nes » = Taïwan (convention Comtrade)
};

export function geoCode(code: string): string {
  return CODE_ALIASES[code] ?? code;
}

// ——— Banque mondiale (API v2) ———

export interface WbCountryMeta {
  id: string;
  name: string;
  /** Région de la Banque mondiale (EAS, ECS, LCN, MEA, NAC, SAS, SSF), ou null. */
  region: string | null;
  /** Groupe de revenu (HIC, UMC, LMC, LIC), ou null. */
  income: string | null;
}

interface WbCountryRow {
  id: string;
  name: string;
  region: { id: string };
  incomeLevel: { id: string };
}

export function parseWbCountries(json: unknown): Map<string, WbCountryMeta> {
  const rows = (json as [unknown, WbCountryRow[]])[1] ?? [];
  const out = new Map<string, WbCountryMeta>();
  for (const row of rows) {
    if (row.region.id === 'NA') continue; // agrégat
    out.set(row.id, {
      id: row.id,
      name: row.name,
      region: row.region.id || null,
      income: ['HIC', 'UMC', 'LMC', 'LIC'].includes(row.incomeLevel.id) ? row.incomeLevel.id : null,
    });
  }
  return out;
}

/** Noms des pays de la base WGI → codes (certaines lignes de l'API WGI n'ont pas de code). */
export function parseWgiCountryNames(json: unknown): Map<string, string> {
  type Doc = { source: { concept: { id: string; variable: { id: string; value: string }[] }[] }[] };
  const out = new Map<string, string>();
  const concept = (json as Doc).source?.[0]?.concept.find((c) => c.id === 'country');
  for (const v of concept?.variable ?? []) out.set(v.value, v.id);
  return out;
}

interface WbRow {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

export interface WbSeries {
  series: Series;
  /** Date de dernière mise à jour annoncée par l'API. */
  lastUpdated: string | null;
}

export function parseWorldBank(json: unknown, wgiNames?: Map<string, string>): WbSeries {
  const doc = json as [{ lastupdated?: string; message?: unknown }, WbRow[] | null];
  if (!Array.isArray(doc) || !Array.isArray(doc[1])) {
    throw new Error(`Réponse Banque mondiale inattendue : ${JSON.stringify(json).slice(0, 200)}`);
  }
  const series: Series = new Map();
  for (const row of doc[1]) {
    if (row.value === null) continue;
    const code = row.countryiso3code || wgiNames?.get(row.country.value) || '';
    if (code === '') continue;
    addObs(series, geoCode(code), Number(row.date), Number(row.value));
  }
  return { series: finalize(series), lastUpdated: doc[0]?.lastupdated ?? null };
}

// ——— FMI (API DataMapper) ———

export function parseImf(json: unknown, indicator: string): Series {
  const values = (json as { values?: Record<string, Record<string, Record<string, number>>> })
    .values?.[indicator];
  if (values === undefined) throw new Error(`Réponse FMI sans valeurs pour ${indicator}`);
  const series: Series = new Map();
  for (const [code, byYear] of Object.entries(values)) {
    for (const [year, value] of Object.entries(byYear)) {
      if (value !== null) addObs(series, geoCode(code), Number(year), Number(value));
    }
  }
  return finalize(series);
}

/** Édition de chaque indicateur (ex. « World Economic Outlook (April 2026) »). */
export function parseImfEditions(json: unknown): Map<string, string> {
  const indicators = (json as { indicators?: Record<string, { source?: string }> }).indicators;
  const out = new Map<string, string>();
  for (const [code, info] of Object.entries(indicators ?? {})) {
    if (info.source) out.set(code, info.source);
  }
  return out;
}

// ——— Our World in Data ———

/** Graphique OWID (`entity,code,year,<colonne>`). */
export function parseOwidChart(text: string, column?: string): Series {
  const rows = parseCsv(text);
  const col =
    column ??
    Object.keys(rows[0] ?? {}).find((k) => !['entity', 'code', 'year', 'owid_region'].includes(k));
  if (col === undefined) throw new Error('Graphique OWID sans colonne de valeurs');
  const series: Series = new Map();
  for (const row of rows) {
    const code = row.code ?? '';
    const value = row[col] ?? '';
    if (code === '' || value === '' || (code.startsWith('OWID_') && !(code in CODE_ALIASES)))
      continue;
    addObs(series, geoCode(code), Number(row.year), Number(value));
  }
  return finalize(series);
}

/** Jeu de données énergie d'OWID : une série par colonne demandée. */
export function parseOwidEnergy(text: string, columns: readonly string[]): Map<string, Series> {
  const rows = parseCsv(text);
  const out = new Map<string, Series>(columns.map((c) => [c, new Map()]));
  for (const row of rows) {
    const code = row.iso_code ?? '';
    if (code === '' || (code.startsWith('OWID_') && !(code in CODE_ALIASES))) continue;
    for (const c of columns) {
      const value = row[c] ?? '';
      if (value !== '')
        addObs(out.get(c) as Series, geoCode(code), Number(row.year), Number(value));
    }
  }
  for (const s of out.values()) finalize(s);
  return out;
}

// ——— HCR ———

interface UnhcrRow {
  year: number;
  coa_iso: string;
  coo_iso: string;
  refugees: number | string;
  oip: number | string;
}

/**
 * Réfugiés sous mandat du HCR + autres personnes ayant besoin d'une protection internationale,
 * par pays d'accueil (`by = 'asylum'`) ou d'origine (`by = 'origin'`).
 */
export function parseUnhcr(json: unknown, by: 'asylum' | 'origin'): Series {
  const items = (json as { items?: UnhcrRow[]; maxPages?: number }).items;
  if (!Array.isArray(items)) throw new Error('Réponse HCR inattendue');
  if (((json as { maxPages?: number }).maxPages ?? 1) > 1) {
    throw new Error('Réponse HCR paginée : augmenter `limit`');
  }
  const series: Series = new Map();
  const n = (v: number | string): number => (typeof v === 'number' ? v : Number(v) || 0);
  for (const row of items) {
    const code = by === 'asylum' ? row.coa_iso : row.coo_iso;
    if (!code || code === '-') continue;
    addObs(series, geoCode(code), row.year, n(row.refugees) + n(row.oip));
  }
  return finalize(series);
}

// ——— Points idéaux de l'AGNU ———

export function parseUngaIdealPoints(text: string): Series {
  const series: Series = new Map();
  for (const row of parseCsv(text)) {
    const code = row.iso3c ?? '';
    const value = row.IdealPointFP ?? '';
    if (code === '' || code === 'NA' || value === '' || value === 'NA') continue;
    addObs(series, geoCode(code), Number(row.year), Number(value));
  }
  return finalize(series);
}

// ——— PNUD ———

/** Fichier des indices composites (format large : colonnes `hdi_1990` … `hdi_2023`). */
export function parseUndpHdi(text: string): Series {
  const series: Series = new Map();
  for (const row of parseCsv(text)) {
    const code = row.iso3 ?? '';
    if (code.length !== 3) continue;
    for (const [key, value] of Object.entries(row)) {
      const m = /^hdi_(\d{4})$/.exec(key);
      if (m && value !== '') addObs(series, geoCode(code), Number(m[1]), Number(value));
    }
  }
  return finalize(series);
}
