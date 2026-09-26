/**
 * Contrat des fichiers de données construits par `npm run data` (data/build/) :
 * - `countries.base.json` : paramètres de chaque entité, avec leur provenance ;
 * - `pairs.base.json` : paramètres bilatéraux ;
 * - `world.base.json` : paramètres mondiaux, blocs, conflits, détroits, zones.
 *
 * Le pipeline les écrit, l'interface et le moteur les lisent : les types vivent ici pour que
 * les deux côtés partagent le même contrat.
 */
import type { Confidence } from '../params/types.ts';
import type { EntityKind, MapControlZone } from '../map/meta.ts';

/** Valeur d'un paramètre : nombre, catégorie, booléen, date, liste de codes ou vecteur. */
export type ParamValue = number | string | boolean | string[] | Record<string, number> | null;

/**
 * Méthode de résolution d'une valeur :
 * - `source` : première source de la règle ; `fallback_source` : source de repli ;
 * - `curated` : fichier curé daté ; `derived` : calculée depuis d'autres valeurs ;
 * - `map` : calculée depuis la carte ;
 * - `regional_median` : médiane de pays comparables (estimation, signalée) ;
 * - `default` : hypothèse par défaut (defaults.yaml) ;
 * - `zero` : absence documentée ; `not_applicable` : sans objet ; `missing` : lacune.
 */
export type ResolutionMethod =
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

export const RESOLUTION_METHODS: readonly ResolutionMethod[] = [
  'source',
  'fallback_source',
  'curated',
  'derived',
  'map',
  'regional_median',
  'default',
  'zero',
  'not_applicable',
  'missing',
];

/** Libellés français des méthodes, pour l'interface et les rapports. */
export const METHOD_LABELS: Readonly<Record<ResolutionMethod, string>> = {
  source: 'Source',
  fallback_source: 'Source de repli',
  curated: 'Donnée curée',
  derived: 'Calculée',
  map: 'Calculée depuis la carte',
  regional_median: 'Médiane de pays comparables',
  default: 'Hypothèse par défaut',
  zero: 'Absence documentée',
  not_applicable: 'Sans objet',
  missing: 'Lacune',
};

export const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  high: 'élevée',
  medium: 'moyenne',
  low: 'faible',
  assumption: 'hypothèse',
};

/** Valeur résolue d'un paramètre, avec sa provenance complète. */
export interface ResolvedValue {
  value: ParamValue;
  /** Référence de la source (ex. `WB:SP.POP.TOTL`, `CUR:country_economy.yaml (…)`, `HYP`). */
  source: string;
  /** Année de la donnée, ou date de consultation / de curation. */
  date: string;
  confidence: Confidence;
  method: ResolutionMethod;
  note?: string;
  /** Donnée de plus de trois ans (SPEC §5.1). */
  stale?: boolean;
  /** Valeur de la source, hors de la plage du catalogue, avant écrêtage à cette plage. */
  clampedFrom?: number;
}

export interface CountryRecord {
  index: number;
  id: string;
  name: string;
  nameFr: string;
  kind: EntityKind;
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
  params: Record<string, ResolvedValue>;
}

export interface CountriesBase {
  version: 1;
  buildDate: string;
  mapBuildId: string;
  /** Paramètres dérivés calculés par le moteur (absents des entités). */
  runtimeParams: string[];
  entities: CountryRecord[];
}

export interface PairProvenance {
  source: string;
  date: string;
  confidence: Confidence;
  note?: string;
}

export interface PairParam {
  unit: string;
  /** Valeur des paires absentes, et sa justification. */
  default: ParamValue;
  defaultNote: string;
  refs: PairProvenance[];
  /** [i, j, valeur, index de provenance dans `refs`]. */
  entries: [string, string, ParamValue, number][];
}

/**
 * Routes maritimes des paires (carte, `routes-<résolution>.json`), sous forme compacte pour le
 * moteur : pour chaque paire non orientée, longueur et détroits de la route principale, et de la
 * route alternative qui évite les détroits de la principale. Les détroits d'une route sont un
 * masque de bits sur `chokepoints` (bit k : `chokepoints[k]`).
 */
export interface PairRoutes {
  /** Identifiants des détroits, dans l'ordre des bits des masques. */
  chokepoints: string[];
  /** [a, b, km principale, masque principal, km alternative (−1 : aucune), masque alternatif]. */
  entries: [string, string, number, number, number, number][];
}

export interface PairsBase {
  version: 1;
  buildDate: string;
  /** Paramètres bilatéraux dérivés, calculés par le moteur (absents du fichier). */
  runtimeParams: string[];
  params: Record<string, PairParam>;
  /** Routes maritimes (absentes des données construites avant la phase 4). */
  routes?: PairRoutes;
}

/** Provenance d'un élément curé (bloc, conflit, détroit…). */
export interface CuratedRef {
  source: string;
  date: string;
  confidence: Confidence;
  note?: string;
}

export interface BlocRecord extends CuratedRef {
  id: string;
  name: string;
  nameFr: string;
  kind: string;
  members: string[];
  partners?: string[];
  observers?: string[];
  suspended?: string[];
  rules: { mutual_defense: boolean; [rule: string]: unknown };
}

export interface ConflictRecord extends CuratedRef {
  id: string;
  name: string;
  nameFr: string;
  type: 'interstate' | 'civil_war' | 'insurgency' | 'frozen';
  status: 'active' | 'ceasefire' | 'frozen';
  intensity: number;
  started: string;
  countries: string[];
  sides: { a: string[]; b: string[] };
  supporters?: { a?: string[]; b?: string[] };
}

export interface ChokepointStatusRecord extends CuratedRef {
  value: 'open' | 'contested' | 'closed';
  /** Trafic actuel en % du trafic d'avant crise. */
  traffic_pct: number;
  normal_traffic: string;
}

export interface ChokepointRecord {
  id: string;
  name: string;
  nameFr: string;
  kind: 'strait' | 'canal' | 'cape';
  riparians: string[];
  /** Position du marqueur [lon, lat] : centre de la première porte, ou le cap lui-même. */
  lonLat: [number, number];
  status: ChokepointStatusRecord;
}

/** Traité bilatéral ou plurilatéral (treaties.yaml). */
export interface TreatyRecord extends CuratedRef {
  id: string;
  name: string;
  type:
    | 'mutual_defense'
    | 'security_guarantee'
    | 'non_aggression'
    | 'strategic_partnership'
    | 'basing'
    | 'consultation';
  parties: string[];
  /** Garantie unilatérale : le garant protège les autres parties, sans réciprocité. */
  guarantor?: string;
  signed: string;
  area?: string;
  /** Crédibilité perçue (0–1), hypothèse. */
  credibility: number;
}

/** Régime de sanctions (sanctions.yaml) : émetteurs (codes ou `bloc:<id>`), cible, volets. */
export interface SanctionRegimeRecord extends CuratedRef {
  id: string;
  name: string;
  target: string;
  senders: string[];
  tracks: Partial<Record<string, number>>;
  secondary: boolean;
}

/**
 * Profils décisionnels par défaut (defaults.yaml) : valeurs des paramètres `ai.*` par type de
 * régime et pour les factions, appliquées quand un gouvernement change sans profil curé (coup
 * d'État, révolution).
 */
export interface ProfileDefaults {
  source: string;
  date: string;
  byRegime: Record<string, Record<string, number>>;
  faction: Record<string, number>;
}

/**
 * Vue de `world.base.json` utilisée hors du pipeline : les sujets que l'interface et le moteur ne
 * lisent pas (minerais, semi-conducteurs…) n'y figurent pas. Le pipeline vérifie à la compilation
 * que son type y est conforme. Les champs optionnels manquent aux données d'avant la phase 4.
 */
export interface WorldBaseFile {
  version: 1;
  buildDate: string;
  params: Record<string, ResolvedValue>;
  blocs: BlocRecord[];
  conflicts: ConflictRecord[];
  chokepoints: ChokepointRecord[];
  zones: { control: MapControlZone[] };
  treaties?: TreatyRecord[];
  sanctions?: { regimes: SanctionRegimeRecord[] };
  profileDefaults?: ProfileDefaults;
}
