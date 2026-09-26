/**
 * Rattachement des unités Natural Earth aux entités de GeoSim (DECISIONS D5, D18),
 * selon les règles et exceptions de data/curated/ne_units.yaml.
 */
import type { ShapeFeature } from '../io/shapefile.ts';
import { num, str } from '../io/naturalEarth.ts';
import { checkProvenance, type CuratedProvenance } from '../config.ts';

export type EntityKind = 'state' | 'de_facto' | 'faction';

export interface EntityDef {
  /** Index dans les couches `owner` et `sovereign` (1…N ; 0 = aucun). */
  index: number;
  /** Code GeoSim (ISO 3166-1 alpha-3 quand il existe). */
  id: string;
  name: string;
  nameFr: string;
  kind: EntityKind;
  /** Code Natural Earth (ADM0_A3) de l'unité principale ('' pour une entité sans unité propre). */
  neA3: string;
  provenance: CuratedProvenance | null;
}

export type UnitRole = 'main' | 'dependency' | 'special';

export interface UnitDef {
  /** Index dans la couche `unit` (1…M ; 0 = eau). */
  index: number;
  neA3: string;
  name: string;
  nameFr: string;
  /** Type Natural Earth (Sovereign country, Dependency, Lease…). */
  neType: string;
  role: UnitRole;
  /** Entité qui contrôle l'unité (index), 0 si terre neutre. */
  owner: number;
  sovereign: number;
  /** Partage par proximité entre ces entités (index), si défini. */
  split: number[];
  labelLonLat: [number, number] | null;
  provenance: CuratedProvenance | null;
  note: string | null;
}

export interface CuratedUnits {
  codes: Record<string, { value: string } & CuratedProvenance>;
  kinds: Record<string, { value: EntityKind } & CuratedProvenance>;
  promote: Record<string, { value: string; kind: EntityKind } & CuratedProvenance>;
  units: Record<
    string,
    { owner?: string | null; sovereign?: string | null; split?: string[] } & CuratedProvenance
  >;
  capitals: Record<string, { value: string; lonlat?: [number, number] } & CuratedProvenance>;
}

/** Valide la structure et la provenance du fichier curé. */
export function parseCuratedUnits(raw: unknown): CuratedUnits {
  const doc = raw as Partial<CuratedUnits> & { version?: number };
  if (doc?.version !== 1) throw new Error('ne_units.yaml : version 1 attendue');
  const sections = ['codes', 'kinds', 'promote', 'units', 'capitals'] as const;
  for (const section of sections) {
    const entries = doc[section];
    if (typeof entries !== 'object' || entries === null) {
      throw new Error(`ne_units.yaml : section « ${section} » absente`);
    }
    for (const [key, entry] of Object.entries(entries)) {
      checkProvenance(entry, `ne_units.yaml › ${section}.${key}`);
    }
  }
  for (const [key, entry] of Object.entries(doc.capitals ?? {})) {
    const ll = entry.lonlat;
    if (
      ll !== undefined &&
      !(Array.isArray(ll) && ll.length === 2 && Math.abs(ll[0]) <= 180 && Math.abs(ll[1]) <= 90)
    ) {
      throw new Error(`ne_units.yaml › capitals.${key} : lonlat [lon, lat] invalide`);
    }
  }
  for (const [key, entry] of Object.entries(doc.kinds ?? {})) {
    if (entry.value !== 'state' && entry.value !== 'de_facto') {
      throw new Error(`ne_units.yaml › kinds.${key} : state ou de_facto attendu`);
    }
  }
  return doc as CuratedUnits;
}

export interface EntityTable {
  entities: EntityDef[];
  units: UnitDef[];
  /** Index d'entité par code GeoSim. */
  entityIndex: Map<string, number>;
  /** Index d'unité par numéro d'entité Natural Earth (ordre du shapefile). */
  unitOfFeature: number[];
}

/** Construit les tables d'entités et d'unités. Toute incohérence lève une erreur explicite. */
export function buildEntities(
  features: readonly ShapeFeature[],
  curated: CuratedUnits,
): EntityTable {
  const a3 = (f: ShapeFeature): string => str(f, 'ADM0_A3') ?? '';
  const isMain = (f: ShapeFeature): boolean =>
    str(f, 'ADMIN') === str(f, 'SOVEREIGNT') && !(a3(f) in curated.units);

  // 1. Entités : unités principales, puis unités promues.
  const entities: EntityDef[] = [];
  const entityIndex = new Map<string, number>();
  const sovToEntity = new Map<string, number>();
  const addEntity = (
    feature: ShapeFeature,
    id: string,
    kind: EntityKind,
    provenance: CuratedProvenance | null,
  ): number => {
    if (entityIndex.has(id)) throw new Error(`Entité en double : ${id}`);
    const index = entities.length + 1;
    entities.push({
      index,
      id,
      name: str(feature, 'NAME_EN') ?? str(feature, 'ADMIN') ?? id,
      nameFr: str(feature, 'NAME_FR') ?? str(feature, 'ADMIN') ?? id,
      kind,
      neA3: a3(feature),
      provenance,
    });
    entityIndex.set(id, index);
    return index;
  };

  const mainFeatures = features.filter(isMain).sort((x, y) => codeOf(x).localeCompare(codeOf(y)));
  function codeOf(f: ShapeFeature): string {
    const override = curated.codes[a3(f)];
    if (override) return override.value;
    const iso = str(f, 'ISO_A3_EH');
    if (iso === null) throw new Error(`Unité principale sans code ISO ni code curé : ${a3(f)}`);
    return iso;
  }
  for (const feature of mainFeatures) {
    const id = codeOf(feature);
    const kind = curated.kinds[id];
    const index = addEntity(feature, id, kind?.value ?? 'state', kind ?? null);
    const sov = str(feature, 'SOV_A3');
    if (sov === null) throw new Error(`Unité principale sans SOV_A3 : ${a3(feature)}`);
    sovToEntity.set(sov, index);
  }
  for (const [neA3, promotion] of Object.entries(curated.promote)) {
    const feature = features.find((f) => a3(f) === neA3);
    if (!feature) throw new Error(`ne_units.yaml › promote.${neA3} : unité introuvable`);
    addEntity(feature, promotion.value, promotion.kind, promotion);
  }
  for (const id of Object.keys(curated.kinds)) {
    if (!entityIndex.has(id)) throw new Error(`ne_units.yaml › kinds.${id} : entité inconnue`);
  }

  // 2. Unités : chacune rattachée à une entité (ou neutre).
  const resolve = (code: string | null | undefined, where: string): number => {
    if (code === null || code === undefined) return 0;
    const index = entityIndex.get(code);
    if (index === undefined) throw new Error(`${where} : entité inconnue « ${code} »`);
    return index;
  };
  const units: UnitDef[] = [];
  const unitOfFeature: number[] = [];
  features.forEach((feature) => {
    const neA3 = a3(feature);
    const special = curated.units[neA3];
    const promoted = curated.promote[neA3];
    let role: UnitRole;
    let owner: number;
    let sovereign: number;
    let split: number[] = [];
    let provenance: CuratedProvenance | null = null;
    if (special) {
      role = 'special';
      const where = `ne_units.yaml › units.${neA3}`;
      split = (special.split ?? []).map((code) => resolve(code, where));
      owner = resolve(special.owner, where);
      sovereign = special.sovereign === undefined ? owner : resolve(special.sovereign, where);
      provenance = special;
    } else if (promoted) {
      role = 'main';
      owner = sovereign = resolve(promoted.value, `ne_units.yaml › promote.${neA3}`);
      provenance = promoted;
    } else if (isMain(feature)) {
      role = 'main';
      owner = sovereign = resolve(codeOf(feature), neA3);
    } else {
      role = 'dependency';
      const sov = str(feature, 'SOV_A3') ?? '';
      const index = sovToEntity.get(sov);
      if (index === undefined) {
        throw new Error(
          `Unité ${neA3} : État souverain ${sov} introuvable (à traiter dans ne_units.yaml)`,
        );
      }
      owner = sovereign = index;
    }
    const labelX = num(feature, 'LABEL_X');
    const labelY = num(feature, 'LABEL_Y');
    const index = units.length + 1;
    units.push({
      index,
      neA3,
      name: str(feature, 'NAME_EN') ?? str(feature, 'ADMIN') ?? neA3,
      nameFr: str(feature, 'NAME_FR') ?? str(feature, 'ADMIN') ?? neA3,
      neType: str(feature, 'TYPE') ?? '',
      role,
      owner,
      sovereign,
      split,
      labelLonLat: labelX !== null && labelY !== null ? [labelX, labelY] : null,
      provenance,
      note: provenance?.note ?? str(feature, 'NOTE_BRK'),
    });
    unitOfFeature.push(index);
  });

  return { entities, units, entityIndex, unitOfFeature };
}

/** Entité sans unité Natural Earth propre, née d'une zone de contrôle (data/curated/entities.yaml). */
export interface ExtraEntityDef {
  id: string;
  name: string;
  nameFr: string;
  kind: 'de_facto' | 'faction';
  capital: { name: string; lonlat: [number, number] };
  provenance: CuratedProvenance;
}

/**
 * Ajoute les entités de facto et les factions qui n'ont pas d'unité Natural Earth (Abkhazie,
 * factions des guerres civiles…). Leurs pixels viennent des zones de contrôle ; leur capitale est
 * ajoutée aux capitales curées.
 */
export function appendExtraEntities(
  table: EntityTable,
  curated: CuratedUnits,
  extras: readonly ExtraEntityDef[],
): void {
  for (const x of extras) {
    if (table.entityIndex.has(x.id))
      throw new Error(`entities.yaml › ${x.id} : entité déjà définie`);
    const index = table.entities.length + 1;
    table.entities.push({
      index,
      id: x.id,
      name: x.name,
      nameFr: x.nameFr,
      kind: x.kind,
      neA3: '',
      provenance: x.provenance,
    });
    table.entityIndex.set(x.id, index);
    curated.capitals[x.id] = { value: x.capital.name, lonlat: x.capital.lonlat, ...x.provenance };
  }
}
