/**
 * Miroir de l'état du moteur côté interface : dernières valeurs reçues du worker, lues de façon
 * synchrone par les composants (inspecteur, carte, infobulle, panneaux). Il est mis à jour par
 * les images (`Frame`) ; les compteurs de version disent aux composants quoi redessiner.
 */
import {
  slotKey,
  type JournalEntry,
  type Modifier,
  type OverrideInfo,
  type Slot,
} from '@geosim/engine';
import type { ParamValue } from '@geosim/shared';
import type { Clock, Frame, PairsPart, SimInfo } from './protocol.ts';

/** Nombre maximal d'entrées du journal gardées par l'interface (le moteur les garde toutes). */
export const JOURNAL_LIMIT = 5000;

export interface SlotLayers {
  /** Valeur effective (modificateurs appliqués). */
  value: ParamValue;
  /** Valeur avant modificateurs (surcharge de l'utilisateur ou évolution simulée). */
  current: ParamValue;
  /** Donnée réelle ou valeur initiale calculée. */
  base: ParamValue;
  locked: boolean;
  override: OverrideInfo | null;
  modifiers: Modifier[];
}

function sameValue(a: ParamValue, b: ParamValue): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export class LiveSim {
  readonly info: SimInfo;
  readonly n: number;
  clock: Clock;
  private readonly entityIndex: Map<string, number>;
  private readonly numericCol: Map<string, number>;
  private readonly genericCol: Map<string, number>;
  eff: Float64Array;
  private current = new Map<number, number>();
  private readonly generic: ParamValue[][];
  world: Record<string, ParamValue> = {};
  worldEff: Record<string, number> = {};
  zone: Record<string, Record<string, ParamValue>> = {};
  sim: Record<string, ParamValue> = {};
  private overrides = new Map<string, OverrideInfo>();
  private locked = new Set<number>();
  private slotLocks = new Set<string>();
  modifiers: Modifier[] = [];
  private modifiersBySlot = new Map<string, Modifier[]>();
  canUndo = false;
  canRedo = false;
  tracked = new Set<string>();
  pairs: PairsPart | null = null;
  private pairTables = new Map<string, Map<number, ParamValue>>();
  journal: JournalEntry[] = [];

  constructor(info: SimInfo, clock: Clock) {
    this.info = info;
    this.n = info.entities.length;
    this.clock = clock;
    this.entityIndex = new Map(info.entities.map((id, i) => [id, i]));
    this.numericCol = new Map(info.numeric.map((id, p) => [id, p]));
    this.genericCol = new Map(info.generic.map((id, g) => [id, g]));
    this.eff = info.base.slice();
    this.generic = info.genericBase.map((c) => c.slice());
    this.world = { ...info.worldBase };
    this.zone = Object.fromEntries(Object.entries(info.zoneBase).map(([k, t]) => [k, { ...t }]));
    this.sim = { ...info.simBase };
  }

  /**
   * Intègre une image (sans sa remise à zéro, gérée par l'appelant). Renvoie ce qui a changé.
   */
  apply(frame: Frame): { state: boolean; pairs: boolean; journal: boolean } {
    this.clock = frame.clock;
    const s = frame.state;
    if (s) {
      this.eff = s.eff;
      this.current = new Map(s.current);
      for (const [g, i, v] of s.generic) {
        const column = this.generic[g];
        if (column) column[i] = v;
      }
      this.world = s.world;
      this.worldEff = s.worldEff;
      this.zone = s.zone;
      this.sim = s.sim;
      this.overrides = new Map(s.overrides);
      this.locked = new Set(s.locked);
      this.slotLocks = new Set(s.slotLocks);
      this.modifiers = s.modifiers;
      this.modifiersBySlot = new Map();
      for (const m of s.modifiers) {
        const key = slotKey(m.slot);
        const list = this.modifiersBySlot.get(key);
        if (list) list.push(m);
        else this.modifiersBySlot.set(key, [m]);
      }
      this.canUndo = s.canUndo;
      this.canRedo = s.canRedo;
      this.tracked = new Set(s.tracked);
    }
    if (frame.pairs) {
      this.pairs = frame.pairs;
      this.pairTables = new Map(
        Object.entries(frame.pairs.gen).map(([k, entries]) => [k, new Map(entries)]),
      );
    }
    if (frame.journal) this.appendJournal(frame.journal);
    return { state: s !== undefined, pairs: frame.pairs !== undefined, journal: !!frame.journal };
  }

  private appendJournal(entries: JournalEntry[]): void {
    const bySeq = new Map(this.journal.map((e) => [e.seq, e]));
    for (const e of entries) {
      // Annuler et rétablir marquent l'entrée visée (le moteur fait de même de son côté).
      if (e.target !== undefined && (e.kind === 'undo' || e.kind === 'redo')) {
        const target = bySeq.get(e.target);
        if (target) target.undone = e.kind === 'undo';
      }
      bySeq.set(e.seq, e);
      this.journal.push(e);
    }
    if (this.journal.length > JOURNAL_LIMIT) {
      this.journal = this.journal.slice(this.journal.length - JOURNAL_LIMIT);
    }
  }

  // ——— Entités et paramètres pays ———

  index(entity: string): number | undefined {
    return this.entityIndex.get(entity);
  }

  hasNumeric(param: string): boolean {
    return this.numericCol.has(param);
  }

  /** Valeur effective d'un paramètre pays numérique (null : absente ou non numérique). */
  number(entity: string, param: string): number | null {
    const p = this.numericCol.get(param);
    const i = this.entityIndex.get(entity);
    if (p === undefined || i === undefined) return null;
    const x = this.eff[p * this.n + i] as number;
    return Number.isFinite(x) ? x : null;
  }

  /** Valeur initiale (donnée réelle ou valeur calculée au départ) d'un paramètre numérique. */
  baseNumber(entity: string, param: string): number | null {
    const p = this.numericCol.get(param);
    const i = this.entityIndex.get(entity);
    if (p === undefined || i === undefined) return null;
    const x = this.info.base[p * this.n + i] as number;
    return Number.isFinite(x) ? x : null;
  }

  /** Valeur au départ de la simulation (après calage et calcul des dérivés). */
  initialNumber(entity: string, param: string): number | null {
    const p = this.numericCol.get(param);
    const i = this.entityIndex.get(entity);
    if (p === undefined || i === undefined) return null;
    const x = this.info.initial[p * this.n + i] as number;
    return Number.isFinite(x) ? x : null;
  }

  /** Valeurs initiales d'un paramètre pour toutes les entités (échelles de couleur fixes). */
  baseColumn(param: string): Float64Array | null {
    const p = this.numericCol.get(param);
    if (p === undefined) return null;
    return this.info.base.subarray(p * this.n, (p + 1) * this.n);
  }

  genericValue(entity: string, param: string): ParamValue {
    const g = this.genericCol.get(param);
    const i = this.entityIndex.get(entity);
    if (g === undefined || i === undefined) return null;
    return this.generic[g]?.[i] ?? null;
  }

  /** Valeur d'un paramètre pays, numérique ou non. */
  countryValue(entity: string, param: string): ParamValue {
    return this.numericCol.has(param)
      ? this.number(entity, param)
      : this.genericValue(entity, param);
  }

  // ——— Paires ———

  pairValue(param: string, from: string, to: string): ParamValue {
    const i = this.entityIndex.get(from);
    const j = this.entityIndex.get(to);
    if (i === undefined || j === undefined || this.pairs === null) return null;
    const m = this.pairs.num[param];
    if (m !== undefined) {
      const x = m[i * this.n + j] as number;
      return Number.isNaN(x) ? null : x;
    }
    const table = this.pairTables.get(param);
    if (table === undefined) return null;
    const v = table.get(i * this.n + j);
    return v === undefined ? (this.pairs.defaults[param] ?? null) : v;
  }

  /**
   * Valeurs renseignées d'un paramètre bilatéral : [de, vers, valeur], hors valeur par défaut
   * (comme les entrées des données de départ).
   */
  pairEntries(param: string): [string, string, ParamValue][] {
    const out: [string, string, ParamValue][] = [];
    if (this.pairs === null) return out;
    const ids = this.info.entities;
    const n = this.n;
    const table = this.pairTables.get(param);
    if (table !== undefined) {
      for (const [k, v] of table) {
        const from = ids[Math.floor(k / n)];
        const to = ids[k % n];
        if (from !== undefined && to !== undefined) out.push([from, to, v]);
      }
      return out;
    }
    const m = this.pairs.num[param];
    if (m === undefined) return out;
    const fallback = this.pairs.defaults[param];
    for (let k = 0; k < m.length; k++) {
      const x = m[k] as number;
      if (Number.isNaN(x) || x === fallback) continue;
      const from = ids[Math.floor(k / n)];
      const to = ids[k % n];
      if (from !== undefined && to !== undefined) out.push([from, to, x]);
    }
    return out;
  }

  // ——— Emplacements (tous périmètres) ———

  /** Valeur effective d'un emplacement. */
  value(slot: Slot): ParamValue {
    switch (slot.scope) {
      case 'country':
        return this.countryValue(slot.entity, slot.param);
      case 'pair':
        return this.pairValue(slot.param, slot.from, slot.to);
      case 'world': {
        const eff = this.worldEff[slot.param];
        return eff !== undefined ? eff : (this.world[slot.param] ?? null);
      }
      case 'zone':
        return this.zone[slot.param]?.[slot.target] ?? null;
      case 'sim':
        return this.sim[slot.param] ?? null;
    }
  }

  /** Couches de valeur d'un emplacement : base, surcharge, verrou, modificateurs, effective. */
  layers(slot: Slot, base: ParamValue): SlotLayers {
    const key = slotKey(slot);
    const value = this.value(slot);
    let current: ParamValue = value;
    let locked = this.slotLocks.has(key);
    if (slot.scope === 'country') {
      const p = this.numericCol.get(slot.param);
      const i = this.entityIndex.get(slot.entity);
      if (p !== undefined && i !== undefined) {
        const k = p * this.n + i;
        locked = this.locked.has(k);
        const c = this.current.get(k);
        if (c !== undefined) current = Number.isFinite(c) ? c : null;
      }
    } else if (slot.scope === 'world') {
      current = this.world[slot.param] ?? null;
    }
    return {
      value,
      current,
      base,
      locked,
      override: this.overrides.get(key) ?? null,
      modifiers: this.modifiersBySlot.get(key) ?? [],
    };
  }

  /** Valeur initiale d'un emplacement connue du moteur (pays, monde, zones, simulation). */
  baseValue(slot: Slot): ParamValue {
    switch (slot.scope) {
      case 'country': {
        if (this.numericCol.has(slot.param)) return this.baseNumber(slot.entity, slot.param);
        const g = this.genericCol.get(slot.param);
        const i = this.entityIndex.get(slot.entity);
        return g === undefined || i === undefined ? null : (this.info.genericBase[g]?.[i] ?? null);
      }
      case 'world':
        return this.info.worldBase[slot.param] ?? null;
      case 'zone':
        return this.info.zoneBase[slot.param]?.[slot.target] ?? null;
      case 'sim':
        return this.info.simBase[slot.param] ?? null;
      case 'pair':
        return null;
    }
  }

  /**
   * La valeur a-t-elle bougé depuis le départ de la simulation (évolution simulée ou
   * modification) ? Les paramètres pays numériques se comparent à leur valeur au départ, les
   * autres à leur valeur de référence `base`.
   */
  changed(slot: Slot, base: ParamValue): boolean {
    const start =
      slot.scope === 'country' && this.numericCol.has(slot.param)
        ? this.initialNumber(slot.entity, slot.param)
        : base;
    return !sameValue(this.value(slot), start);
  }

  /** Valeur de départ calculée par le moteur différente de la donnée (dérivé recalculé). */
  computedAtStart(slot: Slot, base: ParamValue): boolean {
    if (slot.scope !== 'country' || !this.numericCol.has(slot.param)) return false;
    const start = this.initialNumber(slot.entity, slot.param);
    return start !== null && !sameValue(start, base);
  }

  isModified(slot: Slot): boolean {
    const key = slotKey(slot);
    return this.overrides.has(key) || this.modifiersBySlot.has(key) || this.isLocked(slot);
  }

  isLocked(slot: Slot): boolean {
    if (slot.scope === 'country') {
      const p = this.numericCol.get(slot.param);
      const i = this.entityIndex.get(slot.entity);
      if (p !== undefined && i !== undefined) return this.locked.has(p * this.n + i);
    }
    return this.slotLocks.has(slotKey(slot));
  }

  /** Entités qui ont au moins un paramètre modifié par l'utilisateur. */
  modifiedEntities(): Set<string> {
    const out = new Set<string>();
    for (const key of this.overrides.keys()) {
      const [scope, , a, b] = key.split('|');
      if (scope === 'c' && a) out.add(a);
      if (scope === 'p' && a && b) {
        out.add(a);
        out.add(b);
      }
    }
    return out;
  }
}
