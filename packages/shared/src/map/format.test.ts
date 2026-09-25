import { describe, expect, it } from 'vitest';
import { MAP_LAYERS, createLayers, decodeMap, encodeMap, type MapLayerName } from './format.ts';

const header = {
  width: 7,
  height: 3,
  projection: {
    type: 'equalEarth' as const,
    scale: 1.5,
    translate: [3.5, 1.5] as [number, number],
  },
  pixelAreaKm2: 70.9,
  pixelSideKm: 8.42,
  buildId: 'abc',
};

function sampleLayers() {
  const layers = createLayers(header.width, header.height);
  for (let p = 0; p < header.width * header.height; p++) {
    layers.owner[p] = p * 3;
    layers.sovereign[p] = 65535 - p;
    layers.unit[p] = p;
    layers.terrain[p] = p % 6;
    layers.biome[p] = p % 8;
    layers.elevation[p] = p % 2 === 0 ? -400 + p : 8000 - p;
    layers.urban[p] = 255 - p;
    layers.infrastructure[p] = p % 8;
    layers.seaZone[p] = 1000 + p;
    layers.flags[p] = (1 << (p % 16)) >>> 0;
  }
  return layers;
}

describe('format binaire de la carte', () => {
  it('restitue exactement chaque couche après encodage puis décodage', () => {
    const layers = sampleLayers();
    const bytes = encodeMap(header, layers);
    const map = decodeMap(bytes.buffer);
    expect(map.header).toMatchObject(header);
    for (const name of Object.keys(MAP_LAYERS) as MapLayerName[]) {
      expect(Array.from(map.layers[name])).toEqual(Array.from(layers[name]));
    }
  });

  it('aligne chaque couche sur 8 octets', () => {
    const map = decodeMap(encodeMap(header, sampleLayers()).buffer);
    for (const layer of map.header.layers) expect(layer.byteOffset % 8).toBe(0);
  });

  it('conserve les caractères non ASCII de l’en-tête', () => {
    const map = decodeMap(
      encodeMap({ ...header, buildId: 'Côte d’Ivoire – 漢字' }, sampleLayers()).buffer,
    );
    expect(map.header.buildId).toBe('Côte d’Ivoire – 漢字');
  });

  it('refuse une signature ou une version inconnue', () => {
    const bytes = encodeMap(header, sampleLayers());
    const badMagic = bytes.slice();
    badMagic[0] = 0;
    expect(() => decodeMap(badMagic.buffer)).toThrow(/signature/);
    const badVersion = bytes.slice();
    new DataView(badVersion.buffer).setUint32(4, 99, true);
    expect(() => decodeMap(badVersion.buffer)).toThrow(/Version/);
  });

  it('refuse une couche de taille incohérente', () => {
    const layers = sampleLayers();
    layers.terrain = new Uint8Array(3);
    expect(() => encodeMap(header, layers)).toThrow(/terrain/);
  });
});
