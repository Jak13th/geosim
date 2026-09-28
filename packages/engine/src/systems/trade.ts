/**
 * Commerce, routes maritimes et détroits (SPEC §8.3), pas mensuel ; accès, parts maritimes et flux
 * par les détroits recalculés après chaque commande.
 *
 * Détroits : la capacité de passage (`zone.chokepoint_traffic`, % du trafic normal) rejoint la
 * cible de son statut — ouvert 100, contesté (capacité de départ si le passage l'était déjà,
 * sinon un coefficient), fermé 0 — en un mois à la fermeture, plus lentement à la réouverture.
 *
 * Routes : une paire échange une part L par voie de terre (voisins : L_voisins ; reliés par la
 * terre : L_reliés · e^(−km/décroissance), au moins L_voisins si l'un des deux est enclavé : rail,
 * route et oléoducs plutôt qu'un détour par un port étranger) et 1 − L par mer. La route
 * principale passe si tous ses détroits passent (produit des capacités p_c) ; le reste se reporte
 * sur l'alternative (produit des capacités de ses détroits) en perdant (km_principale /
 * km_alternative)^γ du volume (détour) ; sans alternative, il est coupé :
 *   ρ_ij = L + (1 − L) · [p_principale + (1 − p_principale) · p_alternative · (km_p / km_a)^γ]
 *
 * Échanges de biens (exportations de i vers j) :
 *   T_ij = T⁰_ij · (Y_i/Y_i⁰)^α · (Y_j/Y_j⁰)^β / (Y_w/Y_w⁰)^(α+β−1) · Φ_ij
 * T⁰ : commerce observé (BACI, routes libres). Φ rejoint Φ* = ρ_ij(t) · Π_k F_k(t)/F_k(0), où les
 * frictions F_k (droits de douane, sanctions contre l'exportateur et de l'exportateur, guerre, bloc
 * commercial commun, relations, fragmentation) sont mesurées par rapport au départ, les données
 * les intégrant déjà ; les routes, elles, le sont par rapport à des routes libres (données de 2024,
 * avant la fermeture d'Ormuz). Φ baisse vite (délai court), remonte lentement.
 *
 * Réorientation : une part du commerce perdu se reporte sur d'autres partenaires (exportateur :
 * contournement des sanctions, détournement ; importateur : autres fournisseurs), selon la cause
 * de la perte (décomposition logarithmique des frictions), avec une décote à l'exportation et une
 * prime à l'importation. Les agrégats (hors énergie, traitée par les marchés et le système de
 * l'énergie) alimentent l'économie : perte d'exportations (choc de demande), perte d'importations
 * non remplacées (gains à l'échange, Arkolakis, Costinot et Rodríguez-Clare, 2012 :
 * niveau = (λ/λ_réf)^(−1/θ), λ part de la demande servie par la production nationale), coût des
 * importations (droits de douane, primes de remplacement : saut de prix) et solde courant.
 */
import type { ParamValue } from '@geosim/shared';
import { col, type State } from '../state.ts';
import type { System, SystemContext } from '../system.ts';
import { baseTradeBlocGrid, isTradeBloc, memberships, sharedBlocGrid } from './blocs.ts';
import {
  TRACK_INDEX,
  WAR,
  baseSanctionGrid,
  baseWarGrid,
  currentSanctionGrid,
  currentWarGrid,
  lockedPairs,
  pairBase,
  pairDistance,
  vectorValue,
} from './pairs.ts';

const C = {
  gdp: col('eco.gdp_nominal'),
  exports: col('trade.exports'),
  imports: col('trade.imports'),
  tariffLevel: col('trade.tariff_level'),
  alignment: col('dip.alignment'),
  maritime: col('trade.maritime_share'),
  routeAccess: col('trade.route_access'),
};

const K = {
  exporterGdp: 'trade.gravity.exporter_gdp',
  importerGdp: 'trade.gravity.importer_gdp',
  landNeighbors: 'trade.routes.land_share_neighbors',
  landConnected: 'trade.routes.land_share_connected',
  landDecay: 'trade.routes.land_decay_km',
  detour: 'trade.routes.detour_elasticity',
  contested: 'trade.chokepoints.contested_capacity',
  closureMonths: 'trade.chokepoints.closure_months',
  recoveryMonths: 'trade.chokepoints.recovery_months',
  tariffElasticity: 'trade.frictions.tariff_elasticity',
  blockMax: 'trade.frictions.sanction_block_max',
  financeBlock: 'trade.frictions.finance_block',
  transportBlock: 'trade.frictions.transport_block',
  manufacturedTech: 'trade.frictions.manufactured_tech_share',
  cutWar: 'trade.frictions.war_cut',
  cutBlockade: 'trade.frictions.blockade_cut',
  cutCrisis: 'trade.frictions.crisis_cut',
  cutCeasefire: 'trade.frictions.ceasefire_cut',
  cutTension: 'trade.frictions.tension_cut',
  bloc: 'trade.frictions.bloc_effect',
  relation: 'trade.frictions.relation_effect',
  fragmentation: 'trade.frictions.fragmentation_effect',
  maxRatio: 'trade.frictions.max_ratio',
  downMonths: 'trade.adjustment.down_months',
  upMonths: 'trade.adjustment.up_months',
  divert: 'trade.redirection.divert',
  sender: 'trade.redirection.sender',
  routeExporter: 'trade.redirection.route_exporter',
  warRedirect: 'trade.redirection.war',
  replace: 'trade.redirection.importer_replace',
  routeImporter: 'trade.redirection.route_importer',
  discount: 'trade.redirection.discount',
  premium: 'trade.redirection.replacement_premium',
  warEnergy: 'trade.redirection.war_energy',
  exportDemand: 'trade.effects.export_demand',
  acr: 'trade.effects.acr_elasticity',
  importCostPass: 'trade.effects.import_cost_passthrough',
} as const;

// ——— Routes ———

export interface RouteTable {
  /** Détroits, dans l'ordre des bits des masques. */
  chokepoints: string[];
  /** Entrée de la route de chaque paire (i × N + j), −1 : aucune. */
  index: Int32Array;
  mainKm: Float64Array;
  mainMask: Int32Array;
  altKm: Float64Array;
  altMask: Int32Array;
}

const routeCache = new WeakMap<object, RouteTable>();

/** Table des routes maritimes des données (calculée une fois par jeu de données). */
export function routeTable(state: State): RouteTable {
  let t = routeCache.get(state.data);
  if (t !== undefined) return t;
  const n = state.n;
  const entries = state.data.pairs.routes?.entries ?? [];
  t = {
    chokepoints: [...(state.data.pairs.routes?.chokepoints ?? [])],
    index: new Int32Array(n * n).fill(-1),
    mainKm: new Float64Array(entries.length),
    mainMask: new Int32Array(entries.length),
    altKm: new Float64Array(entries.length),
    altMask: new Int32Array(entries.length),
  };
  entries.forEach(([a, b, km, mask, altKm, altMask], r) => {
    const i = state.byId.get(a);
    const j = state.byId.get(b);
    if (i === undefined || j === undefined || !t) return;
    t.index[i * n + j] = r;
    t.index[j * n + i] = r;
    t.mainKm[r] = km;
    t.mainMask[r] = mask;
    t.altKm[r] = altKm;
    t.altMask[r] = altMask;
  });
  routeCache.set(state.data, t);
  return t;
}

/** Capacités de passage (0–1) des détroits de la table : courantes ou de départ. */
export function capacities(state: State, table: RouteTable, start: boolean): Float64Array {
  const zone = (start ? state.zoneBase : state.zone).get('zone.chokepoint_traffic');
  return Float64Array.from(table.chokepoints, (id) => {
    const v = zone?.get(id);
    return typeof v === 'number' ? Math.min(1, Math.max(0, v / 100)) : 1;
  });
}

function maskProduct(mask: number, cap: Float64Array): number {
  let p = 1;
  for (let b = 0; mask !== 0 && b < cap.length; b++) {
    if (mask & (1 << b)) {
      p *= cap[b] as number;
      mask &= ~(1 << b);
    }
  }
  return p;
}

/**
 * Accès maritime de chaque route : part du volume qui passe (principale, ou détour par
 * l'alternative), et parts qui empruntent la principale et l'alternative.
 */
export function seaAccess(
  table: RouteTable,
  cap: Float64Array,
  detour: number,
): { access: Float64Array; main: Float64Array; alt: Float64Array } {
  const R = table.mainKm.length;
  const access = new Float64Array(R);
  const main = new Float64Array(R);
  const alt = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    const pMain = maskProduct(table.mainMask[r] as number, cap);
    const altKm = table.altKm[r] as number;
    let viaAlt = 0;
    if (altKm > 0) {
      const pAlt = maskProduct(table.altMask[r] as number, cap);
      const mainKm = table.mainKm[r] as number;
      const q = mainKm > 0 ? Math.pow(Math.min(1, mainKm / altKm), detour) : 1;
      viaAlt = (1 - pMain) * pAlt * q;
    }
    main[r] = pMain;
    alt[r] = viaAlt;
    access[r] = pMain + viaAlt;
  }
  return { access, main, alt };
}

/** Part des échanges d'une paire qui passe par la terre (hypothèse sur la distance). */
export function landShare(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  i: number,
  j: number,
): number {
  return landShareGrid(ctx, state)[i * state.n + j] as number;
}

/**
 * Accès des routes de chaque paire (N × N, symétrique) : part du volume normal qui peut passer
 * avec les capacités données.
 */
export function routeAccessGrid(
  ctx: Pick<SystemContext, 'model'>,
  state: State,
  sea: Float64Array,
): Float64Array {
  const n = state.n;
  const table = routeTable(state);
  const land = landShareGrid(ctx, state);
  const out = new Float64Array(n * n).fill(1);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = table.index[i * n + j] as number;
      if (r < 0) continue;
      const L = land[i * n + j] as number;
      const rho = L + (1 - L) * (sea[r] as number);
      out[i * n + j] = rho;
      out[j * n + i] = rho;
    }
  }
  return out;
}

// ——— Frictions ———

/** Poids des postes de biens (énergie, alimentation, minerais, puces, manufacturés) d'un exportateur. */
function goodsWeights(
  state: State,
  i: number,
): {
  energy: number;
  food: number;
  minerals: number;
  chips: number;
  manufactured: number;
  goodsShare: number;
} {
  const c = vectorValue(state.genericValue('trade.composition', i));
  const energy = c.energy ?? 0;
  const food = c.food ?? 0;
  const minerals = c.minerals ?? 0;
  const chips = c.chips ?? 0;
  const manufactured = c.manufactured ?? 0;
  const goods = energy + food + minerals + chips + manufactured;
  if (!(goods > 0)) {
    return { energy: 0, food: 0, minerals: 0, chips: 0, manufactured: 1, goodsShare: 1 };
  }
  return {
    energy: energy / goods,
    food: food / goods,
    minerals: minerals / goods,
    chips: chips / goods,
    manufactured: manufactured / goods,
    goodsShare: Math.min(1, goods / 100),
  };
}

type Weights = ReturnType<typeof goodsWeights>;

/** Part bloquée d'un flux par des sanctions (volets pondérés par la structure des exportations). */
function blocked(
  c: FrictionCoefs,
  grid: Float32Array,
  n2: number,
  k: number,
  w: Weights,
  sea: number,
): number {
  const trade = grid[TRACK_INDEX.trade * n2 + k] as number;
  const tech = grid[TRACK_INDEX.technology * n2 + k] as number;
  const goods =
    w.energy * (grid[TRACK_INDEX.energy * n2 + k] as number) +
    (w.food + w.minerals) * trade +
    w.chips * tech +
    w.manufactured * Math.max(trade, c.manufacturedTech * tech);
  const b =
    1 -
    (1 - Math.min(1, goods)) *
      (1 - c.financeBlock * (grid[TRACK_INDEX.finance * n2 + k] as number)) *
      (1 - c.transportBlock * (grid[TRACK_INDEX.transport * n2 + k] as number) * sea);
  return Math.min(c.blockMax, Math.max(0, b));
}

/** Part du commerce coupée selon l'état de la relation. */
function warCut(m: SystemContext['model'], code: number): number {
  switch (code) {
    case WAR.war:
      return m.get(K.cutWar);
    case WAR.blockade:
      return m.get(K.cutBlockade);
    case WAR.crisis:
      return m.get(K.cutCrisis);
    case WAR.ceasefire:
      return m.get(K.cutCeasefire);
    case WAR.tension:
      return m.get(K.cutTension);
    default:
      return 0;
  }
}

/** Coefficients des frictions, lus une fois par pas (boucle N × N). */
interface FrictionCoefs {
  manufacturedTech: number;
  financeBlock: number;
  transportBlock: number;
  blockMax: number;
  tariffElasticity: number;
  bloc: number;
  relation: number;
  fragmentation: number;
  /** log(1 − coupure) de chaque état de la relation (indice : code de `pair.war_state`). */
  logWar: Float64Array;
}

function frictionCoefs(m: SystemContext['model']): FrictionCoefs {
  return {
    manufacturedTech: m.get(K.manufacturedTech),
    financeBlock: m.get(K.financeBlock),
    transportBlock: m.get(K.transportBlock),
    blockMax: m.get(K.blockMax),
    tariffElasticity: m.get(K.tariffElasticity),
    bloc: m.get(K.bloc),
    relation: m.get(K.relation),
    fragmentation: m.get(K.fragmentation),
    logWar: Float64Array.from({ length: 6 }, (_, code) =>
      Math.log(Math.max(1e-6, 1 - warCut(m, code))),
    ),
  };
}

/** Entrées des frictions à un instant (courant ou départ). */
interface FrictionInputs {
  tariffLevel: Float64Array;
  tariffs: Float64Array;
  sanctions: Float32Array;
  war: Uint8Array;
  tradeBloc: Uint8Array;
  relation: Float64Array;
  alignment: Float64Array;
  fragmentation: number;
}

/** Composantes logarithmiques des frictions (hors routes) d'un flux i → j. */
const FRICTIONS = [
  'tariff',
  'sanctionTarget',
  'sanctionSender',
  'war',
  'bloc',
  'relation',
  'fragmentation',
] as const;
type Friction = (typeof FRICTIONS)[number];

function frictions(
  c: FrictionCoefs,
  inp: FrictionInputs,
  n: number,
  i: number,
  j: number,
  w: Weights,
  sea: number,
  out: Float64Array,
): void {
  const k = i * n + j;
  const kr = j * n + i;
  const n2 = n * n;
  const tariff =
    Math.max(0, fin(inp.tariffLevel[j] as number)) + Math.max(0, fin(inp.tariffs[kr] as number));
  out[0] = -c.tariffElasticity * Math.log(1 + tariff / 100);
  // Sanctions de j contre i (i exporte vers un pays qui le sanctionne) et de i contre j.
  out[1] = Math.log(1 - blocked(c, inp.sanctions, n2, kr, w, sea));
  out[2] = Math.log(1 - blocked(c, inp.sanctions, n2, k, w, sea));
  out[3] = c.logWar[inp.war[k] as number] ?? 0;
  out[4] = c.bloc * (inp.tradeBloc[k] as number);
  const r = (fin(inp.relation[k] as number) + fin(inp.relation[kr] as number)) / 200;
  out[5] = c.relation * r;
  const gap = Math.abs(fin(inp.alignment[i] as number) - fin(inp.alignment[j] as number)) / 200;
  out[6] = -c.fragmentation * (inp.fragmentation / 100) * gap;
}

const fin = (x: number): number => (Number.isFinite(x) ? x : 0);

function currentInputs(state: State): FrictionInputs {
  return {
    tariffLevel: state.e(C.tariffLevel).slice(),
    tariffs: state.pairMatrix('pair.tariffs'),
    sanctions: currentSanctionGrid(state),
    war: currentWarGrid(state),
    tradeBloc: sharedBlocGrid(state, memberships(state), isTradeBloc),
    relation: state.pairMatrix('pair.relation'),
    alignment: state.e(C.alignment).slice(),
    fragmentation: fin(state.worldEff('world.trade_fragmentation')),
  };
}

const startTariffs = new WeakMap<object, Float64Array>();

function startInputs(state: State): FrictionInputs {
  const n = state.n;
  let tariffs = startTariffs.get(state.data);
  if (tariffs === undefined) {
    tariffs = new Float64Array(n * n);
    for (const [k, v] of pairBase(state, 'pair.tariffs')) if (typeof v === 'number') tariffs[k] = v;
    startTariffs.set(state.data, tariffs);
  }
  const frag = state.worldBase.get('world.trade_fragmentation');
  return {
    tariffLevel: state.base.subarray(C.tariffLevel * n, (C.tariffLevel + 1) * n),
    tariffs,
    sanctions: baseSanctionGrid(state),
    war: baseWarGrid(state),
    tradeBloc: baseTradeBlocGrid(state),
    relation: state.internalArray('dip.relation0', Number.NaN, n * n),
    alignment: state.base.subarray(C.alignment * n, (C.alignment + 1) * n),
    fragmentation: typeof frag === 'number' ? frag : 0,
  };
}

// ——— Système ———

/** Tableaux internes lus par les autres systèmes (économie, énergie, marchés). */
export const TRADE_OUT = {
  /** Choc de demande du mois sur l'écart de production (points). */
  impulse: 'econ.impulse.trade',
  /** Saut du niveau des prix importés du mois (points d'inflation). */
  jump: 'econ.jump.trade',
  /** Variation du solde courant du mois (points de PIB). */
  ca: 'econ.ca.trade',
  /** Niveau du PIB potentiel dû aux gains à l'échange (1 au départ). */
  level: 'trade.level',
  /** Accès des routes des exportations de chaque pays (0–1), courant et au départ. */
  exportRoute: 'trade.exportRoute',
  exportRoute0: 'trade.exportRoute0',
  /** Facteur des sanctions et des guerres sur les exportations d'énergie (0–1), courant et au départ. */
  exportSW: 'trade.exportSW',
  exportSW0: 'trade.exportSW0',
  /** Accès maritime de chaque route (entrées de la table), courant et au départ. */
  sea: 'trade.seaAccess',
  sea0: 'trade.seaAccess0',
} as const;

function gdpScale(state: State): { ratio: Float64Array; world: number } {
  const n = state.n;
  const ratio = new Float64Array(n);
  let now = 0;
  let before = 0;
  for (let i = 0; i < n; i++) {
    const y = state.e(C.gdp)[i] as number;
    const y0 = state.base[C.gdp * n + i] as number;
    ratio[i] = y > 0 && y0 > 0 ? y / y0 : 1;
    if (state.entities[i]?.kind === 'faction') continue;
    if (y > 0) now += y;
    if (y0 > 0) before += y0;
  }
  return { ratio, world: before > 0 ? now / before : 1 };
}

/** Facteurs de gravité précalculés : (Y_i/Y_i⁰)^α, (Y_j/Y_j⁰)^β et (Y_w/Y_w⁰)^(α+β−1). */
interface GravityScale {
  exporter: Float64Array;
  importer: Float64Array;
  world: number;
}

function gravityScale(ctx: Pick<SystemContext, 'model'>, state: State): GravityScale {
  const scale = gdpScale(state);
  const a = ctx.model.get(K.exporterGdp);
  const b = ctx.model.get(K.importerGdp);
  return {
    exporter: Float64Array.from(scale.ratio, (x) => Math.pow(x, a)),
    importer: Float64Array.from(scale.ratio, (x) => Math.pow(x, b)),
    world: Math.pow(scale.world, a + b - 1),
  };
}

/** Échanges de référence (sans chocs) : gravité sur les PIB nominaux. */
function referenceScale(g: GravityScale, i: number, j: number): number {
  return ((g.exporter[i] as number) * (g.importer[j] as number)) / g.world;
}

/**
 * Cible de trafic (% du trafic normal) d'un détroit selon son statut : ouvert 100, fermé 0,
 * contesté (capacité de départ si le passage l'était déjà, sinon un coefficient). Pure (aucune
 * écriture) : réutilisée par le marché pétrolier pour anticiper un changement de statut avant que
 * le trafic n'ait fini d'y converger (`markets.ts`, `oilAnticipationShock`).
 */
export function chokepointTarget(
  S: State,
  m: SystemContext['model'],
  id: string,
  status: ParamValue,
): number {
  if (status === 'closed') return 0;
  if (status === 'contested') {
    const start = S.zoneBase.get('zone.chokepoint_traffic')?.get(id);
    const startStatus = S.zoneBase.get('zone.chokepoint_status')?.get(id);
    return startStatus === 'contested' && typeof start === 'number' ? start : m.get(K.contested);
  }
  return 100;
}

/** Mise à jour des capacités de passage des détroits selon leur statut. */
function updateChokepoints(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const status = S.zone.get('zone.chokepoint_status');
  const cap = S.zone.get('zone.chokepoint_traffic');
  if (!status || !cap) return;
  for (const [id, st] of status) {
    const now = cap.get(id);
    if (typeof now !== 'number') continue;
    const target = chokepointTarget(S, m, id, st);
    const months = target < now ? m.get(K.closureMonths) : m.get(K.recoveryMonths);
    S.writeZone('zone.chokepoint_traffic', id, now + (target - now) / Math.max(1, months));
  }
}

/** Accès maritimes des routes, courants et de départ (tableaux internes). */
function computeSea(ctx: SystemContext): {
  now: Float64Array;
  start: Float64Array;
  main: Float64Array;
  alt: Float64Array;
} {
  const S = ctx.state;
  const table = routeTable(S);
  const detour = ctx.model.get(K.detour);
  const now = seaAccess(table, capacities(S, table, false), detour);
  const start = seaAccess(table, capacities(S, table, true), detour);
  const R = table.mainKm.length;
  S.internalArray(TRADE_OUT.sea, 1, R).set(now.access);
  S.internalArray(TRADE_OUT.sea0, 1, R).set(start.access);
  return { now: now.access, start: start.access, main: now.main, alt: now.alt };
}

function init(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  const base = S.internalArray('trade.base', 0, n * n);
  const trade = S.pairMatrix('pair.trade');
  for (let k = 0; k < n * n; k++) {
    const t = trade[k] as number;
    base[k] = t > 0 ? t : 0;
  }
  // Relations de départ (référence des frictions) : complétées par la diplomatie à son calage.
  const rel0 = S.internalArray('dip.relation0', Number.NaN, n * n);
  rel0.set(S.pairMatrix('pair.relation'));
  S.internalArray(TRADE_OUT.level, 1);
  S.internalArray(TRADE_OUT.impulse, 0);
  S.internalArray(TRADE_OUT.jump, 0);
  S.internalArray(TRADE_OUT.ca, 0);
  // Routes au départ : les données (2024) décrivent des routes libres ; la capacité de départ des
  // détroits (Ormuz…) s'applique d'emblée.
  const sea = computeSea(ctx);
  const rho = routeAccessGrid(ctx, S, sea.now);
  const phi = S.internalArray('trade.phi', 1, n * n);
  for (let k = 0; k < n * n; k++) phi[k] = rho[k] as number;
  const agg = step(ctx, rho, true);
  S.internalArray('trade.level0', 1).set(agg.levelRaw);
  S.internalArray(TRADE_OUT.level, 1).fill(1);
  S.internalArray('trade.lossX', 0).set(agg.lossX);
  S.internalArray('trade.lossM', 0).set(agg.lossM);
  S.internalArray('trade.importCost', 0).set(agg.cost);
  writeAggregates(ctx, agg);
  exportAccess(ctx, rho);
  derive(ctx);
  // Flux de départ des détroits : valeur de référence (affichage « calculée au départ »).
  const flow = S.zone.get('zone.chokepoint_flow');
  const flowBase = S.zoneBase.get('zone.chokepoint_flow');
  if (flow && flowBase) for (const [id, v] of flow) flowBase.set(id, v);
}

interface Aggregates {
  /** Perte d'exportations hors énergie, après réorientation (% du PIB). */
  lossX: Float64Array;
  /** Perte d'importations hors énergie non remplacées (% du PIB). */
  lossM: Float64Array;
  /** Surcoût des importations : droits de douane et primes de remplacement (% du PIB). */
  cost: Float64Array;
  /** Niveau de gains à l'échange (absolu). */
  levelRaw: Float64Array;
  /** Exportations et importations de biens effectives, toutes marchandises (Md$). */
  xAll: Float64Array;
  mAll: Float64Array;
}

/**
 * Pas du commerce : Φ rejoint sa cible (sauf au départ, où Φ = ρ), matrice des échanges écrite,
 * agrégats par pays.
 */
function step(ctx: SystemContext, rho: Float64Array, initial: boolean): Aggregates {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const n2 = n * n;
  const base = S.internalArray('trade.base', 0, n2);
  const phi = S.internalArray('trade.phi', 1, n2);
  const written = S.internalArray('trade.written', Number.NaN, n2);
  const trade = S.pairMatrix('pair.trade');
  const scale = gravityScale(ctx, S);
  const locked = lockedPairs(S, 'pair.trade');
  const land = landShareGrid(ctx, S);
  const coefs = frictionCoefs(m);

  // Modifications de l'utilisateur depuis le mois précédent : nouvelle base de la paire.
  if (!initial) {
    for (let k = 0; k < n2; k++) {
      const w = written[k] as number;
      const t = trade[k] as number;
      if (Number.isNaN(w) || !(Math.abs(t - w) > 1e-9 * Math.max(1, Math.abs(w)))) continue;
      const i = Math.floor(k / n);
      const j = k % n;
      const ref = referenceScale(scale, i, j) * (phi[k] as number);
      base[k] = ref > 0 ? Math.max(0, t) / ref : Math.max(0, t);
      if (!(ref > 0)) phi[k] = 1;
    }
  }

  const now = currentInputs(S);
  const start = startInputs(S);
  const weights = Array.from({ length: n }, (_, i) => goodsWeights(S, i));
  const evasion = S.internalArray('sanctions.evasion', 0);
  const fNow = new Float64Array(FRICTIONS.length);
  const fStart = new Float64Array(FRICTIONS.length);
  const down = 1 / Math.max(1, m.get(K.downMonths));
  const up = 1 / Math.max(1, m.get(K.upMonths));
  const maxRatio = m.get(K.maxRatio);
  const redirectX: Record<Friction | 'route', (i: number, j: number) => number> = {
    tariff: () => m.get(K.divert),
    sanctionTarget: (i) => evasion[i] as number,
    sanctionSender: () => m.get(K.sender),
    war: () => m.get(K.warRedirect),
    bloc: () => m.get(K.divert),
    relation: () => m.get(K.divert),
    fragmentation: () => m.get(K.divert),
    route: () => m.get(K.routeExporter),
  };
  const redirectM: Record<Friction | 'route', (i: number, j: number) => number> = {
    tariff: () => m.get(K.replace),
    // Sanctions de j (importateur) contre i : j remplace ses importations ailleurs.
    sanctionTarget: () => m.get(K.replace),
    // Sanctions de i contre j : j, visé, contourne selon sa capacité.
    sanctionSender: (_i, j) => evasion[j] as number,
    war: () => m.get(K.warRedirect),
    bloc: () => m.get(K.replace),
    relation: () => m.get(K.replace),
    fragmentation: () => m.get(K.replace),
    route: () => m.get(K.routeImporter),
  };
  const discount = m.get(K.discount);
  const premium = m.get(K.premium);

  const lossXabs = new Float64Array(n);
  const lossMabs = new Float64Array(n);
  const costAbs = new Float64Array(n);
  const xAll = new Float64Array(n);
  const mAll = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const wi = weights[i] as Weights;
    const nonEnergy = 1 - wi.energy;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const k = i * n + j;
      const t0 = base[k] as number;
      if (!(t0 > 0)) {
        if (!locked.has(k) && (trade[k] as number) !== 0) trade[k] = 0;
        written[k] = trade[k] as number;
        continue;
      }
      const ref = t0 * referenceScale(scale, i, j);
      const L = land[k] as number;
      frictions(coefs, now, n, i, j, wi, 1 - L, fNow);
      frictions(coefs, start, n, i, j, wi, 1 - L, fStart);
      let logTarget = Math.log(Math.max(1e-9, rho[k] as number));
      let negTotal = Math.max(0, -logTarget);
      for (let f = 0; f < FRICTIONS.length; f++) {
        const d = (fNow[f] as number) - (fStart[f] as number);
        logTarget += d;
        negTotal += Math.max(0, -d);
      }
      const target = Math.min(maxRatio, Math.exp(logTarget));
      let p = phi[k] as number;
      if (!initial) p += (target - p) * (target < p ? down : up);
      phi[k] = p;
      if (!locked.has(k)) trade[k] = ref * p;
      const t = trade[k] as number;
      written[k] = t;

      // Réorientation de la perte, selon ses causes.
      const loss = Math.max(0, ref - t);
      let rX = 0;
      let rM = 0;
      if (loss > 0 && negTotal > 0) {
        const routeShare = Math.max(0, -Math.log(Math.max(1e-9, rho[k] as number))) / negTotal;
        rX += routeShare * redirectX.route(i, j);
        rM += routeShare * redirectM.route(i, j);
        for (let f = 0; f < FRICTIONS.length; f++) {
          const share = Math.max(0, (fStart[f] as number) - (fNow[f] as number)) / negTotal;
          if (share === 0) continue;
          const name = FRICTIONS[f] as Friction;
          rX += share * redirectX[name](i, j);
          rM += share * redirectM[name](i, j);
        }
      }
      rX = Math.min(1, Math.max(0, rX));
      rM = Math.min(1, Math.max(0, rM));
      xAll[i] = (xAll[i] as number) + t + loss * rX * (1 - discount);
      mAll[j] = (mAll[j] as number) + t + loss * rM;
      lossXabs[i] = (lossXabs[i] as number) + (ref - t - loss * rX * (1 - discount)) * nonEnergy;
      lossMabs[j] = (lossMabs[j] as number) + (ref - t - loss * rM) * nonEnergy;
      // Droits de douane : surcoût (ou gain) par rapport au départ sur ce qui est encore importé.
      const tariffNow = fin(now.tariffLevel[j] as number) + fin(now.tariffs[j * n + i] as number);
      const tariffStart =
        fin(start.tariffLevel[j] as number) + fin(start.tariffs[j * n + i] as number);
      costAbs[j] =
        (costAbs[j] as number) +
        ((t * (tariffNow - tariffStart)) / 100) * nonEnergy +
        loss * rM * premium * nonEnergy;
    }
  }

  const lossX = new Float64Array(n);
  const lossM = new Float64Array(n);
  const cost = new Float64Array(n);
  const levelRaw = new Float64Array(n);
  const theta = Math.max(0.5, m.get(K.acr));
  for (let i = 0; i < n; i++) {
    const y = S.e(C.gdp)[i] as number;
    if (!(y > 0)) {
      levelRaw[i] = 1;
      continue;
    }
    lossX[i] = ((lossXabs[i] as number) / y) * 100;
    lossM[i] = ((lossMabs[i] as number) / y) * 100;
    cost[i] = ((costAbs[i] as number) / y) * 100;
    const m0 = Math.min(0.9, Math.max(0, fin(S.base[C.imports * n + i] as number) / 100));
    const domestic = 1 - m0 + (lossM[i] as number) / 100;
    levelRaw[i] = Math.pow(Math.max(0.05, domestic / (1 - m0)), -1 / theta);
  }
  return { lossX, lossM, cost, levelRaw, xAll, mAll };
}

/** Parts terrestres par jeu d'entrées (coefficients, frontières, distances, enclavement). */
const landCache = new WeakMap<
  State,
  {
    version: string;
    border: Float64Array;
    land: Float64Array;
    landlocked: Uint8Array;
    values: Float64Array;
  }
>();

/** Pays enclavés (`geo.landlocked`). */
function landlockedFlags(state: State): Uint8Array {
  return Uint8Array.from({ length: state.n }, (_, i) =>
    state.genericValue('geo.landlocked', i) === true ? 1 : 0,
  );
}

/** Part terrestre des échanges de chaque paire (N × N), recalculée si ses entrées changent. */
export function landShareGrid(ctx: Pick<SystemContext, 'model'>, state: State): Float64Array {
  const m = ctx.model;
  const n = state.n;
  const neighbors = m.get(K.landNeighbors);
  const connected = m.get(K.landConnected);
  const decay = Math.max(1, m.get(K.landDecay));
  const border = state.pairMatrix('pair.border_length');
  const land = pairDistance(state, 'land');
  const landlocked = landlockedFlags(state);
  const version = `${neighbors}|${connected}|${decay}|${state.pairVersionOf('pair.border_length')}`;
  const cached = landCache.get(state);
  if (
    cached &&
    cached.version === version &&
    cached.border === border &&
    cached.land === land &&
    cached.landlocked.every((x, i) => x === landlocked[i])
  ) {
    return cached.values;
  }
  const values = new Float64Array(n * n);
  for (let k = 0; k < values.length; k++) {
    const d = land[k] as number;
    if ((border[k] as number) > 0) values[k] = neighbors;
    else if (d >= 0) {
      const enclave = landlocked[Math.floor(k / n)] === 1 || landlocked[k % n] === 1;
      values[k] = Math.max(connected * Math.exp(-d / decay), enclave ? neighbors : 0);
    }
  }
  landCache.set(state, { version, border, land, landlocked, values });
  return values;
}

function writeAggregates(ctx: SystemContext, agg: Aggregates): void {
  const S = ctx.state;
  const n = S.n;
  const base = S.internalArray('trade.base', 0, n * n);
  for (let i = 0; i < n; i++) {
    const y = S.e(C.gdp)[i] as number;
    const y0 = S.base[C.gdp * n + i] as number;
    if (!(y > 0) || !(y0 > 0)) continue;
    let x0 = 0;
    let m0 = 0;
    for (let j = 0; j < n; j++) {
      x0 += base[i * n + j] as number;
      m0 += base[j * n + i] as number;
    }
    const goods = goodsWeights(S, i).goodsShare;
    const ex0 = S.base[C.exports * n + i] as number;
    const im0 = S.base[C.imports * n + i] as number;
    if (Number.isFinite(ex0) && x0 > 0) {
      const ratio = (agg.xAll[i] as number) / y / (x0 / y0);
      S.write(C.exports, i, ex0 * (1 - goods + goods * ratio));
    }
    if (Number.isFinite(im0) && m0 > 0) {
      const ratio = (agg.mAll[i] as number) / y / (m0 / y0);
      S.write(C.imports, i, im0 * (1 - goods + goods * ratio));
    }
  }
}

/**
 * Accès des exportations de chaque pays : par les routes (pondéré par ses partenaires), et facteur
 * des sanctions et des guerres sur l'énergie (un producteur sanctionné réoriente ses ventes selon
 * sa capacité de contournement ; un client en guerre est remplacé).
 */
function exportAccess(ctx: SystemContext, rho: Float64Array): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  const n2 = n * n;
  const base = S.internalArray('trade.base', 0, n2);
  const sea0 = S.internalArray(TRADE_OUT.sea0, 1, routeTable(S).mainKm.length);
  const rho0 = routeAccessGrid(ctx, S, sea0);
  const evasion = S.internalArray('sanctions.evasion', 0);
  const evasion0 = S.internalArray('sanctions.evasion0', 0);
  const now = { sanctions: currentSanctionGrid(S), war: currentWarGrid(S) };
  const start = { sanctions: baseSanctionGrid(S), war: baseWarGrid(S) };
  const warRedirect = m.get(K.warEnergy);
  const eIdx = TRACK_INDEX.energy * n2;
  const outR = S.internalArray(TRADE_OUT.exportRoute, 1);
  const outR0 = S.internalArray(TRADE_OUT.exportRoute0, 1);
  const outSW = S.internalArray(TRADE_OUT.exportSW, 1);
  const outSW0 = S.internalArray(TRADE_OUT.exportSW0, 1);
  for (let i = 0; i < n; i++) {
    let w = 0;
    let r = 0;
    let r0 = 0;
    let sw = 0;
    let sw0 = 0;
    for (let j = 0; j < n; j++) {
      const k = i * n + j;
      const t0 = base[k] as number;
      if (!(t0 > 0) || i === j) continue;
      const kr = j * n + i;
      w += t0;
      r += t0 * (rho[k] as number);
      r0 += t0 * (rho0[k] as number);
      const f = (grid: Float32Array, war: Uint8Array, ev: number): number => {
        const b = Math.max(grid[eIdx + k] as number, grid[eIdx + kr] as number);
        return (1 - b * (1 - ev)) * (1 - warCut(m, war[k] as number) * (1 - warRedirect));
      };
      sw += t0 * f(now.sanctions, now.war, evasion[i] as number);
      sw0 += t0 * f(start.sanctions, start.war, evasion0[i] as number);
    }
    outR[i] = w > 0 ? r / w : 1;
    outR0[i] = w > 0 ? r0 / w : 1;
    outSW[i] = w > 0 ? sw / w : 1;
    outSW0[i] = w > 0 ? sw0 / w : 1;
  }
}

function monthly(ctx: SystemContext): void {
  const S = ctx.state;
  const m = ctx.model;
  const n = S.n;
  updateChokepoints(ctx);
  const sea = computeSea(ctx);
  const rho = routeAccessGrid(ctx, S, sea.now);
  const agg = step(ctx, rho, false);
  const lossX = S.internalArray('trade.lossX', 0);
  const lossM = S.internalArray('trade.lossM', 0);
  const cost = S.internalArray('trade.importCost', 0);
  const level0 = S.internalArray('trade.level0', 1);
  const impulse = S.internalArray(TRADE_OUT.impulse, 0);
  const jump = S.internalArray(TRADE_OUT.jump, 0);
  const ca = S.internalArray(TRADE_OUT.ca, 0);
  const level = S.internalArray(TRADE_OUT.level, 1);
  for (let i = 0; i < n; i++) {
    const dX = (agg.lossX[i] as number) - (lossX[i] as number);
    const dM = (agg.lossM[i] as number) - (lossM[i] as number);
    const dCost = (agg.cost[i] as number) - (cost[i] as number);
    impulse[i] = -m.get(K.exportDemand) * dX;
    jump[i] = m.get(K.importCostPass) * dCost;
    ca[i] = -dX + dM - dCost;
    level[i] = (agg.levelRaw[i] as number) / (level0[i] as number);
  }
  lossX.set(agg.lossX);
  lossM.set(agg.lossM);
  cost.set(agg.cost);
  writeAggregates(ctx, agg);
  exportAccess(ctx, rho);
}

/**
 * Dérivés (après chaque pas et chaque commande) : accès des routes et part maritime de chaque
 * pays, flux par les détroits.
 */
function derive(ctx: SystemContext): void {
  const S = ctx.state;
  const n = S.n;
  const table = routeTable(S);
  if (table.mainKm.length === 0) return;
  const detour = ctx.model.get(K.detour);
  const now = seaAccess(table, capacities(S, table, false), detour);
  const trade = S.pairMatrix('pair.trade');
  const base = S.internalArray('trade.base', 0, n * n);
  const scale = gravityScale(ctx, S);
  const land = landShareGrid(ctx, S);
  const flows = new Float64Array(table.chokepoints.length);
  const normal = new Float64Array(table.chokepoints.length);
  for (let i = 0; i < n; i++) {
    let volume = 0;
    let sea = 0;
    let refVolume = 0;
    let access = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const k = i * n + j;
      const kr = j * n + i;
      const v = Math.max(0, trade[k] as number) + Math.max(0, trade[kr] as number);
      const vRef =
        (base[k] as number) * referenceScale(scale, i, j) +
        (base[kr] as number) * referenceScale(scale, j, i);
      if (!(v > 0) && !(vRef > 0)) continue;
      const r = table.index[k] as number;
      const L = land[k] as number;
      const seaAccessK = r >= 0 ? (now.access[r] as number) : 1;
      volume += v;
      sea += v * (1 - L);
      refVolume += vRef;
      access += vRef * (L + (1 - L) * seaAccessK);
      // Flux par les détroits : chaque paire comptée une fois (i < j).
      if (r >= 0 && i < j) {
        const onSea = v * (1 - L);
        const refSea = vRef * (1 - L);
        const mainMask = table.mainMask[r] as number;
        const altMask = table.altMask[r] as number;
        for (let b = 0; b < table.chokepoints.length; b++) {
          const bit = 1 << b;
          if (mainMask & bit) {
            flows[b] =
              (flows[b] as number) +
              (onSea * (now.main[r] as number)) / Math.max(1e-9, now.access[r] as number);
            normal[b] = (normal[b] as number) + refSea;
          }
          if (altMask & bit) {
            flows[b] =
              (flows[b] as number) +
              (onSea * (now.alt[r] as number)) / Math.max(1e-9, now.access[r] as number);
          }
        }
      }
    }
    S.write(C.maritime, i, volume > 0 ? (100 * sea) / volume : 0);
    S.write(C.routeAccess, i, refVolume > 0 ? (100 * access) / refVolume : 100);
  }
  table.chokepoints.forEach((id, b) => {
    const nb = normal[b] as number;
    // Un passage qui ne sert que de contournement n'a pas de trafic normal : flux au maximum.
    const flow = nb > 0 ? (100 * (flows[b] as number)) / nb : (flows[b] as number) > 0 ? 300 : 100;
    S.writeZone('zone.chokepoint_flow', id, flow);
  });
}

export const tradeSystem: System = {
  id: 'trade',
  coefficients: Object.values(K),
  writes: ['trade.exports', 'trade.imports', 'trade.maritime_share', 'trade.route_access'],
  init,
  monthly,
  derive,
};
