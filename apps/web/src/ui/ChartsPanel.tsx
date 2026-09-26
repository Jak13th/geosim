/**
 * Graphiques (SPEC §9.7) : un paramètre pays comparé entre plusieurs pays (le pays sélectionné,
 * le second pays et ceux qu'on ajoute), et les séries mondiales (prix, croissance mondiale) en
 * petits multiples. Séries mensuelles de l'historique du moteur, relues à chaque nouveau mois ;
 * export CSV.
 */
import { CATALOG, CATEGORIES, paramById } from '@geosim/shared';
import { useEffect, useMemo, useState } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { CATEGORICAL, toCss } from '../map/colors.ts';
import { run } from '../sim/client.ts';
import type { SeriesResult } from '../sim/protocol.ts';
import { useSim } from '../sim/store.ts';
import { useApp } from '../store.ts';
import { LineChart, isoToSeconds, type ChartSeries } from './LineChart.tsx';

const NUMERIC = CATALOG.filter((d) => d.scope === 'country' && d.valueType === 'number');

function color(k: number): string {
  return toCss(CATEGORICAL[k % CATEGORICAL.length] ?? CATEGORICAL[0] ?? [200, 200, 200]);
}

/** Libellé d'une série mondiale (`world.gas_price.europe` → « Gaz … — europe »). */
function worldLabel(key: string): string {
  const def = paramById(key);
  if (def) return def.label;
  const dot = key.lastIndexOf('.');
  return `${paramById(key.slice(0, dot))?.label ?? key.slice(0, dot)} — ${key.slice(dot + 1)}`;
}

function worldUnit(key: string): string {
  const def = paramById(key) ?? paramById(key.slice(0, key.lastIndexOf('.')));
  return (def?.unit ?? '').replace(/ par zone$/, '');
}

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]): void {
  const lines = [header, ...rows].map((r) =>
    r
      .map((c) =>
        c === null ? '' : typeof c === 'number' ? String(c) : `"${c.replace(/"/g, '""')}"`,
      )
      .join(','),
  );
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Relit des séries à chaque nouveau mois simulé (et après une remise à zéro). */
function useRefreshed<T>(load: () => Promise<T | null>, key: string): T | null {
  const months = useSim((s) => s.clock?.months ?? 0);
  const reset = useSim((s) => s.resetVersion);
  const ready = useSim((s) => s.status.state === 'ready');
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void load().then((v) => {
      if (!cancelled && v !== null) setValue(v);
    });
    return () => {
      cancelled = true;
    };
    // `key` résume les arguments de `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, months, reset]);
  return value;
}

function CountryCharts({ data }: { data: Dataset }) {
  const param = useApp((s) => s.chartParam);
  const setParam = useApp((s) => s.setChartParam);
  const extra = useApp((s) => s.chartEntities);
  const setExtra = useApp((s) => s.setChartEntities);
  const selected = useApp((s) => s.selected);
  const second = useApp((s) => s.second);
  const startDate = useSim((s) => s.live?.info.startDate ?? null);
  const calendarStart = startDate ?? data.raw.countries.buildDate;
  const ids = useMemo(() => {
    const out: string[] = [];
    for (const index of [selected, second]) {
      const id = index ? data.byIndex[index]?.id : undefined;
      if (id && !out.includes(id)) out.push(id);
    }
    for (const id of extra) if (!out.includes(id)) out.push(id);
    return out;
  }, [data, selected, second, extra]);
  const result = useRefreshed<SeriesResult>(
    () => (ids.length === 0 ? Promise.resolve(null) : run((api) => api.compare(param, ids))),
    `${param}|${ids.join(',')}`,
  );
  const def = paramById(param);
  const chart = useMemo(() => {
    if (result === null) return null;
    const xs = result.ticks.map((t) => isoToSeconds(addDays(calendarStart, t)));
    const series: ChartSeries[] = ids.flatMap((id, k) => {
      const values = result.series[id];
      if (!values) return [];
      return [
        {
          label: data.byId.get(id)?.nameFr ?? id,
          values: Array.from(values, (v) => (Number.isFinite(v) ? v : null)),
          color: color(k),
        },
      ];
    });
    return { xs, series };
  }, [result, ids, data, calendarStart]);
  const untracked = result !== null && ids.some((id) => result.series[id] === null);
  return (
    <div className="charts-body">
      <div className="chart-tools">
        <select value={param} onChange={(e) => setParam(e.target.value)} aria-label="Paramètre">
          {CATEGORIES.filter((c) => c.scope === 'country').map((c) => {
            const defs = NUMERIC.filter((d) => d.category === c.id);
            return defs.length === 0 ? null : (
              <optgroup key={c.id} label={c.label}>
                {defs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <span className="chips">
          {ids.map((id, k) => (
            <span key={id} className="chip" style={{ borderColor: color(k) }}>
              {data.byId.get(id)?.nameFr ?? id}
              {extra.includes(id) && (
                <button
                  type="button"
                  className="link"
                  aria-label={`Retirer ${id}`}
                  onClick={() => setExtra(extra.filter((x) => x !== id))}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </span>
        <select
          value=""
          onChange={(e) => e.target.value && setExtra([...extra, e.target.value])}
          aria-label="Ajouter un pays"
        >
          <option value="">+ pays…</option>
          {data.list
            .filter((e) => !ids.includes(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.nameFr}
              </option>
            ))}
        </select>
        {chart !== null && chart.series.length > 0 && (
          <button
            type="button"
            className="link"
            onClick={() =>
              downloadCsv(
                `${param}.csv`,
                ['date', ...chart.series.map((s) => s.label)],
                chart.xs.map((x, t) => [
                  new Date(x * 1000).toISOString().slice(0, 10),
                  ...chart.series.map((s) => s.values[t] ?? null),
                ]),
              )
            }
          >
            Exporter en CSV
          </button>
        )}
      </div>
      {ids.length === 0 ? (
        <p className="muted small">
          Sélectionne un pays sur la carte ou ajoute-en un pour tracer ses séries.
        </p>
      ) : chart === null ? (
        <p className="muted small">Chargement…</p>
      ) : (
        <>
          <LineChart xs={chart.xs} series={chart.series} unit={def?.unit ?? ''} height={200} />
          {untracked && (
            <p className="muted small">
              Ce paramètre n’a pas encore d’historique : il est suivi dès que la simulation ou une
              modification le fait évoluer.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function WorldCharts({ data }: { data: Dataset }) {
  const keys = useApp((s) => s.chartWorld);
  const setKeys = useApp((s) => s.setChartWorld);
  const available = useSim((s) => s.live?.info.worldSeries ?? []);
  const startDate = useSim((s) => s.live?.info.startDate ?? data.raw.countries.buildDate);
  const result = useRefreshed(() => run((api) => api.worldSeries(keys)), keys.join(','));
  const charts = useMemo(() => {
    if (result === null) return [];
    const xs = result.ticks.map((t) => isoToSeconds(addDays(startDate, t)));
    return keys.map((key, k) => ({
      key,
      xs,
      series: [
        {
          label: worldLabel(key),
          values: (result.series[key] ?? []).map((v) => (Number.isFinite(v) ? v : null)),
          color: color(k),
        },
      ],
    }));
  }, [result, keys, startDate]);
  return (
    <div className="charts-body">
      <div className="chart-tools world-keys">
        {available.map((key) => (
          <label key={key} className="small">
            <input
              type="checkbox"
              checked={keys.includes(key)}
              onChange={(e) =>
                setKeys(e.target.checked ? [...keys, key] : keys.filter((k) => k !== key))
              }
            />{' '}
            {worldLabel(key)}
          </label>
        ))}
      </div>
      <div className="small-multiples">
        {charts.map((c) => (
          <LineChart
            key={c.key}
            xs={c.xs}
            series={c.series}
            unit={worldUnit(c.key)}
            height={160}
            title={worldLabel(c.key)}
          />
        ))}
      </div>
    </div>
  );
}

/** Date ISO décalée de `days` jours (calendrier grégorien, en UTC). */
export function addDays(iso: string, days: number): string {
  return new Date((isoToSeconds(iso) + days * 86400) * 1000).toISOString().slice(0, 10);
}

export function ChartsPanel({ data }: { data: Dataset }) {
  const [mode, setMode] = useState<'countries' | 'world'>('countries');
  return (
    <div className="charts">
      <div className="segmented" role="group" aria-label="Séries">
        <button
          type="button"
          className={mode === 'countries' ? 'active' : ''}
          onClick={() => setMode('countries')}
        >
          Pays
        </button>
        <button
          type="button"
          className={mode === 'world' ? 'active' : ''}
          onClick={() => setMode('world')}
        >
          Monde
        </button>
      </div>
      {mode === 'countries' ? <CountryCharts data={data} /> : <WorldCharts data={data} />}
    </div>
  );
}
