/**
 * Générateur pseudo-aléatoire à graine : xoshiro128** (Blackman et Vigna, 2018).
 *
 * Seule source d'aléa du moteur (CLAUDE.md, règle 2) : jamais `Math.random()`.
 * Chaque système reçoit son propre flux, dérivé de la graine et du nom du système,
 * pour qu'un tirage supplémentaire dans un système ne décale pas les tirages des autres.
 * L'état (4 entiers de 32 bits) se sauvegarde et se restaure pour les captures.
 */

export type RngState = readonly [number, number, number, number];

const TWO_POW_32 = 4294967296;

/** Mélangeur SplitMix32 : sert à étaler une graine sur les 128 bits d'état. */
function splitMix32(x: number): number {
  let z = (x + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** Hachage FNV-1a 32 bits d'une chaîne (UTF-16), pour nommer les flux. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Graine d'un flux nommé (ex. `economy`), dérivée de la graine de la partie. */
export function deriveSeed(seed: number, stream: string): number {
  return splitMix32((seed ^ fnv1a32(stream)) >>> 0);
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    // Quatre sorties SplitMix32 successives : graines voisines → états décorrélés.
    const x = seed >>> 0;
    this.s0 = splitMix32(x);
    this.s1 = splitMix32((x + 0x9e3779b9) >>> 0);
    this.s2 = splitMix32((x + 2 * 0x9e3779b9) >>> 0);
    this.s3 = splitMix32((x + 3 * 0x9e3779b9) >>> 0);
    // L'état nul est le seul état interdit de xoshiro.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Recrée un générateur à partir d'un état sauvegardé. */
  static fromState(state: RngState): Rng {
    const rng = new Rng(0);
    rng.setState(state);
    return rng;
  }

  /** Flux indépendant pour un système donné. */
  static forStream(seed: number, stream: string): Rng {
    return new Rng(deriveSeed(seed, stream));
  }

  getState(): RngState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  setState(state: RngState): void {
    const [a, b, c, d] = state;
    if ((a | b | c | d) === 0) throw new Error('État nul interdit pour xoshiro128**');
    this.s0 = a >>> 0;
    this.s1 = b >>> 0;
    this.s2 = c >>> 0;
    this.s3 = d >>> 0;
  }

  /** Entier uniforme sur [0, 2^32). */
  nextU32(): number {
    const s1 = this.s1;
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ s1) >>> 0;
    this.s1 = (s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Réel uniforme sur [0, 1). */
  nextFloat(): number {
    return this.nextU32() / TWO_POW_32;
  }

  /** Entier uniforme sur [0, n). Biais inférieur à n / 2^32, négligeable ici. */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n <= 0) throw new RangeError(`nextInt : n invalide (${n})`);
    return Math.floor(this.nextFloat() * n);
  }

  /** Tirage de Bernoulli de probabilité p. */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  /** Loi normale N(mean, sd) par Box-Muller (un seul des deux tirages est gardé : état simple). */
  nextNormal(mean = 0, sd = 1): number {
    const u1 = 1 - this.nextFloat(); // ]0, 1] : évite log(0)
    const u2 = this.nextFloat();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Tirage uniforme sur [0, 1) désigné par une clé (ex. `election|FRA|2027-04-11`) : il ne dépend que
 * de la graine et de la clé, pas des autres tirages ni de leur ordre. Les événements rares à date
 * variable (élections, coups d'État…) gardent ainsi leurs tirages quand le reste change (nombres
 * aléatoires communs), sans état à sauvegarder.
 */
export function keyedUniform(seed: number, key: string): number {
  return Rng.forStream(seed, key).nextFloat();
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
