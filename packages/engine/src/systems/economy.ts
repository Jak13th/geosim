/**
 * Économie (SPEC §8.2), pas mensuel : croissance potentielle et de long terme, écart de
 * production, PIB, inflation, chômage, rentes, solde courant, réserves, crise de balance des
 * paiements.
 *
 * Principe : les niveaux initiaux viennent des données ; le modèle simule les écarts à la
 * situation de départ (déjà intégrée aux projections du FMI qui fixent la croissance potentielle).
 * Les termes de choc sont donc mesurés par rapport à l'état initial.
 *
 * Croissance (taux annuels, %) :
 *   g_structurelle = g_pot − e_stab·[pénalité(S) − pénalité(S₀)] − e_debt·[excès(d)·prime − excès(d₀)·prime₀]
 *                  + e_inv·(investissement public − initial)
 *   écart x (en % du PIB potentiel) : x(t+1) = φ·x(t) + (1 − φ)·e_trade·Σ_j (exportations i→j / PIB_i)·x_j
 *                  + impulsion énergie + ε,   ε ~ N(0, σ_pays)
 *   PIB en volume = PIB potentiel · (1 + x) ; le PIB potentiel croît au rythme g_structurelle.
 *   La croissance affichée est le glissement sur douze mois.
 * La croissance potentielle converge vers la croissance de long terme :
 *   g_LT = progrès de la frontière + β·ln(frontière / revenu)·institutions + α·croissance des 15–64 ans
 * Inflation : π = cœur + chocs de prix importés (énergie, alimentation, dévaluation, qui s'estompent
 * en douze mois) ; le cœur converge vers l'ancrage (cible, indépendance de la banque centrale),
 * plus la surchauffe (écart de production), la monétisation du déficit et une part des chocs.
 * Chômage : loi d'Okun sur l'écart de production, retour lent vers le taux initial.
 */
import { NUMERAIRE } from '../constants.ts';
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { realIncomePpp } from './demography.ts';
import {
  baseEnergyQuotes,
  capacityKeyOf,
  energyContent,
  energyPricesPerMwh,
  energyQuotes,
  gasZoneOf,
  perMwh,
  type EnergyPrices,
  type GasZone,
} from './markets.ts';
import { expectedInflation, spreadOf } from './finance.ts';

const C = {
  pop: col('demo.population'),
  gdp: col('eco.gdp_nominal'),
  gdpPpp: col('eco.gdp_ppp'),
  potential: col('eco.potential_growth'),
  longRun: col('eco.long_run_growth'),
  growth: col('eco.growth'),
  gap: col('eco.output_gap'),
  inflation: col('eco.inflation'),
  target: col('eco.inflation_target'),
  cbi: col('eco.cb_independence'),
  unemployment: col('eco.unemployment'),
  debt: col('eco.public_debt'),
  rating: col('eco.credit_rating'),
  reserves: col('eco.reserves'),
  frozen: col('eco.reserves_frozen'),
  reservesMonths: col('eco.reserves_months'),
  currentAccount: col('eco.current_account'),
  reserveCurrency: col('eco.reserve_currency'),
  oilRents: col('eco.oil_rents'),
  gasRents: col('eco.gas_rents'),
  resourceRents: col('eco.resource_rents'),
  imports: col('trade.imports'),
  stability: col('pol.stability'),
  govEff: col('pol.gov_effectiveness'),
  ruleOfLaw: col('pol.rule_of_law'),
  infrastructure: col('bud.infrastructure'),
  monetization: col('bud.monetization'),
  balance: col('bud.balance'),
  foodShare: col('res.food_spending_share'),
  oilProd: col('energy.oil_production'),
  oilCons: col('energy.oil_consumption'),
  gasProd: col('energy.gas_production'),
  gasCons: col('energy.gas_consumption'),
  coalProd: col('energy.coal_production'),
  coalCons: col('energy.coal_consumption'),
};

const K = {
  frontierGrowth: 'economy.potential.frontier_growth',
  frontierIncome: 'economy.potential.frontier_income',
  convergence: 'economy.potential.convergence_rate',
  convergenceThreshold: 'economy.potential.convergence_threshold',
  laborElasticity: 'economy.potential.labor_elasticity',
  potentialYears: 'economy.potential.adjustment_years',
  longRunMin: 'economy.potential.long_run_min',
  longRunMax: 'economy.potential.long_run_max',
  tradeSpillover: 'economy.growth.trade_spillover',
  energyImporter: 'economy.growth.energy_importer',
  energyExporter: 'economy.growth.energy_exporter',
  hydrocarbonVolume: 'economy.growth.hydrocarbon_volume',
  stabilityThreshold: 'economy.growth.stability_threshold',
  stabilityDrag: 'economy.growth.stability_drag',
  debtThreshold: 'economy.growth.debt_threshold',
  debtThresholdReserve: 'economy.growth.debt_threshold_reserve_bonus',
  debtDrag: 'economy.growth.debt_drag',
  publicInvestment: 'economy.growth.public_investment',
  gapPersistence: 'economy.cycle.persistence',
  noise: 'economy.cycle.noise',
  instability: 'economy.cycle.instability_factor',
  inflationMonths: 'economy.inflation.adjustment_months',
  demandPressure: 'economy.inflation.demand_pressure',
  energyPass: 'economy.inflation.energy_passthrough',
  foodPass: 'economy.inflation.food_passthrough',
  secondRound: 'economy.inflation.second_round',
  monetization: 'economy.inflation.monetization',
  hyperinflation: 'economy.inflation.hyperinflation_threshold',
  devaluationPass: 'economy.inflation.devaluation_passthrough',
  okun: 'economy.labor.okun',
  unemploymentYears: 'economy.labor.natural_rate_years',
  caYears: 'economy.external.current_account_adjustment_years',
  accFloating: 'economy.external.reserve_accumulation_floating',
  accManaged: 'economy.external.reserve_accumulation_managed',
  accPegged: 'economy.external.reserve_accumulation_pegged',
  bopMonths: 'economy.external.crisis_reserve_months',
  bopDevaluation: 'economy.external.crisis_devaluation',
  bopGrowth: 'economy.external.crisis_growth_shock',
  bopDays: 'economy.external.crisis_shock_days',
  bopSupport: 'economy.external.crisis_support_months',
  bopNotches: 'economy.external.crisis_rating_notches',
  rentFiscal: 'economy.budget.rent_fiscal_share',
} as const;

/** Valeur absente (donnée manquante) comptée comme nulle dans les sommes. */
const fin = (x: number): number => (Number.isFinite(x) ? x : 0);

/** Durée du glissement annuel (mois) et décroissance mensuelle des chocs de prix importés. */
const YOY_MONTHS = 12;
const IMPORT_SHOCK_DECAY = Math.exp(-1 / YOY_MONTHS);

/** Excès de dette au-delà du seuil (plus haut pour les émetteurs de monnaie de réserve). */
function debtExcess(ctx: SystemContext, debt: number, reserveCurrency: number): number {
  const m = ctx.model;
  const threshold = m.get(K.debtThreshold) + m.get(K.debtThresholdReserve) * reserveCurrency;
  return Math.max(0, debt - threshold);
}

function stabilityPenalty(ctx: SystemContext, stability: number): number {
  return Math.max(0, ctx.model.get(K.stabilityThreshold) - stability) ** 2;
}

type Fuel = 'oil' | 'coal' | GasZone;
/** Prix du mois précédent, dans leurs unités de cotation et en dollars constants. */
const PREV_PRICE_KEYS: Record<Fuel, string> = {
  oil: 'econ.prevQuote.oil',
  coal: 'econ.prevQuote.coal',
  europe: 'econ.prevQuote.gas.europe',
  asia: 'econ.prevQuote.gas.asia',
  americas: 'econ.prevQuote.gas.americas',
};

function byFuel(p: EnergyPrices, fuel: Fuel): number {
  return fuel === 'oil' ? p.oil : fuel === 'coal' ? p.coal : p.gas[fuel];
}

/**
 * Prix d'une énergie ($/MWh) au départ, en dollars courants : prix d'ancrage des données indexé
 * sur l'inflation du dollar, converti avec les pouvoirs calorifiques courants (un coefficient
 * modifié en cours de partie ne crée pas de faux choc de prix).
 */
function basePrice(state: State, model: SystemContext['model'], fuel: Fuel): number {
  return byFuel(perMwh(baseEnergyQuotes(state), model), fuel);
}

/**
 * Termes de l'échange énergétiques : facture nette (importations − production) aux prix courants
 * moins aux prix initiaux, en % du PIB, et position nette initiale (exportateur si négative).
 */
function termsOfTrade(ctx: SystemContext, i: number): { tot: number; exporter: boolean } {
  const S = ctx.state;
  const now = energyPricesPerMwh(S, ctx.model);
  const zone = gasZoneOf(S.entities[i]?.region ?? '');
  const oil = fin(S.e(C.oilCons)[i] as number) - fin(S.e(C.oilProd)[i] as number);
  const gas = fin(S.e(C.gasCons)[i] as number) - fin(S.e(C.gasProd)[i] as number);
  const coal = fin(S.e(C.coalCons)[i] as number) - fin(S.e(C.coalProd)[i] as number);
  const m = ctx.model;
  const net =
    oil * (now.oil - basePrice(S, m, 'oil')) +
    gas * (now.gas[zone] - basePrice(S, m, zone)) +
    coal * (now.coal - basePrice(S, m, 'coal'));
  const position =
    oil * basePrice(S, m, 'oil') + gas * basePrice(S, m, zone) + coal * basePrice(S, m, 'coal');
  // Termes de l'échange en prix réels : écart des prix courants aux prix initiaux indexés.
  const gdp = S.e(C.gdp)[i] as number;
  // TWh × $/MWh = M$ ; / 1 000 = Md$ ; / PIB (Md$) × 100 = % du PIB.
  return { tot: gdp > 0 ? (net / 1000 / gdp) * 100 : 0, exporter: position < 0 };
}

/** Écart des volumes d'hydrocarbures à leur trajectoire de référence, pondéré par les rentes (% PIB). */
function hydrocarbonVolume(ctx: SystemContext, i: number): number {
  const S = ctx.state;
  let v = 0;
  for (const [prod, rents, fuel] of [
    [C.oilProd, C.oilRents, 'oil'],
    [C.gasProd, C.gasRents, 'gas'],
  ] as const) {
    const p0 = S.base[prod * S.n + i] as number;
    const r0 = S.base[rents * S.n + i] as number;
    if (!(p0 > 0) || !(r0 > 0)) continue;
    const zone = gasZoneOf(S.entities[i]?.region ?? '');
    const reference = p0 * Math.exp(S.worldInternal.get(capacityKeyOf(fuel, zone)) ?? 0);
    v += r0 * ((S.e(prod)[i] as number) / reference - 1);
  }
  return v;
}

function reserveAccumulation(ctx: SystemContext, regime: unknown): number {
  const m = ctx.model;
  switch (regime) {
    case 'floating':
      return m.get(K.accFloating);
    case 'fixed':
    case 'dollarized':
      return m.get(K.accPegged);
    case 'monetary_union':
      return 0;
    default:
      return m.get(K.accManaged);
  }
}

function longRunGrowth(ctx: SystemContext, i: number): number {
  const S = ctx.state;
  const m = ctx.model;
  const frontier = m.get(K.frontierIncome) * Math.exp((m.get(K.frontierGrowth) / 100) * ctx.years);
  const income = realIncomePpp(S, i);
  const gap =
    income > 0 ? Math.max(0, Math.log(frontier / income) - m.get(K.convergenceThreshold)) : 0;
  const institutions = ((S.e(C.govEff)[i] as number) + (S.e(C.ruleOfLaw)[i] as number)) / 200;
  const labor = (S.internal.get('demo.workingAgeGrowth')?.[i] ?? 0) * 100;
  const g =
    m.get(K.frontierGrowth) +
    m.get(K.convergence) * gap * Math.max(0, institutions) +
    m.get(K.laborElasticity) * labor;
  return Math.min(m.get(K.longRunMax), Math.max(m.get(K.longRunMin), g));
}

function numeraireIndex(state: State): number {
  return state.byId.get(NUMERAIRE) ?? -1;
}

function pricesByFuel(p: EnergyPrices): [Fuel, number][] {
  return [
    ['oil', p.oil],
    ['coal', p.coal],
    ['europe', p.gas.europe],
    ['asia', p.gas.asia],
    ['americas', p.gas.americas],
  ];
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const N = S.n;
  S.worldInternal.set('usdPriceIndex', 1);
  for (const [fuel, quote] of pricesByFuel(energyQuotes(S))) {
    S.worldInternal.set(PREV_PRICE_KEYS[fuel], quote);
  }
  S.worldInternal.set('econ.prevWheat', S.worldNumber('world.wheat_price'));
  S.internalArray('econ.potentialOutput', 1);
  S.internalArray('econ.realGdp', 1);
  S.internalArray('econ.importShock', 0);
  S.internalArray('econ.tot', 0);
  S.internalArray('econ.volume', 0);
  const factor = S.internalArray('econ.monthlyGrowthFactor', 1);
  const history = S.internalArray('econ.gdpHistory', 1, N * YOY_MONTHS);
  const below = S.internalArray('econ.bopBelow', 0);
  for (let i = 0; i < N; i++) {
    // Historique du PIB reconstitué au rythme de la croissance potentielle initiale : le
    // glissement annuel part de la croissance potentielle.
    const gp = (S.v(C.potential)[i] as number) / 100;
    factor[i] = Math.pow(1 + gp, 1 / 12);
    // Case k lue au pas k (qui produit le mois k + 1) : PIB du mois k + 1 − 12.
    for (let k = 0; k < YOY_MONTHS; k++)
      history[k * N + i] = Math.pow(1 + gp, (k + 1 - YOY_MONTHS) / 12);
    S.force(C.gap, i, 0);
    S.force(C.growth, i, gp * 100);
    S.force(C.longRun, i, longRunGrowth(ctx, i));
    below[i] = 1; // pas de crise au premier mois : il faut franchir le seuil
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const N = S.n;
  const dt = ctx.dt;
  const rng = S.rng('economy');
  const shocks = new Float64Array(N);
  for (let i = 0; i < N; i++) shocks[i] = rng.nextNormal();

  // Numéraire : l'inflation du dollar fait croître les grandeurs en dollars courants.
  const usd = numeraireIndex(S);
  const usdInflation = usd >= 0 ? (S.e(C.inflation)[usd] as number) : 0;
  const usdBefore = S.worldInternal.get('usdPriceIndex') ?? 1;
  const usdAfter = usdBefore * Math.pow(1 + usdInflation / 100, dt);
  S.worldInternal.set('usdPriceIndex', usdAfter);

  // Prix de l'énergie et du blé : variation réelle du mois (chocs de prix importés), en dollars
  // courants par MWh. Les prix précédents sont mémorisés dans leurs unités, en dollars constants.
  const quotes = energyQuotes(S);
  const prices = perMwh(quotes, m);
  const content = energyContent(m);
  const change = (fuel: Fuel, perUnit: number): number => {
    const now = byFuel(quotes, fuel);
    const before = (S.worldInternal.get(PREV_PRICE_KEYS[fuel]) ?? now / usdAfter) * usdAfter;
    return (now - before) / perUnit;
  };
  const delta = {
    oil: change('oil', content.oil),
    gas: {
      europe: change('europe', content.gas),
      asia: change('asia', content.gas),
      americas: change('americas', content.gas),
    },
    coal: change('coal', content.coal),
  };
  const wheat = S.worldEff('world.wheat_price') / usdAfter;
  const wheatPrev = S.worldInternal.get('econ.prevWheat') ?? wheat;
  const wheatChange = wheatPrev > 0 ? wheat / wheatPrev - 1 : 0;

  // Contagion commerciale : écarts de production des partenaires du mois précédent.
  const trade = S.pairMatrix('pair.trade');
  const gaps = S.e(C.gap);
  const spill = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const gdp = S.e(C.gdp)[i] as number;
    if (!(gdp > 0)) continue;
    let s = 0;
    for (let j = 0; j < N; j++) {
      const t = trade[i * N + j] as number;
      if (t > 0) s += (t / gdp) * (gaps[j] as number);
    }
    spill[i] = s;
  }

  const potentialOutput = S.internalArray('econ.potentialOutput', 1);
  const realGdp = S.internalArray('econ.realGdp', 1);
  const factor = S.internalArray('econ.monthlyGrowthFactor', 1);
  const history = S.internalArray('econ.gdpHistory', 1, N * YOY_MONTHS);
  const importShock = S.internalArray('econ.importShock', 0);
  const totPrev = S.internalArray('econ.tot', 0);
  const volumePrev = S.internalArray('econ.volume', 0);
  const below = S.internalArray('econ.bopBelow', 0);
  const slot = ctx.month % YOY_MONTHS;

  const phi = m.get(K.gapPersistence);
  const sigma = m.get(K.noise);
  const tauPi = Math.max(1, m.get(K.inflationMonths));

  for (let i = 0; i < N; i++) {
    const e = S.entities[i];
    const gdp = S.v(C.gdp)[i] as number;
    if (e === undefined || !(gdp > 0)) continue;
    const stability = S.e(C.stability)[i] as number;

    // Croissance structurelle : potentielle + termes en écart à la situation initiale.
    const gp = S.e(C.potential)[i] as number;
    const stab =
      -m.get(K.stabilityDrag) *
      (stabilityPenalty(ctx, stability) -
        stabilityPenalty(ctx, S.base[C.stability * N + i] as number));
    const rc = S.e(C.reserveCurrency)[i] as number;
    const rating = S.e(C.rating)[i] as number;
    const rating0 = S.base[C.rating * N + i] as number;
    const inDefault = S.genericValue('eco.in_default', i) === true;
    const excessNow =
      debtExcess(ctx, S.e(C.debt)[i] as number, rc) * spreadOf(m, rating, inDefault);
    const excessInit =
      debtExcess(ctx, S.base[C.debt * N + i] as number, rc) *
      spreadOf(m, rating0, S.genericBaseValue('eco.in_default', i) === true);
    const debt = -m.get(K.debtDrag) * (excessNow - excessInit);
    const invest =
      m.get(K.publicInvestment) *
      ((S.e(C.infrastructure)[i] as number) - (S.base[C.infrastructure * N + i] as number));
    const structural = gp + stab + debt + invest;

    // Écart de production : persistance, contagion des partenaires, énergie, aléa.
    const { tot, exporter } = termsOfTrade(ctx, i);
    const volume = hydrocarbonVolume(ctx, i);
    const energyImpulse =
      -(exporter ? m.get(K.energyExporter) : m.get(K.energyImporter)) *
        (tot - (totPrev[i] as number)) +
      m.get(K.hydrocarbonVolume) * (volume - (volumePrev[i] as number));
    const fragility = 1 - Math.min(100, Math.max(0, stability)) / 100;
    const sd = sigma * (1 + m.get(K.instability) * fragility * fragility);
    const xPrev = gaps[i] as number;
    const x =
      phi * xPrev +
      (1 - phi) * m.get(K.tradeSpillover) * (spill[i] as number) +
      energyImpulse +
      sd * (shocks[i] as number);
    S.write(C.gap, i, x);
    const xNow = S.effNow(C.gap, i);

    // PIB en volume, glissement annuel, PIB en dollars courants.
    potentialOutput[i] = (potentialOutput[i] as number) * Math.pow(1 + structural / 100, dt);
    const yBefore = realGdp[i] as number;
    const yAfter = Math.max(1e-9, (potentialOutput[i] as number) * (1 + xNow / 100));
    realGdp[i] = yAfter;
    const f = yAfter / yBefore;
    factor[i] = f;
    const yearAgo = history[slot * N + i] as number;
    history[slot * N + i] = yAfter;
    S.write(C.growth, i, (yAfter / yearAgo - 1) * 100);
    const nominal = f * (usdAfter / usdBefore);
    S.write(C.gdp, i, gdp * nominal);
    const ppp = S.v(C.gdpPpp)[i] as number;
    if (ppp > 0) S.write(C.gdpPpp, i, ppp * nominal);

    // Croissance de long terme et convergence de la croissance potentielle.
    const longRun = longRunGrowth(ctx, i);
    S.write(C.longRun, i, longRun);
    const gpCore = S.v(C.potential)[i] as number;
    S.write(
      C.potential,
      i,
      gpCore + ((S.effNow(C.longRun, i) - gpCore) * dt) / m.get(K.potentialYears),
    );

    // Inflation : chocs de prix importés (s'estompent en douze mois) + cœur.
    const zone = gasZoneOf(e.region);
    const energyJump =
      ((fin(S.e(C.oilCons)[i] as number) * delta.oil +
        fin(S.e(C.gasCons)[i] as number) * delta.gas[zone] +
        fin(S.e(C.coalCons)[i] as number) * delta.coal) /
        1000 /
        gdp) *
      100;
    const foodJump = ((S.e(C.foodShare)[i] as number) / 100) * wheatChange * 100;
    const jump = m.get(K.energyPass) * energyJump + m.get(K.foodPass) * foodJump;
    const shockBefore = importShock[i] as number;
    const shock = shockBefore * IMPORT_SHOCK_DECAY + jump;
    importShock[i] = shock;
    const pi = S.v(C.inflation)[i] as number;
    const core = pi - shockBefore;
    const pi0 = S.base[C.inflation * N + i] as number;
    const anchor = expectedInflation(m, S.e(C.cbi)[i] as number, S.e(C.target)[i] as number, pi0);
    const monetized =
      ((S.e(C.monetization)[i] as number) / 100) * Math.max(0, -(S.e(C.balance)[i] as number));
    const printing =
      m.get(K.monetization) * monetized * (1 + (monetized / m.get(K.hyperinflation)) ** 2);
    const coreTarget =
      anchor + printing + m.get(K.demandPressure) * xNow + m.get(K.secondRound) * shock;
    S.write(C.inflation, i, core + (coreTarget - core) / tauPi + shock);

    // Chômage : loi d'Okun sur la variation de l'écart, retour vers le taux initial.
    const u = S.v(C.unemployment)[i] as number;
    const u0 = S.base[C.unemployment * N + i] as number;
    S.write(
      C.unemployment,
      i,
      u - m.get(K.okun) * (xNow - xPrev) + ((u0 - u) * dt) / m.get(K.unemploymentYears),
    );

    // Rentes d'hydrocarbures (% du PIB) : écarts du prix réel et du volume produit à leur
    // trajectoire de référence (la part des rentes dans le PIB est stable sans choc).
    const gdpNow = S.effNow(C.gdp, i);
    let rentsDelta = 0;
    for (const [rents, prod, price, price0, fuel] of [
      [C.oilRents, C.oilProd, prices.oil, basePrice(S, m, 'oil'), 'oil'],
      [C.gasRents, C.gasProd, prices.gas[zone], basePrice(S, m, zone), 'gas'],
    ] as const) {
      const r0 = S.base[rents * N + i] as number;
      const p0 = S.base[prod * N + i] as number;
      if (!(r0 > 0) || !(p0 > 0) || !(price0 > 0)) continue;
      const reference = p0 * Math.exp(S.worldInternal.get(capacityKeyOf(fuel, zone)) ?? 0);
      S.write(rents, i, r0 * (price / price0) * ((S.e(prod)[i] as number) / reference));
      rentsDelta += S.effNow(rents, i) - r0;
    }
    const total0 = S.base[C.resourceRents * N + i] as number;
    if (total0 >= 0) S.write(C.resourceRents, i, Math.max(0, total0 + rentsDelta));

    // Solde courant : effet de la facture énergétique, retour lent vers le solde initial.
    const ca = S.v(C.currentAccount)[i] as number;
    const ca0 = S.base[C.currentAccount * N + i] as number;
    S.write(
      C.currentAccount,
      i,
      ca -
        (tot - (totPrev[i] as number)) +
        (volume - (volumePrev[i] as number)) +
        ((ca0 - ca) * dt) / m.get(K.caYears),
    );
    totPrev[i] = tot;
    volumePrev[i] = volume;

    // Réserves de change : elles suivent le PIB nominal (le déficit courant initial est financé
    // par les entrées de capitaux) ; les écarts du solde courant à son niveau initial les font
    // varier, selon le régime de change.
    const regime = S.genericValue('eco.exchange_regime', i);
    const reserves = S.v(C.reserves)[i] as number;
    const flow =
      (reserveAccumulation(ctx, regime) * (S.effNow(C.currentAccount, i) - ca0) * gdpNow) /
      100 /
      12;
    S.write(C.reserves, i, Math.max(0, reserves * nominal + flow));

    // Crise de balance des paiements (changes administrés, fixes ou dollarisés) : franchissement
    // du seuil de réserves.
    const months = reserveMonths(S, i);
    const crisisPossible =
      e.kind !== 'faction' &&
      (regime === 'managed' || regime === 'fixed' || regime === 'dollarized');
    if (months < m.get(K.bopMonths) && below[i] === 0 && crisisPossible) {
      balanceOfPaymentsCrisis(ctx, i, months, regime);
    }
    below[i] = reserveMonths(S, i) < m.get(K.bopMonths) ? 1 : 0;
  }

  for (const [fuel, quote] of pricesByFuel(quotes))
    S.worldInternal.set(PREV_PRICE_KEYS[fuel], quote / usdAfter);
  S.worldInternal.set('econ.prevWheat', wheat);
}

/** Réserves utilisables (hors réserves gelées) en mois d'importations. */
export function reserveMonths(state: State, i: number): number {
  const gdp = state.effNow(C.gdp, i);
  const imports = ((state.e(C.imports)[i] as number) / 100) * gdp;
  const usable = state.effNow(C.reserves, i) * (1 - (state.e(C.frozen)[i] as number) / 100);
  return imports > 0 ? (usable / imports) * 12 : 240;
}

function balanceOfPaymentsCrisis(
  ctx: SystemContext,
  i: number,
  months: number,
  regime: unknown,
): void {
  const S = ctx.state;
  const m = ctx.model;
  const e = S.entities[i];
  if (e === undefined) return;
  const gdp = S.effNow(C.gdp, i);
  const imports = S.e(C.imports)[i] as number;
  const devaluation = m.get(K.bopDevaluation);
  // Dévaluation : saut du niveau des prix importés, transmis à l'inflation sur douze mois.
  const jump = m.get(K.devaluationPass) * (imports / 100) * devaluation;
  const shock = S.internalArray('econ.importShock', 0);
  shock[i] = (shock[i] as number) + jump;
  // Soutien extérieur (FMI) : réserves reconstituées.
  const reservesBefore = S.v(C.reserves)[i] as number;
  const support = (m.get(K.bopSupport) * (imports / 100) * gdp) / 12;
  S.write(C.reserves, i, reservesBefore + support);
  const ratingBefore = S.v(C.rating)[i] as number;
  const ratingAfter = Math.max(1, ratingBefore - m.get(K.bopNotches));
  S.write(C.rating, i, ratingAfter);
  ctx.emit({
    kind: 'bop_crisis',
    entities: [e.id],
    severity: 2,
    factors: [
      {
        id: 'eco.reserves_months',
        label: "Réserves en mois d'importations",
        value: months,
        unit: 'mois',
      },
      {
        id: 'eco.current_account',
        label: 'Solde courant',
        value: S.e(C.currentAccount)[i] as number,
        unit: '% PIB',
      },
      {
        id: 'eco.reserves_frozen',
        label: 'Réserves gelées',
        value: S.e(C.frozen)[i] as number,
        unit: '%',
      },
      { id: 'trade.imports', label: 'Importations', value: imports, unit: '% PIB' },
      {
        id: 'economy.external.crisis_reserve_months',
        label: 'Seuil de crise',
        value: m.get(K.bopMonths),
        unit: 'mois',
      },
    ],
    effects: [
      {
        slot: { scope: 'country', param: 'eco.reserves', entity: e.id },
        from: reservesBefore,
        to: S.v(C.reserves)[i] ?? null,
      },
      {
        slot: { scope: 'country', param: 'eco.credit_rating', entity: e.id },
        from: ratingBefore,
        to: S.v(C.rating)[i] ?? null,
      },
    ],
    modifiers: [
      {
        slot: { scope: 'country', param: 'eco.potential_growth', entity: e.id },
        spec: {
          op: 'add',
          amount: m.get(K.bopGrowth),
          durationDays: m.get(K.bopDays),
          decay: 'linear',
          label: 'Crise de balance des paiements',
        },
      },
    ],
    note: `Dévaluation de ${devaluation} % (régime ${String(regime)}) : prix importés + ${jump.toFixed(1)} %, soutien extérieur de ${m.get(K.bopSupport)} mois d'importations.`,
  });
}

export const economy: System = {
  id: 'economy',
  coefficients: Object.values(K),
  writes: [
    'eco.gdp_nominal',
    'eco.gdp_ppp',
    'eco.potential_growth',
    'eco.long_run_growth',
    'eco.growth',
    'eco.output_gap',
    'eco.inflation',
    'eco.unemployment',
    'eco.current_account',
    'eco.reserves',
    'eco.oil_rents',
    'eco.gas_rents',
    'eco.resource_rents',
  ],
  init,
  monthly,
};
