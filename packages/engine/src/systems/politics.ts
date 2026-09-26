/**
 * Politique intérieure (SPEC §8.5), pas mensuel ; élections à leur date (contrôle quotidien) ;
 * contestation et risque de coup recalculés après chaque commande.
 *
 * Stabilité : calée sur la situation de départ (WGI), elle suit les écarts de ses facteurs à leur
 * niveau de départ (DECISIONS D49) :
 *   S* = S₀ + Σ_k signe_k · a_k · (f_k(t) − f_k(0)) ;   S(t+1) = S + inertie · (S* − S)
 * facteurs : misère (chômage + inflation amortie), récession, tension alimentaire, pénurie
 * d'énergie, lassitude de la guerre (selon la tolérance aux pertes), ralliement au drapeau
 * (décroissant depuis le début de la guerre), inégalités, corruption, contrôle de l'information,
 * répression (hors démocraties), légitimité, fragmentation × insurrection, ingérence étrangère,
 * sanctions visant les élites, charge des réfugiés. Les chocs d'événements (défaut, coup d'État…)
 * sont des effets temporaires sur la valeur effective.
 *
 * Approbation du gouvernement : même principe, calée sur le début du gouvernement en place
 * (croissance, misère, prix alimentaires, pénuries, guerre, usure du pouvoir qui sature avec
 * l'ancienneté, état de grâce).
 * Légitimité : suit l'écart de l'approbation à son niveau de départ, autour de l'ancre du régime
 * (abaissée par un coup d'État) ; cohésion sociale : réfugiés, insurrection ; insurrection : croît
 * quand la stabilité s'enfonce sous un seuil de fragilité plus bas qu'au départ, d'autant plus que
 * la société est fragmentée (guerre civile au-delà d'un seuil).
 *
 * Élections (démocraties, à la date de `pol.next_election`) : probabilité d'alternance
 *   p = compétitivité · σ(pente · (seuil − approbation − prime au sortant))
 * compétitivité croissante avec la démocratie électorale (V-Dem). Alternance : le profil
 * d'opposition (`ai.opposition_profile`) remplace le profil décisionnel, qui devient l'opposition ;
 * nouveau gouvernement (approbation, ancienneté) ; une part des griefs et amitiés propres au
 * gouvernement sortant s'efface des relations. Élections anticipées possibles en crise politique.
 * Régimes autoritaires : coups d'État (risque selon le régime, la stabilité, la loyauté de
 * l'armée, la récession, les sanctions visant les élites, atténué par le revenu), transition des
 * juntes vers un régime civil, successions non planifiées (hors part compétitive du pouvoir),
 * révolutions (stabilité très basse, répression faible). Tirages désignés par une clé
 * (`keyedUniform`).
 */
import type { ParamValue } from '@geosim/shared';
import { keyedUniform } from '../rng.ts';
import { COUNTRY_NUMERIC, col, type State } from '../state.ts';
import type { Effect, Factor } from '../types.ts';
import type { System, SystemContext } from '../system.ts';
import { WAR, currentWarGrid, listOf, vectorValue } from './pairs.ts';
import { SANCTIONS_OUT } from './sanctions.ts';
import { memoryShock, resetResidual } from './diplomacy.ts';

const C = {
  stability: col('pol.stability'),
  approval: col('pol.approval'),
  legitimacy: col('pol.legitimacy'),
  cohesion: col('demo.social_cohesion'),
  insurgency: col('pol.insurgency'),
  coupRisk: col('pol.coup_risk'),
  tenure: col('pol.leader_tenure'),
  successionRisk: col('pol.succession_risk'),
  electoral: col('pol.electoral_democracy'),
  liberal: col('pol.liberal_democracy'),
  voice: col('pol.voice_accountability'),
  govEff: col('pol.gov_effectiveness'),
  corruption: col('pol.corruption_control'),
  repression: col('pol.repression_capacity'),
  information: col('pol.information_control'),
  loyalty: col('pol.military_loyalty'),
  tolerance: col('pol.casualty_tolerance'),
  interference: col('pol.interference_vulnerability'),
  ethnic: col('demo.ethnic_fractionalization'),
  religious: col('demo.religious_fractionalization'),
  gini: col('eco.gini'),
  inflation: col('eco.inflation'),
  unemployment: col('eco.unemployment'),
  growth: col('eco.growth'),
  food: col('res.food_stress'),
  energyGap: col('energy.supply_gap'),
  pop: col('demo.population'),
  gdp: col('eco.gdp_nominal'),
  refugees: col('demo.refugees_hosted'),
  infoWarfare: col('tech.info_warfare'),
};

const K = {
  inertia: 'politics.stability.inertia',
  misery: 'politics.stability.misery',
  inflationScale: 'politics.stability.inflation_scale',
  recession: 'politics.stability.recession',
  food: 'politics.stability.food',
  energy: 'politics.stability.energy_shortage',
  weariness: 'politics.stability.war_weariness',
  wearinessYears: 'politics.stability.weariness_years',
  rally: 'politics.stability.rally',
  rallyHalfLife: 'politics.stability.rally_half_life_months',
  inequality: 'politics.stability.inequality',
  corruption: 'politics.stability.corruption',
  information: 'politics.stability.information_control',
  repression: 'politics.stability.repression',
  legitimacy: 'politics.stability.legitimacy',
  fragmentation: 'politics.stability.fragmentation',
  interference: 'politics.stability.interference',
  elites: 'politics.stability.sanctions_elites',
  refugees: 'politics.stability.refugees',
  absorption: 'politics.stability.refugee_absorption',
  approvalInertia: 'politics.approval.inertia',
  approvalGrowth: 'politics.approval.growth',
  approvalMisery: 'politics.approval.misery',
  approvalFood: 'politics.approval.food',
  approvalEnergy: 'politics.approval.energy',
  approvalRally: 'politics.approval.rally',
  approvalWear: 'politics.approval.wear',
  approvalWearYears: 'politics.approval.wear_years',
  honeymoon: 'politics.approval.honeymoon',
  honeymoonMonths: 'politics.approval.honeymoon_half_life_months',
  newGovernment: 'politics.approval.new_government',
  legitimacyInertia: 'politics.legitimacy.inertia',
  legitimacyApproval: 'politics.legitimacy.approval',
  legitimacyVoice: 'politics.legitimacy.initial_voice_weight',
  cohesionInertia: 'politics.cohesion.inertia',
  cohesionRefugees: 'politics.cohesion.refugees',
  cohesionInsurgency: 'politics.cohesion.insurgency',
  cohesionEthnic: 'politics.cohesion.initial_ethnic',
  cohesionReligious: 'politics.cohesion.initial_religious',
  cohesionGini: 'politics.cohesion.initial_gini',
  cohesionGiniThreshold: 'politics.cohesion.initial_gini_threshold',
  insurgencyInertia: 'politics.insurgency.inertia',
  insurgencyStability: 'politics.insurgency.stability_effect',
  insurgencyThreshold: 'politics.insurgency.stability_threshold',
  insurgencyBase: 'politics.insurgency.base_sensitivity',
  civilWar: 'politics.insurgency.civil_war',
  civilWarEnd: 'politics.insurgency.civil_war_end',
  protests: 'politics.unrest.protests',
  crisis: 'politics.unrest.crisis',
  uprising: 'politics.unrest.uprising',
  unrestMargin: 'politics.unrest.margin',
  electionSlope: 'politics.elections.slope',
  electionThreshold: 'politics.elections.threshold',
  incumbency: 'politics.elections.incumbency',
  competitiveMin: 'politics.elections.competitive_min',
  competitiveMax: 'politics.elections.competitive_max',
  termYears: 'politics.elections.term_years',
  relationReset: 'politics.elections.relation_reset',
  earlyProbability: 'politics.elections.early_probability',
  earlyDelay: 'politics.elections.early_delay_days',
  coupJunta: 'politics.coups.base_junta',
  coupAutocracy: 'politics.coups.base_autocracy',
  coupHybrid: 'politics.coups.base_hybrid',
  coupFlawed: 'politics.coups.base_flawed_democracy',
  coupDemocracy: 'politics.coups.base_democracy',
  coupOther: 'politics.coups.base_other',
  coupStability: 'politics.coups.stability_slope',
  coupLoyalty: 'politics.coups.loyalty_slope',
  coupStabilityRef: 'politics.coups.stability_reference',
  coupLoyaltyRef: 'politics.coups.loyalty_reference',
  coupRecession: 'politics.coups.recession',
  coupElites: 'politics.coups.elites',
  coupIncome: 'politics.coups.income_reference',
  coupIncomeElasticity: 'politics.coups.income_elasticity',
  juntaTransition: 'politics.coups.junta_transition_rate',
  coupMax: 'politics.coups.max',
  coupShock: 'politics.coups.stability_shock',
  coupShockDays: 'politics.coups.shock_half_life_days',
  coupLegitimacy: 'politics.coups.legitimacy_factor',
  coupDemocracyFactor: 'politics.coups.democracy_factor',
  coupCondemnation: 'politics.coups.condemnation',
  coupCondemnationDemocracy: 'politics.coups.condemnation_democracy',
  successionShock: 'politics.succession.stability_shock',
  revolutionThreshold: 'politics.revolution.stability_threshold',
  revolutionRate: 'politics.revolution.rate',
  revolutionShock: 'politics.revolution.stability_shock',
  revolutionDemocracy: 'politics.revolution.transition_democracy',
  revolutionElection: 'politics.revolution.election_delay_days',
} as const;

const fin = (x: number): number => (Number.isFinite(x) ? x : 0);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Régimes où les élections peuvent changer le gouvernement (selon la démocratie électorale). */
const DEMOCRACIES = new Set(['democracy', 'flawed_democracy']);

// ——— Guerre : ralliement et lassitude ———

/** Mois depuis le début de la guerre en cours d'un pays (NaN : en paix). */
function warAge(state: State, i: number): number {
  const t = state.internalArray('pol.warSince', Number.NaN)[i] as number;
  return Number.isNaN(t) ? Number.NaN : (state.tick - t) / (365.25 / 12);
}

function rallyOf(m: SystemContext['model'], age: number): number {
  if (Number.isNaN(age)) return 0;
  return Math.pow(0.5, Math.max(0, age) / Math.max(1, m.get(K.rallyHalfLife)));
}

function wearinessOf(m: SystemContext['model'], age: number, tolerance: number): number {
  if (Number.isNaN(age)) return 0;
  const years = Math.max(0.1, m.get(K.wearinessYears));
  return (1 - clamp(tolerance, 0, 100) / 100) * Math.min(1, Math.max(0, age) / (years * 12));
}

/** Usure du pouvoir (0–1) : croît avec l'ancienneté puis sature (1 − e^(−ancienneté / durée)). */
function wearOf(m: SystemContext['model'], tenure: number): number {
  return 1 - Math.exp(-Math.max(0, tenure) / Math.max(0.1, m.get(K.approvalWearYears)));
}

// ——— Facteurs de la stabilité ———

interface StabilityFactor {
  id: string;
  label: string;
  coefficient: string;
  sign: 1 | -1;
  unit: string;
  value(ctx: Pick<SystemContext, 'model' | 'state'>, i: number, age: number): number;
}

function misery(ctx: Pick<SystemContext, 'model' | 'state'>, i: number): number {
  const S = ctx.state;
  const scale = Math.max(1, ctx.model.get(K.inflationScale));
  const pi = Math.max(0, fin(S.e(C.inflation)[i] as number));
  return fin(S.e(C.unemployment)[i] as number) + scale * Math.log(1 + pi / scale);
}

/** Pression d'ingérence : l'hostilité la plus forte d'une puissance capable d'influence. */
function hostilePressure(state: State, i: number): number {
  const n = state.n;
  const rel = state.pairMatrix('pair.relation');
  let worst = 0;
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const r = rel[j * n + i] as number;
    if (!(r < 0)) continue;
    const info = fin(state.e(C.infoWarfare)[j] as number) / 100;
    worst = Math.max(worst, (-r / 100) * info);
  }
  return worst;
}

/** Part de la population en réfugiés accueillis au-delà de la capacité d'absorption (%). */
function refugeeBurden(ctx: Pick<SystemContext, 'model' | 'state'>, i: number): number {
  const S = ctx.state;
  const pop = S.e(C.pop)[i] as number;
  if (!(pop > 0)) return 0;
  const share = (100 * Math.max(0, fin(S.e(C.refugees)[i] as number))) / pop;
  const absorption = ctx.model.get(K.absorption) * (fin(S.e(C.cohesion)[i] as number) / 50);
  return Math.max(0, share - absorption);
}

export const STABILITY_FACTORS: readonly StabilityFactor[] = [
  {
    id: 'eco.misery_index',
    label: 'Misère (chômage + inflation amortie)',
    coefficient: K.misery,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => misery(ctx, i),
  },
  {
    id: 'eco.growth',
    label: 'Récession',
    coefficient: K.recession,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => Math.max(0, -fin(ctx.state.e(C.growth)[i] as number)),
  },
  {
    id: 'res.food_stress',
    label: 'Tension alimentaire',
    coefficient: K.food,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => fin(ctx.state.e(C.food)[i] as number),
  },
  {
    id: 'energy.supply_gap',
    label: "Pénurie d'énergie",
    coefficient: K.energy,
    sign: -1,
    unit: '%',
    value: (ctx, i) => fin(ctx.state.e(C.energyGap)[i] as number),
  },
  {
    id: 'pol.casualty_tolerance',
    label: 'Lassitude de la guerre',
    coefficient: K.weariness,
    sign: -1,
    unit: '0–1',
    value: (ctx, i, age) => wearinessOf(ctx.model, age, fin(ctx.state.e(C.tolerance)[i] as number)),
  },
  {
    id: 'pol.war_rally',
    label: 'Ralliement au drapeau',
    coefficient: K.rally,
    sign: 1,
    unit: '0–1',
    value: (ctx, _i, age) => rallyOf(ctx.model, age),
  },
  {
    id: 'eco.gini',
    label: 'Inégalités (Gini)',
    coefficient: K.inequality,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => fin(ctx.state.e(C.gini)[i] as number),
  },
  {
    id: 'pol.corruption_control',
    label: 'Corruption',
    coefficient: K.corruption,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => 100 - fin(ctx.state.e(C.corruption)[i] as number),
  },
  {
    id: 'pol.information_control',
    label: "Contrôle de l'information",
    coefficient: K.information,
    sign: 1,
    unit: 'points',
    value: (ctx, i) => fin(ctx.state.e(C.information)[i] as number),
  },
  {
    id: 'pol.repression_capacity',
    label: 'Répression (hors démocratie)',
    coefficient: K.repression,
    sign: 1,
    unit: 'points',
    value: (ctx, i) =>
      fin(ctx.state.e(C.repression)[i] as number) *
      (1 - clamp(fin(ctx.state.e(C.electoral)[i] as number), 0, 1)),
  },
  {
    id: 'pol.legitimacy',
    label: 'Légitimité',
    coefficient: K.legitimacy,
    sign: 1,
    unit: 'points',
    value: (ctx, i) => fin(ctx.state.e(C.legitimacy)[i] as number),
  },
  {
    id: 'demo.social_cohesion',
    label: 'Fragmentation × insurrection',
    coefficient: K.fragmentation,
    sign: -1,
    unit: '0–1',
    value: (ctx, i) =>
      (1 - clamp(fin(ctx.state.e(C.cohesion)[i] as number), 0, 100) / 100) *
      (clamp(fin(ctx.state.e(C.insurgency)[i] as number), 0, 100) / 100),
  },
  {
    id: 'pol.interference_vulnerability',
    label: 'Ingérence étrangère',
    coefficient: K.interference,
    sign: -1,
    unit: '0–1',
    value: (ctx, i) =>
      (clamp(fin(ctx.state.e(C.interference)[i] as number), 0, 100) / 100) *
      hostilePressure(ctx.state, i),
  },
  {
    id: 'sanctions.elites',
    label: 'Sanctions visant les élites',
    coefficient: K.elites,
    sign: -1,
    unit: '0–1',
    value: (ctx, i) => ctx.state.internalArray(SANCTIONS_OUT.elite, 0)[i] as number,
  },
  {
    id: 'demo.refugees_hosted',
    label: 'Charge des réfugiés',
    coefficient: K.refugees,
    sign: -1,
    unit: '% pop.',
    value: (ctx, i) => refugeeBurden(ctx, i),
  },
];

const NF = STABILITY_FACTORS.length;

interface ApprovalFactor {
  id: string;
  label: string;
  coefficient: string;
  sign: 1 | -1;
  unit: string;
  value(
    ctx: Pick<SystemContext, 'model' | 'state'>,
    i: number,
    age: number,
    sinceMonths: number,
  ): number;
}

export const APPROVAL_FACTORS: readonly ApprovalFactor[] = [
  {
    id: 'eco.growth',
    label: 'Croissance',
    coefficient: K.approvalGrowth,
    sign: 1,
    unit: '%/an',
    value: (ctx, i) => fin(ctx.state.e(C.growth)[i] as number),
  },
  {
    id: 'eco.misery_index',
    label: 'Misère',
    coefficient: K.approvalMisery,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => misery(ctx, i),
  },
  {
    id: 'res.food_stress',
    label: 'Prix alimentaires',
    coefficient: K.approvalFood,
    sign: -1,
    unit: 'points',
    value: (ctx, i) => fin(ctx.state.e(C.food)[i] as number),
  },
  {
    id: 'energy.supply_gap',
    label: "Pénurie d'énergie",
    coefficient: K.approvalEnergy,
    sign: -1,
    unit: '%',
    value: (ctx, i) => fin(ctx.state.e(C.energyGap)[i] as number),
  },
  {
    id: 'pol.war_rally',
    label: 'Guerre (ralliement puis lassitude)',
    coefficient: K.approvalRally,
    sign: 1,
    unit: '−1–1',
    value: (ctx, i, age) =>
      rallyOf(ctx.model, age) -
      wearinessOf(ctx.model, age, fin(ctx.state.e(C.tolerance)[i] as number)),
  },
  {
    id: 'pol.leader_tenure',
    label: 'Usure du pouvoir',
    coefficient: K.approvalWear,
    sign: -1,
    unit: '0–1',
    value: (ctx, i) => wearOf(ctx.model, fin(ctx.state.e(C.tenure)[i] as number)),
  },
  {
    id: 'pol.honeymoon',
    label: 'État de grâce',
    coefficient: K.honeymoon,
    sign: 1,
    unit: '0–1',
    value: (ctx, _i, _age, since) =>
      Math.pow(0.5, Math.max(0, since) / Math.max(1, ctx.model.get(K.honeymoonMonths))),
  },
];

const NA = APPROVAL_FACTORS.length;

/** Valeurs des facteurs de la stabilité d'un pays à l'instant. */
function stabilityValues(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  i: number,
  age: number,
): Float64Array {
  return Float64Array.from(STABILITY_FACTORS, (f) => f.value(ctx, i, age));
}

/** Mois écoulés depuis l'arrivée du gouvernement en place. */
function monthsSinceGovernment(state: State, i: number): number {
  return fin(state.e(C.tenure)[i] as number) * 12;
}

function approvalValues(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  i: number,
  age: number,
): Float64Array {
  const since = monthsSinceGovernment(ctx.state, i);
  return Float64Array.from(APPROVAL_FACTORS, (f) => f.value(ctx, i, age, since));
}

/** Contributions des facteurs à la stabilité visée (écarts au départ × coefficient). */
export function stabilityContributions(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  i: number,
): { target: number; anchor: number; factors: Factor[] } {
  const S = ctx.state;
  const ref = S.internalArray('pol.stabilityRef', 0, S.n * NF);
  const anchor = S.base[C.stability * S.n + i] as number;
  const now = stabilityValues(ctx, i, warAge(S, i));
  let target = fin(anchor);
  const factors: Factor[] = [];
  STABILITY_FACTORS.forEach((f, k) => {
    const x = now[k] as number;
    const contribution = f.sign * ctx.model.get(f.coefficient) * (x - (ref[i * NF + k] as number));
    target += contribution;
    factors.push({ id: f.id, label: f.label, value: x, unit: f.unit, contribution });
  });
  return { target: clamp(target, 0, 100), anchor, factors };
}

export function approvalContributions(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  i: number,
): { target: number; anchor: number; factors: Factor[] } {
  const S = ctx.state;
  const ref = S.internalArray('pol.approvalRef', 0, S.n * NA);
  const anchor = S.internalArray('pol.approvalAnchor', Number.NaN)[i] as number;
  const now = approvalValues(ctx, i, warAge(S, i));
  let target = fin(anchor);
  const factors: Factor[] = [];
  APPROVAL_FACTORS.forEach((f, k) => {
    const x = now[k] as number;
    const contribution = f.sign * ctx.model.get(f.coefficient) * (x - (ref[i * NA + k] as number));
    target += contribution;
    factors.push({ id: f.id, label: f.label, value: x, unit: f.unit, contribution });
  });
  return { target: clamp(target, 0, 100), anchor, factors };
}

/** Contribution en deçà de laquelle un facteur n'est pas cité dans une explication (points). */
const SIGNIFICANT = 0.05;

/** Chocs temporaires sur la stabilité (modificateurs) : valeur effective − valeur courante. */
export function stabilityShock(state: State, i: number): number {
  return fin(state.effNow(C.stability, i)) - fin(state.v(C.stability)[i] as number);
}

// ——— Coups d'État ———

function coupBase(ctx: Pick<SystemContext, 'model'>, regime: ParamValue): number {
  const m = ctx.model;
  switch (regime) {
    case 'junta':
      return m.get(K.coupJunta);
    case 'autocracy':
      return m.get(K.coupAutocracy);
    case 'hybrid':
      return m.get(K.coupHybrid);
    case 'flawed_democracy':
      return m.get(K.coupFlawed);
    case 'democracy':
      return m.get(K.coupDemocracy);
    default:
      return m.get(K.coupOther);
  }
}

/** PIB par habitant en dollars du départ (0 si inconnu). */
function perCapitaIncome(state: State, i: number): number {
  const pop = state.e(C.pop)[i] as number;
  const gdp = state.e(C.gdp)[i] as number;
  const usd = state.worldInternal.get('usdPriceIndex') ?? 1;
  return pop > 0 && gdp > 0 ? (gdp * 1e9) / pop / usd : 0;
}

/**
 * Compétitivité des élections de l'exécutif (0–1), croissante avec la démocratie électorale
 * (V-Dem) entre deux seuils : elle règle la probabilité d'alternance et, à l'inverse, la part des
 * successions qui échappent à la constitution.
 */
function competitiveness(ctx: Pick<SystemContext, 'model' | 'state'>, i: number): number {
  const m = ctx.model;
  const ed = clamp(fin(ctx.state.e(C.electoral)[i] as number), 0, 1);
  const lo = m.get(K.competitiveMin);
  const hi = Math.max(lo + 1e-6, m.get(K.competitiveMax));
  return clamp((ed - lo) / (hi - lo), 0, 1);
}

/** Risque annuel de coup d'État (%) et ses facteurs. */
export function coupRisk(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  i: number,
): { risk: number; factors: Factor[] } {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (e === undefined || e.kind === 'faction') return { risk: 0, factors: [] };
  const regime = S.genericValue('pol.regime_type', i);
  const base = coupBase(ctx, regime);
  const stability = S.effNow(C.stability, i);
  const loyalty = fin(S.e(C.loyalty)[i] as number);
  const growth = fin(S.e(C.growth)[i] as number);
  const elite = S.internalArray(SANCTIONS_OUT.elite, 0)[i] as number;
  const elite0 = S.internalArray(SANCTIONS_OUT.elite0, 0)[i] as number;
  const fStability = Math.exp(
    (m.get(K.coupStability) * (m.get(K.coupStabilityRef) - stability)) / 10,
  );
  const fLoyalty = Math.exp((m.get(K.coupLoyalty) * (m.get(K.coupLoyaltyRef) - loyalty)) / 10);
  const fRecession = 1 + m.get(K.coupRecession) * Math.max(0, -growth);
  const fElites = 1 + m.get(K.coupElites) * Math.max(0, elite - elite0);
  // Revenu : au-delà d'un seuil, la richesse protège du coup d'État (Londregan et Poole, 1990 ;
  // Przeworski et Limongi, 1997) ; en deçà, le risque de base s'applique.
  const income = perCapitaIncome(S, i);
  const reference = Math.max(1, m.get(K.coupIncome));
  const fIncome =
    income > reference ? Math.pow(reference / income, m.get(K.coupIncomeElasticity)) : 1;
  const risk = Math.min(
    m.get(K.coupMax),
    base * fStability * fLoyalty * fRecession * fElites * fIncome,
  );
  return {
    risk,
    factors: [
      {
        id: 'pol.regime_type',
        label: `Risque de base (${String(regime)})`,
        value: base,
        unit: '%/an',
      },
      {
        id: 'pol.stability',
        label: 'Stabilité',
        value: stability,
        unit: 'indice',
        contribution: fStability,
      },
      {
        id: 'pol.military_loyalty',
        label: "Loyauté de l'armée",
        value: loyalty,
        unit: 'indice',
        contribution: fLoyalty,
      },
      {
        id: 'eco.growth',
        label: 'Croissance',
        value: growth,
        unit: '%/an',
        contribution: fRecession,
      },
      {
        id: 'sanctions.elites',
        label: 'Sanctions visant les élites (depuis le départ)',
        value: elite - elite0,
        unit: '0–1',
        contribution: fElites,
      },
      {
        id: 'eco.gdp_per_capita',
        label: 'PIB par habitant (dollars du départ)',
        value: income,
        unit: '$',
        contribution: fIncome,
      },
    ],
  };
}

/**
 * Niveau de contestation (0 calme, 1 manifestations, 2 crise, 3 soulèvement), avec une marge
 * d'hystérésis à la baisse (le niveau précédent ne se quitte qu'en repassant nettement le seuil).
 */
function unrestLevel(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  i: number,
  previous: number,
): number {
  const S = ctx.state;
  const m = ctx.model;
  const stability = S.effNow(C.stability, i);
  const insurgency = S.effNow(C.insurgency, i);
  const margin = m.get(K.unrestMargin);
  const thresholds = [m.get(K.protests), m.get(K.crisis), m.get(K.uprising)];
  let level = 0;
  thresholds.forEach((t, k) => {
    // Seuil du niveau k + 1 ; déjà atteint : on n'en sort qu'au-dessus de t + marge.
    const bound = previous >= k + 1 ? t + margin : t;
    if (stability < bound) level = k + 1;
  });
  if (insurgency >= m.get(K.civilWar)) level = 3;
  return level;
}

const UNREST = ['calm', 'protests', 'crisis', 'uprising'] as const;

// ——— Initialisation ———

/** Légitimité de départ : moyenne pondérée de la voix citoyenne et de l'efficacité de l'État (WGI). */
function initialLegitimacy(ctx: Pick<SystemContext, 'model' | 'state'>, i: number): number {
  const S = ctx.state;
  const w = clamp(ctx.model.get(K.legitimacyVoice), 0, 1);
  return clamp(
    w * fin(S.v(C.voice)[i] as number) + (1 - w) * fin(S.v(C.govEff)[i] as number),
    0,
    100,
  );
}

/** Cohésion sociale de départ : fragmentations ethnique et religieuse, inégalités. */
function initialCohesion(ctx: Pick<SystemContext, 'model' | 'state'>, i: number): number {
  const S = ctx.state;
  const m = ctx.model;
  const eth = clamp(fin(S.v(C.ethnic)[i] as number), 0, 1);
  const rel = clamp(fin(S.v(C.religious)[i] as number), 0, 1);
  const gini = fin(S.v(C.gini)[i] as number);
  return clamp(
    100 * (1 - m.get(K.cohesionEthnic) * eth - m.get(K.cohesionReligious) * rel) -
      m.get(K.cohesionGini) * Math.max(0, gini - m.get(K.cohesionGiniThreshold)),
    0,
    100,
  );
}

/** Début de la guerre en cours de chaque pays au départ (conflits interétatiques actifs). */
function initialWars(ctx: SystemContext): void {
  const S = ctx.state;
  const since = S.internalArray('pol.warSince', Number.NaN);
  since.fill(Number.NaN);
  const war = currentWarGrid(S);
  const n = S.n;
  for (const c of S.data.world.conflicts) {
    if (c.type !== 'interstate' || c.status !== 'active') continue;
    let start: number;
    try {
      start = ctx.calendar.tickOf(c.started);
    } catch {
      continue;
    }
    for (const code of [...c.sides.a, ...c.sides.b]) {
      const i = S.byId.get(code);
      if (i === undefined) continue;
      const prev = since[i] as number;
      since[i] = Number.isNaN(prev) ? start : Math.min(prev, start);
    }
  }
  // Pays en guerre selon les paires sans conflit daté : guerre commencée au départ.
  for (let i = 0; i < n; i++) {
    let atWar = false;
    for (let j = 0; j < n && !atWar; j++) if ((war[i * n + j] as number) === WAR.war) atWar = true;
    if (atWar && Number.isNaN(since[i] as number)) since[i] = 0;
    if (!atWar) since[i] = Number.NaN;
  }
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  initialWars(ctx);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(S.v(C.legitimacy)[i] as number)) {
      S.force(C.legitimacy, i, initialLegitimacy(ctx, i));
      S.base[C.legitimacy * n + i] = S.v(C.legitimacy)[i] as number;
    }
    if (!Number.isFinite(S.v(C.cohesion)[i] as number)) {
      S.force(C.cohesion, i, initialCohesion(ctx, i));
      S.base[C.cohesion * n + i] = S.v(C.cohesion)[i] as number;
    }
  }
  S.refreshEffective();
  const sRef = S.internalArray('pol.stabilityRef', 0, n * NF);
  const aRef = S.internalArray('pol.approvalRef', 0, n * NA);
  const anchor = S.internalArray('pol.approvalAnchor', Number.NaN);
  const approvalStart = S.internalArray('pol.approvalStart', Number.NaN);
  const legitimacyAnchor = S.internalArray('pol.legitimacyAnchor', Number.NaN);
  const level = S.internalArray('pol.unrestLevel', 0);
  const level0 = S.internalArray('pol.unrestLevel0', 0);
  const civilWar = S.internalArray('pol.civilWar', 0);
  for (let i = 0; i < n; i++) {
    sRef.set(stabilityValues(ctx, i, warAge(S, i)), i * NF);
    aRef.set(approvalValues(ctx, i, warAge(S, i)), i * NA);
    anchor[i] = fin(S.v(C.approval)[i] as number);
    approvalStart[i] = anchor[i] as number;
    legitimacyAnchor[i] = fin(S.v(C.legitimacy)[i] as number);
    level[i] = unrestLevel(ctx, i, 0);
    level0[i] = level[i] as number;
    civilWar[i] = S.effNow(C.insurgency, i) >= ctx.model.get(K.civilWar) ? 1 : 0;
  }
  derive(ctx);
}

// ——— Pas mensuel ———

function updateWars(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  const since = S.internalArray('pol.warSince', Number.NaN);
  const war = currentWarGrid(S);
  for (let i = 0; i < n; i++) {
    let atWar = false;
    for (let j = 0; j < n && !atWar; j++) if ((war[i * n + j] as number) === WAR.war) atWar = true;
    if (atWar && Number.isNaN(since[i] as number)) since[i] = S.tick;
    if (!atWar) since[i] = Number.NaN;
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const dt = ctx.dt;
  updateWars(ctx);
  const level = S.internalArray('pol.unrestLevel', 0);
  const civilWar = S.internalArray('pol.civilWar', 0);
  for (let i = 0; i < n; i++) {
    const e = S.entities[i];
    if (e === undefined) continue;
    // Stabilité.
    const st = stabilityContributions(ctx, i);
    const s = S.v(C.stability)[i] as number;
    if (Number.isFinite(s)) S.write(C.stability, i, s + m.get(K.inertia) * (st.target - s));

    // Approbation.
    const ap = approvalContributions(ctx, i);
    const a = S.v(C.approval)[i] as number;
    if (Number.isFinite(a)) S.write(C.approval, i, a + m.get(K.approvalInertia) * (ap.target - a));

    // Ancienneté du pouvoir en place.
    const tenure = S.v(C.tenure)[i] as number;
    if (Number.isFinite(tenure)) S.write(C.tenure, i, tenure + dt);

    // Légitimité : suit l'écart de l'approbation à son niveau de départ, autour de l'ancre du
    // régime (légitimité de départ, abaissée par un coup d'État).
    const l = S.v(C.legitimacy)[i] as number;
    const l0 = S.internalArray('pol.legitimacyAnchor', Number.NaN)[i] as number;
    const a0 = S.internalArray('pol.approvalStart', Number.NaN)[i] as number;
    const lTarget = clamp(
      fin(l0) + m.get(K.legitimacyApproval) * (S.effNow(C.approval, i) - fin(a0)),
      0,
      100,
    );
    if (Number.isFinite(l))
      S.write(C.legitimacy, i, l + m.get(K.legitimacyInertia) * (lTarget - l));

    // Cohésion sociale : réfugiés et insurrection l'érodent.
    const c = S.v(C.cohesion)[i] as number;
    const c0 = S.base[C.cohesion * n + i] as number;
    const i0 = fin(S.base[C.insurgency * n + i] as number);
    const cTarget = clamp(
      fin(c0) -
        m.get(K.cohesionRefugees) * refugeeBurden(ctx, i) -
        m.get(K.cohesionInsurgency) * Math.max(0, S.effNow(C.insurgency, i) - i0),
      0,
      100,
    );
    if (Number.isFinite(c)) S.write(C.cohesion, i, c + m.get(K.cohesionInertia) * (cTarget - c));

    // Insurrection : croît quand la stabilité s'enfonce sous le seuil de fragilité plus bas qu'au
    // départ (un État solide qui perd de sa stabilité ne voit pas naître d'insurrection).
    const ins = S.v(C.insurgency)[i] as number;
    const s0 = fin(S.base[C.stability * n + i] as number);
    const theta = m.get(K.insurgencyThreshold);
    const fragile = (x: number): number => Math.max(0, theta - x);
    const fragmentation = 1 - clamp(fin(S.effNow(C.cohesion, i)), 0, 100) / 100;
    const insTarget = clamp(
      i0 +
        m.get(K.insurgencyStability) *
          (fragile(S.effNow(C.stability, i)) - fragile(s0)) *
          (m.get(K.insurgencyBase) + fragmentation),
      0,
      100,
    );
    if (Number.isFinite(ins))
      S.write(C.insurgency, i, ins + m.get(K.insurgencyInertia) * (insTarget - ins));

    // Guerre civile : franchissement des seuils d'insurrection.
    const insNow = S.effNow(C.insurgency, i);
    if (insNow >= m.get(K.civilWar) && civilWar[i] === 0) {
      civilWar[i] = 1;
      ctx.emit({
        kind: 'civil_war',
        entities: [e.id],
        severity: 3,
        factors: [
          { id: 'pol.insurgency', label: 'Insurrection', value: insNow, unit: 'intensité' },
          {
            id: 'pol.stability',
            label: 'Stabilité',
            value: S.effNow(C.stability, i),
            unit: 'indice',
          },
          {
            id: 'demo.social_cohesion',
            label: 'Cohésion sociale',
            value: S.effNow(C.cohesion, i),
            unit: 'indice',
          },
          {
            id: 'politics.insurgency.civil_war',
            label: 'Seuil de guerre civile',
            value: m.get(K.civilWar),
            unit: 'intensité',
          },
        ],
        effects: [],
        note: 'Guerre civile : pertes économiques et départs de réfugiés ; le partage du territoire par des factions relève des fronts (phase 5).',
      });
    } else if (insNow < m.get(K.civilWarEnd) && civilWar[i] === 1) {
      civilWar[i] = 0;
      ctx.emit({
        kind: 'civil_war_end',
        entities: [e.id],
        severity: 2,
        factors: [
          { id: 'pol.insurgency', label: 'Insurrection', value: insNow, unit: 'intensité' },
        ],
        effects: [],
      });
    }
  }
  S.refreshEffective();

  // Contestation, élections anticipées, coups, successions, révolutions.
  const month = ctx.month;
  for (let i = 0; i < n; i++) {
    const e = S.entities[i];
    if (e === undefined || e.kind === 'faction') continue;
    const before = level[i] as number;
    const now = unrestLevel(ctx, i, before);
    if (now !== before) {
      if (now > before || now === 0) emitUnrest(ctx, i, before, now);
      level[i] = now;
    }
    const regime = S.genericValue('pol.regime_type', i);
    const democratic = DEMOCRACIES.has(String(regime));
    // Élections anticipées en crise politique (démocraties), quand la contestation dépasse son
    // niveau de départ (un pays en crise chronique n'appelle pas d'élections chaque année).
    const level0 = S.internalArray('pol.unrestLevel0', 0)[i] as number;
    if (democratic && now >= 2 && now > level0) {
      const u = keyedUniform(S.seed, `early|${e.id}|${month}`);
      if (u < m.get(K.earlyProbability)) callEarlyElection(ctx, i);
    }
    // Coup d'État.
    const { risk, factors } = coupRisk(ctx, i);
    const pCoup = 1 - Math.pow(1 - Math.min(0.99, risk / 100), ctx.dt);
    if (keyedUniform(S.seed, `coup|${e.id}|${month}`) < pCoup) {
      coup(ctx, i, factors, risk);
      continue;
    }
    // Transition d'une junte vers un régime civil (taux constant : durée moyenne des régimes
    // militaires).
    if (regime === 'junta') {
      const rate = clamp(m.get(K.juntaTransition), 0, 100) / 100;
      if (keyedUniform(S.seed, `transition|${e.id}|${month}`) < 1 - Math.pow(1 - rate, ctx.dt)) {
        juntaTransition(ctx, i, 100 * rate);
        continue;
      }
    }
    // Succession non planifiée (régimes non démocratiques : en démocratie, la succession est
    // réglée par la constitution sans changement de gouvernement ; dans un régime hybride, seule
    // la part non compétitive du pouvoir y échappe).
    const succession =
      (clamp(fin(S.e(C.successionRisk)[i] as number), 0, 100) / 100) *
      (1 - competitiveness(ctx, i));
    const u = keyedUniform(S.seed, `succession|${e.id}|${month}`);
    if (!democratic && u < 1 - Math.pow(1 - succession, ctx.dt)) {
      unplannedSuccession(ctx, i, succession * 100);
    }
    // Révolution : stabilité très basse et répression faible (régimes non démocratiques).
    if (!democratic) {
      const stability = S.effNow(C.stability, i);
      const threshold = m.get(K.revolutionThreshold);
      if (stability < threshold) {
        const repression =
          (fin(S.e(C.repression)[i] as number) / 100) * (fin(S.e(C.loyalty)[i] as number) / 100);
        const rate =
          (m.get(K.revolutionRate) / 100) *
          ((threshold - stability) / threshold) *
          (1 - clamp(repression, 0, 1));
        if (
          keyedUniform(S.seed, `revolution|${e.id}|${month}`) <
          1 - Math.pow(1 - Math.min(0.99, rate), ctx.dt)
        ) {
          revolution(ctx, i, stability, repression);
        }
      }
    }
  }
}

function emitUnrest(ctx: SystemContext, i: number, before: number, now: number): void {
  const S = ctx.state;
  const e = S.entities[i];
  if (!e) return;
  const kinds = ['calm_restored', 'protests', 'political_crisis', 'uprising'] as const;
  const st = stabilityContributions(ctx, i);
  const top = [...st.factors]
    .filter((f) => (f.contribution ?? 0) < -SIGNIFICANT)
    .sort((a, b) => (a.contribution ?? 0) - (b.contribution ?? 0))
    .slice(0, 4);
  // Chocs temporaires (défaut, coup d'État…) : écart entre la valeur effective et la valeur courante.
  const shock = stabilityShock(S, i);
  ctx.emit({
    kind: kinds[now] ?? 'protests',
    entities: [e.id],
    severity: now === 0 ? 0 : now === 1 ? 1 : now === 2 ? 2 : 3,
    factors: [
      { id: 'pol.stability', label: 'Stabilité', value: S.effNow(C.stability, i), unit: 'indice' },
      { id: 'pol.stability.start', label: 'Stabilité au départ', value: st.anchor, unit: 'indice' },
      {
        id: 'pol.stability.target',
        label: 'Stabilité visée (facteurs)',
        value: st.target,
        unit: 'indice',
      },
      ...(Math.abs(shock) > SIGNIFICANT
        ? [
            {
              id: 'pol.stability.shocks',
              label: 'Chocs temporaires (défaut, coup…)',
              value: shock,
              unit: 'points',
              contribution: shock,
            },
          ]
        : []),
      ...top,
    ],
    effects: [
      {
        slot: { scope: 'country', param: 'pol.unrest', entity: e.id },
        from: UNREST[before] ?? null,
        to: UNREST[now] ?? null,
      },
    ],
  });
}

function callEarlyElection(ctx: SystemContext, i: number): void {
  const S = ctx.state;
  const e = S.entities[i];
  if (!e) return;
  const date = ctx.calendar.isoAt(S.tick + Math.round(ctx.model.get(K.earlyDelay)));
  const current = S.genericValue('pol.next_election', i);
  if (typeof current === 'string' && current <= date) return;
  S.writeGeneric('pol.next_election', i, date);
  ctx.emit({
    kind: 'early_election',
    entities: [e.id],
    severity: 2,
    factors: [
      {
        id: 'pol.stability',
        label: 'Stabilité (crise politique)',
        value: S.effNow(C.stability, i),
        unit: 'indice',
      },
      {
        id: 'pol.approval',
        label: 'Soutien au gouvernement',
        value: S.effNow(C.approval, i),
        unit: '%',
      },
    ],
    effects: [
      {
        slot: { scope: 'country', param: 'pol.next_election', entity: e.id },
        from: current,
        to: date,
      },
    ],
  });
}

// ——— Changements de gouvernement ———

const PROFILE_IDS = COUNTRY_NUMERIC.filter((d) => d.category === 'profil').map((d) => d.id);

/** Remplace le profil décisionnel ; renvoie les effets (valeurs avant, après). */
function applyProfile(
  state: State,
  i: number,
  values: Record<string, number>,
  entity: string,
): Effect[] {
  const effects: Effect[] = [];
  for (const id of PROFILE_IDS) {
    const x = values[id];
    if (typeof x !== 'number' || !Number.isFinite(x)) continue;
    const p = col(id);
    const before = state.v(p)[i] as number;
    state.write(p, i, x);
    const after = state.v(p)[i] as number;
    if (before !== after)
      effects.push({ slot: { scope: 'country', param: id, entity }, from: before, to: after });
  }
  return effects;
}

function currentProfile(state: State, i: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of PROFILE_IDS) {
    const x = state.v(col(id))[i] as number;
    if (Number.isFinite(x)) out[id] = x;
  }
  return out;
}

/** Nouveau gouvernement : approbation, ancienneté, références de l'approbation. */
function newGovernment(ctx: SystemContext, i: number, approval: number): Effect[] {
  const S = ctx.state;
  const e = S.entities[i];
  if (!e) return [];
  const effects: Effect[] = [];
  const before = S.v(C.approval)[i] as number;
  S.write(C.approval, i, approval);
  effects.push({
    slot: { scope: 'country', param: 'pol.approval', entity: e.id },
    from: before,
    to: S.v(C.approval)[i] ?? null,
  });
  const tenure = S.v(C.tenure)[i] as number;
  S.write(C.tenure, i, 0);
  effects.push({
    slot: { scope: 'country', param: 'pol.leader_tenure', entity: e.id },
    from: tenure,
    to: 0,
  });
  S.refreshEffective();
  const anchor = S.internalArray('pol.approvalAnchor', Number.NaN);
  anchor[i] = S.effNow(C.approval, i);
  const ref = S.internalArray('pol.approvalRef', 0, S.n * NA);
  ref.set(approvalValues(ctx, i, warAge(S, i)), i * NA);
  return effects;
}

/** Élection à sa date (contrôle quotidien). */
function daily(ctx: SystemContext): boolean {
  const S = ctx.state;
  const today = ctx.calendar.isoAt(S.tick);
  let changed = false;
  for (let i = 0; i < S.n; i++) {
    const date = S.genericValue('pol.next_election', i);
    if (typeof date !== 'string' || date > today) continue;
    election(ctx, i, date);
    changed = true;
  }
  return changed;
}

function election(ctx: SystemContext, i: number, date: string): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (!e) return;
  const approval = S.effNow(C.approval, i);
  const ed = clamp(fin(S.e(C.electoral)[i] as number), 0, 1);
  const competitive = competitiveness(ctx, i);
  const logistic =
    1 /
    (1 +
      Math.exp(
        -m.get(K.electionSlope) * (m.get(K.electionThreshold) - approval - m.get(K.incumbency)),
      ));
  const p = competitive * logistic;
  const u = keyedUniform(S.seed, `election|${e.id}|${date}`);
  const alternance = u < p;
  // Prochaine élection : même jour, après la durée du mandat.
  const years = Math.max(1, Math.round(m.get(K.termYears)));
  const next = `${String(Number(date.slice(0, 4)) + years).padStart(4, '0')}${date.slice(4)}`;
  const nextDate = validDate(next);
  S.writeGeneric('pol.next_election', i, nextDate);
  const effects: Effect[] = [
    {
      slot: { scope: 'country', param: 'pol.next_election', entity: e.id },
      from: date,
      to: nextDate,
    },
  ];
  const factors: Factor[] = [
    { id: 'pol.approval', label: 'Soutien au gouvernement sortant', value: approval, unit: '%' },
    {
      id: 'pol.electoral_democracy',
      label: 'Démocratie électorale (compétitivité)',
      value: ed,
      unit: 'indice',
      contribution: competitive,
    },
    { id: 'eco.growth', label: 'Croissance', value: fin(S.e(C.growth)[i] as number), unit: '%/an' },
    { id: 'eco.misery_index', label: 'Misère', value: misery(ctx, i), unit: 'points' },
    {
      id: 'politics.elections.probability',
      label: "Probabilité d'alternance",
      value: 100 * p,
      unit: '%',
    },
  ];
  let note: string;
  if (alternance) {
    const opposition = vectorValue(S.genericValue('ai.opposition_profile', i));
    const hasProfile = PROFILE_IDS.some((id) => typeof opposition[id] === 'number');
    const previous = currentProfile(S, i);
    if (hasProfile) {
      effects.push(...applyProfile(S, i, opposition, e.id));
      const before = S.genericValue('ai.opposition_profile', i);
      S.writeGeneric('ai.opposition_profile', i, previous);
      effects.push({
        slot: { scope: 'country', param: 'ai.opposition_profile', entity: e.id },
        from: before,
        to: previous,
      });
    }
    effects.push(...newGovernment(ctx, i, m.get(K.newGovernment) + m.get(K.honeymoon)));
    resetResidual(S, i, m.get(K.relationReset));
    note = hasProfile
      ? "Alternance : le profil d'opposition devient le profil du gouvernement ; l'ancien profil devient l'opposition."
      : "Alternance : pas de profil d'opposition curé pour ce pays, profil décisionnel inchangé.";
  } else {
    note = 'Le gouvernement sortant est reconduit.';
  }
  ctx.emit({
    kind: alternance ? 'election_alternance' : 'election_continuity',
    entities: [e.id],
    severity: alternance ? 2 : 1,
    factors,
    effects,
    note,
  });
}

/** Date valide (le 29 février devient le 28 les années non bissextiles). */
function validDate(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number) as [number, number, number];
  if (mo === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) {
    return `${String(y).padStart(4, '0')}-02-28`;
  }
  return iso;
}

function profileDefaults(state: State, regime: string): Record<string, number> | null {
  return state.data.world.profileDefaults?.byRegime[regime] ?? null;
}

function setRegime(state: State, i: number, regime: string, entity: string): Effect {
  const before = state.genericValue('pol.regime_type', i);
  state.writeGeneric('pol.regime_type', i, regime);
  return { slot: { scope: 'country', param: 'pol.regime_type', entity }, from: before, to: regime };
}

function coup(ctx: SystemContext, i: number, factors: Factor[], risk: number): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (!e) return;
  const effects: Effect[] = [setRegime(S, i, 'junta', e.id)];
  const previous = currentProfile(S, i);
  const junta = profileDefaults(S, 'junta');
  if (junta) {
    effects.push(...applyProfile(S, i, junta, e.id));
    const before = S.genericValue('ai.opposition_profile', i);
    S.writeGeneric('ai.opposition_profile', i, previous);
    effects.push({
      slot: { scope: 'country', param: 'ai.opposition_profile', entity: e.id },
      from: before,
      to: previous,
    });
  }
  for (const p of [C.electoral, C.liberal]) {
    const x = S.v(p)[i] as number;
    if (Number.isFinite(x)) {
      S.write(p, i, x * m.get(K.coupDemocracyFactor));
      effects.push({
        slot: {
          scope: 'country',
          param: p === C.electoral ? 'pol.electoral_democracy' : 'pol.liberal_democracy',
          entity: e.id,
        },
        from: x,
        to: S.v(p)[i] ?? null,
      });
    }
  }
  const l = S.v(C.legitimacy)[i] as number;
  if (Number.isFinite(l)) {
    S.write(C.legitimacy, i, l * m.get(K.coupLegitimacy));
    effects.push({
      slot: { scope: 'country', param: 'pol.legitimacy', entity: e.id },
      from: l,
      to: S.v(C.legitimacy)[i] ?? null,
    });
  }
  const legitimacyAnchor = S.internalArray('pol.legitimacyAnchor', Number.NaN);
  legitimacyAnchor[i] = fin(legitimacyAnchor[i] as number) * m.get(K.coupLegitimacy);
  const election = S.genericValue('pol.next_election', i);
  S.writeGeneric('pol.next_election', i, null);
  effects.push({
    slot: { scope: 'country', param: 'pol.next_election', entity: e.id },
    from: election,
    to: null,
  });
  // Suspension des organisations qui l'exigent après un coup d'État (UA, CEDEAO).
  const memberships = listOf(S.genericValue('dip.memberships', i));
  const suspending = new Set(
    S.data.world.blocs.filter((b) => b.rules.suspends_after_coup === true).map((b) => b.id),
  );
  const kept = memberships.filter((b) => !suspending.has(b));
  if (kept.length !== memberships.length) {
    S.writeGeneric('dip.memberships', i, kept);
    effects.push({
      slot: { scope: 'country', param: 'dip.memberships', entity: e.id },
      from: memberships,
      to: kept,
    });
  }
  effects.push(...newGovernment(ctx, i, S.effNow(C.approval, i)));
  // Condamnation des démocraties (relations).
  for (let j = 0; j < S.n; j++) {
    if (j === i) continue;
    const ed = clamp(fin(S.e(C.electoral)[j] as number), 0, 1);
    if (ed > m.get(K.coupCondemnationDemocracy))
      memoryShock(S, j, i, -m.get(K.coupCondemnation) * ed);
  }
  ctx.emit({
    kind: 'coup',
    entities: [e.id],
    severity: 3,
    factors: [
      { id: 'pol.coup_risk', label: "Risque annuel de coup d'État", value: risk, unit: '%/an' },
      ...factors,
    ],
    effects,
    modifiers: [
      {
        slot: { scope: 'country', param: 'pol.stability', entity: e.id },
        spec: {
          op: 'add',
          amount: m.get(K.coupShock),
          durationDays: Math.round(4 * m.get(K.coupShockDays)),
          decay: 'exponential',
          halfLifeDays: m.get(K.coupShockDays),
          label: "Coup d'État",
        },
      },
    ],
    note: junta
      ? "L'armée prend le pouvoir : junte, profil décisionnel par défaut des juntes (defaults.yaml), élections suspendues."
      : "L'armée prend le pouvoir : junte, élections suspendues.",
  });
}

/**
 * Transition d'une junte vers un régime civil : elle organise une élection, que ses dirigeants
 * remportent le plus souvent (Tchad 2024, Gabon 2025) ; le régime devient hybride, le profil
 * décisionnel et les indices de démocratie restent ceux de la junte, les élections reprennent.
 */
function juntaTransition(ctx: SystemContext, i: number, rate: number): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (!e) return;
  const tenure = fin(S.v(C.tenure)[i] as number);
  const effects: Effect[] = [setRegime(S, i, 'hybrid', e.id)];
  const years = Math.max(1, Math.round(m.get(K.termYears)));
  const date = ctx.calendar.isoAt(S.tick + Math.round(years * 365.25));
  const election = S.genericValue('pol.next_election', i);
  S.writeGeneric('pol.next_election', i, date);
  effects.push({
    slot: { scope: 'country', param: 'pol.next_election', entity: e.id },
    from: election,
    to: date,
  });
  ctx.emit({
    kind: 'junta_transition',
    entities: [e.id],
    severity: 2,
    factors: [
      {
        id: 'politics.coups.junta_transition_rate',
        label: "Probabilité annuelle de transition d'une junte",
        value: rate,
        unit: '%/an',
      },
      {
        id: 'pol.leader_tenure',
        label: 'Ancienneté du pouvoir en place',
        value: tenure,
        unit: 'ans',
      },
    ],
    effects,
    note: 'La junte organise une élection et se maintient sous un régime civil (hybride) ; élections suivantes au terme du mandat.',
  });
}

function unplannedSuccession(ctx: SystemContext, i: number, risk: number): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (!e) return;
  const effects = newGovernment(ctx, i, S.effNow(C.approval, i));
  ctx.emit({
    kind: 'succession',
    entities: [e.id],
    severity: 2,
    factors: [
      {
        id: 'pol.succession_risk',
        label: 'Risque annuel de succession non planifiée',
        value: risk,
        unit: '%/an',
      },
      {
        id: 'pol.leader_tenure',
        label: 'Ancienneté du pouvoir sortant',
        value: fin((effects[1]?.from as number) ?? 0),
        unit: 'ans',
      },
    ],
    effects,
    modifiers: [
      {
        slot: { scope: 'country', param: 'pol.stability', entity: e.id },
        spec: {
          op: 'add',
          amount: m.get(K.successionShock),
          durationDays: Math.round(4 * m.get(K.coupShockDays)),
          decay: 'exponential',
          halfLifeDays: m.get(K.coupShockDays),
          label: 'Succession non planifiée',
        },
      },
    ],
    note: 'Succession non planifiée (décès ou incapacité du dirigeant) : le régime et son profil restent en place.',
  });
}

function revolution(ctx: SystemContext, i: number, stability: number, repression: number): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (!e) return;
  const effects: Effect[] = [setRegime(S, i, 'hybrid', e.id)];
  const previous = currentProfile(S, i);
  const defaults = profileDefaults(S, 'hybrid');
  if (defaults) {
    effects.push(...applyProfile(S, i, defaults, e.id));
    S.writeGeneric('ai.opposition_profile', i, previous);
  }
  const ed = S.v(C.electoral)[i] as number;
  if (Number.isFinite(ed)) S.write(C.electoral, i, Math.max(ed, m.get(K.revolutionDemocracy)));
  const date = ctx.calendar.isoAt(S.tick + Math.round(m.get(K.revolutionElection)));
  const election = S.genericValue('pol.next_election', i);
  S.writeGeneric('pol.next_election', i, date);
  effects.push({
    slot: { scope: 'country', param: 'pol.next_election', entity: e.id },
    from: election,
    to: date,
  });
  effects.push(...newGovernment(ctx, i, m.get(K.newGovernment)));
  resetResidual(S, i, 1);
  ctx.emit({
    kind: 'revolution',
    entities: [e.id],
    severity: 3,
    factors: [
      { id: 'pol.stability', label: 'Stabilité', value: stability, unit: 'indice' },
      {
        id: 'pol.repression_capacity',
        label: 'Répression effective (capacité × loyauté)',
        value: 100 * repression,
        unit: 'indice',
      },
      {
        id: 'politics.revolution.stability_threshold',
        label: 'Seuil de révolution',
        value: m.get(K.revolutionThreshold),
        unit: 'indice',
      },
    ],
    effects,
    modifiers: [
      {
        slot: { scope: 'country', param: 'pol.stability', entity: e.id },
        spec: {
          op: 'add',
          amount: m.get(K.revolutionShock),
          durationDays: Math.round(4 * m.get(K.coupShockDays)),
          decay: 'exponential',
          halfLifeDays: m.get(K.coupShockDays),
          label: 'Révolution',
        },
      },
    ],
    note: 'Le régime tombe : gouvernement de transition (régime hybride), élections dans un an.',
  });
}

// ——— Dérivés ———

function derive(ctx: SystemContext): void {
  const S = ctx.state;
  const level = S.internalArray('pol.unrestLevel', 0);
  for (let i = 0; i < S.n; i++) {
    S.write(C.coupRisk, i, coupRisk(ctx, i).risk);
    S.writeGeneric('pol.unrest', i, UNREST[unrestLevel(ctx, i, level[i] as number)] ?? 'calm');
  }
}

export const politics: System = {
  id: 'politics',
  coefficients: Object.values(K),
  writes: [
    'pol.stability',
    'pol.approval',
    'pol.legitimacy',
    'demo.social_cohesion',
    'pol.insurgency',
    'pol.coup_risk',
    'pol.leader_tenure',
    // Changements de gouvernement (alternance, coup d'État, révolution).
    'pol.electoral_democracy',
    'pol.liberal_democracy',
    ...PROFILE_IDS,
  ],
  init,
  monthly,
  daily,
  derive,
};
