/**
 * Fichiers JSON qui accompagnent la carte binaire (data/build/map/) :
 * - `map-<résolution>.json` : entités, unités, zones maritimes, détroits, villes, ports ;
 * - `geo-<résolution>.json` : voisinages et distances ;
 * - `routes-<résolution>.json` : routes maritimes.
 * Tous portent le `buildId` de la carte binaire correspondante.
 */
import type { MapProjection } from './format.ts';

export type EntityKind = 'state' | 'de_facto' | 'faction';

export interface MapProvenance {
  source: string;
  date: string;
  confidence: 'high' | 'medium' | 'low' | 'assumption';
  note?: string;
}

export interface MapCity {
  name: string;
  nameFr: string;
  lon: number;
  lat: number;
  pixel: number;
  /** Index de l'entité propriétaire. */
  entity: number;
  population: number;
  capital: boolean;
  admin1Capital: boolean;
}

export interface EntityGeoStats {
  /** Pixels contrôlés (owner). */
  pixels: number;
  areaKm2: number;
  sovereignAreaKm2: number;
  coastlineKm: number;
  /** Sans façade sur l'océan mondial (la Caspienne n'en fait pas partie). */
  landlocked: boolean;
  /** Accès retenu pour les routes maritimes. */
  seaAccess: 'ports' | 'coast' | 'overland' | 'none';
  /** Pays de transit jusqu'à la côte (accès par voie de terre). */
  transit: string | null;
  /** Répartition des terrains et des biomes (% des pixels contrôlés), par libellé de code. */
  terrainMix: Record<string, number>;
  biomeMix: Record<string, number>;
  /** Population des pixels contrôlés (habitants). */
  population: number;
  /** Valeur économique des pixels contrôlés (millions de $ de PIB annuel). */
  economicValue: number;
  /** Population des pixels sous sa souveraineté de jure. */
  sovereignPopulation: number;
}

export interface MapEntity {
  index: number;
  id: string;
  name: string;
  nameFr: string;
  kind: EntityKind;
  capital: (MapCity & { rule: 'natural_earth' | 'curated' | 'largest_city' }) | null;
  /** Point d'étiquette (pixel le plus intérieur du territoire contrôlé). */
  label: { pixel: number; lon: number; lat: number } | null;
  stats: EntityGeoStats;
  provenance: MapProvenance | null;
}

export interface MapUnit {
  index: number;
  /** Code Natural Earth (ADM0_A3). */
  neA3: string;
  name: string;
  nameFr: string;
  neType: string;
  role: 'main' | 'dependency' | 'special';
  owner: number;
  sovereign: number;
  pixels: number;
  note: string | null;
  provenance: MapProvenance | null;
}

export interface MapSeaZone {
  index: number;
  name: string;
  nameFr: string;
  kind: string;
  areaKm2: number;
  labelLonLat: [number, number] | null;
}

export interface MapChokepoint {
  id: string;
  name: string;
  nameFr: string;
  kind: 'strait' | 'canal' | 'cape';
  /** Codes des entités riveraines (côtes et eaux au droit de la porte). */
  riparians: string[];
  /** Longueur de la route de test, porte ouverte puis fermée (km ; null si inaccessible). */
  testOpenKm: number | null;
  testClosedKm: number | null;
  provenance: MapProvenance;
}

export interface MapPort {
  name: string;
  lon: number;
  lat: number;
  pixel: number;
  entity: number;
  scalerank: number;
}

export interface MapMeta {
  version: 1;
  buildId: string;
  width: number;
  height: number;
  projection: MapProjection;
  pixelAreaKm2: number;
  pixelSideKm: number;
  /** Versions des sources utilisées (data/manifest.json). */
  sources: { id: string; version: string }[];
  entities: MapEntity[];
  units: MapUnit[];
  seaZones: MapSeaZone[];
  chokepoints: MapChokepoint[];
  cities: MapCity[];
  ports: MapPort[];
  /** Zones de contrôle appliquées (control_zones.geojson), dans l'ordre. */
  controlZones: MapControlZone[];
}

export interface MapControlZone {
  id: string;
  nameFr: string;
  controller: string | null;
  sovereign: string | null;
  /** Pixels terrestres modifiés. */
  pixels: number;
  provenance: MapProvenance;
}

export interface PairLength {
  a: string;
  b: string;
  km: number;
}

export interface MapGeo {
  version: 1;
  buildId: string;
  landBorders: PairLength[];
  /** Voisins maritimes (espaces maritimes contigus par équidistance, portée 200 milles). */
  maritimeBorders: PairLength[];
  distances: {
    ids: string[];
    greatCircleKm: (number | null)[][];
    landKm: (number | null)[][];
  };
}

export interface MapRouteLeg {
  km: number;
  straits: string[];
  path: [number, number][];
}

export interface MapRoute {
  a: string;
  b: string;
  primary: MapRouteLeg;
  alternative: MapRouteLeg | null;
  noAlternative: boolean;
}

export interface MapRoutes {
  version: 1;
  buildId: string;
  routes: MapRoute[];
}
