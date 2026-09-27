/**
 * État du moteur (SPEC §6, §7) : valeurs de chaque paramètre du catalogue, vectorisées.
 *
 * - Paramètres pays numériques : un `Float64Array` de P × N valeurs (colonne par paramètre),
 *   en trois couches (SPEC §6.3) : `base` (donnée réelle), valeur courante (surcharges de
 *   l'utilisateur et évolution simulée) et valeur effective (modificateurs temporaires appliqués).
 *   Les systèmes lisent la valeur effective et écrivent la valeur courante ; un paramètre
 *   verrouillé ne peut plus être modifié par la simulation.
 * - Paramètres pays non numériques (catégories, listes, vecteurs, dates) : tableaux de valeurs.
 * - Paires : matrices N × N pour les paramètres numériques, tables creuses pour les autres.
 * - Monde, zones (détroits) et simulation : tables de valeurs.
 */
import {
  CATALOG,
  type CountriesBase,
  type EntityKind,
  type PairsBase,
  type ParamDef,
  type ParamValue,
  type WorldBaseFile,
} from '@geosim/shared';
import { Rng, type RngState } from './rng.ts';
import { slotKey, type Modifier } from './types.ts';

export const COUNTRY_NUMERIC: readonly ParamDef[] = CATALOG.filter(
  (d) => d.scope === 'country' && d.valueType === 'number',
);
export const COUNTRY_GENERIC: readonly ParamDef[] = CATALOG.filter(
  (d) => d.scope === 'country' && d.valueType !== 'number',
);
export const PAIR_NUMERIC: readonly ParamDef[] = CATALOG.filter(
  (d) => d.scope === 'pair' && d.valueType === 'number',
);
export const PAIR_GENERIC: readonly ParamDef[] = CATALOG.filter(
  (d) => d.scope === 'pair' && d.valueType !== 'number',
);
export const WORLD_PARAMS: readonly ParamDef[] = CATALOG.filter((d) => d.scope === 'world');
export const SIM_PARAMS: readonly ParamDef[] = CATALOG.filter((d) => d.scope === 'sim');
const ZONE_BY_ID = new Map(CATALOG.filter((d) => d.scope === 'zone').map((d) => [d.id, d]));

const COUNTRY_COL = new Map(COUNTRY_NUMERIC.map((d, k) => [d.id, k]));
const WORLD_BY_ID = new Map(WORLD_PARAMS.map((d) => [d.id, d]));
const COUNTRY_GEN = new Map(COUNTRY_GENERIC.map((d, k) => [d.id, k]));

/** Colonne d'un paramètre pays numérique ; lève une erreur pour un identifiant inconnu. */
export function col(id: string): number {
  const k = COUNTRY_COL.get(id);
  if (k === undefined) throw new Error(`Paramètre pays numérique inconnu : ${id}`);
  return k;
}

export function genericIndex(id: string): number {
  const k = COUNTRY_GEN.get(id);
  if (k === undefined) throw new Error(`Paramètre pays non numérique inconnu : ${id}`);
  return k;
}

export function isCountryNumeric(id: string): boolean {
  return COUNTRY_COL.has(id);
}

export interface EntityInfo {
  /** Index dans les tableaux du moteur (0 … N − 1). */
  index: number;
  id: string;
  /** Identifiant sur la carte (couches `owner` et `sovereign`). */
  mapIndex: number;
  nameFr: string;
  kind: EntityKind;
  region: string;
  income: string;
  /** Pays dont une faction ou une entité de facto se détache. */
  parent: string | null;
}

/** Données d'entrée du moteur : fichiers construits par `npm run data`. */
export interface EngineData {
  countries: CountriesBase;
  pairs: PairsBase;
  world: WorldBaseFile;
}

/** Identifiant des données (une capture ne se restaure que sur les mêmes données). */
export function dataId(data: EngineData): string {
  return `${data.countries.buildDate}|${data.countries.mapBuildId}`;
}

export interface OverrideInfo {
  tick: number;
  seq: number;
}

/** Poids d'un modificateur au tick donné (0 s'il n'a pas commencé ou s'il a expiré). */
export function modifierWeight(m: Modifier, tick: number): number {
  const age = tick - m.startTick;
  if (age < 0 || age >= m.durationDays) return 0;
  switch (m.decay) {
    case 'none':
      return 1;
    case 'linear':
      return 1 - age / m.durationDays;
    case 'exponential':
      return Math.pow(0.5, age / Math.max(1, m.halfLifeDays ?? m.durationDays / 3));
  }
}

export function clampTo(def: ParamDef, x: number): number {
  if (def.min !== undefined && x < def.min) return def.min;
  if (def.max !== undefined && x > def.max) return def.max;
  return x;
}

export class State {
  readonly n: number;
  readonly entities: EntityInfo[];
  readonly byId: Map<string, number>;
  readonly data: EngineData;
  tick = 0;
  seed: number;

  /** Valeurs courantes (P × N, colonne par paramètre). */
  readonly values: Float64Array;
  /** Valeurs effectives (modificateurs appliqués, bornées au catalogue). */
  readonly eff: Float64Array;
  /** Données réelles (NaN : absente) ; valeurs initiales calculées pour les dérivés. */
  readonly base: Float64Array;
  readonly locked: Uint8Array;
  private readonly cols: Float64Array[];
  private readonly effCols: Float64Array[];

  readonly generic: ParamValue[][];
  readonly genericBase: ParamValue[][];

  /** Paires numériques : matrice N × N (ligne i : de i vers j), NaN = non renseignée. */
  readonly pairNum = new Map<string, Float64Array>();
  /** Paires non numériques : valeurs différentes du défaut, indexées par i × N + j. */
  readonly pairGen = new Map<string, Map<number, ParamValue>>();
  /** Nombre de modifications de chaque paramètre bilatéral par commande (invalide les caches). */
  private readonly pairEdits = new Map<string, number>();
  readonly pairDefault = new Map<string, ParamValue>();

  readonly world = new Map<string, ParamValue>();
  readonly worldBase = new Map<string, ParamValue>();
  /** Paramètres de zone modifiables (statut des détroits) : paramètre → cible → valeur. */
  readonly zone = new Map<string, Map<string, ParamValue>>();
  readonly zoneBase = new Map<string, Map<string, ParamValue>>();
  readonly sim = new Map<string, ParamValue>();
  readonly simBase = new Map<string, ParamValue>();

  /** Dernière modification de l'utilisateur, par emplacement. */
  readonly overrides = new Map<string, OverrideInfo>();
  /** Verrous hors paramètres pays numériques (clés d'emplacement). */
  readonly slotLocks = new Set<string>();
  modifiers: Modifier[] = [];
  nextModifierId = 1;
  /** Emplacements pays numériques (p × N + i) qui portent au moins un modificateur. */
  private modifiedSlots = new Set<number>();

  /** États internes des systèmes (un tableau de N valeurs par nom), inclus dans le hash. */
  readonly internal = new Map<string, Float64Array>();
  readonly worldInternal = new Map<string, number>();
  readonly rngs = new Map<string, Rng>();

  constructor(data: EngineData, seed: number) {
    this.data = data;
    this.seed = seed >>> 0;
    const records = [...data.countries.entities].sort((a, b) => a.index - b.index);
    this.n = records.length;
    this.entities = records.map((r, i) => ({
      index: i,
      id: r.id,
      mapIndex: r.index,
      nameFr: r.nameFr,
      kind: r.kind,
      region: r.region,
      income: r.income,
      parent: r.parent,
    }));
    this.byId = new Map(this.entities.map((e) => [e.id, e.index]));
    const P = COUNTRY_NUMERIC.length;
    const N = this.n;
    this.values = new Float64Array(P * N).fill(Number.NaN);
    this.eff = new Float64Array(P * N);
    this.base = new Float64Array(P * N).fill(Number.NaN);
    this.locked = new Uint8Array(P * N);
    this.cols = COUNTRY_NUMERIC.map((_, p) => this.values.subarray(p * N, (p + 1) * N));
    this.effCols = COUNTRY_NUMERIC.map((_, p) => this.eff.subarray(p * N, (p + 1) * N));
    this.generic = COUNTRY_GENERIC.map(() => new Array<ParamValue>(N).fill(null));
    this.genericBase = COUNTRY_GENERIC.map(() => new Array<ParamValue>(N).fill(null));

    records.forEach((r, i) => {
      for (const [id, resolved] of Object.entries(r.params)) {
        const p = COUNTRY_COL.get(id);
        if (p !== undefined) {
          const x = typeof resolved.value === 'number' ? resolved.value : Number.NaN;
          this.values[p * N + i] = x;
          this.base[p * N + i] = x;
          continue;
        }
        const g = COUNTRY_GEN.get(id);
        if (g !== undefined) {
          (this.generic[g] as ParamValue[])[i] = resolved.value;
          (this.genericBase[g] as ParamValue[])[i] = resolved.value;
        }
      }
    });

    for (const def of PAIR_NUMERIC) {
      const m = new Float64Array(N * N);
      const param = data.pairs.params[def.id];
      const fallback = typeof param?.default === 'number' ? param.default : Number.NaN;
      m.fill(fallback);
      for (const [a, b, v] of param?.entries ?? []) {
        const i = this.byId.get(a);
        const j = this.byId.get(b);
        if (i === undefined || j === undefined) continue;
        m[i * N + j] = typeof v === 'number' ? v : Number.NaN;
      }
      this.pairNum.set(def.id, m);
    }
    for (const def of PAIR_GENERIC) {
      const param = data.pairs.params[def.id];
      this.pairDefault.set(def.id, param?.default ?? null);
      const table = new Map<number, ParamValue>();
      for (const [a, b, v] of param?.entries ?? []) {
        const i = this.byId.get(a);
        const j = this.byId.get(b);
        if (i !== undefined && j !== undefined) table.set(i * N + j, v);
      }
      this.pairGen.set(def.id, table);
    }

    for (const def of WORLD_PARAMS) {
      const v = data.world.params[def.id]?.value ?? null;
      this.world.set(def.id, v);
      this.worldBase.set(def.id, v);
    }
    const status = new Map<string, ParamValue>();
    const capacity = new Map<string, ParamValue>();
    const flow = new Map<string, ParamValue>();
    for (const c of data.world.chokepoints) {
      status.set(c.id, c.status.value);
      // Capacité de passage : trafic observé d'un passage contesté ou fermé ; un passage ouvert
      // est libre (son trafic observé résulte des détournements : il est calculé, flux).
      capacity.set(
        c.id,
        c.status.value === 'open' ? 100 : Math.max(0, Math.min(100, c.status.traffic_pct)),
      );
      flow.set(c.id, null);
    }
    for (const [id, table] of [
      ['zone.chokepoint_status', status],
      ['zone.chokepoint_traffic', capacity],
      ['zone.chokepoint_flow', flow],
    ] as const) {
      this.zone.set(id, table);
      this.zoneBase.set(id, new Map(table));
    }
  }

  // ——— Paramètres pays numériques ———

  /** Valeurs courantes d'un paramètre (vue sur le tableau d'état). */
  v(p: number): Float64Array {
    return this.cols[p] as Float64Array;
  }

  /** Valeurs effectives d'un paramètre (lecture par les autres systèmes). */
  e(p: number): Float64Array {
    return this.effCols[p] as Float64Array;
  }

  isLocked(p: number, i: number): boolean {
    return this.locked[p * this.n + i] === 1;
  }

  /**
   * Écriture d'une valeur par la simulation : ignorée si l'emplacement est verrouillé, bornée à
   * la plage du catalogue. Une valeur non finie est une erreur de modèle : elle arrête le pas.
   */
  write(p: number, i: number, x: number): void {
    if (this.locked[p * this.n + i] === 1) return;
    const def = COUNTRY_NUMERIC[p] as ParamDef;
    if (!Number.isFinite(x)) {
      const e = this.entities[i];
      throw new Error(`Valeur non finie pour ${def.id} (${e?.id ?? i}) au tick ${this.tick}`);
    }
    this.values[p * this.n + i] = clampTo(def, x);
  }

  /**
   * Valeur effective d'un emplacement recalculée à l'instant : un système qui relit une valeur
   * qu'il vient d'écrire dans le même pas y voit ses modificateurs appliqués.
   */
  effNow(p: number, i: number): number {
    const k = p * this.n + i;
    const x = this.values[k] as number;
    if (!this.modifiedSlots.has(k)) return x;
    let mul = 1;
    let add = 0;
    for (const m of this.modifiers) {
      if (m.slot.scope !== 'country' || this.byId.get(m.slot.entity) !== i) continue;
      if (COUNTRY_COL.get(m.slot.param) !== p) continue;
      const w = modifierWeight(m, this.tick);
      if (m.op === 'mul') mul *= 1 + (m.amount - 1) * w;
      else add += m.amount * w;
    }
    return clampTo(COUNTRY_NUMERIC[p] as ParamDef, x * mul + add);
  }

  /** Écriture forcée (commande de l'utilisateur, initialisation), verrou compris. */
  force(p: number, i: number, x: number): void {
    const def = COUNTRY_NUMERIC[p] as ParamDef;
    this.values[p * this.n + i] = Number.isFinite(x) ? clampTo(def, x) : Number.NaN;
  }

  // ——— Paramètres pays non numériques ———

  genericValue(id: string, i: number): ParamValue {
    return (this.generic[genericIndex(id)] as ParamValue[])[i] ?? null;
  }

  setGenericBase(id: string, i: number, v: ParamValue): void {
    (this.genericBase[genericIndex(id)] as ParamValue[])[i] = v;
  }

  genericBaseValue(id: string, i: number): ParamValue {
    return (this.genericBase[genericIndex(id)] as ParamValue[])[i] ?? null;
  }

  /** Écriture par la simulation (ignorée si verrouillée). */
  writeGeneric(id: string, i: number, v: ParamValue): void {
    const e = this.entities[i];
    if (e === undefined) return;
    if (this.slotLocks.has(slotKey({ scope: 'country', param: id, entity: e.id }))) return;
    (this.generic[genericIndex(id)] as ParamValue[])[i] = v;
  }

  // ——— Paires ———

  pairMatrix(id: string): Float64Array {
    const m = this.pairNum.get(id);
    if (m === undefined) throw new Error(`Paramètre bilatéral numérique inconnu : ${id}`);
    return m;
  }

  /** Révision d'un paramètre bilatéral : change à chaque modification par une commande. */
  pairVersionOf(id: string): number {
    return this.pairEdits.get(id) ?? 0;
  }

  touchPair(id: string): void {
    this.pairEdits.set(id, (this.pairEdits.get(id) ?? 0) + 1);
  }

  pairValue(id: string, i: number, j: number): ParamValue {
    const m = this.pairNum.get(id);
    if (m !== undefined) {
      const x = m[i * this.n + j] as number;
      return Number.isNaN(x) ? null : x;
    }
    const table = this.pairGen.get(id);
    if (table === undefined) throw new Error(`Paramètre bilatéral inconnu : ${id}`);
    const v = table.get(i * this.n + j);
    return v === undefined ? (this.pairDefault.get(id) ?? null) : v;
  }

  // ——— Monde ———

  worldNumber(id: string): number {
    const v = this.world.get(id);
    return typeof v === 'number' ? v : Number.NaN;
  }

  worldVector(id: string): Record<string, number> {
    const v = this.world.get(id);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  /** Écriture par la simulation d'un paramètre mondial (ignorée si verrouillé, bornée). */
  writeWorld(id: string, v: ParamValue): void {
    if (this.slotLocks.has(`w|${id}`)) return;
    const def = WORLD_BY_ID.get(id);
    if (typeof v === 'number') {
      if (!Number.isFinite(v))
        throw new Error(`Valeur mondiale non finie pour ${id} au tick ${this.tick}`);
      this.world.set(id, def ? clampTo(def, v) : v);
      return;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, number> = {};
      for (const [k, x] of Object.entries(v)) {
        if (!Number.isFinite(x))
          throw new Error(`Valeur mondiale non finie pour ${id}.${k} au tick ${this.tick}`);
        out[k] = def ? clampTo(def, x) : x;
      }
      this.world.set(id, out);
      return;
    }
    this.world.set(id, v);
  }

  /** Valeur effective d'un paramètre mondial numérique (modificateurs appliqués). */
  worldEff(id: string): number {
    let x = this.worldNumber(id);
    let mul = 1;
    let add = 0;
    for (const m of this.modifiers) {
      if (m.slot.scope !== 'world' || m.slot.param !== id) continue;
      const w = modifierWeight(m, this.tick);
      if (m.op === 'mul') mul *= 1 + (m.amount - 1) * w;
      else add += m.amount * w;
    }
    x = x * mul + add;
    const def = WORLD_BY_ID.get(id);
    return def ? clampTo(def, x) : x;
  }

  // ——— Zones ———

  zoneValue(id: string, target: string): ParamValue {
    return this.zone.get(id)?.get(target) ?? null;
  }

  /** Écriture par la simulation d'un paramètre de zone (ignorée si verrouillé, bornée). */
  writeZone(id: string, target: string, v: ParamValue): void {
    const table = this.zone.get(id);
    if (table === undefined || !table.has(target)) return;
    if (this.slotLocks.has(`z|${id}|${target}`)) return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v))
        throw new Error(`Valeur de zone non finie pour ${id} (${target}) au tick ${this.tick}`);
      const def = ZONE_BY_ID.get(id);
      table.set(target, def ? clampTo(def, v) : v);
      return;
    }
    table.set(target, v);
  }

  // ——— Aléa et états internes ———

  /** Flux aléatoire d'un système (créé à la demande, dérivé de la graine et du nom). */
  rng(stream: string): Rng {
    let r = this.rngs.get(stream);
    if (r === undefined) {
      r = Rng.forStream(this.seed, stream);
      this.rngs.set(stream, r);
    }
    return r;
  }

  rngStates(): Record<string, RngState> {
    const out: Record<string, RngState> = {};
    for (const name of [...this.rngs.keys()].sort())
      out[name] = (this.rngs.get(name) as Rng).getState();
    return out;
  }

  /** Tableau interne d'un système (N valeurs par défaut), créé rempli de `init` s'il n'existe pas. */
  internalArray(name: string, init = 0, length = this.n): Float64Array {
    let a = this.internal.get(name);
    if (a === undefined) {
      a = new Float64Array(length).fill(init);
      this.internal.set(name, a);
    }
    return a;
  }

  // ——— Couches de valeur ———

  /** Recalcule les valeurs effectives : copie des valeurs courantes, puis modificateurs. */
  refreshEffective(): void {
    this.eff.set(this.values);
    const N = this.n;
    const mul = new Map<number, number>();
    const add = new Map<number, number>();
    for (const m of this.modifiers) {
      if (m.slot.scope !== 'country') continue;
      const p = COUNTRY_COL.get(m.slot.param);
      const i = this.byId.get(m.slot.entity);
      if (p === undefined || i === undefined) continue;
      const w = modifierWeight(m, this.tick);
      const k = p * N + i;
      if (m.op === 'mul') mul.set(k, (mul.get(k) ?? 1) * (1 + (m.amount - 1) * w));
      else add.set(k, (add.get(k) ?? 0) + m.amount * w);
    }
    for (const k of this.modifiedSlots) {
      const def = COUNTRY_NUMERIC[Math.floor(k / N)] as ParamDef;
      const x = (this.eff[k] as number) * (mul.get(k) ?? 1) + (add.get(k) ?? 0);
      this.eff[k] = clampTo(def, x);
    }
  }

  /** Recense les emplacements modifiés (après ajout, retrait ou expiration de modificateurs). */
  indexModifiers(): void {
    this.modifiedSlots = new Set();
    for (const m of this.modifiers) {
      if (m.slot.scope !== 'country') continue;
      const p = COUNTRY_COL.get(m.slot.param);
      const i = this.byId.get(m.slot.entity);
      if (p !== undefined && i !== undefined) this.modifiedSlots.add(p * this.n + i);
    }
  }

  /** Retire les modificateurs arrivés à échéance ; renvoie ceux qui ont expiré. */
  expireModifiers(): Modifier[] {
    const expired = this.modifiers.filter((m) => this.tick - m.startTick >= m.durationDays);
    if (expired.length > 0) {
      this.modifiers = this.modifiers.filter((m) => this.tick - m.startTick < m.durationDays);
      this.indexModifiers();
    }
    return expired;
  }

  hasModifiers(): boolean {
    return this.modifiers.length > 0;
  }
}
