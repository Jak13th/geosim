/**
 * Éléments ponctuels et linéaires de la carte : fleuves, zones urbaines, infrastructures,
 * villes et capitales, ports, aéroports ; drapeaux de côte et de frontière.
 */
import { Infra, MapFlag, Terrain, isLand } from '@geosim/shared';
import type { ShapeFeature } from '../io/shapefile.ts';
import { num, str } from '../io/naturalEarth.ts';
import { greatCircleKm, pixelLonLat, pixelOf, type Grid } from './grid.ts';
import { neighbors4, type Topology } from './gridops.ts';
import { lineParts, polygonRings, projectRings, scanPolygon, tracePolyline } from './raster.ts';
import type { CuratedUnits, EntityTable } from './entities.ts';

/** Marque les fleuves majeurs (rang Natural Earth ≤ seuil) sur les pixels terrestres. */
export function markRivers(
  grid: Grid,
  terrain: Uint8Array,
  flags: Uint16Array,
  rivers: readonly ShapeFeature[],
  maxScalerank: number,
): number {
  let count = 0;
  for (const feature of rivers) {
    const cls = str(feature, 'featurecla');
    const rank = num(feature, 'scalerank');
    if (cls !== 'River' || rank === null || rank > maxScalerank) continue;
    for (const line of lineParts(feature.geometry)) {
      tracePolyline(grid, line, (p) => {
        if (isLand(terrain[p] as number) && !((flags[p] as number) & MapFlag.River)) {
          flags[p] = (flags[p] as number) | MapFlag.River;
          count++;
        }
      });
    }
  }
  return count;
}

/** Part urbanisée de chaque pixel terrestre (0–255), par sur-échantillonnage des polygones. */
export function rasterizeUrban(
  grid: Grid,
  terrain: Uint8Array,
  urbanAreas: readonly ShapeFeature[],
  supersampling: number,
): Uint8Array {
  const s = Math.max(1, Math.round(supersampling));
  const counts = new Uint16Array(grid.width * grid.height);
  for (const feature of urbanAreas) {
    const rings = projectRings(grid, polygonRings(feature.geometry));
    scanPolygon(
      rings,
      grid.width,
      grid.height,
      (subRow, x0, x1) => {
        const row = Math.floor(subRow / s);
        for (let x = x0; x < x1; x++) {
          const p = row * grid.width + Math.floor(x / s);
          counts[p] = (counts[p] as number) + 1;
        }
      },
      s,
    );
  }
  const urban = new Uint8Array(grid.width * grid.height);
  const full = s * s;
  for (let p = 0; p < urban.length; p++) {
    const c = counts[p] as number;
    if (c > 0 && isLand(terrain[p] as number))
      urban[p] = Math.min(255, Math.round((255 * c) / full));
  }
  return urban;
}

/** Routes (hors bacs) et voies ferrées, en champ de bits sur les pixels terrestres. */
export function rasterizeInfrastructure(
  grid: Grid,
  terrain: Uint8Array,
  roads: readonly ShapeFeature[],
  railroads: readonly ShapeFeature[],
): Uint8Array {
  const infra = new Uint8Array(grid.width * grid.height);
  const mark = (bits: number) => (p: number) => {
    if (isLand(terrain[p] as number)) infra[p] = (infra[p] as number) | bits;
  };
  for (const feature of roads) {
    if (str(feature, 'featurecla') === 'Ferry') continue;
    const type = str(feature, 'type') ?? '';
    const major =
      type === 'Major Highway' ||
      type === 'Beltway' ||
      type === 'Bypass' ||
      num(feature, 'expressway') === 1;
    const visit = mark(major ? Infra.Road | Infra.MajorRoad : Infra.Road);
    for (const line of lineParts(feature.geometry)) tracePolyline(grid, line, visit);
  }
  const rail = mark(Infra.Rail);
  for (const feature of railroads) {
    for (const line of lineParts(feature.geometry)) tracePolyline(grid, line, rail);
  }
  return infra;
}

/**
 * Pixel le plus proche (parcours en largeur, au plus `radius` pas) satisfaisant `ok`,
 * ou -1. Sert à rattacher une ville ou un port au trait de côte rasterisé.
 */
export function nearestPixel(
  t: Topology,
  start: number,
  radius: number,
  ok: (p: number) => boolean,
): number {
  if (ok(start)) return start;
  const seen = new Set<number>([start]);
  let frontier = [start];
  const nb = new Int32Array(4);
  for (let step = 0; step < radius; step++) {
    const next: number[] = [];
    for (const p of frontier) {
      const k = neighbors4(t, p, nb);
      for (let m = 0; m < k; m++) {
        const q = nb[m] as number;
        if (seen.has(q)) continue;
        if (ok(q)) return q;
        seen.add(q);
        next.push(q);
      }
    }
    frontier = next;
  }
  return -1;
}

export interface City {
  name: string;
  nameFr: string;
  lon: number;
  lat: number;
  pixel: number;
  /** Entité propriétaire du pixel (index). */
  entity: number;
  population: number;
  capital: boolean;
  admin1Capital: boolean;
}

export interface Capital {
  entity: number;
  city: City;
  /** Règle appliquée : Natural Earth, fichier curé, ou repli (plus grande ville). */
  rule: 'natural_earth' | 'curated' | 'largest_city';
}

/** Pixel de l'entité le plus proche (orthodromie) d'un point, sur toute la carte ; -1 si aucun. */
function closestOwnedPixel(
  grid: Grid,
  owner: Uint16Array,
  entity: number,
  lon: number,
  lat: number,
): number {
  let best = -1;
  let bestKm = Infinity;
  for (let p = 0; p < owner.length; p++) {
    if (owner[p] !== entity) continue;
    const j = Math.floor(p / grid.width);
    const ll = pixelLonLat(grid, p - j * grid.width, j);
    if (ll === null) continue;
    const km = greatCircleKm(lon, lat, ll[0], ll[1]);
    if (km < bestKm) {
      bestKm = km;
      best = p;
    }
  }
  return best;
}

interface PlaceRecord {
  name: string;
  nameFr: string;
  lon: number;
  lat: number;
  /** Pixel du point, et pixel terrestre le plus proche (-1 s'il est trop loin). */
  raw: number;
  land: number;
  population: number;
  adm0cap: boolean;
  admin1Capital: boolean;
  a3: string;
}

/**
 * Villes (population ≥ seuil, et toutes les capitales nationales) et capitale de chaque entité :
 * fichier curé s'il en désigne une, sinon capitale Natural Earth (ADM0CAP) de l'unité
 * principale, sinon plus grande ville du territoire. La capitale est ramenée sur le pixel de
 * son entité le plus proche.
 */
export function buildCities(
  grid: Grid,
  t: Topology,
  terrain: Uint8Array,
  owner: Uint16Array,
  places: readonly ShapeFeature[],
  table: EntityTable,
  curated: CuratedUnits,
  minPopulation: number,
): { cities: City[]; capitals: Capital[]; unplaced: string[] } {
  const records: PlaceRecord[] = [];
  for (const place of places) {
    if (place.geometry?.type !== 'Point') continue;
    const [lon, lat] = place.geometry.coordinates;
    const raw = pixelOf(grid, lon, lat);
    records.push({
      name: str(place, 'NAME') ?? '?',
      nameFr: str(place, 'NAME_FR') ?? str(place, 'NAME') ?? '?',
      lon,
      lat,
      raw,
      land: nearestPixel(t, raw, 3, (p) => isLand(terrain[p] as number)),
      population: num(place, 'POP_MAX') ?? 0,
      // Natural Earth marque parfois la capitale par sa seule classe (Djouba : ADM0CAP = 0).
      adm0cap: num(place, 'ADM0CAP') === 1 || str(place, 'FEATURECLA') === 'Admin-0 capital',
      admin1Capital: (str(place, 'FEATURECLA') ?? '').startsWith('Admin-1'),
      a3: str(place, 'ADM0_A3') ?? '',
    });
  }

  const capitals: Capital[] = [];
  const capitalOf = new Map<PlaceRecord, Capital>();
  const unplaced: string[] = [];
  for (const entity of table.entities) {
    const override = curated.capitals[entity.id];
    let place: PlaceRecord | undefined;
    let rule: Capital['rule'] = 'natural_earth';
    if (override) {
      rule = 'curated';
      if (override.lonlat) {
        const [lon, lat] = override.lonlat;
        const raw = pixelOf(grid, lon, lat);
        place = {
          name: override.value,
          nameFr: override.value,
          lon,
          lat,
          raw,
          land: raw,
          population: 0,
          adm0cap: true,
          admin1Capital: false,
          a3: entity.neA3,
        };
      } else {
        place = records
          .filter((r) => r.name === override.value)
          .sort((a, b) => b.population - a.population)[0];
      }
      if (!place)
        throw new Error(
          `ne_units.yaml › capitals.${entity.id} : « ${override.value} » introuvable`,
        );
    } else {
      place = records
        .filter((r) => r.adm0cap && (r.a3 === entity.neA3 || r.a3 === entity.id))
        .sort((a, b) => b.population - a.population)[0];
      if (!place) {
        rule = 'largest_city';
        place = records
          .filter((r) => r.land >= 0 && owner[r.land] === entity.index)
          .sort((a, b) => b.population - a.population)[0];
      }
    }
    if (!place) {
      unplaced.push(`capitale de ${entity.id}`);
      continue;
    }
    // Pixel de l'entité le plus proche de la capitale : parcours local, puis recherche sur
    // toute la carte (archipels dont la capitale est un atoll trop petit pour la grille).
    let pixel = nearestPixel(t, place.raw, 60, (q) => owner[q] === entity.index);
    if (pixel < 0) pixel = closestOwnedPixel(grid, owner, entity.index, place.lon, place.lat);
    if (pixel < 0) {
      unplaced.push(`capitale de ${entity.id} (${place.name})`);
      continue;
    }
    const capital: Capital = {
      entity: entity.index,
      rule,
      city: {
        name: place.name,
        nameFr: place.nameFr,
        lon: place.lon,
        lat: place.lat,
        pixel,
        entity: entity.index,
        population: place.population,
        capital: true,
        admin1Capital: place.admin1Capital,
      },
    };
    capitals.push(capital);
    capitalOf.set(place, capital);
  }

  const cities: City[] = capitals.map((c) => c.city);
  for (const r of records) {
    if (capitalOf.has(r) || r.population < minPopulation) continue;
    if (r.land < 0 || owner[r.land] === 0) {
      unplaced.push(r.name);
      continue;
    }
    cities.push({
      name: r.name,
      nameFr: r.nameFr,
      lon: r.lon,
      lat: r.lat,
      pixel: r.land,
      entity: owner[r.land] as number,
      population: r.population,
      capital: false,
      admin1Capital: r.admin1Capital,
    });
  }
  cities.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
  return { cities, capitals, unplaced };
}

export interface Port {
  name: string;
  lon: number;
  lat: number;
  /** Pixel terrestre côtier du port. */
  pixel: number;
  entity: number;
  scalerank: number;
}

/** Rattache chaque port Natural Earth au pixel côtier le plus proche (dans un rayon). */
export function buildPorts(
  grid: Grid,
  t: Topology,
  terrain: Uint8Array,
  owner: Uint16Array,
  flags: Uint16Array,
  ports: readonly ShapeFeature[],
  radiusKm: number,
): { ports: Port[]; dropped: string[] } {
  const radius = Math.max(1, Math.round(radiusKm / grid.pixelSideKm));
  const out: Port[] = [];
  const dropped: string[] = [];
  const coastal = (p: number): boolean =>
    isLand(terrain[p] as number) && ((flags[p] as number) & MapFlag.Coast) !== 0 && owner[p] !== 0;
  for (const port of ports) {
    if (port.geometry?.type !== 'Point') continue;
    const [lon, lat] = port.geometry.coordinates;
    const pixel = nearestPixel(t, pixelOf(grid, lon, lat), radius, coastal);
    const name = str(port, 'name') ?? '?';
    if (pixel < 0) {
      dropped.push(name);
      continue;
    }
    flags[pixel] = (flags[pixel] as number) | MapFlag.Port;
    out.push({
      name,
      lon,
      lat,
      pixel,
      entity: owner[pixel] as number,
      scalerank: num(port, 'scalerank') ?? 10,
    });
  }
  return { ports: out, dropped };
}

/** Aéroports : drapeau sur le pixel terrestre le plus proche (2 pixels au plus). */
export function markAirports(
  grid: Grid,
  t: Topology,
  terrain: Uint8Array,
  flags: Uint16Array,
  airports: readonly ShapeFeature[],
): number {
  let count = 0;
  for (const airport of airports) {
    if (airport.geometry?.type !== 'Point') continue;
    const [lon, lat] = airport.geometry.coordinates;
    const pixel = nearestPixel(t, pixelOf(grid, lon, lat), 2, (p) => isLand(terrain[p] as number));
    if (pixel < 0) continue;
    flags[pixel] = (flags[pixel] as number) | MapFlag.Airport;
    count++;
  }
  return count;
}

/**
 * Drapeaux de côte (pixel terrestre voisin d'un pixel de mer) et de frontière (voisin terrestre
 * d'un autre propriétaire). Recalculables par le moteur quand les propriétaires changent.
 */
export function markCoastAndBorders(
  t: Topology,
  terrain: Uint8Array,
  owner: Uint16Array,
  flags: Uint16Array,
): void {
  const nb = new Int32Array(4);
  const n = t.width * t.height;
  for (let p = 0; p < n; p++) {
    if (!isLand(terrain[p] as number)) continue;
    let f = (flags[p] as number) & ~(MapFlag.Coast | MapFlag.Border);
    const k = neighbors4(t, p, nb);
    for (let m = 0; m < k; m++) {
      const q = nb[m] as number;
      const tq = terrain[q] as number;
      if (tq === Terrain.Sea) f |= MapFlag.Coast;
      else if (isLand(tq) && owner[q] !== owner[p]) f |= MapFlag.Border;
    }
    flags[p] = f;
  }
}
