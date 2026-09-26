/**
 * Zones de contrôle (SPEC §4.5, `data/curated/control_zones.geojson`) : territoires dont le
 * contrôle de facto (`owner`) ou la souveraineté de jure (`sovereign`) diffère de la carte de base
 * Natural Earth. Chaque zone est définie par une géométrie propre, par des entités de la couche
 * Natural Earth des zones disputées (`ne_disputed`, par nom BRK_NAME) et/ou par des subdivisions
 * de premier niveau (`admin1`, codes ISO 3166-2). Les zones s'appliquent dans l'ordre du fichier.
 */
import { isLand } from '@geosim/shared';
import type { Position, ShapeFeature, ShapeGeometry } from '../io/shapefile.ts';
import { str } from '../io/naturalEarth.ts';
import { checkProvenance, type CuratedProvenance } from '../config.ts';
import type { Grid } from './grid.ts';
import { polygonRings, projectRings, scanPolygon } from './raster.ts';

export interface ControlZone extends CuratedProvenance {
  id: string;
  nameFr: string;
  /** Nouveau propriétaire de facto (null : inchangé). */
  controller: string | null;
  /** Nouvelle souveraineté de jure (null : inchangée). */
  sovereign: string | null;
  /** Ne modifie que les pixels dont le propriétaire actuel est dans cette liste. */
  within: string[];
  neDisputed: string[];
  admin1: string[];
  /** Polygones propres (chacun : anneau extérieur et trous), rasterisés séparément puis réunis. */
  polygons: Position[][][];
}

interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null;
}

export function parseControlZones(raw: unknown, file = 'control_zones.geojson'): ControlZone[] {
  const doc = raw as { type?: string; features?: GeoJsonFeature[] };
  if (doc?.type !== 'FeatureCollection' || !Array.isArray(doc.features)) {
    throw new Error(`${file} : FeatureCollection attendue`);
  }
  const ids = new Set<string>();
  return doc.features.map((f, k) => {
    const p = f.properties ?? {};
    const id = typeof p.id === 'string' ? p.id : `#${k}`;
    const where = `${file} › ${id}`;
    if (ids.has(id)) throw new Error(`${where} : identifiant en double`);
    ids.add(id);
    const provenance = checkProvenance(p, where);
    const strings = (key: string): string[] => {
      const v = p[key];
      if (v === undefined || v === null) return [];
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
        throw new Error(`${where} : ${key} doit être une liste de chaînes`);
      }
      return v as string[];
    };
    const code = (key: string): string | null => {
      const v = p[key];
      if (v === undefined || v === null) return null;
      if (typeof v !== 'string') throw new Error(`${where} : ${key} doit être un code`);
      return v;
    };
    const g = f.geometry;
    let polygons: Position[][][] = [];
    if (g?.type === 'Polygon') polygons = [stripZ(g.coordinates as number[][][])];
    else if (g?.type === 'MultiPolygon') polygons = (g.coordinates as number[][][][]).map(stripZ);
    else if (g !== null && g !== undefined)
      throw new Error(`${where} : géométrie Polygon ou MultiPolygon attendue`);
    const zone: ControlZone = {
      ...provenance,
      id,
      nameFr: typeof p.nameFr === 'string' ? p.nameFr : id,
      controller: code('controller'),
      sovereign: code('sovereign'),
      within: strings('within'),
      neDisputed: strings('ne_disputed'),
      admin1: strings('admin1'),
      polygons,
    };
    if (zone.controller === null && zone.sovereign === null) {
      throw new Error(`${where} : controller ou sovereign requis`);
    }
    if (zone.polygons.length === 0 && zone.neDisputed.length === 0 && zone.admin1.length === 0) {
      throw new Error(`${where} : géométrie, ne_disputed ou admin1 requis`);
    }
    return zone;
  });
}

function stripZ(rings: number[][][]): Position[][] {
  return rings.map((ring) => ring.map((p) => [p[0] as number, p[1] as number] as Position));
}

export interface ZoneResult {
  id: string;
  /** Pixels terrestres modifiés. */
  pixels: number;
  /** Surface géométrique de la zone, en pixels (une zone de moins d'un pixel peut n'en modifier aucun). */
  areaPx: number;
  /** Références introuvables (erreurs bloquantes). */
  missing: string[];
}

/**
 * Applique les zones aux couches `owner` et `sovereign` (pixels terrestres seulement).
 * `entityIndex` résout les codes ; les références absentes sont renvoyées comme erreurs.
 */
export function applyControlZones(
  grid: Grid,
  terrain: Uint8Array,
  owner: Uint16Array,
  sovereign: Uint16Array,
  zones: readonly ControlZone[],
  entityIndex: ReadonlyMap<string, number>,
  disputed: readonly ShapeFeature[],
  admin1: readonly ShapeFeature[],
): ZoneResult[] {
  const results: ZoneResult[] = [];
  const mask = new Uint8Array(grid.width * grid.height);
  for (const zone of zones) {
    const missing: string[] = [];
    const resolve = (code: string | null): number | null => {
      if (code === null) return null;
      const index = entityIndex.get(code);
      if (index === undefined) missing.push(`entité « ${code} »`);
      return index ?? null;
    };
    const controller = resolve(zone.controller);
    const sov = resolve(zone.sovereign);
    const within = new Set(zone.within.map((c) => resolve(c) ?? -1));

    const polygons: Position[][][] = [];
    const fromShape = (g: ShapeGeometry | null): void => {
      const rings = polygonRings(g);
      if (rings.length > 0) polygons.push(rings);
    };
    for (const name of zone.neDisputed) {
      const found = disputed.filter((f) => str(f, 'BRK_NAME') === name);
      if (found.length === 0) missing.push(`zone disputée Natural Earth « ${name} »`);
      found.forEach((f) => fromShape(f.geometry));
    }
    for (const code of zone.admin1) {
      const found = admin1.filter(
        (f) => str(f, 'iso_3166_2') === code || str(f, 'adm1_code') === code,
      );
      if (found.length === 0) missing.push(`subdivision « ${code} »`);
      found.forEach((f) => fromShape(f.geometry));
    }
    polygons.push(...zone.polygons);

    mask.fill(0);
    let areaPx = 0;
    for (const polygon of polygons) {
      const rings = projectRings(grid, polygon);
      rings.forEach((ring, k) => (areaPx += (k === 0 ? 1 : -1) * Math.abs(ringArea(ring))));
      scanPolygon(rings, grid.width, grid.height, (row, x0, x1) => {
        mask.fill(1, row * grid.width + x0, row * grid.width + x1);
      });
    }
    let pixels = 0;
    for (let p = 0; p < mask.length; p++) {
      if (mask[p] === 0 || !isLand(terrain[p] as number)) continue;
      if (within.size > 0 && !within.has(owner[p] as number)) continue;
      if (owner[p] === 0 && controller === null) continue;
      if (controller !== null) owner[p] = controller;
      if (sov !== null) sovereign[p] = sov;
      pixels++;
    }
    results.push({ id: zone.id, pixels, areaPx, missing });
  }
  return results;
}

/** Aire signée d'un anneau projeté (formule du lacet), en pixels. */
function ringArea(ring: Float64Array): number {
  let twice = 0;
  const n = ring.length / 2;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    twice +=
      (ring[2 * k] as number) * (ring[2 * j + 1] as number) -
      (ring[2 * j] as number) * (ring[2 * k + 1] as number);
  }
  return twice / 2;
}
