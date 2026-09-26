/** Chargement des sources automatisées depuis le cache (data/raw) dans le contexte de construction. */
import { readFile } from 'node:fs/promises';
import { listZip, splitCsvLine, zipEntryLines } from '../io/csv.ts';
import { recordVersion } from '../download.ts';
import { readBaci, type BaciTrade } from './baci.ts';
import { readFaoFertilizer, readFaoGrain, type FaoFertilizer, type FaoGrain } from './fao.ts';
import {
  parseImf,
  parseImfEditions,
  parseOwidChart,
  parseOwidEnergy,
  parseUndpHdi,
  parseUngaIdealPoints,
  parseUnhcr,
  parseWbCountries,
  parseWgiCountryNames,
  parseWorldBank,
  type WbCountryMeta,
  type WbSeries,
} from './providers.ts';
import type { Series } from './series.ts';
import {
  COUNTRY_SOURCES,
  IMF_INDICATORS,
  OWID_CHARTS,
  WB_INDICATORS,
  WGI_INDICATORS,
  wbSourceId,
} from './sources.ts';

/** Colonnes du jeu de données énergie d'OWID utilisées. */
export const OWID_ENERGY_COLUMNS = [
  'primary_energy_consumption',
  'oil_production',
  'oil_consumption',
  'gas_production',
  'gas_consumption',
  'coal_production',
  'coal_consumption',
  'nuclear_share_elec',
  'renewables_share_energy',
] as const;

/**
 * Codes numériques ISO 3166-1 → alpha-3 : table de BACI, corrigée des codes propres à BACI
 * (France 251, États-Unis 842, Inde 699, Suisse 757, Norvège 579) pour lire les codes M49 de la FAO.
 */
const STANDARD_NUMERIC: Record<number, string> = {
  250: 'FRA',
  840: 'USA',
  356: 'IND',
  756: 'CHE',
  578: 'NOR',
  158: 'TWN',
};

export interface AutomatedData {
  wbMeta: Map<string, WbCountryMeta>;
  wb: Map<string, WbSeries>;
  imf: Map<string, Series>;
  imfEditions: Map<string, string>;
  owidEnergy: Map<string, Series>;
  owid: Map<string, Series>;
  unhcrAsylum: Series;
  unhcrOrigin: Series;
  unga: Series;
  hdi: Series;
  grain: FaoGrain;
  fertilizer: FaoFertilizer;
  baci: BaciTrade;
}

export async function loadAutomated(
  paths: Map<string, string>,
  manifestPath: string,
  log: (m: string) => void,
): Promise<AutomatedData> {
  const pathOf = (key: string): string => {
    const def = COUNTRY_SOURCES[key];
    const path = def ? paths.get(def.id) : undefined;
    if (path === undefined) throw new Error(`Source manquante : ${key}`);
    return path;
  };
  const json = async (key: string): Promise<unknown> =>
    JSON.parse(await readFile(pathOf(key), 'utf8'));
  const text = async (key: string): Promise<string> => readFile(pathOf(key), 'utf8');

  const wbMeta = parseWbCountries(await json('wbCountries'));
  const wgiNames = parseWgiCountryNames(await json('wgiCountries'));
  const wb = new Map<string, WbSeries>();
  for (const code of [...Object.keys(WB_INDICATORS), ...Object.keys(WGI_INDICATORS)]) {
    const parsed = parseWorldBank(
      await json(wbSourceId(code)),
      code.startsWith('GOV_WGI') ? wgiNames : undefined,
    );
    wb.set(code, parsed);
    if (parsed.lastUpdated)
      await recordVersion(manifestPath, wbSourceId(code), `mise à jour ${parsed.lastUpdated}`);
  }
  const imfEditions = parseImfEditions(await json('imfIndicators'));
  const imf = new Map<string, Series>();
  for (const code of Object.keys(IMF_INDICATORS)) {
    imf.set(code, parseImf(await json(`imf_${code.toLowerCase()}`), code));
    const edition = imfEditions.get(code);
    if (edition) await recordVersion(manifestPath, `imf_${code.toLowerCase()}`, edition);
  }
  log(
    `Banque mondiale : ${wb.size} indicateurs ; FMI : ${imf.size} indicateurs (${imfEditions.get('NGDPD') ?? '?'})`,
  );

  const owidEnergy = parseOwidEnergy(await text('owidEnergy'), OWID_ENERGY_COLUMNS);
  const owid = new Map<string, Series>();
  for (const slug of Object.keys(OWID_CHARTS))
    owid.set(slug, parseOwidChart(await text(`owid_${slug}`)));
  const unhcrAsylum = parseUnhcr(await json('unhcrAsylum'), 'asylum');
  const unhcrOrigin = parseUnhcr(await json('unhcrOrigin'), 'origin');
  const unga = parseUngaIdealPoints(await text('unga'));
  const hdi = parseUndpHdi(await text('undpHdi'));

  // Codes numériques pour la FAO.
  const baciPath = pathOf('baci');
  const numeric = new Map<number, string>();
  const codes = (await listZip(baciPath)).find((e) => e.name.startsWith('country_codes'));
  if (codes === undefined) throw new Error('BACI : table des pays absente');
  for await (const line of zipEntryLines(baciPath, codes)) {
    const f = splitCsvLine(line);
    const n = Number(f[0]);
    if (Number.isInteger(n) && f[3]) numeric.set(n, f[3]);
  }
  for (const [n, code] of Object.entries(STANDARD_NUMERIC)) numeric.set(Number(n), code);

  const grain = await readFaoGrain(pathOf('faoFbs'), numeric);
  const fertilizer = await readFaoFertilizer(pathOf('faoFertilizers'), numeric);
  log(
    `FAOSTAT : céréales ${grain.year} (${grain.byCountry.size} pays), engrais ${fertilizer.year} (${fertilizer.exports.size} pays)`,
  );
  const baci = await readBaci(baciPath);
  log(`BACI ${baci.version} : année ${baci.year}, ${baci.flows.size} flux bilatéraux`);
  await recordVersion(
    manifestPath,
    COUNTRY_SOURCES.baci?.id ?? 'baci_hs22',
    `${baci.version} (données ${baci.year})`,
  );

  return {
    wbMeta,
    wb,
    imf,
    imfEditions,
    owidEnergy,
    owid,
    unhcrAsylum,
    unhcrOrigin,
    unga,
    hdi,
    grain,
    fertilizer,
    baci,
  };
}
