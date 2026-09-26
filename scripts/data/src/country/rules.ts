/**
 * Règles de résolution des paramètres pays : pour chaque paramètre du catalogue (portée
 * `country`), une chaîne de sources essayées dans l'ordre, puis un repli explicite.
 * Toute valeur produite porte sa provenance (source, année ou date, confiance, méthode).
 *
 * Replis (SPEC §5.3, « niveau standard ») :
 * - `median` : médiane de pays comparables (même région et même groupe de revenu, sinon même
 *   groupe de revenu, sinon même région, sinon monde) ;
 * - `median_per_capita` / `median_per_gdp` : idem sur le ratio à la population ou au PIB,
 *   pour les grandeurs extensives (population active, réserves…) ;
 * - `default` : hypothèse de defaults.yaml (confiance `assumption`) ;
 * - `zero` : absence documentée (certaine si le fichier curé est une liste exhaustive) ;
 *   `not_applicable` : sans objet ; `none` : lacune signalée.
 * - `runtime` : paramètre dérivé, calculé par le moteur (non stocké).
 */
import { REGIME_TYPES, TRADE_SECTORS, type Confidence } from '@geosim/shared';
import type { ParamValue } from './curated.ts';
import {
  numberOf,
  valueOf,
  type Ctx,
  type EntityInfo,
  type Method,
  type Resolved,
} from './context.ts';
import { latest, meanOver, median as medianOf, type Obs, type Series } from './series.ts';
import type { Conflict, SanctionRegime } from './topics.ts';

export type Fallback =
  | 'median'
  | 'median_per_capita'
  | 'median_per_gdp'
  | 'default'
  | 'zero'
  | 'not_applicable'
  | 'none';

export type Step = (ctx: Ctx, e: EntityInfo) => Resolved | null;

export interface Rule {
  steps: Step[];
  fallback: Fallback;
  /** Paramètre dérivé calculé par le moteur à l'exécution. */
  runtime?: boolean;
  /** Valeur « zéro » (vecteur, liste) pour le repli `zero`. */
  zero?: ParamValue;
  /**
   * Fichier curé qui recense tous les cas (ex. les 15 membres du Conseil de sécurité) : une entité
   * absente vaut alors « zéro » avec certitude, et non par supposition.
   */
  exhaustive?: string;
}

/** Âge au-delà duquel une donnée est signalée comme ancienne (SPEC §5.1). */
export const STALE_YEARS = 3;

function fromObs(
  ctx: Ctx,
  obs: Obs,
  source: string,
  method: Method,
  value: number,
  extra: { note?: string; projection?: boolean } = {},
): Resolved {
  const age = ctx.buildYear - obs.year;
  const stale = age > STALE_YEARS;
  const confidence: Confidence = extra.projection || stale ? 'medium' : 'high';
  const notes = [
    extra.note,
    extra.projection ? 'estimation ou projection du FMI pour l’année en cours' : undefined,
  ]
    .filter((n): n is string => n !== undefined)
    .join(' ; ');
  return {
    value,
    source,
    date: String(obs.year),
    confidence,
    method,
    ...(notes ? { note: notes } : {}),
    ...(stale ? { stale: true } : {}),
  };
}

// ——— Étapes génériques ———

interface NumOpts {
  /** Transformation de la valeur brute (unités, rééchelonnement). */
  map?: (v: number, e: EntityInfo, ctx: Ctx, obs: Obs) => number | null;
  method?: Method;
  note?: string;
}

export function fromSeries(
  series: (ctx: Ctx) => Series | undefined,
  source: string,
  opts: NumOpts = {},
): Step {
  return (ctx, e) => {
    const s = series(ctx);
    if (s === undefined) return null;
    const obs = latest(s, e.id, ctx.buildYear);
    if (obs === null) return null;
    const value = opts.map ? opts.map(obs.value, e, ctx, obs) : obs.value;
    if (value === null || !Number.isFinite(value)) return null;
    return fromObs(
      ctx,
      obs,
      source,
      opts.method ?? 'source',
      value,
      opts.note ? { note: opts.note } : {},
    );
  };
}

export const wb = (code: string, opts: NumOpts = {}): Step =>
  fromSeries((ctx) => ctx.wb.get(code)?.series, `WB:${code}`, opts);

/** Indicateur WGI rééchelonné de [−2,5 ; 2,5] vers [0 ; 100]. */
export const wgi = (code: string): Step =>
  fromSeries((ctx) => ctx.wb.get(code)?.series, `WGI:${code}`, {
    map: (v) => Math.min(100, Math.max(0, ((v + 2.5) / 5) * 100)),
  });

/** FMI : valeur de l'année en cours (ou la plus récente antérieure). */
export function imf(code: string, opts: NumOpts = {}): Step {
  return (ctx, e) => {
    const s = ctx.imf.get(code);
    if (s === undefined) return null;
    const obs = latest(s, e.id, ctx.buildYear);
    if (obs === null) return null;
    const value = opts.map ? opts.map(obs.value, e, ctx, obs) : obs.value;
    if (value === null || !Number.isFinite(value)) return null;
    const edition = ctx.imfEditions.get(code);
    return fromObs(ctx, obs, `IMF:${code}`, opts.method ?? 'source', value, {
      projection: obs.year >= ctx.buildYear - 1,
      ...(edition || opts.note ? { note: [opts.note, edition].filter(Boolean).join(' ; ') } : {}),
    });
  };
}

export const owidEnergy = (column: string, opts: NumOpts = {}): Step =>
  fromSeries((ctx) => ctx.owidEnergy.get(column), `OWID:${column}`, opts);

export const owid = (chart: string, source: string, opts: NumOpts = {}): Step =>
  fromSeries((ctx) => ctx.owid.get(chart), source, opts);

/** Valeur curée du même paramètre (data/curated/country_*.yaml). */
export function cur(param: string): Step {
  return (ctx, e) => {
    const v = ctx.curated.get(param)?.get(e.id);
    if (v === undefined) return null;
    return {
      value: v.value,
      source: `CUR:${v.file} (${v.source})`,
      date: v.date,
      confidence: v.confidence,
      method: 'curated',
      ...(v.note ? { note: v.note } : {}),
    };
  };
}

/** Étape calculée librement (sujets curés, dérivations documentées). */
export function fn(step: Step): Step {
  return step;
}

// ——— Aides pour les sujets curés ———

export function curatedValue(
  value: ParamValue,
  file: string,
  p: { source: string; date: string; confidence: Confidence; note?: string },
  note?: string,
): Resolved {
  const n = [note, p.note].filter(Boolean).join(' ; ');
  return {
    value,
    source: `CUR:${file} (${p.source})`,
    date: p.date,
    confidence: p.confidence,
    method: 'curated',
    ...(n ? { note: n } : {}),
  };
}

/** Valeur calculée depuis d'autres valeurs résolues ; la confiance est la plus faible des entrées. */
export function derivedFrom(
  ctx: Ctx,
  e: EntityInfo,
  inputs: string[],
  value: number | null,
  note: string,
): Resolved | null {
  if (value === null || !Number.isFinite(value)) return null;
  const order: Confidence[] = ['high', 'medium', 'low', 'assumption'];
  let worst = 0;
  let date = '';
  for (const id of inputs) {
    const r = ctx.resolved.get(id)?.get(e.id);
    if (r === undefined) return null;
    worst = Math.max(worst, order.indexOf(r.confidence));
    if (r.date > date) date = r.date;
  }
  return {
    value,
    source: `DER:${inputs.join(', ')}`,
    date,
    confidence: order[worst] as Confidence,
    method: 'derived',
    note,
  };
}

const HIGH_INCOME = 'HIC';

// ——— Table des règles ———

const R = (steps: Step[], fallback: Fallback, extra: Partial<Rule> = {}): Rule => ({
  steps,
  fallback,
  ...extra,
});
const runtime: Rule = { steps: [], fallback: 'none', runtime: true };
const median = (...steps: Step[]): Rule => R(steps, 'median');
const hyp = (id: string): Rule => R([cur(id)], 'default');

/** Population de même année (pour convertir un effectif en taux). */
function populationAt(ctx: Ctx, code: string, year: number): number | null {
  const s = ctx.wb.get('SP.POP.TOTL')?.series;
  const obs = s ? latest(s, code, year) : null;
  return obs?.value ?? null;
}

/** Point idéal AGNU rééchelonné : −100 au minimum, +100 au maximum de la dernière session. */
function ungaScaled(ctx: Ctx): Step {
  return (c, e) => {
    const obs = latest(c.unga, e.id, c.buildYear);
    if (obs === null) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const list of c.unga.values()) {
      const o = list.find((x) => x.year === obs.year);
      if (o) {
        min = Math.min(min, o.value);
        max = Math.max(max, o.value);
      }
    }
    const value = -100 + (200 * (obs.value - min)) / (max - min);
    return fromObs(ctx, obs, 'UNGA:IdealPointFP', 'source', value, {
      note: `point idéal ${obs.value.toFixed(3)} rééchelonné entre le minimum et le maximum de la session ${obs.year}`,
    });
  };
}

/** Type de régime : Regimes of the World de V-Dem (0 autocratie fermée … 3 démocratie libérale). */
const rowRegime: Step = (ctx, e) => {
  const s = ctx.owid.get('political-regime');
  const obs = s ? latest(s, e.id, ctx.buildYear) : null;
  if (obs === null || ctx.buildYear - obs.year > 5) return null;
  const map: Record<number, (typeof REGIME_TYPES)[number]> = {
    0: 'autocracy',
    1: 'hybrid',
    2: 'flawed_democracy',
    3: 'democracy',
  };
  const value = map[obs.value];
  if (value === undefined) return null;
  return {
    ...fromObs(ctx, obs, 'OWID:vdem_row', 'source', 0),
    value,
    note: 'Regimes of the World (V-Dem) : 0 autocratie fermée → autocratie, 1 autocratie électorale → régime hybride, 2 démocratie électorale → démocratie imparfaite, 3 démocratie libérale → démocratie',
  };
};

/** Part des services dans les exportations de biens et services (balance des paiements). */
function servicesShareOf(ctx: Ctx, code: string): { share: number; year: number } | null {
  const services = ctx.wb.get('BX.GSR.NFSV.CD')?.series;
  const all = ctx.wb.get('BX.GSR.GNFS.CD')?.series;
  const sObs = services ? latest(services, code, ctx.buildYear) : null;
  const aObs = all ? latest(all, code, ctx.buildYear) : null;
  if (!sObs || !aObs || !(aObs.value > 0)) return null;
  return { share: Math.min(1, Math.max(0, sObs.value / aObs.value)), year: sObs.year };
}

/** Médiane mondiale de la part des services (repli des pays sans balance des paiements). */
const worldServicesShare = new WeakMap<Ctx, number>();
function servicesShareMedian(ctx: Ctx): number {
  let m = worldServicesShare.get(ctx);
  if (m === undefined) {
    const shares = ctx.entities
      .map((x) => servicesShareOf(ctx, x.id)?.share)
      .filter((v) => v !== undefined);
    m = medianOf(shares);
    worldServicesShare.set(ctx, m);
  }
  return m;
}

/** Structure des exportations : biens (BACI) × part des biens + services (balance des paiements). */
const composition: Step = (ctx, e) => {
  const goods = ctx.baci.exportsBySector.get(e.id);
  if (goods === undefined) return null;
  const totalGoods = Object.values(goods).reduce((s, v) => s + v, 0);
  if (!(totalGoods > 0)) return null;
  const own = servicesShareOf(ctx, e.id);
  const servicesShare = own?.share ?? null;
  const share = servicesShare ?? servicesShareMedian(ctx);
  const note =
    servicesShare === null
      ? `part des services estimée par la médiane mondiale (${Math.round(share * 100)} %, balance des paiements absente)`
      : `services : balance des paiements ${own?.year}`;
  const value: Record<string, number> = {};
  for (const sector of TRADE_SECTORS) {
    const v =
      sector === 'services'
        ? share
        : ((goods[sector as keyof typeof goods] ?? 0) / totalGoods) * (1 - share);
    value[sector] = Math.round(v * 1000) / 10;
  }
  return {
    value,
    source: `BACI:${ctx.baci.version} + WB:BX.GSR.NFSV.CD`,
    date: String(ctx.baci.year),
    confidence: servicesShare === null ? 'medium' : 'high',
    method: 'source',
    note: `% des exportations de biens et services ; ${note}`,
  };
};

const grainSelf: Step = (ctx, e) => {
  const rec = ctx.grain.byCountry.get(e.id);
  if (rec === undefined || !(rec.supply > 0)) return null;
  return fromObs(
    ctx,
    { year: ctx.grain.year, value: 0 },
    'FAO:FBS (céréales, code 2905)',
    'source',
    (100 * rec.production) / rec.supply,
    {
      note: 'production / disponibilité intérieure',
    },
  );
};

const grainExportShare: Step = (ctx, e) => {
  const rec = ctx.grain.byCountry.get(e.id);
  if (rec === undefined || !(ctx.grain.worldExports > 0)) return null;
  return fromObs(
    ctx,
    { year: ctx.grain.year, value: 0 },
    'FAO:FBS (céréales, code 2905)',
    'source',
    (100 * rec.exports) / ctx.grain.worldExports,
  );
};

const fertilizerShare: Step = (ctx, e) => {
  const v = ctx.fertilizer.exports.get(e.id);
  if (v === undefined || !(ctx.fertilizer.world > 0)) return null;
  return fromObs(
    ctx,
    { year: ctx.fertilizer.year, value: 0 },
    'FAO:RFN (N + P2O5 + K2O)',
    'source',
    (100 * v) / ctx.fertilizer.world,
  );
};

/** Autonomie d'armement : exportations / (importations + exportations), TIV SIPRI cumulés sur 10 ans. */
const armsSelfSufficiency: Step = (ctx, e) => {
  const imp = ctx.wb.get('MS.MIL.MPRT.KD')?.series;
  const exp = ctx.wb.get('MS.MIL.XPRT.KD')?.series;
  if (!imp || !exp) return null;
  const to = ctx.buildYear;
  const from = to - 10;
  const m = meanOver(imp, e.id, from, to);
  const x = meanOver(exp, e.id, from, to);
  if (m === null && x === null) return null;
  const mi = (m?.value ?? 0) * (m?.count ?? 0);
  const xi = (x?.value ?? 0) * (x?.count ?? 0);
  if (mi + xi <= 0) return null;
  const last = Math.max(m?.last ?? 0, x?.last ?? 0);
  return fromObs(
    ctx,
    { year: last, value: 0 },
    'WB:MS.MIL.XPRT.KD / MS.MIL.MPRT.KD',
    'derived',
    xi / (mi + xi),
    {
      note: `TIV du SIPRI cumulés ${from}–${last} : exportations / (importations + exportations)`,
    },
  );
};

const potentialGrowthImf: Step = (ctx, e) => {
  const s = ctx.imf.get('NGDP_RPCH');
  if (!s) return null;
  const m = meanOver(s, e.id, ctx.buildYear + 1, ctx.buildYear + 5, 3);
  if (m === null) return null;
  return {
    value: m.value,
    source: 'IMF:NGDP_RPCH',
    date: `${m.first}-${m.last}`,
    confidence: 'medium',
    method: 'source',
    note: `moyenne des projections ${m.first}–${m.last} ; ${ctx.imfEditions.get('NGDP_RPCH') ?? 'WEO'}`,
  };
};

const potentialGrowthWb: Step = (ctx, e) => {
  const s = ctx.wb.get('NY.GDP.MKTP.KD.ZG')?.series;
  if (!s) return null;
  const m = meanOver(s, e.id, ctx.buildYear - 11, ctx.buildYear, 6);
  if (m === null) return null;
  return {
    value: m.value,
    source: 'WB:NY.GDP.MKTP.KD.ZG',
    date: `${m.first}-${m.last}`,
    confidence: 'medium',
    method: 'fallback_source',
    note: `moyenne des ${m.count} dernières années observées`,
  };
};

const aidReceivedHighIncome: Step = (ctx, e) =>
  e.income === HIGH_INCOME
    ? {
        value: 0,
        source: 'DER:groupe de revenu',
        date: ctx.buildDate,
        confidence: 'medium',
        method: 'derived',
        note: 'pays à revenu élevé : non éligible à l’aide publique au développement',
      }
    : null;

/** Sujets curés → paramètres pays. */
const nuclearState =
  (pick: (s: NonNullable<Ctx['topics']['nuclear']['states'][string]>) => ParamValue): Step =>
  (ctx, e) => {
    const s = ctx.topics.nuclear.states[e.id];
    return s ? curatedValue(pick(s), 'nuclear.yaml', s) : null;
  };

const capability =
  (pick: (c: NonNullable<Ctx['topics']['capabilities'][string]>) => number): Step =>
  (ctx, e) => {
    const c = ctx.topics.capabilities[e.id];
    return c ? curatedValue(pick(c), 'military_capabilities.yaml', c) : null;
  };

const profile =
  (id: string): Step =>
  (ctx, e) => {
    const p = ctx.topics.profiles[e.id];
    const v = p?.values[id];
    return p && v ? curatedValue(v.value, 'profiles.yaml', p, v.why) : null;
  };

export const RULES: Record<string, Rule> = {
  // 1. Démographie
  'demo.population': R(
    [
      wb('SP.POP.TOTL'),
      imf('LP', { map: (v) => v * 1e6, method: 'fallback_source' }),
      cur('demo.population'),
    ],
    'none',
  ),
  'demo.birth_rate': median(wb('SP.DYN.CBRT.IN'), cur('demo.birth_rate')),
  'demo.death_rate': median(wb('SP.DYN.CDRT.IN'), cur('demo.death_rate')),
  'demo.fertility': median(wb('SP.DYN.TFRT.IN'), cur('demo.fertility')),
  'demo.life_expectancy': median(wb('SP.DYN.LE00.IN'), cur('demo.life_expectancy')),
  'demo.share_0_14': median(wb('SP.POP.0014.TO.ZS'), cur('demo.share_0_14')),
  'demo.share_15_64': median(wb('SP.POP.1564.TO.ZS'), cur('demo.share_15_64')),
  'demo.share_65plus': median(wb('SP.POP.65UP.TO.ZS'), cur('demo.share_65plus')),
  'demo.urbanization': median(wb('SP.URB.TOTL.IN.ZS'), cur('demo.urbanization')),
  'demo.net_migration': median(
    wb('SM.POP.NETM', {
      map: (v, e, ctx, obs) => {
        const pop = populationAt(ctx, e.id, obs.year);
        return pop ? (1000 * v) / pop : null;
      },
      note: 'solde migratoire / population de la même année × 1 000',
    }),
    cur('demo.net_migration'),
  ),
  'demo.migration_openness': hyp('demo.migration_openness'),
  'demo.refugees_hosted': R(
    [
      fromSeries((c) => c.unhcrAsylum, 'UNHCR:refugees+oip (pays d’accueil)'),
      cur('demo.refugees_hosted'),
    ],
    'zero',
  ),
  'demo.refugees_abroad': R(
    [
      fromSeries((c) => c.unhcrOrigin, 'UNHCR:refugees+oip (pays d’origine)'),
      cur('demo.refugees_abroad'),
    ],
    'zero',
  ),
  'demo.labor_force': R([wb('SL.TLF.TOTL.IN'), cur('demo.labor_force')], 'median_per_capita'),
  'demo.manpower': runtime,
  'demo.human_capital': median(wb('HD.HCI.OVRL'), cur('demo.human_capital')),
  'demo.ethnic_fractionalization': median(cur('demo.ethnic_fractionalization')),
  'demo.religious_fractionalization': median(cur('demo.religious_fractionalization')),
  'demo.social_cohesion': runtime,
  'demo.diaspora_weight': hyp('demo.diaspora_weight'),
  'demo.hdi': median(
    fromSeries((c) => c.hdi, 'UNDP:HDI'),
    cur('demo.hdi'),
  ),

  // 2. Économie
  'eco.gdp_nominal': R(
    [
      imf('NGDPD'),
      wb('NY.GDP.MKTP.CD', { map: (v) => v / 1e9, method: 'fallback_source' }),
      cur('eco.gdp_nominal'),
    ],
    'median_per_capita',
  ),
  'eco.gdp_ppp': R(
    [
      wb('NY.GDP.MKTP.PP.CD', { map: (v) => v / 1e9 }),
      imf('PPPGDP', { method: 'fallback_source' }),
      cur('eco.gdp_ppp'),
    ],
    'median_per_gdp',
  ),
  'eco.gdp_per_capita': runtime,
  'eco.potential_growth': median(
    potentialGrowthImf,
    potentialGrowthWb,
    cur('eco.potential_growth'),
  ),
  'eco.growth': runtime,
  'eco.inflation': median(
    imf('PCPIPCH'),
    wb('FP.CPI.TOTL.ZG', { method: 'fallback_source' }),
    cur('eco.inflation'),
  ),
  'eco.inflation_target': hyp('eco.inflation_target'),
  'eco.cb_independence': hyp('eco.cb_independence'),
  'eco.unemployment': median(
    imf('LUR'),
    wb('SL.UEM.TOTL.ZS', { method: 'fallback_source' }),
    cur('eco.unemployment'),
  ),
  'eco.public_debt': median(
    imf('GGXWDG_NGDP'),
    wb('GC.DOD.TOTL.GD.ZS', { method: 'fallback_source' }),
    cur('eco.public_debt'),
  ),
  'eco.debt_maturity': hyp('eco.debt_maturity'),
  'eco.foreign_held_debt': hyp('eco.foreign_held_debt'),
  'eco.sovereign_rate': runtime,
  'eco.credit_rating': hyp('eco.credit_rating'),
  'eco.reserves': R(
    [wb('FI.RES.TOTL.CD', { map: (v) => v / 1e9 }), cur('eco.reserves')],
    'median_per_gdp',
  ),
  'eco.reserves_frozen': R(
    [
      (ctx, e) => {
        const f = ctx.topics.sanctions.frozen_reserves[e.id];
        return f ? curatedValue(f.share, 'sanctions.yaml', f) : null;
      },
    ],
    'zero',
    { exhaustive: 'sanctions.yaml (réserves gelées recensées)' },
  ),
  'eco.current_account': median(
    imf('BCA_NGDPD'),
    wb('BN.CAB.XOKA.GD.ZS', { method: 'fallback_source' }),
    cur('eco.current_account'),
  ),
  'eco.reserve_currency': R([cur('eco.reserve_currency')], 'zero', {
    exhaustive: 'country_economy.yaml (monnaies du COFER)',
  }),
  'eco.exchange_regime': hyp('eco.exchange_regime'),
  'eco.manufacturing_share': median(wb('NV.IND.MANF.ZS'), cur('eco.manufacturing_share')),
  'eco.agriculture_share': median(wb('NV.AGR.TOTL.ZS'), cur('eco.agriculture_share')),
  'eco.resource_rents': median(wb('NY.GDP.TOTL.RT.ZS'), cur('eco.resource_rents')),
  'eco.oil_rents': R([wb('NY.GDP.PETR.RT.ZS'), cur('eco.oil_rents')], 'zero'),
  'eco.gas_rents': R([wb('NY.GDP.NGAS.RT.ZS'), cur('eco.gas_rents')], 'zero'),
  'eco.gini': median(wb('SI.POV.GINI'), cur('eco.gini')),
  'eco.fdi_inflows': median(wb('BX.KLT.DINV.WD.GD.ZS'), cur('eco.fdi_inflows')),
  'eco.remittances': median(wb('BX.TRF.PWKR.DT.GD.ZS'), cur('eco.remittances')),
  'eco.aid_received': median(
    wb('DT.ODA.ODAT.GN.ZS'),
    aidReceivedHighIncome,
    cur('eco.aid_received'),
  ),
  'eco.financial_integration': hyp('eco.financial_integration'),
  'eco.sovereign_fund': R([cur('eco.sovereign_fund')], 'zero'),
  'eco.industrial_capacity': runtime,
  'eco.misery_index': runtime,

  // 3. Budget
  'bud.revenue': median(
    wb('GC.REV.XGRT.GD.ZS'),
    imf('rev', { method: 'fallback_source' }),
    cur('bud.revenue'),
  ),
  'bud.tax_efficiency': runtime,
  'bud.defense': median(wb('MS.MIL.XPND.GD.ZS'), cur('bud.defense')),
  'bud.defense_procurement': hyp('bud.defense_procurement'),
  'bud.defense_domains': hyp('bud.defense_domains'),
  'bud.social': hyp('bud.social'),
  'bud.health': median(wb('SH.XPD.GHED.GD.ZS'), cur('bud.health')),
  'bud.education': median(wb('SE.XPD.TOTL.GD.ZS'), cur('bud.education')),
  'bud.rnd': hyp('bud.rnd'),
  'bud.infrastructure': hyp('bud.infrastructure'),
  'bud.subsidies': hyp('bud.subsidies'),
  'bud.security': hyp('bud.security'),
  'bud.foreign_aid': hyp('bud.foreign_aid'),
  'bud.monetization': hyp('bud.monetization'),
  'bud.balance': median(imf('GGXCNL_NGDP'), cur('bud.balance')),

  // 4. Commerce
  'trade.exports': median(wb('NE.EXP.GNFS.ZS'), cur('trade.exports')),
  'trade.imports': median(wb('NE.IMP.GNFS.ZS'), cur('trade.imports')),
  'trade.composition': median(composition, cur('trade.composition')),
  'trade.hightech_exports': median(wb('TX.VAL.TECH.MF.ZS'), cur('trade.hightech_exports')),
  'trade.tariff_level': median(wb('TM.TAX.MRCH.WM.AR.ZS'), cur('trade.tariff_level')),
  'trade.maritime_share': runtime,
  'trade.sanction_evasion': hyp('trade.sanction_evasion'),
  'trade.oil_stocks': hyp('trade.oil_stocks'),
  'trade.grain_stocks': hyp('trade.grain_stocks'),
  'trade.logistics': median(wb('LP.LPI.OVRL.XQ'), cur('trade.logistics')),

  // 5. Énergie (OWID : Energy Institute, EIA, Ember)
  'energy.primary_consumption': R(
    [owidEnergy('primary_energy_consumption'), cur('energy.primary_consumption')],
    'median_per_capita',
  ),
  'energy.oil_production': R([owidEnergy('oil_production'), cur('energy.oil_production')], 'zero'),
  'energy.oil_consumption': R(
    [owidEnergy('oil_consumption'), cur('energy.oil_consumption')],
    'median_per_capita',
  ),
  'energy.gas_production': R([owidEnergy('gas_production'), cur('energy.gas_production')], 'zero'),
  'energy.gas_consumption': R(
    [owidEnergy('gas_consumption'), cur('energy.gas_consumption')],
    'median_per_capita',
  ),
  'energy.coal_production': R(
    [owidEnergy('coal_production'), cur('energy.coal_production')],
    'zero',
  ),
  'energy.coal_consumption': R(
    [owidEnergy('coal_consumption'), cur('energy.coal_consumption')],
    'median_per_capita',
  ),
  'energy.nuclear_share_elec': R(
    [owidEnergy('nuclear_share_elec'), cur('energy.nuclear_share_elec')],
    'zero',
  ),
  'energy.renewables_share': median(
    owidEnergy('renewables_share_energy'),
    cur('energy.renewables_share'),
  ),
  'energy.oil_reserves': R([cur('energy.oil_reserves')], 'zero'),
  'energy.gas_reserves': R([cur('energy.gas_reserves')], 'zero'),
  'energy.import_dependence': runtime,
  'energy.intensity': runtime,
  'energy.opec_quota': R([cur('energy.opec_quota')], 'not_applicable'),
  'energy.spare_capacity': R([cur('energy.spare_capacity')], 'zero'),
  'energy.lng_capacity': R([cur('energy.lng_capacity')], 'zero', {
    zero: { liquefaction: 0, regasification: 0 },
  }),
  'energy.grid_resilience': hyp('energy.grid_resilience'),
  'energy.electricity_access': median(wb('EG.ELC.ACCS.ZS'), cur('energy.electricity_access')),

  // 6. Ressources
  'res.arable_land': median(wb('AG.LND.ARBL.ZS'), cur('res.arable_land')),
  'res.grain_self_sufficiency': median(grainSelf, cur('res.grain_self_sufficiency')),
  'res.grain_export_share': R([grainExportShare, cur('res.grain_export_share')], 'zero'),
  'res.fertilizer_export_share': R([fertilizerShare, cur('res.fertilizer_export_share')], 'zero'),
  'res.food_spending_share': hyp('res.food_spending_share'),
  'res.water_stress': median(wb('ER.H2O.FWST.ZS'), cur('res.water_stress')),
  'res.upstream_dependence': hyp('res.upstream_dependence'),
  'res.critical_minerals': R(
    [
      (ctx, e) => {
        const value: Record<string, number> = {};
        let any = false;
        let year = 0;
        for (const [m, data] of Object.entries(ctx.topics.minerals.minerals)) {
          const share = data.production[e.id] ?? 0;
          value[m] = share;
          if (share > 0) any = true;
          year = Math.max(year, data.year);
        }
        if (!any) return null;
        const first = Object.values(ctx.topics.minerals.minerals)[0];
        return first
          ? curatedValue(
              value,
              'minerals.yaml',
              first,
              `parts de la production minière mondiale (${year})`,
            )
          : null;
      },
    ],
    'zero',
    {
      zero: {
        rare_earths: 0,
        lithium: 0,
        cobalt: 0,
        nickel: 0,
        copper: 0,
        gallium: 0,
        germanium: 0,
        graphite: 0,
        uranium: 0,
      },
    },
  ),
  'res.chip_fab_share': R(
    [
      (ctx, e) => {
        const f = ctx.topics.semiconductors.advanced_fab_share;
        const v = f.shares[e.id];
        return v === undefined ? null : curatedValue(v, 'semiconductors.yaml', f);
      },
    ],
    'zero',
  ),
  'res.export_restrictions': R(
    [
      (ctx, e) => {
        const items = ctx.topics.sanctions.export_restrictions.filter((r) => r.country === e.id);
        if (items.length === 0) return null;
        const first = items[0] as (typeof items)[number];
        return curatedValue(
          items.map((r) => `${r.product}:${r.intensity}`),
          'sanctions.yaml',
          first,
          'produit:intensité (0–1)',
        );
      },
    ],
    'zero',
    { zero: [] },
  ),

  // 7. Forces armées
  'mil.budget': R(
    [wb('MS.MIL.XPND.CD', { map: (v) => v / 1e9 }), cur('mil.budget')],
    'median_per_gdp',
  ),
  'mil.active': R(
    [
      cur('mil.active'),
      wb('MS.MIL.TOTL.P1', {
        method: 'fallback_source',
        note: 'personnel des forces armées, paramilitaires compris',
      }),
    ],
    'median_per_capita',
  ),
  'mil.reserves': R([cur('mil.reserves')], 'median_per_capita'),
  'mil.paramilitary': R([cur('mil.paramilitary')], 'median_per_capita'),
  'mil.conscription': hyp('mil.conscription'),
  'mil.mobilization': R([cur('mil.mobilization')], 'zero'),
  'mil.capital_land': runtime,
  'mil.capital_air': runtime,
  'mil.capital_naval': runtime,
  'mil.strike_stock': hyp('mil.strike_stock'),
  'mil.air_defense': hyp('mil.air_defense'),
  'mil.drones': hyp('mil.drones'),
  'mil.carriers': R([capability((c) => c.carriers)], 'zero'),
  'mil.attack_submarines': R([capability((c) => c.attack_submarines)], 'zero'),
  'mil.fighters_5gen': R([capability((c) => c.fighters_5gen)], 'zero'),
  'mil.amphibious_lift': R([capability((c) => c.amphibious_brigades)], 'zero'),
  'mil.strategic_lift': hyp('mil.strategic_lift'),
  'mil.munitions_stock': hyp('mil.munitions_stock'),
  'mil.defense_industry': hyp('mil.defense_industry'),
  'mil.ramp_up_time': hyp('mil.ramp_up_time'),
  'mil.arms_self_sufficiency': median(armsSelfSufficiency, cur('mil.arms_self_sufficiency')),
  'mil.quality': hyp('mil.quality'),
  // Expérience de combat : intensité (0–1) du conflit actif ou en cessez-le-feu le plus intense où
  // l'entité est belligérante (conflicts.yaml) ; les conflits gelés n'en donnent pas.
  'mil.combat_experience': R(
    [
      cur('mil.combat_experience'),
      (ctx, e) => {
        let best: Conflict | null = null;
        for (const c of ctx.topics.conflicts) {
          if (c.status === 'frozen' || ![...c.sides.a, ...c.sides.b].includes(e.id)) continue;
          if (best === null || c.intensity > best.intensity) best = c;
        }
        return best === null
          ? null
          : curatedValue(
              best.intensity / 100,
              'conflicts.yaml',
              best,
              `intensité de « ${best.nameFr} » (${best.status})`,
            );
      },
    ],
    'zero',
    { exhaustive: 'conflicts.yaml (aucun conflit actif ou en cessez-le-feu)' },
  ),
  'mil.morale': runtime,
  'mil.logistics': hyp('mil.logistics'),
  'mil.doctrine': hyp('mil.doctrine'),
  'mil.overseas_bases': R(
    [
      (ctx, e) => {
        const hosts = ctx.topics.bases.filter((b) => b.user === e.id);
        if (hosts.length === 0) return null;
        return curatedValue(
          [...new Set(hosts.map((b) => b.host))].sort(),
          'bases.yaml',
          hosts[0] as (typeof hosts)[number],
        );
      },
    ],
    'zero',
    { zero: [] },
  ),
  'mil.allocation': hyp('mil.allocation'),
  'mil.power_index': runtime,

  // 8. Nucléaire, cyber, espace
  'strat.warheads_total': R([nuclearState((s) => s.warheads_total)], 'zero'),
  'strat.warheads_deployed': R([nuclearState((s) => s.warheads_deployed)], 'zero'),
  'strat.delivery': R([nuclearState((s) => s.delivery)], 'zero', {
    zero: { silo: 0, mobile: 0, submarine: 0, bomber: 0 },
  }),
  'strat.second_strike': runtime,
  'strat.doctrine': R([nuclearState((s) => s.doctrine)], 'not_applicable'),
  'strat.alert_level': hyp('strat.alert_level'),
  'strat.umbrella_from': R(
    [
      (ctx, e) => {
        const u = ctx.topics.nuclear.umbrellas.filter((x) => x.covered.includes(e.id));
        if (u.length === 0) return null;
        return curatedValue(
          u.map((x) => x.provider).sort(),
          'nuclear.yaml',
          u[0] as (typeof u)[number],
        );
      },
    ],
    'zero',
    { zero: [] },
  ),
  'strat.program_progress': R(
    [
      (ctx, e) => {
        if (ctx.topics.nuclear.states[e.id])
          return curatedValue(
            100,
            'nuclear.yaml',
            ctx.topics.nuclear.states[e.id] as never,
            'État doté',
          );
        const p = ctx.topics.nuclear.programs[e.id];
        return p ? curatedValue(p.progress, 'nuclear.yaml', p) : null;
      },
    ],
    'zero',
  ),
  'strat.missile_defense': hyp('strat.missile_defense'),
  'strat.hypersonic': R([cur('strat.hypersonic')], 'zero'),
  'strat.cyber_offense': hyp('strat.cyber_offense'),
  'strat.cyber_defense': hyp('strat.cyber_defense'),
  'strat.space': hyp('strat.space'),
  'strat.intelligence': hyp('strat.intelligence'),

  // 9. Politique intérieure
  'pol.electoral_democracy': median(
    owid('electoral-democracy-index', 'OWID:vdem_electdem'),
    cur('pol.electoral_democracy'),
  ),
  'pol.liberal_democracy': median(
    owid('liberal-democracy-index', 'OWID:vdem_libdem'),
    cur('pol.liberal_democracy'),
  ),
  'pol.regime_type': R([cur('pol.regime_type'), rowRegime], 'default'),
  'pol.stability': median(wgi('GOV_WGI_PV.EST'), cur('pol.stability')),
  'pol.gov_effectiveness': median(wgi('GOV_WGI_GE.EST'), cur('pol.gov_effectiveness')),
  'pol.rule_of_law': median(wgi('GOV_WGI_RL.EST'), cur('pol.rule_of_law')),
  'pol.corruption_control': median(wgi('GOV_WGI_CC.EST'), cur('pol.corruption_control')),
  'pol.voice_accountability': median(wgi('GOV_WGI_VA.EST'), cur('pol.voice_accountability')),
  'pol.approval': hyp('pol.approval'),
  'pol.legitimacy': runtime,
  'pol.repression_capacity': hyp('pol.repression_capacity'),
  'pol.information_control': median(cur('pol.information_control')),
  'pol.polarization': median(
    owid('political-polarization-score', 'OWID:vdem_polarization', {
      // v2cacamps : 0 = forte polarisation … 4 = aucune (échelle V-Dem inversée).
      map: (v) => Math.min(100, Math.max(0, ((4 - v) / 4) * 100)),
      note: 'v2cacamps de V-Dem (0 = forte polarisation, 4 = aucune), inversé et rééchelonné vers [0 ; 100]',
    }),
    cur('pol.polarization'),
  ),
  'pol.military_loyalty': hyp('pol.military_loyalty'),
  'pol.nationalism': hyp('pol.nationalism'),
  'pol.casualty_tolerance': hyp('pol.casualty_tolerance'),
  'pol.war_support': runtime,
  'pol.next_election': R(
    [
      (ctx, e) => {
        const el = ctx.topics.elections[e.id];
        return el ? curatedValue(el.date, 'elections.yaml', el, el.type) : null;
      },
    ],
    'not_applicable',
  ),
  'pol.leader_tenure': R([cur('pol.leader_tenure')], 'default'),
  'pol.succession_risk': hyp('pol.succession_risk'),
  'pol.coup_risk': runtime,
  'pol.insurgency': R(
    [
      (ctx, e) => {
        const internal = ctx.topics.conflicts.filter(
          (c) => c.type !== 'interstate' && c.countries.includes(e.id) && c.status === 'active',
        );
        if (internal.length === 0) return null;
        const top = internal.reduce((a, b) => (b.intensity > a.intensity ? b : a));
        return curatedValue(
          top.intensity,
          'conflicts.yaml',
          top,
          `conflit interne le plus intense : ${top.nameFr}`,
        );
      },
    ],
    'zero',
  ),
  'pol.interference_vulnerability': hyp('pol.interference_vulnerability'),

  // 10. Diplomatie
  'dip.alignment': median((ctx, e) => ungaScaled(ctx)(ctx, e), cur('dip.alignment')),
  'dip.memberships': R(
    [
      (ctx, e) => {
        const blocs = ctx.topics.blocs.filter((b) => b.members.includes(e.id));
        if (blocs.length === 0) return null;
        return curatedValue(
          blocs.map((b) => b.id),
          'blocs.yaml',
          blocs[0] as (typeof blocs)[number],
          'membres de plein droit (voir blocs.yaml pour les dates et sources de chaque bloc)',
        );
      },
    ],
    'zero',
    { zero: [] },
  ),
  'dip.unsc_seat': R([cur('dip.unsc_seat')], 'zero', {
    zero: 'none',
    exhaustive: 'country_politics.yaml (15 membres du Conseil en 2026)',
  }),
  'dip.recognition': R(
    [
      (ctx, e) => {
        const extra = ctx.topics.entities.extra.find((x) => x.id === e.id);
        const meta = ctx.topics.entities.meta[e.id];
        const list = extra?.recognizedBy ?? meta?.recognizedBy;
        const p = extra ?? meta;
        return list && p ? curatedValue(list, 'entities.yaml', p) : null;
      },
    ],
    'not_applicable',
  ),
  'dip.neutrality': R([cur('dip.neutrality')], 'zero'),
  'dip.soft_power': hyp('dip.soft_power'),
  'dip.commitment_credibility': hyp('dip.commitment_credibility'),
  'dip.mediation_capacity': hyp('dip.mediation_capacity'),
  'dip.aid_given': runtime,
  'dip.debt_leverage': R([cur('dip.debt_leverage')], 'zero', { zero: {} }),

  // 11. Technologie
  'tech.level': runtime,
  'tech.ai_compute': hyp('tech.ai_compute'),
  'tech.semiconductors': R(
    [
      (ctx, e) => {
        const a = ctx.topics.semiconductors.autonomy;
        const v = a.values[e.id];
        return v === undefined ? null : curatedValue(v, 'semiconductors.yaml', a);
      },
    ],
    'default',
  ),
  'tech.rnd_total': median(wb('GB.XPD.RSDV.GD.ZS'), cur('tech.rnd_total')),
  'tech.internet_users': median(wb('IT.NET.USER.ZS'), cur('tech.internet_users')),
  // Exposition aux contrôles à l'export : volet technologique le plus fort des régimes de sanctions
  // qui visent l'entité (sanctions.yaml).
  'tech.export_control_exposure': R(
    [
      cur('tech.export_control_exposure'),
      (ctx, e) => {
        let best: SanctionRegime | null = null;
        for (const r of ctx.topics.sanctions.regimes) {
          if (r.target !== e.id || !((r.tracks.technology ?? 0) > 0)) continue;
          if (best === null || (r.tracks.technology ?? 0) > (best.tracks.technology ?? 0)) best = r;
        }
        return best === null
          ? null
          : curatedValue(
              best.tracks.technology ?? 0,
              'sanctions.yaml',
              best,
              `volet technologique de « ${best.name} »`,
            );
      },
    ],
    'zero',
    { exhaustive: 'sanctions.yaml (aucun régime à volet technologique)' },
  ),
  'tech.info_warfare': hyp('tech.info_warfare'),

  // 12. Géographie : calculée depuis la carte (voir build.ts), sauf les dérivés d'exécution.
  'geo.strategic_depth': runtime,
  'geo.infrastructure': runtime,

  // 13. Risques
  'risk.health_spending': median(wb('SH.XPD.CHEX.GD.ZS'), cur('risk.health_spending')),
  'risk.hospital_beds': median(wb('SH.MED.BEDS.ZS'), cur('risk.hospital_beds')),
  'risk.pandemic_preparedness': hyp('risk.pandemic_preparedness'),
  'risk.seismic_exposure': hyp('risk.seismic_exposure'),
  'risk.climate_vulnerability': hyp('risk.climate_vulnerability'),
  'risk.low_coast_population': median(wb('EN.POP.EL5M.ZS'), cur('risk.low_coast_population')),
  'risk.disaster_resilience': hyp('risk.disaster_resilience'),

  // 14. Profil décisionnel : profiles.yaml (hypothèses à valider), sinon profil par défaut.
  'ai.strategic_goals': R(
    [
      (ctx, e) => {
        const p = ctx.topics.profiles[e.id];
        return p ? curatedValue(p.strategic_goals, 'profiles.yaml', p) : null;
      },
    ],
    'zero',
    { zero: [] },
  ),
  'ai.opposition_profile': R(
    [
      (ctx, e) => {
        const p = ctx.topics.profiles[e.id];
        return p?.opposition
          ? curatedValue(p.opposition.values, 'profiles.yaml', p, p.opposition.why)
          : null;
      },
    ],
    'not_applicable',
  ),
  'ai.controller': hyp('ai.controller'),
};

for (const id of [
  'ai.aggressiveness',
  'ai.risk_aversion',
  'ai.time_horizon',
  'ai.revisionism',
  'ai.expansionism',
  'ai.ideology_weight',
  'ai.regime_survival_weight',
  'ai.economy_weight',
  'ai.prestige_weight',
  'ai.alliance_loyalty',
  'ai.sanction_tolerance',
  'ai.nuclear_threshold',
  'ai.misperception',
  'ai.unpredictability',
]) {
  RULES[id] = R([profile(id)], 'default');
}

/** Paramètres calculés depuis la carte (build.ts). */
export const MAP_PARAMS = [
  'geo.area_controlled',
  'geo.area_sovereign',
  'geo.coastline',
  'geo.landlocked',
  'geo.terrain_mix',
  'geo.capital',
  'geo.chokepoints',
] as const;

/** Ordre de résolution : certains paramètres en utilisent d'autres (population, PIB, régime). */
export const FIRST = [
  'demo.population',
  'eco.gdp_nominal',
  'demo.urbanization',
  'pol.regime_type',
] as const;

export { numberOf, valueOf };
