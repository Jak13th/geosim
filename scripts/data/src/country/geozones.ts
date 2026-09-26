/**
 * Zones curées sans effet sur la carte de base (SPEC §4.5) : séparatismes et insurrections
 * (`separatism.geojson`), lignes fortifiées et zones démilitarisées (`fortifications.geojson`),
 * revendications (`claims.geojson`). Comme les zones de contrôle, elles se réfèrent à des zones
 * disputées Natural Earth, à des subdivisions ou à une géométrie propre ; leur effet est simulé
 * par le moteur (phases 4 et 5).
 */
import { checkProvenance, type CuratedProvenance } from '../config.ts';

export interface GeoZone extends CuratedProvenance {
  id: string;
  nameFr: string;
  /** Pays concernés (territoire), ou revendiquants pour une revendication. */
  countries: string[];
  /** Intensité (séparatisme), niveau (fortification) ou intensité de la revendication, 0–100. */
  level: number;
  neDisputed: string[];
  admin1: string[];
  geometry: unknown;
}

export function parseGeoZones(raw: unknown, file: string): GeoZone[] {
  const doc = raw as {
    type?: string;
    features?: { properties?: Record<string, unknown>; geometry?: unknown }[];
  };
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
    const strings = (key: string): string[] => (Array.isArray(p[key]) ? (p[key] as string[]) : []);
    const level = p.level;
    if (typeof level !== 'number' || level < 0 || level > 100)
      throw new Error(`${where} : level 0–100 requis`);
    const zone: GeoZone = {
      ...provenance,
      id,
      nameFr: typeof p.nameFr === 'string' ? p.nameFr : id,
      countries: strings('countries'),
      level,
      neDisputed: strings('ne_disputed'),
      admin1: strings('admin1'),
      geometry: f.geometry ?? null,
    };
    if (zone.countries.length === 0) throw new Error(`${where} : countries requis`);
    if (zone.geometry === null && zone.neDisputed.length === 0 && zone.admin1.length === 0) {
      throw new Error(`${where} : géométrie, ne_disputed ou admin1 requis`);
    }
    return zone;
  });
}

/** Références introuvables (subdivisions, zones disputées, entités). */
export function geoZoneErrors(
  zones: readonly GeoZone[],
  file: string,
  known: { codes: ReadonlySet<string>; admin1: ReadonlySet<string>; disputed: ReadonlySet<string> },
): string[] {
  const errors: string[] = [];
  for (const z of zones) {
    for (const c of z.countries)
      if (!known.codes.has(c)) errors.push(`${file} › ${z.id} : entité inconnue « ${c} »`);
    for (const a of z.admin1)
      if (!known.admin1.has(a)) errors.push(`${file} › ${z.id} : subdivision inconnue « ${a} »`);
    for (const d of z.neDisputed)
      if (!known.disputed.has(d))
        errors.push(`${file} › ${z.id} : zone disputée inconnue « ${d} »`);
  }
  return errors;
}
