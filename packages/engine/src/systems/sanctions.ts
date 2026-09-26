/**
 * Sanctions (SPEC §8.6), pas mensuel. Les effets commerciaux (volets commerce, énergie,
 * technologie, finance, transport sur chaque flux) sont dans le commerce ; ce système calcule, pour
 * chaque pays visé :
 *
 * - la pression financière : Σ_groupes monétaires  w_monnaie · part de réserve du groupe ·
 *   intensité maximale du volet finance dans le groupe  +  w_PIB · Σ_émetteurs intensité · part du
 *   PIB mondial (une union monétaire compte une fois : l'euro) ;
 * - les sanctions secondaires : puissance des monnaies de réserve des émetteurs (dollar, euro) ;
 * - la pression technologique : Σ intensité · (w_puces · part de la fabrication mondiale de puces
 *   + w_PIB · part du PIB mondial) de l'émetteur ; sur les élites : Σ intensité · part du PIB
 *   mondial ;
 * - le contournement : capacité du pays (`trade.sanction_evasion`) × (1 − force des sanctions
 *   secondaires) × maturité (1 − e^(−âge/délai)), l'âge repartant de zéro à chaque durcissement ;
 * - le gel des réserves : part des réserves détenues dans les monnaies des émetteurs, mesurée par
 *   rapport au départ (les données intègrent les gels en cours : Russie, Afghanistan…).
 *
 * Effets sur l'économie, par rapport au départ : choc financier (écart de production), prime de
 * risque souveraine, frein technologique sur la croissance potentielle (atténué par l'autonomie en
 * semi-conducteurs), exposition aux contrôles à l'exportation.
 */
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { membersByBloc, memberships } from './blocs.ts';
import { TRACKS, TRACK_INDEX, baseSanctionGrid, currentSanctionGrid } from './pairs.ts';

const C = {
  gdp: col('eco.gdp_nominal'),
  reserveCurrency: col('eco.reserve_currency'),
  chipFab: col('res.chip_fab_share'),
  evasion: col('trade.sanction_evasion'),
  integration: col('eco.financial_integration'),
  frozen: col('eco.reserves_frozen'),
  exposure: col('tech.export_control_exposure'),
  autonomy: col('tech.semiconductors'),
};

const K = {
  currencyWeight: 'diplomacy.sanctions.finance_currency_weight',
  gdpWeight: 'diplomacy.sanctions.finance_gdp_weight',
  techChipWeight: 'diplomacy.sanctions.tech_chip_weight',
  techGdpWeight: 'diplomacy.sanctions.tech_gdp_weight',
  secondary: 'diplomacy.sanctions.secondary_strength',
  evasionMonths: 'diplomacy.sanctions.evasion_months',
  newThreshold: 'diplomacy.sanctions.new_threshold',
  financialShock: 'economy.sanctions.financial_shock',
  spread: 'economy.sanctions.spread',
  techDrag: 'economy.sanctions.tech_drag',
} as const;

export const SANCTIONS_OUT = {
  evasion: 'sanctions.evasion',
  evasion0: 'sanctions.evasion0',
  finance: 'sanctions.finance',
  finance0: 'sanctions.finance0',
  secondary: 'sanctions.secondary',
  tech: 'sanctions.tech',
  tech0: 'sanctions.tech0',
  elite: 'sanctions.elite',
  elite0: 'sanctions.elite0',
  /** Choc financier du mois sur l'écart de production (points). */
  impulse: 'econ.impulse.sanctions',
  /** Prime de risque souveraine due aux sanctions (points de %). */
  spread: 'econ.spread.sanctions',
  /** Frein technologique sur la croissance potentielle (points de %/an, négatif). */
  techDrag: 'econ.drag.tech',
} as const;

const fin = (x: number): number => (Number.isFinite(x) ? x : 0);

export interface Pressures {
  finance: Float64Array;
  secondary: Float64Array;
  /** Part des réserves du pays visé détenue dans les monnaies de ses sanctionneurs. */
  frozenTarget: Float64Array;
  tech: Float64Array;
  elite: Float64Array;
  /** Pression d'ensemble (tous volets), pour détecter les durcissements. */
  overall: Float64Array;
}

/** Pressions des sanctions sur chaque pays, pour une grille de sanctions donnée. */
export function pressures(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  grid: Float32Array,
  base: boolean,
): Pressures {
  const m = ctx.model;
  const n = state.n;
  const n2 = n * n;
  const value = (p: number, i: number): number =>
    fin(base ? (state.base[p * n + i] as number) : (state.e(p)[i] as number));
  let world = 0;
  let chips = 0;
  for (let s = 0; s < n; s++) {
    if (state.entities[s]?.kind === 'faction') continue;
    world += Math.max(0, value(C.gdp, s));
    chips += Math.max(0, value(C.chipFab, s));
  }
  // Groupes monétaires : une union monétaire (euro, franc CFA) compte une fois.
  const lists = memberships(state, base);
  const unions = membersByBloc(state, lists);
  const group = new Int32Array(n).map((_, s) => s);
  for (const b of state.data.world.blocs) {
    if (b.kind !== 'monetary_union') continue;
    const members = unions.get(b.id) ?? [];
    const head = members[0];
    if (head === undefined) continue;
    for (const s of members) group[s] = head;
  }
  const fIdx = TRACK_INDEX.finance * n2;
  const tIdx = TRACK_INDEX.technology * n2;
  const eIdx = TRACK_INDEX.elites * n2;
  const out: Pressures = {
    finance: new Float64Array(n),
    secondary: new Float64Array(n),
    frozenTarget: new Float64Array(n),
    tech: new Float64Array(n),
    elite: new Float64Array(n),
    overall: new Float64Array(n),
  };
  const groupMax = new Map<number, number>();
  const techChip = ctx.model.get(K.techChipWeight);
  const techGdp = ctx.model.get(K.techGdpWeight);
  for (let i = 0; i < n; i++) {
    groupMax.clear();
    let financeGdp = 0;
    let tech = 0;
    let elite = 0;
    let overall = 0;
    for (let s = 0; s < n; s++) {
      if (s === i) continue;
      const k = s * n + i;
      const f = grid[fIdx + k] as number;
      const gdpShare = world > 0 ? Math.max(0, value(C.gdp, s)) / world : 0;
      if (f > 0) {
        const g = group[s] as number;
        groupMax.set(g, Math.max(groupMax.get(g) ?? 0, f));
        financeGdp += f * gdpShare;
      }
      const t = grid[tIdx + k] as number;
      if (t > 0) {
        const chipShare = chips > 0 ? Math.max(0, value(C.chipFab, s)) / chips : 0;
        tech += t * (techChip * chipShare + techGdp * gdpShare);
      }
      elite += (grid[eIdx + k] as number) * gdpShare;
      let mean = 0;
      for (let ti = 0; ti < TRACKS.length; ti++) mean += grid[ti * n2 + k] as number;
      overall += (mean / TRACKS.length) * gdpShare;
    }
    let currency = 0;
    for (const [g, f] of groupMax) currency += f * Math.max(0, value(C.reserveCurrency, g));
    out.finance[i] = Math.min(
      1,
      m.get(K.currencyWeight) * currency + m.get(K.gdpWeight) * financeGdp,
    );
    out.secondary[i] = Math.min(1, currency);
    out.frozenTarget[i] = Math.min(1, currency);
    out.tech[i] = Math.min(1, tech);
    out.elite[i] = Math.min(1, elite);
    out.overall[i] = overall;
  }
  return out;
}

function evasionOf(
  m: SystemContext['model'],
  capacity: number,
  secondary: number,
  ageMonths: number,
): number {
  const maturity = 1 - Math.exp(-Math.max(0, ageMonths) / Math.max(1, m.get(K.evasionMonths)));
  return Math.min(1, Math.max(0, capacity)) * (1 - m.get(K.secondary) * secondary) * maturity;
}

/** Âge d'un régime de sanctions installé au départ : pleinement mûr. */
const MATURE = 1e3;

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  const p0 = pressures(ctx, S, baseSanctionGrid(S), true);
  const age = S.internalArray('sanctions.age', MATURE);
  age.fill(MATURE);
  S.internalArray('sanctions.overall', 0).set(p0.overall);
  S.internalArray('sanctions.frozenTarget', 0).set(p0.frozenTarget);
  S.internalArray(SANCTIONS_OUT.impulse, 0);
  S.internalArray(SANCTIONS_OUT.spread, 0);
  S.internalArray(SANCTIONS_OUT.techDrag, 0);
  const ev0 = S.internalArray(SANCTIONS_OUT.evasion0, 0);
  for (let i = 0; i < n; i++) {
    ev0[i] = evasionOf(
      ctx.model,
      S.base[C.evasion * n + i] as number,
      p0.secondary[i] as number,
      MATURE,
    );
  }
  apply(ctx, p0, p0, false);
}

/** Écrit les pressions et leurs effets (par rapport au départ). */
function apply(ctx: SystemContext, p: Pressures, p0: Pressures, monthly: boolean): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const age = S.internalArray('sanctions.age', MATURE);
  const evasion = S.internalArray(SANCTIONS_OUT.evasion, 0);
  const impulse = S.internalArray(SANCTIONS_OUT.impulse, 0);
  const spread = S.internalArray(SANCTIONS_OUT.spread, 0);
  const drag = S.internalArray(SANCTIONS_OUT.techDrag, 0);
  const finance = S.internalArray(SANCTIONS_OUT.finance, 0);
  const tech = S.internalArray(SANCTIONS_OUT.tech, 0);
  const elite = S.internalArray(SANCTIONS_OUT.elite, 0);
  S.internalArray(SANCTIONS_OUT.finance0, 0).set(p0.finance);
  S.internalArray(SANCTIONS_OUT.tech0, 0).set(p0.tech);
  S.internalArray(SANCTIONS_OUT.elite0, 0).set(p0.elite);
  S.internalArray(SANCTIONS_OUT.secondary, 0).set(p.secondary);
  const targetPrev = S.internalArray('sanctions.frozenTarget', 0);
  for (let i = 0; i < n; i++) {
    const integration = Math.min(1, Math.max(0, fin(S.e(C.integration)[i] as number)));
    const integration0 = Math.min(1, Math.max(0, fin(S.base[C.integration * n + i] as number)));
    const exposure = (p.finance[i] as number) * integration;
    const exposure0 = (p0.finance[i] as number) * integration0;
    const before = (finance[i] as number) * integration;
    impulse[i] = monthly ? -m.get(K.financialShock) * (exposure - before) : 0;
    finance[i] = p.finance[i] as number;
    spread[i] = m.get(K.spread) * (exposure - exposure0);
    tech[i] = p.tech[i] as number;
    elite[i] = p.elite[i] as number;
    evasion[i] = evasionOf(
      m,
      S.e(C.evasion)[i] as number,
      p.secondary[i] as number,
      age[i] as number,
    );

    // Exposition aux contrôles à l'exportation : donnée de départ + écart de pression.
    const x0 = fin(S.base[C.exposure * n + i] as number);
    const x = Math.min(1, Math.max(0, x0 + (p.tech[i] as number) - (p0.tech[i] as number)));
    if (monthly) S.write(C.exposure, i, x);
    const autonomy = Math.min(1, Math.max(0, fin(S.e(C.autonomy)[i] as number) / 100));
    drag[i] = -m.get(K.techDrag) * (S.effNow(C.exposure, i) - x0) * (1 - autonomy);

    // Réserves gelées : ne bougent que si la part des réserves visée par les sanctions change
    // (une saisie de l'utilisateur est conservée sinon).
    const target = p.frozenTarget[i] as number;
    if (monthly && Math.abs(target - (targetPrev[i] as number)) > 1e-9) {
      const t0 = p0.frozenTarget[i] as number;
      const f0 = Math.min(1, Math.max(0, fin(S.base[C.frozen * n + i] as number) / 100));
      let f: number;
      if (target >= t0) f = t0 < 1 ? f0 + ((1 - f0) * (target - t0)) / (1 - t0) : f0;
      else f = t0 > 0 ? (f0 * target) / t0 : f0;
      S.write(C.frozen, i, 100 * Math.min(1, Math.max(0, f)));
    }
    targetPrev[i] = target;
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  const p = pressures(ctx, S, currentSanctionGrid(S), false);
  const p0 = pressures(ctx, S, baseSanctionGrid(S), true);
  const age = S.internalArray('sanctions.age', MATURE);
  const overallPrev = S.internalArray('sanctions.overall', 0);
  const threshold = ctx.model.get(K.newThreshold);
  for (let i = 0; i < n; i++) {
    // Durcissement : le contournement doit se réorganiser (âge remis à zéro).
    if ((p.overall[i] as number) > (overallPrev[i] as number) + threshold) age[i] = 0;
    else age[i] = Math.min(MATURE, (age[i] as number) + 1);
    overallPrev[i] = p.overall[i] as number;
  }
  apply(ctx, p, p0, true);
  const ev0 = S.internalArray(SANCTIONS_OUT.evasion0, 0);
  for (let i = 0; i < n; i++) {
    ev0[i] = evasionOf(
      ctx.model,
      S.base[C.evasion * n + i] as number,
      p0.secondary[i] as number,
      MATURE,
    );
  }
}

export const sanctions: System = {
  id: 'sanctions',
  coefficients: Object.values(K),
  writes: ['eco.reserves_frozen', 'tech.export_control_exposure'],
  init,
  monthly,
};
