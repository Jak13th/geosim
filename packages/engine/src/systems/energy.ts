/**
 * Énergie (SPEC §8.4), pas mensuel : approvisionnement physique des importateurs.
 *
 * Chaque importateur j reçoit de chaque fournisseur i une part de ses importations d'énergie
 * (`pair.energy_dependence`, chapitre 27 du SH). Le flux i → j passe selon l'accès de la route
 * (détroits), les sanctions sur l'énergie (dans un sens ou dans l'autre) et l'état de guerre :
 *   f_ij = ρ_ij · (1 − sanctions_énergie) · (1 − coupure_guerre)
 * Manque d'approvisionnement, par rapport aux flux établis E_ij (ceux sur lesquels l'importateur
 * compte : flux de départ, qui suivent ensuite les flux courants — vite quand un fournisseur revient,
 * lentement quand une perte dure et devient la nouvelle normale) :
 *   manque_j = Σ_i dép_ji · max(0, E_ij − f_ij(t)) / Σ_i dép_ji · E_ij
 * Il est remplacé par d'autres fournisseurs avec un délai (achats au prix mondial, qui monte avec
 * la perte d'offre) ; le reste est couvert par les stocks stratégiques (`trade.oil_stocks`, en jours
 * de consommation de pétrole, soit jours × part du pétrole dans l'énergie primaire en jours de
 * consommation d'énergie), puis rationné :
 *   pénurie (% de la consommation d'énergie) = (manque − remplacé) · dépendance aux importations
 *                                               − prélèvement sur les stocks
 * Les stocks se reconstituent quand l'approvisionnement revient. Les prélèvements réduisent les
 * achats sur le marché mondial du pétrole (libération coordonnée des stocks). La pénurie freine
 * l'activité (écart de production) et la stabilité (politique intérieure).
 */
import { col, type State } from '../state.ts';
import type { Factor } from '../types.ts';
import type { System, SystemContext } from '../system.ts';
import {
  TRACK_INDEX,
  WAR,
  baseSanctionGrid,
  baseWarGrid,
  currentSanctionGrid,
  currentWarGrid,
} from './pairs.ts';
import { TRADE_OUT, routeAccessGrid, routeTable } from './trade.ts';

const C = {
  dependence: col('energy.import_dependence'),
  gap: col('energy.supply_gap'),
  stocks: col('trade.oil_stocks'),
  oilCons: col('energy.oil_consumption'),
  primary: col('energy.primary_consumption'),
};

const K = {
  relianceMonths: 'markets.shortage.reliance_months',
  adaptationMonths: 'markets.shortage.adaptation_months',
  replaceMonths: 'markets.shortage.replacement_months',
  refillMonths: 'markets.shortage.refill_months',
  releaseShare: 'markets.shortage.stock_release_share',
  warCut: 'markets.shortage.war_cut',
  gdpElasticity: 'markets.shortage.gdp_elasticity',
  eventThreshold: 'markets.shortage.event_threshold',
} as const;

export const ENERGY_OUT = {
  /** Choc de la pénurie sur l'écart de production du mois (points). */
  impulse: 'econ.impulse.energy',
  shortfall: 'energy.shortfall',
  replaced: 'energy.replaced',
} as const;

/** Jours par mois (moyenne). */
const DAYS_PER_MONTH = 365.25 / 12;

/** Flux d'énergie de chaque fournisseur i vers chaque importateur j (0–1), sans réorientation. */
export function energyFlows(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  start: boolean,
): Float64Array {
  const n = state.n;
  const n2 = n * n;
  const table = routeTable(state);
  const sea = state.internalArray(start ? TRADE_OUT.sea0 : TRADE_OUT.sea, 1, table.mainKm.length);
  const rho = routeAccessGrid(ctx, state, sea);
  const grid = start ? baseSanctionGrid(state) : currentSanctionGrid(state);
  const war = start ? baseWarGrid(state) : currentWarGrid(state);
  const eIdx = TRACK_INDEX.energy * n2;
  const cut = ctx.model.get(K.warCut);
  const out = new Float64Array(n2);
  for (let k = 0; k < n2; k++) {
    const i = Math.floor(k / n);
    const j = k % n;
    const b = Math.max(grid[eIdx + k] as number, grid[eIdx + j * n + i] as number);
    const w = (war[k] as number) >= WAR.blockade ? cut : 0;
    out[k] = (rho[k] as number) * (1 - b) * (1 - w);
  }
  return out;
}

/** Flux établis (référence des manques) : flux de départ tant qu'ils n'ont pas été mis à jour. */
function established(ctx: Pick<SystemContext, 'model'>, state: State): Float64Array {
  const n2 = state.n * state.n;
  if (!state.internal.has('energy.established')) {
    state.internalArray('energy.established', 0, n2).set(energyFlows(ctx, state, true));
  }
  return state.internalArray('energy.established', 0, n2);
}

/** Manque d'approvisionnement de chaque importateur (part de ses importations établies). */
export function shortfalls(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  now: Float64Array = energyFlows(ctx, state, false),
): {
  shortfall: Float64Array;
  /** Principaux fournisseurs perdus de chaque importateur : [fournisseur, part perdue]. */
  lost: [number, number][][];
} {
  const n = state.n;
  const start = established(ctx, state);
  const dep = state.pairMatrix('pair.energy_dependence');
  const shortfall = new Float64Array(n);
  const lost: [number, number][][] = [];
  for (let j = 0; j < n; j++) {
    let supply0 = 0;
    let loss = 0;
    const items: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      const d = (dep[j * n + i] as number) / 100;
      if (!(d > 0)) continue;
      const f0 = start[i * n + j] as number;
      const f = now[i * n + j] as number;
      supply0 += d * f0;
      const l = d * Math.max(0, f0 - f);
      if (l > 0) {
        loss += l;
        items.push([i, l]);
      }
    }
    const s = supply0 > 0.05 ? loss / supply0 : 0;
    shortfall[j] = Math.min(1, s);
    items.sort((a, b) => b[1] - a[1]);
    lost.push(items.slice(0, 3).map(([i, l]) => [i, supply0 > 0 ? l / supply0 : 0]));
  }
  return { shortfall, lost };
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  S.internalArray('energy.established', 0, S.n * S.n).set(energyFlows(ctx, S, true));
  S.internalArray(ENERGY_OUT.impulse, 0);
  S.internalArray(ENERGY_OUT.shortfall, 0);
  S.internalArray(ENERGY_OUT.replaced, 0);
  S.internalArray('energy.gapPrev', 0);
  S.internalArray('energy.alert', 0);
  S.worldInternal.set('energy.stockRelease', 0);
  for (let i = 0; i < S.n; i++) S.force(C.gap, i, 0);
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const flows = energyFlows(ctx, S, false);
  const { shortfall, lost } = shortfalls(ctx, S, flows);
  // Les flux établis suivent les flux courants : vite au retour d'un fournisseur, lentement quand
  // une perte dure (le remplacement devient la nouvelle normale).
  const E = established(ctx, S);
  const up = 1 / Math.max(1, m.get(K.relianceMonths));
  const down = 1 / Math.max(1, m.get(K.adaptationMonths));
  for (let k = 0; k < E.length; k++) {
    const f = flows[k] as number;
    const e = E[k] as number;
    E[k] = e + (f - e) * (f > e ? up : down);
  }
  const replaced = S.internalArray(ENERGY_OUT.replaced, 0);
  const shortfallOut = S.internalArray(ENERGY_OUT.shortfall, 0);
  const gapPrev = S.internalArray('energy.gapPrev', 0);
  const impulse = S.internalArray(ENERGY_OUT.impulse, 0);
  const alert = S.internalArray('energy.alert', 0);
  const replaceRate = 1 / Math.max(1, m.get(K.replaceMonths));
  const refillRate = 1 / Math.max(1, m.get(K.refillMonths));
  const release = Math.min(1, Math.max(0, m.get(K.releaseShare)));
  let worldRelease = 0;
  for (let j = 0; j < n; j++) {
    const e = S.entities[j];
    const s = shortfall[j] as number;
    shortfallOut[j] = s;
    let r = replaced[j] as number;
    // Le remplacement se construit avec un délai ; il suit aussitôt un manque qui se résorbe.
    r = s > r ? r + (s - r) * replaceRate : s;
    replaced[j] = r;
    const missing = Math.max(0, s - r);
    const dependence = Math.min(1, Math.max(0, (S.e(C.dependence)[j] as number) / 100));
    const needDays = missing * dependence * DAYS_PER_MONTH;
    const stock = Math.max(0, S.v(C.stocks)[j] as number);
    // Les stocks sont du pétrole : un jour de pétrole couvre « part du pétrole » jour d'énergie.
    const oilNow = S.e(C.oilCons)[j] as number;
    const primary = S.e(C.primary)[j] as number;
    const oilShare = oilNow > 0 && primary > 0 ? Math.min(1, oilNow / primary) : 1;
    const drawEnergy = Math.min(stock * oilShare, needDays * release);
    const draw = oilShare > 0 ? drawEnergy / oilShare : 0;
    const stock0 = S.base[C.stocks * n + j] as number;
    let next = stock - draw;
    if (missing === 0 && Number.isFinite(stock0) && next < stock0)
      next += (stock0 - next) * refillRate;
    if (Number.isFinite(stock)) S.write(C.stocks, j, next);
    const unmet = Math.max(0, needDays - drawEnergy) / DAYS_PER_MONTH;
    const gap = 100 * Math.min(1, unmet);
    S.write(C.gap, j, gap);
    const oil = S.e(C.oilCons)[j] as number;
    if (oil > 0) worldRelease += (draw / DAYS_PER_MONTH) * oil;
    const gapNow = S.effNow(C.gap, j);
    impulse[j] = -m.get(K.gdpElasticity) * (gapNow - (gapPrev[j] as number));
    gapPrev[j] = gapNow;

    // Événements : début et fin d'une pénurie notable.
    const threshold = m.get(K.eventThreshold);
    if (e && gapNow >= threshold && alert[j] === 0) {
      alert[j] = 1;
      const factors: Factor[] = [
        {
          id: 'energy.supply_gap',
          label: 'Pénurie (part de la consommation)',
          value: gapNow,
          unit: '%',
        },
        {
          id: 'energy.shortfall',
          label: 'Importations établies perdues',
          value: 100 * s,
          unit: '%',
        },
        { id: 'energy.replaced', label: 'Déjà remplacées', value: 100 * r, unit: '%' },
        {
          id: 'energy.import_dependence',
          label: 'Dépendance aux importations',
          value: 100 * dependence,
          unit: '%',
        },
        {
          id: 'trade.oil_stocks',
          label: 'Stocks stratégiques restants',
          value: S.effNow(C.stocks, j),
          unit: 'jours',
        },
      ];
      for (const [i, share] of lost[j] ?? []) {
        const supplier = S.entities[i];
        if (supplier) {
          factors.push({
            id: `pair.energy_dependence:${supplier.id}`,
            label: `Approvisionnement perdu : ${supplier.nameFr}`,
            value: 100 * share,
            unit: '%',
          });
        }
      }
      ctx.emit({
        kind: 'energy_shortage',
        entities: [e.id],
        severity: gapNow >= 3 * threshold ? 3 : 2,
        factors,
        effects: [],
      });
    } else if (e && gapNow < threshold / 2 && alert[j] === 1) {
      alert[j] = 0;
      ctx.emit({
        kind: 'energy_shortage_end',
        entities: [e.id],
        severity: 1,
        factors: [
          { id: 'energy.supply_gap', label: 'Pénurie restante', value: gapNow, unit: '%' },
          { id: 'energy.replaced', label: 'Importations remplacées', value: 100 * r, unit: '%' },
        ],
        effects: [],
      });
    }
  }
  S.worldInternal.set('energy.stockRelease', worldRelease);
}

export const energy: System = {
  id: 'energy',
  coefficients: Object.values(K),
  writes: ['energy.supply_gap', 'trade.oil_stocks'],
  init,
  monthly,
};
