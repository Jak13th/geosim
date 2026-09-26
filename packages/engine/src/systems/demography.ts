/**
 * Démographie (SPEC §8.1), pas mensuel.
 *
 * Hypothèses :
 * - Trois tranches d'âge (0–14, 15–64, 65 ans et plus). À l'intérieur des tranches, les effectifs
 *   par année d'âge suivent un profil exponentiel c(a) ∝ e^(−r·a), la pente r étant déduite chaque
 *   mois du rapport entre les effectifs moyens par âge des deux premières tranches. Ce profil donne
 *   la part de chaque tranche qui passe à la suivante (cohorte de 14 ans, cohorte de 64 ans), sans
 *   données par âge détaillé.
 * - Mortalité par tranche = taux de référence (coefficients) × facteur propre au pays, calé pour
 *   reproduire la mortalité observée au départ ; les taux par âge baissent lentement (progrès
 *   sanitaire). La mortalité brute évolue donc avec le vieillissement.
 * - Natalité brute = natalité initiale × (fécondité / fécondité initiale) × (part des 15–64 ans /
 *   part initiale) : la structure par âge module les naissances. La fécondité converge lentement
 *   vers un niveau de long terme (tendance liée au développement).
 * - Solde migratoire : constant (‰, levier), versé dans la tranche 15–64 ans.
 * - Population active proportionnelle aux 15–64 ans (taux d'activité constant).
 * - Pertes de guerre, famines, épidémies et réfugiés : phases 4 à 6.
 */
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';

const C = {
  pop: col('demo.population'),
  birth: col('demo.birth_rate'),
  death: col('demo.death_rate'),
  fertility: col('demo.fertility'),
  lifeExp: col('demo.life_expectancy'),
  s0: col('demo.share_0_14'),
  s1: col('demo.share_15_64'),
  s2: col('demo.share_65plus'),
  urban: col('demo.urbanization'),
  migration: col('demo.net_migration'),
  labor: col('demo.labor_force'),
  manpower: col('demo.manpower'),
  hdi: col('demo.hdi'),
  gdpPpp: col('eco.gdp_ppp'),
};

const K = {
  m0: 'demography.mortality.age_0_14',
  m1: 'demography.mortality.age_15_64',
  m2: 'demography.mortality.age_65plus',
  decline: 'demography.mortality.annual_decline',
  fertilityTarget: 'demography.fertility.long_run',
  fertilityYears: 'demography.fertility.convergence_years',
  leMax: 'demography.life_expectancy.max',
  leGain: 'demography.life_expectancy.annual_gain',
  urbanMax: 'demography.urbanization.max',
  urbanSpeed: 'demography.urbanization.speed',
  fitness: 'demography.manpower.fitness_rate',
} as const;

/** Bornes des tranches d'âge du catalogue (années). */
const AGE_CHILD_END = 15;
const AGE_ADULT_END = 65;
/** Réservoir mobilisable : 18–49 ans (catalogue, `demo.manpower`). */
const MANPOWER_FROM = 18;
const MANPOWER_TO = 50;
/**
 * Bornes de l'indice de développement humain (définition du PNUD) : espérance de vie de 20 à
 * 85 ans, revenu par habitant de 100 à 75 000 $ (PPA).
 */
const HDI = { lifeMin: 20, lifeMax: 85, incomeMin: 100, incomeMax: 75000 } as const;
/** Espérance de vie à laquelle s'applique le gain annuel de référence (coefficient). */
const LIFE_EXPECTANCY_REFERENCE = 60;

/** Somme de e^(−r·a) pour a entier dans [from, to) (série géométrique, forme close). */
function cohortSum(r: number, from: number, to: number): number {
  const q = Math.exp(-r);
  const n = to - from;
  if (Math.abs(1 - q) < 1e-12) return n;
  return (Math.exp(-r * from) * (1 - Math.pow(q, n))) / (1 - q);
}

/**
 * Pente r du profil par âge telle que (effectif moyen par âge des 0–14 ans) / (effectif moyen des
 * 15–64 ans) = rapport observé. Dichotomie sur [−0,1 ; 0,1] (populations très vieillies ou très
 * jeunes au-delà).
 */
export function agePyramidSlope(share0: number, share1: number): number {
  if (!(share0 > 0) || !(share1 > 0)) return 0;
  const target = share0 / AGE_CHILD_END / (share1 / (AGE_ADULT_END - AGE_CHILD_END));
  const ratio = (r: number): number =>
    cohortSum(r, 0, AGE_CHILD_END) /
    AGE_CHILD_END /
    (cohortSum(r, AGE_CHILD_END, AGE_ADULT_END) / (AGE_ADULT_END - AGE_CHILD_END));
  let lo = -0.1;
  let hi = 0.1;
  if (target <= ratio(lo)) return lo;
  if (target >= ratio(hi)) return hi;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Parts annuelles de chaque tranche qui passent à la suivante, et part des 18–49 ans. */
export function ageFlows(r: number): {
  childToAdult: number;
  adultToSenior: number;
  manpower: number;
} {
  const child = cohortSum(r, 0, AGE_CHILD_END);
  const adult = cohortSum(r, AGE_CHILD_END, AGE_ADULT_END);
  return {
    childToAdult: Math.exp(-r * (AGE_CHILD_END - 1)) / child,
    adultToSenior: Math.exp(-r * (AGE_ADULT_END - 1)) / adult,
    manpower: cohortSum(r, MANPOWER_FROM, MANPOWER_TO) / adult,
  };
}

/** Somme pondérée des taux de mortalité de référence par la structure par âge (‰). */
function referenceMortality(ctx: SystemContext, s0: number, s1: number, s2: number): number {
  const m = ctx.model;
  return (m.get(K.m0) * s0 + m.get(K.m1) * s1 + m.get(K.m2) * s2) / 100;
}

/** Revenu réel par habitant en PPA (dollars internationaux du départ). */
export function realIncomePpp(state: State, i: number): number {
  const pop = state.e(C.pop)[i] as number;
  const index = state.worldInternal.get('usdPriceIndex') ?? 1;
  return pop > 0 ? ((state.e(C.gdpPpp)[i] as number) * 1e9) / pop / index : 0;
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const scale = S.internalArray('demo.mortalityScale', 1);
  const workingGrowth = S.internalArray('demo.workingAgeGrowth', 0);
  for (let i = 0; i < S.n; i++) {
    const s0 = (S.v(C.s0)[i] ?? 0) as number;
    const s1 = (S.v(C.s1)[i] ?? 0) as number;
    const s2 = (S.v(C.s2)[i] ?? 0) as number;
    const ref = referenceMortality(ctx, s0, s1, s2);
    const cdr = S.v(C.death)[i] as number;
    scale[i] = ref > 0 && cdr > 0 ? cdr / ref : 1;
    // Croissance initiale des 15–64 ans (flux d'un an sans mouvement), pour la croissance de
    // long terme dès le départ.
    const flows = ageFlows(agePyramidSlope(s0 / 100, s1 / 100));
    const a0 = s0 / 100;
    const a1 = s1 / 100;
    const deaths = (a1 * m.get(K.m1) * (scale[i] as number)) / 1000;
    const migration = (S.v(C.migration)[i] as number) / 1000;
    workingGrowth[i] =
      a1 > 0 ? (a0 * flows.childToAdult - a1 * flows.adultToSenior - deaths + migration) / a1 : 0;
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const dt = ctx.dt;
  const scale = S.internalArray('demo.mortalityScale', 1);
  const workingGrowth = S.internalArray('demo.workingAgeGrowth', 0);
  const mortalityTrend = Math.exp((-m.get(K.decline) / 100) * ctx.years);
  const m0 = m.get(K.m0) / 1000;
  const m1 = m.get(K.m1) / 1000;
  const m2 = m.get(K.m2) / 1000;
  const tfrTarget = m.get(K.fertilityTarget);
  const tfrYears = m.get(K.fertilityYears);
  const leMax = m.get(K.leMax);
  const leGain = m.get(K.leGain);
  const urbanMax = m.get(K.urbanMax);
  const urbanSpeed = m.get(K.urbanSpeed);

  for (let i = 0; i < S.n; i++) {
    const pop = S.v(C.pop)[i] as number;
    if (!(pop > 0)) continue;
    // Fécondité : convergence lente vers le niveau de long terme (valeur courante : état propre).
    const tfr = S.v(C.fertility)[i] as number;
    S.write(C.fertility, i, tfr + ((tfrTarget - tfr) * dt) / tfrYears);
    const tfrNow = S.effNow(C.fertility, i);

    const s0 = (S.v(C.s0)[i] as number) / 100;
    const s1 = (S.v(C.s1)[i] as number) / 100;
    const s2 = (S.v(C.s2)[i] as number) / 100;
    let a0 = pop * s0;
    let a1 = pop * s1;
    let a2 = pop * s2;
    const flows = ageFlows(agePyramidSlope(s0, s1));

    // Natalité : fécondité (levier) × poids des âges féconds, calée sur la natalité initiale.
    const tfr0 = S.base[C.fertility * S.n + i] as number;
    const s10 = (S.base[C.s1 * S.n + i] as number) / 100;
    const cbr0 = S.base[C.birth * S.n + i] as number;
    if (cbr0 > 0 && tfr0 > 0 && s10 > 0) S.write(C.birth, i, cbr0 * (tfrNow / tfr0) * (s1 / s10));
    const births = (S.effNow(C.birth, i) / 1000) * pop * dt;

    const k = (scale[i] as number) * mortalityTrend;
    const d0 = a0 * m0 * k * dt;
    const d1 = a1 * m1 * k * dt;
    const d2 = a2 * m2 * k * dt;
    const up0 = a0 * flows.childToAdult * dt;
    const up1 = a1 * flows.adultToSenior * dt;
    const migrants = ((S.e(C.migration)[i] as number) / 1000) * pop * dt;

    const adultBefore = a1;
    a0 = Math.max(0, a0 + births - d0 - up0);
    a1 = Math.max(0, a1 + up0 - d1 - up1 + migrants);
    a2 = Math.max(0, a2 + up1 - d2);
    const total = a0 + a1 + a2;
    S.write(C.pop, i, total);
    if (total > 0) {
      S.write(C.s0, i, (100 * a0) / total);
      S.write(C.s1, i, (100 * a1) / total);
      S.write(C.s2, i, (100 * a2) / total);
    }
    // Mortalité brute calculée par la structure par âge (‰ par an).
    const deaths = (d0 + d1 + d2) / dt;
    S.write(C.death, i, pop > 0 ? (1000 * deaths) / pop : 0);
    workingGrowth[i] = adultBefore > 0 ? (a1 / adultBefore - 1) / dt : 0;

    // Population active : taux d'activité constant (écart d'effectif des 15–64 ans).
    const labor0 = S.base[C.labor * S.n + i] as number;
    const pop0 = S.base[C.pop * S.n + i] as number;
    if (labor0 > 0 && pop0 > 0 && s10 > 0) S.write(C.labor, i, labor0 * (a1 / (pop0 * s10)));

    // Espérance de vie : gain annuel décroissant linéairement jusqu'au plafond.
    const le = S.v(C.lifeExp)[i] as number;
    if (le < leMax) {
      const gain = (leGain * (leMax - le)) / (leMax - LIFE_EXPECTANCY_REFERENCE);
      S.write(C.lifeExp, i, le + gain * dt);
    }
    // Urbanisation : croissance logistique vers le plafond.
    const u = S.v(C.urban)[i] as number;
    if (u > 0 && u < urbanMax) S.write(C.urban, i, u + urbanSpeed * u * (1 - u / urbanMax) * dt);
  }
}

function derive(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const fitness = m.get(K.fitness);
  const incomeMin = Math.log(HDI.incomeMin);
  const incomeMax = Math.log(HDI.incomeMax);
  const hdiInit = S.internalArray('demo.hdiInit', Number.NaN);
  for (let i = 0; i < S.n; i++) {
    const pop = S.e(C.pop)[i] as number;
    const s0 = (S.e(C.s0)[i] as number) / 100;
    const s1 = (S.e(C.s1)[i] as number) / 100;
    const flows = ageFlows(agePyramidSlope(s0, s1));
    S.write(C.manpower, i, Math.max(0, pop * s1 * flows.manpower * fitness));

    // IDH : l'initial (PNUD) est ajusté par l'évolution de ses composantes santé et revenu
    // (moyenne géométrique) ; la composante éducation reste celle du départ.
    const le = S.e(C.lifeExp)[i] as number;
    const income = realIncomePpp(S, i);
    const health = Math.max(0.01, (le - HDI.lifeMin) / (HDI.lifeMax - HDI.lifeMin));
    const wealth = Math.max(
      0.01,
      (Math.log(Math.max(1, income)) - incomeMin) / (incomeMax - incomeMin),
    );
    if (Number.isNaN(hdiInit[i] as number)) hdiInit[i] = health * wealth;
    const hdi0 = S.base[C.hdi * S.n + i] as number;
    const ratio = (health * wealth) / (hdiInit[i] as number);
    if (hdi0 > 0) S.write(C.hdi, i, Math.min(1, hdi0 * Math.cbrt(ratio)));
  }
}

export const demography: System = {
  id: 'demography',
  coefficients: Object.values(K),
  writes: [
    'demo.population',
    'demo.birth_rate',
    'demo.death_rate',
    'demo.fertility',
    'demo.life_expectancy',
    'demo.share_0_14',
    'demo.share_15_64',
    'demo.share_65plus',
    'demo.urbanization',
    'demo.labor_force',
    'demo.manpower',
    'demo.hdi',
  ],
  init,
  monthly,
  derive,
};
