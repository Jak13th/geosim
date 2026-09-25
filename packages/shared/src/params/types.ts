/**
 * Types du catalogue des paramètres (SPEC §6.2).
 * Chaque paramètre est déclaré une seule fois ; l'interface est générée à partir de ces déclarations.
 */

/** Portée d'un paramètre : à quelle entité il s'applique. */
export type ParamScope = 'country' | 'pair' | 'zone' | 'world' | 'model' | 'sim';

/**
 * - `input` : levier ou hypothèse ; la simulation ne le change qu'à travers les décisions du pays.
 * - `state` : état qui évolue ; une modification manuelle remplace l'état courant.
 * - `derived` : valeur calculée ; affichée, et verrouillable pour forcer une valeur.
 */
export type ParamKind = 'input' | 'state' | 'derived';

/**
 * Nature de la valeur. Extension de SPEC §6.2 (voir docs/DECISIONS.md) : certains paramètres
 * ne sont pas des scalaires (listes de pays, répartitions par domaine, dates).
 */
export type ParamValueType = 'number' | 'enum' | 'bool' | 'date' | 'list' | 'vector';

/** Niveau de confiance d'une valeur (CLAUDE.md, « Données »). */
export type Confidence = 'high' | 'medium' | 'low' | 'assumption';

export type CategoryId =
  | 'demographie'
  | 'economie'
  | 'budget'
  | 'commerce'
  | 'energie'
  | 'ressources'
  | 'forces'
  | 'strategique'
  | 'politique'
  | 'diplomatie'
  | 'technologie'
  | 'geographie'
  | 'risques'
  | 'profil'
  | 'bilateral'
  | 'zone'
  | 'monde'
  | 'simulation';

/** Systèmes de simulation susceptibles de lire un paramètre (SPEC §8). */
export type SystemId =
  | 'map'
  | 'demography'
  | 'economy'
  | 'budget'
  | 'trade'
  | 'markets'
  | 'energy'
  | 'resources'
  | 'politics'
  | 'diplomacy'
  | 'military'
  | 'combat'
  | 'nuclear'
  | 'cyber'
  | 'space'
  | 'events'
  | 'ai'
  | 'health'
  | 'climate'
  | 'technology';

export interface ParamDef {
  /** Identifiant stable, ex. `eco.gdp_nominal`. */
  id: string;
  /** Libellé affiché, en français. */
  label: string;
  category: CategoryId;
  scope: ParamScope;
  kind: ParamKind;
  valueType: ParamValueType;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  scale?: 'linear' | 'log';
  /** Valeurs possibles d'un paramètre `enum`. */
  enumValues?: readonly string[];
  /** Composantes d'un paramètre `vector` (ex. domaines militaires). */
  components?: readonly string[];
  /** Source initiale : `WB:…`, `WGI:…`, `IMF:…`, `OWID:…`, `FAO`, `USGS`, `UNGA`, `CUR`, `HYP`, `DER`, `MAP`. */
  source?: string;
  /** Explication en français (infobulle). */
  description: string;
  usedBy: readonly SystemId[];
}

/** Provenance d'une valeur : obligatoire pour toute donnée réelle ou curée. */
export interface Provenance {
  /** URL ou référence (ex. `WB:NY.GDP.MKTP.CD`). */
  source: string;
  /** Année ou date de la donnée (ou date d'accès), ISO 8601. */
  date: string;
  confidence: Confidence;
  note?: string;
}

export interface SourcedValue<T> extends Provenance {
  value: T;
}
