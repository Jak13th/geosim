/**
 * Commandes de modification (SPEC §6.3, §7.2) : validation contre le catalogue, application aux
 * couches de valeur, effets et opération inverse (annuler / rétablir).
 *
 * Sémantique par nature de paramètre (PARAMETRES.md) :
 * - levier (`input`) : la valeur saisie remplace la valeur courante ;
 * - état (`state`) : la valeur saisie remplace l'état courant, la simulation repart de là ;
 * - dérivé (`derived`) : la valeur saisie est forcée (verrouillée), ce qui court-circuite le calcul ;
 *   réinitialiser le déverrouille.
 * Réinitialiser remet la donnée réelle (ou la valeur initiale calculée) ; le verrou empêche la
 * simulation de modifier la valeur ; un modificateur est un effet temporaire superposé à la valeur.
 */
import { paramById, type ParamDef, type ParamValue } from '@geosim/shared';
import { parseIsoDate } from './calendar.ts';
import { clampTo, col, isCountryNumeric, type OverrideInfo, type State } from './state.ts';
import {
  slotKey,
  type Command,
  type Effect,
  type Modifier,
  type ModifierSpec,
  type Slot,
} from './types.ts';

/** État complet d'un emplacement, pour l'annulation. */
export interface SlotState {
  slot: Slot;
  value: ParamValue;
  locked: boolean;
  override: OverrideInfo | null;
}

/** Opération inverse d'une commande appliquée. */
export interface Inverse {
  slots?: SlotState[];
  /** Modificateurs à retirer (créés par la commande). */
  removeModifiers?: number[];
  /** Modificateurs à rétablir (retirés par la commande). */
  addModifiers?: Modifier[];
  coefficients?: { path: string; value: number }[];
}

export class CommandError extends Error {}

/** Paramètres de simulation modifiables par commande (les autres sont fixés au lancement). */
const SIM_EDITABLE = new Set([
  'sim.seed',
  'sim.realism',
  'sim.conquest_speed',
  'sim.ai_aggression',
  'sim.fog_of_war',
]);
/** Paramètres de zone modifiables en phase 3 (les zones géographiques relèvent des outils de scénario). */
const ZONE_EDITABLE = new Set(['zone.chokepoint_status']);

export function slotDef(state: State, slot: Slot): ParamDef {
  const def = paramById(slot.param);
  if (def === undefined) throw new CommandError(`Paramètre inconnu : ${slot.param}`);
  if (def.scope !== slot.scope) {
    throw new CommandError(`${slot.param} : portée ${def.scope}, pas ${slot.scope}`);
  }
  switch (slot.scope) {
    case 'country':
      if (!state.byId.has(slot.entity)) throw new CommandError(`Entité inconnue : ${slot.entity}`);
      break;
    case 'pair':
      if (!state.byId.has(slot.from) || !state.byId.has(slot.to)) {
        throw new CommandError(`Paire inconnue : ${slot.from} → ${slot.to}`);
      }
      if (slot.from === slot.to) throw new CommandError('Une paire relie deux entités distinctes');
      break;
    case 'zone':
      if (!ZONE_EDITABLE.has(slot.param)) {
        throw new CommandError(
          `${def.label} : zones géographiques modifiables avec les outils de scénario (pinceau, phase 8)`,
        );
      }
      if (!state.zone.get(slot.param)?.has(slot.target)) {
        throw new CommandError(`Zone inconnue : ${slot.target}`);
      }
      break;
    case 'sim':
      if (slot.param === 'sim.speed') {
        throw new CommandError(
          'La vitesse se règle dans la barre de temps (elle ne change pas l’histoire simulée)',
        );
      }
      if (!SIM_EDITABLE.has(slot.param)) {
        throw new CommandError(
          `${def.label} : fixé au lancement de la simulation ou à la construction des données`,
        );
      }
      break;
    case 'world':
      break;
  }
  return def;
}

function isVector(v: unknown): v is Record<string, number> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Valide et normalise une valeur saisie pour un paramètre (bornes du catalogue appliquées). */
export function coerceValue(def: ParamDef, value: ParamValue): ParamValue {
  switch (def.valueType) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new CommandError(`${def.label} : nombre attendu`);
      }
      return clampTo(def, value);
    case 'enum':
      if (typeof value !== 'string' || !(def.enumValues ?? []).includes(value)) {
        throw new CommandError(
          `${def.label} : valeur attendue parmi ${(def.enumValues ?? []).join(', ')}`,
        );
      }
      return value;
    case 'bool':
      if (typeof value !== 'boolean') throw new CommandError(`${def.label} : oui ou non attendu`);
      return value;
    case 'date':
      if (typeof value !== 'string') throw new CommandError(`${def.label} : date attendue`);
      try {
        parseIsoDate(value);
      } catch {
        throw new CommandError(`${def.label} : date invalide (${value})`);
      }
      return value;
    case 'list':
      if (!Array.isArray(value) || value.some((x) => typeof x !== 'string')) {
        throw new CommandError(`${def.label} : liste attendue`);
      }
      return [...value];
    case 'vector': {
      if (!isVector(value))
        throw new CommandError(`${def.label} : composantes numériques attendues`);
      const out: Record<string, number> = {};
      for (const [k, x] of Object.entries(value)) {
        if (def.components && !def.components.includes(k)) {
          throw new CommandError(`${def.label} : composante inconnue ${k}`);
        }
        if (typeof x !== 'number' || !Number.isFinite(x)) {
          throw new CommandError(`${def.label} : ${k} doit être un nombre`);
        }
        out[k] = clampTo(def, x);
      }
      return out;
    }
  }
}

// ——— Lecture et écriture des emplacements ———

function countryIndex(state: State, slot: Extract<Slot, { scope: 'country' }>): number {
  return state.byId.get(slot.entity) as number;
}

export function readSlot(state: State, slot: Slot): ParamValue {
  switch (slot.scope) {
    case 'country': {
      const i = countryIndex(state, slot);
      if (isCountryNumeric(slot.param)) {
        const x = state.v(col(slot.param))[i] as number;
        return Number.isNaN(x) ? null : x;
      }
      return state.genericValue(slot.param, i);
    }
    case 'pair':
      return state.pairValue(
        slot.param,
        state.byId.get(slot.from) as number,
        state.byId.get(slot.to) as number,
      );
    case 'world':
      return state.world.get(slot.param) ?? null;
    case 'zone':
      return state.zone.get(slot.param)?.get(slot.target) ?? null;
    case 'sim':
      return state.sim.get(slot.param) ?? null;
  }
}

/** Valeur de référence (donnée réelle ou valeur initiale calculée). */
export function baseOf(state: State, slot: Slot): ParamValue {
  switch (slot.scope) {
    case 'country': {
      const i = countryIndex(state, slot);
      if (isCountryNumeric(slot.param)) {
        const x = state.base[col(slot.param) * state.n + i] as number;
        return Number.isNaN(x) ? null : x;
      }
      return state.genericBaseValue(slot.param, i);
    }
    case 'pair': {
      const param = state.data.pairs.params[slot.param];
      const hit = param?.entries.find(([a, b]) => a === slot.from && b === slot.to);
      return hit ? hit[2] : (param?.default ?? null);
    }
    case 'world':
      return state.worldBase.get(slot.param) ?? null;
    case 'zone':
      return state.zoneBase.get(slot.param)?.get(slot.target) ?? null;
    case 'sim':
      return state.simBase.get(slot.param) ?? null;
  }
}

export function isSlotLocked(state: State, slot: Slot): boolean {
  if (slot.scope === 'country' && isCountryNumeric(slot.param)) {
    return state.isLocked(col(slot.param), countryIndex(state, slot));
  }
  return state.slotLocks.has(slotKey(slot));
}

function setLocked(state: State, slot: Slot, locked: boolean): void {
  if (slot.scope === 'country' && isCountryNumeric(slot.param)) {
    state.locked[col(slot.param) * state.n + countryIndex(state, slot)] = locked ? 1 : 0;
    return;
  }
  const key = slotKey(slot);
  if (locked) state.slotLocks.add(key);
  else state.slotLocks.delete(key);
}

/** Écrit une valeur dans un emplacement (verrou ignoré : commande de l'utilisateur). */
function writeSlot(state: State, slot: Slot, value: ParamValue): void {
  switch (slot.scope) {
    case 'country': {
      const i = countryIndex(state, slot);
      if (isCountryNumeric(slot.param)) {
        state.force(col(slot.param), i, typeof value === 'number' ? value : Number.NaN);
      } else {
        const locked = isSlotLocked(state, slot);
        if (locked) state.slotLocks.delete(slotKey(slot));
        state.writeGeneric(slot.param, i, value);
        if (locked) state.slotLocks.add(slotKey(slot));
      }
      return;
    }
    case 'pair': {
      const i = state.byId.get(slot.from) as number;
      const j = state.byId.get(slot.to) as number;
      const m = state.pairNum.get(slot.param);
      if (m !== undefined) {
        m[i * state.n + j] = typeof value === 'number' ? value : Number.NaN;
        return;
      }
      const table = state.pairGen.get(slot.param);
      if (table === undefined)
        throw new CommandError(`Paramètre bilatéral inconnu : ${slot.param}`);
      table.set(i * state.n + j, value);
      return;
    }
    case 'world':
      state.world.set(slot.param, value);
      return;
    case 'zone':
      state.zone.get(slot.param)?.set(slot.target, value);
      return;
    case 'sim':
      state.sim.set(slot.param, value);
      if (slot.param === 'sim.seed' && typeof value === 'number') {
        // Nouvelle graine : les flux aléatoires repartent de cette graine.
        state.seed = value >>> 0;
        state.rngs.clear();
      }
      return;
  }
}

export function captureSlot(state: State, slot: Slot): SlotState {
  return {
    slot,
    value: readSlot(state, slot),
    locked: isSlotLocked(state, slot),
    override: state.overrides.get(slotKey(slot)) ?? null,
  };
}

export function restoreSlot(state: State, s: SlotState): void {
  writeSlot(state, s.slot, s.value);
  setLocked(state, s.slot, s.locked);
  const key = slotKey(s.slot);
  if (s.override) state.overrides.set(key, s.override);
  else state.overrides.delete(key);
}

// ——— Application ———

export interface Applied {
  effects: Effect[];
  inverse: Inverse;
  coefficients?: { path: string; from: number; to: number }[];
}

function uniqueSlots(slots: Slot[]): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const s of slots) {
    const key = slotKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  if (out.length === 0) throw new CommandError('Aucun emplacement visé');
  return out;
}

function assign(
  state: State,
  slots: Slot[],
  seq: number,
  valueFor: (def: ParamDef, current: ParamValue, slot: Slot) => ParamValue,
): Applied {
  const effects: Effect[] = [];
  const before: SlotState[] = [];
  const plan = uniqueSlots(slots).map((slot) => {
    const def = slotDef(state, slot);
    const current = readSlot(state, slot);
    return { slot, def, value: coerceValue(def, valueFor(def, current, slot)), current };
  });
  for (const { slot, def, value, current } of plan) {
    before.push(captureSlot(state, slot));
    writeSlot(state, slot, value);
    // Un dérivé saisi est forcé : verrouillé pour court-circuiter son calcul.
    if (def.kind === 'derived') setLocked(state, slot, true);
    state.overrides.set(slotKey(slot), { tick: state.tick, seq });
    effects.push({ slot, from: current, to: readSlot(state, slot) });
  }
  return { effects, inverse: { slots: before } };
}

function numericSlots(state: State, slots: Slot[]): Slot[] {
  for (const slot of slots) {
    const def = slotDef(state, slot);
    if (def.valueType !== 'number')
      throw new CommandError(`${def.label} : paramètre non numérique`);
  }
  return slots;
}

export function applyCommand(state: State, command: Command, seq: number): Applied {
  switch (command.type) {
    case 'set':
      return assign(state, command.slots, seq, () => command.value);
    case 'adjust': {
      if (!Number.isFinite(command.amount)) throw new CommandError('Montant non fini');
      return assign(state, numericSlots(state, command.slots), seq, (_def, current) => {
        const x = typeof current === 'number' ? current : 0;
        return command.op === 'add' ? x + command.amount : x * command.amount;
      });
    }
    case 'reset': {
      const effects: Effect[] = [];
      const before: SlotState[] = [];
      for (const slot of uniqueSlots(command.slots)) {
        const def = slotDef(state, slot);
        before.push(captureSlot(state, slot));
        const from = readSlot(state, slot);
        const base = baseOf(state, slot);
        if (def.kind === 'derived') setLocked(state, slot, false);
        if (base !== null || def.kind !== 'derived') writeSlot(state, slot, base);
        state.overrides.delete(slotKey(slot));
        effects.push({ slot, from, to: readSlot(state, slot) });
      }
      return { effects, inverse: { slots: before } };
    }
    case 'lock': {
      const effects: Effect[] = [];
      const before: SlotState[] = [];
      for (const slot of uniqueSlots(command.slots)) {
        slotDef(state, slot);
        before.push(captureSlot(state, slot));
        setLocked(state, slot, command.locked);
        const value = readSlot(state, slot);
        effects.push({ slot, from: value, to: value });
      }
      return { effects, inverse: { slots: before } };
    }
    case 'addModifier': {
      const spec = checkModifier(command.modifier);
      const created: number[] = [];
      const effects: Effect[] = [];
      for (const slot of numericSlots(state, uniqueSlots(command.slots))) {
        if (slot.scope !== 'country' && slot.scope !== 'world') {
          throw new CommandError('Modificateurs : paramètres pays ou mondiaux');
        }
        const modifier: Modifier = {
          ...spec,
          id: state.nextModifierId++,
          slot,
          startTick: state.tick,
          seq,
          author: 'user',
        };
        state.modifiers.push(modifier);
        created.push(modifier.id);
        const value = readSlot(state, slot);
        effects.push({ slot, from: value, to: value, modifier: modifier.id });
      }
      state.indexModifiers();
      return { effects, inverse: { removeModifiers: created } };
    }
    case 'removeModifier': {
      const removed = state.modifiers.filter((m) => command.ids.includes(m.id));
      if (removed.length === 0) throw new CommandError('Modificateur introuvable (expiré ?)');
      state.modifiers = state.modifiers.filter((m) => !command.ids.includes(m.id));
      state.indexModifiers();
      return {
        effects: removed.map((m) => ({
          slot: m.slot,
          from: readSlot(state, m.slot),
          to: readSlot(state, m.slot),
          modifier: m.id,
        })),
        inverse: { addModifiers: removed },
      };
    }
    default:
      throw new CommandError(`Commande non applicable ici : ${command.type}`);
  }
}

export function checkModifier(spec: ModifierSpec): ModifierSpec {
  if (spec.op !== 'add' && spec.op !== 'mul')
    throw new CommandError('Modificateur : opération add ou mul');
  if (!Number.isFinite(spec.amount)) throw new CommandError('Modificateur : montant non fini');
  if (spec.op === 'mul' && spec.amount < 0)
    throw new CommandError('Modificateur : facteur négatif');
  if (!Number.isInteger(spec.durationDays) || spec.durationDays < 1 || spec.durationDays > 36500) {
    throw new CommandError('Modificateur : durée en jours (1 à 36 500)');
  }
  if (!['none', 'linear', 'exponential'].includes(spec.decay))
    throw new CommandError('Modificateur : décroissance inconnue');
  if (spec.halfLifeDays !== undefined && !(spec.halfLifeDays > 0)) {
    throw new CommandError('Modificateur : demi-vie positive');
  }
  const out: ModifierSpec = {
    op: spec.op,
    amount: spec.amount,
    durationDays: spec.durationDays,
    decay: spec.decay,
    label: String(spec.label ?? '').slice(0, 120) || 'Effet temporaire',
  };
  if (spec.halfLifeDays !== undefined) out.halfLifeDays = spec.halfLifeDays;
  return out;
}

export function applyInverse(state: State, inverse: Inverse): void {
  for (const s of [...(inverse.slots ?? [])].reverse()) restoreSlot(state, s);
  if (inverse.removeModifiers) {
    const ids = new Set(inverse.removeModifiers);
    state.modifiers = state.modifiers.filter((m) => !ids.has(m.id));
  }
  if (inverse.addModifiers) {
    const present = new Set(state.modifiers.map((m) => m.id));
    for (const m of inverse.addModifiers) if (!present.has(m.id)) state.modifiers.push(m);
    state.modifiers.sort((a, b) => a.id - b.id);
  }
  state.indexModifiers();
}
