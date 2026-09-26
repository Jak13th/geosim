/**
 * Projection Equal Earth de la carte (mêmes paramètres que le pipeline, lus dans l'en-tête) :
 * position des villes, détroits et routes, et contour du globe pour le rendu.
 */
import { geoEqualEarth, type GeoProjection } from 'd3-geo';
import type { MapHeader } from '@geosim/shared';

export interface MapProjector {
  projection: GeoProjection;
  width: number;
  height: number;
  /** Demi-largeur projetée du globe au centre de chaque ligne, en pixels. */
  rowHalfWidth: Float32Array;
  /** [lon, lat] → coordonnées continues de la carte (pixels), ou null hors projection. */
  project(lon: number, lat: number): [number, number] | null;
  /** Le point (x, y) de la carte est-il sur le globe ? */
  onGlobe(x: number, y: number): boolean;
}

export function makeProjector(
  header: Pick<MapHeader, 'width' | 'height' | 'projection'>,
): MapProjector {
  const { scale, translate } = header.projection;
  const projection = geoEqualEarth().scale(scale).translate(translate);
  const rowHalfWidth = new Float32Array(header.height);
  for (let j = 0; j < header.height; j++) {
    const lat = projection.invert?.([translate[0], j + 0.5])?.[1] ?? Number.NaN;
    const clamped = Math.max(-90, Math.min(90, Number.isFinite(lat) ? lat : 90));
    const edge = projection([180, clamped]);
    rowHalfWidth[j] = edge ? Math.max(0, edge[0] - translate[0]) : 0;
  }
  return {
    projection,
    width: header.width,
    height: header.height,
    rowHalfWidth,
    project(lon, lat) {
      const p = projection([lon, lat]);
      return p ? [p[0], p[1]] : null;
    },
    onGlobe(x, y) {
      const j = Math.floor(y);
      if (j < 0 || j >= header.height) return false;
      return Math.abs(x - header.width / 2) <= (rowHalfWidth[j] ?? 0);
    },
  };
}

/**
 * Découpe une polyligne [lon, lat] là où elle franchit l'antiméridien (saut de plus de 180° en
 * longitude) : sur la carte, les deux morceaux sont aux deux bords opposés.
 */
export function splitAtAntimeridian(
  path: readonly (readonly [number, number])[],
): [number, number][][] {
  const parts: [number, number][][] = [];
  let current: [number, number][] = [];
  let prev: readonly [number, number] | null = null;
  for (const point of path) {
    if (prev !== null && Math.abs(point[0] - prev[0]) > 180) {
      if (current.length > 1) parts.push(current);
      current = [];
    }
    current.push([point[0], point[1]]);
    prev = point;
  }
  if (current.length > 1) parts.push(current);
  return parts;
}
