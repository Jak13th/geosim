/**
 * Couches compactées sur les pixels terrestres (DECISIONS D7) : population et valeur économique.
 * Fichier `data/build/map/land-<résolution>.bin.gz` une fois compressé.
 *
 * L'ordre des valeurs est celui des pixels terrestres (terrain ≥ plaine) par index croissant :
 * la table d'index se reconstruit depuis la couche `terrain` de la carte (`landIndex`).
 *
 * Disposition (petit-boutiste) :
 *   0   'GSLD'            signature
 *   4   u32  version
 *   8   u32  longueur L de l'en-tête JSON (ASCII)
 *   12  en-tête JSON      { buildId, count, layers: [{ name, byteOffset, byteLength }] }
 *   …   couches Float32, alignées sur 8 octets
 */
import { isLand } from './layers.ts';

export const LAND_FORMAT_VERSION = 1;
const MAGIC = [0x47, 0x53, 0x4c, 0x44]; // 'GSLD'

export const LAND_LAYERS = {
  /** Habitants par pixel. */
  population: 'f32',
  /** Valeur économique par pixel, en millions de dollars courants de PIB annuel. */
  economicValue: 'f32',
} as const;

export type LandLayerName = keyof typeof LAND_LAYERS;
export type LandLayers = Record<LandLayerName, Float32Array>;

export interface LandHeader {
  buildId: string;
  count: number;
  layers: { name: LandLayerName; byteOffset: number; byteLength: number }[];
}

/** Index des pixels terrestres (dans l'ordre des couches compactées). */
export function landIndex(terrain: Uint8Array): Int32Array {
  let count = 0;
  for (let p = 0; p < terrain.length; p++) if (isLand(terrain[p] as number)) count++;
  const out = new Int32Array(count);
  let k = 0;
  for (let p = 0; p < terrain.length; p++) if (isLand(terrain[p] as number)) out[k++] = p;
  return out;
}

const align8 = (n: number): number => (n + 7) & ~7;

export function encodeLand(buildId: string, layers: LandLayers): Uint8Array<ArrayBuffer> {
  const names = Object.keys(LAND_LAYERS) as LandLayerName[];
  const count = layers.population.length;
  let headerText = '';
  let dataStart = 0;
  const entries: LandHeader['layers'] = [];
  for (let pass = 0; pass < 4; pass++) {
    entries.length = 0;
    let offset = dataStart;
    for (const name of names) {
      if (layers[name].length !== count) throw new Error(`Couche ${name} : taille incohérente`);
      entries.push({ name, byteOffset: offset, byteLength: count * 4 });
      offset = align8(offset + count * 4);
    }
    headerText = JSON.stringify({ buildId, count, layers: entries });
    const next = align8(12 + headerText.length);
    if (next === dataStart) break;
    dataStart = next;
  }
  const last = entries[entries.length - 1] as LandHeader['layers'][number];
  const out = new Uint8Array(align8(last.byteOffset + last.byteLength));
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint32(4, LAND_FORMAT_VERSION, true);
  view.setUint32(8, headerText.length, true);
  for (let i = 0; i < headerText.length; i++) out[12 + i] = headerText.charCodeAt(i) & 0x7f;
  for (const e of entries) {
    const layer = layers[e.name];
    out.set(new Uint8Array(layer.buffer, layer.byteOffset, e.byteLength), e.byteOffset);
  }
  return out;
}

export function decodeLand(buffer: ArrayBuffer): { header: LandHeader; layers: LandLayers } {
  const bytes = new Uint8Array(buffer);
  if (MAGIC.some((b, i) => bytes[i] !== b))
    throw new Error('Couches terrestres invalides : signature absente');
  const view = new DataView(buffer);
  const version = view.getUint32(4, true);
  if (version !== LAND_FORMAT_VERSION) throw new Error(`Version ${version} non gérée`);
  const length = view.getUint32(8, true);
  let text = '';
  for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[12 + i] as number);
  const header = JSON.parse(text) as LandHeader;
  const layers = {} as LandLayers;
  for (const e of header.layers) {
    if (e.byteOffset % 8 !== 0 || e.byteOffset + e.byteLength > buffer.byteLength) {
      throw new Error(`Couche ${e.name} : position invalide`);
    }
    layers[e.name] = new Float32Array(buffer, e.byteOffset, header.count);
  }
  for (const name of Object.keys(LAND_LAYERS) as LandLayerName[]) {
    if (layers[name] === undefined) throw new Error(`Couche ${name} absente`);
  }
  return { header, layers };
}
