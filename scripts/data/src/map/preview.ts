/**
 * Aperçus PNG de la carte (contrôle visuel du pipeline) : politique, terrain et biomes,
 * zones maritimes et routes, infrastructures.
 */
import { Biome, Infra, MapFlag, Terrain, isLand, type MapLayers } from '@geosim/shared';

type Rgb = [number, number, number];

const SEA: Rgb = [18, 32, 52];
const LAKE: Rgb = [40, 70, 105];
const OFF_GLOBE: Rgb = [8, 10, 14];
const NEUTRAL: Rgb = [150, 150, 150];

/** Couleur stable d'un identifiant (angle d'or sur la teinte). */
export function colorOf(index: number, saturation = 0.45, lightness = 0.55): Rgb {
  const hue = (index * 137.508) % 360;
  return hslToRgb(hue, saturation, lightness);
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function put(rgb: Uint8Array, p: number, c: Rgb): void {
  rgb[3 * p] = c[0];
  rgb[3 * p + 1] = c[1];
  rgb[3 * p + 2] = c[2];
}

function water(terrain: number): Rgb {
  return terrain === Terrain.Lake ? LAKE : SEA;
}

export function politicalPreview(layers: MapLayers, globe: Uint8Array): Uint8Array {
  const n = globe.length;
  const rgb = new Uint8Array(n * 3);
  for (let p = 0; p < n; p++) {
    if (!globe[p]) {
      put(rgb, p, OFF_GLOBE);
      continue;
    }
    const t = layers.terrain[p] as number;
    if (!isLand(t)) {
      put(rgb, p, (layers.flags[p] as number) & MapFlag.Strait ? [200, 60, 60] : water(t));
      continue;
    }
    const owner = layers.owner[p] as number;
    let c = owner === 0 ? NEUTRAL : colorOf(owner);
    const f = layers.flags[p] as number;
    if (f & MapFlag.Border)
      c = [Math.round(c[0] * 0.55), Math.round(c[1] * 0.55), Math.round(c[2] * 0.55)];
    if (f & (MapFlag.Capital | MapFlag.MajorCity))
      c = f & MapFlag.Capital ? [255, 255, 255] : [235, 235, 200];
    put(rgb, p, c);
  }
  return rgb;
}

const BIOME_COLORS: Record<number, Rgb> = {
  [Biome.None]: NEUTRAL,
  [Biome.TemperateForest]: [70, 120, 60],
  [Biome.TropicalForest]: [30, 100, 45],
  [Biome.SteppeSavanna]: [175, 170, 95],
  [Biome.Desert]: [220, 195, 140],
  [Biome.Tundra]: [150, 160, 140],
  [Biome.Ice]: [235, 240, 245],
  [Biome.Wetland]: [80, 140, 130],
};

const TERRAIN_SHADE: Record<number, number> = {
  [Terrain.Plain]: 1,
  [Terrain.Hills]: 0.85,
  [Terrain.Mountain]: 0.65,
  [Terrain.HighMountain]: 0.5,
};

/** Biomes assombris selon la classe de terrain, fleuves en bleu. */
export function terrainPreview(layers: MapLayers, globe: Uint8Array): Uint8Array {
  const n = globe.length;
  const rgb = new Uint8Array(n * 3);
  for (let p = 0; p < n; p++) {
    if (!globe[p]) {
      put(rgb, p, OFF_GLOBE);
      continue;
    }
    const t = layers.terrain[p] as number;
    if (!isLand(t)) {
      put(rgb, p, water(t));
      continue;
    }
    if ((layers.flags[p] as number) & MapFlag.River) {
      put(rgb, p, [60, 110, 200]);
      continue;
    }
    const base = BIOME_COLORS[layers.biome[p] as number] ?? NEUTRAL;
    const k = TERRAIN_SHADE[t] ?? 1;
    put(rgb, p, [Math.round(base[0] * k), Math.round(base[1] * k), Math.round(base[2] * k)]);
  }
  return rgb;
}

/** Zones maritimes colorées, terres en gris, routes maritimes superposées (pixels donnés). */
export function seaPreview(
  layers: MapLayers,
  globe: Uint8Array,
  routePixels: Uint8Array,
): Uint8Array {
  const n = globe.length;
  const rgb = new Uint8Array(n * 3);
  for (let p = 0; p < n; p++) {
    if (!globe[p]) put(rgb, p, OFF_GLOBE);
    else if (routePixels[p]) put(rgb, p, routePixels[p] === 2 ? [255, 80, 80] : [255, 230, 120]);
    else if (isLand(layers.terrain[p] as number)) put(rgb, p, [70, 70, 70]);
    else if ((layers.flags[p] as number) & MapFlag.Strait) put(rgb, p, [255, 60, 60]);
    else if (layers.seaZone[p] === 0) put(rgb, p, [0, 0, 0]);
    else put(rgb, p, colorOf(layers.seaZone[p] as number, 0.5, 0.35));
  }
  return rgb;
}

/** Infrastructures : urbain en blanc, routes en orange, rail en rouge, ports en cyan. */
export function infrastructurePreview(layers: MapLayers, globe: Uint8Array): Uint8Array {
  const n = globe.length;
  const rgb = new Uint8Array(n * 3);
  for (let p = 0; p < n; p++) {
    if (!globe[p]) {
      put(rgb, p, OFF_GLOBE);
      continue;
    }
    const t = layers.terrain[p] as number;
    if (!isLand(t)) {
      put(rgb, p, water(t));
      continue;
    }
    const f = layers.flags[p] as number;
    const infra = layers.infrastructure[p] as number;
    const u = layers.urban[p] as number;
    let c: Rgb = [45, 45, 45];
    if (infra & Infra.Road) c = [150, 100, 40];
    if (infra & Infra.MajorRoad) c = [230, 150, 50];
    if (infra & Infra.Rail) c = [200, 50, 50];
    if (u > 0) c = [Math.min(255, 120 + u), Math.min(255, 120 + u), Math.min(255, 120 + u)];
    if (f & MapFlag.Port) c = [0, 230, 230];
    if (f & MapFlag.Airport) c = [230, 0, 230];
    put(rgb, p, c);
  }
  return rgb;
}
