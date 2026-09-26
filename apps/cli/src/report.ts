/** Sorties des simulations sans interface : tableaux CSV et résumé d'un run. */
import type { Engine, JournalEntry } from '@geosim/engine';

/** Séries par pays écrites dans countries.csv. */
export const CSV_PARAMS = [
  'demo.population',
  'eco.gdp_nominal',
  'eco.growth',
  'eco.potential_growth',
  'eco.output_gap',
  'eco.inflation',
  'eco.unemployment',
  'eco.public_debt',
  'bud.balance',
  'eco.sovereign_rate',
  'eco.credit_rating',
  'eco.current_account',
  'eco.reserves_months',
] as const;

/** Pays commentés dans le résumé affiché. */
const KEY_COUNTRIES = [
  'USA',
  'CHN',
  'IND',
  'DEU',
  'JPN',
  'FRA',
  'GBR',
  'BRA',
  'RUS',
  'NGA',
  'TUR',
  'EGY',
  'ARG',
  'SAU',
];

export interface RunSummary {
  seed: number;
  hash: string;
  finalDate: string;
  months: number;
  seconds: number;
  violations: string[];
  /** Croissance mondiale moyenne de chaque année simulée (%). */
  worldGrowth: number[];
  events: Record<string, number>;
  keyCountries: string[];
  final: Record<string, Record<string, number>>;
}

function fmt(x: number, digits = 1): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '—';
}

export function csvTable(engine: Engine): { countries: string; world: string } {
  const { history, state } = engine;
  const dates = history.ticks.map((t) => engine.calendar.isoAt(t));
  const series = CSV_PARAMS.map((p) => state.entities.map((e) => history.series(p, e.index)));
  const lines = [`date,entity,${CSV_PARAMS.join(',')}`];
  dates.forEach((date, t) => {
    for (const e of state.entities) {
      const row = series.map((byEntity) => {
        const v = byEntity[e.index]?.[t];
        return v === undefined || Number.isNaN(v) ? '' : String(Math.round(v * 1e4) / 1e4);
      });
      lines.push(`${date},${e.id},${row.join(',')}`);
    }
  });
  const keys = history.worldKeys();
  const world = [`date,${keys.join(',')}`];
  const worldSeries = keys.map((k) => history.worldSeries(k) ?? []);
  dates.forEach((date, t) => {
    world.push(
      `${date},${worldSeries.map((s) => (Number.isFinite(s[t] ?? Number.NaN) ? String(s[t]) : '')).join(',')}`,
    );
  });
  return { countries: `${lines.join('\n')}\n`, world: `${world.join('\n')}\n` };
}

export function summarizeRun(
  engine: Engine,
  seed: number,
  elapsedMs: number,
  violations: string[],
  events: JournalEntry[],
): RunSummary {
  const growth = engine.history.worldSeries('world.growth') ?? [];
  const worldGrowth: number[] = [];
  for (let y = 0; 12 * y + 12 < growth.length; y++) {
    const slice = growth.slice(12 * y + 1, 12 * y + 13);
    worldGrowth.push(slice.reduce((s, x) => s + x, 0) / slice.length);
  }
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  const keyCountries: string[] = [];
  const final: Record<string, Record<string, number>> = {};
  for (const id of KEY_COUNTRIES) {
    const i = engine.state.byId.get(id);
    if (i === undefined) continue;
    const value = (p: string): number => engine.countryValue(p, id);
    const first = (p: string): number => engine.history.series(p, i)?.[0] ?? Number.NaN;
    final[id] = Object.fromEntries(
      [
        'eco.gdp_nominal',
        'eco.growth',
        'eco.inflation',
        'eco.unemployment',
        'eco.public_debt',
        'eco.sovereign_rate',
        'demo.population',
      ].map((p) => [p, value(p)]),
    );
    keyCountries.push(
      `${id} : PIB ${fmt(first('eco.gdp_nominal'), 0)} → ${fmt(value('eco.gdp_nominal'), 0)} Md$, ` +
        `croissance ${fmt(value('eco.growth'))} % (potentielle ${fmt(value('eco.potential_growth'))}), ` +
        `inflation ${fmt(first('eco.inflation'))} → ${fmt(value('eco.inflation'))} %, ` +
        `chômage ${fmt(value('eco.unemployment'))} %, dette ${fmt(first('eco.public_debt'), 0)} → ${fmt(value('eco.public_debt'), 0)} %, ` +
        `taux ${fmt(value('eco.sovereign_rate'))} %, population ${fmt(first('demo.population') / 1e6)} → ${fmt(value('demo.population') / 1e6)} M`,
    );
  }
  return {
    seed,
    hash: engine.hash(),
    finalDate: engine.date(),
    months: engine.months,
    seconds: Math.round(elapsedMs) / 1000,
    violations,
    worldGrowth,
    events: counts,
    keyCountries,
    final,
  };
}
