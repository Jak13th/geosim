/**
 * Explications pour l'interface (« Pourquoi ? », SPEC §9.4) : décomposition de la stabilité, de
 * l'approbation, du risque de coup d'État, de la pression de départ des réfugiés, des pressions
 * des sanctions, de l'approvisionnement en énergie, du niveau commercial et de l'affinité d'une
 * paire. Fonctions pures de l'état du moteur : elles ne modifient rien.
 */
import type { Engine } from './engine.ts';
import { col } from './state.ts';
import type { Factor } from './types.ts';
import { affinityFactors, blocNames } from './systems/diplomacy.ts';
import { ENERGY_OUT, shortfalls } from './systems/energy.ts';
import { approvalContributions, coupRisk, stabilityContributions } from './systems/politics.ts';
import { departurePressure } from './systems/refugees.ts';
import { SANCTIONS_OUT } from './systems/sanctions.ts';
import { TRADE_OUT } from './systems/trade.ts';

export interface Decomposition {
  /** Valeur courante (effective). */
  value: number;
  /** Chocs temporaires (modificateurs) compris dans la valeur : effective − courante. */
  shocks: number;
  /** Valeur visée par la dynamique mensuelle. */
  target: number;
  /** Ancre (niveau de départ, ou début du gouvernement pour l'approbation). */
  anchor: number;
  factors: Factor[];
}

export interface CountryExplanation {
  entity: string;
  stability: Decomposition;
  approval: Decomposition;
  coup: { risk: number; factors: Factor[] };
  /** Pression de départ des réfugiés : totale, au départ, et ses composantes. */
  departure: { total: number; start: number; parts: Factor[] };
  sanctions: {
    finance: number;
    finance0: number;
    tech: number;
    tech0: number;
    elite: number;
    elite0: number;
    evasion: number;
    secondary: number;
  };
  energy: {
    /** Part des importations d'énergie établies perdue (0–1). */
    shortfall: number;
    /** Part déjà remplacée par d'autres fournisseurs (0–1). */
    replaced: number;
    /** Principaux fournisseurs perdus : code et part des importations établies (0–1). */
    lost: { supplier: string; share: number }[];
  };
  /** Niveau du PIB dû aux gains à l'échange, relatif au départ (1 = inchangé). */
  tradeLevel: number;
  memberships: { id: string; nameFr: string }[];
}

const DEPARTURE_LABELS = [
  'Insurrection',
  'Guerre sur le territoire',
  'Famine',
  "Effondrement de l'État",
] as const;

export function explainCountry(engine: Engine, entity: string): CountryExplanation | null {
  const S = engine.state;
  const i = S.byId.get(entity);
  if (i === undefined) return null;
  const ctx = { model: engine.model, state: S };
  const shock = (id: string): number => {
    const p = col(id);
    const x = S.effNow(p, i) - (S.v(p)[i] as number);
    return Number.isFinite(x) ? x : 0;
  };
  const st = stabilityContributions(ctx, i);
  const ap = approvalContributions(ctx, i);
  const dep = departurePressure(ctx);
  // Lecture seule : ne crée aucun tableau interne (l'empreinte de l'état ne doit pas changer).
  const at = (key: string, fallback = 0): number => S.internal.get(key)?.[i] ?? fallback;
  const { shortfall, lost } = shortfalls(ctx, S);
  return {
    entity,
    stability: { value: S.effNow(col('pol.stability'), i), shocks: shock('pol.stability'), ...st },
    approval: { value: S.effNow(col('pol.approval'), i), shocks: shock('pol.approval'), ...ap },
    coup: coupRisk(ctx, i),
    departure: {
      total: dep.total[i] as number,
      start: at('refugees.pressure0'),
      parts: DEPARTURE_LABELS.map((label, k) => ({
        id: `refugees.pressure.${k}`,
        label,
        value: (dep.parts[k] as Float64Array)[i] as number,
        unit: 'indice',
      })),
    },
    sanctions: {
      finance: at(SANCTIONS_OUT.finance),
      finance0: at(SANCTIONS_OUT.finance0),
      tech: at(SANCTIONS_OUT.tech),
      tech0: at(SANCTIONS_OUT.tech0),
      elite: at(SANCTIONS_OUT.elite),
      elite0: at(SANCTIONS_OUT.elite0),
      evasion: at(SANCTIONS_OUT.evasion),
      secondary: at(SANCTIONS_OUT.secondary),
    },
    energy: {
      shortfall: shortfall[i] as number,
      replaced: at(ENERGY_OUT.replaced),
      lost: (lost[i] ?? []).map(([j, share]) => ({ supplier: S.entities[j]?.id ?? '', share })),
    },
    tradeLevel: at(TRADE_OUT.level, 1),
    memberships: blocNames(S, entity),
  };
}

export type PairExplanation = ReturnType<typeof affinityFactors>;

/** Affinité de i envers j décomposée en facteurs, relation, résidu de calage et mémoire des chocs. */
export function explainPair(engine: Engine, from: string, to: string): PairExplanation {
  return affinityFactors({ model: engine.model, state: engine.state }, from, to);
}
