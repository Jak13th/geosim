/**
 * Séries annuelles par pays : code ISO 3166-1 alpha-3 (ou code GeoSim) → observations.
 * SPEC §5.1 : pour chaque indicateur, on prend la valeur la plus récente non vide et on
 * enregistre son année.
 */

export interface Obs {
  year: number;
  value: number;
}

/** Observations triées par année croissante. */
export type Series = Map<string, Obs[]>;

export function addObs(series: Series, code: string, year: number, value: number): void {
  if (!Number.isFinite(value) || !Number.isFinite(year)) return;
  let list = series.get(code);
  if (list === undefined) {
    list = [];
    series.set(code, list);
  }
  list.push({ year, value });
}

/** Trie chaque série par année et ne garde qu'une observation par année (la dernière vue). */
export function finalize(series: Series): Series {
  for (const [code, list] of series) {
    const byYear = new Map<number, number>();
    for (const o of list) byYear.set(o.year, o.value);
    series.set(
      code,
      [...byYear].sort((a, b) => a[0] - b[0]).map(([year, value]) => ({ year, value })),
    );
  }
  return series;
}

/** Observation la plus récente d'année ≤ `maxYear`. */
export function latest(series: Series, code: string, maxYear: number): Obs | null {
  const list = series.get(code);
  if (list === undefined) return null;
  for (let k = list.length - 1; k >= 0; k--) {
    const o = list[k] as Obs;
    if (o.year <= maxYear) return o;
  }
  return null;
}

/** Moyenne des observations dans [from, to] ; null s'il y en a moins de `minCount`. */
export function meanOver(
  series: Series,
  code: string,
  from: number,
  to: number,
  minCount = 1,
): { value: number; first: number; last: number; count: number } | null {
  const list = (series.get(code) ?? []).filter((o) => o.year >= from && o.year <= to);
  if (list.length < minCount) return null;
  const value = list.reduce((s, o) => s + o.value, 0) / list.length;
  return {
    value,
    first: (list[0] as Obs).year,
    last: (list[list.length - 1] as Obs).year,
    count: list.length,
  };
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const mid = n >> 1;
  return n % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
