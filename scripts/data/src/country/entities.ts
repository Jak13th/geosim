/**
 * Liste des entités pour les données pays : entités de la carte (Natural Earth + ne_units.yaml)
 * et entités sans unité propre (entities.yaml), avec leur région et leur groupe de revenu
 * (Banque mondiale, sinon curés) et leur niveau de détail (DECISIONS D6).
 */
import { join } from 'node:path';
import { checkProvenance, loadYaml } from '../config.ts';
import { loadNaturalEarth } from '../io/naturalEarth.ts';
import {
  appendExtraEntities,
  buildEntities,
  parseCuratedUnits,
  type EntityTable,
  type ExtraEntityDef,
} from '../map/entities.ts';
import type { EntityInfo } from './context.ts';
import type { WbCountryMeta } from './providers.ts';
import type { EntityMeta, ExtraEntity } from './topics.ts';

export interface EntitiesFile {
  fullDetail: string[];
  extra: (ExtraEntity & { capital: { name: string; lonlat: [number, number] } })[];
  meta: Record<string, EntityMeta>;
}

export async function loadEntitiesFile(curatedDir: string): Promise<EntitiesFile> {
  const raw = (await loadYaml(join(curatedDir, 'entities.yaml'))) as {
    version?: number;
    full_detail?: string[];
    extra?: EntitiesFile['extra'];
    meta?: Record<string, EntityMeta>;
  };
  if (raw?.version !== 1) throw new Error('entities.yaml : version 1 attendue');
  const extra = raw.extra ?? [];
  extra.forEach((x, k) => {
    checkProvenance(x, `entities.yaml › extra[${k}]`);
    const ll = x.capital?.lonlat;
    if (!x.capital?.name || !Array.isArray(ll) || ll.length !== 2) {
      throw new Error(`entities.yaml › ${x.id} : capitale { name, lonlat } requise`);
    }
  });
  for (const [code, m] of Object.entries(raw.meta ?? {}))
    checkProvenance(m, `entities.yaml › meta.${code}`);
  return { fullDetail: raw.full_detail ?? [], extra, meta: raw.meta ?? {} };
}

export function extraEntityDefs(file: EntitiesFile): ExtraEntityDef[] {
  return file.extra.map((x) => ({
    id: x.id,
    name: x.name,
    nameFr: x.nameFr,
    kind: x.kind,
    capital: x.capital,
    provenance: {
      source: x.source,
      date: x.date,
      confidence: x.confidence,
      ...(x.note ? { note: x.note } : {}),
    },
  }));
}

/** Table des entités, identique à celle de la carte (mêmes index). */
export async function loadEntityTable(
  countriesZip: string,
  curatedDir: string,
  file: EntitiesFile,
): Promise<EntityTable> {
  const curated = parseCuratedUnits(await loadYaml(join(curatedDir, 'ne_units.yaml')));
  const countries = await loadNaturalEarth(countriesZip);
  const table = buildEntities(countries.features, curated);
  appendExtraEntities(table, curated, extraEntityDefs(file));
  return table;
}

export function entityInfos(
  table: EntityTable,
  file: EntitiesFile,
  wbMeta: ReadonlyMap<string, WbCountryMeta>,
): { entities: EntityInfo[]; errors: string[] } {
  const errors: string[] = [];
  const entities: EntityInfo[] = table.entities.map((e) => {
    const extra = file.extra.find((x) => x.id === e.id);
    const meta = file.meta[e.id];
    const wb = wbMeta.get(e.id);
    const region = meta?.region ?? extra?.region ?? wb?.region ?? null;
    const income = meta?.income ?? extra?.income ?? wb?.income ?? null;
    if (region === null || income === null) {
      errors.push(
        `${e.id} : région ou groupe de revenu inconnu (à compléter dans entities.yaml › meta)`,
      );
    }
    return {
      index: e.index,
      id: e.id,
      name: e.name,
      nameFr: e.nameFr,
      kind: e.kind,
      detail: file.fullDetail.includes(e.id) ? 'full' : 'standard',
      region: region ?? 'NA',
      income: income ?? 'NA',
      classification: meta || extra || !wb?.region || !wb?.income ? 'curated' : 'world_bank',
      parent: extra?.parent ?? null,
    };
  });
  for (const id of file.fullDetail) {
    if (!table.entityIndex.has(id))
      errors.push(`entities.yaml › full_detail : entité inconnue « ${id} »`);
  }
  return { entities, errors };
}
