/**
 * Budget, dette et taux souverains (SPEC §8.2), pas mensuel ; comptes recalculés à chaque
 * commande (un curseur budgétaire modifie aussitôt le solde).
 *
 *   recettes  = recettes (levier) · efficacité de collecte / efficacité initiale
 *               + part fiscale · (rentes d'hydrocarbures − rentes initiales)
 *   dépenses  = Σ postes (défense, social, santé, éducation, R&D, infrastructures, subventions,
 *               sécurité, aide) + autres dépenses (calées pour reproduire le solde initial du FMI)
 *               − ajustement de la règle budgétaire
 *   intérêts  = taux moyen apparent · dette ; solde = recettes − dépenses − intérêts
 *   dette(t+1) = (dette + déficit non monétisé · dt) / (croissance nominale du mois)
 *
 * Taux : taux de marché = taux moyen apparent initial + Δ taux directeur mondial + Δ inflation
 * anticipée + Δ prime de risque (notation). Le niveau initial vient des données (dette
 * concessionnelle comprise) ; seuls les écarts à la situation de départ font bouger les taux. Le
 * taux moyen converge vers le taux de marché au rythme du renouvellement de la dette (maturité).
 * Financement : les déficits sont couverts par le fonds souverain au prorata de sa taille (fonds
 * égal au PIB ou plus : entièrement), puis par la dette et la monétisation ; les excédents vont au
 * fonds (pays qui en ont un) ou au désendettement. En défaut, l'accès aux marchés est perdu : le
 * solde primaire doit revenir à l'équilibre (austérité).
 *
 * Règle budgétaire (en attendant les décisions des pays, phase 7) : le solde primaire se
 * rapproche du solde qui stabilise la dette, plus une réaction à la dette au-delà de son niveau
 * initial (Bohn, 1998).
 *
 * Notation : révisée périodiquement vers une notation implicite (dette, inflation, croissance
 * potentielle par rapport au départ). Défaut : tirage mensuel selon la probabilité annuelle liée à
 * la notation ; restructuration (décote) au bout d'une durée donnée.
 */
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { defaultProbability, expectedInflation, spreadOf } from './finance.ts';
import { reserveMonths } from './economy.ts';

const C = {
  revenue: col('bud.revenue'),
  taxEfficiency: col('bud.tax_efficiency'),
  defense: col('bud.defense'),
  social: col('bud.social'),
  health: col('bud.health'),
  education: col('bud.education'),
  rnd: col('bud.rnd'),
  infrastructure: col('bud.infrastructure'),
  subsidies: col('bud.subsidies'),
  security: col('bud.security'),
  foreignAid: col('bud.foreign_aid'),
  monetization: col('bud.monetization'),
  other: col('bud.other_spending'),
  adjustment: col('bud.fiscal_adjustment'),
  interest: col('bud.interest'),
  balance: col('bud.balance'),
  debt: col('eco.public_debt'),
  maturity: col('eco.debt_maturity'),
  avgRate: col('eco.debt_avg_rate'),
  sovereignRate: col('eco.sovereign_rate'),
  rating: col('eco.credit_rating'),
  defaultProbability: col('eco.default_probability'),
  fund: col('eco.sovereign_fund'),
  gdp: col('eco.gdp_nominal'),
  growth: col('eco.growth'),
  potential: col('eco.potential_growth'),
  inflation: col('eco.inflation'),
  target: col('eco.inflation_target'),
  cbi: col('eco.cb_independence'),
  oilRents: col('eco.oil_rents'),
  gasRents: col('eco.gas_rents'),
  govEff: col('pol.gov_effectiveness'),
  corruption: col('pol.corruption_control'),
  reservesMonths: col('eco.reserves_months'),
};

/** Postes de dépenses primaires (hors autres dépenses et ajustement). */
const SPENDING = [
  C.defense,
  C.social,
  C.health,
  C.education,
  C.rnd,
  C.infrastructure,
  C.subsidies,
  C.security,
  C.foreignAid,
];

const K = {
  taxBase: 'economy.budget.tax_efficiency_base',
  taxGovernance: 'economy.budget.tax_efficiency_governance',
  rentShare: 'economy.budget.rent_fiscal_share',
  surplusToFund: 'economy.budget.surplus_to_fund',
  debtReaction: 'economy.budget.debt_reaction',
  consolidation: 'economy.budget.consolidation_speed',
  maxAdjustment: 'economy.budget.max_adjustment',
  fisher: 'economy.rates.inflation_passthrough',
  floor: 'economy.rates.floor',
  reviewMonths: 'economy.rating.review_months',
  debtNotch: 'economy.rating.debt_per_notch',
  inflationNotch: 'economy.rating.inflation_per_notch',
  growthNotch: 'economy.rating.growth_per_notch',
  maxUpgrade: 'economy.rating.max_upgrade',
  defaultGrowth: 'economy.default.growth_shock',
  defaultGrowthDays: 'economy.default.growth_shock_days',
  defaultStability: 'economy.default.stability_shock',
  defaultStabilityHalfLife: 'economy.default.stability_half_life_days',
  defaultMonths: 'economy.default.duration_months',
  haircut: 'economy.default.haircut',
  postRating: 'economy.default.post_default_rating',
  austerity: 'economy.default.austerity_speed',
  fundDrawdown: 'economy.budget.fund_drawdown',
} as const;

export interface BudgetAccounts {
  revenue: number;
  primarySpending: number;
  interest: number;
  balance: number;
}

/** Comptes budgétaires instantanés d'un pays (% du PIB). */
export function budgetAccounts(
  state: State,
  ctx: Pick<SystemContext, 'model'>,
  i: number,
): BudgetAccounts {
  const S = state;
  const N = S.n;
  const te0 = S.base[C.taxEfficiency * N + i] as number;
  const te = S.effNow(C.taxEfficiency, i);
  const rents0 = (S.base[C.oilRents * N + i] as number) + (S.base[C.gasRents * N + i] as number);
  const rents = S.effNow(C.oilRents, i) + S.effNow(C.gasRents, i);
  const rentDelta = Number.isFinite(rents0) && Number.isFinite(rents) ? rents - rents0 : 0;
  const revenue =
    S.effNow(C.revenue, i) * (te0 > 0 ? te / te0 : 1) + ctx.model.get(K.rentShare) * rentDelta;
  let primary = S.effNow(C.other, i) - S.effNow(C.adjustment, i);
  for (const p of SPENDING) {
    const x = S.effNow(p, i);
    if (Number.isFinite(x)) primary += x;
  }
  const interest = (S.effNow(C.avgRate, i) * S.effNow(C.debt, i)) / 100;
  return { revenue, primarySpending: primary, interest, balance: revenue - primary - interest };
}

/**
 * Références de départ du taux de marché, recalculées avec les coefficients courants : inflation
 * anticipée et prime de risque au départ. Un coefficient modifié en cours de partie ne crée donc
 * pas de saut artificiel des taux (le calage sur la situation initiale reste exact).
 */
function initialRateTerms(state: State, m: SystemContext['model'], i: number) {
  const S = state;
  const N = S.n;
  const expected0 = expectedInflation(
    m,
    S.base[C.cbi * N + i] as number,
    S.base[C.target * N + i] as number,
    S.base[C.inflation * N + i] as number,
  );
  // Un pays en défaut au départ paie le taux de sa dette restructurée : sa prime de référence
  // est celle d'après la restructuration.
  const inDefault0 = S.genericBaseValue('eco.in_default', i) === true;
  const spread0 = inDefault0
    ? spreadOf(m, m.get(K.postRating), false)
    : spreadOf(m, S.base[C.rating * N + i] as number, false);
  return { expected0, spread0 };
}

/** Taux de marché de la dette souveraine (%). */
export function marketRate(state: State, ctx: Pick<SystemContext, 'model'>, i: number): number {
  const S = state;
  const m = ctx.model;
  const reference = S.internalArray('budget.referenceRate', 0)[i] as number;
  const { expected0, spread0 } = initialRateTerms(S, m, i);
  const policy0 = S.worldInternal.get('budget.policyRate0') ?? 0;
  const expected = expectedInflation(
    m,
    S.effNow(C.cbi, i),
    S.effNow(C.target, i),
    S.effNow(C.inflation, i),
  );
  const inDefault = S.genericValue('eco.in_default', i) === true;
  const rate =
    reference +
    (S.worldEff('world.policy_rate') - policy0) +
    m.get(K.fisher) * (expected - expected0) +
    spreadOf(m, S.effNow(C.rating, i), inDefault) -
    spread0;
  return Math.max(m.get(K.floor), rate);
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const N = S.n;
  S.worldInternal.set('budget.policyRate0', S.worldEff('world.policy_rate'));
  const reference = S.internalArray('budget.referenceRate', 0);
  S.internalArray('budget.defaultMonths', 0);
  for (let i = 0; i < N; i++) {
    // Efficacité de collecte (levier) : calculée depuis la gouvernance.
    const te = Math.min(
      1,
      m.get(K.taxBase) +
        (m.get(K.taxGovernance) *
          ((S.v(C.govEff)[i] as number) + (S.v(C.corruption)[i] as number))) /
          200,
    );
    S.force(C.taxEfficiency, i, te);
    S.base[C.taxEfficiency * N + i] = S.v(C.taxEfficiency)[i] as number;

    // Défaut en cours au départ : notation D ou SD (0).
    const rating = S.v(C.rating)[i] as number;
    const inDefault = rating <= 0;
    S.writeGeneric('eco.in_default', i, inDefault);
    S.setGenericBase('eco.in_default', i, inDefault);

    // Taux de référence : taux moyen apparent (données) ; à défaut, inflation anticipée + prime
    // de départ (voir `initialRateTerms`).
    let avg = S.v(C.avgRate)[i] as number;
    if (!Number.isFinite(avg)) {
      const { expected0, spread0 } = initialRateTerms(S, m, i);
      avg = Math.max(0, expected0 + spread0);
      S.force(C.avgRate, i, avg);
      S.base[C.avgRate * N + i] = avg;
    }
    reference[i] = avg;

    S.force(C.adjustment, i, 0);
    S.base[C.adjustment * N + i] = 0;
    S.force(C.other, i, 0);
  }
  // Autres dépenses : calées pour que le solde initial soit celui des données (FMI).
  S.refreshEffective();
  for (let i = 0; i < N; i++) {
    const target = S.base[C.balance * N + i] as number;
    const accounts = budgetAccounts(S, ctx, i);
    const other = Number.isFinite(target) ? accounts.balance - target : 0;
    S.force(C.other, i, other);
    S.base[C.other * N + i] = S.v(C.other)[i] as number;
  }
  S.refreshEffective();
}

function derive(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  for (let i = 0; i < S.n; i++) {
    const a = budgetAccounts(S, ctx, i);
    S.write(C.interest, i, a.interest);
    S.write(C.balance, i, a.balance);
    S.write(C.sovereignRate, i, marketRate(S, ctx, i));
    const inDefault = S.genericValue('eco.in_default', i) === true;
    S.write(
      C.defaultProbability,
      i,
      inDefault ? 100 : defaultProbability(m, S.effNow(C.rating, i)),
    );
    S.write(C.reservesMonths, i, reserveMonths(S, i));
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const N = S.n;
  const dt = ctx.dt;
  const rng = S.rng('budget.default');
  const draws = new Float64Array(N);
  for (let i = 0; i < N; i++) draws[i] = rng.nextFloat();
  const growthFactor = S.internalArray('econ.monthlyGrowthFactor', 1);
  const defaultMonths = S.internalArray('budget.defaultMonths', 0);
  const review = ctx.month % Math.max(1, Math.round(m.get(K.reviewMonths))) === 0;

  for (let i = 0; i < N; i++) {
    const e = S.entities[i];
    const gdp = S.effNow(C.gdp, i);
    if (e === undefined || !(gdp > 0)) continue;
    const accounts = budgetAccounts(S, ctx, i);
    const inDefault = S.genericValue('eco.in_default', i) === true;

    // Dette : déficit couvert par le fonds souverain (au prorata de sa taille), puis par la dette
    // (part non monétisée) ; excédents vers le fonds souverain ; croissance nominale.
    const debt = S.v(C.debt)[i] as number;
    const monetized = Math.min(1, Math.max(0, S.effNow(C.monetization, i) / 100));
    const fund = S.v(C.fund)[i] as number;
    let toDebt: number;
    let toFund: number;
    if (accounts.balance < 0) {
      const deficit = -accounts.balance;
      const fundShare = fund > 0 ? Math.min(1, (m.get(K.fundDrawdown) * fund) / gdp) : 0;
      // Le fonds ne peut fournir plus que ce qu'il contient ce mois-ci (en % du PIB annuel).
      const fromFund = Math.min(deficit * fundShare, ((fund / gdp) * 100) / dt);
      toFund = -fromFund;
      toDebt = (deficit - fromFund) * (1 - monetized);
    } else {
      toFund = fund > 0 ? accounts.balance * m.get(K.surplusToFund) : 0;
      toDebt = -(accounts.balance - toFund);
    }
    let nextDebt = debt + toDebt * dt;
    if (nextDebt < 0) {
      toFund += -nextDebt / dt;
      nextDebt = 0;
    }
    const nominal = (growthFactor[i] as number) * Math.pow(1 + S.effNow(C.inflation, i) / 100, dt);
    S.write(C.debt, i, nextDebt / nominal);
    if (toFund !== 0) S.write(C.fund, i, Math.max(0, fund + (toFund / 100) * gdp * dt));

    // Taux moyen : converge vers le taux de marché (gelé pendant un défaut).
    const avg = S.v(C.avgRate)[i] as number;
    if (!inDefault) {
      const maturity = Math.max(0.5, S.effNow(C.maturity, i));
      S.write(C.avgRate, i, Math.max(0, avg + ((marketRate(S, ctx, i) - avg) * dt) / maturity));
    }

    // Règle budgétaire : rapprocher le solde primaire du solde qui stabilise la dette.
    const primaryBalance = accounts.revenue - accounts.primarySpending;
    const expected = expectedInflation(
      m,
      S.effNow(C.cbi, i),
      S.effNow(C.target, i),
      S.effNow(C.inflation, i),
    );
    const nominalTrend = S.effNow(C.potential, i) + expected;
    const debtNow = S.effNow(C.debt, i);
    const stabilizing = ((S.effNow(C.avgRate, i) - nominalTrend) / (100 + nominalTrend)) * debtNow;
    let targetBalance =
      stabilizing + m.get(K.debtReaction) * (debtNow - (S.base[C.debt * N + i] as number));
    let speed = m.get(K.consolidation);
    if (inDefault) {
      // Sans accès aux marchés, le solde primaire doit revenir à l'équilibre.
      targetBalance = Math.max(targetBalance, 0);
      speed = Math.max(speed, m.get(K.austerity));
    }
    const adjustment = S.v(C.adjustment)[i] as number;
    const maxAdj = m.get(K.maxAdjustment);
    S.write(
      C.adjustment,
      i,
      Math.min(
        maxAdj,
        Math.max(-maxAdj, adjustment + speed * dt * (targetBalance - primaryBalance)),
      ),
    );

    // Défaut en cours : restructuration au bout de la durée prévue.
    if (inDefault) {
      defaultMonths[i] = (defaultMonths[i] as number) + 1;
      if ((defaultMonths[i] as number) >= m.get(K.defaultMonths)) restructure(ctx, i);
      continue;
    }

    // Révision de la notation vers la notation implicite.
    if (review) reviewRating(ctx, i);

    // Défaut souverain : tirage selon la probabilité annuelle liée à la notation.
    if (e.kind !== 'faction') {
      const pd = defaultProbability(m, S.effNow(C.rating, i)) / 100;
      const monthly = 1 - Math.pow(1 - pd, dt);
      if ((draws[i] as number) < monthly) sovereignDefault(ctx, i, pd * 100, accounts);
    }
  }
}

function reviewRating(ctx: SystemContext, i: number): void {
  const S = ctx.state;
  const m = ctx.model;
  const N = S.n;
  const rating0 = S.base[C.rating * N + i] as number;
  if (!(rating0 > 0)) return;
  const implied =
    rating0 -
    (S.effNow(C.debt, i) - (S.base[C.debt * N + i] as number)) / m.get(K.debtNotch) -
    Math.max(0, S.effNow(C.inflation, i) - (S.base[C.inflation * N + i] as number)) /
      m.get(K.inflationNotch) +
    (S.effNow(C.potential, i) - (S.base[C.potential * N + i] as number)) / m.get(K.growthNotch);
  const bounded = Math.min(20, rating0 + m.get(K.maxUpgrade), Math.max(1, implied));
  const rating = S.v(C.rating)[i] as number;
  if (bounded >= rating + 1) S.write(C.rating, i, Math.min(20, rating + 1));
  else if (bounded <= rating - 1) S.write(C.rating, i, Math.max(1, rating - 1));
}

function sovereignDefault(
  ctx: SystemContext,
  i: number,
  pd: number,
  accounts: BudgetAccounts,
): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (e === undefined) return;
  const rating = S.v(C.rating)[i] as number;
  const interestShare = accounts.revenue > 0 ? (100 * accounts.interest) / accounts.revenue : 0;
  S.writeGeneric('eco.in_default', i, true);
  S.write(C.rating, i, 0);
  S.internalArray('budget.defaultMonths', 0)[i] = 0;
  ctx.emit({
    kind: 'default',
    entities: [e.id],
    severity: 3,
    factors: [
      { id: 'eco.credit_rating', label: 'Notation souveraine', value: rating, unit: 'cran' },
      {
        id: 'eco.default_probability',
        label: 'Probabilité annuelle de défaut',
        value: pd,
        unit: '%/an',
      },
      { id: 'eco.public_debt', label: 'Dette publique', value: S.effNow(C.debt, i), unit: '% PIB' },
      { id: 'bud.interest', label: 'Intérêts / recettes', value: interestShare, unit: '%' },
      {
        id: 'eco.sovereign_rate',
        label: 'Taux souverain',
        value: S.effNow(C.sovereignRate, i),
        unit: '%',
      },
      { id: 'eco.growth', label: 'Croissance', value: S.effNow(C.growth, i), unit: '%/an' },
      {
        id: 'eco.reserves_months',
        label: "Réserves en mois d'importations",
        value: S.effNow(C.reservesMonths, i),
        unit: 'mois',
      },
    ],
    effects: [
      { slot: { scope: 'country', param: 'eco.in_default', entity: e.id }, from: false, to: true },
      {
        slot: { scope: 'country', param: 'eco.credit_rating', entity: e.id },
        from: rating,
        to: S.v(C.rating)[i] ?? null,
      },
    ],
    modifiers: [
      {
        slot: { scope: 'country', param: 'eco.potential_growth', entity: e.id },
        spec: {
          op: 'add',
          amount: m.get(K.defaultGrowth),
          durationDays: m.get(K.defaultGrowthDays),
          decay: 'linear',
          label: 'Défaut souverain',
        },
      },
      {
        slot: { scope: 'country', param: 'pol.stability', entity: e.id },
        spec: {
          op: 'add',
          amount: m.get(K.defaultStability),
          durationDays: 4 * m.get(K.defaultStabilityHalfLife),
          decay: 'exponential',
          halfLifeDays: m.get(K.defaultStabilityHalfLife),
          label: 'Défaut souverain',
        },
      },
    ],
  });
}

function restructure(ctx: SystemContext, i: number): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (e === undefined) return;
  const debt = S.v(C.debt)[i] as number;
  S.write(C.debt, i, debt * (1 - m.get(K.haircut) / 100));
  const rating = S.v(C.rating)[i] as number;
  S.write(C.rating, i, m.get(K.postRating));
  S.writeGeneric('eco.in_default', i, false);
  // Les titres échangés portent de nouveaux coupons : le taux moyen repart du taux de marché
  // d'après la restructuration (sinon les intérêts d'avant le défaut relanceraient la spirale).
  const rateBefore = S.v(C.avgRate)[i] as number;
  S.write(C.avgRate, i, Math.min(rateBefore, marketRate(S, ctx, i)));
  ctx.emit({
    kind: 'default_exit',
    entities: [e.id],
    severity: 1,
    factors: [
      {
        id: 'economy.default.duration_months',
        label: 'Durée du défaut',
        value: m.get(K.defaultMonths),
        unit: 'mois',
      },
      { id: 'economy.default.haircut', label: 'Décote', value: m.get(K.haircut), unit: '%' },
    ],
    effects: [
      {
        slot: { scope: 'country', param: 'eco.public_debt', entity: e.id },
        from: debt,
        to: S.v(C.debt)[i] ?? null,
      },
      {
        slot: { scope: 'country', param: 'eco.credit_rating', entity: e.id },
        from: rating,
        to: S.v(C.rating)[i] ?? null,
      },
      { slot: { scope: 'country', param: 'eco.in_default', entity: e.id }, from: true, to: false },
      {
        slot: { scope: 'country', param: 'eco.debt_avg_rate', entity: e.id },
        from: rateBefore,
        to: S.v(C.avgRate)[i] ?? null,
      },
    ],
  });
}

export const budget: System = {
  id: 'budget',
  coefficients: Object.values(K),
  writes: [
    'bud.tax_efficiency',
    'bud.other_spending',
    'bud.fiscal_adjustment',
    'bud.interest',
    'bud.balance',
    'eco.public_debt',
    'eco.debt_avg_rate',
    'eco.sovereign_rate',
    'eco.credit_rating',
    'eco.default_probability',
    'eco.sovereign_fund',
    'eco.reserves_months',
  ],
  init,
  monthly,
  derive,
};
