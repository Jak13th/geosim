/**
 * Grille de la carte en projection Equal Earth (Šavrič, Patterson et Jenny, 2018), via d3-geo.
 *
 * Le pixel (i, j) couvre [i, i+1) × [j, j+1) en coordonnées projetées ; son centre est
 * (i + 0,5 ; j + 0,5). La projection étant à surface égale, chaque pixel représente la même
 * surface : (R / échelle)², R étant le rayon authalique de la Terre.
 */
import { geoEqualEarth, type GeoProjection } from 'd3-geo';
import type { MapProjection } from '@geosim/shared';

/** Rayon authalique (sphère de même surface que l'ellipsoïde WGS 84), en km. */
export const EARTH_RADIUS_KM = 6371.0072;

export interface Grid {
  width: number;
  height: number;
  projectionSpec: MapProjection;
  projection: GeoProjection;
  pixelAreaKm2: number;
  pixelSideKm: number;
  /** Latitude du centre de chaque ligne, en degrés. */
  rowLat: Float64Array;
  /** Demi-largeur projetée du globe au centre de chaque ligne, en pixels. */
  rowHalfWidth: Float64Array;
}

export function makeGrid(width: number): Grid {
  const unit = geoEqualEarth().scale(1).translate([0, 0]);
  const xMax = Math.abs(unit([180, 0])?.[0] ?? NaN);
  const yMax = Math.abs(unit([0, 90])?.[1] ?? NaN);
  const scale = width / (2 * xMax);
  const height = Math.round(2 * yMax * scale);
  const translate: [number, number] = [width / 2, height / 2];
  const projection = geoEqualEarth().scale(scale).translate(translate);

  // Equal Earth : la latitude ne dépend que de y, et x est linéaire en longitude sur une ligne.
  const rowLat = new Float64Array(height);
  const rowHalfWidth = new Float64Array(height);
  for (let j = 0; j < height; j++) {
    const y = j + 0.5;
    const lat = projection.invert?.([translate[0], y])?.[1] ?? NaN;
    rowLat[j] = Math.max(-90, Math.min(90, lat));
    const edge = projection([180, rowLat[j] ?? 0]);
    rowHalfWidth[j] = edge ? edge[0] - translate[0] : 0;
  }

  const pixelSideKm = EARTH_RADIUS_KM / scale;
  return {
    width,
    height,
    projectionSpec: { type: 'equalEarth', scale, translate },
    projection,
    pixelAreaKm2: pixelSideKm * pixelSideKm,
    pixelSideKm,
    rowLat,
    rowHalfWidth,
  };
}

/** Coordonnées projetées (pixels, continues) d'un point [lon, lat]. */
export function project(grid: Grid, lon: number, lat: number): [number, number] {
  const p = grid.projection([lon, lat]);
  if (!p) throw new Error(`Projection impossible : ${lon}, ${lat}`);
  return p;
}

/** Longitude et latitude du centre du pixel (i, j), ou null s'il est hors du globe. */
export function pixelLonLat(grid: Grid, i: number, j: number): [number, number] | null {
  const half = grid.rowHalfWidth[j] ?? 0;
  const dx = i + 0.5 - grid.width / 2;
  if (half <= 0 || Math.abs(dx) > half) return null;
  return [(180 * dx) / half, grid.rowLat[j] ?? 0];
}

/** Masque des pixels dont le centre est sur le globe. */
export function globeMask(grid: Grid): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  for (let j = 0; j < grid.height; j++) {
    const half = grid.rowHalfWidth[j] ?? 0;
    for (let i = 0; i < grid.width; i++) {
      if (Math.abs(i + 0.5 - grid.width / 2) <= half) mask[j * grid.width + i] = 1;
    }
  }
  return mask;
}

/** Index du pixel contenant le point [lon, lat]. */
export function pixelOf(grid: Grid, lon: number, lat: number): number {
  const [x, y] = project(grid, lon, lat);
  const i = Math.min(grid.width - 1, Math.max(0, Math.floor(x)));
  const j = Math.min(grid.height - 1, Math.max(0, Math.floor(y)));
  return j * grid.width + i;
}

/** Distance orthodromique (haversine), en km. */
export function greatCircleKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
