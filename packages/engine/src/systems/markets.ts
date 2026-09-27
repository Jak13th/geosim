/**
 * Marchés mondiaux simplifiés (SPEC §8.3, version de la phase 3), pas mensuel.
 *
 *   prix* = prix d'ancrage · (demande / offre)^(1 / élasticité)
 *   ln prix(t+1) = ln prix(t) + (ln prix* − ln prix(t)) / délai d'ajustement + bruit
 *
 * Hypothèses :
 * - Prix d'ancrage = prix au jour des données (base de `world.*_price`), en dollars constants : il
 *   suit l'inflation du dollar (numéraire). Demande et offre sont mesurées par rapport au départ.
 * - Offre et routes (phase 4) : la production d'un pays est sa capacité × [d + (1 − d)·a], d part
 *   consommée sur place, a accès de ses exportations (routes et détroits, commerce) ; les
 *   sanctions et les guerres la déplacent par rapport au départ. Les données de production (2024)
 *   décrivent des routes libres : au départ, la production des pays bloqués par un détroit
 *   (Ormuz) est réduite d'emblée. La prime de crise du prix de départ s'explique ainsi : le prix
 *   structurel (celui que vise l'investissement) est p₀ · A₀^(1/ε), A₀ offre de départ / offre
 *   routes libres ; rouvrir les détroits y ramène le prix.
 * - Demande et offre sont des indices relatifs au départ (les volumes des sources ne s'équilibrent
 *   pas exactement). Demande : consommation de chaque pays, qui suit son PIB en volume (élasticité
 *   au revenu), une tendance (efficacité, substitution) et le prix (élasticité-prix). Offre :
 *   production de chaque pays, qui croît avec la capacité mondiale : tendance + réponse de
 *   l'investissement à l'écart du prix à son ancrage (le prix revient vers l'ancrage à long terme).
 * - Pétrole : la capacité inutilisée (OPEP+, `energy.spare_capacity`) est mobilisée en quelques mois
 *   quand la demande dépasse l'offre.
 * - Gaz : trois zones (Europe, Asie, Amériques) selon la région de la Banque mondiale, reliées par
 *   un arbitrage partiel du GNL.
 * - Blé, engrais, métaux : l'offre suit les parts de production ou d'exportation des pays
 *   (`res.*`), la demande la population et le PIB mondiaux. Les engrais dépendent du prix du gaz.
 * - Puces avancées : indice d'offre (`world.chip_supply`), somme des parts de fabrication.
 */
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { listOf } from './pairs.ts';
import { TRADE_OUT } from './trade.ts';

const C = {
  pop: col('demo.population'),
  gdpPpp: col('eco.gdp_ppp'),
  primary: col('energy.primary_consumption'),
  oilProd: col('energy.oil_production'),
  oilCons: col('energy.oil_consumption'),
  gasProd: col('energy.gas_production'),
  gasCons: col('energy.gas_consumption'),
  coalProd: col('energy.coal_production'),
  coalCons: col('energy.coal_consumption'),
  spare: col('energy.spare_capacity'),
  grainExports: col('res.grain_export_share'),
  fertilizerExports: col('res.fertilizer_export_share'),
  chipFab: col('res.chip_fab_share'),
};

/** Produits fossiles et colonnes de production et de consommation. */
const FOSSIL_COLUMNS = {
  oil: { prod: C.oilProd, cons: C.oilCons },
  gas: { prod: C.gasProd, cons: C.gasCons },
  coal: { prod: C.coalProd, cons: C.coalCons },
} as const;

/** Coefficients communs à chaque produit (`markets.<produit>.<nom>`). */
const COMMODITY_KEYS = [
  'price_elasticity',
  'income_elasticity',
  'demand_trend',
  'supply_trend',
  'investment_response',
  'adjustment_months',
  'volatility',
] as const;
const FOSSILS = ['oil', 'gas', 'coal'] as const;
/** Métaux dont le prix est suivi (`world.metals_prices`), parmi les minerais critiques (`res.critical_minerals`). */
export const METALS = ['copper', 'lithium', 'rare_earths', 'uranium'] as const;
const COMMODITIES = [...FOSSILS, 'wheat', 'fertilizer', ...METALS] as const;
type Commodity = (typeof COMMODITIES)[number];

const K = {
  demandPriceOil: 'markets.oil.demand_price_elasticity',
  demandPriceGas: 'markets.gas.demand_price_elasticity',
  demandPriceCoal: 'markets.coal.demand_price_elasticity',
  spareMonths: 'markets.oil.spare_response_months',
  lngArbitrage: 'markets.gas.lng_arbitrage',
  fertilizerGas: 'markets.fertilizer.gas_cost_share',
  primaryIncome: 'markets.energy.primary_income_elasticity',
  primaryTrend: 'markets.energy.primary_trend',
  oilMwh: 'markets.energy.oil_mwh_per_barrel',
  gasMwh: 'markets.energy.gas_mwh_per_mmbtu',
  coalMwh: 'markets.energy.coal_mwh_per_tonne',
} as const;

const coef = (k: Commodity, name: (typeof COMMODITY_KEYS)[number]): string =>
  `markets.${k}.${name}`;

/** Zones gazières : région de la Banque mondiale → zone de prix (`world.gas_price`). */
export const GAS_ZONES = ['europe', 'asia', 'americas'] as const;
export type GasZone = (typeof GAS_ZONES)[number];
const REGION_ZONE: Record<string, GasZone> = {
  ECS: 'europe',
  MEA: 'europe',
  SSF: 'europe',
  EAS: 'asia',
  SAS: 'asia',
  NAC: 'americas',
  LCN: 'americas',
};

export function gasZoneOf(region: string): GasZone {
  return REGION_ZONE[region] ?? 'europe';
}

/** Clé de l'indice de capacité (logarithme) d'un produit fossile, par zone pour le gaz. */
export function capacityKeyOf(k: 'oil' | 'gas' | 'coal', zone: GasZone | null): string {
  return k === 'gas' ? `markets.gas.capacity.${zone ?? 'europe'}` : `markets.${k}.capacity`;
}

/** Barils par jour (millions) → TWh par an (pouvoir calorifique : coefficient). */
function mbdToTwh(mbd: number, mwhPerBarrel: number): number {
  return (mbd * 1e6 * 365 * mwhPerBarrel) / 1e6;
}

/** Prix des énergies fossiles dans leurs unités de cotation ($/baril, $/MMBtu, $/t). */
export interface EnergyPrices {
  oil: number;
  gas: Record<GasZone, number>;
  coal: number;
}

/** Prix courants des énergies fossiles, dans leurs unités de cotation. */
export function energyQuotes(state: State): EnergyPrices {
  const gas = state.worldVector('world.gas_price');
  return {
    oil: state.worldEff('world.oil_price'),
    gas: { europe: gas.europe ?? 0, asia: gas.asia ?? 0, americas: gas.americas ?? 0 },
    coal: state.worldEff('world.coal_price'),
  };
}

/** Prix d'ancrage (au départ, en dollars courants) des énergies fossiles, dans leurs unités. */
export function baseEnergyQuotes(state: State): EnergyPrices {
  const gas = baseVector(state, 'world.gas_price');
  return {
    oil: baseNumber(state, 'world.oil_price'),
    gas: { europe: gas.europe ?? 0, asia: gas.asia ?? 0, americas: gas.americas ?? 0 },
    coal: baseNumber(state, 'world.coal_price'),
  };
}

/** Énergie par unité de cotation (MWh par baril, par MMBtu, par tonne). */
export function energyContent(model: SystemContext['model']): {
  oil: number;
  gas: number;
  coal: number;
} {
  return { oil: model.get(K.oilMwh), gas: model.get(K.gasMwh), coal: model.get(K.coalMwh) };
}

/** Prix en $/MWh (coûts de l'énergie des pays), avec les pouvoirs calorifiques courants. */
export function perMwh(prices: EnergyPrices, model: SystemContext['model']): EnergyPrices {
  const c = energyContent(model);
  return {
    oil: prices.oil / c.oil,
    gas: {
      europe: prices.gas.europe / c.gas,
      asia: prices.gas.asia / c.gas,
      americas: prices.gas.americas / c.gas,
    },
    coal: prices.coal / c.coal,
  };
}

/** Prix courants des énergies fossiles en $/MWh. */
export function energyPricesPerMwh(state: State, model: SystemContext['model']): EnergyPrices {
  return perMwh(energyQuotes(state), model);
}

/** Indice des prix du dollar (numéraire) depuis le départ. */
export function usdIndex(state: State): number {
  return state.worldInternal.get('usdPriceIndex') ?? 1;
}

/** Prix d'ancrage en dollars courants : prix du départ × inflation du dollar depuis. */
function baseNumber(state: State, id: string): number {
  const v = state.worldBase.get(id);
  return typeof v === 'number' ? v * usdIndex(state) : Number.NaN;
}

function baseVector(state: State, id: string): Record<string, number> {
  const v = state.worldBase.get(id);
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return {};
  const index = usdIndex(state);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x * index]));
}

/** Nouveau prix : ajustement partiel du logarithme vers l'équilibre, plus un choc aléatoire. */
function nextPrice(current: number, equilibrium: number, months: number, shock: number): number {
  if (!(current > 0) || !(equilibrium > 0)) return current;
  const lp = Math.log(current) + (Math.log(equilibrium) - Math.log(current)) / Math.max(1, months);
  return Math.exp(lp + shock);
}

function sumBase(state: State, p: number): number {
  let s = 0;
  for (let i = 0; i < state.n; i++) {
    const x = state.base[p * state.n + i] as number;
    if (x > 0) s += x;
  }
  return s;
}

/** Production mondiale de départ d'un combustible (après l'effet des routes au départ). */
function sumStart(state: State, fuel: 'oil' | 'gas' | 'coal'): number {
  let s = 0;
  for (const x of startProduction(state, fuel)) if (x > 0) s += x;
  return s;
}

/** Facteur de croissance mensuel du PIB en volume du mois écoulé (économie). */
function growthFactor(state: State, i: number): number {
  return state.internalArray('econ.monthlyGrowthFactor', 1)[i] as number;
}

/** Production de départ d'un combustible (après l'effet des routes au départ). */
export function startProduction(state: State, fuel: 'oil' | 'gas' | 'coal'): Float64Array {
  return state.internalArray(`markets.prod0.${fuel}`, Number.NaN);
}

/**
 * Part de la production qui sort du pays selon les routes, les sanctions et les guerres : facteur
 * d + (1 − d)·a_routes, multiplié par l'effet des sanctions et des guerres par rapport au départ.
 */
function accessFactor(state: State, i: number, share: number, start: boolean): number {
  const d = Math.min(1, Math.max(0, share));
  const g = (a: number): number => d + (1 - d) * Math.min(1, Math.max(0, a));
  const route = state.internalArray(start ? TRADE_OUT.exportRoute0 : TRADE_OUT.exportRoute, 1)[
    i
  ] as number;
  if (start) return g(route);
  const sw = state.internalArray(TRADE_OUT.exportSW, 1)[i] as number;
  const sw0 = state.internalArray(TRADE_OUT.exportSW0, 1)[i] as number;
  const g0 = g(sw0);
  return g(route) * (g0 > 0 ? g(sw) / g0 : 1);
}

/** Accès des exportations d'un pays (routes, sanctions et guerres par rapport au départ). */
export function exportAccessOf(state: State, i: number, start: boolean): number {
  return accessFactor(state, i, 0, start);
}

/** Restrictions d'exportation actives d'un pays (« produit:intensité »), par produit. */
export function restrictionsOf(state: State, i: number, base: boolean): Record<string, number> {
  const v = base
    ? state.genericBaseValue('res.export_restrictions', i)
    : state.genericValue('res.export_restrictions', i);
  const out: Record<string, number> = {};
  for (const item of listOf(v)) {
    const [product, raw] = item.split(':');
    const x = Number(raw);
    if (product && Number.isFinite(x)) out[product] = Math.min(1, Math.max(0, x));
  }
  return out;
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  S.worldInternal.set('markets.oilSpareUsed', 0);
  for (const k of ['wheat', 'fertilizer', ...METALS])
    S.worldInternal.set(`markets.${k}.capacity`, 0);
  for (const k of COMMODITIES) S.worldInternal.set(`markets.${k}.demand`, 1);
  S.writeWorld('world.chip_supply', 100);
  // Capacités : productions des données (routes libres) ; production de départ selon les routes.
  for (const fuel of FOSSILS) {
    const { prod, cons } = FOSSIL_COLUMNS[fuel];
    const cap = S.internalArray(`markets.cap.${fuel}`, 0);
    const prod0 = startProduction(S, fuel);
    const factor = S.internalArray(`markets.factor.${fuel}`, 1);
    const written = S.internalArray(`markets.written.${fuel}`, Number.NaN);
    const byZone = new Map<string, [number, number]>();
    for (let i = 0; i < n; i++) {
      const p = S.v(prod)[i] as number;
      if (!(p > 0)) {
        cap[i] = 0;
        prod0[i] = Number.isFinite(p) ? p : Number.NaN;
        continue;
      }
      const c = S.v(cons)[i] as number;
      cap[i] = p;
      const f = accessFactor(S, i, c > 0 ? c / p : 0, true);
      factor[i] = f;
      prod0[i] = p * f;
      S.force(prod, i, p * f);
      written[i] = S.v(prod)[i] as number;
      const zone = fuel === 'gas' ? gasZoneOf(S.entities[i]?.region ?? '') : 'world';
      const acc = byZone.get(zone) ?? [0, 0];
      acc[0] += p * f;
      acc[1] += p;
      byZone.set(zone, acc);
    }
    for (const [zone, [now, open]] of byZone) {
      S.worldInternal.set(`markets.access0.${fuel}.${zone}`, open > 0 ? now / open : 1);
    }
  }
}

/**
 * Prix structurel d'un produit fossile (dollars courants) : prix d'ancrage corrigé de la prime de
 * crise due aux routes au départ, p₀ · A₀^(1/ε). L'investissement vise ce prix.
 */
export function structuralPrice(
  state: State,
  model: SystemContext['model'],
  fuel: 'oil' | 'gas' | 'coal',
  anchor: number,
  zone: GasZone | null,
): number {
  const a0 = state.worldInternal.get(`markets.access0.${fuel}.${zone ?? 'world'}`) ?? 1;
  const eps = Math.max(0.01, model.get(coef(fuel, 'price_elasticity')));
  return anchor * Math.pow(Math.min(1, Math.max(1e-3, a0)), 1 / eps);
}

/**
 * Fossile : met à jour consommations et productions des pays, renvoie les indices de demande et
 * d'offre (relatifs au départ) d'une zone (`zone` : null = monde).
 */
function fossilMarket(
  ctx: SystemContext,
  cons: number,
  prod: number,
  k: 'oil' | 'gas' | 'coal',
  price: number,
  anchor: number,
  zone: GasZone | null,
): { demand: number; supply: number; open: number } {
  const S = ctx.state;
  const m = ctx.model;
  const eta = m.get(coef(k, 'income_elasticity'));
  const trend = m.get(coef(k, 'demand_trend')) / 100;
  // Capacité mondiale (par zone pour le gaz) : tendance + réponse de l'investissement à l'écart du
  // prix à son niveau structurel (hors prime de crise des routes).
  const structural = structuralPrice(S, m, k, anchor, zone);
  const ratio = structural > 0 && price > 0 ? price / structural : 1;
  const capacity =
    (m.get(coef(k, 'supply_trend')) / 100 +
      m.get(coef(k, 'investment_response')) * Math.log(ratio)) *
    ctx.dt;
  const capacityKey = capacityKeyOf(k, zone);
  S.worldInternal.set(capacityKey, (S.worldInternal.get(capacityKey) ?? 0) + capacity);
  const eps = m.get(
    k === 'oil' ? K.demandPriceOil : k === 'gas' ? K.demandPriceGas : K.demandPriceCoal,
  );
  const priceFactor = Math.pow(anchor > 0 ? price / anchor : 1, -eps);
  const cap = S.internalArray(`markets.cap.${k}`, 0);
  const prod0 = startProduction(S, k);
  const factor = S.internalArray(`markets.factor.${k}`, 1);
  const written = S.internalArray(`markets.written.${k}`, Number.NaN);
  let demand = 0;
  let demand0 = 0;
  let supply = 0;
  let supply0 = 0;
  let open = 0;
  for (let i = 0; i < S.n; i++) {
    if (zone !== null && gasZoneOf(S.entities[i]?.region ?? '') !== zone) continue;
    // Consommation déplacée par l'activité et la tendance ; la demande se compte hors effet prix.
    const c = S.v(cons)[i] as number;
    if (c > 0) S.write(cons, i, c * Math.pow(growthFactor(S, i), eta) * Math.exp(trend * ctx.dt));
    const c0 = S.base[cons * S.n + i] as number;
    if (c0 > 0) demand0 += c0;
    const now = S.effNow(cons, i);
    if (now > 0) demand += now / priceFactor;
    // Production : capacité × part qui sort du pays (routes, sanctions, guerres).
    const p = S.v(prod)[i] as number;
    const w = written[i] as number;
    if (p > 0 && Number.isFinite(w) && Math.abs(p - w) > 1e-9 * Math.max(1, w)) {
      // Production modifiée par l'utilisateur : la capacité suit.
      cap[i] = p / Math.max(0.01, factor[i] as number);
    }
    let capI = cap[i] as number;
    if (capI > 0) {
      capI *= Math.exp(capacity);
      cap[i] = capI;
      const f = accessFactor(S, i, now > 0 ? now / capI : 0, false);
      factor[i] = f;
      S.write(prod, i, capI * f);
      written[i] = S.v(prod)[i] as number;
      open += capI;
    }
    const p0 = prod0[i] as number;
    if (p0 > 0) supply0 += p0;
    const produced = S.effNow(prod, i);
    if (produced > 0) supply += produced;
  }
  return {
    demand: demand0 > 0 ? demand / demand0 : 1,
    supply: supply0 > 0 ? supply / supply0 : 1,
    open: supply0 > 0 ? open / supply0 : 1,
  };
}

/** Consommations au nouveau prix (effet prix appliqué après la formation du prix). */
function applyPriceToConsumption(
  ctx: SystemContext,
  cons: number,
  oldRatio: number,
  newRatio: number,
  eps: number,
  zone: GasZone | null,
): void {
  const S = ctx.state;
  for (let i = 0; i < S.n; i++) {
    if (zone !== null && gasZoneOf(S.entities[i]?.region ?? '') !== zone) continue;
    const c = S.v(cons)[i] as number;
    if (!(c > 0)) continue;
    S.write(cons, i, c * Math.pow(newRatio / oldRatio, -eps));
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const rng = S.rng('markets');
  // Tirages en nombre fixe chaque mois (un par prix) : l'ordre des flux ne dépend pas de l'état.
  const shocks = new Map<string, number>();
  for (const k of [
    'oil',
    'gas.europe',
    'gas.asia',
    'gas.americas',
    'coal',
    'wheat',
    'fertilizer',
    ...METALS,
  ]) {
    shocks.set(k, rng.nextNormal());
  }
  const vol = (k: Commodity): number => m.get(coef(k, 'volatility'));
  const months = (k: Commodity): number => m.get(coef(k, 'adjustment_months'));
  const elasticity = (k: Commodity): number => Math.max(0.01, m.get(coef(k, 'price_elasticity')));

  // Consommation d'énergie primaire : activité et efficacité.
  const etaPrimary = m.get(K.primaryIncome);
  const trendPrimary = m.get(K.primaryTrend) / 100;
  for (let i = 0; i < S.n; i++) {
    const x = S.v(C.primary)[i] as number;
    if (x > 0)
      S.write(
        C.primary,
        i,
        x * Math.pow(growthFactor(S, i), etaPrimary) * Math.exp(trendPrimary * ctx.dt),
      );
  }

  // Pétrole (marché mondial, capacité inutilisée, stocks stratégiques).
  {
    const p0 = baseNumber(S, 'world.oil_price');
    const p = S.worldNumber('world.oil_price');
    const ratio = p / p0;
    const market = fossilMarket(ctx, C.oilCons, C.oilProd, 'oil', p, p0, null);
    const supply = market.supply;
    const worldProd0 = sumStart(S, 'oil');
    // Prélèvements sur les stocks stratégiques : moins d'achats sur le marché.
    const release = S.worldInternal.get('energy.stockRelease') ?? 0;
    const demand = Math.max(
      0.01,
      market.demand - (worldProd0 > 0 ? release / sumBase(S, C.oilCons) : 0),
    );
    // Capacité inutilisée accessible (un producteur bloqué par un détroit ne peut la vendre).
    let spareMbd = 0;
    for (let i = 0; i < S.n; i++) {
      const x = S.e(C.spare)[i] as number;
      if (x > 0) spareMbd += x * exportAccessOf(S, i, false);
    }
    const spareTotal = mbdToTwh(spareMbd, m.get(K.oilMwh));
    let used = S.worldInternal.get('markets.oilSpareUsed') ?? 0;
    const shortage = Math.max(0, demand / supply - 1) * worldProd0;
    const target = Math.min(spareTotal, shortage);
    used += (target - used) / Math.max(1, m.get(K.spareMonths));
    S.worldInternal.set('markets.oilSpareUsed', used);
    const effSupply = supply + (worldProd0 > 0 ? used / worldProd0 : 0);
    S.worldInternal.set('markets.oil.demand', demand);
    const eq = p0 * Math.pow(demand / effSupply, 1 / elasticity('oil'));
    const next = nextPrice(p, eq, months('oil'), vol('oil') * (shocks.get('oil') ?? 0));
    S.writeWorld('world.oil_price', next);
    applyPriceToConsumption(
      ctx,
      C.oilCons,
      ratio,
      S.worldNumber('world.oil_price') / p0,
      m.get(K.demandPriceOil),
      null,
    );
  }

  // Gaz : trois zones, arbitrage partiel du GNL sur les écarts relatifs à l'ancrage.
  {
    const base = baseVector(S, 'world.gas_price');
    const current = S.worldVector('world.gas_price');
    const logGap = new Map<GasZone, number>();
    for (const z of GAS_ZONES) {
      const price = (current[z] ?? 0) > 0 ? (current[z] as number) : (base[z] ?? 1);
      const { demand, supply } = fossilMarket(
        ctx,
        C.gasCons,
        C.gasProd,
        'gas',
        price,
        base[z] ?? 1,
        z,
      );
      logGap.set(z, Math.log(demand / supply) / elasticity('gas'));
    }
    const a = m.get(K.lngArbitrage);
    const next: Record<string, number> = {};
    for (const z of GAS_ZONES) {
      const others = GAS_ZONES.filter((o) => o !== z);
      const mean = others.reduce((s, o) => s + (logGap.get(o) ?? 0), 0) / others.length;
      const gap = (1 - a) * (logGap.get(z) ?? 0) + a * mean;
      const eq = (base[z] ?? 0) * Math.exp(gap);
      next[z] = nextPrice(
        current[z] ?? 0,
        eq,
        months('gas'),
        vol('gas') * (shocks.get(`gas.${z}`) ?? 0),
      );
    }
    const before = { ...current };
    S.writeWorld('world.gas_price', next);
    const after = S.worldVector('world.gas_price');
    for (const z of GAS_ZONES) {
      const r0 = (before[z] ?? 1) / (base[z] ?? 1);
      const r1 = (after[z] ?? 1) / (base[z] ?? 1);
      if (r0 > 0 && r1 > 0)
        applyPriceToConsumption(ctx, C.gasCons, r0, r1, m.get(K.demandPriceGas), z);
    }
  }

  // Charbon (marché mondial).
  {
    const p0 = baseNumber(S, 'world.coal_price');
    const p = S.worldNumber('world.coal_price');
    const ratio = p / p0;
    const { demand, supply } = fossilMarket(ctx, C.coalCons, C.coalProd, 'coal', p, p0, null);
    const eq = p0 * Math.pow(demand / supply, 1 / elasticity('coal'));
    S.writeWorld(
      'world.coal_price',
      nextPrice(p, eq, months('coal'), vol('coal') * (shocks.get('coal') ?? 0)),
    );
    applyPriceToConsumption(
      ctx,
      C.coalCons,
      ratio,
      S.worldNumber('world.coal_price') / p0,
      m.get(K.demandPriceCoal),
      null,
    );
  }

  // Indices de demande mondiale (population, PIB en PPA), pondérés par la situation initiale.
  const weightPop = new Float64Array(S.n);
  const weightGdp = new Float64Array(S.n);
  let sumPop = 0;
  let sumGdp = 0;
  for (let i = 0; i < S.n; i++) {
    if (S.entities[i]?.kind === 'faction') continue;
    const pop0 = S.base[C.pop * S.n + i] as number;
    const gdp0 = S.base[C.gdpPpp * S.n + i] as number;
    if (pop0 > 0) {
      weightPop[i] = pop0;
      sumPop += pop0;
    }
    if (gdp0 > 0) {
      weightGdp[i] = gdp0;
      sumGdp += gdp0;
    }
  }
  const realGdp = S.internalArray('econ.realGdp', 1);
  /** Demande d'un produit : indice pondéré, déplacé par l'activité et une tendance. */
  const demandIndex = (k: Commodity, byPopulation: boolean): number => {
    const eta = m.get(coef(k, 'income_elasticity'));
    const trend = m.get(coef(k, 'demand_trend')) / 100;
    let d = 0;
    for (let i = 0; i < S.n; i++) {
      const w = byPopulation
        ? (weightPop[i] as number) / sumPop
        : (weightGdp[i] as number) / sumGdp;
      if (w === 0) continue;
      const popRatio = byPopulation
        ? (S.e(C.pop)[i] as number) / (S.base[C.pop * S.n + i] as number)
        : 1;
      d += w * popRatio * Math.pow(Math.max(1e-6, realGdp[i] as number), eta);
    }
    return d * Math.exp(trend * ctx.years);
  };
  /** Offre : parts des pays (relatives au départ) × capacité mondiale (tendance, investissement). */
  const supplyIndex = (
    k: Commodity,
    shares: (i: number, base: boolean) => number,
    ratio: number,
  ): number => {
    let now = 0;
    let before = 0;
    for (let i = 0; i < S.n; i++) {
      now += Math.max(0, shares(i, false));
      before += Math.max(0, shares(i, true));
    }
    const key = `markets.${k}.capacity`;
    const cap =
      (S.worldInternal.get(key) ?? 0) +
      (m.get(coef(k, 'supply_trend')) / 100 +
        m.get(coef(k, 'investment_response')) * Math.log(ratio)) *
        ctx.dt;
    S.worldInternal.set(key, cap);
    return (before > 0 ? now / before : 1) * Math.exp(cap);
  };
  // Parts des exportateurs × accès de leurs exportations (routes, sanctions, guerres).
  const columnShare = (p: number) => (i: number, base: boolean) =>
    base
      ? (S.base[p * S.n + i] as number) * exportAccessOf(S, i, true)
      : (S.e(p)[i] as number) * exportAccessOf(S, i, false);

  // Blé : offre des exportateurs, demande de la population mondiale.
  const wheat0 = baseNumber(S, 'world.wheat_price');
  const wheat = S.worldNumber('world.wheat_price');
  {
    const demand = demandIndex('wheat', true);
    const supply = supplyIndex('wheat', columnShare(C.grainExports), wheat / wheat0);
    S.worldInternal.set('markets.wheat.demand', demand);
    const eq = wheat0 * Math.pow(demand / supply, 1 / elasticity('wheat'));
    S.writeWorld(
      'world.wheat_price',
      nextPrice(wheat, eq, months('wheat'), vol('wheat') * (shocks.get('wheat') ?? 0)),
    );
  }
  // Engrais : comme le blé, plus le coût du gaz (Europe, producteur marginal d'azote).
  {
    const p0 = baseNumber(S, 'world.fertilizer_price');
    const p = S.worldNumber('world.fertilizer_price');
    const demand = demandIndex('fertilizer', true);
    const supply = supplyIndex('fertilizer', columnShare(C.fertilizerExports), p / p0);
    const gas = S.worldVector('world.gas_price').europe ?? 0;
    const gas0 = baseVector(S, 'world.gas_price').europe ?? 1;
    const eq =
      p0 *
      Math.pow(demand / supply, 1 / elasticity('fertilizer')) *
      Math.pow(gas / gas0, m.get(K.fertilizerGas));
    S.writeWorld(
      'world.fertilizer_price',
      nextPrice(p, eq, months('fertilizer'), vol('fertilizer') * (shocks.get('fertilizer') ?? 0)),
    );
  }
  // Métaux : parts de production minière (USGS), demande de l'économie mondiale.
  {
    const base = baseVector(S, 'world.metals_prices');
    const current = S.worldVector('world.metals_prices');
    const next: Record<string, number> = { ...current };
    for (const metal of METALS) {
      const p0 = base[metal] ?? 0;
      const p = current[metal] ?? 0;
      if (!(p0 > 0 && p > 0)) continue;
      const shares = (i: number, fromBase: boolean): number => {
        const v = fromBase
          ? S.genericBaseValue('res.critical_minerals', i)
          : S.genericValue('res.critical_minerals', i);
        const share =
          v !== null && typeof v === 'object' && !Array.isArray(v) ? (v[metal] ?? 0) : 0;
        if (!(share > 0)) return 0;
        const restriction = restrictionsOf(S, i, fromBase)[metal] ?? 0;
        return share * exportAccessOf(S, i, fromBase) * (1 - restriction);
      };
      const demand = demandIndex(metal, false);
      const supply = supplyIndex(metal, shares, p / p0);
      const eq = p0 * Math.pow(demand / supply, 1 / elasticity(metal));
      next[metal] = nextPrice(p, eq, months(metal), vol(metal) * (shocks.get(metal) ?? 0));
    }
    S.writeWorld('world.metals_prices', next);
  }
  // Puces avancées : indice d'offre (100 = départ), parts de fabrication × accès des exportations.
  {
    let now = 0;
    let before = 0;
    for (let i = 0; i < S.n; i++) {
      const x = S.e(C.chipFab)[i] as number;
      const x0 = S.base[C.chipFab * S.n + i] as number;
      if (x > 0)
        now += x * exportAccessOf(S, i, false) * (1 - (restrictionsOf(S, i, false).chips ?? 0));
      if (x0 > 0)
        before += x0 * exportAccessOf(S, i, true) * (1 - (restrictionsOf(S, i, true).chips ?? 0));
    }
    S.writeWorld('world.chip_supply', before > 0 ? (100 * now) / before : 100);
  }
}

export const markets: System = {
  id: 'markets',
  coefficients: [
    ...Object.values(K),
    ...COMMODITIES.flatMap((k) => COMMODITY_KEYS.map((name) => coef(k, name))),
  ],
  writes: [
    'energy.primary_consumption',
    'energy.oil_production',
    'energy.oil_consumption',
    'energy.gas_production',
    'energy.gas_consumption',
    'energy.coal_production',
    'energy.coal_consumption',
  ],
  init,
  monthly,
};
