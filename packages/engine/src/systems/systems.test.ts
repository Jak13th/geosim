import { describe, expect, it } from 'vitest';
import { fixtureData, loadModelTree } from '../../test/fixture.ts';
import { Engine } from '../engine.ts';
import { col } from '../state.ts';
import type { Slot } from '../types.ts';
import { ageFlows, agePyramidSlope } from './demography.ts';
import { defaultProbability, spreadOf } from './finance.ts';
import { Model } from '../model.ts';
import { REQUIRED_COEFFICIENTS } from '../engine.ts';

const data = fixtureData();
const tree = loadModelTree();
const make = (seed = 1): Engine => Engine.create(data, { seed, model: tree });
const country = (param: string, entity: string): Slot => ({ scope: 'country', param, entity });
const v = (e: Engine, param: string, entity: string): number => e.countryValue(param, entity);
/** Moteur sans aléa (chocs de croissance et de prix nuls, pas de défaut). */
function calm(seed = 1): Engine {
  const e = make(seed);
  for (const [path, value] of [
    ['economy.cycle.noise', 0],
    ['markets.oil.volatility', 0],
    ['markets.gas.volatility', 0],
    ['markets.coal.volatility', 0],
    ['markets.wheat.volatility', 0],
    ['markets.fertilizer.volatility', 0],
    ['markets.copper.volatility', 0],
    ['markets.lithium.volatility', 0],
    ['markets.rare_earths.volatility', 0],
    ['markets.uranium.volatility', 0],
    ['economy.default.probability_bbb', 0.01],
    ['economy.default.probability_max', 5],
  ] as const) {
    e.apply({ type: 'setCoefficient', path, value });
  }
  return e;
}
const months = (e: Engine, n: number): void => {
  for (let k = 0; k < n; k++) {
    const target = e.calendar.tickOf(`${e.calendar.isoAt(e.tick + 32).slice(0, 7)}-01`);
    e.runUntil(target);
  }
};

describe('démographie', () => {
  it('retrouve la pente du profil par âge à partir des parts', () => {
    for (const r of [-0.02, 0, 0.01, 0.03]) {
      const child = Array.from({ length: 15 }, (_, a) => Math.exp(-r * a)).reduce((s, x) => s + x);
      const adult = Array.from({ length: 50 }, (_, a) => Math.exp(-r * (a + 15))).reduce(
        (s, x) => s + x,
      );
      const total = child + adult;
      expect(agePyramidSlope(child / total, adult / total)).toBeCloseTo(r, 6);
    }
    const flows = ageFlows(0);
    expect(flows.childToAdult).toBeCloseTo(1 / 15, 9);
    expect(flows.adultToSenior).toBeCloseTo(1 / 50, 9);
    expect(flows.manpower).toBeCloseTo(32 / 50, 9);
  });

  it('fait vieillir une population à faible fécondité et croître une population jeune', () => {
    const e = calm();
    const fra65 = v(e, 'demo.share_65plus', 'FRA');
    const ngaPop = v(e, 'demo.population', 'NGA');
    months(e, 120);
    expect(v(e, 'demo.share_65plus', 'FRA')).toBeGreaterThan(fra65 + 2);
    expect(v(e, 'demo.population', 'NGA')).toBeGreaterThan(ngaPop * 1.2);
    const parts = ['demo.share_0_14', 'demo.share_15_64', 'demo.share_65plus'].map((p) =>
      v(e, p, 'NGA'),
    );
    expect(parts.reduce((a, b) => a + b)).toBeCloseTo(100, 6);
    // La fécondité converge vers le long terme, la natalité suit.
    expect(v(e, 'demo.fertility', 'NGA')).toBeLessThan(5);
    expect(v(e, 'demo.birth_rate', 'NGA')).toBeLessThan(35);
    // Population active proportionnelle aux 15–64 ans ; réservoir mobilisable positif.
    expect(v(e, 'demo.labor_force', 'NGA')).toBeGreaterThan(0);
    expect(v(e, 'demo.manpower', 'NGA')).toBeGreaterThan(0);
  });

  it('suit la fécondité saisie : moins de naissances', () => {
    const a = calm();
    const b = calm();
    b.apply({ type: 'set', slots: [country('demo.fertility', 'NGA')], value: 2 });
    months(a, 12);
    months(b, 12);
    expect(v(b, 'demo.birth_rate', 'NGA')).toBeLessThan(v(a, 'demo.birth_rate', 'NGA') * 0.5);
    expect(v(b, 'demo.population', 'NGA')).toBeLessThan(v(a, 'demo.population', 'NGA'));
  });
});

describe('marchés', () => {
  it('une baisse de la production saoudienne fait monter le pétrole, puis l’offre répond', () => {
    const e = calm();
    const base = e.state.worldNumber('world.oil_price');
    e.apply({
      type: 'adjust',
      slots: [country('energy.oil_production', 'SAU')],
      op: 'mul',
      amount: 0.5,
    });
    months(e, 6);
    const peak = e.state.worldNumber('world.oil_price');
    expect(peak).toBeGreaterThan(base * 1.2);
    months(e, 180);
    expect(e.state.worldNumber('world.oil_price')).toBeLessThan(peak);
  });

  it('sans choc, les prix restent proches de leur ancrage réel', () => {
    const e = calm();
    months(e, 60);
    const usd = e.state.worldInternal.get('usdPriceIndex') ?? 1;
    const real = e.state.worldNumber('world.oil_price') / usd;
    expect(real / 100).toBeGreaterThan(0.8);
    expect(real / 100).toBeLessThan(1.25);
  });

  it('l’offre de puces suit les parts de fabrication', () => {
    const e = calm();
    e.apply({ type: 'set', slots: [country('res.chip_fab_share', 'USA')], value: 5 });
    months(e, 1);
    expect(e.state.worldNumber('world.chip_supply')).toBeCloseTo(50, 6);
  });
});

describe('économie', () => {
  it('un choc pétrolier freine l’importateur, soutient l’exportateur et accélère l’inflation', () => {
    const base = calm();
    const shock = calm();
    shock.apply({
      type: 'addModifier',
      slots: [{ scope: 'world', param: 'world.oil_price' }],
      modifier: { op: 'mul', amount: 2, durationDays: 730, decay: 'none', label: 'Choc' },
    });
    months(base, 6);
    months(shock, 6);
    expect(v(shock, 'eco.output_gap', 'FRA')).toBeLessThan(v(base, 'eco.output_gap', 'FRA') - 0.3);
    expect(v(shock, 'eco.output_gap', 'SAU')).toBeGreaterThan(v(base, 'eco.output_gap', 'SAU'));
    expect(v(shock, 'eco.inflation', 'FRA')).toBeGreaterThan(v(base, 'eco.inflation', 'FRA') + 0.5);
    expect(v(shock, 'eco.current_account', 'FRA')).toBeLessThan(
      v(base, 'eco.current_account', 'FRA'),
    );
    expect(v(shock, 'eco.oil_rents', 'SAU')).toBeGreaterThan(v(base, 'eco.oil_rents', 'SAU') * 1.5);
    expect(v(shock, 'eco.unemployment', 'FRA')).toBeGreaterThan(v(base, 'eco.unemployment', 'FRA'));
  });

  it('l’inflation revient vers son ancrage ; la croissance potentielle vers le long terme', () => {
    const e = calm();
    e.apply({ type: 'set', slots: [country('eco.inflation', 'FRA')], value: 30 });
    e.apply({ type: 'set', slots: [country('eco.potential_growth', 'FRA')], value: 8 });
    months(e, 60);
    expect(v(e, 'eco.inflation', 'FRA')).toBeLessThan(4);
    const lr = v(e, 'eco.long_run_growth', 'FRA');
    expect(Math.abs(v(e, 'eco.potential_growth', 'FRA') - lr)).toBeLessThan(8 - lr);
  });

  it('un curseur modifié infléchit aussitôt la trajectoire (croissance potentielle)', () => {
    const a = calm();
    const b = calm();
    b.apply({
      type: 'adjust',
      slots: [country('eco.potential_growth', 'USA')],
      op: 'add',
      amount: 3,
    });
    months(a, 1);
    months(b, 1);
    expect(v(b, 'eco.gdp_nominal', 'USA')).toBeGreaterThan(v(a, 'eco.gdp_nominal', 'USA'));
  });

  it('le PIB en dollars courants suit le volume et l’inflation du dollar', () => {
    const e = calm();
    const gdp = v(e, 'eco.gdp_nominal', 'FRA');
    months(e, 24);
    const usd = e.state.worldInternal.get('usdPriceIndex') ?? 1;
    expect(usd).toBeGreaterThan(1.03);
    expect(v(e, 'eco.gdp_nominal', 'FRA')).toBeGreaterThan(gdp * usd);
  });
});

describe('budget, dette et défaut', () => {
  it('la dette suit le solde et la croissance nominale ; la règle budgétaire réagit', () => {
    const e = calm();
    e.apply({ type: 'set', slots: [country('bud.social', 'FRA')], value: 25 });
    const balance = v(e, 'bud.balance', 'FRA');
    expect(balance).toBeCloseTo(-18, 6);
    months(e, 24);
    expect(v(e, 'eco.public_debt', 'FRA')).toBeGreaterThan(115 + 15);
    expect(v(e, 'bud.fiscal_adjustment', 'FRA')).toBeGreaterThan(1);
  });

  it('les déficits d’un pays doté d’un fonds souverain puisent dans le fonds', () => {
    const e = calm();
    const fund = v(e, 'eco.sovereign_fund', 'SAU');
    const debt = v(e, 'eco.public_debt', 'SAU');
    months(e, 12);
    expect(v(e, 'eco.sovereign_fund', 'SAU')).toBeLessThan(fund);
    expect(v(e, 'eco.public_debt', 'SAU')).toBeLessThan(debt + 1);
  });

  it('prime de risque et probabilité de défaut croissent quand la notation baisse', () => {
    const m = new Model(tree, REQUIRED_COEFFICIENTS);
    expect(spreadOf(m, 12, false)).toBeGreaterThan(spreadOf(m, 18, false));
    expect(spreadOf(m, 18, true)).toBeCloseTo(spreadOf(m, 0, false), 9);
    expect(defaultProbability(m, 12)).toBeCloseTo(0.1, 9);
    expect(defaultProbability(m, 4)).toBeGreaterThan(2);
    expect(defaultProbability(m, 0)).toBeLessThanOrEqual(30);
  });

  it('un défaut souverain est journalisé avec ses facteurs, puis la dette est restructurée', () => {
    const e = make(2);
    e.apply({ type: 'setCoefficient', path: 'economy.default.probability_bbb', value: 2 });
    e.apply({ type: 'setCoefficient', path: 'economy.default.probability_max', value: 100 });
    e.apply({ type: 'set', slots: [country('eco.credit_rating', 'NGA')], value: 1 });
    const events = e.runUntil(e.calendar.tickOf('2030-01-01'));
    const d = events.find((x) => x.kind === 'default' && x.entities[0] === 'NGA');
    expect(d).toBeDefined();
    expect(d?.factors?.map((f) => f.id)).toContain('eco.public_debt');
    expect(d?.effects?.some((x) => x.modifier !== undefined)).toBe(true);
    const exit = events.find((x) => x.kind === 'default_exit' && x.entities[0] === 'NGA');
    expect(exit).toBeDefined();
    expect(exit?.effects?.[0]?.to as number).toBeLessThan(exit?.effects?.[0]?.from as number);
    // Les factions ne font pas défaut.
    expect(events.some((x) => x.kind === 'default' && x.entities[0] === 'FAC')).toBe(false);
  });

  it('le taux de marché suit le taux directeur mondial et l’inflation anticipée', () => {
    const e = calm();
    const rate = v(e, 'eco.sovereign_rate', 'USA');
    e.apply({ type: 'set', slots: [{ scope: 'world', param: 'world.policy_rate' }], value: 6 });
    expect(v(e, 'eco.sovereign_rate', 'USA')).toBeCloseTo(rate + 2, 9);
    const avg = v(e, 'eco.debt_avg_rate', 'USA');
    months(e, 12);
    expect(v(e, 'eco.debt_avg_rate', 'USA')).toBeGreaterThan(avg + 0.1);
  });
});

describe('invariants sur longue période (monde synthétique)', () => {
  it('30 ans sans valeur non finie ni sortie des bornes', () => {
    const e = make(11);
    e.runUntil(e.calendar.tickOf('2056-09-26'));
    const S = e.state;
    for (let k = 0; k < S.values.length; k++) {
      const x = S.values[k] as number;
      if (!Number.isNaN(S.base[k] as number)) expect(Number.isFinite(x), `valeur ${k}`).toBe(true);
    }
    expect(v(e, 'demo.population', 'FRA')).toBeGreaterThan(0);
    expect(S.worldNumber('world.oil_price')).toBeGreaterThan(0);
    expect(e.history.months).toBe(361);
    expect(col('eco.growth')).toBeGreaterThanOrEqual(0);
  });
});
