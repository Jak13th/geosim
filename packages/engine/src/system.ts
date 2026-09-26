/**
 * Contrat des systèmes de simulation (SPEC §8). Un système déclare les coefficients qu'il lit
 * (vérifiés au chargement de config/model.yaml) et les paramètres qu'il écrit (historique), puis
 * fournit :
 * - `init` : calage sur la situation initiale (tick 0) ;
 * - `monthly` : pas mensuel (économie, démographie, marchés…) ;
 * - `derive` : valeurs dérivées instantanées, recalculées après chaque pas et chaque commande
 *   (un curseur modifié se répercute aussitôt sur les soldes, taux, ratios…), sans aléa.
 */
import type { Calendar } from './calendar.ts';
import type { Model } from './model.ts';
import type { State } from './state.ts';
import type { Effect, Factor, ModifierSpec, Slot } from './types.ts';

/** Événement majeur émis par un système, avec ses facteurs explicatifs (CLAUDE.md, règle 6). */
export interface SimEvent {
  kind: string;
  entities: string[];
  severity: 0 | 1 | 2 | 3;
  factors: Factor[];
  /** Changements de valeur appliqués par l'événement. */
  effects: Effect[];
  /** Modificateurs temporaires créés par l'événement. */
  modifiers?: { slot: Slot; spec: ModifierSpec }[];
  note?: string;
}

export interface SystemContext {
  state: State;
  model: Model;
  calendar: Calendar;
  /** Années par pas mensuel (1/12). */
  dt: number;
  /** Années écoulées depuis le départ. */
  years: number;
  /** Mois écoulés depuis le premier pas mensuel (0 au premier pas). */
  month: number;
  /** Consigne un événement dans le journal et crée ses modificateurs. */
  emit(event: SimEvent): void;
}

export interface System {
  id: string;
  /** Chemins des coefficients lus dans config/model.yaml. */
  coefficients: readonly string[];
  /** Paramètres pays numériques écrits (suivis dans l'historique mensuel). */
  writes: readonly string[];
  init?(ctx: SystemContext): void;
  monthly?(ctx: SystemContext): void;
  derive?(ctx: SystemContext): void;
}
