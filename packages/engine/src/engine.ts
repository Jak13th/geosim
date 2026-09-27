/**
 * Moteur de simulation (SPEC §7) : un tick = un jour ; systèmes mensuels le premier jour de
 * chaque mois ; contrôles quotidiens légers (élections à leur date) ; commandes horodatées
 * journalisées (annuler, rétablir, relecture) ; captures.
 *
 * Ordonnancement d'un pas mensuel : sanctions → commerce (détroits, routes, échanges) → énergie
 * (pénuries, stocks) → marchés (prix du mois) → ressources (alimentation, produits critiques) →
 * démographie → réfugiés → économie → budget → politique intérieure → diplomatie, puis valeurs
 * dérivées et historique. Après chaque commande, les valeurs dérivées sont recalculées sans
 * avancer le temps : une modification se voit aussitôt.
 */
import type { CoefficientTree, ParamValue } from '@geosim/shared';
import { Calendar } from './calendar.ts';
import { applyCommand, applyInverse, CommandError, type Inverse } from './commands.ts';
import { hashState } from './hash.ts';
import { History, type HistorySnapshot } from './history.ts';
import { Model } from './model.ts';
import type { RngState } from './rng.ts';
import { Rng } from './rng.ts';
import {
  COUNTRY_NUMERIC,
  SIM_PARAMS,
  State,
  col,
  dataId,
  isCountryNumeric,
  type EngineData,
  type OverrideInfo,
} from './state.ts';
import type { SimEvent, System, SystemContext } from './system.ts';
import { accounts } from './systems/accounts.ts';
import { budget } from './systems/budget.ts';
import { demography } from './systems/demography.ts';
import { applyBloc, applyUnResolution, diplomacy } from './systems/diplomacy.ts';
import { economy } from './systems/economy.ts';
import { energy } from './systems/energy.ts';
import { FINANCE } from './systems/finance.ts';
import { markets } from './systems/markets.ts';
import { politics } from './systems/politics.ts';
import { refugees } from './systems/refugees.ts';
import { resources } from './systems/resources.ts';
import { sanctions } from './systems/sanctions.ts';
import { tradeSystem } from './systems/trade.ts';
import type { Command, Factor, JournalEntry, Modifier, Slot } from './types.ts';

export const ENGINE_VERSION = '0.4.0';

const INIT_ORDER: readonly System[] = [
  demography,
  sanctions,
  tradeSystem,
  markets,
  energy,
  resources,
  economy,
  budget,
  diplomacy,
  politics,
  refugees,
  accounts,
];
const MONTHLY_ORDER: readonly System[] = [
  sanctions,
  tradeSystem,
  energy,
  markets,
  resources,
  demography,
  refugees,
  economy,
  budget,
  politics,
  diplomacy,
];
const DERIVE_ORDER: readonly System[] = [
  demography,
  tradeSystem,
  resources,
  budget,
  politics,
  diplomacy,
  accounts,
];
const DAILY_ORDER: readonly System[] = INIT_ORDER.filter((s) => s.daily !== undefined);
export const SYSTEMS: readonly System[] = INIT_ORDER;

/** Coefficients de config/model.yaml lus par les systèmes (vérifiés au chargement). */
export const REQUIRED_COEFFICIENTS: readonly string[] = [
  ...new Set([...SYSTEMS.flatMap((s) => s.coefficients), ...Object.values(FINANCE)]),
].sort();

/** Paramètres pays que les systèmes font évoluer (suivis dans l'historique). */
export const SIMULATED_PARAMS: readonly string[] = [...new Set(SYSTEMS.flatMap((s) => s.writes))];

export interface EngineOptions {
  seed: number;
  model: CoefficientTree;
  /** Date de départ (défaut : date de construction des données). */
  startDate?: string;
  /** Résolution de la carte chargée (paramètre `sim.map_resolution`, affichage). */
  mapResolution?: number;
}

/** Valeurs par défaut des paramètres de simulation (PARAMETRES.md §18). */
function simDefaults(options: EngineOptions, startDate: string): Map<string, ParamValue> {
  const values: Record<string, ParamValue> = {
    'sim.seed': options.seed >>> 0,
    'sim.start_date': startDate,
    'sim.speed': 0,
    'sim.realism': 100,
    'sim.conquest_speed': 1,
    'sim.ai_aggression': 1,
    'sim.fog_of_war': 50,
    'sim.map_resolution': String(options.mapResolution ?? 4096),
    'sim.pov': 'de_facto',
  };
  const out = new Map<string, ParamValue>();
  for (const def of SIM_PARAMS) out.set(def.id, values[def.id] ?? null);
  return out;
}

export interface EngineSnapshot {
  format: 'geosim-capture';
  version: 1;
  engine: string;
  dataId: string;
  tick: number;
  seed: number;
  startDate: string;
  /** Libellé choisi à la capture (métadonnée, sans effet sur la restauration). */
  label?: string;
  monthCount: number;
  model: CoefficientTree;
  values: Float64Array;
  base: Float64Array;
  /** Valeurs au départ de la simulation (absentes des captures antérieures : base). */
  initial?: Float64Array;
  locked: Uint8Array;
  generic: ParamValue[][];
  genericBase: ParamValue[][];
  pairNum: Record<string, Float64Array>;
  pairGen: Record<string, [number, ParamValue][]>;
  world: Record<string, ParamValue>;
  zone: Record<string, Record<string, ParamValue>>;
  sim: Record<string, ParamValue>;
  simBase: Record<string, ParamValue>;
  overrides: [string, OverrideInfo][];
  slotLocks: string[];
  modifiers: Modifier[];
  nextModifierId: number;
  internal: Record<string, Float64Array>;
  worldInternal: Record<string, number>;
  rng: Record<string, RngState>;
  journal: JournalEntry[];
  inverses: [number, Inverse & { model?: CoefficientTree }][];
  undoStack: number[];
  redoStack: number[];
  nextSeq: number;
  history: HistorySnapshot;
}

type StoredInverse = Inverse & { model?: CoefficientTree };

function slotEntities(slots: Slot[]): string[] {
  const out = new Set<string>();
  for (const s of slots) {
    if (s.scope === 'country') out.add(s.entity);
    else if (s.scope === 'pair') {
      out.add(s.from);
      out.add(s.to);
    }
  }
  return [...out];
}

export class Engine {
  readonly state: State;
  model: Model;
  readonly calendar: Calendar;
  history: History;
  /**
   * Valeurs des paramètres pays au départ (P × N), après calage et calcul des dérivés : elles
   * distinguent une valeur simulée d'une valeur calculée dès le départ (affichage).
   */
  initial: Float64Array;
  readonly dataId: string;
  journal: JournalEntry[] = [];
  private inverses = new Map<number, StoredInverse>();
  private undoStack: number[] = [];
  private redoStack: number[] = [];
  private nextSeq = 1;
  private monthCount = 0;
  /** Compteur de versions (modification des valeurs), pour l'interface. */
  version = 0;
  pairVersion = 0;

  private constructor(state: State, model: Model, calendar: Calendar) {
    this.state = state;
    this.model = model;
    this.calendar = calendar;
    this.history = new History(state.n);
    this.initial = new Float64Array(0);
    this.dataId = dataId(state.data);
  }

  /** Nouvelle simulation au départ des données, calée sur la situation initiale. */
  static create(data: EngineData, options: EngineOptions): Engine {
    const model = new Model(options.model, REQUIRED_COEFFICIENTS);
    const startDate = options.startDate ?? data.countries.buildDate;
    const state = new State(data, options.seed);
    const engine = new Engine(state, model, new Calendar(startDate));
    const sim = simDefaults(options, startDate);
    for (const [k, v] of sim) {
      state.sim.set(k, v);
      state.simBase.set(k, v);
    }
    state.refreshEffective();
    const ctx = engine.context();
    for (const system of INIT_ORDER) {
      system.init?.(ctx);
      state.refreshEffective();
    }
    engine.derive();
    // Valeurs initiales calculées : elles servent de référence (réinitialisation, affichage).
    for (let k = 0; k < state.values.length; k++) {
      if (Number.isNaN(state.base[k] as number) && !Number.isNaN(state.values[k] as number)) {
        state.base[k] = state.values[k] as number;
      }
    }
    engine.initial = state.values.slice();
    for (const id of SIMULATED_PARAMS) engine.history.track(state, col(id));
    engine.history.record(state);
    return engine;
  }

  get tick(): number {
    return this.state.tick;
  }

  date(): string {
    return this.calendar.isoAt(this.state.tick);
  }

  private context(): SystemContext {
    return {
      state: this.state,
      model: this.model,
      calendar: this.calendar,
      dt: 1 / 12,
      years: this.calendar.yearsAt(this.state.tick),
      month: this.monthCount,
      emit: (event) => this.emit(event),
    };
  }

  private emit(event: SimEvent): void {
    const seq = this.nextSeq++;
    const effects = [...event.effects];
    for (const { slot, spec } of event.modifiers ?? []) {
      const modifier: Modifier = {
        ...spec,
        id: this.state.nextModifierId++,
        slot,
        startTick: this.state.tick,
        seq,
        author: 'event',
      };
      this.state.modifiers.push(modifier);
      effects.push({ slot, from: null, to: null, modifier: modifier.id });
    }
    this.state.indexModifiers();
    const entry: JournalEntry = {
      seq,
      tick: this.state.tick,
      date: this.date(),
      author: 'event',
      kind: event.kind,
      entities: event.entities,
      severity: event.severity,
      factors: event.factors,
      effects,
    };
    if (event.note) entry.note = event.note;
    this.journal.push(entry);
  }

  /** Recalcule les valeurs dérivées (sans aléa ni avancée du temps). */
  private derive(): void {
    const ctx = this.context();
    for (const system of DERIVE_ORDER) {
      system.derive?.(ctx);
      this.state.refreshEffective();
    }
    this.version++;
  }

  private monthly(): void {
    const ctx = this.context();
    for (const system of MONTHLY_ORDER) {
      system.monthly?.(ctx);
      this.state.refreshEffective();
    }
    this.monthCount++;
    this.derive();
    // Relations, échanges et affinités évoluent chaque mois.
    this.pairVersion++;
    this.history.record(this.state);
  }

  /** Avance de `days` jours ; renvoie les entrées du journal produites. */
  step(days = 1): JournalEntry[] {
    const first = this.journal.length;
    for (let d = 0; d < days; d++) {
      this.state.tick++;
      const expired = this.state.expireModifiers();
      if (this.calendar.isMonthStart(this.state.tick)) this.monthly();
      else if (expired.length > 0 || this.state.hasModifiers()) {
        // Les modificateurs évoluent chaque jour : valeurs effectives à jour (les dérivés
        // suivent au pas mensuel ou à la prochaine commande).
        this.state.refreshEffective();
        this.version++;
      }
      this.daily();
    }
    return this.journal.slice(first);
  }

  /** Contrôles quotidiens (élections à leur date) ; dérivés recalculés s'ils changent l'état. */
  private daily(): void {
    if (DAILY_ORDER.length === 0) return;
    const ctx = this.context();
    let changed = false;
    for (const system of DAILY_ORDER) {
      if (system.daily?.(ctx) === true) {
        changed = true;
        this.state.refreshEffective();
      }
    }
    if (changed) {
      this.derive();
      this.pairVersion++;
    }
  }

  /** Avance jusqu'au tick donné (inclus). */
  runUntil(tick: number): JournalEntry[] {
    return this.step(Math.max(0, tick - this.state.tick));
  }

  /** Mois simulés depuis le départ (pas mensuels effectués). */
  get months(): number {
    return this.monthCount;
  }

  // ——— Commandes ———

  private execute(
    command: Command,
    seq: number,
  ): { entry: Partial<JournalEntry> & { factors?: Factor[] }; inverse: StoredInverse } {
    switch (command.type) {
      case 'setCoefficient': {
        const from = this.model.get(command.path);
        this.model.set(command.path, command.value);
        return {
          entry: { coefficients: [{ path: command.path, from, to: command.value }], entities: [] },
          inverse: { coefficients: [{ path: command.path, value: from }] },
        };
      }
      case 'setModel': {
        const next = new Model(command.model, REQUIRED_COEFFICIENTS);
        const previous = this.model.tree();
        const changes = this.modelChanges(next);
        this.model = next;
        return { entry: { coefficients: changes, entities: [] }, inverse: { model: previous } };
      }
      case 'bloc': {
        const applied = applyBloc(this.state, command);
        return {
          entry: {
            effects: applied.effects,
            entities: applied.entities,
            ...(applied.note ? { note: applied.note } : {}),
          },
          inverse: applied.inverse,
        };
      }
      case 'unResolution': {
        const applied = applyUnResolution({ state: this.state, model: this.model }, command, seq);
        return {
          entry: {
            effects: applied.effects,
            entities: applied.entities,
            ...(applied.factors ? { factors: applied.factors } : {}),
            ...(applied.note ? { note: applied.note } : {}),
          },
          inverse: applied.inverse,
        };
      }
      case 'undo':
      case 'redo':
        throw new CommandError('Annuler et rétablir passent par undo() et redo()');
      default: {
        if ('slots' in command) {
          for (const slot of command.slots) {
            if (
              slot.scope === 'country' &&
              isCountryNumeric(slot.param) &&
              this.state.byId.has(slot.entity)
            ) {
              this.history.track(this.state, col(slot.param));
            }
          }
        }
        const applied = applyCommand(this.state, command, seq);
        const entities =
          'slots' in command
            ? slotEntities(command.slots)
            : slotEntities(applied.effects.map((e) => e.slot));
        return { entry: { effects: applied.effects, entities }, inverse: applied.inverse };
      }
    }
  }

  private restoreInverse(inverse: StoredInverse): void {
    if (inverse.model) this.model = new Model(inverse.model, REQUIRED_COEFFICIENTS);
    for (const c of inverse.coefficients ?? []) this.model.set(c.path, c.value);
    applyInverse(this.state, inverse);
  }

  private afterChange(pairs: boolean): void {
    this.state.refreshEffective();
    this.derive();
    if (pairs) this.pairVersion++;
  }

  /**
   * Applique une commande de l'utilisateur (horodatée au tick courant) et la journalise. Une
   * commande invalide lève une `CommandError` et ne laisse aucune trace.
   */
  apply(command: Command): JournalEntry {
    if (command.type === 'undo') return this.undo();
    if (command.type === 'redo') return this.redo();
    const seq = this.nextSeq;
    const { entry, inverse } = this.execute(command, seq);
    this.nextSeq++;
    const full: JournalEntry = {
      seq,
      tick: this.state.tick,
      date: this.date(),
      author: 'user',
      kind: command.type === 'lock' ? (command.locked ? 'lock' : 'unlock') : command.type,
      entities: entry.entities ?? [],
      severity: 0,
      command,
      ...(entry.effects ? { effects: entry.effects } : {}),
      ...(entry.coefficients ? { coefficients: entry.coefficients } : {}),
      ...(entry.factors ? { factors: entry.factors } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    };
    this.journal.push(full);
    this.inverses.set(seq, inverse);
    this.undoStack.push(seq);
    this.redoStack = [];
    this.afterChange(
      command.type === 'bloc' ||
        command.type === 'unResolution' ||
        ('slots' in command &&
          command.slots.some((s) => s.scope === 'pair' || s.scope === 'country')),
    );
    return full;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Annule la dernière modification de l'utilisateur (opération inverse, journalisée). */
  undo(): JournalEntry {
    const target = this.undoStack.pop();
    if (target === undefined) throw new CommandError('Rien à annuler');
    const original = this.journal.find((e) => e.seq === target);
    const inverse = this.inverses.get(target);
    if (original === undefined || inverse === undefined)
      throw new CommandError('Entrée introuvable');
    this.restoreInverse(inverse);
    original.undone = true;
    this.redoStack.push(target);
    const entry: JournalEntry = {
      seq: this.nextSeq++,
      tick: this.state.tick,
      date: this.date(),
      author: 'user',
      kind: 'undo',
      entities: original.entities,
      severity: 0,
      command: { type: 'undo' },
      target,
    };
    this.journal.push(entry);
    this.afterChange(true);
    return entry;
  }

  /** Rétablit la dernière modification annulée. */
  redo(): JournalEntry {
    const target = this.redoStack.pop();
    if (target === undefined) throw new CommandError('Rien à rétablir');
    const original = this.journal.find((e) => e.seq === target);
    if (original?.command === undefined) throw new CommandError('Entrée introuvable');
    const { inverse } = this.execute(original.command, target);
    this.inverses.set(target, inverse);
    original.undone = false;
    this.undoStack.push(target);
    const entry: JournalEntry = {
      seq: this.nextSeq++,
      tick: this.state.tick,
      date: this.date(),
      author: 'user',
      kind: 'redo',
      entities: original.entities,
      severity: 0,
      command: { type: 'redo' },
      target,
    };
    this.journal.push(entry);
    this.afterChange(true);
    return entry;
  }

  /**
   * Coefficients qui changeraient en passant à un autre modèle (arbre de config/model.yaml validé
   * ou modèle déjà construit) : permet d'ignorer un rechargement sans effet.
   */
  modelChanges(other: CoefficientTree | Model): { path: string; from: number; to: number }[] {
    const next = other instanceof Model ? other : new Model(other, REQUIRED_COEFFICIENTS);
    const removed = this.model.paths().filter((p) => !next.has(p));
    return [
      ...next
        .paths()
        .filter((p) => !this.model.has(p) || this.model.get(p) !== next.get(p))
        .map((p) => ({
          path: p,
          from: this.model.has(p) ? this.model.get(p) : Number.NaN,
          to: next.get(p),
        })),
      ...removed.map((p) => ({ path: p, from: this.model.get(p), to: Number.NaN })),
    ];
  }

  // ——— Empreinte, captures, relecture ———

  hash(): string {
    return hashState(this.state, this.model);
  }

  snapshot(label?: string): EngineSnapshot {
    const S = this.state;
    const pairNum: Record<string, Float64Array> = {};
    for (const [k, m] of S.pairNum) pairNum[k] = m.slice();
    const pairGen: Record<string, [number, ParamValue][]> = {};
    for (const [k, t] of S.pairGen) pairGen[k] = [...t.entries()].sort((a, b) => a[0] - b[0]);
    const zone: Record<string, Record<string, ParamValue>> = {};
    for (const [k, t] of S.zone) zone[k] = Object.fromEntries(t);
    const internal: Record<string, Float64Array> = {};
    for (const [k, a] of S.internal) internal[k] = a.slice();
    return {
      format: 'geosim-capture',
      version: 1,
      engine: ENGINE_VERSION,
      dataId: this.dataId,
      tick: S.tick,
      seed: S.seed,
      startDate: this.calendar.isoAt(0),
      ...(label ? { label } : {}),
      monthCount: this.monthCount,
      model: this.model.tree(),
      values: S.values.slice(),
      base: S.base.slice(),
      initial: this.initial.slice(),
      locked: S.locked.slice(),
      generic: S.generic.map((c) => c.slice()),
      genericBase: S.genericBase.map((c) => c.slice()),
      pairNum,
      pairGen,
      world: Object.fromEntries(S.world),
      zone,
      sim: Object.fromEntries(S.sim),
      simBase: Object.fromEntries(S.simBase),
      overrides: [...S.overrides.entries()],
      slotLocks: [...S.slotLocks],
      modifiers: S.modifiers.map((m) => ({ ...m })),
      nextModifierId: S.nextModifierId,
      internal,
      worldInternal: Object.fromEntries(S.worldInternal),
      rng: S.rngStates(),
      journal: this.journal.map((e) => ({ ...e })),
      inverses: [...this.inverses.entries()],
      undoStack: this.undoStack.slice(),
      redoStack: this.redoStack.slice(),
      nextSeq: this.nextSeq,
      history: this.history.snapshot(),
    };
  }

  /** Restaure une capture (mêmes données uniquement). */
  static restore(data: EngineData, snap: EngineSnapshot): Engine {
    if (snap.format !== 'geosim-capture' || snap.version !== 1) {
      throw new Error('Capture illisible (format ou version inconnus)');
    }
    if (snap.dataId !== dataId(data)) {
      throw new Error(
        `Capture faite sur d'autres données (${snap.dataId}) : relance « npm run data » ou charge la bonne capture`,
      );
    }
    const state = new State(data, snap.seed);
    const engine = new Engine(
      state,
      new Model(snap.model, REQUIRED_COEFFICIENTS),
      new Calendar(snap.startDate),
    );
    state.tick = snap.tick;
    state.values.set(snap.values);
    state.base.set(snap.base);
    engine.initial = (snap.initial ?? snap.base).slice();
    state.locked.set(snap.locked);
    snap.generic.forEach((c, g) =>
      c.forEach((v, i) => ((state.generic[g] as ParamValue[])[i] = v)),
    );
    snap.genericBase.forEach((c, g) =>
      c.forEach((v, i) => ((state.genericBase[g] as ParamValue[])[i] = v)),
    );
    for (const [k, m] of Object.entries(snap.pairNum)) state.pairNum.get(k)?.set(m);
    for (const [k, entries] of Object.entries(snap.pairGen)) state.pairGen.set(k, new Map(entries));
    state.world.clear();
    for (const [k, v] of Object.entries(snap.world)) state.world.set(k, v);
    for (const [k, t] of Object.entries(snap.zone)) state.zone.set(k, new Map(Object.entries(t)));
    for (const [k, v] of Object.entries(snap.sim)) state.sim.set(k, v);
    for (const [k, v] of Object.entries(snap.simBase)) state.simBase.set(k, v);
    for (const [k, o] of snap.overrides) state.overrides.set(k, o);
    for (const k of snap.slotLocks) state.slotLocks.add(k);
    state.modifiers = snap.modifiers.map((m) => ({ ...m }));
    state.nextModifierId = snap.nextModifierId;
    for (const [k, a] of Object.entries(snap.internal)) state.internal.set(k, a.slice());
    for (const [k, v] of Object.entries(snap.worldInternal)) state.worldInternal.set(k, v);
    for (const [k, s] of Object.entries(snap.rng)) state.rngs.set(k, Rng.fromState(s));
    state.indexModifiers();
    engine.monthCount = snap.monthCount;
    engine.journal = snap.journal.map((e) => ({ ...e }));
    engine.inverses = new Map(snap.inverses);
    engine.undoStack = snap.undoStack.slice();
    engine.redoStack = snap.redoStack.slice();
    engine.nextSeq = snap.nextSeq;
    engine.history = History.restore(state.n, snap.history);
    state.refreshEffective();
    return engine;
  }

  /**
   * Relecture : repart d'une capture et rejoue les commandes de l'utilisateur du journal à leur
   * tick, jusqu'au tick demandé. Les événements se reproduisent d'eux-mêmes (même aléa).
   */
  static replay(
    data: EngineData,
    initial: EngineSnapshot,
    journal: readonly JournalEntry[],
    untilTick: number,
  ): Engine {
    const engine = Engine.restore(data, initial);
    const commands = journal
      .filter((e) => e.author === 'user' && e.command !== undefined && e.seq >= initial.nextSeq)
      .sort((a, b) => a.seq - b.seq);
    let k = 0;
    for (;;) {
      while (k < commands.length && (commands[k] as JournalEntry).tick <= engine.tick) {
        engine.apply((commands[k] as JournalEntry).command as Command);
        k++;
      }
      if (engine.tick >= untilTick) break;
      engine.step(1);
    }
    return engine;
  }

  /** Entrées du journal postérieures à `seq`. */
  journalSince(seq: number): JournalEntry[] {
    const out: JournalEntry[] = [];
    for (let k = this.journal.length - 1; k >= 0; k--) {
      const e = this.journal[k] as JournalEntry;
      if (e.seq <= seq) break;
      out.push(e);
    }
    return out.reverse();
  }

  /** Valeur d'un paramètre pays numérique (effective). */
  countryValue(paramId: string, entity: string): number {
    const i = this.state.byId.get(entity);
    if (i === undefined) throw new Error(`Entité inconnue : ${entity}`);
    return this.state.e(col(paramId))[i] as number;
  }
}

export { COUNTRY_NUMERIC };
