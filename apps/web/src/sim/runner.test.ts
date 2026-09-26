import { COUNTRY_NUMERIC, col, type Slot } from '@geosim/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureData, loadModelTree } from '../../../../packages/engine/test/fixture.ts';
import { LiveSim } from './mirror.ts';
import type { Frame } from './protocol.ts';
import { SimRunner, type RunnerHost } from './runner.ts';

/** Hôte factice : horloge et minuteries manuelles, images conservées. */
class FakeHost implements RunnerHost {
  t = 0;
  frames: Frame[] = [];
  private timers = new Map<number, { fn: () => void; at: number }>();
  private nextId = 1;
  now(): number {
    return this.t;
  }
  setTimer(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fn, at: this.t + ms });
    return id;
  }
  clearTimer(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  post(frame: Frame): void {
    this.frames.push(frame);
  }
  /** Avance l'horloge réelle en déclenchant les minuteries échues. */
  wait(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { fn: () => void; at: number }] | null = null;
      for (const entry of this.timers) {
        if (entry[1].at <= end && (next === null || entry[1].at < next[1].at)) next = entry;
      }
      if (next === null) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      next[1].fn();
    }
    this.t = end;
  }
  last(): Frame {
    const f = this.frames[this.frames.length - 1];
    if (f === undefined) throw new Error('aucune image');
    return f;
  }
}

const data = fixtureData();
const model = loadModelTree();
const FRA_DEFENSE: Slot = { scope: 'country', param: 'bud.defense', entity: 'FRA' };

function setup(seed = 7): { host: FakeHost; runner: SimRunner } {
  const host = new FakeHost();
  const runner = new SimRunner(host, data, model, seed);
  runner.flush(true);
  return { host, runner };
}

/** Miroir alimenté par toutes les images reçues, comme dans l'interface. */
function mirrorOf(frames: Frame[]): LiveSim {
  let live: LiveSim | null = null;
  for (const f of frames) {
    if (f.reset) live = new LiveSim(f.reset, f.clock);
    live?.apply(f);
  }
  if (live === null) throw new Error('pas de remise à zéro');
  return live;
}

describe('pilote du moteur', () => {
  let host: FakeHost;
  let runner: SimRunner;
  beforeEach(() => {
    ({ host, runner } = setup());
  });

  it('envoie une première image complète', () => {
    const f = host.last();
    expect(f.reset?.entities).toEqual(runner.current.state.entities.map((e) => e.id));
    expect(f.reset?.numeric.length).toBe(COUNTRY_NUMERIC.length);
    expect(f.state?.eff.length).toBe(COUNTRY_NUMERIC.length * runner.current.state.n);
    expect(f.pairs).toBeDefined();
    expect(f.clock).toMatchObject({ tick: 0, running: false });
    const live = mirrorOf(host.frames);
    expect(live.number('FRA', 'demo.population')).toBe(
      runner.current.countryValue('demo.population', 'FRA'),
    );
    expect(live.genericValue('FRA', 'eco.exchange_regime')).toBe(
      runner.current.state.genericValue(
        'eco.exchange_regime',
        runner.current.state.byId.get('FRA') ?? -1,
      ),
    );
  });

  it('avance à la vitesse choisie et s’arrête en pause', () => {
    runner.setSpeed(30);
    runner.play();
    host.wait(1000);
    expect(runner.current.tick).toBeGreaterThanOrEqual(29);
    expect(runner.current.tick).toBeLessThanOrEqual(30);
    runner.pause();
    const tick = runner.current.tick;
    host.wait(1000);
    expect(runner.current.tick).toBe(tick);
    expect(host.last().clock.running).toBe(false);
  });

  it('limite les images à 5 par seconde en marche', () => {
    runner.setSpeed(90);
    const before = host.frames.length;
    runner.play();
    host.wait(2000);
    runner.pause();
    const sent = host.frames.length - before;
    expect(sent).toBeGreaterThan(4);
    expect(sent).toBeLessThanOrEqual(13);
  });

  it('pas-à-pas : jour, semaine, début du mois suivant', () => {
    runner.step('day');
    expect(runner.current.tick).toBe(1);
    runner.step('week');
    expect(runner.current.tick).toBe(8);
    // Départ le 26 septembre : la semaine a franchi le 1er octobre, le mois mène au 1er novembre.
    runner.step('month');
    expect(runner.current.date()).toBe('2026-11-01');
    expect(runner.current.months).toBe(2);
  });

  it('avance jusqu’à une date puis se met en pause', () => {
    runner.runUntil('2027-03-01');
    host.wait(10_000);
    expect(runner.current.date()).toBe('2027-03-01');
    expect(host.last().clock).toMatchObject({ running: false, target: null });
    expect(() => runner.runUntil('2026-01-01')).toThrow(/déjà passé/);
  });

  it('une modification est visible aussitôt et infléchit la trajectoire', () => {
    const other = setup().runner;
    runner.step('month');
    other.step('month');
    const entry = runner.apply({ type: 'set', slots: [FRA_DEFENSE], value: 8 });
    expect(entry.kind).toBe('set');
    // Image immédiate : la nouvelle valeur et l'entrée du journal.
    const live = mirrorOf(host.frames);
    expect(live.number('FRA', 'bud.defense')).toBe(8);
    expect(live.journal.at(-1)?.seq).toBe(entry.seq);
    expect(live.layers(FRA_DEFENSE, 2).override?.seq).toBe(entry.seq);
    // Même graine : seule la modification sépare les deux trajectoires.
    for (let m = 0; m < 12; m++) {
      runner.step('month');
      other.step('month');
    }
    const debt = (r: SimRunner): number => r.current.countryValue('eco.public_debt', 'FRA');
    expect(debt(runner)).toBeGreaterThan(debt(other) + 0.5);
    expect(runner.current.countryValue('eco.public_debt', 'USA')).toBeCloseTo(
      other.current.countryValue('eco.public_debt', 'USA'),
      9,
    );
  });

  it('annule et rétablit', () => {
    const before = runner.current.countryValue('bud.defense', 'FRA');
    runner.apply({ type: 'set', slots: [FRA_DEFENSE], value: 8 });
    runner.undo();
    let live = mirrorOf(host.frames);
    expect(live.number('FRA', 'bud.defense')).toBe(before);
    expect(live.canUndo).toBe(false);
    expect(live.canRedo).toBe(true);
    expect(live.journal.find((e) => e.kind === 'set')?.undone).toBe(true);
    runner.redo();
    live = mirrorOf(host.frames);
    expect(live.number('FRA', 'bud.defense')).toBe(8);
    expect(live.journal.find((e) => e.kind === 'set')?.undone).toBe(false);
  });

  it('verrouille, applique un modificateur et transmet les couches de valeur', () => {
    runner.apply({ type: 'lock', slots: [FRA_DEFENSE], locked: true });
    runner.apply({
      type: 'addModifier',
      slots: [FRA_DEFENSE],
      modifier: { op: 'add', amount: 1, durationDays: 30, decay: 'none', label: 'Test' },
    });
    const live = mirrorOf(host.frames);
    const layers = live.layers(FRA_DEFENSE, 2);
    expect(layers.locked).toBe(true);
    expect(layers.modifiers).toHaveLength(1);
    expect(layers.value).toBeCloseTo((layers.current as number) + 1, 9);
    expect(live.isModified(FRA_DEFENSE)).toBe(true);
  });

  it('transmet les valeurs non numériques par différences', () => {
    const first = host.frames[0]?.state?.generic.length ?? 0;
    expect(first).toBeGreaterThan(0);
    runner.step('day');
    expect(host.last().state?.generic ?? []).toEqual([]);
    runner.apply({
      type: 'set',
      slots: [{ scope: 'country', param: 'eco.exchange_regime', entity: 'NGA' }],
      value: 'fixed',
    });
    const diff = host.last().state?.generic ?? [];
    expect(diff).toHaveLength(1);
    expect(mirrorOf(host.frames).genericValue('NGA', 'eco.exchange_regime')).toBe('fixed');
  });

  it('renvoie les paires seulement quand elles changent', () => {
    runner.step('day');
    expect(host.last().pairs).toBeUndefined();
    runner.apply({
      type: 'set',
      slots: [{ scope: 'pair', param: 'pair.relation', from: 'FRA', to: 'NGA' }],
      value: -40,
    });
    expect(host.last().pairs).toBeDefined();
    expect(mirrorOf(host.frames).pairValue('pair.relation', 'FRA', 'NGA')).toBe(-40);
  });

  it('capture et restaure un état (hash identique)', () => {
    runner.step('month');
    const info = runner.capture('Avant');
    const hash = runner.hash();
    runner.apply({ type: 'set', slots: [FRA_DEFENSE], value: 9 });
    runner.step('month');
    expect(runner.hash()).not.toBe(hash);
    runner.restoreCapture(info.id);
    expect(runner.hash()).toBe(hash);
    expect(host.last().reset).toBeDefined();
    expect(mirrorOf(host.frames).clock.tick).toBe(info.tick);
  });

  it('exporte et importe une capture (fichier)', () => {
    runner.step('month');
    runner.apply({ type: 'set', slots: [FRA_DEFENSE], value: 9 });
    const text = runner.exportCapture(null, 'Fichier');
    expect(text.startsWith('{"format":"geosim-capture"')).toBe(true);
    const hash = runner.hash();
    const { runner: fresh } = setup();
    const info = fresh.importCapture(text);
    expect(info.label).toBe('Fichier');
    expect(fresh.hash()).toBe(hash);
    expect(fresh.info().replayable).toBe(false);
    expect(() => fresh.verifyReplay()).toThrow(/indisponible/);
  });

  it('la relecture du journal redonne le même hash', () => {
    runner.step('month');
    runner.apply({ type: 'set', slots: [FRA_DEFENSE], value: 6 });
    runner.step('month');
    runner.apply({ type: 'adjust', slots: [FRA_DEFENSE], op: 'add', amount: 1 });
    runner.undo();
    runner.apply({ type: 'setCoefficient', path: 'economy.cycle.persistence', value: 0.9 });
    runner.runUntil('2027-06-15');
    host.wait(10_000);
    const check = runner.verifyReplay();
    expect(check.identical).toBe(true);
    expect(check.commands).toBe(4);
  });

  it('recharge le modèle seulement s’il change', () => {
    expect(runner.reloadModel(model)).toBeNull();
    const tree = runner.model();
    const cycle = (tree.economy as Record<string, Record<string, { value: number }>>).cycle;
    if (cycle?.persistence === undefined) throw new Error('coefficient attendu');
    cycle.persistence.value = 0.8;
    const version = host.last().modelVersion;
    const entry = runner.reloadModel(tree);
    expect(entry?.coefficients).toEqual([
      { path: 'economy.cycle.persistence', from: 0.95, to: 0.8 },
    ]);
    expect(host.last().modelVersion).toBeGreaterThan(version);
  });

  it('une erreur de la simulation la met en pause et est signalée', () => {
    runner.current.step = () => {
      throw new Error('valeur non finie');
    };
    runner.play();
    host.wait(2000);
    expect(host.frames.some((f) => f.error?.includes('valeur non finie'))).toBe(true);
    expect(host.last().clock.running).toBe(false);
  });

  it('nouvelle simulation : remise à zéro avec une autre graine', () => {
    runner.step('month');
    const info = runner.restart(99);
    expect(info.seed).toBe(99);
    expect(runner.current.tick).toBe(0);
    expect(host.last().reset?.seed).toBe(99);
    expect(() => runner.restart(-1)).toThrow(/Graine/);
  });

  it('séries de l’historique', () => {
    runner.step('month');
    runner.step('month');
    const s = runner.series('FRA', ['eco.public_debt', 'bud.defense', 'inconnu']);
    expect(s.ticks).toHaveLength(3);
    expect(s.series['eco.public_debt']).toHaveLength(3);
    expect(s.series.inconnu).toBeNull();
    const c = runner.compare('eco.inflation', ['FRA', 'USA']);
    expect(Object.keys(c.series)).toEqual(['FRA', 'USA']);
    expect(runner.worldSeries(['world.oil_price']).series['world.oil_price']).toHaveLength(3);
    expect(col('eco.public_debt')).toBeGreaterThanOrEqual(0);
  });
});
