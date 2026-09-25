/** Lecture d'une couche Natural Earth depuis son archive ZIP (shapefile + VERSION.txt). */
import { readZip } from './zip.ts';
import { readShapefile, type ShapeFeature } from './shapefile.ts';

export interface NaturalEarthLayer {
  features: ShapeFeature[];
  /** Version relue dans l'archive (ex. `5.1.1`), ou null si absente. */
  version: string | null;
}

export async function loadNaturalEarth(zipPath: string): Promise<NaturalEarthLayer> {
  const files = await readZip(zipPath, (name) => /\.(shp|dbf|cpg|txt)$/i.test(name));
  const find = (suffix: string): Uint8Array | undefined => {
    for (const [name, bytes] of files) if (name.toLowerCase().endsWith(suffix)) return bytes;
    return undefined;
  };
  const shp = find('.shp');
  const dbf = find('.dbf');
  if (shp === undefined || dbf === undefined) {
    throw new Error(`Archive Natural Earth incomplète : ${zipPath}`);
  }
  const cpg = find('.cpg');
  const encoding = cpg ? new TextDecoder().decode(cpg).trim().toLowerCase() : 'utf-8';
  const versionFile = find('version.txt');
  return {
    features: readShapefile(
      shp,
      dbf,
      encoding === 'utf-8' || encoding === 'utf8' ? 'utf-8' : encoding,
    ),
    version: versionFile ? new TextDecoder().decode(versionFile).trim() : null,
  };
}

/** Lecture typée d'un attribut texte (null si absent ou valeur « -99 » de Natural Earth). */
export function str(feature: ShapeFeature, key: string): string | null {
  const v = feature.properties[key];
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === '-99' || s === '' ? null : s;
}

export function num(feature: ShapeFeature, key: string): number | null {
  const v = feature.properties[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
