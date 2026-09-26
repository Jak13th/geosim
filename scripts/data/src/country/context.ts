/**
 * Contexte de construction des données pays : séries des sources automatisées, tables curées,
 * sujets curés (blocs, nucléaire…) et entités. Les règles de résolution y lisent tout.
 */
import type { Confidence } from '@geosim/shared';
import type { BaciTrade } from './baci.ts';
import type { CuratedTables, Defaults, ParamValue } from './curated.ts';
import type { FaoFertilizer, FaoGrain } from './fao.ts';
import type { WbSeries } from './providers.ts';
import type { Series } from './series.ts';
import type { Topics } from './topics.ts';

export type EntityKindFull = 'state' | 'de_facto' | 'faction';

export interface EntityInfo {
  index: number;
  id: string;
  name: string;
  nameFr: string;
  kind: EntityKindFull;
  /** Niveau de détail (SPEC §5.3, DECISIONS D6). */
  detail: 'full' | 'standard';
  /** Région de la Banque mondiale (EAS, ECS, LCN, MEA, NAC, SAS, SSF). */
  region: string;
  /** Groupe de revenu (HIC, UMC, LMC, LIC). */
  income: string;
  /** Provenance du classement région / revenu quand il ne vient pas de la Banque mondiale. */
  classification: 'world_bank' | 'curated';
  /** Pour une faction : pays dont elle conteste le territoire. */
  parent: string | null;
}

/**
 * Méthode d'obtention d'une valeur :
 * - `source` : source automatisée ou curée prévue par le catalogue ;
 * - `fallback_source` : source de repli documentée (ex. Banque mondiale au lieu du FMI) ;
 * - `curated` : fichier curé daté ;
 * - `derived` : calcul documenté à partir d'autres données ;
 * - `map` : calculé depuis la carte ;
 * - `regional_median` : médiane de pays comparables (estimation, signalée) ;
 * - `default` : hypothèse par défaut (defaults.yaml) ;
 * - `zero` : absence documentée (ni production, ni stock connus) ;
 * - `not_applicable` : sans objet (ex. quota OPEP+ d'un pays non membre) ;
 * - `missing` : lacune (aucune source, aucun repli), listée dans le rapport.
 */
export type Method =
  | 'source'
  | 'fallback_source'
  | 'curated'
  | 'derived'
  | 'map'
  | 'regional_median'
  | 'default'
  | 'zero'
  | 'not_applicable'
  | 'missing';

export interface Resolved {
  value: ParamValue;
  /** Référence de la source (ex. `WB:SP.POP.TOTL`, `CUR:country_economy.yaml`, `HYP`). */
  source: string;
  /** Année de la donnée, ou date de consultation / de curation. */
  date: string;
  confidence: Confidence;
  method: Method;
  note?: string;
  /** Donnée de plus de trois ans (SPEC §5.1). */
  stale?: boolean;
  /** Valeur de la source, hors de la plage du catalogue, avant écrêtage à cette plage. */
  clampedFrom?: number;
}

export interface Ctx {
  buildDate: string;
  buildYear: number;
  /** Séries de la Banque mondiale (WDI et WGI), par code d'indicateur. */
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
  curated: CuratedTables;
  defaults: Defaults;
  topics: Topics;
  entities: EntityInfo[];
  /** Valeurs déjà résolues (paramètre → code → valeur), pour les règles dépendantes. */
  resolved: Map<string, Map<string, Resolved>>;
  /** Population et PIB calculés depuis la carte (factions). */
  mapTotals: Map<string, { population: number; gdp: number }>;
}

export function valueOf(ctx: Ctx, param: string, code: string): ParamValue | undefined {
  return ctx.resolved.get(param)?.get(code)?.value;
}

export function numberOf(ctx: Ctx, param: string, code: string): number | null {
  const v = valueOf(ctx, param, code);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
