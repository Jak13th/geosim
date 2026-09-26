/**
 * Fichiers curés thématiques (SPEC §5.2) : chaque entrée porte source, date et confiance.
 * Ce module définit leur structure, les charge et les valide ; la cohérence des codes pays est
 * vérifiée par `checkTopicCodes` une fois les entités connues.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CRITICAL_MINERALS, SANCTION_TRACKS, paramById, type Confidence } from '@geosim/shared';
import { checkProvenance, loadYaml, type CuratedProvenance } from '../config.ts';

type P = CuratedProvenance;

export interface Bloc extends P {
  id: string;
  name: string;
  nameFr: string;
  kind:
    | 'military_alliance'
    | 'political_union'
    | 'economic_union'
    | 'trade_agreement'
    | 'monetary_union'
    | 'energy_cartel'
    | 'security_forum'
    | 'political_forum'
    | 'regional_organization';
  members: string[];
  partners?: string[];
  observers?: string[];
  /** Membres suspendus (ex. Union africaine après un coup d'État). */
  suspended?: string[];
  rules: {
    mutual_defense: boolean;
    defense_area?: string;
    common_trade_policy: boolean;
    common_sanctions: boolean;
    oil_coordination: boolean;
  };
}

export type TreatyType =
  | 'mutual_defense'
  | 'security_guarantee'
  | 'non_aggression'
  | 'strategic_partnership'
  | 'basing'
  | 'consultation';

export interface Treaty extends P {
  id: string;
  name: string;
  type: TreatyType;
  parties: string[];
  /** Garanties unilatérales : le garant (ex. États-Unis envers Taïwan, loi de 1979). */
  guarantor?: string;
  signed: string;
  area?: string;
  /** Crédibilité perçue (0–1), hypothèse. */
  credibility: number;
}

export interface NuclearState extends P {
  warheads_total: number;
  warheads_deployed: number;
  delivery: { silo: number; mobile: number; submarine: number; bomber: number };
  doctrine: 'no_first_use' | 'ambiguous' | 'first_use_possible';
}

export interface NuclearFile {
  states: Record<string, NuclearState>;
  umbrellas: ({ provider: string; covered: string[] } & P)[];
  programs: Record<string, { progress: number } & P>;
}

export interface MilitaryCapabilities extends P {
  carriers: number;
  attack_submarines: number;
  fighters_5gen: number;
  strategic_bombers: number;
  long_range_missile_defense: boolean;
  military_satellites: number;
  amphibious_brigades: number;
}

export interface Conflict extends P {
  id: string;
  name: string;
  nameFr: string;
  type: 'interstate' | 'civil_war' | 'insurgency' | 'frozen';
  status: 'active' | 'ceasefire' | 'frozen';
  /** Intensité actuelle (0–100). */
  intensity: number;
  started: string;
  /** Pays sur le territoire desquels se déroule le conflit. */
  countries: string[];
  sides: { a: string[]; b: string[] };
  /** Soutiens extérieurs (armes, financement, renseignement), par camp. */
  supporters?: { a?: string[]; b?: string[] };
}

export interface SanctionRegime extends P {
  id: string;
  name: string;
  target: string;
  /** Codes pays ou `bloc:<id>` (ex. `bloc:eu`). */
  senders: string[];
  tracks: Partial<Record<(typeof SANCTION_TRACKS)[number], number>>;
  secondary: boolean;
}

export interface Tariff extends P {
  from: string;
  to: string;
  /** Droit additionnel moyen (%). */
  rate: number;
}

export interface ExportRestriction extends P {
  country: string;
  product: string;
  intensity: number;
}

export interface SanctionsFile {
  regimes: SanctionRegime[];
  tariffs: Tariff[];
  frozen_reserves: Record<string, { share: number } & P>;
  export_restrictions: ExportRestriction[];
}

export interface Dispute extends P {
  id: string;
  name: string;
  nameFr: string;
  claimants: string[];
  /** Contrôle de facto actuel (null : personne, ex. zone neutre). */
  controller: string | null;
  /** Souveraineté de jure retenue (reconnaissance majoritaire), null si indéterminée. */
  sovereign: string | null;
  kind: 'territorial' | 'maritime';
  intensity: number;
  /** Identifiant de zone (control_zones.geojson ou claims.geojson). */
  zone?: string;
}

export interface Election extends P {
  date: string;
  type: string;
}

export interface Base extends P {
  user: string;
  host: string;
  troops: number;
  sites: string;
}

export interface EnergyLink extends P {
  id: string;
  name: string;
  kind:
    'gas_pipeline' | 'oil_pipeline' | 'lng_export' | 'lng_import' | 'power_cable' | 'data_cable';
  countries: string[];
  capacity: number | null;
  unit: string;
  status: 'operating' | 'reduced' | 'halted' | 'destroyed' | 'under_construction';
}

export interface MineralFile {
  minerals: Record<
    (typeof CRITICAL_MINERALS)[number],
    { year: number; production: Record<string, number>; refining?: Record<string, number> } & P
  >;
}

export interface SemiconductorsFile {
  advanced_fab_share: { year: number; shares: Record<string, number> } & P;
  autonomy: { values: Record<string, number> } & P;
}

export interface ProfileValue {
  value: number;
  why: string;
}

export interface Profile extends P {
  government: string;
  values: Record<string, ProfileValue>;
  strategic_goals: string[];
  opposition?: { values: Record<string, number>; why: string };
}

export interface RelationSeed extends P {
  a: string;
  b: string;
  value: number;
  /** Valeur de b envers a si elle diffère (relations asymétriques). */
  reverse?: number;
  why: string;
}

/** Grief historique ou proximité culturelle entre deux pays (pair_ties.yaml), hypothèse. */
export interface PairTie extends P {
  a: string;
  b: string;
  value: number;
  /** Valeur de b envers a (griefs orientés) ; absente pour les proximités (symétriques). */
  reverse?: number;
  why: string;
}

export interface ExtraEntity extends P {
  id: string;
  name: string;
  nameFr: string;
  kind: 'de_facto' | 'faction';
  /** Pays dont l'entité occupe le territoire de jure. */
  parent: string;
  region: string;
  income: string;
  /** États membres de l'ONU qui la reconnaissent (entités de facto). */
  recognizedBy?: string[];
}

export interface EntityMeta extends P {
  region?: string;
  income?: string;
  /** Pays dont les statistiques (population, PIB) incluent déjà l'entité : on les en retire. */
  includedIn?: { population?: string; gdp?: string };
  /** États membres de l'ONU qui reconnaissent l'entité (entités de facto). */
  recognizedBy?: string[];
  /** États qui ne reconnaissent pas cet État (exceptions notables). */
  notRecognizedBy?: string[];
}

export interface WorldValue extends P {
  value: number | string | Record<string, number>;
}

export interface Topics {
  blocs: Bloc[];
  treaties: Treaty[];
  nuclear: NuclearFile;
  capabilities: Record<string, MilitaryCapabilities>;
  conflicts: Conflict[];
  sanctions: SanctionsFile;
  disputes: Dispute[];
  elections: Record<string, Election>;
  bases: Base[];
  energyLinks: EnergyLink[];
  minerals: MineralFile;
  semiconductors: SemiconductorsFile;
  profiles: Record<string, Profile>;
  relations: RelationSeed[];
  ties: { grievances: PairTie[]; proximity: PairTie[] };
  entities: { extra: ExtraEntity[]; meta: Record<string, EntityMeta> };
  world: Record<string, WorldValue>;
  food: unknown;
}

function list<T>(raw: unknown, key: string, file: string): T[] {
  const doc = raw as Record<string, unknown> | null;
  if ((doc as { version?: number } | null)?.version !== 1)
    throw new Error(`${file} : version 1 attendue`);
  const items = doc?.[key];
  if (!Array.isArray(items)) throw new Error(`${file} : liste « ${key} » attendue`);
  items.forEach((item, k) => checkProvenance(item, `${file} › ${key}[${k}]`));
  return items as T[];
}

function record<T>(raw: unknown, key: string, file: string): Record<string, T> {
  const doc = raw as Record<string, unknown> | null;
  if ((doc as { version?: number } | null)?.version !== 1)
    throw new Error(`${file} : version 1 attendue`);
  const items = doc?.[key];
  if (typeof items !== 'object' || items === null || Array.isArray(items)) {
    throw new Error(`${file} : table « ${key} » attendue`);
  }
  for (const [code, item] of Object.entries(items))
    checkProvenance(item, `${file} › ${key}.${code}`);
  return items as Record<string, T>;
}

function inRange(value: unknown, min: number, max: number, where: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${where} : ${String(value)} hors de [${min}, ${max}]`);
  }
}

export async function loadTopics(dir: string): Promise<Topics> {
  const y = async (file: string): Promise<unknown> => {
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`Fichier curé manquant : data/curated/${file}`);
    return loadYaml(path);
  };

  const blocs = list<Bloc>(await y('blocs.yaml'), 'blocs', 'blocs.yaml');
  const treaties = list<Treaty>(await y('treaties.yaml'), 'treaties', 'treaties.yaml');
  for (const t of treaties) inRange(t.credibility, 0, 1, `treaties.yaml › ${t.id}.credibility`);

  const nuclearRaw = await y('nuclear.yaml');
  const nuclear: NuclearFile = {
    states: record<NuclearState>(nuclearRaw, 'states', 'nuclear.yaml'),
    umbrellas: list(nuclearRaw, 'umbrellas', 'nuclear.yaml'),
    programs: record(nuclearRaw, 'programs', 'nuclear.yaml'),
  };
  for (const [code, p] of Object.entries(nuclear.programs)) {
    inRange(p.progress, 0, 100, `nuclear.yaml › programs.${code}.progress`);
  }

  const capabilities = record<MilitaryCapabilities>(
    await y('military_capabilities.yaml'),
    'countries',
    'military_capabilities.yaml',
  );
  const conflicts = list<Conflict>(await y('conflicts.yaml'), 'conflicts', 'conflicts.yaml');
  for (const c of conflicts) inRange(c.intensity, 0, 100, `conflicts.yaml › ${c.id}.intensity`);

  const sanctionsRaw = await y('sanctions.yaml');
  const sanctions: SanctionsFile = {
    regimes: list(sanctionsRaw, 'regimes', 'sanctions.yaml'),
    tariffs: list(sanctionsRaw, 'tariffs', 'sanctions.yaml'),
    frozen_reserves: record(sanctionsRaw, 'frozen_reserves', 'sanctions.yaml'),
    export_restrictions: list(sanctionsRaw, 'export_restrictions', 'sanctions.yaml'),
  };
  for (const r of sanctions.regimes) {
    for (const [track, v] of Object.entries(r.tracks)) {
      if (!(SANCTION_TRACKS as readonly string[]).includes(track)) {
        throw new Error(`sanctions.yaml › ${r.id} : volet inconnu « ${track} »`);
      }
      inRange(v, 0, 1, `sanctions.yaml › ${r.id}.${track}`);
    }
  }

  const disputes = list<Dispute>(await y('disputes.yaml'), 'disputes', 'disputes.yaml');
  const elections = record<Election>(await y('elections.yaml'), 'elections', 'elections.yaml');
  for (const [code, e] of Object.entries(elections)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date))
      throw new Error(`elections.yaml › ${code} : date AAAA-MM-JJ`);
  }
  const bases = list<Base>(await y('bases.yaml'), 'bases', 'bases.yaml');
  const energyLinks = list<EnergyLink>(await y('energy_links.yaml'), 'links', 'energy_links.yaml');

  const mineralsRaw = await y('minerals.yaml');
  const minerals = { minerals: record(mineralsRaw, 'minerals', 'minerals.yaml') } as MineralFile;
  for (const m of CRITICAL_MINERALS) {
    if (!(m in minerals.minerals)) throw new Error(`minerals.yaml : minerai « ${m} » absent`);
  }

  const semisRaw = (await y('semiconductors.yaml')) as SemiconductorsFile & { version?: number };
  if (semisRaw.version !== 1) throw new Error('semiconductors.yaml : version 1 attendue');
  checkProvenance(semisRaw.advanced_fab_share, 'semiconductors.yaml › advanced_fab_share');
  checkProvenance(semisRaw.autonomy, 'semiconductors.yaml › autonomy');

  const profiles = record<Profile>(await y('profiles.yaml'), 'profiles', 'profiles.yaml');
  for (const [code, profile] of Object.entries(profiles)) {
    for (const [id, v] of Object.entries(profile.values)) {
      const def = paramById(id);
      if (def === undefined || def.category !== 'profil') {
        throw new Error(`profiles.yaml › ${code}.${id} : paramètre ai.* inconnu`);
      }
      inRange(v.value, def.min ?? 0, def.max ?? 100, `profiles.yaml › ${code}.${id}`);
      if (typeof v.why !== 'string' || v.why.trim() === '') {
        throw new Error(`profiles.yaml › ${code}.${id} : justification (why) obligatoire`);
      }
    }
    if (profile.confidence !== 'assumption') {
      throw new Error(
        `profiles.yaml › ${code} : un profil est une hypothèse (confidence: assumption)`,
      );
    }
  }
  const relations = list<RelationSeed>(
    await y('relations_seed.yaml'),
    'relations',
    'relations_seed.yaml',
  );
  for (const r of relations) inRange(r.value, -100, 100, `relations_seed.yaml › ${r.a}-${r.b}`);

  const tiesRaw = await y('pair_ties.yaml');
  const ties = {
    grievances: list<PairTie>(tiesRaw, 'grievances', 'pair_ties.yaml'),
    proximity: list<PairTie>(tiesRaw, 'proximity', 'pair_ties.yaml'),
  };
  for (const [key, items] of Object.entries(ties)) {
    const seen = new Set<string>();
    for (const t of items) {
      const where = `pair_ties.yaml › ${key} ${t.a}-${t.b}`;
      inRange(t.value, 0, 100, where);
      if (t.reverse !== undefined) inRange(t.reverse, 0, 100, `${where} (reverse)`);
      if (typeof t.why !== 'string' || t.why.trim() === '')
        throw new Error(`${where} : justification (why) obligatoire`);
      if (t.confidence !== 'assumption')
        throw new Error(`${where} : hypothèse attendue (confidence: assumption)`);
      const key2 = [t.a, t.b].sort().join('-');
      if (seen.has(key2)) throw new Error(`${where} : paire en double`);
      seen.add(key2);
    }
  }

  const entitiesRaw = await y('entities.yaml');
  const entities = {
    extra: list<ExtraEntity>(entitiesRaw, 'extra', 'entities.yaml'),
    meta: record<EntityMeta>(entitiesRaw, 'meta', 'entities.yaml'),
  };
  const world = record<WorldValue>(await y('world.yaml'), 'values', 'world.yaml');
  for (const id of Object.keys(world)) {
    if (paramById(id)?.scope !== 'world')
      throw new Error(`world.yaml › ${id} : paramètre world.* inconnu`);
  }
  const food = await y('food.yaml');

  return {
    blocs,
    treaties,
    nuclear,
    capabilities,
    conflicts,
    sanctions,
    disputes,
    elections,
    bases,
    energyLinks,
    minerals,
    semiconductors: semisRaw,
    profiles,
    relations,
    ties,
    entities,
    world,
    food,
  };
}

/** Vérifie que chaque code pays cité existe ; renvoie la liste des erreurs. */
export function checkTopicCodes(topics: Topics, codes: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const blocIds = new Set(topics.blocs.map((b) => b.id));
  const check = (code: string, where: string): void => {
    if (code.startsWith('bloc:')) {
      if (!blocIds.has(code.slice(5))) errors.push(`${where} : bloc inconnu « ${code} »`);
    } else if (!codes.has(code)) errors.push(`${where} : entité inconnue « ${code} »`);
  };
  for (const b of topics.blocs) {
    for (const c of [
      ...b.members,
      ...(b.partners ?? []),
      ...(b.observers ?? []),
      ...(b.suspended ?? []),
    ]) {
      check(c, `blocs.yaml › ${b.id}`);
    }
  }
  for (const t of topics.treaties) for (const c of t.parties) check(c, `treaties.yaml › ${t.id}`);
  for (const c of Object.keys(topics.nuclear.states)) check(c, 'nuclear.yaml › states');
  for (const u of topics.nuclear.umbrellas) {
    for (const c of [u.provider, ...u.covered]) check(c, 'nuclear.yaml › umbrellas');
  }
  for (const c of Object.keys(topics.nuclear.programs)) check(c, 'nuclear.yaml › programs');
  for (const c of Object.keys(topics.capabilities)) check(c, 'military_capabilities.yaml');
  for (const c of topics.conflicts) {
    for (const code of [
      ...c.countries,
      ...c.sides.a,
      ...c.sides.b,
      ...(c.supporters?.a ?? []),
      ...(c.supporters?.b ?? []),
    ]) {
      check(code, `conflicts.yaml › ${c.id}`);
    }
  }
  for (const r of topics.sanctions.regimes)
    for (const c of [r.target, ...r.senders]) check(c, `sanctions.yaml › ${r.id}`);
  for (const t of topics.sanctions.tariffs)
    for (const c of [t.from, t.to]) check(c, 'sanctions.yaml › tariffs');
  for (const c of Object.keys(topics.sanctions.frozen_reserves))
    check(c, 'sanctions.yaml › frozen_reserves');
  for (const r of topics.sanctions.export_restrictions)
    check(r.country, 'sanctions.yaml › export_restrictions');
  for (const d of topics.disputes) {
    for (const c of [
      ...d.claimants,
      ...(d.controller ? [d.controller] : []),
      ...(d.sovereign ? [d.sovereign] : []),
    ]) {
      check(c, `disputes.yaml › ${d.id}`);
    }
  }
  for (const c of Object.keys(topics.elections)) check(c, 'elections.yaml');
  for (const b of topics.bases) for (const c of [b.user, b.host]) check(c, 'bases.yaml');
  for (const l of topics.energyLinks)
    for (const c of l.countries) check(c, `energy_links.yaml › ${l.id}`);
  for (const [m, data] of Object.entries(topics.minerals.minerals)) {
    for (const c of [...Object.keys(data.production), ...Object.keys(data.refining ?? {})])
      check(c, `minerals.yaml › ${m}`);
  }
  for (const c of Object.keys(topics.semiconductors.advanced_fab_share.shares))
    check(c, 'semiconductors.yaml');
  for (const c of Object.keys(topics.semiconductors.autonomy.values))
    check(c, 'semiconductors.yaml');
  for (const c of Object.keys(topics.profiles)) check(c, 'profiles.yaml');
  for (const r of topics.relations) for (const c of [r.a, r.b]) check(c, 'relations_seed.yaml');
  for (const t of [...topics.ties.grievances, ...topics.ties.proximity])
    for (const c of [t.a, t.b]) check(c, 'pair_ties.yaml');
  for (const [c, m] of Object.entries(topics.entities.meta)) {
    check(c, 'entities.yaml › meta');
    for (const x of [
      ...(m.recognizedBy ?? []),
      ...(m.notRecognizedBy ?? []),
      m.includedIn?.population,
      m.includedIn?.gdp,
    ]) {
      if (x) check(x, `entities.yaml › meta.${c}`);
    }
  }
  for (const x of topics.entities.extra) {
    for (const c of [x.parent, ...(x.recognizedBy ?? [])])
      check(c, `entities.yaml › extra.${x.id}`);
  }
  return errors;
}

export type { Confidence };
