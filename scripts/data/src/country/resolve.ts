/**
 * Résolution des paramètres pays en trois passes :
 * 1. paramètres de base (population, PIB, type de régime), dont dépendent les replis ;
 * 2. chaînes de sources de tous les paramètres ;
 * 3. replis (médianes régionales, hypothèses, zéros documentés, lacunes).
 */
import { CATALOG, paramById, type ParamDef } from '@geosim/shared';
import type { ParamValue } from './curated.ts';
import type { Ctx, EntityInfo, Resolved } from './context.ts';
import { FIRST, MAP_PARAMS, RULES, type Rule } from './rules.ts';
import { median } from './series.ts';

/** Paramètres pays résolus par le pipeline (les dérivés d'exécution et ceux de la carte à part). */
export function countryParams(): ParamDef[] {
  return CATALOG.filter((d) => d.scope === 'country');
}

export function checkRules(): string[] {
  const errors: string[] = [];
  for (const def of countryParams()) {
    if (!(def.id in RULES) && !(MAP_PARAMS as readonly string[]).includes(def.id)) {
      errors.push(`Aucune règle de résolution pour ${def.id}`);
    }
  }
  for (const id of Object.keys(RULES)) {
    if (!countryParams().some((d) => d.id === id))
      errors.push(`Règle pour un paramètre inconnu : ${id}`);
  }
  return errors;
}

const REAL = new Set(['source', 'fallback_source', 'curated', 'derived', 'map']);

function store(ctx: Ctx, id: string, code: string, r: Resolved): void {
  let m = ctx.resolved.get(id);
  if (m === undefined) ctx.resolved.set(id, (m = new Map()));
  m.set(code, clampToCatalog(id, r));
}

/**
 * Écrête une valeur numérique à la plage du catalogue (plages indicatives de PARAMETRES.md,
 * élargies quand les données réelles l'exigent) ; la valeur d'origine est conservée et signalée.
 */
export function clampToCatalog(id: string, r: Resolved): Resolved {
  const def = paramById(id);
  if (
    def === undefined ||
    typeof r.value !== 'number' ||
    def.min === undefined ||
    def.max === undefined
  )
    return r;
  if (r.value >= def.min && r.value <= def.max) return r;
  const value = Math.min(def.max, Math.max(def.min, r.value));
  const note = `valeur source ${Number(r.value.toPrecision(4))} écrêtée à la plage du catalogue [${def.min} ; ${def.max}]`;
  return { ...r, value, clampedFrom: r.value, note: r.note ? `${r.note} ; ${note}` : note };
}

function runSteps(ctx: Ctx, rule: Rule, e: EntityInfo): Resolved | null {
  for (const step of rule.steps) {
    const r = step(ctx, e);
    if (r !== null && r.value !== undefined) return r;
  }
  return null;
}

/** Valeur numérique ou vecteur d'une entrée, pour les médianes. */
function numeric(v: ParamValue): number | Record<string, number> | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v;
  return null;
}

export interface Pool {
  entity: EntityInfo;
  value: number | Record<string, number>;
}

export function groupMedian(
  pool: Pool[],
  e: EntityInfo,
): { value: number | Record<string, number>; label: string; n: number } | null {
  const tiers: [string, (p: Pool) => boolean][] = [
    [
      `région ${e.region}, revenu ${e.income}`,
      (p) => p.entity.region === e.region && p.entity.income === e.income,
    ],
    [`revenu ${e.income}`, (p) => p.entity.income === e.income],
    [`région ${e.region}`, (p) => p.entity.region === e.region],
    ['monde', () => true],
  ];
  for (const [label, keep] of tiers) {
    const group = pool.filter((p) => keep(p) && p.entity.id !== e.id);
    if (group.length < 3 && label !== 'monde') continue;
    if (group.length === 0) return null;
    const first = group[0]?.value;
    if (typeof first === 'number') {
      return { value: median(group.map((p) => p.value as number)), label, n: group.length };
    }
    // Vecteur : médiane par composante, renormalisée à la somme médiane des totaux.
    const keys = Object.keys(first as Record<string, number>);
    const out: Record<string, number> = {};
    for (const k of keys)
      out[k] = median(group.map((p) => (p.value as Record<string, number>)[k] ?? 0));
    const sum = Object.values(out).reduce((s, v) => s + v, 0);
    const target = median(
      group.map((p) => Object.values(p.value as Record<string, number>).reduce((s, v) => s + v, 0)),
    );
    if (sum > 0)
      for (const k of keys) out[k] = Math.round(((out[k] as number) * target * 10) / sum) / 10;
    return { value: out, label, n: group.length };
  }
  return null;
}

function applyFallback(ctx: Ctx, def: ParamDef, rule: Rule, e: EntityInfo): Resolved {
  const date = ctx.buildDate;
  switch (rule.fallback) {
    case 'median':
    case 'median_per_capita':
    case 'median_per_gdp': {
      const scaleBy =
        rule.fallback === 'median_per_capita'
          ? 'demo.population'
          : rule.fallback === 'median_per_gdp'
            ? 'eco.gdp_nominal'
            : null;
      const own = scaleBy ? ctx.resolved.get(scaleBy)?.get(e.id)?.value : 1;
      if (scaleBy && !(typeof own === 'number' && own > 0)) break;
      const pool: Pool[] = [];
      for (const other of ctx.entities) {
        if (other.kind === 'faction') continue;
        const r = ctx.resolved.get(def.id)?.get(other.id);
        if (r === undefined || !REAL.has(r.method)) continue;
        const v = numeric(r.value);
        if (v === null) continue;
        if (scaleBy) {
          const s = ctx.resolved.get(scaleBy)?.get(other.id)?.value;
          if (typeof s !== 'number' || !(s > 0) || typeof v !== 'number') continue;
          pool.push({ entity: other, value: v / s });
        } else pool.push({ entity: other, value: v });
      }
      const m = groupMedian(pool, e);
      if (m === null) break;
      const value = scaleBy && typeof m.value === 'number' ? m.value * (own as number) : m.value;
      return {
        value,
        source: `MED:${def.id}`,
        date,
        confidence: 'low',
        method: 'regional_median',
        note: `médiane de ${m.n} pays comparables (${m.label})${scaleBy ? `, rapportée à ${scaleBy === 'demo.population' ? 'la population' : 'au PIB'}` : ''}`,
      };
    }
    case 'default': {
      const rule2 = ctx.defaults.rules.get(def.id);
      if (rule2 === undefined) break;
      const regime = ctx.resolved.get('pol.regime_type')?.get(e.id)?.value;
      let value = rule2.value;
      let basis = '';
      if (rule2.byKind && e.kind in rule2.byKind) {
        value = rule2.byKind[e.kind] as ParamValue;
        basis = ` (entité ${e.kind})`;
      } else if (rule2.byRegime && typeof regime === 'string' && regime in rule2.byRegime) {
        value = rule2.byRegime[regime] as ParamValue;
        basis = ` (régime ${regime})`;
      } else if (rule2.byIncome && e.income in rule2.byIncome) {
        value = rule2.byIncome[e.income] as ParamValue;
        basis = ` (revenu ${e.income})`;
      }
      return {
        value,
        source: `HYP:defaults.yaml`,
        date: ctx.defaults.date,
        confidence: 'assumption',
        method: 'default',
        note: `${rule2.note}${basis}`,
      };
    }
    case 'zero':
      return {
        value: rule.zero ?? 0,
        source: `ZERO:${def.id}`,
        date,
        confidence: rule.exhaustive ? 'high' : 'medium',
        method: 'zero',
        note: rule.exhaustive
          ? `absent de ${rule.exhaustive}, liste exhaustive : aucun`
          : 'absent des sources et des fichiers curés : supposé nul',
      };
    case 'not_applicable':
      return {
        value: null,
        source: 'NA',
        date,
        confidence: 'high',
        method: 'not_applicable',
        note: 'sans objet',
      };
    case 'none':
      break;
  }
  return {
    value: null,
    source: 'NONE',
    date,
    confidence: 'low',
    method: 'missing',
    note: 'lacune : aucune source, aucun repli',
  };
}

function resolveParam(ctx: Ctx, def: ParamDef, pass: 'steps' | 'fallback'): void {
  const rule = RULES[def.id];
  if (rule === undefined || rule.runtime) return;
  for (const e of ctx.entities) {
    if (pass === 'steps') {
      const r = runSteps(ctx, rule, e);
      if (r !== null) store(ctx, def.id, e.id, r);
    } else if (!ctx.resolved.get(def.id)?.has(e.id)) {
      store(ctx, def.id, e.id, applyFallback(ctx, def, rule, e));
    }
  }
}

/** Passe 1 : population, PIB et régime (utiles aux replis et à la carte). */
export function resolveBase(ctx: Ctx): void {
  for (const id of FIRST) {
    const def = CATALOG.find((d) => d.id === id) as ParamDef;
    // Factions : population et PIB viennent de la carte (pixels contrôlés).
    for (const e of ctx.entities) {
      const t = ctx.mapTotals.get(e.id);
      if (e.kind === 'faction' && t && (id === 'demo.population' || id === 'eco.gdp_nominal')) {
        store(ctx, id, e.id, {
          value: id === 'demo.population' ? t.population : t.gdp,
          source: 'MAP:pixels contrôlés',
          date: ctx.buildDate,
          confidence: 'low',
          method: 'map',
          note: 'somme des pixels contrôlés par la faction (répartition de la population et du PIB du pays)',
        });
      }
    }
    resolveParam(ctx, def, 'steps');
    resolveParam(ctx, def, 'fallback');
  }
}

/** Passes 2 et 3 : tous les autres paramètres. */
export function resolveAll(ctx: Ctx): void {
  const rest = countryParams().filter((d) => !(FIRST as readonly string[]).includes(d.id));
  for (const def of rest) resolveParam(ctx, def, 'steps');
  for (const def of rest) resolveParam(ctx, def, 'fallback');
}
