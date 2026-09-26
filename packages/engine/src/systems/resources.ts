/**
 * Alimentation et ressources critiques (SPEC §8.4), pas mensuel ; tension alimentaire recalculée
 * après chaque commande.
 *
 * Tension alimentaire (points de consommation des ménages) :
 *   tension = part de l'alimentation · (w₀ + (1 − w₀) · dépendance céréalière) · max(0, p/p₀ − 1)
 * dépendance céréalière = 1 − autosuffisance (bornée à [0, 1]) ; p prix effectif du blé, p₀ prix
 * de départ indexé sur le dollar. Elle pèse sur la stabilité (politique intérieure) et, dans les
 * pays pauvres, sur la mortalité (famine) :
 *   surmortalité (‰/an) = k · max(0, tension − seuil) · max(0, 1 − PIB par habitant / revenu seuil)
 *
 * Dépendances critiques (puces, terres rares) : chaque importateur j reçoit de chaque fournisseur i
 * une part de ses importations du produit (`pair.critical_dependence`). Le flux i → j passe selon
 * la route, les sanctions (volet technologie pour les puces, commerce pour les terres rares), les
 * restrictions d'exportation de i et l'état de guerre. La part perdue depuis le départ est
 * remplacée avec un délai ; le reste freine l'activité en proportion de l'industrie manufacturière
 * (et, pour les puces, de la dépendance : 1 − autonomie en semi-conducteurs).
 */
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { restrictionsOf } from './markets.ts';
import {
  TRACK_INDEX,
  WAR,
  baseSanctionGrid,
  baseWarGrid,
  currentSanctionGrid,
  currentWarGrid,
  vectorValue,
} from './pairs.ts';
import { TRADE_OUT, routeAccessGrid, routeTable } from './trade.ts';

const C = {
  pop: col('demo.population'),
  gdp: col('eco.gdp_nominal'),
  foodShare: col('res.food_spending_share'),
  selfSufficiency: col('res.grain_self_sufficiency'),
  stress: col('res.food_stress'),
  manufacturing: col('eco.manufacturing_share'),
  autonomy: col('tech.semiconductors'),
};

const K = {
  importWeight: 'markets.food.stress_base_weight',
  famineThreshold: 'demography.famine.stress_threshold',
  famineIncome: 'demography.famine.income_threshold',
  famineMortality: 'demography.famine.mortality',
  famineEvent: 'demography.famine.event_threshold',
  criticalMonths: 'markets.critical.replacement_months',
  chips: 'markets.critical.chips_effect',
  rareEarths: 'markets.critical.rare_earths_effect',
  warCut: 'markets.shortage.war_cut',
} as const;

export const RESOURCES_OUT = {
  /** Surmortalité due à la famine (‰/an), lue par la démographie. */
  famine: 'demo.famine',
  /** Choc des pénuries de produits critiques sur l'écart de production du mois (points). */
  impulse: 'econ.impulse.critical',
} as const;

const PRODUCTS = ['chips', 'rare_earths'] as const;
type Product = (typeof PRODUCTS)[number];

const fin = (x: number): number => (Number.isFinite(x) ? x : 0);

/** Prix du blé de départ en dollars courants. */
function wheatStart(state: State): number {
  const v = state.worldBase.get('world.wheat_price');
  return typeof v === 'number' ? v * (state.worldInternal.get('usdPriceIndex') ?? 1) : Number.NaN;
}

/** Tension alimentaire d'un pays (points), au prix effectif courant du blé. */
export function foodStress(ctx: Pick<SystemContext, 'model'>, state: State, i: number): number {
  const p0 = wheatStart(state);
  const p = state.worldEff('world.wheat_price');
  if (!(p0 > 0) || !(p > 0)) return 0;
  const share = Math.max(0, fin(state.e(C.foodShare)[i] as number));
  const dependence = Math.min(
    1,
    Math.max(0, 1 - fin(state.e(C.selfSufficiency)[i] as number) / 100),
  );
  const w0 = Math.min(1, Math.max(0, ctx.model.get(K.importWeight)));
  return Math.min(100, share * (w0 + (1 - w0) * dependence) * Math.max(0, p / p0 - 1));
}

/** Flux d'un produit critique de i vers j (0–1). */
function criticalFlows(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  product: Product,
  start: boolean,
): Float64Array {
  const n = state.n;
  const n2 = n * n;
  const table = routeTable(state);
  const sea = state.internalArray(start ? TRADE_OUT.sea0 : TRADE_OUT.sea, 1, table.mainKm.length);
  const rho = routeAccessGrid(ctx, state, sea);
  const grid = start ? baseSanctionGrid(state) : currentSanctionGrid(state);
  const war = start ? baseWarGrid(state) : currentWarGrid(state);
  const track = (product === 'chips' ? TRACK_INDEX.technology : TRACK_INDEX.trade) * n2;
  const cut = ctx.model.get(K.warCut);
  const restriction = Array.from(
    { length: n },
    (_, i) => restrictionsOf(state, i, start)[product] ?? 0,
  );
  const out = new Float64Array(n2);
  for (let k = 0; k < n2; k++) {
    const i = Math.floor(k / n);
    const j = k % n;
    const b = Math.max(grid[track + k] as number, grid[track + j * n + i] as number);
    const w = (war[k] as number) >= WAR.blockade ? cut : 0;
    out[k] = (rho[k] as number) * (1 - b) * (1 - (restriction[i] as number)) * (1 - w);
  }
  return out;
}

/** Part des importations de départ d'un produit critique perdue par chaque importateur. */
export function criticalShortfalls(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  product: Product,
): Float64Array {
  const n = state.n;
  const now = criticalFlows(ctx, state, product, false);
  const start = criticalFlows(ctx, state, product, true);
  const out = new Float64Array(n);
  const table = state.pairGen.get('pair.critical_dependence');
  if (table === undefined) return out;
  const supply0 = new Float64Array(n);
  const loss = new Float64Array(n);
  for (const [k, v] of table) {
    const j = Math.floor(k / n);
    const i = k % n;
    const d = (vectorValue(v)[product] ?? 0) / 100;
    if (!(d > 0) || i === j) continue;
    const f0 = start[i * n + j] as number;
    const f = now[i * n + j] as number;
    supply0[j] = (supply0[j] as number) + d * f0;
    loss[j] = (loss[j] as number) + d * Math.max(0, f0 - f);
  }
  for (let j = 0; j < n; j++) {
    const s0 = supply0[j] as number;
    out[j] = s0 > 0.05 ? Math.min(1, (loss[j] as number) / s0) : 0;
  }
  return out;
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  S.internalArray(RESOURCES_OUT.famine, 0);
  S.internalArray(RESOURCES_OUT.impulse, 0);
  S.internalArray('resources.famineAlert', 0);
  for (const product of PRODUCTS) {
    S.internalArray(`resources.replaced.${product}`, 0);
    S.internalArray(`resources.unmet.${product}`, 0);
  }
  derive(ctx);
}

function derive(ctx: SystemContext): void {
  const S = ctx.state;
  for (let i = 0; i < S.n; i++) S.write(C.stress, i, foodStress(ctx, S, i));
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  derive(ctx);

  // Famine : surmortalité dans les pays pauvres quand la tension alimentaire dépasse un seuil.
  const famine = S.internalArray(RESOURCES_OUT.famine, 0);
  const alert = S.internalArray('resources.famineAlert', 0);
  const threshold = m.get(K.famineThreshold);
  const income = Math.max(1, m.get(K.famineIncome));
  const usd = S.worldInternal.get('usdPriceIndex') ?? 1;
  for (let i = 0; i < n; i++) {
    const e = S.entities[i];
    const pop = S.e(C.pop)[i] as number;
    const gdp = S.e(C.gdp)[i] as number;
    const perCapita = pop > 0 && gdp > 0 ? (gdp * 1e9) / pop / usd : 0;
    const poverty = Math.max(0, 1 - perCapita / income);
    const stress = S.effNow(C.stress, i);
    const extra = m.get(K.famineMortality) * Math.max(0, stress - threshold) * poverty;
    famine[i] = extra;
    if (!e) continue;
    if (extra >= m.get(K.famineEvent) && alert[i] === 0) {
      alert[i] = 1;
      ctx.emit({
        kind: 'famine',
        entities: [e.id],
        severity: 3,
        factors: [
          { id: 'res.food_stress', label: 'Tension alimentaire', value: stress, unit: 'points' },
          {
            id: 'demography.famine.stress_threshold',
            label: 'Seuil de famine',
            value: threshold,
            unit: 'points',
          },
          {
            id: 'eco.gdp_per_capita',
            label: 'PIB par habitant (dollars du départ)',
            value: perCapita,
            unit: '$',
          },
          {
            id: 'res.grain_self_sufficiency',
            label: 'Autosuffisance céréalière',
            value: fin(S.e(C.selfSufficiency)[i] as number),
            unit: '%',
          },
          { id: 'demo.famine', label: 'Surmortalité', value: extra, unit: '‰/an' },
        ],
        effects: [],
      });
    } else if (extra < m.get(K.famineEvent) / 2 && alert[i] === 1) {
      alert[i] = 0;
      ctx.emit({
        kind: 'famine_end',
        entities: [e.id],
        severity: 1,
        factors: [
          { id: 'res.food_stress', label: 'Tension alimentaire', value: stress, unit: 'points' },
        ],
        effects: [],
      });
    }
  }

  // Produits critiques : pénuries non remplacées → frein de l'activité.
  const impulse = S.internalArray(RESOURCES_OUT.impulse, 0);
  impulse.fill(0);
  const rate = 1 / Math.max(1, m.get(K.criticalMonths));
  for (const product of PRODUCTS) {
    const shortfall = criticalShortfalls(ctx, S, product);
    const replaced = S.internalArray(`resources.replaced.${product}`, 0);
    const unmetPrev = S.internalArray(`resources.unmet.${product}`, 0);
    const effect = m.get(product === 'chips' ? K.chips : K.rareEarths);
    for (let j = 0; j < n; j++) {
      const s = shortfall[j] as number;
      let r = replaced[j] as number;
      r = s > r ? r + (s - r) * rate : s;
      replaced[j] = r;
      const unmet = Math.max(0, s - r);
      const manufacturing = Math.max(0, fin(S.e(C.manufacturing)[j] as number)) / 100;
      const exposure =
        product === 'chips'
          ? 1 - Math.min(1, Math.max(0, fin(S.e(C.autonomy)[j] as number) / 100))
          : 1;
      impulse[j] =
        (impulse[j] as number) -
        effect * 100 * (unmet - (unmetPrev[j] as number)) * manufacturing * exposure;
      unmetPrev[j] = unmet;
    }
  }
}

export const resources: System = {
  id: 'resources',
  coefficients: Object.values(K),
  writes: ['res.food_stress'],
  init,
  monthly,
  derive,
};
