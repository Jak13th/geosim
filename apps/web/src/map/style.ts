/**
 * Couleurs fixes de la carte, partagées par le shader (uniformes) et les légendes.
 */
import { Biome, Terrain } from '@geosim/shared';
import { hex, type Rgb } from './colors.ts';

export const STYLE = {
  space: hex('#080c12'),
  ocean: hex('#101c2b'),
  shore: hex('#1a2c42'),
  lake: hex('#1b3048'),
  neutral: hex('#7d858f'),
  /** Terre de fond des couches non politiques (infrastructures, mer). */
  landDark: hex('#23272e'),
  river: hex('#3f7bc4'),
  road: hex('#737a85'),
  majorRoad: hex('#e3a444'),
  rail: hex('#c46ad8'),
  port: hex('#45d0e8'),
  airport: hex('#f2f2f2'),
  urban: hex('#a08a5c'),
  strait: hex('#ff9f43'),
  mountain: hex('#8b7355'),
  highMountain: hex('#d6d2cc'),
  selection: hex('#ffffff'),
} as const satisfies Record<string, Rgb>;

/** Couleur de chaque biome (index = code de biome). */
export const BIOME_COLORS: Readonly<Record<number, Rgb>> = {
  [Biome.None]: STYLE.ocean,
  [Biome.TemperateForest]: hex('#56804a'),
  [Biome.TropicalForest]: hex('#2d7a52'),
  [Biome.SteppeSavanna]: hex('#a99c5e'),
  [Biome.Desert]: hex('#d4b981'),
  [Biome.Tundra]: hex('#8b9c90'),
  [Biome.Ice]: hex('#e4ecf0'),
  [Biome.Wetland]: hex('#4d8c88'),
};

/** Couleur d'un relief dans la couche terrain (mélangée à celle du biome). */
export const RELIEF_BLEND: Readonly<Record<number, { color: Rgb; weight: number }>> = {
  [Terrain.Hills]: { color: hex('#6f6a50'), weight: 0.2 },
  [Terrain.Mountain]: { color: STYLE.mountain, weight: 0.5 },
  [Terrain.HighMountain]: { color: STYLE.highMountain, weight: 0.65 },
};

/** Statut des détroits (world.base.json). */
export const CHOKEPOINT_COLORS: Readonly<Record<'open' | 'contested' | 'closed', Rgb>> = {
  open: hex('#5cc98a'),
  contested: hex('#f0a030'),
  closed: hex('#e0454f'),
};
