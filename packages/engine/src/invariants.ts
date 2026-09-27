/**
 * Invariants de l'état (CLAUDE.md, « Qualité ») : pas de NaN ni d'infini là où une valeur existe,
 * bornes du catalogue, populations positives, parts d'âge qui somment à 100, prix positifs,
 * relations dans [−100, 100], échanges bilatéraux positifs, capacités des détroits dans [0, 100],
 * états internes du monde interconnecté finis (mémoire et résidu des relations, commerce, flux
 * d'énergie établis, réfugiés). Renvoie la liste des violations (vide si tout va bien).
 */
import type { ParamDef } from '@geosim/shared';
import type { Engine } from './engine.ts';
import { COUNTRY_NUMERIC, WORLD_PARAMS, col } from './state.ts';

const PRICES = [
  'world.oil_price',
  'world.coal_price',
  'world.wheat_price',
  'world.fertilizer_price',
];
const PRICE_VECTORS = ['world.gas_price', 'world.metals_prices'];

/** États internes du monde interconnecté qui doivent rester finis. */
const FINITE_INTERNALS = [
  'dip.memory',
  'dip.residual',
  'trade.phi',
  'trade.level',
  'energy.established',
  'energy.replaced',
  'refugees.flows',
  'refugees.newAbroad',
  'refugees.newHosted',
  'econ.impulse.trade',
  'econ.impulse.sanctions',
  'econ.impulse.energy',
  'econ.impulse.critical',
];

/** Stocks et flux qui ne peuvent pas être négatifs. */
const NON_NEGATIVE_INTERNALS = [
  'refugees.flows',
  'refugees.newAbroad',
  'refugees.newHosted',
  'trade.phi',
];

export function checkInvariants(engine: Engine, limit = 50): string[] {
  const S = engine.state;
  const out: string[] = [];
  const add = (msg: string): void => {
    if (out.length < limit) out.push(msg);
  };
  COUNTRY_NUMERIC.forEach((def: ParamDef, p) => {
    for (let i = 0; i < S.n; i++) {
      const base = S.base[p * S.n + i] as number;
      const x = S.values[p * S.n + i] as number;
      const e = S.eff[p * S.n + i] as number;
      const who = `${def.id} (${S.entities[i]?.id ?? i})`;
      if (Number.isNaN(base) && Number.isNaN(x)) continue; // paramètre sans valeur (phase ultérieure)
      if (!Number.isFinite(x) || !Number.isFinite(e)) {
        add(`${who} : valeur non finie (${x})`);
        continue;
      }
      if (def.min !== undefined && e < def.min - 1e-9) add(`${who} : ${e} < ${def.min}`);
      if (def.max !== undefined && e > def.max + 1e-9) add(`${who} : ${e} > ${def.max}`);
    }
  });
  const pop = S.v(col('demo.population'));
  const s0 = S.v(col('demo.share_0_14'));
  const s1 = S.v(col('demo.share_15_64'));
  const s2 = S.v(col('demo.share_65plus'));
  for (let i = 0; i < S.n; i++) {
    const id = S.entities[i]?.id ?? String(i);
    if (!((pop[i] as number) >= 0)) add(`demo.population (${id}) : ${pop[i]} < 0`);
    const sum = (s0[i] as number) + (s1[i] as number) + (s2[i] as number);
    if ((pop[i] as number) > 0 && Math.abs(sum - 100) > 0.5)
      add(`parts d'âge (${id}) : somme ${sum.toFixed(2)} %`);
  }
  for (const id of PRICES) {
    const x = S.worldNumber(id);
    if (!(x > 0) || !Number.isFinite(x)) add(`${id} : prix ${x}`);
  }
  for (const id of PRICE_VECTORS) {
    for (const [k, x] of Object.entries(S.worldVector(id))) {
      if (!(x > 0) || !Number.isFinite(x)) add(`${id}.${k} : prix ${x}`);
    }
  }
  for (const def of WORLD_PARAMS) {
    if (def.valueType !== 'number') continue;
    const x = S.world.get(def.id);
    if (typeof x === 'number' && !Number.isFinite(x)) add(`${def.id} : valeur non finie`);
  }
  const relations = S.pairMatrix('pair.relation');
  for (let k = 0; k < relations.length; k++) {
    const r = relations[k] as number;
    if (!Number.isNaN(r) && (r < -100 || r > 100))
      add(`pair.relation [${k}] : ${r} hors de [−100, 100]`);
  }
  const trade = S.pairMatrix('pair.trade');
  for (let k = 0; k < trade.length; k++) {
    const t = trade[k] as number;
    if (!Number.isNaN(t) && !(t >= 0 && Number.isFinite(t))) add(`pair.trade [${k}] : ${t}`);
  }
  for (const [id, x] of S.zone.get('zone.chokepoint_traffic') ?? []) {
    if (typeof x === 'number' && !(x >= 0 && x <= 100))
      add(`zone.chokepoint_traffic (${id}) : ${x}`);
  }
  for (const [id, x] of S.zone.get('zone.chokepoint_flow') ?? []) {
    if (typeof x === 'number' && !(x >= 0 && Number.isFinite(x)))
      add(`zone.chokepoint_flow (${id}) : ${x}`);
  }
  for (const key of FINITE_INTERNALS) {
    const a = S.internal.get(key);
    if (a === undefined) continue;
    for (let k = 0; k < a.length; k++) {
      if (!Number.isFinite(a[k] as number)) {
        add(`${key} [${k}] : valeur non finie`);
        break;
      }
    }
  }
  for (const key of NON_NEGATIVE_INTERNALS) {
    const a = S.internal.get(key);
    if (a === undefined) continue;
    for (let k = 0; k < a.length; k++) {
      if ((a[k] as number) < -1e-6) {
        add(`${key} [${k}] : ${a[k]} < 0`);
        break;
      }
    }
  }
  return out;
}
