/**
 * Réfugiés (SPEC §8.1), pas mensuel, après la démographie.
 *
 * Pression de départ d'un pays, mesurée par rapport au départ (les réfugiés présents au départ,
 * HCR, sont conservés) :
 *   D = w_insurrection · insurrection/100 + w_guerre · exposition à une guerre terrestre
 *     + w_famine · surmortalité de famine + w_effondrement · max(0, seuil − stabilité)/seuil
 * exposition à une guerre : part militaire de l'ennemi le plus fort parmi les voisins terrestres
 * en guerre avec le pays (le plus faible subit les combats sur son territoire).
 * Stock visé de nouveaux réfugiés = population · k · max(0, D − D₀) ; les départs (ou les retours)
 * le rejoignent avec un délai. Destinations : pondérées par la population du pays d'accueil (effet
 * de masse), la proximité (voisins, puis distance), l'attractivité (revenu relatif, stabilité),
 * l'ouverture migratoire et la relation (un pays hostile attire moins ; aucun départ vers un pays
 * en crise, en blocus ou en guerre avec le pays de départ). Les
 * retours se font depuis les pays d'accueil, au prorata des nouveaux réfugiés qu'ils accueillent.
 * La population passe d'un pays à l'autre avec la structure par âge du pays de départ.
 * Coût pour l'accueil : part du PIB par habitant par réfugié supplémentaire, moins l'aide
 * internationale (budget) ; charge pour la stabilité et la cohésion (politique intérieure).
 */
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { WAR, currentWarGrid, vectorValue } from './pairs.ts';
import { RESOURCES_OUT } from './resources.ts';

const C = {
  pop: col('demo.population'),
  s0: col('demo.share_0_14'),
  s1: col('demo.share_15_64'),
  s2: col('demo.share_65plus'),
  hosted: col('demo.refugees_hosted'),
  abroad: col('demo.refugees_abroad'),
  openness: col('demo.migration_openness'),
  gdp: col('eco.gdp_nominal'),
  stability: col('pol.stability'),
  insurgency: col('pol.insurgency'),
  budget: col('mil.budget'),
};

const K = {
  insurgency: 'demography.refugees.insurgency_weight',
  war: 'demography.refugees.war_weight',
  famine: 'demography.refugees.famine_weight',
  collapse: 'demography.refugees.collapse_weight',
  collapseThreshold: 'demography.refugees.collapse_threshold',
  displacement: 'demography.refugees.displacement',
  outflowMonths: 'demography.refugees.outflow_months',
  returnMonths: 'demography.refugees.return_months',
  distance: 'demography.refugees.distance_km',
  cost: 'demography.refugees.cost_share',
  aid: 'demography.refugees.aid_share',
  crisis: 'demography.refugees.crisis_threshold',
  incomeElasticity: 'demography.refugees.income_elasticity',
  incomeMaxRatio: 'demography.refugees.income_max_ratio',
  maxOutflow: 'demography.refugees.max_monthly_outflow',
  size: 'demography.refugees.size_elasticity',
} as const;

export const REFUGEES_OUT = {
  /** Coût budgétaire de l'accueil des nouveaux réfugiés (% du PIB), lu par le budget. */
  cost: 'refugees.cost',
} as const;

const fin = (x: number): number => (Number.isFinite(x) ? x : 0);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Exposition de chaque pays à une guerre terrestre (0–1). */
function warExposure(state: State): Float64Array {
  const n = state.n;
  const war = currentWarGrid(state);
  const border = state.pairMatrix('pair.border_length');
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const bi = Math.max(0, fin(state.e(C.budget)[i] as number));
    for (let j = 0; j < n; j++) {
      if (i === j || (war[i * n + j] as number) !== WAR.war || !((border[i * n + j] as number) > 0))
        continue;
      const bj = Math.max(0, fin(state.e(C.budget)[j] as number));
      out[i] = Math.max(out[i] as number, bi + bj > 0 ? bj / (bi + bj) : 0.5);
    }
  }
  return out;
}

/** Pression de départ de chaque pays, avec le détail de ses composantes. */
export function departurePressure(ctx: Pick<SystemContext, 'model' | 'state'>): {
  total: Float64Array;
  parts: Float64Array[];
} {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const exposure = warExposure(S);
  const famine = S.internalArray(RESOURCES_OUT.famine, 0);
  const threshold = Math.max(1, m.get(K.collapseThreshold));
  const parts = [
    new Float64Array(n),
    new Float64Array(n),
    new Float64Array(n),
    new Float64Array(n),
  ];
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (m.get(K.insurgency) * Math.max(0, fin(S.e(C.insurgency)[i] as number))) / 100;
    const b = m.get(K.war) * (exposure[i] as number);
    const c = m.get(K.famine) * Math.max(0, famine[i] as number);
    const d =
      (m.get(K.collapse) * Math.max(0, threshold - fin(S.e(C.stability)[i] as number))) / threshold;
    (parts[0] as Float64Array)[i] = a;
    (parts[1] as Float64Array)[i] = b;
    (parts[2] as Float64Array)[i] = c;
    (parts[3] as Float64Array)[i] = d;
    total[i] = a + b + c + d;
  }
  return { total, parts };
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  S.internalArray('refugees.pressure0', 0).set(departurePressure(ctx).total);
  S.internalArray('refugees.newAbroad', 0);
  S.internalArray('refugees.newHosted', 0);
  S.internalArray('refugees.flows', 0, n * n);
  S.internalArray('refugees.crisisAlert', 0);
  S.internalArray(REFUGEES_OUT.cost, 0);
}

/** Parts des destinations des réfugiés partant de i. */
function destinations(ctx: SystemContext, i: number, war: Uint8Array): Float64Array {
  const S = ctx.state;
  const n = S.n;
  const out = new Float64Array(n);
  const m = ctx.model;
  const border = S.pairMatrix('pair.border_length');
  const relation = S.pairMatrix('pair.relation');
  const L = Math.max(1, m.get(K.distance));
  const popI = S.e(C.pop)[i] as number;
  const gdpI = S.e(C.gdp)[i] as number;
  const pcI = popI > 0 && gdpI > 0 ? gdpI / popI : 0;
  let total = 0;
  for (let j = 0; j < n; j++) {
    if (j === i || S.entities[j]?.kind === 'faction') continue;
    if ((war[i * n + j] as number) >= WAR.crisis) continue;
    const hostility = Math.max(0, -fin(relation[j * n + i] as number)) / 100;
    if (!(hostility < 1)) continue;
    const popJ = S.e(C.pop)[j] as number;
    const gdpJ = S.e(C.gdp)[j] as number;
    if (!(popJ > 0) || !(gdpJ > 0)) continue;
    const d = vectorValue(S.pairValue('pair.distance', i, j)).great_circle ?? -1;
    const proximity = (border[i * n + j] as number) > 0 ? 1 : d >= 0 ? Math.exp(-d / L) : 0;
    if (!(proximity > 1e-4)) continue;
    const pcJ = gdpJ / popJ;
    const cap = Math.max(1, m.get(K.incomeMaxRatio));
    const income =
      pcI > 0 ? clamp(Math.pow(pcJ / pcI, m.get(K.incomeElasticity)), 1 / cap, cap) : 1;
    const stability = Math.max(0.05, fin(S.e(C.stability)[j] as number) / 50);
    const openness = Math.max(0.01, fin(S.e(C.openness)[j] as number) / 100);
    // Effet de masse (modèles de gravité) : un grand pays accueille davantage qu'un petit.
    const mass = Math.pow(popJ / 1e6, m.get(K.size));
    const w = mass * proximity * income * stability * openness * (1 - hostility);
    out[j] = w;
    total += w;
  }
  if (total > 0) for (let j = 0; j < n; j++) out[j] = (out[j] as number) / total;
  return out;
}

/** Déplace des personnes de i vers j avec la structure par âge de i (populations et parts). */
function transfer(state: State, moves: Float64Array, shares: Float64Array[]): void {
  const n = state.n;
  const groups = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) {
    const pop = state.v(C.pop)[i] as number;
    if (!(pop > 0)) continue;
    (groups[0] as Float64Array)[i] = (pop * (state.v(C.s0)[i] as number)) / 100;
    (groups[1] as Float64Array)[i] = (pop * (state.v(C.s1)[i] as number)) / 100;
    (groups[2] as Float64Array)[i] = (pop * (state.v(C.s2)[i] as number)) / 100;
  }
  for (let k = 0; k < moves.length; k++) {
    const x = moves[k] as number;
    if (x === 0) continue;
    const i = Math.floor(k / n);
    const j = k % n;
    // x > 0 : de i vers j ; x < 0 : retour de j vers i (structure du pays d'origine i).
    for (let g = 0; g < 3; g++) {
      const share = ((shares[g] as Float64Array)[i] as number) / 100;
      (groups[g] as Float64Array)[i] = Math.max(
        0,
        ((groups[g] as Float64Array)[i] as number) - x * share,
      );
      (groups[g] as Float64Array)[j] = Math.max(
        0,
        ((groups[g] as Float64Array)[j] as number) + x * share,
      );
    }
  }
  for (let i = 0; i < n; i++) {
    const a0 = (groups[0] as Float64Array)[i] as number;
    const a1 = (groups[1] as Float64Array)[i] as number;
    const a2 = (groups[2] as Float64Array)[i] as number;
    const total = a0 + a1 + a2;
    if (!(total > 0) || !((state.v(C.pop)[i] as number) > 0)) continue;
    state.write(C.pop, i, total);
    state.write(C.s0, i, (100 * a0) / total);
    state.write(C.s1, i, (100 * a1) / total);
    state.write(C.s2, i, (100 * a2) / total);
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const { total, parts } = departurePressure(ctx);
  const pressure0 = S.internalArray('refugees.pressure0', 0);
  const newAbroad = S.internalArray('refugees.newAbroad', 0);
  const newHosted = S.internalArray('refugees.newHosted', 0);
  const flows = S.internalArray('refugees.flows', 0, n * n);
  const alert = S.internalArray('refugees.crisisAlert', 0);
  const war = currentWarGrid(S);
  const moves = new Float64Array(n * n);
  const shares = [
    Float64Array.from(S.v(C.s0)),
    Float64Array.from(S.v(C.s1)),
    Float64Array.from(S.v(C.s2)),
  ];
  const outRate = 1 / Math.max(1, m.get(K.outflowMonths));
  const backRate = 1 / Math.max(1, m.get(K.returnMonths));
  const pop0 = (i: number): number => fin(S.base[C.pop * n + i] as number);
  for (let i = 0; i < n; i++) {
    const e = S.entities[i];
    if (!e || e.kind === 'faction') continue;
    const target =
      pop0(i) *
      m.get(K.displacement) *
      Math.max(0, (total[i] as number) - (pressure0[i] as number));
    const stock = newAbroad[i] as number;
    const delta = target > stock ? (target - stock) * outRate : (target - stock) * backRate;
    const pop = S.v(C.pop)[i] as number;
    const crisisLevel = (m.get(K.crisis) * Math.max(1, pop)) / 100;
    if (delta < crisisLevel / 2 && alert[i] === 1) {
      alert[i] = 0;
      ctx.emit({
        kind: 'refugee_crisis_end',
        entities: [e.id],
        severity: 1,
        factors: [
          {
            id: 'demo.refugees_abroad',
            label: 'Départs du mois',
            value: Math.max(0, delta),
            unit: 'personnes',
          },
        ],
        effects: [],
      });
    }
    if (Math.abs(delta) < 1) continue;
    if (delta > 0) {
      const out = Math.min(delta, m.get(K.maxOutflow) * Math.max(0, pop));
      const dest = destinations(ctx, i, war);
      let placed = 0;
      for (let j = 0; j < n; j++) {
        const x = out * (dest[j] as number);
        if (!(x > 0)) continue;
        flows[i * n + j] = (flows[i * n + j] as number) + x;
        moves[i * n + j] = (moves[i * n + j] as number) + x;
        newHosted[j] = (newHosted[j] as number) + x;
        placed += x;
      }
      newAbroad[i] = stock + placed;
      if (placed >= crisisLevel && alert[i] === 0) {
        alert[i] = 1;
        emitCrisis(ctx, i, placed, dest, parts);
      }
    } else {
      // Retours depuis les pays d'accueil, au prorata des nouveaux réfugiés qu'ils accueillent.
      const back = Math.min(-delta, stock);
      if (!(stock > 0)) continue;
      for (let j = 0; j < n; j++) {
        const f = flows[i * n + j] as number;
        if (!(f > 0)) continue;
        const x = (back * f) / stock;
        flows[i * n + j] = f - x;
        moves[i * n + j] = (moves[i * n + j] as number) - x;
        newHosted[j] = Math.max(0, (newHosted[j] as number) - x);
      }
      newAbroad[i] = stock - back;
    }
  }
  transfer(S, moves, shares);
  const cost = S.internalArray(REFUGEES_OUT.cost, 0);
  for (let i = 0; i < n; i++) {
    const hosted0 = fin(S.base[C.hosted * n + i] as number);
    const abroad0 = fin(S.base[C.abroad * n + i] as number);
    S.write(C.hosted, i, hosted0 + (newHosted[i] as number));
    S.write(C.abroad, i, abroad0 + (newAbroad[i] as number));
    const pop = S.v(C.pop)[i] as number;
    cost[i] =
      pop > 0 ? (100 * m.get(K.cost) * (1 - m.get(K.aid)) * (newHosted[i] as number)) / pop : 0;
  }
}

function emitCrisis(
  ctx: SystemContext,
  i: number,
  placed: number,
  dest: Float64Array,
  parts: Float64Array[],
): void {
  const S = ctx.state;
  const e = S.entities[i];
  if (!e) return;
  const top = [...dest]
    .map((x, j) => [j, x] as const)
    .filter(([, x]) => x > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const labels = ['Insurrection', 'Guerre sur le territoire', 'Famine', "Effondrement de l'État"];
  ctx.emit({
    kind: 'refugee_crisis',
    entities: [e.id, ...top.map(([j]) => S.entities[j]?.id ?? '').filter(Boolean)],
    severity: 2,
    factors: [
      { id: 'demo.refugees_abroad', label: 'Départs du mois', value: placed, unit: 'personnes' },
      ...labels.map((label, k) => ({
        id: `refugees.pressure.${k}`,
        label: `Pression : ${label}`,
        value: ((parts[k] as Float64Array)[i] as number) || 0,
        unit: 'indice',
      })),
      ...top.map(([j, x]) => ({
        id: `destination:${S.entities[j]?.id ?? j}`,
        label: `Destination : ${S.entities[j]?.nameFr ?? j}`,
        value: 100 * x,
        unit: '%',
      })),
    ],
    effects: [],
  });
}

export const refugees: System = {
  id: 'refugees',
  coefficients: Object.values(K),
  writes: ['demo.refugees_hosted', 'demo.refugees_abroad'],
  init,
  monthly,
};
