/**
 * Fichiers produits par les données pays (data/build/) :
 * - `countries.base.json` : paramètres de chaque entité, avec leur provenance ;
 * - `pairs.base.json` : paramètres bilatéraux (commerce, dépendances, traités, sanctions…) ;
 * - `world.base.json` : paramètres mondiaux et de zone, blocs, conflits, détroits…
 */
import {
  CATALOG,
  REGIME_TYPES,
  type Confidence,
  type CountriesBase,
  type CountryRecord,
  type MapGeo,
  type MapMeta,
  type MapRoutes,
  type PairParam,
  type PairProvenance,
  type PairRoutes,
  type PairsBase,
  type ProfileDefaults,
} from '@geosim/shared';
import type { ChokepointDef } from '../map/routing.ts';
import type { ParamValue } from './curated.ts';
import type { Ctx, Resolved } from './context.ts';
import type { GeoZone } from './geozones.ts';
import type { TreatyType } from './topics.ts';

export type { CountriesBase, CountryRecord, PairParam, PairProvenance, PairsBase };

export function countriesBase(
  ctx: Ctx,
  mapBuildId: string,
  runtimeParams: string[],
): CountriesBase {
  const order = CATALOG.filter((d) => d.scope === 'country').map((d) => d.id);
  return {
    version: 1,
    buildDate: ctx.buildDate,
    mapBuildId,
    runtimeParams,
    entities: ctx.entities.map((e) => {
      const params: Record<string, Resolved> = {};
      for (const id of order) {
        const r = ctx.resolved.get(id)?.get(e.id);
        if (r !== undefined) params[id] = roundResolved(r);
      }
      return { ...e, params };
    }),
  };
}

function roundValue(v: ParamValue): ParamValue {
  if (typeof v === 'number') return Number.isInteger(v) ? v : Number(v.toPrecision(6));
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x.toPrecision(6))]));
  }
  return v;
}

function roundResolved(r: Resolved): Resolved {
  return { ...r, value: roundValue(r.value) };
}

// ——— Paires ———

/** Combine deux valeurs d'une même paire (sources multiples) ; sans règle, un doublon est une erreur. */
type Merge = (previous: ParamValue, next: ParamValue) => ParamValue;

const sum: Merge = (x, y) => (x as number) + (y as number);
const maxByKey: Merge = (x, y) => {
  const out = { ...(x as Record<string, number>) };
  for (const [k, v] of Object.entries(y as Record<string, number>))
    out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

class PairBuilder {
  readonly param: PairParam;
  private readonly refIndex = new Map<string, number>();
  private readonly pairIndex = new Map<string, number>();
  private readonly merge: Merge | undefined;
  constructor(unit: string, def: ParamValue, defaultNote: string, merge?: Merge) {
    this.param = { unit, default: def, defaultNote, refs: [], entries: [] };
    this.merge = merge;
  }
  add(a: string, b: string, value: ParamValue, p: PairProvenance): void {
    const pair = `${a}>${b}`;
    const at = this.pairIndex.get(pair);
    if (at !== undefined) {
      // La provenance conservée est celle de la première source de la paire.
      if (!this.merge)
        throw new Error(`pairs.base.json : paire ${pair} en double (${this.param.defaultNote})`);
      const entry = this.param.entries[at] as [string, string, ParamValue, number];
      entry[2] = roundValue(this.merge(entry[2], value));
      return;
    }
    this.pairIndex.set(pair, this.param.entries.length);
    const key = JSON.stringify(p);
    let k = this.refIndex.get(key);
    if (k === undefined) {
      k = this.param.refs.length;
      this.param.refs.push(p);
      this.refIndex.set(key, k);
    }
    this.param.entries.push([a, b, roundValue(value), k]);
  }
}

const WAR_RANK: Record<string, number> = { peace: 0, tension: 1, ceasefire: 2, war: 3 };

const TREATY_RANK: Record<string, number> = {
  none: 0,
  non_aggression: 1,
  partnership: 2,
  mutual_defense: 3,
};

function treatyLevel(type: TreatyType): 'non_aggression' | 'partnership' | 'mutual_defense' {
  if (type === 'mutual_defense' || type === 'security_guarantee') return 'mutual_defense';
  if (type === 'non_aggression') return 'non_aggression';
  return 'partnership';
}

/** Développe `bloc:<id>` en membres. */
export function expandCodes(ctx: Ctx, codes: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of codes) {
    if (c.startsWith('bloc:'))
      out.push(...(ctx.topics.blocs.find((b) => b.id === c.slice(5))?.members ?? []));
    else out.push(c);
  }
  return [...new Set(out)];
}

/**
 * Routes maritimes compactes pour le moteur : longueur et détroits (masque de bits sur
 * `chokepointIds`) de la route principale et de l'alternative de chaque paire non orientée.
 */
export function compactRoutes(file: MapRoutes, chokepointIds: readonly string[]): PairRoutes {
  if (chokepointIds.length > 30) throw new Error('Routes : plus de 30 détroits (masque 32 bits)');
  const bit = new Map(chokepointIds.map((id, k) => [id, 1 << k]));
  const mask = (straits: readonly string[], where: string): number => {
    let m = 0;
    for (const s of straits) {
      const b = bit.get(s);
      if (b === undefined) throw new Error(`Routes ${where} : détroit inconnu « ${s} »`);
      m |= b;
    }
    return m;
  };
  return {
    chokepoints: [...chokepointIds],
    entries: file.routes.map((r) => [
      r.a,
      r.b,
      Math.round(r.primary.km),
      mask(r.primary.straits, `${r.a}-${r.b}`),
      r.alternative ? Math.round(r.alternative.km) : -1,
      r.alternative ? mask(r.alternative.straits, `${r.a}-${r.b}`) : 0,
    ]),
  };
}

export function pairsBase(
  ctx: Ctx,
  geo: MapGeo,
  routes: Map<string, number>,
  routeTable?: PairRoutes,
): PairsBase {
  const ids = new Set(ctx.entities.map((e) => e.id));
  const cur = (
    file: string,
    p: { source: string; date: string; confidence: Confidence; note?: string },
  ): PairProvenance => ({
    source: `CUR:${file} (${p.source})`,
    date: p.date,
    confidence: p.confidence,
    ...(p.note ? { note: p.note } : {}),
  });
  const params: Record<string, PairParam> = {};

  // Commerce (BACI) : exportations de biens ≥ 1 M$.
  const trade = new PairBuilder(
    'Md$/an',
    0,
    'aucun échange de biens enregistré par BACI (ou < 1 M$)',
  );
  const baciRef: PairProvenance = {
    source: `BACI:${ctx.baci.version}`,
    date: String(ctx.baci.year),
    confidence: 'high',
    note: 'exportations de biens (valeurs FOB réconciliées par le CEPII), hors services',
  };
  for (const [key, v] of ctx.baci.flows) {
    const [a, b] = key.split('>') as [string, string];
    if (!ids.has(a) || !ids.has(b) || v < 1000) continue;
    trade.add(a, b, v / 1e6, baciRef);
  }
  params['pair.trade'] = trade.param;

  // Dépendances : part des importations de i venant de j (≥ 1 %).
  const shareOf = (
    product: 'energy' | 'chips' | 'rare_earths' | 'grain' | 'arms',
  ): Map<string, Map<string, number>> => {
    const out = new Map<string, Map<string, number>>();
    for (const [importer, suppliers] of ctx.baci.critical.get(product) ?? []) {
      if (!ids.has(importer)) continue;
      const total = [...suppliers.values()].reduce((s, x) => s + x, 0);
      if (!(total > 0)) continue;
      const m = new Map<string, number>();
      for (const [supplier, x] of suppliers)
        if (ids.has(supplier) && x / total >= 0.01) m.set(supplier, (100 * x) / total);
      out.set(importer, m);
    }
    return out;
  };
  const energy = new PairBuilder('%', 0, 'moins de 1 % des importations d’énergie');
  for (const [i, m] of shareOf('energy'))
    for (const [j, v] of m)
      energy.add(i, j, v, {
        ...baciRef,
        note: 'importations du chapitre 27 du SH (combustibles, électricité)',
      });
  params['pair.energy_dependence'] = energy.param;

  const critical = new PairBuilder(
    '% par produit',
    {},
    'moins de 1 % des importations de chaque produit critique',
  );
  const byProduct = {
    chips: shareOf('chips'),
    rare_earths: shareOf('rare_earths'),
    grain: shareOf('grain'),
    arms: shareOf('arms'),
  };
  const pairsSeen = new Map<string, Record<string, number>>();
  for (const [product, table] of Object.entries(byProduct)) {
    for (const [i, m] of table) {
      for (const [j, v] of m) {
        const key = `${i}>${j}`;
        const rec = pairsSeen.get(key) ?? {};
        rec[product] = Math.round(v * 10) / 10;
        pairsSeen.set(key, rec);
      }
    }
  }
  for (const [key, rec] of pairsSeen) {
    const [i, j] = key.split('>') as [string, string];
    critical.add(i, j, rec, {
      ...baciRef,
      note: 'puces : SH 8542 ; terres rares : SH 280530 et 2846 ; céréales : SH 1001-1008 ; armes : chapitre 93 (les grands systèmes d’armes relèvent des transferts SIPRI, non couverts)',
    });
  }
  params['pair.critical_dependence'] = critical.param;

  // Traités : engagement le plus fort (traités bilatéraux et blocs à défense mutuelle).
  const treaty = new PairBuilder('', 'none', 'aucun traité recensé');
  const credibility = new PairBuilder('0–1', null, 'sans objet (pas de traité)');
  const best = new Map<string, { level: string; credibility: number; p: PairProvenance }>();
  const offer = (a: string, b: string, level: string, cred: number, p: PairProvenance): void => {
    const key = `${a}>${b}`;
    const cur2 = best.get(key);
    if (!cur2 || (TREATY_RANK[level] as number) > (TREATY_RANK[cur2.level] as number))
      best.set(key, { level, credibility: cred, p });
  };
  for (const t of ctx.topics.treaties) {
    const level = treatyLevel(t.type);
    if (t.guarantor) {
      for (const other of t.parties)
        if (other !== t.guarantor)
          offer(other, t.guarantor, level, t.credibility, cur('treaties.yaml', t));
      // Le garant n'est pas protégé en retour.
      continue;
    }
    for (const a of t.parties)
      for (const b of t.parties)
        if (a !== b) offer(a, b, level, t.credibility, cur('treaties.yaml', t));
  }
  for (const bloc of ctx.topics.blocs) {
    if (!bloc.rules.mutual_defense) continue;
    for (const a of bloc.members)
      for (const b of bloc.members)
        if (a !== b)
          offer(a, b, 'mutual_defense', 0.8, {
            ...cur('blocs.yaml', bloc),
            note: `membres de ${bloc.name} (crédibilité 0,8 : hypothèse)`,
          });
  }
  for (const [key, v] of best) {
    const [a, b] = key.split('>') as [string, string];
    treaty.add(a, b, v.level, v.p);
    credibility.add(a, b, v.credibility, { ...v.p, confidence: 'assumption' });
  }
  params['pair.treaty'] = treaty.param;
  params['pair.treaty_credibility'] = credibility.param;

  // Sanctions et droits de douane.
  const sanctions = new PairBuilder('0–1 par volet', {}, 'aucune sanction', maxByKey);
  for (const r of ctx.topics.sanctions.regimes) {
    for (const sender of expandCodes(ctx, r.senders)) {
      if (sender === r.target) continue;
      sanctions.add(sender, r.target, r.tracks as Record<string, number>, {
        ...cur('sanctions.yaml', r),
        note: `${r.name}${r.note ? ` ; ${r.note}` : ''}`,
      });
    }
  }
  params['pair.sanctions'] = sanctions.param;
  const tariffs = new PairBuilder('%', 0, 'aucun droit additionnel spécifique', (x, y) =>
    Math.max(x as number, y as number),
  );
  for (const t of ctx.topics.sanctions.tariffs)
    for (const from of expandCodes(ctx, [t.from]))
      tariffs.add(from, t.to, t.rate, cur('sanctions.yaml', t));
  params['pair.tariffs'] = tariffs.param;

  // Revendications territoriales.
  const claims = new PairBuilder('zones + intensité', [], 'aucune revendication', (x, y) => [
    ...(x as string[]),
    ...(y as string[]),
  ]);
  for (const d of ctx.topics.disputes) {
    const holder = d.controller;
    if (holder === null) continue;
    for (const c of d.claimants)
      if (c !== holder) claims.add(c, holder, [`${d.id}:${d.intensity}`], cur('disputes.yaml', d));
  }
  params['pair.territorial_claim'] = claims.param;

  // Présence militaire.
  const presence = new PairBuilder('personnes', 0, 'aucune présence permanente recensée', sum);
  for (const b of ctx.topics.bases) presence.add(b.user, b.host, b.troops, cur('bases.yaml', b));
  params['pair.military_presence'] = presence.param;

  // État de la relation : guerre entre camps d'un conflit interétatique actif, cessez-le-feu…
  const war = new PairBuilder('', 'peace', 'paix (aucun conflit ni crise recensé)', (x, y) =>
    (WAR_RANK[y as string] ?? 0) > (WAR_RANK[x as string] ?? 0) ? y : x,
  );
  for (const c of ctx.topics.conflicts) {
    if (c.type !== 'interstate') continue;
    const state =
      c.status === 'active' ? 'war' : c.status === 'ceasefire' ? 'ceasefire' : 'tension';
    for (const a of c.sides.a)
      for (const b of c.sides.b) {
        war.add(a, b, state, cur('conflicts.yaml', c));
        war.add(b, a, state, cur('conflicts.yaml', c));
      }
  }
  params['pair.war_state'] = war.param;

  // Reconnaissance (entités de facto : liste des États qui les reconnaissent).
  const recognizes = new PairBuilder(
    '',
    true,
    'les États membres de l’ONU se reconnaissent mutuellement, sauf exceptions listées',
    (x, y) => (x as boolean) && (y as boolean),
  );
  for (const e of ctx.entities) {
    if (e.kind === 'state') continue;
    const r = ctx.resolved.get('dip.recognition')?.get(e.id);
    const list = Array.isArray(r?.value) ? (r?.value as string[]) : [];
    for (const other of ctx.entities) {
      if (other.id === e.id || other.kind !== 'state') continue;
      recognizes.add(other.id, e.id, list.includes(other.id), {
        source: r?.source ?? 'CUR:entities.yaml',
        date: r?.date ?? ctx.buildDate,
        confidence: r?.confidence ?? 'medium',
      });
    }
  }
  for (const [code, meta] of Object.entries(ctx.topics.entities.meta)) {
    for (const other of meta.notRecognizedBy ?? []) {
      recognizes.add(other, code, false, cur('entities.yaml', meta));
    }
  }
  params['pair.recognizes'] = recognizes.param;

  // Relations initiales (paires clés) ; les autres viennent du modèle d'affinité (phase 4).
  const relation = new PairBuilder('−100 – +100', null, 'modèle d’affinité (phase 4)');
  for (const r of ctx.topics.relations) {
    relation.add(r.a, r.b, r.value, { ...cur('relations_seed.yaml', r), note: r.why });
    relation.add(r.b, r.a, r.reverse ?? r.value, { ...cur('relations_seed.yaml', r), note: r.why });
  }
  params['pair.relation'] = relation.param;

  // Carte : frontières et distances.
  const mapRef: PairProvenance = {
    source: `MAP:${geo.buildId}`,
    date: ctx.buildDate,
    confidence: 'high',
  };
  const border = new PairBuilder('km', 0, 'pas de frontière terrestre commune');
  for (const b of geo.landBorders) {
    border.add(b.a, b.b, b.km, mapRef);
    border.add(b.b, b.a, b.km, mapRef);
  }
  params['pair.border_length'] = border.param;
  const distance = new PairBuilder('km', null, 'capitales non reliées');
  const gi = geo.distances.ids;
  for (let a = 0; a < gi.length; a++) {
    for (let b = 0; b < gi.length; b++) {
      if (a === b) continue;
      const ia = gi[a] as string;
      const ib = gi[b] as string;
      const sea = routes.get(`${ia}>${ib}`) ?? routes.get(`${ib}>${ia}`) ?? null;
      distance.add(
        ia,
        ib,
        {
          great_circle: geo.distances.greatCircleKm[a]?.[b] ?? -1,
          land: geo.distances.landKm[a]?.[b] ?? -1,
          sea: sea ?? -1,
        },
        { ...mapRef, note: '−1 : pas de liaison (terre ou mer)' },
      );
    }
  }
  params['pair.distance'] = distance.param;

  // Griefs historiques (orientés) et proximité culturelle (symétrique) des paires clés.
  const grievance = new PairBuilder(
    'indice',
    0,
    'aucun grief historique recensé (pair_ties.yaml : paires clés seulement)',
  );
  for (const t of ctx.topics.ties.grievances) {
    const p = { ...cur('pair_ties.yaml', t), note: t.why };
    grievance.add(t.a, t.b, t.value, p);
    if (t.reverse !== undefined && t.reverse > 0) grievance.add(t.b, t.a, t.reverse, p);
  }
  params['pair.historical_grievance'] = grievance.param;
  const proximity = new PairBuilder(
    'indice',
    null,
    'paire non curée : proximité par défaut du moteur (même région de la Banque mondiale : coefficient diplomacy.affinity.same_region_proximity ; sinon 0)',
  );
  for (const t of ctx.topics.ties.proximity) {
    const p = { ...cur('pair_ties.yaml', t), note: t.why };
    proximity.add(t.a, t.b, t.value, p);
    proximity.add(t.b, t.a, t.value, p);
  }
  params['pair.cultural_proximity'] = proximity.param;

  // Paramètres sans données bilatérales à ce stade : lacunes documentées (listées dans le rapport).
  const gaps: [string, string, string][] = [
    [
      'pair.financial_exposure',
      'Md$',
      'lacune : pas de source ouverte des avoirs bilatéraux accessible (FMI CPIS/CDIS bloqués) ; le gel des réserves par les sanctions est approché par les monnaies de réserve des émetteurs (MODELES §10)',
    ],
    [
      'pair.kin_minority',
      '% de la population de j',
      'lacune : minorités apparentées à curer avec l’IA des pays (phase 7, irrédentisme)',
    ],
    [
      'pair.arms_transfers',
      'Md$/an',
      'lacune : registre des transferts d’armes du SIPRI non intégré (importations d’armes : pair.critical_dependence)',
    ],
  ];
  for (const [id, unit, note] of gaps) params[id] = new PairBuilder(unit, null, note).param;

  const runtimeParams = CATALOG.filter((d) => d.scope === 'pair' && !(d.id in params)).map(
    (d) => d.id,
  );
  return {
    version: 1,
    buildDate: ctx.buildDate,
    runtimeParams,
    params,
    ...(routeTable ? { routes: routeTable } : {}),
  };
}

// ——— Monde et zones ———

export interface WorldBase {
  version: 1;
  buildDate: string;
  params: Record<string, Resolved>;
  blocs: Ctx['topics']['blocs'];
  treaties: Ctx['topics']['treaties'];
  conflicts: Ctx['topics']['conflicts'];
  sanctions: Ctx['topics']['sanctions'];
  disputes: Ctx['topics']['disputes'];
  bases: Ctx['topics']['bases'];
  energyLinks: Ctx['topics']['energyLinks'];
  minerals: Ctx['topics']['minerals'];
  semiconductors: Ctx['topics']['semiconductors'];
  food: unknown;
  chokepoints: (Pick<ChokepointDef, 'id' | 'name' | 'nameFr' | 'kind'> & {
    riparians: string[];
    /** Position du marqueur [lon, lat] : centre de la première porte, ou le cap lui-même. */
    lonLat: [number, number];
    status: ChokepointDef['status'];
  })[];
  zones: {
    control: MapMeta['controlZones'];
    separatism: GeoZone[];
    fortifications: GeoZone[];
    claims: GeoZone[];
  };
  profileDefaults: ProfileDefaults;
}

/**
 * Profils décisionnels par défaut (defaults.yaml) par type de régime et pour les factions : le
 * moteur les applique quand un gouvernement change sans profil curé (coup d'État, révolution).
 */
export function profileDefaults(ctx: Ctx): ProfileDefaults {
  const ids = CATALOG.filter((d) => d.category === 'profil' && d.valueType === 'number').map(
    (d) => d.id,
  );
  const pick = (id: string, regime: string | null, kind: string | null): number => {
    const rule = ctx.defaults.rules.get(id);
    if (rule === undefined) throw new Error(`defaults.yaml : règle absente pour ${id}`);
    const v =
      (kind !== null ? rule.byKind?.[kind] : undefined) ??
      (regime !== null ? rule.byRegime?.[regime] : undefined) ??
      rule.value;
    if (typeof v !== 'number') throw new Error(`defaults.yaml › ${id} : valeur numérique attendue`);
    return v;
  };
  const byRegime: Record<string, Record<string, number>> = {};
  for (const regime of REGIME_TYPES) {
    byRegime[regime] = Object.fromEntries(ids.map((id) => [id, pick(id, regime, null)]));
  }
  return {
    source: 'HYP:defaults.yaml',
    date: ctx.defaults.date,
    byRegime,
    faction: Object.fromEntries(ids.map((id) => [id, pick(id, null, 'faction')])),
  };
}

/**
 * Position du marqueur d'un passage : centre de sa première porte, sauf pour un cap, dont la
 * porte court jusqu'à l'Antarctique : le marqueur est alors placé sur le cap (premier point).
 */
export function markerLonLat(c: Pick<ChokepointDef, 'gates' | 'kind'>): [number, number] {
  const gate = c.gates[0] ?? [];
  if (gate.length === 0) throw new Error('Détroit sans porte');
  const points = c.kind === 'cape' ? gate.slice(0, 1) : gate;
  const lon = points.reduce((s, q) => s + (q[0] as number), 0) / points.length;
  const lat = points.reduce((s, q) => s + (q[1] as number), 0) / points.length;
  return [Math.round(lon * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3];
}

export function worldBase(
  ctx: Ctx,
  meta: MapMeta,
  chokepoints: readonly ChokepointDef[],
  geoZones: { separatism: GeoZone[]; fortifications: GeoZone[]; claims: GeoZone[] },
): WorldBase {
  const params: Record<string, Resolved> = {};
  for (const def of CATALOG.filter((d) => d.scope === 'world')) {
    const w = ctx.topics.world[def.id];
    if (w) {
      params[def.id] = {
        value: w.value as ParamValue,
        source: `CUR:world.yaml (${w.source})`,
        date: w.date,
        confidence: w.confidence,
        method: 'curated',
        ...(w.note ? { note: w.note } : {}),
      };
    } else {
      const d = ctx.defaults.rules.get(def.id);
      params[def.id] = d
        ? {
            value: d.value,
            source: 'HYP:defaults.yaml',
            date: ctx.defaults.date,
            confidence: 'assumption',
            method: 'default',
            note: d.note,
          }
        : {
            value: null,
            source: 'DER',
            date: ctx.buildDate,
            confidence: 'high',
            method: 'not_applicable',
            note: 'calculé par le moteur',
          };
    }
  }
  return {
    version: 1,
    buildDate: ctx.buildDate,
    params,
    blocs: ctx.topics.blocs,
    treaties: ctx.topics.treaties,
    conflicts: ctx.topics.conflicts,
    sanctions: ctx.topics.sanctions,
    disputes: ctx.topics.disputes,
    bases: ctx.topics.bases,
    energyLinks: ctx.topics.energyLinks,
    minerals: ctx.topics.minerals,
    semiconductors: ctx.topics.semiconductors,
    food: ctx.topics.food,
    chokepoints: chokepoints.map((c) => ({
      id: c.id,
      name: c.name,
      nameFr: c.nameFr,
      kind: c.kind,
      riparians: meta.chokepoints.find((m) => m.id === c.id)?.riparians ?? [],
      lonLat: markerLonLat(c),
      status: c.status,
    })),
    zones: { control: meta.controlZones, ...geoZones },
    profileDefaults: profileDefaults(ctx),
  };
}
