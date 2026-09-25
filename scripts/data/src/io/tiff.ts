/** Lecture des grilles GeoTIFF de WorldClim (géographiques, pas régulier en degrés). */
import { fromArrayBuffer } from 'geotiff';

export interface Raster {
  width: number;
  height: number;
  data: Float32Array;
  /** Longitude du bord ouest et latitude du bord nord, en degrés. */
  west: number;
  north: number;
  /** Pas en degrés (longitude et latitude). */
  resLon: number;
  resLat: number;
}

/** Lit la première bande ; les cellules sans donnée valent NaN. */
export async function readGeoTiff(bytes: Uint8Array): Promise<Raster> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const tiff = await fromArrayBuffer(buffer as ArrayBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const [west, , , north] = image.getBoundingBox();
  const [resLon, resLat] = image.getResolution();
  const noData = image.getGDALNoData();
  const [band] = (await image.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
  if (band === undefined) throw new Error('GeoTIFF sans bande');
  const data = new Float32Array(width * height);
  for (let k = 0; k < data.length; k++) {
    const v = band[k] as number;
    data[k] = (noData !== null && v === noData) || !Number.isFinite(v) || v < -1e30 ? NaN : v;
  }
  return {
    width,
    height,
    data,
    west: west ?? -180,
    north: north ?? 90,
    resLon: Math.abs(resLon ?? 1),
    resLat: Math.abs(resLat ?? 1),
  };
}

/** Valeur de la cellule contenant [lon, lat] (NaN hors grille ou sans donnée). */
export function sampleNearest(r: Raster, lon: number, lat: number): number {
  const i = Math.floor((lon - r.west) / r.resLon);
  const j = Math.floor((r.north - lat) / r.resLat);
  if (i < 0 || j < 0 || i >= r.width || j >= r.height) return NaN;
  return r.data[j * r.width + i] as number;
}

/**
 * Valeur de la cellule la plus proche ayant une donnée, dans un rayon de `radius` cellules :
 * sert aux pixels côtiers, où le trait de côte de la carte et celui de WorldClim diffèrent.
 */
export function sampleNearestValid(r: Raster, lon: number, lat: number, radius: number): number {
  const i0 = Math.floor((lon - r.west) / r.resLon);
  const j0 = Math.floor((r.north - lat) / r.resLat);
  let best = NaN;
  let bestD = Infinity;
  for (let dj = -radius; dj <= radius; dj++) {
    const j = j0 + dj;
    if (j < 0 || j >= r.height) continue;
    for (let di = -radius; di <= radius; di++) {
      const i = (((i0 + di) % r.width) + r.width) % r.width;
      const v = r.data[j * r.width + i] as number;
      const d = di * di + dj * dj;
      if (!Number.isNaN(v) && d < bestD) {
        best = v;
        bestD = d;
      }
    }
  }
  return best;
}

/** Relief local : altitude max − min dans une fenêtre carrée de rayon `radius` cellules. */
export function localRelief(r: Raster, radius: number): Float32Array {
  const out = new Float32Array(r.width * r.height).fill(NaN);
  for (let j = 0; j < r.height; j++) {
    for (let i = 0; i < r.width; i++) {
      if (Number.isNaN(r.data[j * r.width + i] as number)) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dj = -radius; dj <= radius; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= r.height) continue;
        for (let di = -radius; di <= radius; di++) {
          const ii = (((i + di) % r.width) + r.width) % r.width;
          const v = r.data[jj * r.width + ii] as number;
          if (Number.isNaN(v)) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      out[j * r.width + i] = hi - lo;
    }
  }
  return out;
}
