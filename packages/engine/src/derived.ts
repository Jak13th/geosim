/**
 * Paramètres dérivés « par définition » : ratios et sommes sans aucun coefficient de modèle
 * (PIB par habitant, indice de misère). Le moteur les recalcule ; l'interface les affiche dès la
 * phase 2 à partir des données de base, avec la provenance de leurs entrées.
 *
 * Les dérivés qui demandent un modèle (croissance, indice de puissance, dépendance énergétique…)
 * relèvent de leur système et ne figurent pas ici.
 */
import type { Confidence, ParamValue, ResolvedValue } from '@geosim/shared';

export interface Derivation {
  /** Paramètre calculé. */
  id: string;
  /** Paramètres d'entrée, dans l'ordre des arguments de `compute`. */
  inputs: readonly string[];
  /** Formule lisible, en français. */
  formula: string;
  compute(values: readonly number[]): number;
}

export const DEFINITIONAL_DERIVATIONS: readonly Derivation[] = [
  {
    id: 'eco.gdp_per_capita',
    inputs: ['eco.gdp_nominal', 'demo.population'],
    formula: 'PIB nominal (Md$) × 10⁹ / population',
    // Une population nulle (entité sans habitant) donne un PIB par habitant nul, pas infini.
    compute: ([gdp = 0, population = 0]) => (population > 0 ? (gdp * 1e9) / population : 0),
  },
  {
    id: 'eco.misery_index',
    inputs: ['eco.inflation', 'eco.unemployment'],
    formula: 'inflation + chômage (indice d’Okun)',
    compute: ([inflation = 0, unemployment = 0]) => inflation + unemployment,
  },
  {
    id: 'mil.budget',
    inputs: ['eco.gdp_nominal', 'bud.defense'],
    formula: 'PIB nominal × part de la défense',
    compute: ([gdp = 0, share = 0]) => (gdp * share) / 100,
  },
  {
    id: 'dip.aid_given',
    inputs: ['eco.gdp_nominal', 'bud.foreign_aid'],
    formula: 'PIB nominal (approximation du RNB) × aide extérieure versée',
    compute: ([gdp = 0, share = 0]) => (gdp * share) / 100,
  },
  {
    id: 'energy.intensity',
    inputs: ['energy.primary_consumption', 'eco.gdp_nominal'],
    formula: 'consommation d’énergie primaire (TWh) / PIB nominal (Md$)',
    compute: ([energy = 0, gdp = 0]) => (gdp > 0 ? energy / gdp : 0),
  },
  {
    id: 'energy.import_dependence',
    inputs: [
      'energy.oil_consumption',
      'energy.gas_consumption',
      'energy.coal_consumption',
      'energy.oil_production',
      'energy.gas_production',
      'energy.coal_production',
      'energy.primary_consumption',
    ],
    formula:
      '(consommation − production de pétrole, de gaz et de charbon) / consommation d’énergie primaire',
    compute: ([oc = 0, gc = 0, cc = 0, op = 0, gp = 0, cp = 0, primary = 0]) =>
      primary > 0 ? ((oc + gc + cc - op - gp - cp) / primary) * 100 : 0,
  },
];

const derivationById = new Map(DEFINITIONAL_DERIVATIONS.map((d) => [d.id, d]));

export function derivationOf(id: string): Derivation | undefined {
  return derivationById.get(id);
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1, assumption: 0 };

/** Confiance la plus faible d'un ensemble de valeurs. */
export function weakestConfidence(
  values: readonly Pick<ResolvedValue, 'confidence'>[],
): Confidence {
  let worst: Confidence = 'high';
  for (const v of values) {
    if (CONFIDENCE_RANK[v.confidence] < CONFIDENCE_RANK[worst]) worst = v.confidence;
  }
  return worst;
}

function asNumber(v: ParamValue): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Calcule un dérivé et sa provenance : date la plus récente des entrées, confiance la plus
 * faible, sources citées dans la note. Renvoie null si une entrée manque ou n'est pas numérique.
 */
export function deriveValue(
  derivation: Derivation,
  lookup: (id: string) => ResolvedValue | undefined,
): ResolvedValue | null {
  const inputs: ResolvedValue[] = [];
  const numbers: number[] = [];
  for (const id of derivation.inputs) {
    const r = lookup(id);
    const x = r === undefined ? null : asNumber(r.value);
    if (r === undefined || x === null) return null;
    inputs.push(r);
    numbers.push(x);
  }
  const value = derivation.compute(numbers);
  if (!Number.isFinite(value)) return null;
  const date = inputs.map((r) => r.date).reduce((a, b) => (b > a ? b : a), '');
  const sources = inputs.map((r, k) => `${derivation.inputs[k]} : ${r.source}, ${r.date}`);
  return {
    value,
    source: 'DER',
    date,
    confidence: weakestConfidence(inputs),
    method: 'derived',
    note: `${derivation.formula} (${sources.join(' ; ')})`,
  };
}
