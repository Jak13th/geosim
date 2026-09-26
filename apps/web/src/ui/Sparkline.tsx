/**
 * Mini-graphe d'historique (SPEC §9.3) : série mensuelle d'un paramètre pour une entité, suivie
 * de la valeur courante si elle a bougé depuis le dernier pas mensuel.
 */
import { useEffect, useState } from 'react';
import { formatShort } from '../format.ts';
import { run } from '../sim/client.ts';
import type { SeriesResult } from '../sim/protocol.ts';
import { useSim } from '../sim/store.ts';

/** Séries d'une entité, relues à chaque nouveau mois simulé (et après une remise à zéro). */
export function useSeries(entity: string | null, params: readonly string[]): SeriesResult | null {
  const months = useSim((s) => s.clock?.months ?? 0);
  const reset = useSim((s) => s.resetVersion);
  const ready = useSim((s) => s.status.state === 'ready');
  const key = params.join(',');
  const [result, setResult] = useState<SeriesResult | null>(null);
  useEffect(() => {
    if (!ready || entity === null || key === '') return;
    let cancelled = false;
    void run((api) => api.series(entity, key.split(','))).then((r) => {
      if (!cancelled && r !== null) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, entity, key, months, reset]);
  return result;
}

export function Sparkline({
  values,
  current,
  width = 160,
  height = 32,
  label,
}: {
  values: ArrayLike<number>;
  /** Valeur courante ajoutée en fin de série (null : aucune). */
  current: number | null;
  width?: number;
  height?: number;
  label: string;
}) {
  const points: number[] = [];
  for (let k = 0; k < values.length; k++) {
    const x = values[k] as number;
    if (Number.isFinite(x)) points.push(x);
  }
  // L'historique est en simple précision : la valeur courante n'est ajoutée que si elle a bougé.
  const last0 = points[points.length - 1];
  if (
    current !== null &&
    Number.isFinite(current) &&
    (last0 === undefined || Math.abs(current - last0) > 1e-5 * Math.max(1, Math.abs(current)))
  ) {
    points.push(current);
  }
  if (points.length < 2) {
    return <span className="muted small">Historique : un point par mois simulé.</span>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  let lo = min;
  let hi = max;
  if (hi - lo < 1e-5 * Math.max(1, Math.abs(hi))) {
    lo -= 1;
    hi += 1;
  }
  const pad = 2;
  const xs = (k: number): number => pad + ((width - 2 * pad) * k) / (points.length - 1);
  const ys = (v: number): number => pad + (height - 2 * pad) * (1 - (v - lo) / (hi - lo));
  const d = points.map((v, k) => `${k === 0 ? 'M' : 'L'}${xs(k).toFixed(1)},${ys(v).toFixed(1)}`);
  const last = points[points.length - 1] as number;
  return (
    <span
      className="sparkline"
      title={`${label} : de ${formatShort(points[0] as number)} à ${formatShort(last)}`}
    >
      <svg width={width} height={height} role="img" aria-label={label}>
        <path d={d.join('')} fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx={xs(points.length - 1)} cy={ys(last)} r="2.2" fill="currentColor" />
      </svg>
      <span className="muted small">
        {formatShort(min)} – {formatShort(max)}
      </span>
    </span>
  );
}
