/**
 * Commerce bilatéral de biens (BACI, CEPII, SH 2022 à 6 chiffres ; DECISIONS D4).
 * Lecture en flux de la dernière année disponible, agrégée :
 * - par paire exportateur → importateur (total) ;
 * - par poste d'exportation (énergie, alimentation, minerais critiques, puces, manufacturés) ;
 * - importations par produit critique et par fournisseur (puces, terres rares, céréales, armes,
 *   énergie), pour les dépendances.
 * Les valeurs BACI sont en milliers de dollars courants.
 */
import { listZip, splitCsvLine, zipEntryLines } from '../io/csv.ts';
import { geoCode } from './providers.ts';

export type GoodsSector = 'energy' | 'food' | 'minerals' | 'chips' | 'manufactured';
export type CriticalProduct = 'energy' | 'chips' | 'rare_earths' | 'grain' | 'arms';

/** Minerais critiques hors chapitre 26 (préfixes SH) : terres rares, lithium, graphite, uranium, métaux. */
const MINERAL_PREFIXES = [
  '2504', // graphite naturel
  '280530', // métaux des terres rares
  '2844', // uranium et éléments radioactifs
  '2846', // composés des terres rares
  '282520', // hydroxyde de lithium
  '283691', // carbonate de lithium
  '3801', // graphite artificiel
  '7401',
  '7402',
  '7403', // cuivre brut et affiné
  '7501',
  '7502', // nickel
  '8105', // cobalt
  '8112', // gallium, germanium, autres métaux
];

/** Poste d'un produit SH à 6 chiffres. */
export function sectorOf(hs6: string): GoodsSector {
  const chapter = Number(hs6.slice(0, 2));
  if (chapter === 27) return 'energy';
  if (chapter >= 1 && chapter <= 24) return 'food';
  if (chapter === 26 || MINERAL_PREFIXES.some((p) => hs6.startsWith(p))) return 'minerals';
  if (hs6.startsWith('8542')) return 'chips';
  return 'manufactured';
}

/** Produits critiques suivis pour les dépendances bilatérales (null si aucun). */
export function criticalOf(hs6: string): CriticalProduct | null {
  if (hs6.startsWith('27')) return 'energy';
  if (hs6.startsWith('8542')) return 'chips';
  if (hs6.startsWith('280530') || hs6.startsWith('2846')) return 'rare_earths';
  if (/^100[1-8]/.test(hs6)) return 'grain';
  if (hs6.startsWith('93')) return 'arms';
  return null;
}

export interface BaciTrade {
  year: number;
  version: string;
  /** « i>j » → exportations de i vers j (milliers de $). */
  flows: Map<string, number>;
  /** Exportations par poste, par pays (milliers de $). */
  exportsBySector: Map<string, Record<GoodsSector, number>>;
  /** Importations d'un produit critique : produit → importateur → fournisseur → valeur. */
  critical: Map<CriticalProduct, Map<string, Map<string, number>>>;
}

export async function readBaci(zipPath: string): Promise<BaciTrade> {
  const entries = await listZip(zipPath);
  const years = entries
    .map((e) => /BACI_HS\d+_Y(\d{4})_(V\d+)\.csv$/.exec(e.name))
    .filter((m): m is RegExpExecArray => m !== null);
  if (years.length === 0) throw new Error(`${zipPath} : aucun fichier annuel BACI`);
  const last = years.sort((a, b) => Number(b[1]) - Number(a[1]))[0] as RegExpExecArray;
  const year = Number(last[1]);
  const version = last[2] as string;

  const codes = new Map<string, string>();
  const codeEntry = entries.find((e) => e.name.startsWith('country_codes'));
  if (codeEntry === undefined) throw new Error(`${zipPath} : table des pays absente`);
  let header = true;
  for await (const line of zipEntryLines(zipPath, codeEntry)) {
    if (header) {
      header = false;
      continue;
    }
    const f = splitCsvLine(line);
    if (f[0] && f[3]) codes.set(f[0], geoCode(f[3]));
  }

  const flows = new Map<string, number>();
  const exportsBySector = new Map<string, Record<GoodsSector, number>>();
  const critical = new Map<CriticalProduct, Map<string, Map<string, number>>>();
  const entry =
    entries.find((e) => e.name === last[0]) ?? entries.find((e) => e.name.endsWith(last[0]));
  if (entry === undefined) throw new Error(`${zipPath} : ${last[0]} introuvable`);
  header = true;
  for await (const line of zipEntryLines(zipPath, entry)) {
    if (header) {
      header = false;
      continue;
    }
    // t,i,j,k,v,q
    const c1 = line.indexOf(',');
    const c2 = line.indexOf(',', c1 + 1);
    const c3 = line.indexOf(',', c2 + 1);
    const c4 = line.indexOf(',', c3 + 1);
    const c5 = line.indexOf(',', c4 + 1);
    const i = codes.get(line.slice(c1 + 1, c2));
    const j = codes.get(line.slice(c2 + 1, c3));
    if (i === undefined || j === undefined || i === j) continue;
    const k = line.slice(c3 + 1, c4);
    const v = Number(line.slice(c4 + 1, c5 < 0 ? undefined : c5));
    if (!(v > 0)) continue;
    const key = `${i}>${j}`;
    flows.set(key, (flows.get(key) ?? 0) + v);
    let sectors = exportsBySector.get(i);
    if (sectors === undefined) {
      sectors = { energy: 0, food: 0, minerals: 0, chips: 0, manufactured: 0 };
      exportsBySector.set(i, sectors);
    }
    sectors[sectorOf(k)] += v;
    const product = criticalOf(k);
    if (product !== null) {
      let byImporter = critical.get(product);
      if (byImporter === undefined) critical.set(product, (byImporter = new Map()));
      let bySupplier = byImporter.get(j);
      if (bySupplier === undefined) byImporter.set(j, (bySupplier = new Map()));
      bySupplier.set(i, (bySupplier.get(i) ?? 0) + v);
    }
  }
  return { year, version, flows, exportsBySector, critical };
}
