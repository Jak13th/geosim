/**
 * Zones maritimes (SPEC §4.4) : mers, golfes et détroits nommés de Natural Earth ; les océans
 * sont découpés par une grille régulière ; les polygones trop petits sont fondus dans la zone
 * voisine ; les eaux non couvertes rejoignent la zone la plus proche (parcours en largeur).
 * Les lacs n'ont pas de zone maritime (la Caspienne, classée mer par Natural Earth, en a une).
 */
import { Terrain } from '@geosim/shared';
import type { ShapeFeature } from '../io/shapefile.ts';
import { str } from '../io/naturalEarth.ts';
import { pixelLonLat, type Grid } from './grid.ts';
import { bfsFill, labelPoints, type Topology } from './gridops.ts';
import { ringsArea } from './political.ts';
import { polygonRings, projectRings, scanPolygon } from './raster.ts';

export interface SeaZone {
  index: number;
  name: string;
  nameFr: string;
  /** Classe Natural Earth : ocean, sea, gulf, bay, strait… */
  kind: string;
  areaKm2: number;
  labelLonLat: [number, number] | null;
}

export function buildSeaZones(
  grid: Grid,
  t: Topology,
  terrain: Uint8Array,
  globe: Uint8Array,
  marine: readonly ShapeFeature[],
  minAreaKm2: number,
  oceanGridDeg: number,
): { seaZone: Uint16Array; zones: SeaZone[] } {
  const n = grid.width * grid.height;
  const water = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (globe[p] && terrain[p] === Terrain.Sea) water[p] = 1;

  // Polygones dessinés du plus grand au plus petit : les petits (golfes, détroits) l'emportent.
  const order = marine
    .map((feature, f) => ({ f, rings: projectRings(grid, polygonRings(feature.geometry)) }))
    .map((e) => ({ ...e, area: ringsArea(e.rings) }))
    .sort((a, b) => b.area - a.area || a.f - b.f);
  const featureOf = new Int32Array(n);
  for (const { f, rings } of order) {
    scanPolygon(rings, grid.width, grid.height, (row, x0, x1) => {
      for (let p = row * grid.width + x0; p < row * grid.width + x1; p++)
        if (water[p]) featureOf[p] = f + 1;
    });
  }

  // Clé de zone : l'entité Natural Earth, et pour un océan, la case de la grille.
  const cols = Math.ceil(360 / oceanGridDeg);
  const rows = Math.ceil(180 / oceanGridDeg);
  const cellsPerFeature = cols * rows;
  const keyOf = new Float64Array(n).fill(-1);
  const counts = new Map<number, number>();
  for (let j = 0; j < grid.height; j++) {
    for (let i = 0; i < grid.width; i++) {
      const p = j * grid.width + i;
      const f = (featureOf[p] as number) - 1;
      if (f < 0) continue;
      const feature = marine[f] as ShapeFeature;
      if (str(feature, 'name') === null) continue;
      let key = f * cellsPerFeature;
      if (str(feature, 'featurecla') === 'ocean') {
        const ll = pixelLonLat(grid, i, j);
        if (ll === null) continue;
        const c = Math.min(cols - 1, Math.floor((ll[0] + 180) / oceanGridDeg));
        const r = Math.min(rows - 1, Math.floor((ll[1] + 90) / oceanGridDeg));
        key += r * cols + c;
      }
      keyOf[p] = key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const minPixels = minAreaKm2 / grid.pixelAreaKm2;
  const kept = [...counts.entries()]
    .filter(([, count]) => count >= minPixels)
    .map(([key]) => key)
    .sort((a, b) => a - b);
  const indexOfKey = new Map(kept.map((key, k) => [key, k + 1]));
  if (kept.length > 65535) throw new Error('Trop de zones maritimes pour un Uint16');

  const labels = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    const key = keyOf[p] as number;
    if (key >= 0) labels[p] = indexOfKey.get(key) ?? 0;
  }
  bfsFill(t, water, labels);
  // Eaux isolées au pixel près (fjords, lagunes, mer de Marmara) : zone la plus proche, en
  // traversant les terres ; seuls les pixels de mer gardent le résultat.
  const through = new Int32Array(labels);
  bfsFill(t, globe, through);
  for (let p = 0; p < n; p++) if (water[p] && labels[p] === 0) labels[p] = through[p] as number;

  const seaZone = new Uint16Array(n);
  const pixels = new Int32Array(kept.length + 1);
  for (let p = 0; p < n; p++) {
    seaZone[p] = labels[p] as number;
    const z = labels[p] as number;
    pixels[z] = (pixels[z] as number) + 1;
  }
  const labelsAt = labelPoints(t, seaZone, kept.length);

  const zones: SeaZone[] = kept.map((key, k) => {
    const index = k + 1;
    const f = Math.floor(key / cellsPerFeature);
    const feature = marine[f] as ShapeFeature;
    const kind = str(feature, 'featurecla') ?? 'sea';
    let name = titleCase(str(feature, 'name') ?? '?');
    let nameFr = titleCase(str(feature, 'name_fr') ?? name);
    if (kind === 'ocean') {
      const cell = key - f * cellsPerFeature;
      const lon0 = (cell % cols) * oceanGridDeg - 180;
      const lat0 = Math.floor(cell / cols) * oceanGridDeg - 90;
      const box = (west: string): string =>
        `${formatLon(lon0, west)}–${formatLon(Math.min(180, lon0 + oceanGridDeg), west)}, ` +
        `${formatLat(lat0)}–${formatLat(Math.min(90, lat0 + oceanGridDeg))}`;
      name = `${name} (${box('W')})`;
      nameFr = `${nameFr} (${box('O')})`;
    }
    const lp = labelsAt[index] as number;
    const lj = Math.floor(lp / grid.width);
    return {
      index,
      name,
      nameFr,
      kind,
      areaKm2: Math.round((pixels[index] as number) * grid.pixelAreaKm2),
      labelLonLat: lp >= 0 ? pixelLonLat(grid, lp - lj * grid.width, lj) : null,
    };
  });
  return { seaZone, zones };
}

function titleCase(s: string): string {
  // Natural Earth écrit certains océans en capitales (« INDIAN OCEAN »).
  return s === s.toUpperCase()
    ? s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase())
    : s;
}

function formatLon(v: number, west: string): string {
  if (v === 0 || v === 180 || v === -180) return `${Math.abs(v)}°`;
  return `${Math.abs(v)}°${v < 0 ? west : 'E'}`;
}

function formatLat(v: number): string {
  if (v === 0) return '0°';
  return `${Math.abs(v)}°${v < 0 ? 'S' : 'N'}`;
}
