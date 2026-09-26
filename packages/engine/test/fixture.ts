/**
 * Monde synthétique pour les tests du moteur : cinq entités aux valeurs plausibles (numéraire,
 * économie avancée importatrice d'énergie, exportateur de pétrole avec fonds souverain, pays en
 * développement, faction), toutes les valeurs du catalogue renseignées, et les coefficients réels
 * de config/model.yaml. Indépendant de `npm run data`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CATALOG,
  type CoefficientTree,
  type CountriesBase,
  type CountryRecord,
  type PairsBase,
  type ParamValue,
  type ResolvedValue,
  type WorldBaseFile,
} from '@geosim/shared';
import { parse } from 'yaml';
import { coefficientTree } from '../src/model.ts';
import type { EngineData } from '../src/state.ts';

export const MODEL_PATH = fileURLToPath(new URL('../../../config/model.yaml', import.meta.url));

export function loadModelTree(): CoefficientTree {
  return coefficientTree(parse(readFileSync(MODEL_PATH, 'utf8')));
}

type Values = Record<string, ParamValue>;

/** Valeurs communes à toutes les entités (surchargées ci-dessous). */
const COMMON: Values = {
  'demo.birth_rate': 12,
  'demo.death_rate': 8,
  'demo.fertility': 1.9,
  'demo.life_expectancy': 76,
  'demo.share_0_14': 20,
  'demo.share_15_64': 65,
  'demo.share_65plus': 15,
  'demo.urbanization': 60,
  'demo.net_migration': 1,
  'demo.human_capital': 0.7,
  'demo.hdi': 0.8,
  'eco.potential_growth': 2,
  'eco.inflation': 3,
  'eco.inflation_target': 2,
  'eco.cb_independence': 0.7,
  'eco.unemployment': 5,
  'eco.public_debt': 60,
  'eco.debt_maturity': 6,
  'eco.debt_avg_rate': 3,
  'eco.credit_rating': 15,
  'eco.reserves_frozen': 0,
  'eco.current_account': 0,
  'eco.reserve_currency': 0,
  'eco.exchange_regime': 'floating',
  'eco.oil_rents': 0,
  'eco.gas_rents': 0,
  'eco.resource_rents': 1,
  'eco.sovereign_fund': 0,
  'bud.revenue': 35,
  'bud.defense': 2,
  'bud.social': 12,
  'bud.health': 6,
  'bud.education': 5,
  'bud.rnd': 0.5,
  'bud.infrastructure': 3,
  'bud.subsidies': 1,
  'bud.security': 1,
  'bud.foreign_aid': 0.2,
  'bud.monetization': 0,
  'bud.balance': -3,
  'trade.imports': 30,
  'trade.exports': 30,
  'energy.primary_consumption': 1000,
  'energy.oil_production': 0,
  'energy.oil_consumption': 400,
  'energy.gas_production': 0,
  'energy.gas_consumption': 300,
  'energy.coal_production': 0,
  'energy.coal_consumption': 100,
  'energy.spare_capacity': 0,
  'res.food_spending_share': 15,
  'res.grain_export_share': 5,
  'res.fertilizer_export_share': 5,
  'res.chip_fab_share': 0,
  'res.critical_minerals': { copper: 5, lithium: 5, rare_earths: 5, uranium: 5 },
  'pol.stability': 60,
  'pol.gov_effectiveness': 60,
  'pol.rule_of_law': 60,
  'pol.corruption_control': 60,
};

export const FIXTURE_ENTITIES: {
  id: string;
  kind: CountryRecord['kind'];
  region: string;
  income: string;
  parent: string | null;
  values: Values;
}[] = [
  {
    id: 'USA',
    kind: 'state',
    region: 'NAC',
    income: 'HIC',
    parent: null,
    values: {
      'demo.population': 340e6,
      'demo.labor_force': 170e6,
      'eco.gdp_nominal': 30000,
      'eco.gdp_ppp': 30000,
      'eco.reserves': 1000,
      'eco.reserve_currency': 0.57,
      'eco.credit_rating': 19,
      'eco.public_debt': 120,
      'bud.balance': -6,
      'eco.potential_growth': 1.9,
      'energy.primary_consumption': 26000,
      'energy.oil_production': 10000,
      'energy.oil_consumption': 9900,
      'energy.gas_production': 10000,
      'energy.gas_consumption': 9000,
      'res.chip_fab_share': 10,
      'res.grain_export_share': 15,
    },
  },
  {
    id: 'FRA',
    kind: 'state',
    region: 'ECS',
    income: 'HIC',
    parent: null,
    values: {
      'demo.population': 68e6,
      'demo.labor_force': 31e6,
      'demo.share_0_14': 16,
      'demo.share_15_64': 61,
      'demo.share_65plus': 23,
      'demo.birth_rate': 9.7,
      'demo.death_rate': 9.4,
      'demo.fertility': 1.6,
      'eco.gdp_nominal': 3500,
      'eco.gdp_ppp': 4000,
      'eco.reserves': 300,
      'eco.reserve_currency': 0.2,
      'eco.exchange_regime': 'monetary_union',
      'eco.public_debt': 115,
      'eco.credit_rating': 16,
      'bud.revenue': 51,
      'bud.balance': -5,
      'energy.primary_consumption': 2500,
      'energy.oil_consumption': 780,
      'energy.gas_consumption': 320,
      'energy.coal_consumption': 50,
      'res.chip_fab_share': 0,
    },
  },
  {
    id: 'SAU',
    kind: 'state',
    region: 'MEA',
    income: 'HIC',
    parent: null,
    values: {
      'demo.population': 37e6,
      'demo.labor_force': 17e6,
      'eco.gdp_nominal': 1400,
      'eco.gdp_ppp': 2700,
      'eco.reserves': 500,
      'eco.exchange_regime': 'fixed',
      'eco.public_debt': 30,
      'eco.credit_rating': 16,
      'eco.sovereign_fund': 950,
      'eco.oil_rents': 24,
      'eco.gas_rents': 2,
      'eco.resource_rents': 26,
      'bud.revenue': 27,
      'bud.balance': -3.5,
      'energy.primary_consumption': 3300,
      'energy.oil_production': 6000,
      'energy.oil_consumption': 2000,
      'energy.gas_production': 1200,
      'energy.gas_consumption': 1200,
      'energy.coal_consumption': 0,
      'energy.spare_capacity': 2,
      'res.grain_export_share': 0,
      'res.chip_fab_share': 0,
    },
  },
  {
    id: 'NGA',
    kind: 'state',
    region: 'SSF',
    income: 'LMC',
    parent: null,
    values: {
      'demo.population': 230e6,
      'demo.labor_force': 75e6,
      'demo.birth_rate': 35,
      'demo.death_rate': 12,
      'demo.fertility': 5,
      'demo.life_expectancy': 55,
      'demo.share_0_14': 42,
      'demo.share_15_64': 55,
      'demo.share_65plus': 3,
      'demo.net_migration': -0.3,
      'eco.gdp_nominal': 380,
      'eco.gdp_ppp': 1500,
      'eco.potential_growth': 4.2,
      'eco.inflation': 16,
      'eco.inflation_target': 7.5,
      'eco.cb_independence': 0.5,
      'eco.unemployment': 10,
      'eco.reserves': 40,
      'eco.exchange_regime': 'managed',
      'eco.public_debt': 35,
      'eco.credit_rating': 5,
      'eco.current_account': -2,
      'eco.oil_rents': 6,
      'bud.revenue': 11,
      'bud.balance': -4,
      'energy.primary_consumption': 530,
      'energy.oil_production': 900,
      'energy.oil_consumption': 150,
      'energy.gas_production': 450,
      'energy.gas_consumption': 250,
      'energy.coal_consumption': 5,
      'res.food_spending_share': 55,
      'res.chip_fab_share': 0,
      'pol.stability': 25,
      'pol.gov_effectiveness': 30,
      'pol.rule_of_law': 30,
      'pol.corruption_control': 25,
    },
  },
  {
    id: 'FAC',
    kind: 'faction',
    region: 'SSF',
    income: 'LIC',
    parent: 'NGA',
    values: {
      'demo.population': 5e6,
      'demo.labor_force': 1.5e6,
      'eco.gdp_nominal': 3,
      'eco.gdp_ppp': 10,
      'eco.reserves': 0,
      'eco.credit_rating': 4,
      'bud.revenue': 5,
      'bud.balance': -2,
      'energy.primary_consumption': 5,
      'energy.oil_consumption': 3,
      'energy.gas_consumption': 0,
      'energy.coal_consumption': 0,
      'pol.stability': 10,
    },
  },
];

function defaultValue(id: string): ParamValue {
  const def = CATALOG.find((d) => d.id === id);
  if (def === undefined) return null;
  switch (def.valueType) {
    case 'number':
      return def.min !== undefined && def.min > 0 ? def.min : 0;
    case 'enum':
      return def.enumValues?.[0] ?? null;
    case 'bool':
      return false;
    case 'date':
      return '2027-01-01';
    case 'list':
      return [];
    case 'vector':
      return Object.fromEntries((def.components ?? []).map((c) => [c, 0]));
  }
}

const RUNTIME = CATALOG.filter(
  (d) =>
    d.scope === 'country' &&
    (d.kind === 'derived' ||
      [
        'bud.tax_efficiency',
        'bud.other_spending',
        'bud.fiscal_adjustment',
        'eco.in_default',
        'eco.long_run_growth',
      ].includes(d.id)),
)
  .map((d) => d.id)
  .filter((id) => !['demo.hdi', 'bud.balance', 'mil.budget'].includes(id));

function resolved(value: ParamValue): ResolvedValue {
  return { value, source: 'TEST', date: '2026', confidence: 'high', method: 'source' };
}

export function fixtureData(): EngineData {
  const entities: CountryRecord[] = FIXTURE_ENTITIES.map((e, k) => {
    const params: Record<string, ResolvedValue> = {};
    for (const def of CATALOG.filter((d) => d.scope === 'country')) {
      if (RUNTIME.includes(def.id)) continue;
      const v = e.values[def.id] ?? COMMON[def.id] ?? defaultValue(def.id);
      params[def.id] = resolved(v);
    }
    return {
      index: k + 1,
      id: e.id,
      name: e.id,
      nameFr: e.id,
      kind: e.kind,
      detail: 'full',
      region: e.region,
      income: e.income,
      classification: 'world_bank',
      parent: e.parent,
      params,
    };
  });
  const countries: CountriesBase = {
    version: 1,
    buildDate: '2026-09-26',
    mapBuildId: 'test',
    runtimeParams: RUNTIME,
    entities,
  };
  const pairs: PairsBase = {
    version: 1,
    buildDate: '2026-09-26',
    runtimeParams: ['pair.affinity', 'pair.aid', 'pair.perceived_power'],
    params: {
      'pair.trade': {
        unit: 'Md$/an',
        default: 0,
        defaultNote: 'aucun',
        refs: [{ source: 'TEST', date: '2026', confidence: 'high' }],
        entries: [
          ['FRA', 'USA', 60, 0],
          ['USA', 'FRA', 50, 0],
          ['SAU', 'USA', 20, 0],
          ['SAU', 'FRA', 10, 0],
          ['NGA', 'FRA', 8, 0],
          ['USA', 'NGA', 3, 0],
        ],
      },
      'pair.relation': {
        unit: '',
        default: null,
        defaultNote: 'modèle d’affinité',
        refs: [{ source: 'TEST', date: '2026', confidence: 'assumption' }],
        entries: [
          ['USA', 'FRA', 60, 0],
          ['FRA', 'USA', 55, 0],
        ],
      },
      'pair.war_state': { unit: '', default: 'peace', defaultNote: 'paix', refs: [], entries: [] },
      'pair.treaty': { unit: '', default: 'none', defaultNote: 'aucun', refs: [], entries: [] },
      'pair.sanctions': { unit: '', default: {}, defaultNote: 'aucune', refs: [], entries: [] },
    },
  };
  const world: WorldBaseFile = {
    version: 1,
    buildDate: '2026-09-26',
    params: {
      'world.oil_price': resolved(100),
      'world.gas_price': resolved({ europe: 24, asia: 25, americas: 3.3 }),
      'world.coal_price': resolved(140),
      'world.wheat_price': resolved(260),
      'world.fertilizer_price': resolved(160),
      'world.metals_prices': resolved({
        copper: 14000,
        lithium: 20000,
        rare_earths: 140000,
        uranium: 90,
      }),
      'world.chip_supply': resolved(null),
      'world.policy_rate': resolved(4),
      'world.dollar_dominance': resolved(57),
      'world.trade_fragmentation': resolved(45),
      'world.growth': resolved(null),
      'world.nuclear_taboo': resolved(85),
      'world.escalation': resolved(null),
      'world.un_effectiveness': resolved(30),
      'world.alliance_credibility': resolved(1),
      'world.climate_scenario': resolved('SSP2-4.5'),
      'world.pandemic_rate': resolved(2.5),
      'world.tech_pace': resolved(1),
      'world.event_frequency': resolved(1),
    },
    blocs: [],
    conflicts: [],
    chokepoints: [
      {
        id: 'hormuz',
        name: 'Strait of Hormuz',
        nameFr: 'Détroit d’Ormuz',
        kind: 'strait',
        riparians: [],
        lonLat: [56.4, 26.6],
        status: {
          value: 'contested',
          traffic_pct: 40,
          normal_traffic: '20 Mb/j',
          source: 'TEST',
          date: '2026',
          confidence: 'high',
        },
      },
    ],
    zones: { control: [] },
  };
  return { countries, pairs, world };
}
