/**
 * Couleurs de la carte : palette politique (deux voisins n'ont jamais la même couleur), rampes
 * perceptuelles pour les indicateurs, palette catégorielle.
 */

export type Rgb = [number, number, number];

function srgbGamma(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function linear(x: number): number {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** OKLCH (Ottosson, 2020) → sRGB 0–255. `h` en degrés. */
export function oklch(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [
    Math.round(srgbGamma(r) * 255),
    Math.round(srgbGamma(g) * 255),
    Math.round(srgbGamma(bl) * 255),
  ];
}

export function hex(color: string): Rgb {
  const v = Number.parseInt(color.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function toCss([r, g, b]: Rgb): string {
  return `rgb(${r} ${g} ${b})`;
}

/** Interpolation en lumière linéaire entre des jalons régulièrement espacés. */
export function ramp(stops: readonly string[]): (t: number) => Rgb {
  const rgb = stops.map((s) => hex(s).map((x) => linear(x / 255)) as Rgb);
  return (t: number) => {
    const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (rgb.length - 1);
    const i = Math.min(rgb.length - 2, Math.floor(x));
    const f = x - i;
    const a = rgb[i] as Rgb;
    const b = rgb[i + 1] as Rgb;
    return [0, 1, 2].map((k) =>
      Math.round(srgbGamma((a[k] as number) * (1 - f) + (b[k] as number) * f) * 255),
    ) as Rgb;
  };
}

/** Rampe séquentielle (viridis) : lisible sur fond sombre, ordonnée en luminance. */
export const SEQUENTIAL = ramp([
  '#440154',
  '#482878',
  '#3e4989',
  '#31688e',
  '#26828e',
  '#1f9e89',
  '#35b779',
  '#6ece58',
  '#b5de2b',
  '#fde725',
]);

/** Rampe de densité (magma) : du noir au jaune pâle. */
export const DENSITY = ramp([
  '#000004',
  '#1c1044',
  '#4f127b',
  '#812581',
  '#b5367a',
  '#e55064',
  '#fb8761',
  '#fec287',
  '#fcfdbf',
]);

/** Rampe divergente rouge ↔ gris ↔ vert (relations). */
export const DIVERGING = ramp([
  '#b2182b',
  '#d6604d',
  '#f4a582',
  '#8e9298',
  '#a6dba0',
  '#5aae61',
  '#1b7837',
]);

/** Palette catégorielle (catégories, blocs), contrastée sur fond sombre. */
export const CATEGORICAL: readonly Rgb[] = [
  '#4e9ee8',
  '#f28e2b',
  '#59c77a',
  '#e15759',
  '#b07aa1',
  '#edc948',
  '#76b7b2',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
  '#8cd17d',
  '#d4a6c8',
].map(hex);

/** Couleur « sans donnée » des choroplèthes. */
export const NO_DATA: Rgb = [58, 64, 72];

/**
 * Teintes politiques : 10 teintes × 2 luminosités, douces sur l'océan sombre (inspiration
 * OpenFront : aplats clairs, bordures plus claires encore).
 */
export const POLITICAL: readonly Rgb[] = (() => {
  const out: Rgb[] = [];
  for (let k = 0; k < 10; k++) out.push(oklch(0.74, 0.11, 18 + k * 36));
  for (let k = 0; k < 10; k++) out.push(oklch(0.62, 0.1, 36 + k * 36));
  return out;
})();

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Coloration gloutonne (Welsh-Powell) : entités triées par nombre de voisins décroissant ; chacune
 * prend la première couleur libre à partir d'une couleur préférée dérivée de son code (stable
 * d'un build à l'autre). Renvoie l'indice de couleur par code d'entité.
 */
export function colorEntities(
  ids: readonly string[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
  colorCount: number,
): Map<string, number> {
  const order = [...ids].sort(
    (a, b) =>
      (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const color = new Map<string, number>();
  for (const id of order) {
    const used = new Set<number>();
    for (const n of neighbors.get(id) ?? []) {
      const c = color.get(n);
      if (c !== undefined) used.add(c);
    }
    const start = hashId(id) % colorCount;
    let chosen = start;
    for (let k = 0; k < colorCount; k++) {
      const c = (start + k) % colorCount;
      if (!used.has(c)) {
        chosen = c;
        break;
      }
    }
    color.set(id, chosen);
  }
  return color;
}

/** Palette RGBA indexée par identifiant d'entité, au format de la texture (256 par ligne). */
export class PaletteBuffer {
  readonly rows: number;
  readonly data: Uint8Array;
  constructor(size: number) {
    this.rows = Math.max(1, Math.ceil(size / 256));
    this.data = new Uint8Array(this.rows * 256 * 4);
  }
  set(index: number, [r, g, b]: Rgb, alpha = 255): void {
    const o = index * 4;
    this.data[o] = r;
    this.data[o + 1] = g;
    this.data[o + 2] = b;
    this.data[o + 3] = alpha;
  }
  fill(rgb: Rgb, alpha = 255): void {
    for (let i = 0; i < this.rows * 256; i++) this.set(i, rgb, alpha);
  }
}
