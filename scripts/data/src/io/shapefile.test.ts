import { describe, expect, it } from 'vitest';
import { readDbf, readShapefile, readShp } from './shapefile.ts';

/** Construit un .shp minimal : enregistrements Point (type 1) ou Polygon (type 5). */
function buildShp(
  records: ({ point: [number, number] } | { rings: [number, number][][] } | null)[],
): Uint8Array {
  const bodies = records.map((r) => {
    if (r === null) {
      const b = new DataView(new ArrayBuffer(4));
      b.setInt32(0, 0, true);
      return new Uint8Array(b.buffer);
    }
    if ('point' in r) {
      const b = new DataView(new ArrayBuffer(20));
      b.setInt32(0, 1, true);
      b.setFloat64(4, r.point[0], true);
      b.setFloat64(12, r.point[1], true);
      return new Uint8Array(b.buffer);
    }
    const points = r.rings.flat();
    const b = new DataView(new ArrayBuffer(44 + 4 * r.rings.length + 16 * points.length));
    b.setInt32(0, 5, true);
    b.setInt32(36, r.rings.length, true);
    b.setInt32(40, points.length, true);
    let start = 0;
    r.rings.forEach((ring, k) => {
      b.setInt32(44 + 4 * k, start, true);
      start += ring.length;
    });
    points.forEach(([x, y], k) => {
      b.setFloat64(44 + 4 * r.rings.length + 16 * k, x, true);
      b.setFloat64(44 + 4 * r.rings.length + 16 * k + 8, y, true);
    });
    return new Uint8Array(b.buffer);
  });
  const total = 100 + bodies.reduce((s, b) => s + 8 + b.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setInt32(0, 9994, false);
  v.setInt32(24, total / 2, false);
  let offset = 100;
  bodies.forEach((body, k) => {
    v.setInt32(offset, k + 1, false);
    v.setInt32(offset + 4, body.length / 2, false);
    out.set(body, offset + 8);
    offset += 8 + body.length;
  });
  return out;
}

/** Construit un .dbf minimal avec des champs texte (C) et numériques (N). */
function buildDbf(
  fields: { name: string; type: 'C' | 'N'; length: number }[],
  rows: string[][],
): Uint8Array {
  const headerLength = 32 + 32 * fields.length + 1;
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const out = new Uint8Array(headerLength + recordLength * rows.length + 1);
  const v = new DataView(out.buffer);
  v.setUint32(4, rows.length, true);
  v.setUint16(8, headerLength, true);
  v.setUint16(10, recordLength, true);
  const enc = new TextEncoder();
  fields.forEach((f, k) => {
    out.set(enc.encode(f.name), 32 + 32 * k);
    out[32 + 32 * k + 11] = f.type.charCodeAt(0);
    out[32 + 32 * k + 16] = f.length;
  });
  out[headerLength - 1] = 0x0d;
  rows.forEach((row, r) => {
    let offset = headerLength + r * recordLength;
    out[offset++] = 0x20;
    fields.forEach((f, k) => {
      const bytes = enc.encode((row[k] ?? '').padEnd(f.length, ' '));
      out.set(bytes.subarray(0, f.length), offset);
      offset += f.length;
    });
  });
  return out;
}

describe('lecteur de shapefiles', () => {
  it('lit points, polygones à trous et enregistrements vides', () => {
    const square: [number, number][] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const hole: [number, number][] = [
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
      [2, 2],
    ];
    const geometries = readShp(
      buildShp([{ point: [2.35, 48.85] }, { rings: [square, hole] }, null]),
    );
    expect(geometries[0]).toEqual({ type: 'Point', coordinates: [2.35, 48.85] });
    expect(geometries[1]).toEqual({ type: 'Polygon', coordinates: [square, hole] });
    expect(geometries[2]).toBeNull();
  });

  it('lit les attributs texte (UTF-8) et numériques, -99 et vides compris', () => {
    const dbf = buildDbf(
      [
        { name: 'NAME', type: 'C', length: 12 },
        { name: 'POP', type: 'N', length: 8 },
      ],
      [
        ['Côte', '1500'],
        ['', ''],
      ],
    );
    expect(readDbf(dbf)).toEqual([
      { NAME: 'Côte', POP: 1500 },
      { NAME: null, POP: null },
    ]);
  });

  it('refuse un shapefile dont géométries et attributs ne correspondent pas', () => {
    const shp = buildShp([{ point: [0, 0] }]);
    const dbf = buildDbf([{ name: 'A', type: 'C', length: 2 }], []);
    expect(() => readShapefile(shp, dbf)).toThrow(/incohérent/);
    expect(() => readShp(new Uint8Array(100))).toThrow(/9994/);
  });
});
