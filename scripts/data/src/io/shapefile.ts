/**
 * Lecteur minimal de shapefiles (ESRI) : géométrie `.shp` et attributs `.dbf`.
 * Types gérés : Point, PolyLine, Polygon (et leurs variantes Z et M, dont on ignore z et m),
 * MultiPoint. Écrit à la main plutôt que tiré d'une bibliothèque : le format est simple,
 * et on garde la maîtrise des cas limites (anneaux, parties vides).
 *
 * Coordonnées en degrés (WGS 84 pour Natural Earth) : [longitude, latitude].
 */

export type Position = [number, number];
export type Ring = Position[];

export type ShapeGeometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint'; coordinates: Position[] }
  | { type: 'LineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Ring[] };

export type DbfValue = string | number | boolean | null;

export interface ShapeFeature {
  geometry: ShapeGeometry | null;
  properties: Record<string, DbfValue>;
}

const SHAPE_NULL = 0;
const SHAPE_TYPES: Record<number, 'Point' | 'PolyLine' | 'Polygon' | 'MultiPoint'> = {
  1: 'Point',
  3: 'PolyLine',
  5: 'Polygon',
  8: 'MultiPoint',
  11: 'Point',
  13: 'PolyLine',
  15: 'Polygon',
  18: 'MultiPoint',
  21: 'Point',
  23: 'PolyLine',
  25: 'Polygon',
  28: 'MultiPoint',
};

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Lit les géométries d'un fichier `.shp`, dans l'ordre des enregistrements. */
export function readShp(bytes: Uint8Array): (ShapeGeometry | null)[] {
  const dv = view(bytes);
  if (dv.getInt32(0, false) !== 9994) throw new Error('Fichier .shp invalide (code 9994 absent)');
  const fileLength = dv.getInt32(24, false) * 2;
  const out: (ShapeGeometry | null)[] = [];
  let offset = 100;
  while (offset + 8 <= fileLength && offset + 8 <= bytes.byteLength) {
    const contentLength = dv.getInt32(offset + 4, false) * 2;
    const start = offset + 8;
    out.push(readRecord(dv, start));
    offset = start + contentLength;
  }
  return out;
}

function readRecord(dv: DataView, start: number): ShapeGeometry | null {
  const shapeType = dv.getInt32(start, true);
  if (shapeType === SHAPE_NULL) return null;
  const kind = SHAPE_TYPES[shapeType];
  if (kind === undefined) throw new Error(`Type de forme non géré : ${shapeType}`);

  if (kind === 'Point') {
    return {
      type: 'Point',
      coordinates: [dv.getFloat64(start + 4, true), dv.getFloat64(start + 12, true)],
    };
  }
  if (kind === 'MultiPoint') {
    const numPoints = dv.getInt32(start + 36, true);
    const points: Position[] = [];
    for (let i = 0; i < numPoints; i++) {
      const p = start + 40 + i * 16;
      points.push([dv.getFloat64(p, true), dv.getFloat64(p + 8, true)]);
    }
    return { type: 'MultiPoint', coordinates: points };
  }

  // PolyLine et Polygon partagent la même structure : boîte, parties, points.
  const numParts = dv.getInt32(start + 36, true);
  const numPoints = dv.getInt32(start + 40, true);
  const partsStart = start + 44;
  const pointsStart = partsStart + numParts * 4;
  const parts: Position[][] = [];
  for (let part = 0; part < numParts; part++) {
    const from = dv.getInt32(partsStart + part * 4, true);
    const to = part + 1 < numParts ? dv.getInt32(partsStart + (part + 1) * 4, true) : numPoints;
    const ring: Position[] = [];
    for (let i = from; i < to; i++) {
      const p = pointsStart + i * 16;
      ring.push([dv.getFloat64(p, true), dv.getFloat64(p + 8, true)]);
    }
    if (ring.length > 0) parts.push(ring);
  }
  return kind === 'Polygon'
    ? { type: 'Polygon', coordinates: parts }
    : { type: 'LineString', coordinates: parts };
}

interface DbfField {
  name: string;
  type: string;
  length: number;
  decimals: number;
}

/** Lit la table attributaire d'un fichier `.dbf` (encodage UTF-8 pour Natural Earth). */
export function readDbf(bytes: Uint8Array, encoding = 'utf-8'): Record<string, DbfValue>[] {
  const dv = view(bytes);
  const numRecords = dv.getUint32(4, true);
  const headerLength = dv.getUint16(8, true);
  const recordLength = dv.getUint16(10, true);
  const decoder = new TextDecoder(encoding);

  const fields: DbfField[] = [];
  for (let offset = 32; offset < headerLength - 1 && bytes[offset] !== 0x0d; offset += 32) {
    const nameBytes = bytes.subarray(offset, offset + 11);
    const end = nameBytes.indexOf(0);
    fields.push({
      name: decoder.decode(end >= 0 ? nameBytes.subarray(0, end) : nameBytes).trim(),
      type: String.fromCharCode(bytes[offset + 11] ?? 0x43),
      length: bytes[offset + 16] ?? 0,
      decimals: bytes[offset + 17] ?? 0,
    });
  }

  const records: Record<string, DbfValue>[] = [];
  for (let r = 0; r < numRecords; r++) {
    let offset = headerLength + r * recordLength + 1; // premier octet : marqueur de suppression
    const record: Record<string, DbfValue> = {};
    for (const field of fields) {
      const raw = decoder
        .decode(bytes.subarray(offset, offset + field.length))
        .replace(/\0/g, '')
        .trim();
      record[field.name] = parseDbfValue(raw, field.type);
      offset += field.length;
    }
    records.push(record);
  }
  return records;
}

function parseDbfValue(raw: string, type: string): DbfValue {
  switch (type) {
    case 'N':
    case 'F': {
      if (raw === '' || raw.startsWith('*')) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'L':
      if ('YyTt'.includes(raw)) return true;
      if ('NnFf'.includes(raw)) return false;
      return null;
    default:
      return raw === '' ? null : raw;
  }
}

/** Associe géométries et attributs (même ordre d'enregistrement). */
export function readShapefile(shp: Uint8Array, dbf: Uint8Array, encoding?: string): ShapeFeature[] {
  const geometries = readShp(shp);
  const records = readDbf(dbf, encoding);
  if (geometries.length !== records.length) {
    throw new Error(
      `Shapefile incohérent : ${geometries.length} géométries pour ${records.length} enregistrements`,
    );
  }
  return geometries.map((geometry, i) => ({ geometry, properties: records[i] ?? {} }));
}
