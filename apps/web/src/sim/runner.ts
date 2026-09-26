/**
 * Pilote du moteur dans le worker (SPEC §7.1, §7.3) : boucle temps réel (vitesses, pas-à-pas,
 * « avancer jusqu'à »), découpée en tranches courtes pour que les commandes de l'interface soient
 * traitées sans attendre ; images envoyées à 5 Hz au plus ; captures en mémoire ; vérification
 * de la relecture du journal.
 *
 * Aucune API propre au worker : l'horloge réelle, les minuteries et l'envoi des images sont
 * fournis par l'hôte, ce qui rend le pilote testable sous Node. L'horloge réelle ne sert qu'à
 * cadencer la boucle : elle n'entre jamais dans le moteur (même journal ⇒ même histoire).
 */
import {
  COUNTRY_GENERIC,
  COUNTRY_NUMERIC,
  ENGINE_VERSION,
  Engine,
  col,
  explainCountry,
  explainPair,
  isCountryNumeric,
  parseSnapshot,
  serializeSnapshot,
  type Command,
  type CountryExplanation,
  type EngineData,
  type EngineSnapshot,
  type JournalEntry,
  type PairExplanation,
} from '@geosim/engine';
import type { CoefficientTree, ParamValue } from '@geosim/shared';
import type {
  CaptureInfo,
  Clock,
  Frame,
  PairsPart,
  ReplayCheck,
  SeriesResult,
  SimInfo,
  StatePart,
  StepUnit,
} from './protocol.ts';

export interface RunnerHost {
  /** Horloge réelle (ms), pour cadencer la boucle uniquement. */
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  post(frame: Frame, transfer: Transferable[]): void;
}

/** Durée maximale d'une tranche de calcul en marche normale (latence des commandes). */
const SLICE_MS = 20;
/** Tranche plus longue pour « avancer jusqu'à » (débit maximal). */
const RUSH_SLICE_MS = 50;
/** Intervalle minimal entre deux images (5 Hz). */
const FRAME_MS = 200;
/** Retard maximal accumulé avant de signaler que la simulation ne suit pas (s). */
const MAX_BACKLOG_S = 0.5;
export const MAX_SPEED = 90;

interface StoredCapture {
  info: CaptureInfo;
  snapshot: EngineSnapshot;
  /** État initial de la lignée (relecture), s'il est connu. */
  initial: EngineSnapshot | null;
}

export class SimRunner {
  private engine: Engine;
  private initial: EngineSnapshot | null;
  private speed = 30;
  private running = false;
  private target: number | null = null;
  private dueDays = 0;
  private lastTime = 0;
  private timer: unknown = null;
  private lastFrame = Number.NEGATIVE_INFINITY;
  private sentVersion = -1;
  private sentPairVersion = -1;
  private sentSeq = 0;
  private sentGeneric: (ParamValue | undefined)[][] = [];
  private resetPending = true;
  private modelVersion = 0;
  private monthMs = 0;
  private lagging = false;
  private error: string | null = null;
  private readonly captures = new Map<number, StoredCapture>();
  private nextCaptureId = 1;

  constructor(
    private readonly host: RunnerHost,
    private readonly data: EngineData,
    model: CoefficientTree,
    seed: number,
    private readonly mapResolution?: number,
  ) {
    this.engine = this.create(model, seed);
    this.initial = this.engine.snapshot();
  }

  private create(model: CoefficientTree, seed: number): Engine {
    return Engine.create(this.data, {
      seed,
      model,
      ...(this.mapResolution ? { mapResolution: this.mapResolution } : {}),
    });
  }

  /** Moteur courant (tests et requêtes ponctuelles). */
  get current(): Engine {
    return this.engine;
  }

  info(): SimInfo {
    const S = this.engine.state;
    const zoneBase: Record<string, Record<string, ParamValue>> = {};
    for (const [k, t] of S.zoneBase) zoneBase[k] = Object.fromEntries(t);
    return {
      engine: ENGINE_VERSION,
      dataId: this.engine.dataId,
      startDate: this.engine.calendar.isoAt(0),
      seed: S.seed,
      entities: S.entities.map((e) => e.id),
      numeric: COUNTRY_NUMERIC.map((d) => d.id),
      generic: COUNTRY_GENERIC.map((d) => d.id),
      base: S.base.slice(),
      initial: this.engine.initial.slice(),
      genericBase: S.genericBase.map((c) => c.slice()),
      worldBase: Object.fromEntries(S.worldBase),
      zoneBase,
      simBase: Object.fromEntries(S.simBase),
      worldSeries: this.engine.history.worldKeys(),
      replayable: this.initial !== null,
    };
  }

  // ——— Temps ———

  clock(): Clock {
    return {
      tick: this.engine.tick,
      date: this.engine.date(),
      speed: this.speed,
      running: this.running,
      target: this.target,
      months: this.engine.history.months,
      monthMs: Math.round(this.monthMs * 10) / 10,
      lagging: this.lagging,
    };
  }

  play(): void {
    this.error = null;
    this.running = true;
    this.target = null;
    this.dueDays = 0;
    this.lastTime = this.host.now();
    this.lagging = false;
    this.schedule(0);
    this.flush(true);
  }

  pause(): void {
    this.running = false;
    this.target = null;
    this.lagging = false;
    this.cancel();
    this.flush(true);
  }

  setSpeed(daysPerSecond: number): void {
    if (!(daysPerSecond > 0 && daysPerSecond <= MAX_SPEED)) {
      throw new Error(`Vitesse hors de la plage (0 à ${MAX_SPEED} jours par seconde)`);
    }
    this.speed = daysPerSecond;
    this.dueDays = Math.min(this.dueDays, 1);
    this.flush(true);
  }

  /** Pas-à-pas : un jour, une semaine, ou jusqu'au premier jour du mois suivant. */
  step(unit: StepUnit): JournalEntry[] {
    if (this.running) this.pause();
    let days = unit === 'day' ? 1 : 7;
    if (unit === 'month') {
      days = 1;
      while (!this.engine.calendar.isMonthStart(this.engine.tick + days)) days++;
    }
    const entries = this.advance(days);
    this.flush(true);
    return entries;
  }

  /** Avance à vitesse maximale jusqu'à la date donnée (la pause l'interrompt). */
  runUntil(date: string): void {
    const tick = this.engine.calendar.tickOf(date);
    if (tick <= this.engine.tick) throw new Error(`Le ${date} est déjà passé`);
    this.error = null;
    this.running = true;
    this.target = tick;
    this.lagging = false;
    this.schedule(0);
    this.flush(true);
  }

  private schedule(ms: number): void {
    this.cancel();
    this.timer = this.host.setTimer(() => {
      this.timer = null;
      this.loop();
    }, ms);
  }

  private cancel(): void {
    if (this.timer !== null) this.host.clearTimer(this.timer);
    this.timer = null;
  }

  /** Avance de `days` jours en mesurant les pas mensuels ; une erreur met en pause. */
  private advance(days: number): JournalEntry[] {
    const out: JournalEntry[] = [];
    for (let d = 0; d < days; d++) {
      const monthly = this.engine.calendar.isMonthStart(this.engine.tick + 1);
      const t0 = monthly ? this.host.now() : 0;
      try {
        out.push(...this.engine.step(1));
      } catch (e) {
        this.fail(e);
        break;
      }
      if (monthly) {
        const ms = this.host.now() - t0;
        this.monthMs = this.monthMs === 0 ? ms : 0.8 * this.monthMs + 0.2 * ms;
      }
    }
    return out;
  }

  private fail(e: unknown): void {
    this.running = false;
    this.target = null;
    this.cancel();
    this.error = `La simulation s'est arrêtée le ${this.engine.date()} : ${e instanceof Error ? e.message : String(e)}`;
  }

  private loop(): void {
    if (!this.running) return;
    const start = this.host.now();
    if (this.target !== null) {
      // « Avancer jusqu'à » : aussi vite que possible, par tranches.
      while (this.running && this.engine.tick < this.target) {
        this.advance(1);
        if (this.host.now() - start >= RUSH_SLICE_MS) break;
      }
      if (!this.running) {
        this.flush(true);
        return;
      }
      if (this.engine.tick >= this.target) {
        this.running = false;
        this.target = null;
        this.flush(true);
        return;
      }
      this.flush(false);
      if (this.running) this.schedule(0);
      return;
    }
    this.dueDays += (this.speed * (start - this.lastTime)) / 1000;
    this.lastTime = start;
    while (this.running && this.dueDays >= 1) {
      this.advance(1);
      this.dueDays -= 1;
      if (this.host.now() - start >= SLICE_MS) break;
    }
    const backlog = this.speed * MAX_BACKLOG_S;
    this.lagging = this.dueDays > backlog;
    if (this.lagging) this.dueDays = backlog;
    this.flush(this.error !== null);
    if (!this.running) return;
    // Prochain réveil : quand un jour sera dû, sans dépasser la cadence des images.
    const untilNextDay = ((1 - this.dueDays) / this.speed) * 1000;
    this.schedule(this.dueDays >= 1 ? 0 : Math.max(4, Math.min(FRAME_MS, untilNextDay)));
  }

  // ——— Commandes ———

  apply(command: Command): JournalEntry {
    const entry = this.engine.apply(command);
    if (command.type === 'setCoefficient' || command.type === 'setModel') this.modelVersion++;
    if (command.type === 'undo' || command.type === 'redo') this.modelVersion++;
    this.flush(true);
    return entry;
  }

  undo(): JournalEntry {
    return this.apply({ type: 'undo' });
  }

  redo(): JournalEntry {
    return this.apply({ type: 'redo' });
  }

  /**
   * Rechargement de config/model.yaml : applique le nouvel arbre par une commande journalisée
   * (relecture fidèle), ou ne fait rien s'il ne change aucun coefficient.
   */
  reloadModel(tree: CoefficientTree): JournalEntry | null {
    if (this.engine.modelChanges(tree).length === 0) return null;
    return this.apply({ type: 'setModel', model: tree });
  }

  model(): CoefficientTree {
    return this.engine.model.tree();
  }

  hash(): string {
    return this.engine.hash();
  }

  // ——— Explications (« Pourquoi ? ») ———

  explainCountry(entity: string): CountryExplanation | null {
    return explainCountry(this.engine, entity);
  }

  explainPair(from: string, to: string): PairExplanation {
    return explainPair(this.engine, from, to);
  }

  // ——— Historique ———

  series(entity: string, params: readonly string[]): SeriesResult {
    const i = this.engine.state.byId.get(entity);
    const series: Record<string, Float32Array | null> = {};
    for (const p of params) {
      series[p] = i === undefined || !isCountryNumeric(p) ? null : this.engine.history.series(p, i);
    }
    return { ticks: this.engine.history.ticks.slice(), series };
  }

  /** Série d'un paramètre pour plusieurs entités (graphiques comparatifs). */
  compare(param: string, entities: readonly string[]): SeriesResult {
    const series: Record<string, Float32Array | null> = {};
    for (const id of entities) {
      const i = this.engine.state.byId.get(id);
      series[id] =
        i === undefined || !isCountryNumeric(param) ? null : this.engine.history.series(param, i);
    }
    return { ticks: this.engine.history.ticks.slice(), series };
  }

  worldSeries(keys: readonly string[]): { ticks: number[]; series: Record<string, number[]> } {
    const series: Record<string, number[]> = {};
    for (const k of keys) series[k] = this.engine.history.worldSeries(k) ?? [];
    return { ticks: this.engine.history.ticks.slice(), series };
  }

  // ——— Captures, relecture, nouvelle simulation ———

  capture(label: string): CaptureInfo {
    const id = this.nextCaptureId++;
    const clean = label.trim().slice(0, 80) || `Capture ${id}`;
    const info: CaptureInfo = {
      id,
      label: clean,
      tick: this.engine.tick,
      date: this.engine.date(),
    };
    this.captures.set(id, {
      info,
      snapshot: this.engine.snapshot(clean),
      initial: this.initial,
    });
    return info;
  }

  listCaptures(): CaptureInfo[] {
    return [...this.captures.values()].map((c) => c.info);
  }

  deleteCapture(id: number): void {
    this.captures.delete(id);
  }

  private replace(engine: Engine, initial: EngineSnapshot | null): void {
    if (this.running) this.pause();
    this.engine = engine;
    this.initial = initial;
    this.error = null;
    this.resetPending = true;
    this.modelVersion++;
    this.flush(true);
  }

  restoreCapture(id: number): CaptureInfo {
    const c = this.captures.get(id);
    if (c === undefined) throw new Error('Capture introuvable');
    this.replace(Engine.restore(this.data, c.snapshot), c.initial);
    return c.info;
  }

  /** Capture (en mémoire, ou l'état courant) sérialisée pour un fichier. */
  exportCapture(id: number | null, label = ''): string {
    if (id === null) return serializeSnapshot(this.engine.snapshot(label.trim() || undefined));
    const c = this.captures.get(id);
    if (c === undefined) throw new Error('Capture introuvable');
    return serializeSnapshot(c.snapshot);
  }

  /** Restaure une capture lue dans un fichier (sans état initial : relecture indisponible). */
  importCapture(text: string): CaptureInfo {
    const snapshot = parseSnapshot(text);
    this.replace(Engine.restore(this.data, snapshot), null);
    const info: CaptureInfo = {
      id: this.nextCaptureId++,
      label: snapshot.label ?? 'Capture importée',
      tick: this.engine.tick,
      date: this.engine.date(),
    };
    this.captures.set(info.id, { info, snapshot, initial: null });
    return info;
  }

  /**
   * Relecture : repart de l'état initial, rejoue les commandes du journal à leur tick et compare
   * l'empreinte obtenue à celle de l'état courant (SPEC §7.2).
   */
  verifyReplay(): ReplayCheck {
    const initial = this.initial;
    if (initial === null) {
      throw new Error('Relecture indisponible : capture importée sans son état initial');
    }
    const start = this.host.now();
    const hash = this.engine.hash();
    const replayed = Engine.replay(this.data, initial, this.engine.journal, this.engine.tick);
    const replayHash = replayed.hash();
    return {
      identical: hash === replayHash,
      hash,
      replayHash,
      commands: this.engine.journal.filter(
        (e) => e.author === 'user' && e.command !== undefined && e.seq >= initial.nextSeq,
      ).length,
      ms: Math.round(this.host.now() - start),
    };
  }

  /** Nouvelle simulation au départ des données (coefficients courants, graine donnée). */
  restart(seed: number): SimInfo {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error('Graine : entier de 0 à 4 294 967 295');
    }
    const engine = this.create(this.engine.model.tree(), seed);
    this.replace(engine, engine.snapshot());
    return this.info();
  }

  // ——— Images ———

  private statePart(): StatePart {
    const S = this.engine.state;
    const N = S.n;
    const current: [number, number][] = [];
    const seen = new Set<number>();
    for (const m of S.modifiers) {
      if (m.slot.scope !== 'country' || !isCountryNumeric(m.slot.param)) continue;
      const i = S.byId.get(m.slot.entity);
      if (i === undefined) continue;
      const k = col(m.slot.param) * N + i;
      if (!seen.has(k)) {
        seen.add(k);
        current.push([k, S.values[k] as number]);
      }
    }
    const generic: [number, number, ParamValue][] = [];
    S.generic.forEach((column, g) => {
      let sent = this.sentGeneric[g];
      if (sent === undefined) {
        sent = new Array<ParamValue | undefined>(N).fill(undefined);
        this.sentGeneric[g] = sent;
      }
      for (let i = 0; i < N; i++) {
        const v = column[i] ?? null;
        if (sent[i] !== v) {
          sent[i] = v;
          generic.push([g, i, v]);
        }
      }
    });
    const worldEff: Record<string, number> = {};
    for (const [id, v] of S.world) if (typeof v === 'number') worldEff[id] = S.worldEff(id);
    const zone: Record<string, Record<string, ParamValue>> = {};
    for (const [k, t] of S.zone) zone[k] = Object.fromEntries(t);
    const locked: number[] = [];
    for (let k = 0; k < S.locked.length; k++) if (S.locked[k] === 1) locked.push(k);
    return {
      version: this.engine.version,
      eff: S.eff.slice(),
      current,
      generic,
      world: Object.fromEntries(S.world),
      worldEff,
      zone,
      sim: Object.fromEntries(S.sim),
      overrides: [...S.overrides.entries()],
      locked,
      slotLocks: [...S.slotLocks],
      modifiers: S.modifiers.map((m) => ({ ...m })),
      canUndo: this.engine.canUndo(),
      canRedo: this.engine.canRedo(),
      tracked: this.engine.history.trackedParams(),
    };
  }

  private pairsPart(): PairsPart {
    const S = this.engine.state;
    const num: Record<string, Float64Array> = {};
    for (const [k, m] of S.pairNum) num[k] = m.slice();
    const gen: Record<string, [number, ParamValue][]> = {};
    for (const [k, t] of S.pairGen) gen[k] = [...t.entries()];
    return {
      version: this.engine.pairVersion,
      num,
      gen,
      defaults: Object.fromEntries(S.pairDefault),
    };
  }

  /** Envoie une image si quelque chose a changé (toujours si `force`, sinon à 5 Hz au plus). */
  flush(force: boolean): void {
    const now = this.host.now();
    if (!force && now - this.lastFrame < FRAME_MS) return;
    this.lastFrame = now;
    const frame: Frame = { clock: this.clock(), modelVersion: this.modelVersion };
    const transfer: Transferable[] = [];
    if (this.resetPending) {
      this.resetPending = false;
      frame.reset = this.info();
      transfer.push(frame.reset.base.buffer, frame.reset.initial.buffer);
      this.sentVersion = -1;
      this.sentPairVersion = -1;
      this.sentSeq = 0;
      this.sentGeneric = [];
    }
    if (this.engine.version !== this.sentVersion) {
      this.sentVersion = this.engine.version;
      frame.state = this.statePart();
      transfer.push(frame.state.eff.buffer);
    }
    if (this.engine.pairVersion !== this.sentPairVersion) {
      this.sentPairVersion = this.engine.pairVersion;
      frame.pairs = this.pairsPart();
      for (const m of Object.values(frame.pairs.num)) transfer.push(m.buffer);
    }
    const journal = this.engine.journalSince(this.sentSeq);
    if (journal.length > 0) {
      frame.journal = journal;
      this.sentSeq = (journal[journal.length - 1] as JournalEntry).seq;
    }
    if (this.error !== null) {
      frame.error = this.error;
      this.error = null;
    }
    this.host.post(frame, transfer);
  }
}
