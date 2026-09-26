import { describe, expect, it } from 'vitest';
import { fixtureData, loadModelTree } from '../test/fixture.ts';
import { parseSnapshot, serializeSnapshot } from './codec.ts';
import { CommandError } from './commands.ts';
import { Engine } from './engine.ts';
import { checkInvariants } from './invariants.ts';
import { col as COL } from './state.ts';
import type { Command, Slot } from './types.ts';

const data = fixtureData();
const model = loadModelTree();
const make = (seed = 1): Engine => Engine.create(data, { seed, model });
const country = (param: string, entity: string): Slot => ({ scope: 'country', param, entity });
const value = (e: Engine, param: string, entity: string): number => e.countryValue(param, entity);
const core = (e: Engine, param: string, entity: string): number =>
  e.state.v(COL(param))[e.state.byId.get(entity) as number] as number;

describe('création et calage', () => {
  it('reproduit le solde budgétaire initial des données grâce aux autres dépenses', () => {
    const e = make();
    for (const id of ['USA', 'FRA', 'SAU', 'NGA']) {
      expect(value(e, 'bud.balance', id), id).toBeCloseTo(
        data.countries.entities.find((x) => x.id === id)?.params['bud.balance']?.value as number,
        9,
      );
    }
  });

  it('calcule les dérivés et la croissance mondiale au départ', () => {
    const e = make();
    expect(value(e, 'eco.gdp_per_capita', 'USA')).toBeCloseTo((30000 * 1e9) / 340e6, 6);
    expect(value(e, 'eco.misery_index', 'NGA')).toBeCloseTo(26, 9);
    expect(value(e, 'mil.budget', 'FRA')).toBeCloseTo(70, 9);
    const g = e.state.worldNumber('world.growth');
    expect(g).toBeGreaterThan(1.9);
    expect(g).toBeLessThan(4.2);
    expect(e.state.worldNumber('world.chip_supply')).toBe(100);
    expect(checkInvariants(e)).toEqual([]);
  });

  it('ne lance les systèmes mensuels que le premier jour du mois', () => {
    const e = make();
    const pop = value(e, 'demo.population', 'NGA');
    e.step(4); // 30 septembre
    expect(value(e, 'demo.population', 'NGA')).toBe(pop);
    e.step(1); // 1er octobre
    expect(e.date()).toBe('2026-10-01');
    expect(value(e, 'demo.population', 'NGA')).toBeGreaterThan(pop);
    expect(e.months).toBe(1);
    expect(e.history.months).toBe(2);
  });
});

describe('couches de valeur et commandes', () => {
  it('levier : la valeur saisie change aussitôt le solde (dérivé recalculé)', () => {
    const e = make();
    const balance = value(e, 'bud.balance', 'FRA');
    const entry = e.apply({ type: 'set', slots: [country('bud.defense', 'FRA')], value: 5 });
    expect(value(e, 'bud.balance', 'FRA')).toBeCloseTo(balance - 3, 9);
    expect(value(e, 'mil.budget', 'FRA')).toBeCloseTo(175, 9);
    expect(entry.effects?.[0]).toMatchObject({ from: 2, to: 5 });
    expect(e.state.overrides.has('c|bud.defense|FRA')).toBe(true);
  });

  it('état : la valeur saisie remplace l’état, qui évolue ensuite', () => {
    const e = make();
    e.apply({ type: 'set', slots: [country('eco.inflation', 'FRA')], value: 20 });
    expect(value(e, 'eco.inflation', 'FRA')).toBe(20);
    e.step(40);
    const after = value(e, 'eco.inflation', 'FRA');
    expect(after).toBeLessThan(20);
    expect(after).toBeGreaterThan(5);
  });

  it('dérivé : la valeur saisie est forcée (verrouillée) ; réinitialiser rend le calcul', () => {
    const e = make();
    e.apply({ type: 'set', slots: [country('eco.growth', 'USA')], value: -5 });
    e.step(70);
    expect(value(e, 'eco.growth', 'USA')).toBe(-5);
    e.apply({ type: 'reset', slots: [country('eco.growth', 'USA')] });
    e.step(31);
    expect(value(e, 'eco.growth', 'USA')).not.toBe(-5);
  });

  it('verrou : la simulation ne modifie plus la valeur', () => {
    const e = make();
    e.apply({ type: 'lock', slots: [country('demo.population', 'NGA')], locked: true });
    const pop = value(e, 'demo.population', 'NGA');
    e.step(200);
    expect(value(e, 'demo.population', 'NGA')).toBe(pop);
    e.apply({ type: 'lock', slots: [country('demo.population', 'NGA')], locked: false });
    e.step(31);
    expect(value(e, 'demo.population', 'NGA')).toBeGreaterThan(pop);
  });

  it('réinitialiser remet la donnée réelle', () => {
    const e = make();
    e.apply({ type: 'set', slots: [country('bud.revenue', 'USA')], value: 40 });
    e.apply({ type: 'reset', slots: [country('bud.revenue', 'USA')] });
    expect(value(e, 'bud.revenue', 'USA')).toBe(35);
    expect(e.state.overrides.has('c|bud.revenue|USA')).toBe(false);
  });

  it('édition groupée : ajouter ou multiplier sur plusieurs pays, bornes du catalogue', () => {
    const e = make();
    e.apply({
      type: 'adjust',
      slots: [country('bud.defense', 'USA'), country('bud.defense', 'FRA')],
      op: 'add',
      amount: 1,
    });
    expect(value(e, 'bud.defense', 'USA')).toBe(3);
    expect(value(e, 'bud.defense', 'FRA')).toBe(3);
    e.apply({ type: 'adjust', slots: [country('pol.stability', 'FRA')], op: 'mul', amount: 10 });
    expect(value(e, 'pol.stability', 'FRA')).toBe(100); // borne du catalogue
  });

  it('modificateur : effet temporaire sur la valeur effective, sans toucher la valeur courante', () => {
    const e = make();
    const before = value(e, 'pol.stability', 'NGA');
    const entry = e.apply({
      type: 'addModifier',
      slots: [country('pol.stability', 'NGA')],
      modifier: { op: 'add', amount: -20, durationDays: 60, decay: 'linear', label: 'Choc' },
    });
    const id = entry.effects?.[0]?.modifier as number;
    expect(value(e, 'pol.stability', 'NGA')).toBeCloseTo(before - 20, 9);
    e.step(30);
    expect(value(e, 'pol.stability', 'NGA')).toBeCloseTo(before - 10, 9);
    e.step(30);
    expect(value(e, 'pol.stability', 'NGA')).toBeCloseTo(before, 9);
    expect(e.state.modifiers.find((m) => m.id === id)).toBeUndefined();
  });

  it('modificateur mondial multiplicatif, puis retrait', () => {
    const e = make();
    const oil = e.state.worldEff('world.oil_price');
    const entry = e.apply({
      type: 'addModifier',
      slots: [{ scope: 'world', param: 'world.oil_price' }],
      modifier: { op: 'mul', amount: 2, durationDays: 365, decay: 'none', label: 'Choc pétrolier' },
    });
    expect(e.state.worldEff('world.oil_price')).toBeCloseTo(oil * 2, 9);
    e.apply({ type: 'removeModifier', ids: [entry.effects?.[0]?.modifier as number] });
    expect(e.state.worldEff('world.oil_price')).toBeCloseTo(oil, 9);
  });

  it('paires, monde, zones et simulation se modifient aussi', () => {
    const e = make();
    const usa = e.state.byId.get('USA') as number;
    const fra = e.state.byId.get('FRA') as number;
    e.apply({
      type: 'set',
      slots: [{ scope: 'pair', param: 'pair.relation', from: 'USA', to: 'FRA' }],
      value: -30,
    });
    expect(e.state.pairValue('pair.relation', usa, fra)).toBe(-30);
    e.apply({
      type: 'set',
      slots: [{ scope: 'pair', param: 'pair.war_state', from: 'USA', to: 'FRA' }],
      value: 'crisis',
    });
    expect(e.state.pairValue('pair.war_state', usa, fra)).toBe('crisis');
    e.apply({
      type: 'reset',
      slots: [{ scope: 'pair', param: 'pair.relation', from: 'USA', to: 'FRA' }],
    });
    expect(e.state.pairValue('pair.relation', usa, fra)).toBe(60);
    e.apply({
      type: 'set',
      slots: [{ scope: 'zone', param: 'zone.chokepoint_status', target: 'hormuz' }],
      value: 'closed',
    });
    expect(e.state.zone.get('zone.chokepoint_status')?.get('hormuz')).toBe('closed');
    e.apply({ type: 'set', slots: [{ scope: 'world', param: 'world.policy_rate' }], value: 6 });
    expect(e.state.worldNumber('world.policy_rate')).toBe(6);
    e.apply({ type: 'set', slots: [{ scope: 'sim', param: 'sim.realism' }], value: 20 });
    expect(e.state.sim.get('sim.realism')).toBe(20);
  });

  it('refuse les commandes invalides sans rien journaliser', () => {
    const e = make();
    const n = e.journal.length;
    const bad: Command[] = [
      { type: 'set', slots: [country('eco.inconnu', 'FRA')], value: 1 },
      { type: 'set', slots: [country('bud.defense', 'XXX')], value: 1 },
      { type: 'set', slots: [country('eco.exchange_regime', 'FRA')], value: 'euro' },
      { type: 'set', slots: [country('bud.defense', 'FRA')], value: 'beaucoup' },
      { type: 'set', slots: [{ scope: 'sim', param: 'sim.speed' }], value: 3 },
      { type: 'set', slots: [{ scope: 'zone', param: 'zone.control', target: 'x' }], value: [] },
      {
        type: 'addModifier',
        slots: [country('pol.regime_type', 'FRA')],
        modifier: { op: 'add', amount: 1, durationDays: 10, decay: 'none', label: 'x' },
      },
      { type: 'setCoefficient', path: 'economy.labor.okun', value: 99 },
      { type: 'removeModifier', ids: [12345] },
    ];
    for (const c of bad) expect(() => e.apply(c), JSON.stringify(c)).toThrow();
    expect(e.journal.length).toBe(n);
    expect(() => e.undo()).toThrow(CommandError);
  });

  it('annuler et rétablir restaurent les couches (valeur, verrou, surcharge, modificateurs)', () => {
    const e = make();
    e.apply({ type: 'set', slots: [country('bud.defense', 'FRA')], value: 4 });
    e.apply({ type: 'lock', slots: [country('eco.inflation', 'FRA')], locked: true });
    e.apply({
      type: 'addModifier',
      slots: [country('pol.stability', 'FRA')],
      modifier: { op: 'add', amount: -5, durationDays: 100, decay: 'none', label: 'x' },
    });
    e.undo();
    expect(e.state.modifiers).toHaveLength(0);
    e.undo();
    expect(e.state.isLocked(COL('eco.inflation'), e.state.byId.get('FRA') as number)).toBe(false);
    e.undo();
    expect(value(e, 'bud.defense', 'FRA')).toBe(2);
    expect(e.state.overrides.size).toBe(0);
    expect(e.canUndo()).toBe(false);
    e.redo();
    expect(value(e, 'bud.defense', 'FRA')).toBe(4);
    expect(e.journal.filter((x) => x.kind === 'undo')).toHaveLength(3);
    expect(e.journal.find((x) => x.seq === 1)?.undone).toBe(false);
    // Une nouvelle modification vide la pile de rétablissement.
    e.apply({ type: 'set', slots: [country('bud.defense', 'USA')], value: 4 });
    expect(e.canRedo()).toBe(false);
  });

  it('coefficients : modification et rechargement complet, annulables', () => {
    const e = make();
    e.apply({ type: 'setCoefficient', path: 'economy.labor.okun', value: 0.8 });
    expect(e.model.get('economy.labor.okun')).toBe(0.8);
    const tree = loadModelTree();
    const entry = e.apply({ type: 'setModel', model: tree });
    expect(entry.coefficients).toEqual([{ path: 'economy.labor.okun', from: 0.8, to: 0.4 }]);
    e.undo();
    expect(e.model.get('economy.labor.okun')).toBe(0.8);
    expect(() => e.apply({ type: 'setModel', model: { economy: {} } })).toThrow(/invalide/);
  });

  it('suit dans l’historique un paramètre modifié, mois passés compris', () => {
    const e = make();
    e.step(70);
    expect(e.history.series('bud.defense', 0)).toBeNull();
    e.apply({ type: 'set', slots: [country('bud.defense', 'USA')], value: 4 });
    e.step(31);
    const s = e.history.series('bud.defense', e.state.byId.get('USA') as number) as Float32Array;
    expect([...s]).toEqual([2, 2, 2, 2, 4]); // départ, 1er oct., 1er nov., 1er déc., 1er janv.
    expect(core(e, 'bud.defense', 'USA')).toBe(4);
  });
});

describe('déterminisme, relecture et captures', () => {
  const script = (e: Engine): void => {
    e.step(35);
    e.apply({ type: 'set', slots: [country('bud.defense', 'FRA')], value: 6 });
    e.apply({
      type: 'addModifier',
      slots: [{ scope: 'world', param: 'world.oil_price' }],
      modifier: { op: 'mul', amount: 1.8, durationDays: 90, decay: 'linear', label: 'Choc' },
    });
    e.step(120);
    e.apply({ type: 'setCoefficient', path: 'economy.cycle.noise', value: 0.6 });
    e.apply({ type: 'lock', slots: [country('eco.inflation', 'NGA')], locked: true });
    e.step(20);
    e.apply({ type: 'undo' });
    e.step(200);
    e.apply({ type: 'redo' });
    e.apply({ type: 'set', slots: [{ scope: 'sim', param: 'sim.seed' }], value: 99 });
    e.step(400);
  };

  it('même graine + mêmes commandes ⇒ même empreinte ; autre graine ⇒ autre empreinte', () => {
    const a = make(3);
    const b = make(3);
    script(a);
    script(b);
    expect(a.hash()).toBe(b.hash());
    const c = make(4);
    script(c);
    expect(c.hash()).not.toBe(a.hash());
  });

  it('la relecture du journal depuis l’état initial redonne la même empreinte', () => {
    const a = make(5);
    const initial = a.snapshot();
    script(a);
    const replayed = Engine.replay(data, initial, a.journal, a.tick);
    expect(replayed.tick).toBe(a.tick);
    expect(replayed.hash()).toBe(a.hash());
    expect(replayed.journal.map((x) => x.kind)).toEqual(a.journal.map((x) => x.kind));
  });

  it('une capture sérialisée se restaure à l’identique et la suite ne diverge pas', () => {
    const a = make(6);
    script(a);
    const restored = Engine.restore(data, parseSnapshot(serializeSnapshot(a.snapshot())));
    expect(restored.hash()).toBe(a.hash());
    expect(restored.date()).toBe(a.date());
    a.step(400);
    restored.step(400);
    expect(restored.hash()).toBe(a.hash());
    restored.apply({ type: 'undo' });
    expect(restored.journal.at(-1)?.kind).toBe('undo');
  });

  it('refuse une capture faite sur d’autres données', () => {
    const snap = make().snapshot();
    expect(() => Engine.restore(data, { ...snap, dataId: 'autre' })).toThrow(/autres données/);
  });
});
