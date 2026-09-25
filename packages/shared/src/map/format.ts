/**
 * Format binaire de la carte (`data/build/map/map-<résolution>.bin.gz` une fois compressé).
 *
 * Disposition (petit-boutiste) :
 *   0   'GSMP'                      signature
 *   4   u32  version du format
 *   8   u32  longueur L de l'en-tête JSON
 *   12  en-tête JSON (ASCII : les caractères non ASCII sont échappés en \uXXXX)
 *   …   couches, chacune alignée sur 8 octets, aux positions données par l'en-tête
 *
 * Encodage et décodage sont purs (ni DOM ni Node) : la décompression gzip est faite par
 * l'appelant (zlib dans la CLI, DecompressionStream dans le navigateur).
 */

export const MAP_FORMAT_VERSION = 1;
const MAGIC = [0x47, 0x53, 0x4d, 0x50]; // 'GSMP'

export type LayerType = 'u8' | 'u16' | 'i16' | 'f32';

/** Couches de la grille pleine et leur type (SPEC §4.1). */
export const MAP_LAYERS = {
  /** Contrôle de facto (index d'entité, 0 = aucun). */
  owner: 'u16',
  /** Souveraineté de jure (index d'entité). */
  sovereign: 'u16',
  /** Unité Natural Earth d'origine (pays ou territoire dépendant), pour l'autonomie et les noms. */
  unit: 'u16',
  terrain: 'u8',
  biome: 'u8',
  /** Altitude en mètres (0 en mer). */
  elevation: 'i16',
  /** Part urbanisée du pixel, 0–255. */
  urban: 'u8',
  infrastructure: 'u8',
  seaZone: 'u16',
  flags: 'u16',
} as const satisfies Record<string, LayerType>;

export type MapLayerName = keyof typeof MAP_LAYERS;

type ArrayOf<T extends LayerType> = T extends 'u8'
  ? Uint8Array
  : T extends 'u16'
    ? Uint16Array
    : T extends 'i16'
      ? Int16Array
      : Float32Array;

export type MapLayers = { [K in MapLayerName]: ArrayOf<(typeof MAP_LAYERS)[K]> };

export interface MapProjection {
  type: 'equalEarth';
  /** Échelle d3-geo : pixels par rayon terrestre. */
  scale: number;
  /** Translation d3-geo, en pixels. */
  translate: [number, number];
}

export interface MapHeader {
  width: number;
  height: number;
  projection: MapProjection;
  /** Surface représentée par un pixel (projection à surface égale), en km². */
  pixelAreaKm2: number;
  /** Côté équivalent d'un pixel, en km (racine de la surface). */
  pixelSideKm: number;
  /** Identifiant du build, repris dans les fichiers JSON associés. */
  buildId: string;
  layers: { name: MapLayerName; type: LayerType; byteOffset: number; byteLength: number }[];
}

export interface MapGrid {
  header: MapHeader;
  layers: MapLayers;
}

const BYTES: Record<LayerType, number> = { u8: 1, u16: 2, i16: 2, f32: 4 };

export function createLayers(width: number, height: number): MapLayers {
  const n = width * height;
  return {
    owner: new Uint16Array(n),
    sovereign: new Uint16Array(n),
    unit: new Uint16Array(n),
    terrain: new Uint8Array(n),
    biome: new Uint8Array(n),
    elevation: new Int16Array(n),
    urban: new Uint8Array(n),
    infrastructure: new Uint8Array(n),
    seaZone: new Uint16Array(n),
    flags: new Uint16Array(n),
  };
}

function align8(n: number): number {
  return (n + 7) & ~7;
}

/** JSON en ASCII pur : les caractères non ASCII sont échappés, le décodage n'a pas besoin de TextDecoder. */
function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u0080-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export function encodeMap(
  header: Omit<MapHeader, 'layers'>,
  layers: MapLayers,
): Uint8Array<ArrayBuffer> {
  const n = header.width * header.height;
  const names = Object.keys(MAP_LAYERS) as MapLayerName[];
  const entries: MapHeader['layers'] = [];

  // Les positions dépendent de la longueur de l'en-tête, qui dépend des positions :
  // on itère jusqu'à stabilité (deux passes suffisent en pratique).
  let headerText = '';
  let dataStart = 0;
  for (let pass = 0; pass < 4; pass++) {
    entries.length = 0;
    let offset = dataStart;
    for (const name of names) {
      const type = MAP_LAYERS[name];
      const byteLength = n * BYTES[type];
      entries.push({ name, type, byteOffset: offset, byteLength });
      offset = align8(offset + byteLength);
    }
    headerText = asciiJson({ ...header, layers: entries });
    const nextStart = align8(12 + headerText.length);
    if (nextStart === dataStart) break;
    dataStart = nextStart;
  }

  const last = entries[entries.length - 1];
  const total = last ? align8(last.byteOffset + last.byteLength) : dataStart;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint32(4, MAP_FORMAT_VERSION, true);
  view.setUint32(8, headerText.length, true);
  for (let i = 0; i < headerText.length; i++) out[12 + i] = headerText.charCodeAt(i);
  for (const entry of entries) {
    const layer = layers[entry.name];
    if (layer.length !== n) throw new Error(`Couche ${entry.name} : taille ${layer.length} ≠ ${n}`);
    out.set(new Uint8Array(layer.buffer, layer.byteOffset, entry.byteLength), entry.byteOffset);
  }
  return out;
}

export function decodeMap(buffer: ArrayBuffer): MapGrid {
  const bytes = new Uint8Array(buffer);
  if (MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('Carte invalide : signature absente');
  const view = new DataView(buffer);
  const version = view.getUint32(4, true);
  if (version !== MAP_FORMAT_VERSION) {
    throw new Error(`Version de carte ${version} non gérée (attendue : ${MAP_FORMAT_VERSION})`);
  }
  const headerLength = view.getUint32(8, true);
  let text = '';
  const chunk = 8192;
  for (let i = 0; i < headerLength; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(12 + i, 12 + Math.min(headerLength, i + chunk)));
  }
  const header = JSON.parse(text) as MapHeader;
  const n = header.width * header.height;
  const layers = createLayers(0, 0) as unknown as Record<MapLayerName, ArrayBufferView>;
  for (const entry of header.layers) {
    if (MAP_LAYERS[entry.name] !== entry.type) {
      throw new Error(`Couche ${entry.name} : type ${entry.type} inattendu`);
    }
    if (entry.byteOffset % 8 !== 0 || entry.byteOffset + entry.byteLength > buffer.byteLength) {
      throw new Error(`Couche ${entry.name} : position invalide`);
    }
    layers[entry.name] = viewOf(buffer, entry.type, entry.byteOffset, n);
  }
  for (const name of Object.keys(MAP_LAYERS) as MapLayerName[]) {
    if (layers[name].byteLength !== n * BYTES[MAP_LAYERS[name]]) {
      throw new Error(`Couche ${name} absente ou tronquée`);
    }
  }
  return { header, layers: layers as unknown as MapLayers };
}

function viewOf(buffer: ArrayBuffer, type: LayerType, offset: number, n: number): ArrayBufferView {
  switch (type) {
    case 'u8':
      return new Uint8Array(buffer, offset, n);
    case 'u16':
      return new Uint16Array(buffer, offset, n);
    case 'i16':
      return new Int16Array(buffer, offset, n);
    case 'f32':
      return new Float32Array(buffer, offset, n);
  }
}
