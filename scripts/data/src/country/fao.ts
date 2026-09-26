/**
 * FAOSTAT : autosuffisance et part des exportations mondiales de céréales (bilans alimentaires),
 * part des exportations mondiales d'engrais (éléments nutritifs N, P2O5, K2O).
 * Les fichiers « normalisés » sont lus en flux (≈ 600 Mo décompressés pour les bilans).
 */
import { listZip, splitCsvLine, zipEntryLines } from '../io/csv.ts';
import { geoCode } from './providers.ts';

/** Céréales, hors bière (code FBS 2905). */
const CEREALS = '2905';
const ELEMENTS = { production: '5511', imports: '5611', exports: '5911', supply: '5301' } as const;
/** Engrais : azote, phosphate, potasse (totaux en éléments nutritifs). */
const NUTRIENTS = ['3102', '3103', '3104'];
const FERT_EXPORT = '5910';

/** Codes FAO d'agrégats à exclure des totaux mondiaux (≥ 5000) et de la Chine agrégée (351). */
function isAggregate(areaCode: string): boolean {
  return Number(areaCode) >= 5000 || areaCode === '351';
}

export interface FaoGrain {
  year: number;
  /** Code GeoSim → { production, imports, exports, supply } en milliers de tonnes. */
  byCountry: Map<string, Record<keyof typeof ELEMENTS, number>>;
  worldExports: number;
}

async function* rows(zipPath: string): AsyncGenerator<string[]> {
  const entries = await listZip(zipPath);
  const main = entries.find((e) => e.name.includes('All_Data'));
  if (main === undefined) throw new Error(`${zipPath} : fichier de données introuvable`);
  let header = true;
  for await (const line of zipEntryLines(zipPath, main)) {
    if (header) {
      header = false;
      continue;
    }
    yield splitCsvLine(line);
  }
}

/** M49 (« '004 ») → code GeoSim, via la table numérique → alpha-3. */
function m49(raw: string, numeric: Map<number, string>): string | null {
  const n = Number(raw.replace(/'/g, ''));
  const code = numeric.get(n);
  return code === undefined ? null : geoCode(code);
}

export async function readFaoGrain(
  zipPath: string,
  numeric: Map<number, string>,
): Promise<FaoGrain> {
  // Colonnes : Area Code, Area Code (M49), Area, Item Code, Item Code (FBS), Item,
  // Element Code, Element, Year Code, Year, Unit, Value, Flag, Note
  const data = new Map<number, Map<string, Record<keyof typeof ELEMENTS, number>>>();
  const elementOf = new Map<string, keyof typeof ELEMENTS>(
    Object.entries(ELEMENTS).map(([k, v]) => [v, k as keyof typeof ELEMENTS]),
  );
  for await (const f of rows(zipPath)) {
    if (f[3] !== CEREALS) continue;
    const element = elementOf.get(f[6] ?? '');
    if (element === undefined || isAggregate(f[0] ?? '')) continue;
    const code = m49(f[1] ?? '', numeric);
    if (code === null) continue;
    const year = Number(f[9]);
    let byCountry = data.get(year);
    if (byCountry === undefined) data.set(year, (byCountry = new Map()));
    let rec = byCountry.get(code);
    if (rec === undefined) {
      rec = { production: 0, imports: 0, exports: 0, supply: 0 };
      byCountry.set(code, rec);
    }
    rec[element] += Number(f[11]) || 0;
  }
  const year = Math.max(...data.keys());
  const byCountry = data.get(year) ?? new Map();
  let worldExports = 0;
  for (const rec of byCountry.values()) worldExports += rec.exports;
  return { year, byCountry, worldExports };
}

export interface FaoFertilizer {
  year: number;
  /** Code GeoSim → exportations (t d'éléments nutritifs). */
  exports: Map<string, number>;
  world: number;
}

export async function readFaoFertilizer(
  zipPath: string,
  numeric: Map<number, string>,
): Promise<FaoFertilizer> {
  // Colonnes : Area Code, Area Code (M49), Area, Item Code, Item, Element Code, Element,
  // Year Code, Year, Unit, Value, Flag, Note
  const data = new Map<number, Map<string, number>>();
  for await (const f of rows(zipPath)) {
    if (!NUTRIENTS.includes(f[3] ?? '') || f[5] !== FERT_EXPORT || isAggregate(f[0] ?? ''))
      continue;
    const code = m49(f[1] ?? '', numeric);
    if (code === null) continue;
    const year = Number(f[8]);
    let m = data.get(year);
    if (m === undefined) data.set(year, (m = new Map()));
    m.set(code, (m.get(code) ?? 0) + (Number(f[10]) || 0));
  }
  // Dernière année suffisamment renseignée (les derniers exercices sont souvent partiels).
  const years = [...data.keys()].sort((a, b) => b - a);
  const counts = years.map((y) => data.get(y)?.size ?? 0);
  const best = Math.max(...counts);
  const year = years.find((_, k) => (counts[k] as number) >= 0.8 * best) ?? (years[0] as number);
  const exports = data.get(year) ?? new Map<string, number>();
  let world = 0;
  for (const v of exports.values()) world += v;
  return { year, exports, world };
}
