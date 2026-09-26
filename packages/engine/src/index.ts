/**
 * Moteur de simulation GeoSim : TypeScript pur, sans DOM ni API propre à Node.
 * Il tourne à l'identique dans un Web Worker (interface) et dans la CLI.
 */
export { Rng, deriveSeed, fnv1a32, type RngState } from './rng.ts';
export {
  DEFINITIONAL_DERIVATIONS,
  derivationOf,
  deriveValue,
  weakestConfidence,
  type Derivation,
} from './derived.ts';
export {
  Calendar,
  civilFromDays,
  daysFromCivil,
  formatIsoDate,
  parseIsoDate,
  type CivilDate,
} from './calendar.ts';
export { Model, checkModel, coefficientTree } from './model.ts';
export {
  COUNTRY_GENERIC,
  COUNTRY_NUMERIC,
  PAIR_GENERIC,
  PAIR_NUMERIC,
  SIM_PARAMS,
  WORLD_PARAMS,
  col,
  dataId,
  isCountryNumeric,
  modifierWeight,
  type EngineData,
  type EntityInfo,
  type OverrideInfo,
} from './state.ts';
export {
  Engine,
  ENGINE_VERSION,
  REQUIRED_COEFFICIENTS,
  SIMULATED_PARAMS,
  SYSTEMS,
  type EngineOptions,
  type EngineSnapshot,
} from './engine.ts';
export {
  CommandError,
  baseOf,
  isSlotLocked,
  readSlot,
  slotLockedReason,
  type Inverse,
  type SlotState,
} from './commands.ts';
export { History, worldSeriesKeys, type HistorySnapshot } from './history.ts';
export { Hasher, canonicalJson, hashState } from './hash.ts';
export { NUMERAIRE } from './constants.ts';
export { checkInvariants } from './invariants.ts';
export { fromBase64, parseSnapshot, serializeSnapshot, toBase64 } from './codec.ts';
export { GAS_ZONES, METALS, gasZoneOf } from './systems/markets.ts';
export {
  slotFromKey,
  slotKey,
  type Author,
  type Command,
  type CommandType,
  type Effect,
  type Factor,
  type JournalEntry,
  type Modifier,
  type ModifierDecay,
  type ModifierSpec,
  type Slot,
} from './types.ts';
