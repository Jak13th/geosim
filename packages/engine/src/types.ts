/**
 * Types publics du moteur : emplacements de valeurs, modificateurs, commandes, journal.
 * Ils circulent entre le worker et l'interface (clonage structuré) et sont sérialisés dans les
 * captures : uniquement des objets simples.
 */
import type { CoefficientTree, ParamValue } from '@geosim/shared';

/**
 * Emplacement d'une valeur : un paramètre pour une entité, une paire orientée (de i vers j), le
 * monde, une zone (détroit…) ou la simulation. Les codes sont ceux des données (`FRA`, `hormuz`).
 */
export type Slot =
  | { scope: 'country'; param: string; entity: string }
  | { scope: 'pair'; param: string; from: string; to: string }
  | { scope: 'world'; param: string }
  | { scope: 'zone'; param: string; target: string }
  | { scope: 'sim'; param: string };

export function slotKey(slot: Slot): string {
  switch (slot.scope) {
    case 'country':
      return `c|${slot.param}|${slot.entity}`;
    case 'pair':
      return `p|${slot.param}|${slot.from}|${slot.to}`;
    case 'world':
      return `w|${slot.param}`;
    case 'zone':
      return `z|${slot.param}|${slot.target}`;
    case 'sim':
      return `s|${slot.param}`;
  }
}

export function slotFromKey(key: string): Slot {
  const [scope, param = '', a = '', b = ''] = key.split('|');
  switch (scope) {
    case 'c':
      return { scope: 'country', param, entity: a };
    case 'p':
      return { scope: 'pair', param, from: a, to: b };
    case 'w':
      return { scope: 'world', param };
    case 'z':
      return { scope: 'zone', param, target: a };
    case 's':
      return { scope: 'sim', param };
    default:
      throw new Error(`Clé d'emplacement invalide : ${key}`);
  }
}

/**
 * Profil d'un modificateur temporaire (SPEC §6.3) :
 * - `none` : plein effet pendant toute la durée ;
 * - `linear` : décroît linéairement jusqu'à zéro à la fin de la durée ;
 * - `exponential` : décroît de moitié tous les `halfLifeDays`, supprimé à la fin de la durée.
 */
export type ModifierDecay = 'none' | 'linear' | 'exponential';

export interface ModifierSpec {
  /** `add` : ajoute `amount` (unité du paramètre) ; `mul` : multiplie par `amount`. */
  op: 'add' | 'mul';
  amount: number;
  durationDays: number;
  decay: ModifierDecay;
  /** Demi-vie (décroissance exponentielle). */
  halfLifeDays?: number;
  /** Libellé affiché (ex. « Choc pétrolier », « Défaut souverain »). */
  label: string;
}

export interface Modifier extends ModifierSpec {
  id: number;
  slot: Slot;
  startTick: number;
  /** Entrée du journal qui l'a créé (commande de l'utilisateur ou événement). */
  seq: number;
  author: Author;
}

/** Auteur d'une entrée du journal. */
export type Author = 'user' | 'event' | 'system';

/**
 * Commandes (SPEC §7.3) : toute modification de l'état passe par elles ; elles sont horodatées
 * et rejouables (journal). Le pilotage du temps (vitesse, pas-à-pas) n'en fait pas partie : il
 * ne change pas l'histoire simulée.
 */
export type Command =
  /** Nouvelle valeur (même valeur pour chaque emplacement : édition groupée). */
  | { type: 'set'; slots: Slot[]; value: ParamValue }
  /** Modification relative (ajouter, multiplier) des paramètres numériques. */
  | { type: 'adjust'; slots: Slot[]; op: 'add' | 'mul'; amount: number }
  /** Retour à la donnée réelle (et, pour un dérivé forcé, au calcul). */
  | { type: 'reset'; slots: Slot[] }
  | { type: 'lock'; slots: Slot[]; locked: boolean }
  | { type: 'addModifier'; slots: Slot[]; modifier: ModifierSpec }
  | { type: 'removeModifier'; ids: number[] }
  | { type: 'setCoefficient'; path: string; value: number }
  /** Adhésion à un bloc ou retrait (traités de défense et sanctions communes suivent). */
  | { type: 'bloc'; action: 'join' | 'leave'; entity: string; bloc: string }
  /**
   * Projet de résolution de l'ONU visant un pays : vote du Conseil de sécurité (veto des membres
   * permanents), puis de l'Assemblée générale s'il échoue ; effets s'il est adopté.
   */
  | {
      type: 'unResolution';
      kind: UnResolutionKind;
      target: string;
      /** Pays qui porte le projet (facultatif). */
      sponsor?: string;
      /** Volets des sanctions demandées (résolution de sanctions), 0–1. */
      tracks?: Partial<Record<string, number>>;
    }
  /** Remplacement de tous les coefficients (rechargement de config/model.yaml). */
  | { type: 'setModel'; model: CoefficientTree }
  | { type: 'undo' }
  | { type: 'redo' };

export type CommandType = Command['type'];

/** Nature d'une résolution de l'ONU. */
export type UnResolutionKind = 'condemnation' | 'sanctions' | 'ceasefire' | 'peacekeeping';

/** Facteur explicatif d'une décision ou d'un événement (« Pourquoi ? »). */
export interface Factor {
  /** Identifiant du facteur (paramètre du catalogue ou grandeur du modèle). */
  id: string;
  label: string;
  value: number;
  unit: string;
  /** Contribution au résultat (ex. points de probabilité), si elle se calcule. */
  contribution?: number;
}

/** Effet appliqué par une commande ou un événement. */
export interface Effect {
  slot: Slot;
  from: ParamValue;
  to: ParamValue;
  /** Modificateur créé (id), le cas échéant. */
  modifier?: number;
}

export interface JournalEntry {
  seq: number;
  tick: number;
  date: string;
  author: Author;
  /** Type de commande (`set`, `lock`…) ou d'événement (`default`, `bop_crisis`…). */
  kind: string;
  /** Entités concernées (codes), pour les filtres et le centrage de la carte. */
  entities: string[];
  /** 0 : information ; 1 : notable ; 2 : important ; 3 : majeur. */
  severity: 0 | 1 | 2 | 3;
  /** Commande rejouable (entrées de l'utilisateur). */
  command?: Command;
  /** Annulation ou rétablissement : entrée visée. */
  target?: number;
  /** Entrée de l'utilisateur annulée (et non rétablie). */
  undone?: boolean;
  /** Facteurs explicatifs (« Pourquoi ? »). */
  factors?: Factor[];
  effects?: Effect[];
  /** Coefficients modifiés (onglet Modèle). */
  coefficients?: { path: string; from: number; to: number }[];
  /** Détail libre (message d'erreur de validation, note). */
  note?: string;
}
