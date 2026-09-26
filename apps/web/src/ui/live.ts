/**
 * Accès de l'interface à l'état simulé : crochets React sur le miroir du moteur, emplacements
 * des paramètres, phase où un paramètre encore sans valeur sera calculé.
 */
import type { Slot } from '@geosim/engine';
import type { ParamDef } from '@geosim/shared';
import type { LiveSim } from '../sim/mirror.ts';
import { useSim } from '../sim/store.ts';

/** Miroir du moteur, redessiné quand les valeurs changent (null tant que le moteur démarre). */
export function useLive(): LiveSim | null {
  useSim((s) => s.stateVersion);
  useSim((s) => s.pairVersion);
  return useSim((s) => (s.status.state === 'ready' ? s.live : null));
}

/** Contexte d'un emplacement : entité, paire orientée, cible de zone. */
export type SlotContext =
  | { scope: 'country'; entity: string }
  | { scope: 'pair'; from: string; to: string }
  | { scope: 'world' }
  | { scope: 'zone'; target: string }
  | { scope: 'sim' };

export function slotOf(def: ParamDef, ctx: SlotContext): Slot {
  switch (ctx.scope) {
    case 'country':
      return { scope: 'country', param: def.id, entity: ctx.entity };
    case 'pair':
      return { scope: 'pair', param: def.id, from: ctx.from, to: ctx.to };
    case 'world':
      return { scope: 'world', param: def.id };
    case 'zone':
      return { scope: 'zone', param: def.id, target: ctx.target };
    case 'sim':
      return { scope: 'sim', param: def.id };
  }
}

/**
 * Phase de livraison où sera calculé un paramètre que le moteur ne renseigne pas encore
 * (SPEC §12) : politique, commerce et diplomatie en phase 4 ; forces armées en phase 5 ;
 * nucléaire, escalade et technologie en phase 6 ; perception des IA en phase 7.
 */
const LATER_PHASE: Readonly<Record<string, number>> = {
  'demo.social_cohesion': 4,
  'pol.legitimacy': 4,
  'pol.coup_risk': 4,
  'pol.war_support': 4,
  'trade.maritime_share': 4,
  'pair.affinity': 4,
  'pair.aid': 4,
  'eco.industrial_capacity': 5,
  'mil.capital_land': 5,
  'mil.capital_air': 5,
  'mil.capital_naval': 5,
  'mil.morale': 5,
  'mil.power_index': 5,
  'geo.strategic_depth': 5,
  'geo.infrastructure': 5,
  'tech.level': 5,
  'strat.second_strike': 6,
  'world.escalation': 6,
  'pair.perceived_power': 7,
};

/** Phase par catégorie, à défaut de mention explicite. */
const CATEGORY_PHASE: Readonly<Record<string, number>> = {
  commerce: 4,
  energie: 4,
  ressources: 4,
  politique: 4,
  diplomatie: 4,
  bilateral: 4,
  forces: 5,
  geographie: 5,
  strategique: 6,
  technologie: 6,
  risques: 6,
  profil: 7,
};

export function laterPhase(def: ParamDef): number {
  return LATER_PHASE[def.id] ?? CATEGORY_PHASE[def.category] ?? 4;
}
