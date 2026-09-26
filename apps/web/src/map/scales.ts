/**
 * Échelles des choroplèthes : domaine robuste (quantiles 2–98 %, pour qu'un pays extrême
 * n'écrase pas les couleurs des autres), échelle logarithmique quand le catalogue la demande,
 * graduations « rondes ».
 */

export interface NumericScale {
  kind: 'linear' | 'log';
  min: number;
  max: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const x = (sorted.length - 1) * q;
  const i = Math.floor(x);
  const a = sorted[i] as number;
  const b = sorted[Math.min(sorted.length - 1, i + 1)] as number;
  return a + (b - a) * (x - i);
}

/**
 * Échelle d'un ensemble de valeurs. `log` : échelle logarithmique sur les valeurs positives
 * (les valeurs nulles ou négatives prennent la première couleur).
 */
export function makeScale(values: readonly number[], log: boolean): NumericScale {
  const finite = values.filter((v) => Number.isFinite(v));
  const positives = finite.filter((v) => v > 0).sort((a, b) => a - b);
  if (log && positives.length >= 2) {
    const min = quantile(positives, 0.02);
    const max = quantile(positives, 0.98);
    return { kind: 'log', min, max: max > min ? max : min * 10 };
  }
  const sorted = [...finite].sort((a, b) => a - b);
  const min = quantile(sorted, 0.02);
  const max = quantile(sorted, 0.98);
  return { kind: 'linear', min, max: max > min ? max : min + 1 };
}

/** Position 0–1 d'une valeur sur l'échelle (écrêtée aux bornes). */
export function normalize(scale: NumericScale, v: number): number {
  if (!Number.isFinite(v)) return 0;
  let t: number;
  if (scale.kind === 'log') {
    if (v <= 0) return 0;
    t = Math.log(v / scale.min) / Math.log(scale.max / scale.min);
  } else {
    t = (v - scale.min) / (scale.max - scale.min);
  }
  return Math.min(1, Math.max(0, t));
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const r = raw / magnitude;
  const nice = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Graduations rondes comprises dans le domaine de l'échelle. */
export function scaleTicks(scale: NumericScale, count = 4): number[] {
  if (scale.kind === 'log') {
    const out: number[] = [];
    const lo = Math.floor(Math.log10(scale.min));
    const hi = Math.ceil(Math.log10(scale.max));
    for (let e = lo; e <= hi; e++) {
      for (const m of hi - lo <= 2 ? [1, 2, 5] : [1]) {
        const v = m * 10 ** e;
        if (v >= scale.min * 0.999 && v <= scale.max * 1.001) out.push(v);
      }
    }
    return out.length >= 2 ? out : [scale.min, scale.max];
  }
  const step = niceStep(scale.max - scale.min, count);
  const out: number[] = [];
  for (let v = Math.ceil(scale.min / step) * step; v <= scale.max + step * 1e-9; v += step) {
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return out;
}
