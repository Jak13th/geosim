/**
 * Graphique de séries temporelles (uPlot) aux couleurs de l'interface : dates en français,
 * nombres à la française, légende au survol, zoom par glisser (double-clic pour revenir).
 */
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatNumber, formatShort } from '../format.ts';

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  color: string;
}

/** Noms français pour les étiquettes de l'axe du temps (gabarits d'uPlot). */
const FR_NAMES: uPlot.DateNames = {
  MMMM: [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
  MMM: [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ],
  WWWW: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  WWW: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
};
const FULL_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Date ISO (AAAA-MM-JJ) → secondes Unix (UTC), l'unité de l'axe temporel d'uPlot. */
export function isoToSeconds(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 1000;
}

export function LineChart({
  xs,
  series,
  unit,
  height = 220,
  title,
}: {
  /** Abscisses : secondes Unix (UTC). */
  xs: number[];
  series: ChartSeries[];
  unit: string;
  height?: number;
  title?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const shape = `${series.map((s) => `${s.label}:${s.color}`).join('|')}|${unit}|${height}|${title ?? ''}`;

  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    const opts: uPlot.Options = {
      width: Math.max(200, el.clientWidth),
      height,
      ...(title ? { title } : {}),
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
      fmtDate: (tpl) => uPlot.fmtDate(tpl, FR_NAMES),
      scales: { x: { time: true } },
      series: [
        {
          label: 'Date',
          value: (_u, v) => (v === null ? '—' : FULL_DATE.format(new Date(v * 1000))),
        },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 1.6,
          spanGaps: true,
          value: (_u: uPlot, v: number | null) => (v === null ? '—' : `${formatNumber(v)} ${unit}`),
        })),
      ],
      axes: [
        {
          stroke: '#8593a1',
          grid: { stroke: '#1a2530', width: 1 },
          ticks: { stroke: '#223040', width: 1 },
          space: 70,
        },
        {
          stroke: '#8593a1',
          grid: { stroke: '#1a2530', width: 1 },
          ticks: { stroke: '#223040', width: 1 },
          size: 60,
          values: (_u, splits) => splits.map((v) => formatShort(v)),
        },
      ],
      legend: { show: true, live: true },
      cursor: { drag: { x: true, y: false } },
    };
    const empty: uPlot.AlignedData = [[], ...series.map(() => [])];
    const chart = new uPlot(opts, empty, el);
    plot.current = chart;
    const observer = new ResizeObserver(() => {
      chart.setSize({ width: Math.max(200, el.clientWidth), height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.destroy();
      plot.current = null;
    };
    // La forme du graphique (séries, unité) le reconstruit ; les données le mettent à jour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  useEffect(() => {
    plot.current?.setData([xs, ...series.map((s) => s.values)]);
  }, [xs, series, shape]);

  return <div className="chart" ref={host} />;
}
