/**
 * Couches de la carte (SPEC §4.1) : codes de terrain, de biome, drapeaux et infrastructures.
 * Partagées par le pipeline (qui les écrit), le moteur et l'interface (qui les lisent).
 */

/** Terrain : l'eau est scindée en mer et lac (eaux intérieures) ; le reste est terrestre. */
export const Terrain = {
  Sea: 0,
  Lake: 1,
  Plain: 2,
  Hills: 3,
  Mountain: 4,
  HighMountain: 5,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_LABELS: Readonly<Record<TerrainId, string>> = {
  0: 'Mer',
  1: 'Lac',
  2: 'Plaine',
  3: 'Collines',
  4: 'Montagne',
  5: 'Haute montagne',
};

export function isLand(terrain: number): boolean {
  return terrain >= Terrain.Plain;
}

export const Biome = {
  None: 0,
  TemperateForest: 1,
  TropicalForest: 2,
  SteppeSavanna: 3,
  Desert: 4,
  Tundra: 5,
  Ice: 6,
  Wetland: 7,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];

export const BIOME_LABELS: Readonly<Record<BiomeId, string>> = {
  0: 'Aucun (eau)',
  1: 'Forêt tempérée ou boréale',
  2: 'Forêt tropicale',
  3: 'Steppe ou savane',
  4: 'Désert',
  5: 'Toundra',
  6: 'Glace',
  7: 'Zone humide',
};

/** Drapeaux par pixel (champ de bits, Uint16). */
export const MapFlag = {
  /** Pixel terrestre voisin (4-connexité) d'un pixel de mer. */
  Coast: 1 << 0,
  /** Pixel terrestre voisin d'un pixel terrestre d'un autre propriétaire. */
  Border: 1 << 1,
  Capital: 1 << 2,
  MajorCity: 1 << 3,
  Port: 1 << 4,
  Airport: 1 << 5,
  /** Pixel d'eau sur la porte d'un détroit ou d'un passage (voir chokepoints). */
  Strait: 1 << 6,
  /** Fleuve majeur. */
  River: 1 << 7,
} as const;

export const FLAG_LABELS: Readonly<Record<keyof typeof MapFlag, string>> = {
  Coast: 'Côte',
  Border: 'Frontière',
  Capital: 'Capitale',
  MajorCity: 'Ville majeure',
  Port: 'Port',
  Airport: 'Aéroport',
  Strait: 'Détroit',
  River: 'Fleuve majeur',
};

/** Infrastructures de transport par pixel (champ de bits, Uint8). */
export const Infra = {
  Road: 1 << 0,
  MajorRoad: 1 << 1,
  Rail: 1 << 2,
} as const;

/** Identifiant 0 : aucun propriétaire (eau, terre neutre comme l'Antarctique). */
export const NO_OWNER = 0;
/** Identifiant 0 de zone maritime : pixel terrestre ou eau sans zone. */
export const NO_SEA_ZONE = 0;
