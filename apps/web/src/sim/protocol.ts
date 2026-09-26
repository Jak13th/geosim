/**
 * Protocole entre le worker du moteur et l'interface (SPEC §7.3).
 *
 * Interface → moteur : appels RPC (Comlink) — vitesse, pas-à-pas, « avancer jusqu'à », commandes
 * (modifier, verrouiller, réinitialiser, modificateurs, coefficients), annuler / rétablir,
 * historique, captures, relecture.
 * Moteur → interface : des « images » (`Frame`) poussées à 5 Hz au plus pendant que la simulation
 * tourne, et aussitôt après chaque commande : horloge, valeurs des pays (tableaux transférables),
 * valeurs mondiales, verrous, surcharges, modificateurs, nouvelles entrées du journal. Les
 * paramètres bilatéraux ne sont renvoyés que lorsqu'ils changent.
 */
import type { JournalEntry, Modifier, OverrideInfo } from '@geosim/engine';
import type { ParamValue } from '@geosim/shared';

/** Vitesse : jours simulés par seconde (paramètre `sim.speed`, plage 0–90). */
export interface SpeedOption {
  days: number;
  label: string;
  title: string;
}

/** Vitesses de la barre de temps (SPEC §7.1) ; un mois compte ici 30 jours. */
export const SPEEDS: readonly SpeedOption[] = [
  { days: 1, label: '1 j/s', title: 'Un jour par seconde' },
  { days: 7, label: '1 sem/s', title: 'Une semaine par seconde' },
  { days: 30, label: '1 mois/s', title: 'Un mois par seconde' },
  { days: 90, label: '3 mois/s', title: 'Trois mois par seconde' },
];

export type StepUnit = 'day' | 'week' | 'month';

export interface Clock {
  tick: number;
  date: string;
  /** Vitesse choisie (jours par seconde), conservée pendant la pause. */
  speed: number;
  running: boolean;
  /** Tick visé par « avancer jusqu'à » (null : aucun). */
  target: number | null;
  /** Mois enregistrés dans l'historique. */
  months: number;
  /** Durée moyenne d'un pas mensuel dans le worker (ms). */
  monthMs: number;
  /** La simulation n'arrive pas à suivre la vitesse demandée. */
  lagging: boolean;
}

/** Informations fixes d'une simulation (envoyées à sa création ou à la restauration d'une capture). */
export interface SimInfo {
  engine: string;
  dataId: string;
  startDate: string;
  seed: number;
  /** Codes des entités, dans l'ordre des tableaux du moteur. */
  entities: string[];
  /** Paramètres pays numériques, dans l'ordre des colonnes (`COUNTRY_NUMERIC`). */
  numeric: string[];
  /** Paramètres pays non numériques, dans l'ordre de `COUNTRY_GENERIC`. */
  generic: string[];
  /** Données réelles et valeurs initiales calculées (P × N, colonne par paramètre). */
  base: Float64Array;
  /** Valeurs au départ de la simulation, après calage et calcul des dérivés (P × N). */
  initial: Float64Array;
  genericBase: ParamValue[][];
  worldBase: Record<string, ParamValue>;
  zoneBase: Record<string, Record<string, ParamValue>>;
  simBase: Record<string, ParamValue>;
  /** Séries mondiales de l'historique (`world.oil_price`, `world.gas_price.europe`…). */
  worldSeries: string[];
  /** Relecture du journal vérifiable (simulation créée dans cette session). */
  replayable: boolean;
}

/** Valeurs des pays, du monde et des couches de valeur (quand `version` change). */
export interface StatePart {
  version: number;
  /** Valeurs effectives (modificateurs appliqués), P × N. */
  eff: Float64Array;
  /** Valeurs courantes (avant modificateurs) des emplacements qui portent un modificateur : [k, x]. */
  current: [number, number][];
  /** Valeurs non numériques modifiées depuis l'image précédente : [colonne, entité, valeur]. */
  generic: [number, number, ParamValue][];
  world: Record<string, ParamValue>;
  /** Valeurs mondiales numériques effectives (modificateurs appliqués). */
  worldEff: Record<string, number>;
  zone: Record<string, Record<string, ParamValue>>;
  sim: Record<string, ParamValue>;
  overrides: [string, OverrideInfo][];
  /** Emplacements pays numériques verrouillés (k = p × N + i). */
  locked: number[];
  /** Autres verrous (clés d'emplacement). */
  slotLocks: string[];
  modifiers: Modifier[];
  canUndo: boolean;
  canRedo: boolean;
  /** Paramètres pays suivis par l'historique. */
  tracked: string[];
}

/** Paramètres bilatéraux (quand ils changent). */
export interface PairsPart {
  version: number;
  /** Matrices N × N des paramètres numériques (ligne i : de i vers j). */
  num: Record<string, Float64Array>;
  /** Valeurs non numériques différentes du défaut : [i × N + j, valeur]. */
  gen: Record<string, [number, ParamValue][]>;
  defaults: Record<string, ParamValue>;
}

export interface Frame {
  /** Nouvelle simulation ou capture restaurée : l'interface repart de zéro. */
  reset?: SimInfo;
  clock: Clock;
  state?: StatePart;
  pairs?: PairsPart;
  /** Nouvelles entrées du journal (journal complet après une remise à zéro). */
  journal?: JournalEntry[];
  /** Compteur de modifications des coefficients (l'onglet Modèle les relit quand il change). */
  modelVersion: number;
  /** Erreur de la simulation (elle est alors mise en pause). */
  error?: string;
}

/** Capture gardée en mémoire dans le worker. */
export interface CaptureInfo {
  id: number;
  label: string;
  tick: number;
  date: string;
}

export interface ReplayCheck {
  identical: boolean;
  hash: string;
  replayHash: string;
  /** Commandes de l'utilisateur rejouées. */
  commands: number;
  ms: number;
}

/** Séries mensuelles d'une entité : `ticks` communs, une série par paramètre (null : non suivi). */
export interface SeriesResult {
  ticks: number[];
  series: Record<string, Float32Array | null>;
}
