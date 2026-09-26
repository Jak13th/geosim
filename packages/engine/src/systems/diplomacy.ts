/**
 * Diplomatie (SPEC §8.6), pas mensuel ; affinités et traités issus des blocs recalculés après chaque
 * commande.
 *
 * Affinité structurelle de i envers j (−100 à +100), décomposée en facteurs :
 *   A_ij = w1·similarité des régimes (× poids de l'idéologie) + w2·blocs communs + w3·interdépendance
 *        + w4·ennemis communs − w5·griefs − w6·revendications + w7·proximité culturelle
 *        + w8·proximité des votes à l'AGNU + w9·aide reçue − w10·menace perçue
 *        − w11·état de guerre − w12·sanctions + w13·traité (× loyauté envers les alliés)
 *        − w14·écart de révisionnisme
 * Relation : R_ij(t+1) = R_ij + κ·(A_ij + résidu_ij + mémoire_ij − R_ij)
 * - le résidu de calage (relation de départ − affinité de départ) garde les relations initiales
 *   (relations_seed.yaml) et s'efface lentement (demi-vie en années) ; une alternance en efface une
 *   part (le nouveau gouvernement n'hérite pas de toutes les querelles et amitiés) ;
 * - la mémoire cumule les chocs des actions (sanctions imposées ou levées, guerre déclarée, traité
 *   conclu, coup d'État condamné), qui décroissent avec une demi-vie en mois ;
 * - une relation saisie par l'utilisateur déplace le résidu d'autant (la saisie tient).
 *
 * Blocs : les traités de défense mutuelle des blocs suivent les appartenances ; adhérer à un bloc
 * aux sanctions communes (UE) en adopte les sanctions (commande `bloc`).
 * ONU (commande `unResolution`) : chaque membre du Conseil de sécurité vote selon sa relation avec
 * le pays visé (le veto d'un membre permanent bloque) ; en cas d'échec, l'Assemblée générale vote
 * (non contraignant). Effets d'une résolution adoptée : sanctions appliquées par les États membres
 * (selon l'efficacité de l'ONU et leur proximité avec le pays visé), condamnation (relations),
 * mission de maintien de la paix (insurrection, stabilité), cessez-le-feu (consigné ; fronts en
 * phase 5).
 */
import type { BlocRecord, ParamValue } from '@geosim/shared';
import { captureSlot, CommandError, type Inverse, type SlotState } from '../commands.ts';
import { col, type State } from '../state.ts';
import type { Command, Effect, Factor, Modifier, Slot } from '../types.ts';
import type { System, SystemContext } from '../system.ts';
import { memberships, membersByBloc } from './blocs.ts';
import {
  TRACKS,
  WAR,
  currentSanctionGrid,
  currentWarGrid,
  greatCircle,
  listOf,
  lockedPairs,
  vectorValue,
} from './pairs.ts';

const C = {
  electoral: col('pol.electoral_democracy'),
  alignment: col('dip.alignment'),
  gdp: col('eco.gdp_nominal'),
  budget: col('mil.budget'),
  ideology: col('ai.ideology_weight'),
  loyalty: col('ai.alliance_loyalty'),
  revisionism: col('ai.revisionism'),
  insurgency: col('pol.insurgency'),
  stability: col('pol.stability'),
};

const K = {
  regime: 'diplomacy.affinity.regime',
  blocs: 'diplomacy.affinity.blocs',
  interdependence: 'diplomacy.affinity.interdependence',
  tradeReference: 'diplomacy.affinity.trade_reference',
  enemies: 'diplomacy.affinity.common_enemies',
  enemyThreshold: 'diplomacy.affinity.enemy_threshold',
  grievances: 'diplomacy.affinity.grievances',
  claims: 'diplomacy.affinity.claims',
  culture: 'diplomacy.affinity.culture',
  sameRegion: 'diplomacy.affinity.same_region_proximity',
  votes: 'diplomacy.affinity.un_votes',
  aid: 'diplomacy.affinity.aid',
  threat: 'diplomacy.affinity.threat',
  threatDistance: 'diplomacy.affinity.threat_distance_km',
  war: 'diplomacy.affinity.war',
  sanctions: 'diplomacy.affinity.sanctions',
  treaty: 'diplomacy.affinity.treaty',
  revisionism: 'diplomacy.affinity.revisionism',
  blocMilitary: 'diplomacy.affinity.bloc_military',
  blocUnion: 'diplomacy.affinity.bloc_union',
  blocEconomic: 'diplomacy.affinity.bloc_economic',
  blocSecurity: 'diplomacy.affinity.bloc_security',
  blocRegional: 'diplomacy.affinity.bloc_regional',
  blocEnergy: 'diplomacy.affinity.bloc_energy',
  blocForum: 'diplomacy.affinity.bloc_forum',
  warBlockade: 'diplomacy.affinity.war_blockade',
  warCrisis: 'diplomacy.affinity.war_crisis',
  warCeasefire: 'diplomacy.affinity.war_ceasefire',
  warTension: 'diplomacy.affinity.war_tension',
  treatyNonAggression: 'diplomacy.affinity.treaty_non_aggression',
  treatyPartnership: 'diplomacy.affinity.treaty_partnership',
  aidReference: 'diplomacy.affinity.aid_reference',
  profileFloor: 'diplomacy.affinity.profile_floor',
  enemiesCap: 'diplomacy.affinity.enemies_cap',
  unComplianceFloor: 'diplomacy.un.compliance_floor',
  unReciprocity: 'diplomacy.un.reciprocity',
  unDefaultTrade: 'diplomacy.un.default_trade_sanctions',
  unSecondaryShock: 'diplomacy.un.secondary_shock_share',
  convergence: 'diplomacy.relations.convergence',
  residualYears: 'diplomacy.relations.residual_half_life_years',
  memoryMonths: 'diplomacy.relations.memory_half_life_months',
  sanctionTarget: 'diplomacy.relations.sanction_target_shock',
  sanctionSender: 'diplomacy.relations.sanction_sender_shock',
  sanctionLift: 'diplomacy.relations.sanction_lift_shock',
  warShock: 'diplomacy.relations.war_shock',
  peaceShock: 'diplomacy.relations.peace_shock',
  treatyShock: 'diplomacy.relations.treaty_shock',
  defenseCredibility: 'diplomacy.blocs.defense_credibility',
  unYes: 'diplomacy.un.yes_threshold',
  unNo: 'diplomacy.un.no_threshold',
  unWar: 'diplomacy.un.war_support',
  unCondemnation: 'diplomacy.un.condemnation_shock',
  unPeacekeeping: 'diplomacy.un.peacekeeping_insurgency',
  unPeacekeepingDays: 'diplomacy.un.peacekeeping_days',
  unBaseSanctions: 'diplomacy.un.base_sanctions',
  unBaseCondemnation: 'diplomacy.un.base_condemnation',
  unBaseCeasefire: 'diplomacy.un.base_ceasefire',
  unBasePeacekeeping: 'diplomacy.un.base_peacekeeping',
} as const;

const fin = (x: number): number => (Number.isFinite(x) ? x : 0);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

const TREATY_LEVEL: Record<string, number> = {
  none: 0,
  non_aggression: 1,
  partnership: 2,
  mutual_defense: 3,
};
const TREATY_NAMES = ['none', 'non_aggression', 'partnership', 'mutual_defense'] as const;

function blocWeight(m: SystemContext['model'], b: BlocRecord): number {
  switch (b.kind) {
    case 'military_alliance':
      return m.get(K.blocMilitary);
    case 'political_union':
    case 'monetary_union':
      return m.get(K.blocUnion);
    case 'economic_union':
    case 'trade_agreement':
      return m.get(K.blocEconomic);
    case 'security_forum':
      return m.get(K.blocSecurity);
    case 'energy_cartel':
      return m.get(K.blocEnergy);
    case 'political_forum':
      return m.get(K.blocForum);
    default:
      return m.get(K.blocRegional);
  }
}

// ——— Affinité ———

/** Facteurs de l'affinité, dans l'ordre des contributions. */
export const AFFINITY_FACTORS = [
  { id: 'pol.electoral_democracy', label: 'Similarité des régimes' },
  { id: 'dip.memberships', label: 'Blocs communs' },
  { id: 'pair.trade', label: 'Interdépendance commerciale' },
  { id: 'pair.relation', label: 'Ennemis communs' },
  { id: 'pair.historical_grievance', label: 'Griefs historiques' },
  { id: 'pair.territorial_claim', label: 'Revendications territoriales' },
  { id: 'pair.cultural_proximity', label: 'Proximité culturelle' },
  { id: 'dip.alignment', label: 'Proximité des votes à l’AGNU' },
  { id: 'pair.aid', label: 'Aide reçue' },
  { id: 'mil.budget', label: 'Menace perçue' },
  { id: 'pair.war_state', label: 'État de guerre ou de crise' },
  { id: 'pair.sanctions', label: 'Sanctions' },
  { id: 'pair.treaty', label: 'Traité (× loyauté envers les alliés)' },
  { id: 'ai.revisionism', label: 'Écart de révisionnisme' },
] as const;

interface AffinityInputs {
  n: number;
  ed: Float64Array;
  ideology: Float64Array;
  loyalty: Float64Array;
  revisionism: Float64Array;
  alignment: Float64Array;
  gdp: Float64Array;
  budget: Float64Array;
  region: string[];
  blocs: Uint8Array[];
  /** Indices des blocs de chaque pays (listes courtes : boucle sur les blocs de i seulement). */
  blocLists: number[][];
  blocWeights: Float64Array;
  trade: Float64Array;
  relation: Float64Array;
  grievance: Float64Array;
  culture: Float64Array;
  claims: Float64Array;
  aid: Float64Array;
  border: Float64Array;
  war: Uint8Array;
  sanctions: Float32Array;
  treaty: Uint8Array;
  /** Ennemis de chaque pays (relation sous le seuil) : listes et matrice N × N. */
  enemies: number[][];
  enemy: Uint8Array;
  /** Distance orthodromique entre capitales (km ; −1 si inconnue). */
  distance: Float64Array;
  /** Coefficients lus une fois par calcul (boucle N × N). */
  w: AffinityWeights;
}

interface AffinityWeights {
  regime: number;
  blocs: number;
  interdependence: number;
  tradeReference: number;
  enemies: number;
  grievances: number;
  claims: number;
  culture: number;
  sameRegion: number;
  votes: number;
  aid: number;
  aidReference: number;
  threat: number;
  threatDistance: number;
  war: number;
  /** Poids de chaque état de la relation (indice : code de `pair.war_state`). */
  warWeights: Float64Array;
  sanctions: number;
  treaty: number;
  /** Poids de chaque niveau de traité (aucun, non-agression, partenariat, défense mutuelle). */
  treatyWeights: Float64Array;
  revisionism: number;
  /** Plancher des facteurs modulés par le profil : facteur × (plancher + profil). */
  profileFloor: number;
  /** Nombre d'ennemis communs pour lequel le facteur est maximal. */
  enemiesCap: number;
}

function affinityWeights(m: SystemContext['model']): AffinityWeights {
  const warWeights = new Float64Array(6);
  warWeights[WAR.war] = 1;
  warWeights[WAR.blockade] = m.get(K.warBlockade);
  warWeights[WAR.crisis] = m.get(K.warCrisis);
  warWeights[WAR.ceasefire] = m.get(K.warCeasefire);
  warWeights[WAR.tension] = m.get(K.warTension);
  return {
    regime: m.get(K.regime),
    blocs: m.get(K.blocs),
    interdependence: m.get(K.interdependence),
    tradeReference: Math.max(1e-6, m.get(K.tradeReference) / 100),
    enemies: m.get(K.enemies),
    grievances: m.get(K.grievances),
    claims: m.get(K.claims),
    culture: m.get(K.culture),
    sameRegion: m.get(K.sameRegion),
    votes: m.get(K.votes),
    aid: m.get(K.aid),
    aidReference: Math.max(1e-6, m.get(K.aidReference)),
    threat: m.get(K.threat),
    threatDistance: Math.max(1, m.get(K.threatDistance)),
    war: m.get(K.war),
    warWeights,
    sanctions: m.get(K.sanctions),
    treaty: m.get(K.treaty),
    // La défense mutuelle vaut 1 ; les autres traités, une part.
    treatyWeights: Float64Array.from([
      0,
      m.get(K.treatyNonAggression),
      m.get(K.treatyPartnership),
      1,
    ]),
    revisionism: m.get(K.revisionism),
    profileFloor: m.get(K.profileFloor),
    enemiesCap: Math.max(1, m.get(K.enemiesCap)),
  };
}

function affinityInputs(ctx: Pick<SystemContext, 'model' | 'state'>): AffinityInputs {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const n2 = n * n;
  const col01 = (p: number, scale = 1): Float64Array =>
    Float64Array.from(S.e(p), (x) => fin(x) / scale);
  const blocList = S.data.world.blocs;
  const lists = memberships(S);
  const blocIndex = new Map(blocList.map((b, k) => [b.id, k]));
  const blocLists = lists.map((list) => {
    const out: number[] = [];
    for (const id of list) {
      const k = blocIndex.get(id);
      if (k !== undefined) out.push(k);
    }
    return out;
  });
  const blocs = blocLists.map((list) => {
    const bits = new Uint8Array(blocList.length);
    for (const k of list) bits[k] = 1;
    return bits;
  });
  const claims = new Float64Array(n2);
  for (const [k, v] of S.pairGen.get('pair.territorial_claim') ?? []) {
    let max = 0;
    for (const item of listOf(v)) {
      const x = Number(item.split(':')[1]);
      if (Number.isFinite(x)) max = Math.max(max, x);
    }
    claims[k] = max;
  }
  const aid = new Float64Array(n2);
  for (const [k, v] of S.pairGen.get('pair.aid') ?? []) {
    let sum = 0;
    for (const x of Object.values(vectorValue(v))) if (x > 0) sum += x;
    aid[k] = sum;
  }
  const treatyTable = S.pairGen.get('pair.treaty') ?? new Map<number, ParamValue>();
  const treaty = new Uint8Array(n2);
  for (const [k, v] of treatyTable) treaty[k] = TREATY_LEVEL[String(v)] ?? 0;
  const relation = S.pairMatrix('pair.relation');
  const threshold = m.get(K.enemyThreshold);
  const enemies: number[][] = [];
  const enemy = new Uint8Array(n2);
  for (let i = 0; i < n; i++) {
    const list: number[] = [];
    for (let j = 0; j < n; j++) {
      if ((relation[i * n + j] as number) < threshold) {
        list.push(j);
        enemy[i * n + j] = 1;
      }
    }
    enemies.push(list);
  }
  const sanctionGrid = currentSanctionGrid(S);
  const sanctions = new Float32Array(n2);
  for (let t = 0; t < TRACKS.length; t++) {
    for (let k = 0; k < n2; k++) {
      const x = sanctionGrid[t * n2 + k] as number;
      if (x > (sanctions[k] as number)) sanctions[k] = x;
    }
  }
  return {
    n,
    ed: col01(C.electoral),
    ideology: col01(C.ideology, 100),
    loyalty: col01(C.loyalty, 100),
    revisionism: col01(C.revisionism, 100),
    alignment: col01(C.alignment),
    gdp: col01(C.gdp),
    budget: col01(C.budget),
    region: S.entities.map((e) => e.region),
    blocs,
    blocLists,
    blocWeights: Float64Array.from(blocList, (b) => blocWeight(m, b)),
    trade: S.pairMatrix('pair.trade'),
    relation,
    grievance: S.pairMatrix('pair.historical_grievance'),
    culture: S.pairMatrix('pair.cultural_proximity'),
    claims,
    aid,
    border: S.pairMatrix('pair.border_length'),
    war: currentWarGrid(S),
    sanctions,
    treaty,
    enemies,
    enemy,
    distance: greatCircle(S),
    w: affinityWeights(m),
  };
}

/** Contributions de chaque facteur à l'affinité de i envers j ; renvoie leur somme bornée. */
function affinityTerms(inp: AffinityInputs, i: number, j: number, out: Float64Array): number {
  const n = inp.n;
  const w = inp.w;
  const k = i * n + j;
  const kr = j * n + i;
  const ed = 1 - 2 * Math.abs((inp.ed[i] as number) - (inp.ed[j] as number));
  out[0] = w.regime * clamp(ed, -1, 1) * (w.profileFloor + (inp.ideology[i] as number));
  let shared = 0;
  const li = inp.blocLists[i] as number[];
  const bj = inp.blocs[j] as Uint8Array;
  for (let x = 0; x < li.length; x++) {
    const b = li[x] as number;
    if (bj[b]) shared += inp.blocWeights[b] as number;
  }
  out[1] = w.blocs * Math.min(1, shared);
  const gdp = inp.gdp[i] as number;
  const flows =
    Math.max(0, fin(inp.trade[k] as number)) + Math.max(0, fin(inp.trade[kr] as number));
  const intensity = gdp > 0 ? flows / gdp / w.tradeReference : 0;
  out[2] = w.interdependence * Math.min(1, intensity);
  let common = 0;
  const enemiesI = inp.enemies[i] as number[];
  const rowJ = j * n;
  for (let x = 0; x < enemiesI.length && common < w.enemiesCap; x++) {
    const e = enemiesI[x] as number;
    if (e !== j && inp.enemy[rowJ + e] === 1) common++;
  }
  out[3] = w.enemies * Math.min(1, common / w.enemiesCap);
  out[4] = (-w.grievances * clamp(fin(inp.grievance[k] as number), 0, 100)) / 100;
  const claim = Math.max(inp.claims[k] as number, inp.claims[kr] as number);
  out[5] = (-w.claims * clamp(claim, 0, 100)) / 100;
  let culture = inp.culture[k] as number;
  if (!Number.isFinite(culture)) culture = inp.region[i] === inp.region[j] ? w.sameRegion : 0;
  out[6] = (w.culture * clamp(culture, 0, 100)) / 100;
  const votes = 1 - Math.abs((inp.alignment[i] as number) - (inp.alignment[j] as number)) / 100;
  out[7] = w.votes * clamp(votes, -1, 1);
  const aid = gdp > 0 ? (100 * (inp.aid[kr] as number)) / gdp / w.aidReference : 0;
  out[8] = w.aid * Math.min(1, aid);
  const hostility = Math.max(0, -fin(inp.relation[kr] as number)) / 100;
  if (hostility > 0) {
    const bI = Math.max(0, inp.budget[i] as number);
    const bJ = Math.max(0, inp.budget[j] as number);
    const share = bI + bJ > 0 ? bJ / (bI + bJ) : 0;
    const d = inp.distance[k] as number;
    const proximity =
      (inp.border[k] as number) > 0 ? 1 : d >= 0 ? Math.exp(-d / w.threatDistance) : 0;
    out[9] = -w.threat * share * proximity * hostility;
  } else {
    out[9] = 0;
  }
  out[10] = -w.war * (w.warWeights[inp.war[k] as number] ?? 0);
  out[11] = -w.sanctions * Math.max(inp.sanctions[k] as number, inp.sanctions[kr] as number);
  out[12] =
    w.treaty *
    (w.treatyWeights[inp.treaty[k] as number] ?? 0) *
    (w.profileFloor + (inp.loyalty[i] as number));
  out[13] =
    -w.revisionism * Math.abs((inp.revisionism[i] as number) - (inp.revisionism[j] as number));
  let a = 0;
  for (let f = 0; f < AFFINITY_FACTORS.length; f++) a += out[f] as number;
  return clamp(a, -100, 100);
}

/** Affinités de toutes les paires (N × N). */
function affinities(ctx: Pick<SystemContext, 'model' | 'state'>): Float64Array {
  const S = ctx.state;
  const n = S.n;
  const inp = affinityInputs(ctx);
  const out = new Float64Array(n * n);
  const terms = new Float64Array(AFFINITY_FACTORS.length);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) out[i * n + j] = affinityTerms(inp, i, j, terms);
    }
  }
  return out;
}

/** Décomposition de l'affinité de i envers j en facteurs (« Pourquoi ? »). */
export function affinityFactors(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  from: string,
  to: string,
): { affinity: number; relation: number; residual: number; memory: number; factors: Factor[] } {
  const S = ctx.state;
  const i = S.byId.get(from);
  const j = S.byId.get(to);
  if (i === undefined || j === undefined || i === j) {
    return { affinity: 0, relation: 0, residual: 0, memory: 0, factors: [] };
  }
  const inp = affinityInputs(ctx);
  const terms = new Float64Array(AFFINITY_FACTORS.length);
  const affinity = affinityTerms(inp, i, j, terms);
  const k = i * S.n + j;
  return {
    affinity,
    relation: fin(S.pairMatrix('pair.relation')[k] as number),
    residual: fin(S.internalArray('dip.residual', 0, S.n * S.n)[k] as number),
    memory: fin(S.internalArray('dip.memory', 0, S.n * S.n)[k] as number),
    factors: AFFINITY_FACTORS.map((f, x) => ({
      id: f.id,
      label: f.label,
      value: terms[x] as number,
      unit: 'points',
      contribution: terms[x] as number,
    })),
  };
}

// ——— Mémoire des chocs et résidu (utilisés aussi par la politique intérieure) ———

/** Choc sur la relation de i envers j (points), qui décroît avec la demi-vie de la mémoire. */
export function memoryShock(state: State, i: number, j: number, amount: number): void {
  if (i === j || !Number.isFinite(amount)) return;
  const mem = state.internalArray('dip.memory', 0, state.n * state.n);
  const k = i * state.n + j;
  mem[k] = clamp((mem[k] as number) + amount, -200, 200);
}

/** Efface une part du résidu de calage des relations d'un pays (nouveau gouvernement). */
export function resetResidual(state: State, i: number, share: number): void {
  const n = state.n;
  const residual = state.internalArray('dip.residual', 0, n * n);
  const keep = 1 - clamp(share, 0, 1);
  for (let j = 0; j < n; j++) residual[i * n + j] = (residual[i * n + j] as number) * keep;
}

// ——— Traités des blocs ———

/** Niveau de traité bilatéral de départ (treaties.yaml), sans les blocs. */
function bilateralTreaties(state: State): Uint8Array {
  const n = state.n;
  const out = new Uint8Array(n * n);
  const offer = (a: string, b: string, level: number): void => {
    const i = state.byId.get(a);
    const j = state.byId.get(b);
    if (i === undefined || j === undefined || i === j) return;
    out[i * n + j] = Math.max(out[i * n + j] as number, level);
  };
  for (const t of state.data.world.treaties ?? []) {
    const level =
      t.type === 'mutual_defense' || t.type === 'security_guarantee'
        ? 3
        : t.type === 'non_aggression'
          ? 1
          : 2;
    if (t.guarantor) {
      for (const p of t.parties) if (p !== t.guarantor) offer(p, t.guarantor, level);
      continue;
    }
    for (const a of t.parties) for (const b of t.parties) offer(a, b, level);
  }
  return out;
}

/** Paires liées par un bloc à défense mutuelle, selon les appartenances courantes. */
function blocDefense(state: State): Uint8Array {
  const n = state.n;
  const out = new Uint8Array(n * n);
  const byBloc = membersByBloc(state, memberships(state));
  for (const b of state.data.world.blocs) {
    if (!b.rules.mutual_defense) continue;
    const members = byBloc.get(b.id) ?? [];
    for (const i of members) for (const j of members) if (i !== j) out[i * n + j] = 1;
  }
  return out;
}

/** Met à jour les traités des paires dont l'appartenance commune à un bloc de défense a changé. */
function syncBlocTreaties(ctx: Pick<SystemContext, 'model' | 'state'>): void {
  const S = ctx.state;
  const n = S.n;
  const now = blocDefense(S);
  const prev = S.internalArray('dip.blocDefense', 0, n * n);
  const bilateral = S.internalArray('dip.bilateralTreaty', 0, n * n);
  const treaty = S.pairGen.get('pair.treaty');
  const credibility = S.pairNum.get('pair.treaty_credibility');
  if (!treaty || !credibility) return;
  const locked = lockedPairs(S, 'pair.treaty');
  for (let k = 0; k < n * n; k++) {
    const x = now[k] as number;
    if (x === (prev[k] as number)) continue;
    prev[k] = x;
    if (locked.has(k)) continue;
    const i = Math.floor(k / n);
    const j = k % n;
    const e = S.entities[i];
    const f = S.entities[j];
    if (!e || !f) continue;
    const key = `p|pair.treaty|${e.id}|${f.id}`;
    if (S.overrides.has(key)) continue;
    const level = Math.max(bilateral[k] as number, x === 1 ? 3 : 0);
    const name = TREATY_NAMES[level] ?? 'none';
    if (name === 'none') treaty.delete(k);
    else treaty.set(k, name);
    if (x === 1 && (bilateral[k] as number) < 3)
      credibility[k] = ctx.model.get(K.defenseCredibility);
    if (level === 0) credibility[k] = Number.NaN;
  }
}

// ——— Initialisation, pas mensuel, dérivés ———

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  const n2 = n * n;
  S.internalArray('dip.bilateralTreaty', 0, n2).set(bilateralTreaties(S));
  S.internalArray('dip.blocDefense', 0, n2).set(blocDefense(S));
  const a = affinities(ctx);
  const rel = S.pairMatrix('pair.relation');
  const residual = S.internalArray('dip.residual', 0, n2);
  S.internalArray('dip.memory', 0, n2);
  for (let k = 0; k < n2; k++) {
    const i = Math.floor(k / n);
    const j = k % n;
    if (i === j) continue;
    const r = rel[k] as number;
    if (Number.isFinite(r)) residual[k] = r - (a[k] as number);
    else {
      // Paires sans relation curée : elles partent de leur affinité structurelle.
      rel[k] = a[k] as number;
      residual[k] = 0;
    }
  }
  S.internalArray('dip.relation0', Number.NaN, n2).set(rel);
  S.internalArray('dip.written', Number.NaN, n2).set(rel);
  const aff = S.pairMatrix('pair.affinity');
  aff.set(a);
  S.internalArray('dip.prevSanction', 0, n2).set(maxSanctions(S));
  const war = currentWarGrid(S);
  const prevWar = S.internalArray('dip.prevWar', 0, n2);
  for (let k = 0; k < n2; k++) prevWar[k] = war[k] as number;
  const prevTreaty = S.internalArray('dip.prevTreaty', 0, n2);
  for (const [k, v] of S.pairGen.get('pair.treaty') ?? [])
    prevTreaty[k] = TREATY_LEVEL[String(v)] ?? 0;
}

function maxSanctions(state: State): Float64Array {
  const n2 = state.n * state.n;
  const grid = currentSanctionGrid(state);
  const out = new Float64Array(n2);
  for (let t = 0; t < TRACKS.length; t++) {
    for (let k = 0; k < n2; k++) out[k] = Math.max(out[k] as number, grid[t * n2 + k] as number);
  }
  return out;
}

/** Chocs des actions du mois écoulé (sanctions, guerres, traités), mis en mémoire. */
function detectShocks(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const n2 = n * n;
  const sanctions = maxSanctions(S);
  const prevSanction = S.internalArray('dip.prevSanction', 0, n2);
  const war = currentWarGrid(S);
  const prevWar = S.internalArray('dip.prevWar', 0, n2);
  const prevTreaty = S.internalArray('dip.prevTreaty', 0, n2);
  const treaty = new Float64Array(n2);
  for (const [k, v] of S.pairGen.get('pair.treaty') ?? []) treaty[k] = TREATY_LEVEL[String(v)] ?? 0;
  for (let k = 0; k < n2; k++) {
    const s = Math.floor(k / n);
    const t = k % n;
    if (s === t) continue;
    // Sanctions de s contre t.
    const d = (sanctions[k] as number) - (prevSanction[k] as number);
    if (d > 0.01) {
      memoryShock(S, t, s, -m.get(K.sanctionTarget) * d * 100);
      memoryShock(S, s, t, -m.get(K.sanctionSender) * d * 100);
    } else if (d < -0.01) {
      memoryShock(S, t, s, m.get(K.sanctionLift) * -d * 100);
      // Le pays qui lève ses sanctions se rapproche moins que le pays visé, dans le même rapport
      // qu'à l'imposition (choc de l'émetteur / choc du pays visé).
      const ratio =
        m.get(K.sanctionTarget) > 0 ? m.get(K.sanctionSender) / m.get(K.sanctionTarget) : 1;
      memoryShock(S, s, t, m.get(K.sanctionLift) * -d * 100 * ratio);
    }
    prevSanction[k] = sanctions[k] as number;
    // Guerre (grille symétrique : chaque sens compté une fois).
    const w = war[k] as number;
    const w0 = prevWar[k] as number;
    if (w !== w0) {
      if (w === WAR.war) memoryShock(S, s, t, -m.get(K.warShock));
      else if (w0 === WAR.war && (w === WAR.ceasefire || w === WAR.peace))
        memoryShock(S, s, t, m.get(K.peaceShock));
      prevWar[k] = w;
    }
    // Traité conclu ou rompu.
    const tr = treaty[k] as number;
    const tr0 = prevTreaty[k] as number;
    if (tr !== tr0) {
      memoryShock(S, s, t, m.get(K.treatyShock) * (tr - tr0));
      prevTreaty[k] = tr;
    }
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const n2 = n * n;
  detectShocks(ctx);
  const a = affinities(ctx);
  const rel = S.pairMatrix('pair.relation');
  const residual = S.internalArray('dip.residual', 0, n2);
  const memory = S.internalArray('dip.memory', 0, n2);
  const written = S.internalArray('dip.written', Number.NaN, n2);
  const locked = lockedPairs(S, 'pair.relation');
  const kappa = clamp(m.get(K.convergence), 0, 1);
  const residualDecay = Math.pow(0.5, 1 / Math.max(0.1, 12 * m.get(K.residualYears)));
  const memoryDecay = Math.pow(0.5, 1 / Math.max(0.1, m.get(K.memoryMonths)));
  for (let k = 0; k < n2; k++) {
    const i = Math.floor(k / n);
    const j = k % n;
    if (i === j) continue;
    let r = rel[k] as number;
    if (!Number.isFinite(r)) r = a[k] as number;
    // Relation saisie par l'utilisateur : le résidu suit, la saisie tient.
    const w = written[k] as number;
    if (Number.isFinite(w) && Math.abs(r - w) > 1e-9)
      residual[k] = (residual[k] as number) + (r - w);
    residual[k] = (residual[k] as number) * residualDecay;
    memory[k] = (memory[k] as number) * memoryDecay;
    if (!locked.has(k)) {
      const target = (a[k] as number) + (residual[k] as number) + (memory[k] as number);
      r = clamp(r + kappa * (target - r), -100, 100);
      rel[k] = r;
    }
    written[k] = rel[k] as number;
  }
  writeAffinity(S, a);
}

function writeAffinity(state: State, a: Float64Array): void {
  const aff = state.pairMatrix('pair.affinity');
  const locked = lockedPairs(state, 'pair.affinity');
  for (let k = 0; k < a.length; k++) if (!locked.has(k)) aff[k] = a[k] as number;
}

function derive(ctx: SystemContext): void {
  syncBlocTreaties(ctx);
  writeAffinity(ctx.state, affinities(ctx));
}

export const diplomacy: System = {
  id: 'diplomacy',
  coefficients: Object.values(K),
  writes: [],
  init,
  monthly,
  derive,
};

// ——— Commandes : blocs et résolutions de l'ONU ———

export interface DiplomacyApplied {
  effects: Effect[];
  inverse: Inverse;
  entities: string[];
  factors?: Factor[];
  note?: string;
}

function pairSlot(param: string, from: string, to: string): Slot {
  return { scope: 'pair', param, from, to };
}

/** Adhésion à un bloc ou retrait ; à l'adhésion, adoption des sanctions communes du bloc. */
export function applyBloc(
  state: State,
  command: Extract<Command, { type: 'bloc' }>,
): DiplomacyApplied {
  const i = state.byId.get(command.entity);
  if (i === undefined) throw new CommandError(`Entité inconnue : ${command.entity}`);
  const bloc = state.data.world.blocs.find((b) => b.id === command.bloc);
  if (bloc === undefined) throw new CommandError(`Bloc inconnu : ${command.bloc}`);
  const slot: Slot = { scope: 'country', param: 'dip.memberships', entity: command.entity };
  const before: SlotState[] = [captureSlot(state, slot)];
  const list = listOf(state.genericValue('dip.memberships', i));
  const has = list.includes(bloc.id);
  if (command.action === 'join' && has)
    throw new CommandError(`${command.entity} est déjà membre de ${bloc.nameFr}`);
  if (command.action === 'leave' && !has)
    throw new CommandError(`${command.entity} n'est pas membre de ${bloc.nameFr}`);
  const next = command.action === 'join' ? [...list, bloc.id] : list.filter((b) => b !== bloc.id);
  state.writeGeneric('dip.memberships', i, next);
  const effects: Effect[] = [{ slot, from: list, to: next }];
  const entities = [command.entity];
  // Sanctions communes (UE) : le nouveau membre adopte la médiane des sanctions des membres.
  if (command.action === 'join' && bloc.rules.common_sanctions) {
    const n = state.n;
    const members = (membersByBloc(state, memberships(state)).get(bloc.id) ?? []).filter(
      (x) => x !== i,
    );
    const table = state.pairGen.get('pair.sanctions') ?? new Map<number, ParamValue>();
    for (let t = 0; t < n; t++) {
      if (t === i) continue;
      const adopted: Record<string, number> = {};
      for (const track of TRACKS) {
        const values = members
          .map((mb) => vectorValue(table.get(mb * n + t) ?? null)[track] ?? 0)
          .sort((x, y) => x - y);
        const median = values.length > 0 ? (values[Math.floor(values.length / 2)] as number) : 0;
        if (median > 0) adopted[track] = median;
      }
      if (Object.keys(adopted).length === 0) continue;
      const target = state.entities[t];
      if (!target) continue;
      const s = pairSlot('pair.sanctions', command.entity, target.id);
      before.push(captureSlot(state, s));
      const current = vectorValue(table.get(i * n + t) ?? null);
      const merged: Record<string, number> = { ...current };
      for (const [track, x] of Object.entries(adopted))
        merged[track] = Math.max(merged[track] ?? 0, x);
      table.set(i * n + t, merged);
      state.pairGen.set('pair.sanctions', table);
      effects.push({ slot: s, from: current, to: merged });
      entities.push(target.id);
    }
  }
  return {
    effects,
    inverse: { slots: before },
    entities,
    note:
      command.action === 'join'
        ? `Adhésion à ${bloc.nameFr}${bloc.rules.mutual_defense ? ' (défense mutuelle)' : ''}${bloc.rules.common_sanctions ? ' ; sanctions communes adoptées' : ''}.`
        : `Retrait de ${bloc.nameFr}.`,
  };
}

const UN_BASE: Record<string, string> = {
  sanctions: K.unBaseSanctions,
  condemnation: K.unBaseCondemnation,
  ceasefire: K.unBaseCeasefire,
  peacekeeping: K.unBasePeacekeeping,
};

type Vote = 'yes' | 'no' | 'abstain';

/** Vote d'un pays sur une résolution visant `t` : soutien selon sa relation, le type, la guerre. */
function voteOf(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  kind: string,
  m: number,
  t: number,
  war: Uint8Array,
): { vote: Vote; support: number } {
  const S = ctx.state;
  const model = ctx.model;
  const n = S.n;
  if (m === t) return { vote: 'no', support: -1 };
  const relation = fin(S.pairMatrix('pair.relation')[m * n + t] as number);
  let atWar = false;
  for (let j = 0; j < n && !atWar; j++) if ((war[t * n + j] as number) === WAR.war) atWar = true;
  const allied = S.pairValue('pair.treaty', m, t) === 'mutual_defense';
  const support =
    -relation / 100 +
    model.get(UN_BASE[kind] ?? K.unBaseCondemnation) +
    (atWar ? model.get(K.unWar) : 0);
  if (allied || support < -model.get(K.unNo)) return { vote: 'no', support };
  if (support > model.get(K.unYes)) return { vote: 'yes', support };
  return { vote: 'abstain', support };
}

/** Majorité requise au Conseil de sécurité (Charte des Nations unies, article 27). */
const UNSC_MAJORITY = 9;

const VOTE_LABEL: Record<Vote, string> = { yes: 'pour', no: 'contre', abstain: 'abstention' };

/** Résolution de l'ONU : votes, adoption, effets (commande journalisée). */
export function applyUnResolution(
  ctx: Pick<SystemContext, 'model' | 'state'>,
  command: Extract<Command, { type: 'unResolution' }>,
  seq: number,
): DiplomacyApplied {
  const S = ctx.state;
  const model = ctx.model;
  const n = S.n;
  const t = S.byId.get(command.target);
  if (t === undefined) throw new CommandError(`Entité inconnue : ${command.target}`);
  if (!(command.kind in UN_BASE)) throw new CommandError(`Résolution inconnue : ${command.kind}`);
  if (command.sponsor !== undefined && !S.byId.has(command.sponsor))
    throw new CommandError(`Entité inconnue : ${command.sponsor}`);
  const target = S.entities[t];
  if (!target) throw new CommandError(`Entité inconnue : ${command.target}`);
  const war = currentWarGrid(S);
  const council: { i: number; permanent: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const seat = S.genericValue('dip.unsc_seat', i);
    if (seat === 'permanent' || seat === 'elected')
      council.push({ i, permanent: seat === 'permanent' });
  }
  const factors: Factor[] = [];
  let yes = 0;
  let vetoes: string[] = [];
  for (const { i, permanent } of council) {
    const e = S.entities[i];
    if (!e) continue;
    const { vote, support } = voteOf(ctx, command.kind, i, t, war);
    if (vote === 'yes') yes++;
    if (vote === 'no' && permanent) vetoes = [...vetoes, e.nameFr];
    factors.push({
      id: `vote:${e.id}`,
      label: `${e.nameFr}${permanent ? ' (membre permanent)' : ''} : ${vote === 'no' && permanent ? 'veto' : VOTE_LABEL[vote]}`,
      value: fin(S.pairMatrix('pair.relation')[i * n + t] as number),
      unit: 'relation',
      contribution: support,
    });
  }
  const adopted = yes >= UNSC_MAJORITY && vetoes.length === 0;
  // Assemblée générale : vote non contraignant de tous les États si le Conseil échoue.
  const general: Record<Vote, number> = { yes: 0, no: 0, abstain: 0 };
  const generalYes: number[] = [];
  if (!adopted) {
    for (let i = 0; i < n; i++) {
      if (S.entities[i]?.kind !== 'state') continue;
      const { vote } = voteOf(ctx, command.kind, i, t, war);
      general[vote]++;
      if (vote === 'yes') generalYes.push(i);
    }
  }
  const generalAdopted = !adopted && general.yes > general.no;
  const before: SlotState[] = [];
  const effects: Effect[] = [];
  const entities = new Set([command.target, ...(command.sponsor ? [command.sponsor] : [])]);
  const setPair = (param: string, i: number, j: number, value: ParamValue): void => {
    const a = S.entities[i];
    const b = S.entities[j];
    if (!a || !b) return;
    const slot = pairSlot(param, a.id, b.id);
    before.push(captureSlot(S, slot));
    const from = S.pairValue(param, i, j);
    const matrix = S.pairNum.get(param);
    if (matrix) matrix[i * n + j] = typeof value === 'number' ? value : Number.NaN;
    else {
      const table = S.pairGen.get(param);
      if (table) table.set(i * n + j, value);
    }
    effects.push({ slot, from, to: S.pairValue(param, i, j) });
  };
  // Chocs sur les relations (mémoire, décroissance avec sa demi-vie), annulables.
  const internal: [string, number, number][] = [];
  const memory = S.internalArray('dip.memory', 0, n * n);
  let shocked = 0;
  const relationShock = (voters: number[], strength: number): void => {
    for (const v of voters) {
      if (v === t) continue;
      for (const [a, b, x] of [
        [t, v, strength],
        [v, t, strength * model.get(K.unReciprocity)],
      ] as const) {
        const k = a * n + b;
        internal.push(['dip.memory', k, memory[k] as number]);
        memoryShock(S, a, b, -x);
      }
      shocked++;
    }
  };
  const modifiers: Modifier[] = [];
  let note: string;
  const effectiveness = clamp(fin(S.worldEff('world.un_effectiveness')), 0, 100) / 100;
  // Application par les États membres : plancher, plus une part selon l'efficacité de l'ONU.
  const floor = clamp(model.get(K.unComplianceFloor), 0, 1);
  const complianceOf = (x: number): number => floor + (1 - floor) * x;
  if (adopted) {
    const councilYes = council
      .filter(({ i }) => voteOf(ctx, command.kind, i, t, war).vote === 'yes')
      .map(({ i }) => i);
    switch (command.kind) {
      case 'sanctions': {
        const tracks: Record<string, number> = {};
        for (const tr of TRACKS) {
          const x = command.tracks?.[tr];
          if (typeof x === 'number' && x > 0) tracks[tr] = clamp(x, 0, 1);
        }
        if (Object.keys(tracks).length === 0) tracks.trade = model.get(K.unDefaultTrade);
        const table = S.pairGen.get('pair.sanctions') ?? new Map<number, ParamValue>();
        for (let i = 0; i < n; i++) {
          if (i === t || S.entities[i]?.kind !== 'state') continue;
          const closeness =
            Math.max(0, fin(S.pairMatrix('pair.relation')[i * n + t] as number)) / 100;
          const compliance = complianceOf(effectiveness) * (1 - closeness);
          if (!(compliance > 0)) continue;
          const current = vectorValue(table.get(i * n + t) ?? null);
          const merged: Record<string, number> = { ...current };
          let changed = false;
          for (const [tr, x] of Object.entries(tracks)) {
            const v = Math.round(1000 * x * compliance) / 1000;
            if (v > (merged[tr] ?? 0)) {
              merged[tr] = v;
              changed = true;
            }
          }
          if (changed) setPair('pair.sanctions', i, t, merged);
        }
        relationShock(councilYes, model.get(K.unCondemnation) * model.get(K.unSecondaryShock));
        note = `Résolution de sanctions adoptée (${yes} voix pour) : les États membres appliquent les sanctions selon l'efficacité de l'ONU (${Math.round(effectiveness * 100)}) et leur proximité avec le pays visé.`;
        break;
      }
      case 'condemnation':
        relationShock(councilYes, model.get(K.unCondemnation));
        note = `Résolution de condamnation adoptée (${yes} voix pour).`;
        break;
      case 'peacekeeping': {
        const days = Math.max(1, Math.round(model.get(K.unPeacekeepingDays)));
        modifiers.push({
          op: 'add',
          amount: -model.get(K.unPeacekeeping) * complianceOf(effectiveness),
          durationDays: days,
          decay: 'linear',
          label: 'Mission de maintien de la paix',
          id: S.nextModifierId++,
          slot: { scope: 'country', param: 'pol.insurgency', entity: target.id },
          startTick: S.tick,
          seq,
          author: 'user',
        });
        note = `Mission de maintien de la paix autorisée (${yes} voix pour) : l'insurrection recule pendant ${days} jours.`;
        break;
      }
      default:
        note = `Résolution de cessez-le-feu adoptée (${yes} voix pour) : son effet sur les combats viendra avec les fronts (phase 5) ; consignée au journal.`;
    }
  } else {
    if (generalAdopted)
      relationShock(generalYes, model.get(K.unCondemnation) * model.get(K.unSecondaryShock));
    note =
      (vetoes.length > 0
        ? `Projet bloqué par le veto de ${vetoes.join(', ')}`
        : `Projet rejeté au Conseil de sécurité (${yes} voix pour sur ${UNSC_MAJORITY} nécessaires)`) +
      ` ; Assemblée générale : ${general.yes} pour, ${general.no} contre, ${general.abstain} abstentions (${generalAdopted ? 'adoptée, non contraignante' : 'rejetée'}).`;
  }
  for (const mod of modifiers) {
    S.modifiers.push(mod);
    effects.push({ slot: mod.slot, from: null, to: null, modifier: mod.id });
  }
  if (modifiers.length > 0) S.indexModifiers();
  for (const e of effects) {
    if (e.slot.scope === 'pair') {
      entities.add(e.slot.from);
      entities.add(e.slot.to);
    }
  }
  if (shocked > 0) {
    note += ` Relations : ${shocked} pays ayant voté pour voient leur relation avec ${target.nameFr} se dégrader (mémoire des chocs).`;
  }
  return {
    effects,
    inverse: { slots: before, removeModifiers: modifiers.map((x) => x.id), internal },
    entities: [...entities].slice(0, 50),
    factors,
    note,
  };
}

/** Résumé des adhésions pour l'interface : blocs d'un pays avec leur nom. */
export function blocNames(state: State, entity: string): { id: string; nameFr: string }[] {
  const i = state.byId.get(entity);
  if (i === undefined) return [];
  const blocs = new Map(state.data.world.blocs.map((b) => [b.id, b.nameFr]));
  return listOf(state.genericValue('dip.memberships', i)).map((id) => ({
    id,
    nameFr: blocs.get(id) ?? id,
  }));
}
