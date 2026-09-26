/**
 * Vue en lecture seule des données chargées : entités indexées comme sur la carte, valeurs des
 * paramètres avec leur provenance, paramètres bilatéraux, couleurs politiques et emprises.
 */
import { derivationOf, deriveValue } from '@geosim/engine';
import {
  type CountryRecord,
  type EntityKind,
  type MapEntity,
  type PairProvenance,
  type ParamValue,
  type ResolvedValue,
} from '@geosim/shared';
import { POLITICAL, colorEntities, type Rgb } from '../map/colors.ts';
import { computeExtents, type Extent } from '../map/extents.ts';
import type { RawData } from './load.ts';

export interface EntityView {
  /** Identifiant sur la carte (valeur des couches `owner` et `sovereign`). */
  index: number;
  id: string;
  name: string;
  nameFr: string;
  kind: EntityKind;
  map: MapEntity;
  record: CountryRecord;
  color: Rgb;
  extent: Extent | null;
}

export type ParamLookup =
  | { state: 'value'; value: ResolvedValue }
  /** Paramètre dérivé calculé par le moteur (à partir de la phase 3). */
  | { state: 'runtime' }
  | { state: 'absent' };

export interface PairLookup {
  value: ParamValue;
  /** Provenance de la valeur, ou null pour la valeur par défaut des paires absentes. */
  provenance: PairProvenance | null;
  /** Justification de la valeur par défaut (paires absentes). */
  defaultNote: string | null;
}

export class Dataset {
  readonly raw: RawData;
  readonly width: number;
  readonly height: number;
  /** Entités par index de carte (les trous sont `undefined`). */
  readonly byIndex: (EntityView | undefined)[];
  readonly byId: Map<string, EntityView>;
  /** Entités triées par nom français. */
  readonly list: EntityView[];
  readonly runtimeParams: ReadonlySet<string>;
  private readonly pairTables = new Map<string, Map<string, [ParamValue, number]>>();

  constructor(raw: RawData) {
    this.raw = raw;
    this.width = raw.grid.header.width;
    this.height = raw.grid.header.height;
    this.runtimeParams = new Set(raw.countries.runtimeParams);
    const records = new Map(raw.countries.entities.map((r) => [r.id, r]));
    const maxIndex = raw.meta.entities.reduce((m, e) => Math.max(m, e.index), 0);

    // Couleurs politiques : voisins terrestres et maritimes, factions et pays contestés.
    const neighbors = new Map<string, Set<string>>();
    const link = (a: string, b: string): void => {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)?.add(b);
      neighbors.get(b)?.add(a);
    };
    for (const b of raw.geo.landBorders) link(b.a, b.b);
    for (const b of raw.geo.maritimeBorders) link(b.a, b.b);
    for (const r of raw.countries.entities) if (r.parent) link(r.id, r.parent);
    for (const z of raw.meta.controlZones) {
      if (z.controller && z.sovereign && z.controller !== z.sovereign)
        link(z.controller, z.sovereign);
    }
    const colors = colorEntities(
      raw.meta.entities.map((e) => e.id),
      neighbors,
      POLITICAL.length,
    );

    // Cadrage autour de la capitale, à défaut du point d'étiquette.
    const anchors = new Map(
      raw.meta.entities.map((e) => [e.index, e.capital?.pixel ?? e.label?.pixel ?? null]),
    );
    const extents = computeExtents(
      raw.grid.layers.owner,
      this.width,
      this.height,
      maxIndex,
      (i) => anchors.get(i) ?? null,
    );

    this.byIndex = new Array<EntityView | undefined>(maxIndex + 1);
    this.byId = new Map();
    for (const m of raw.meta.entities) {
      const record = records.get(m.id);
      if (record === undefined) continue;
      const view: EntityView = {
        index: m.index,
        id: m.id,
        name: m.name,
        nameFr: m.nameFr,
        kind: m.kind,
        map: m,
        record,
        color: POLITICAL[colors.get(m.id) ?? 0] as Rgb,
        extent: extents[m.index] ?? null,
      };
      this.byIndex[m.index] = view;
      this.byId.set(m.id, view);
    }
    this.list = [...this.byId.values()].sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));
  }

  get maxIndex(): number {
    return this.byIndex.length - 1;
  }

  entityAt(pixel: number): EntityView | undefined {
    const id = this.raw.grid.layers.owner[pixel];
    return id === undefined || id === 0 ? undefined : this.byIndex[id];
  }

  /** Valeur d'un paramètre pays, y compris les dérivés par définition (PIB par habitant…). */
  param(entity: EntityView, id: string): ParamLookup {
    const direct = entity.record.params[id];
    if (direct !== undefined) return { state: 'value', value: direct };
    if (this.runtimeParams.has(id)) {
      const derivation = derivationOf(id);
      const value = derivation ? deriveValue(derivation, (p) => entity.record.params[p]) : null;
      return value ? { state: 'value', value } : { state: 'runtime' };
    }
    return { state: 'absent' };
  }

  /** Valeur numérique d'un paramètre, ou null (absent, non numérique, lacune). */
  numeric(entity: EntityView, id: string): number | null {
    const r = this.param(entity, id);
    if (r.state !== 'value') return null;
    const v = r.value.value;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  private pairTable(paramId: string): Map<string, [ParamValue, number]> | null {
    const param = this.raw.pairs.params[paramId];
    if (param === undefined) return null;
    let table = this.pairTables.get(paramId);
    if (table === undefined) {
      table = new Map(param.entries.map(([a, b, v, ref]) => [`${a}>${b}`, [v, ref]]));
      this.pairTables.set(paramId, table);
    }
    return table;
  }

  /** Paramètre bilatéral de i vers j (null si le paramètre n'est pas dans les données). */
  pair(paramId: string, i: string, j: string): PairLookup | null {
    const param = this.raw.pairs.params[paramId];
    const table = this.pairTable(paramId);
    if (param === undefined || table === null) return null;
    const hit = table.get(`${i}>${j}`);
    if (hit === undefined) {
      return { value: param.default, provenance: null, defaultNote: param.defaultNote };
    }
    return { value: hit[0], provenance: param.refs[hit[1]] ?? null, defaultNote: null };
  }

  /** Toutes les paires renseignées d'un paramètre bilatéral. */
  pairEntries(paramId: string): readonly [string, string, ParamValue, number][] {
    return this.raw.pairs.params[paramId]?.entries ?? [];
  }

  worldParam(id: string): ResolvedValue | undefined {
    return this.raw.world.params[id];
  }
}
