/**
 * Tests unitaires des systèmes de la phase 4 (monde interconnecté) sur le monde synthétique,
 * complété ici de routes maritimes (Ormuz), de dépendances énergétiques et critiques, de blocs,
 * de régimes et de sièges au Conseil de sécurité.
 */
import type { EngineData } from '../state.ts';
import type { ParamValue, ResolvedValue } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { fixtureData, loadModelTree } from '../../test/fixture.ts';
import { Engine } from '../engine.ts';
import { checkInvariants } from '../invariants.ts';
import type { Command, Slot } from '../types.ts';
import { affinityFactors } from './diplomacy.ts';
import { ENERGY_OUT } from './energy.ts';
import { coupRisk, stabilityContributions } from './politics.ts';
import { departurePressure } from './refugees.ts';
import { RESOURCES_OUT, foodStress } from './resources.ts';
import { SANCTIONS_OUT } from './sanctions.ts';
import { TRADE_OUT, seaAccess, type RouteTable } from './trade.ts';

const tree = loadModelTree();

function resolved(value: ParamValue): ResolvedValue {
  return { value, source: 'TEST', date: '2026', confidence: 'high', method: 'source' };
}

const PROFILE = {
  'ai.aggressiveness': 60,
  'ai.alliance_loyalty': 40,
  'ai.revisionism': 50,
  'ai.ideology_weight': 40,
};
const OPPOSITION = {
  'ai.aggressiveness': 30,
  'ai.alliance_loyalty': 80,
  'ai.revisionism': 10,
  'ai.ideology_weight': 30,
};

/** Monde synthétique complété pour la phase 4. */
function worldData(): EngineData {
  const data = fixtureData();
  const set = (id: string, values: Record<string, ParamValue>): void => {
    const e = data.countries.entities.find((x) => x.id === id);
    if (!e) throw new Error(id);
    for (const [k, v] of Object.entries(values)) e.params[k] = resolved(v);
  };
  set('USA', {
    'pol.regime_type': 'flawed_democracy',
    'pol.electoral_democracy': 0.8,
    'pol.next_election': '2027-01-01',
    'pol.approval': 45,
    'dip.unsc_seat': 'permanent',
    'dip.memberships': ['nato'],
    'dip.alignment': 60,
    'trade.oil_stocks': 30,
    ...PROFILE,
    'ai.opposition_profile': OPPOSITION,
  });
  set('FRA', {
    'pol.regime_type': 'democracy',
    'pol.electoral_democracy': 0.85,
    'pol.next_election': '2031-04-10',
    'dip.unsc_seat': 'permanent',
    'dip.memberships': ['nato'],
    'dip.alignment': 50,
    'trade.oil_stocks': 90,
    'eco.manufacturing_share': 10,
  });
  set('SAU', {
    'pol.regime_type': 'absolute_monarchy',
    'pol.electoral_democracy': 0.05,
    'pol.next_election': null,
    'dip.unsc_seat': 'none',
    'dip.memberships': ['opec'],
    'dip.alignment': -10,
  });
  set('NGA', {
    'pol.regime_type': 'flawed_democracy',
    'pol.electoral_democracy': 0.45,
    'pol.next_election': '2031-02-20',
    'dip.unsc_seat': 'elected',
    'dip.memberships': ['opec', 'ecowas'],
    'dip.alignment': -20,
    'res.grain_self_sufficiency': 20,
    'eco.financial_integration': 0.6,
    'trade.sanction_evasion': 0.5,
  });
  set('FAC', { 'pol.next_election': null, 'dip.memberships': [] });
  const both = (a: string, b: string, v: ParamValue): [string, string, ParamValue, number][] => [
    [a, b, v, 0],
    [b, a, v, 0],
  ];
  data.pairs.params['pair.energy_dependence'] = {
    unit: '%',
    default: 0,
    defaultNote: 'aucune',
    refs: [],
    entries: [
      ['FRA', 'SAU', 40, 0],
      ['FRA', 'USA', 30, 0],
      ['NGA', 'SAU', 20, 0],
    ],
  };
  data.pairs.params['pair.critical_dependence'] = {
    unit: '% par produit',
    default: null,
    defaultNote: 'aucune',
    refs: [],
    // Entrées volontairement hors de l'ordre des clés (voir le test de restauration).
    entries: [
      ['FRA', 'SAU', { chips: 13, rare_earths: 21, grain: 0, arms: 0 }, 0],
      ['FRA', 'NGA', { chips: 17, rare_earths: 37, grain: 0, arms: 0 }, 0],
      ['FRA', 'USA', { chips: 60, rare_earths: 11, grain: 0, arms: 0 }, 0],
    ],
  };
  data.pairs.params['pair.distance'] = {
    unit: 'km',
    default: null,
    defaultNote: 'inconnue',
    refs: [],
    entries: [
      ...both('USA', 'FRA', { great_circle: 6000, land: -1, sea: 7000 }),
      ...both('SAU', 'FRA', { great_circle: 4600, land: 5500, sea: 11000 }),
      ...both('NGA', 'FRA', { great_circle: 4500, land: 5000, sea: 6000 }),
      ...both('SAU', 'NGA', { great_circle: 4200, land: 5200, sea: 12000 }),
      ...both('USA', 'NGA', { great_circle: 9000, land: -1, sea: 9500 }),
      ...both('USA', 'SAU', { great_circle: 11000, land: -1, sea: 19000 }),
    ],
  };
  // Traités issus des blocs, tels que le pipeline les écrit (l'OTAN : défense mutuelle).
  data.pairs.params['pair.treaty'] = {
    unit: '',
    default: 'none',
    defaultNote: 'aucun',
    refs: [],
    entries: both('USA', 'FRA', 'mutual_defense'),
  };
  data.pairs.params['pair.treaty_credibility'] = {
    unit: '0–1',
    default: null,
    defaultNote: 'aucun traité',
    refs: [],
    entries: both('USA', 'FRA', 0.8),
  };
  data.pairs.routes = {
    chokepoints: ['hormuz'],
    entries: [
      ['SAU', 'FRA', 11000, 1, 0, 0],
      ['SAU', 'USA', 19000, 1, 0, 0],
      ['SAU', 'NGA', 12000, 1, 0, 0],
      ['USA', 'FRA', 7000, 0, 0, 0],
      ['USA', 'NGA', 9500, 0, 0, 0],
      ['FRA', 'NGA', 6000, 0, 0, 0],
    ],
  };
  const ref = { source: 'TEST', date: '2026', confidence: 'high' as const };
  data.world.blocs = [
    {
      id: 'nato',
      name: 'NATO',
      nameFr: 'OTAN',
      kind: 'military_alliance',
      members: ['USA', 'FRA'],
      rules: { mutual_defense: true },
      ...ref,
    },
    {
      id: 'opec',
      name: 'OPEC',
      nameFr: 'OPEP',
      kind: 'energy_cartel',
      members: ['SAU', 'NGA'],
      rules: { mutual_defense: false },
      ...ref,
    },
    {
      id: 'ecowas',
      name: 'ECOWAS',
      nameFr: 'CEDEAO',
      kind: 'regional_organization',
      members: ['NGA'],
      rules: { mutual_defense: false, suspends_after_coup: true },
      ...ref,
    },
  ];
  return data;
}

const data = worldData();
const make = (seed = 1): Engine => Engine.create(data, { seed, model: tree });
const country = (param: string, entity: string): Slot => ({ scope: 'country', param, entity });
const pair = (param: string, from: string, to: string): Slot => ({
  scope: 'pair',
  param,
  from,
  to,
});
const hormuz: Slot = { scope: 'zone', param: 'zone.chokepoint_status', target: 'hormuz' };
const v = (e: Engine, param: string, entity: string): number => e.countryValue(param, entity);
const idx = (e: Engine, id: string): number => e.state.byId.get(id) as number;
const pairValue = (e: Engine, param: string, a: string, b: string): number =>
  e.state.pairMatrix(param)[idx(e, a) * e.state.n + idx(e, b)] as number;
const internal = (e: Engine, key: string, id: string): number =>
  e.state.internalArray(key, 0)[idx(e, id)] as number;
const zone = (e: Engine, param: string, id: string): number =>
  e.state.zoneValue(param, id) as number;

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
    ['politics.coups.max', 0],
  ] as const) {
    e.apply({ type: 'setCoefficient', path, value });
  }
  return e;
}

const months = (e: Engine, n: number): void => {
  for (let k = 0; k < n; k++) {
    e.runUntil(e.calendar.tickOf(`${e.calendar.isoAt(e.tick + 32).slice(0, 7)}-01`));
  }
};

const sanctions = (from: string[], to: string, value: Record<string, number>): Command => ({
  type: 'set',
  slots: from.map((f) => pair('pair.sanctions', f, to)),
  value,
});

describe('commerce, routes et détroits', () => {
  it('accès maritime : route principale, report sur l’alternative avec perte de détour', () => {
    const table: RouteTable = {
      chokepoints: ['a', 'b'],
      index: new Int32Array(0),
      mainKm: Float64Array.from([10000, 10000]),
      mainMask: Int32Array.from([1, 1]),
      altKm: Float64Array.from([15000, 0]),
      altMask: Int32Array.from([2, 0]),
    };
    const open = seaAccess(table, Float64Array.from([1, 1]), 0.5);
    expect(Array.from(open.access)).toEqual([1, 1]);
    const closed = seaAccess(table, Float64Array.from([0, 1]), 0.5);
    expect(closed.access[0]).toBeCloseTo(Math.sqrt(10000 / 15000), 12);
    expect(closed.access[1]).toBe(0);
    const half = seaAccess(table, Float64Array.from([0.5, 1]), 0.5);
    expect(half.access[0]).toBeCloseTo(0.5 + 0.5 * Math.sqrt(2 / 3), 12);
  });

  it('fermer Ormuz coupe les échanges qui le traversent, rouvrir les rétablit progressivement', () => {
    const e = calm();
    const before = pairValue(e, 'pair.trade', 'SAU', 'FRA');
    const other = pairValue(e, 'pair.trade', 'FRA', 'USA');
    expect(zone(e, 'zone.chokepoint_traffic', 'hormuz')).toBe(40);
    e.apply({ type: 'set', slots: [hormuz], value: 'closed' });
    months(e, 3);
    expect(zone(e, 'zone.chokepoint_traffic', 'hormuz')).toBe(0);
    // Il reste la part terrestre (5 500 km de route) : 6 à 7 % des échanges.
    expect(pairValue(e, 'pair.trade', 'SAU', 'FRA')).toBeLessThan(0.25 * before);
    expect(Math.abs(pairValue(e, 'pair.trade', 'FRA', 'USA') / other - 1)).toBeLessThan(0.1);
    expect(zone(e, 'zone.chokepoint_flow', 'hormuz')).toBeLessThan(5);
    e.apply({ type: 'set', slots: [hormuz], value: 'open' });
    months(e, 1);
    const recovering = zone(e, 'zone.chokepoint_traffic', 'hormuz');
    expect(recovering).toBeGreaterThan(0);
    expect(recovering).toBeLessThan(100);
    months(e, 24);
    expect(zone(e, 'zone.chokepoint_traffic', 'hormuz')).toBeGreaterThan(99);
    // Plus d'échanges qu'au départ, où le détroit n'était ouvert qu'à 40 %.
    expect(pairValue(e, 'pair.trade', 'SAU', 'FRA')).toBeGreaterThan(1.5 * before);
    expect(checkInvariants(e)).toEqual([]);
  });

  it('des sanctions commerciales coupent le flux visé ; l’exportateur se réoriente en partie', () => {
    const a = calm();
    const b = calm();
    b.apply(sanctions(['USA'], 'NGA', { trade: 1 }));
    months(a, 6);
    months(b, 6);
    expect(pairValue(b, 'pair.trade', 'USA', 'NGA')).toBeLessThan(
      0.2 * pairValue(a, 'pair.trade', 'USA', 'NGA'),
    );
    expect(pairValue(b, 'pair.trade', 'USA', 'FRA')).toBeGreaterThan(
      pairValue(a, 'pair.trade', 'USA', 'FRA'),
    );
    expect(v(b, 'trade.imports', 'NGA')).toBeLessThan(v(a, 'trade.imports', 'NGA'));
  });

  it('des droits de douane réduisent les importations et renchérissent les biens importés', () => {
    const a = calm();
    const b = calm();
    b.apply({
      type: 'adjust',
      slots: [country('trade.tariff_level', 'FRA')],
      op: 'add',
      amount: 25,
    });
    months(a, 1);
    months(b, 1);
    expect(internal(b, TRADE_OUT.jump, 'FRA')).toBeGreaterThan(0);
    months(a, 6);
    months(b, 6);
    expect(pairValue(b, 'pair.trade', 'USA', 'FRA')).toBeLessThan(
      0.8 * pairValue(a, 'pair.trade', 'USA', 'FRA'),
    );
  });
});

describe('sanctions', () => {
  it('pression financière selon les monnaies de réserve des émetteurs, contournement progressif', () => {
    const a = calm();
    const b = calm();
    b.apply(sanctions(['USA', 'FRA'], 'NGA', { finance: 1, elites: 1 }));
    months(a, 1);
    months(b, 1);
    const finance = internal(b, SANCTIONS_OUT.finance, 'NGA');
    expect(finance).toBeGreaterThan(0.5);
    expect(internal(b, SANCTIONS_OUT.impulse, 'NGA')).toBeLessThan(0);
    expect(internal(b, SANCTIONS_OUT.spread, 'NGA')).toBeGreaterThan(0);
    const evasion1 = internal(b, SANCTIONS_OUT.evasion, 'NGA');
    months(a, 12);
    months(b, 12);
    expect(internal(b, SANCTIONS_OUT.evasion, 'NGA')).toBeGreaterThan(evasion1);
    expect(v(b, 'eco.sovereign_rate', 'NGA')).toBeGreaterThan(v(a, 'eco.sovereign_rate', 'NGA'));
    // Relations : le pays visé en veut aux émetteurs.
    expect(pairValue(b, 'pair.relation', 'NGA', 'USA')).toBeLessThan(
      pairValue(a, 'pair.relation', 'NGA', 'USA') - 3,
    );
  });

  it('contrôles technologiques : pénurie de puces chez l’importateur visé', () => {
    const a = calm();
    const b = calm();
    b.apply(sanctions(['USA'], 'FRA', { technology: 1 }));
    months(a, 1);
    months(b, 1);
    // Impulsion du mois où la pénurie apparaît (négative), puis rattrapage avec le remplacement.
    expect(internal(b, RESOURCES_OUT.impulse, 'FRA')).toBeLessThan(0);
    expect(internal(b, SANCTIONS_OUT.tech, 'FRA')).toBeGreaterThan(0);
    months(b, 1);
    expect(internal(b, RESOURCES_OUT.impulse, 'FRA')).toBeGreaterThan(0);
  });
});

describe('énergie', () => {
  it('fermeture d’Ormuz : manque, remplacement progressif, stocks puis rationnement expliqué', () => {
    const e = calm();
    e.apply({ type: 'set', slots: [country('trade.oil_stocks', 'FRA')], value: 0 });
    e.apply({ type: 'set', slots: [hormuz], value: 'closed' });
    months(e, 1);
    const shortfall = internal(e, ENERGY_OUT.shortfall, 'FRA');
    expect(shortfall).toBeGreaterThan(0.2);
    const replaced1 = internal(e, ENERGY_OUT.replaced, 'FRA');
    expect(replaced1).toBeLessThan(shortfall);
    expect(v(e, 'energy.supply_gap', 'FRA')).toBeGreaterThan(0);
    const event = e.journal.find((j) => j.kind === 'energy_shortage' && j.entities[0] === 'FRA');
    expect(event).toBeDefined();
    const ids = (event?.factors ?? []).map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'energy.supply_gap',
        'trade.oil_stocks',
        'pair.energy_dependence:SAU',
      ]),
    );
    months(e, 6);
    expect(internal(e, ENERGY_OUT.replaced, 'FRA')).toBeGreaterThan(replaced1);
    expect(v(e, 'energy.supply_gap', 'FRA')).toBeLessThan(0.5);
    expect(e.journal.some((j) => j.kind === 'energy_shortage_end' && j.entities[0] === 'FRA')).toBe(
      true,
    );
  });

  it('une perte durable devient la nouvelle normale ; un fournisseur revenu redevient établi', () => {
    const e = calm();
    e.apply({ type: 'set', slots: [hormuz], value: 'closed' });
    months(e, 1);
    const early = internal(e, ENERGY_OUT.shortfall, 'FRA');
    months(e, 60);
    expect(internal(e, ENERGY_OUT.shortfall, 'FRA')).toBeLessThan(0.2 * early);
    e.apply({ type: 'set', slots: [hormuz], value: 'open' });
    months(e, 24);
    e.apply({ type: 'set', slots: [hormuz], value: 'closed' });
    months(e, 1);
    // Rouvert puis refermé : la perte est mesurée par rapport aux flux rétablis (plus qu'au départ).
    expect(internal(e, ENERGY_OUT.shortfall, 'FRA')).toBeGreaterThan(early);
  });
});

describe('alimentation et produits critiques', () => {
  it('le blé plus cher pèse d’abord sur les pays pauvres et importateurs ; famine expliquée', () => {
    const e = calm();
    expect(foodStress({ model: e.model }, e.state, idx(e, 'NGA'))).toBe(0);
    e.apply({
      type: 'addModifier',
      slots: [{ scope: 'world', param: 'world.wheat_price' }],
      modifier: { op: 'mul', amount: 3, durationDays: 400, decay: 'none', label: 'Choc' },
    });
    const nga = foodStress({ model: e.model }, e.state, idx(e, 'NGA'));
    const usa = foodStress({ model: e.model }, e.state, idx(e, 'USA'));
    expect(nga).toBeGreaterThan(3 * usa);
    months(e, 1);
    expect(internal(e, RESOURCES_OUT.famine, 'NGA')).toBeGreaterThan(0);
    expect(internal(e, RESOURCES_OUT.famine, 'USA')).toBe(0);
    const famine = e.journal.find((j) => j.kind === 'famine');
    expect(famine?.entities[0]).toBe('NGA');
    expect((famine?.factors ?? []).map((f) => f.id)).toEqual(
      expect.arrayContaining(['res.food_stress', 'eco.gdp_per_capita', 'demo.famine']),
    );
  });
});

describe('relations, blocs, ONU', () => {
  it('l’affinité est la somme de ses facteurs ; une relation saisie tient', () => {
    const e = calm();
    const f = affinityFactors({ model: e.model, state: e.state }, 'USA', 'FRA');
    const sum = f.factors.reduce((s, x) => s + (x.contribution ?? 0), 0);
    expect(f.affinity).toBeCloseTo(Math.max(-100, Math.min(100, sum)), 9);
    expect(f.factors.find((x) => x.label.startsWith('Blocs'))?.contribution).toBeGreaterThan(0);
    // Paire sans élection pendant l'essai (une alternance effacerait une part du résidu).
    e.apply({ type: 'set', slots: [pair('pair.relation', 'FRA', 'SAU')], value: -50 });
    months(e, 12);
    expect(Math.abs(pairValue(e, 'pair.relation', 'FRA', 'SAU') + 50)).toBeLessThan(5);
  });

  it('guerre : choc sur les relations, qui s’estompe avec la mémoire après la paix', () => {
    const e = calm();
    const before = pairValue(e, 'pair.relation', 'SAU', 'NGA');
    const war: Slot[] = [
      pair('pair.war_state', 'SAU', 'NGA'),
      pair('pair.war_state', 'NGA', 'SAU'),
    ];
    e.apply({ type: 'set', slots: war, value: 'war' });
    months(e, 12);
    const during = pairValue(e, 'pair.relation', 'SAU', 'NGA');
    expect(during).toBeLessThan(before - 20);
    e.apply({ type: 'set', slots: war, value: 'peace' });
    months(e, 120);
    expect(pairValue(e, 'pair.relation', 'SAU', 'NGA')).toBeGreaterThan(during + 10);
    expect(checkInvariants(e)).toEqual([]);
  });

  it('adhérer à une alliance crée les traités de défense mutuelle ; annuler les retire', () => {
    const e = calm();
    expect(e.state.pairValue('pair.treaty', idx(e, 'USA'), idx(e, 'FRA'))).toBe('mutual_defense');
    expect(e.state.pairValue('pair.treaty', idx(e, 'SAU'), idx(e, 'USA'))).not.toBe(
      'mutual_defense',
    );
    e.apply({ type: 'bloc', action: 'join', entity: 'SAU', bloc: 'nato' });
    expect(e.state.genericValue('dip.memberships', idx(e, 'SAU'))).toContain('nato');
    expect(e.state.pairValue('pair.treaty', idx(e, 'SAU'), idx(e, 'USA'))).toBe('mutual_defense');
    e.apply({ type: 'undo' });
    expect(e.state.genericValue('dip.memberships', idx(e, 'SAU'))).not.toContain('nato');
    expect(e.state.pairValue('pair.treaty', idx(e, 'SAU'), idx(e, 'USA'))).not.toBe(
      'mutual_defense',
    );
  });

  it('ONU : le veto d’un membre permanent bloque le Conseil ; votes expliqués', () => {
    const e = calm();
    const entry = e.apply({
      type: 'unResolution',
      kind: 'condemnation',
      target: 'USA',
      sponsor: 'NGA',
    });
    const labels = (entry.factors ?? []).map((f) => f.label);
    expect(labels.some((l) => l.includes('veto'))).toBe(true);
    expect(entry.note).toMatch(/veto/);
    expect((entry.factors ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('politique intérieure', () => {
  it('la stabilité visée est l’ancre plus la somme des contributions ; la misère la fait baisser', () => {
    const a = calm();
    const b = calm();
    const st = stabilityContributions({ model: a.model, state: a.state }, idx(a, 'NGA'));
    const sum = st.factors.reduce((s, f) => s + (f.contribution ?? 0), 0);
    expect(st.target).toBeCloseTo(Math.max(0, Math.min(100, st.anchor + sum)), 9);
    b.apply({ type: 'adjust', slots: [country('eco.unemployment', 'NGA')], op: 'add', amount: 15 });
    b.apply({ type: 'lock', slots: [country('eco.unemployment', 'NGA')], locked: true });
    months(a, 12);
    months(b, 12);
    expect(v(b, 'pol.stability', 'NGA')).toBeLessThan(v(a, 'pol.stability', 'NGA') - 2);
  });

  it('élection : une approbation effondrée amène l’alternance et le profil d’opposition', () => {
    const e = calm();
    e.apply({
      type: 'addModifier',
      slots: [country('pol.approval', 'USA')],
      modifier: { op: 'add', amount: -40, durationDays: 200, decay: 'none', label: 'Scandale' },
    });
    e.runUntil(e.calendar.tickOf('2027-01-02'));
    const election = e.journal.find(
      (j) => j.entities[0] === 'USA' && j.kind.startsWith('election_'),
    );
    expect(election?.kind).toBe('election_alternance');
    expect((election?.factors ?? []).map((f) => f.id)).toContain('politics.elections.probability');
    for (const [k, x] of Object.entries(OPPOSITION)) expect(v(e, k, 'USA'), k).toBe(x);
    const opposition = e.state.genericValue('ai.opposition_profile', idx(e, 'USA')) as Record<
      string,
      number
    >;
    expect(opposition['ai.alliance_loyalty']).toBe(PROFILE['ai.alliance_loyalty']);
    expect(v(e, 'pol.leader_tenure', 'USA')).toBeLessThan(0.1);
    expect(e.state.genericValue('pol.next_election', idx(e, 'USA'))).toBe('2031-01-01');
  });

  it('coup d’État : risque croissant avec l’instabilité ; junte, suspension et condamnation', () => {
    const e = calm();
    e.apply({ type: 'setCoefficient', path: 'politics.coups.max', value: 30 });
    const ctx = { model: e.model, state: e.state };
    const low = coupRisk(ctx, idx(e, 'FRA')).risk;
    const high = coupRisk(ctx, idx(e, 'NGA')).risk;
    expect(high).toBeGreaterThan(low);
    e.apply({ type: 'setCoefficient', path: 'politics.coups.max', value: 100 });
    e.apply({ type: 'setCoefficient', path: 'politics.coups.base_flawed_democracy', value: 100 });
    e.apply({ type: 'set', slots: [country('pol.military_loyalty', 'NGA')], value: 0 });
    months(e, 36);
    const coup = e.journal.find((j) => j.kind === 'coup' && j.entities[0] === 'NGA');
    expect(coup).toBeDefined();
    expect((coup?.factors ?? []).map((f) => f.id)).toEqual(
      expect.arrayContaining(['pol.coup_risk', 'pol.stability', 'pol.military_loyalty']),
    );
    const nga = idx(e, 'NGA');
    expect(e.state.genericValue('pol.regime_type', nga)).toBe('junta');
    expect(e.state.genericValue('dip.memberships', nga)).not.toContain('ecowas');
    expect(v(e, 'pol.electoral_democracy', 'NGA')).toBeLessThan(0.45);
  });

  it('guerre civile au-delà du seuil d’insurrection, fin sous le seuil de sortie', () => {
    const e = calm();
    e.apply({ type: 'set', slots: [country('pol.insurgency', 'NGA')], value: 80 });
    e.apply({ type: 'lock', slots: [country('pol.insurgency', 'NGA')], locked: true });
    months(e, 1);
    const cw = e.journal.find((j) => j.kind === 'civil_war');
    expect(cw?.entities[0]).toBe('NGA');
    e.apply({ type: 'lock', slots: [country('pol.insurgency', 'NGA')], locked: false });
    e.apply({ type: 'set', slots: [country('pol.insurgency', 'NGA')], value: 10 });
    months(e, 1);
    expect(e.journal.some((j) => j.kind === 'civil_war_end' && j.entities[0] === 'NGA')).toBe(true);
  });
});

describe('réfugiés', () => {
  it('une insurrection massive fait partir des réfugiés ; les personnes se conservent', () => {
    const a = calm();
    const b = calm();
    b.apply({ type: 'set', slots: [country('pol.insurgency', 'NGA')], value: 95 });
    b.apply({ type: 'lock', slots: [country('pol.insurgency', 'NGA')], locked: true });
    const pressure = departurePressure({ model: b.model, state: b.state });
    expect(pressure.total[idx(b, 'NGA')]).toBeGreaterThan(0.5);
    months(a, 12);
    months(b, 12);
    const abroad = v(b, 'demo.refugees_abroad', 'NGA') - v(a, 'demo.refugees_abroad', 'NGA');
    expect(abroad).toBeGreaterThan(1e6);
    let hosted = 0;
    for (const id of ['USA', 'FRA', 'SAU']) {
      hosted += v(b, 'demo.refugees_hosted', id) - v(a, 'demo.refugees_hosted', id);
    }
    expect(hosted).toBeCloseTo(abroad, -2);
    expect(v(b, 'demo.population', 'NGA')).toBeLessThan(
      v(a, 'demo.population', 'NGA') - 0.9 * abroad,
    );
    expect(e_crisis(b)).toBe(true);
    expect(checkInvariants(b)).toEqual([]);
  });

  it('une hausse modérée de la pression déplace à l’intérieur, sans départs à l’étranger', () => {
    const a = calm();
    const b = calm();
    const base = v(b, 'pol.insurgency', 'NGA');
    b.apply({ type: 'set', slots: [country('pol.insurgency', 'NGA')], value: base + 5 });
    b.apply({ type: 'lock', slots: [country('pol.insurgency', 'NGA')], locked: true });
    months(a, 12);
    months(b, 12);
    expect(v(b, 'demo.refugees_abroad', 'NGA')).toBeCloseTo(v(a, 'demo.refugees_abroad', 'NGA'), 6);
  });
});

function e_crisis(e: Engine): boolean {
  return e.journal.some((j) => j.kind === 'refugee_crisis' && j.entities[0] === 'NGA');
}

describe('déterminisme et invariants du monde interconnecté', () => {
  it('une capture restaurée continue à l’identique (ordre des tables sans effet)', () => {
    const a = make(3);
    a.apply({ type: 'set', slots: [hormuz], value: 'closed' });
    a.apply(sanctions(['USA'], 'FRA', { technology: 0.7, trade: 0.3 }));
    months(a, 2);
    const b = Engine.restore(data, a.snapshot());
    months(a, 4);
    months(b, 4);
    expect(b.hash()).toBe(a.hash());
  });

  it('même graine et mêmes commandes : même empreinte ; relecture du journal identique', () => {
    const script = (e: Engine): void => {
      e.apply({ type: 'set', slots: [hormuz], value: 'closed' });
      months(e, 2);
      e.apply(sanctions(['USA', 'FRA'], 'NGA', { trade: 0.6, finance: 0.8 }));
      e.apply({ type: 'bloc', action: 'join', entity: 'SAU', bloc: 'nato' });
      months(e, 3);
      e.apply({ type: 'unResolution', kind: 'sanctions', target: 'NGA', sponsor: 'FRA' });
      e.apply({ type: 'set', slots: [hormuz], value: 'open' });
      months(e, 6);
    };
    const a = make(7);
    const b = make(7);
    const initial = a.snapshot();
    script(a);
    script(b);
    expect(a.hash()).toBe(b.hash());
    const replayed = Engine.replay(data, initial, a.journal, a.tick);
    expect(replayed.hash()).toBe(a.hash());
    expect(checkInvariants(a)).toEqual([]);
  });
});
