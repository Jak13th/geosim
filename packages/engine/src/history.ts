/**
 * Historique mensuel (SPEC §7.5) : valeurs effectives des paramètres pays suivis (ceux que les
 * systèmes font évoluer, et ceux que l'utilisateur a modifiés) et des paramètres mondiaux,
 * échantillonnées au départ puis à chaque pas mensuel. Simple précision : usage graphique.
 */
import { COUNTRY_NUMERIC, WORLD_PARAMS, col, type State } from './state.ts';

export interface HistorySnapshot {
  ticks: number[];
  /** Paramètre pays → valeurs [mois × N]. */
  country: Record<string, Float32Array>;
  /** Série mondiale (`world.oil_price`, `world.gas_price.europe`…) → valeurs par mois. */
  world: Record<string, number[]>;
}

/** Séries mondiales : paramètres numériques et composantes des vecteurs de prix. */
export function worldSeriesKeys(state: State): string[] {
  const keys: string[] = [];
  for (const def of WORLD_PARAMS) {
    if (def.valueType === 'number') keys.push(def.id);
    else if (def.valueType === 'vector') {
      for (const k of Object.keys(state.worldVector(def.id)).sort()) keys.push(`${def.id}.${k}`);
    }
  }
  return keys;
}

function worldValue(state: State, key: string): number {
  if (state.world.has(key)) {
    const v = state.world.get(key);
    return typeof v === 'number' ? state.worldEff(key) : Number.NaN;
  }
  const dot = key.lastIndexOf('.');
  const v = state.worldVector(key.slice(0, dot))[key.slice(dot + 1)];
  return typeof v === 'number' ? v : Number.NaN;
}

export class History {
  ticks: number[] = [];
  private readonly n: number;
  private capacity = 0;
  private readonly country = new Map<number, Float32Array>();
  private readonly world = new Map<string, number[]>();

  constructor(n: number) {
    this.n = n;
  }

  get months(): number {
    return this.ticks.length;
  }

  isTracked(p: number): boolean {
    return this.country.has(p);
  }

  trackedParams(): string[] {
    return [...this.country.keys()].map((p) => COUNTRY_NUMERIC[p]?.id ?? '').filter(Boolean);
  }

  /**
   * Suit un paramètre à partir de maintenant ; les mois passés prennent sa valeur actuelle
   * (appelé juste avant qu'une commande ne la modifie).
   */
  track(state: State, p: number): void {
    if (this.country.has(p)) return;
    const series = new Float32Array(Math.max(1, this.capacity) * this.n);
    const current = state.e(p);
    for (let t = 0; t < this.months; t++) series.set(current, t * this.n);
    this.country.set(p, series);
  }

  private grow(): void {
    const next = Math.max(16, this.capacity * 2);
    for (const [p, series] of this.country) {
      const bigger = new Float32Array(next * this.n);
      bigger.set(series.subarray(0, this.capacity * this.n));
      this.country.set(p, bigger);
    }
    this.capacity = next;
  }

  record(state: State): void {
    if (this.months >= this.capacity) this.grow();
    const t = this.months;
    for (const [p, series] of this.country) series.set(state.e(p), t * this.n);
    for (const key of worldSeriesKeys(state)) {
      let s = this.world.get(key);
      if (s === undefined) {
        s = new Array<number>(t).fill(Number.NaN);
        this.world.set(key, s);
      }
      s.push(worldValue(state, key));
    }
    this.ticks.push(state.tick);
  }

  /** Série d'un paramètre pays pour une entité (null s'il n'est pas suivi). */
  series(paramId: string, i: number): Float32Array | null {
    const s = this.country.get(col(paramId));
    if (s === undefined) return null;
    const out = new Float32Array(this.months);
    for (let t = 0; t < this.months; t++) out[t] = s[t * this.n + i] as number;
    return out;
  }

  worldSeries(key: string): number[] | null {
    return this.world.get(key)?.slice() ?? null;
  }

  worldKeys(): string[] {
    return [...this.world.keys()];
  }

  snapshot(): HistorySnapshot {
    const country: Record<string, Float32Array> = {};
    for (const [p, s] of this.country) {
      const id = COUNTRY_NUMERIC[p]?.id;
      if (id) country[id] = s.slice(0, this.months * this.n);
    }
    const world: Record<string, number[]> = {};
    for (const [k, s] of this.world) world[k] = s.slice();
    return { ticks: this.ticks.slice(), country, world };
  }

  static restore(n: number, snap: HistorySnapshot): History {
    const h = new History(n);
    h.ticks = snap.ticks.slice();
    h.capacity = Math.max(16, h.ticks.length);
    for (const [id, s] of Object.entries(snap.country)) {
      const series = new Float32Array(h.capacity * n);
      series.set(s.subarray(0, h.ticks.length * n));
      h.country.set(col(id), series);
    }
    for (const [k, s] of Object.entries(snap.world)) h.world.set(k, s.slice());
    return h;
  }
}
