/**
 * Panneau gauche (SPEC §9.5) : onglets « Monde » (paramètres mondiaux et détroits, en direct et
 * éditables ; conflits en cours), « Modèle » (coefficients de config/model.yaml) et
 * « Simulation » (paramètres de simulation, captures, relecture).
 */
import type { Slot } from '@geosim/engine';
import { CATALOG, CONFIDENCE_LABELS, enumLabel, paramById } from '@geosim/shared';
import { useMemo } from 'react';
import type { Dataset, ParamLookup } from '../data/dataset.ts';
import { formatDataDate } from '../format.ts';
import { toCss } from '../map/colors.ts';
import { CHOKEPOINT_COLORS } from '../map/style.ts';
import { command } from '../sim/client.ts';
import { useApp, type LeftTab } from '../store.ts';
import { useLive } from './live.ts';
import { LiveRow } from './LiveRow.tsx';
import { ModelTab } from './ModelTab.tsx';
import { namesFor } from './names.ts';
import { SimTab } from './SimTab.tsx';

const WORLD_PARAMS = CATALOG.filter((d) => d.scope === 'world');
const STATUS: Record<string, string> = {
  active: 'actif',
  ceasefire: 'cessez-le-feu',
  frozen: 'gelé',
};
const TYPES: Record<string, string> = {
  interstate: 'interétatique',
  civil_war: 'guerre civile',
  insurgency: 'insurrection',
  frozen: 'conflit gelé',
};
const TABS: [LeftTab, string][] = [
  ['world', 'Monde'],
  ['model', 'Modèle'],
  ['sim', 'Simulation'],
];

const CHOKEPOINT_STATUS = paramById('zone.chokepoint_status');

function WorldTab({ data }: { data: Dataset }) {
  const names = useMemo(() => namesFor(data), [data]);
  const live = useLive();
  const select = useApp((s) => s.select);
  const focusOn = useApp((s) => s.focusOn);
  const conflicts = [...data.raw.world.conflicts].sort((x, y) => y.intensity - x.intensity);
  const goTo = (id: string | undefined): void => {
    const e = id ? data.byId.get(id) : undefined;
    if (e) {
      select(e.index);
      focusOn(e.index);
    }
  };
  return (
    <div className="params">
      <h3>Paramètres mondiaux</h3>
      {WORLD_PARAMS.map((def) => {
        const v = data.worldParam(def.id);
        const runtime = v?.method === 'not_applicable' && v.value === null;
        const lookup: ParamLookup =
          runtime || v === undefined ? { state: 'runtime' } : { state: 'value', value: v };
        const slot: Slot = { scope: 'world', param: def.id };
        return (
          <LiveRow
            key={def.id}
            def={def}
            slot={slot}
            lookup={lookup}
            live={live}
            data={data}
            names={names}
          />
        );
      })}
      <h3>Détroits et passages</h3>
      <ul className="conflicts chokepoints">
        {data.raw.world.chokepoints.map((c) => {
          const status = live?.zone['zone.chokepoint_status']?.[c.id] ?? c.status.value;
          const key = typeof status === 'string' ? status : c.status.value;
          const changed = status !== c.status.value;
          return (
            <li
              key={c.id}
              data-chokepoint={c.id}
              title={`${c.status.source} (${formatDataDate(c.status.date)}, confiance ${CONFIDENCE_LABELS[c.status.confidence]})`}
            >
              <span
                className="swatch"
                style={{
                  background: toCss(
                    CHOKEPOINT_COLORS[key as keyof typeof CHOKEPOINT_COLORS] ??
                      CHOKEPOINT_COLORS.open,
                  ),
                }}
              />
              <strong>{c.nameFr}</strong>{' '}
              {live !== null && CHOKEPOINT_STATUS ? (
                <select
                  value={key}
                  aria-label={`Statut : ${c.nameFr}`}
                  onChange={(e) =>
                    void command({
                      type: 'set',
                      slots: [{ scope: 'zone', param: 'zone.chokepoint_status', target: c.id }],
                      value: e.target.value,
                    })
                  }
                >
                  {(CHOKEPOINT_STATUS.enumValues ?? []).map((v) => (
                    <option key={v} value={v}>
                      {enumLabel('zone.chokepoint_status', v)}
                    </option>
                  ))}
                </select>
              ) : (
                <>— {enumLabel('zone.chokepoint_status', key).toLowerCase()}</>
              )}
              {changed && <span className="src conf-user"> modifié</span>}
              <br />
              <span className="muted small">
                Trafic {c.status.traffic_pct} % de la normale au {formatDataDate(c.status.date)}
                {changed ? ' · effets sur le commerce et l’énergie en phase 4' : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <h3>Conflits ({conflicts.length})</h3>
      <ul className="conflicts">
        {conflicts.map((c) => (
          <li key={c.id} title={`${c.source} (${formatDataDate(c.date)})`}>
            <button type="button" className="link" onClick={() => goTo(c.countries[0])}>
              {c.nameFr}
            </button>{' '}
            — {TYPES[c.type] ?? c.type}, {STATUS[c.status] ?? c.status}, intensité {c.intensity}
            <br />
            <span className="muted small">
              {c.sides.a.map((x) => names.itemName(x) ?? x).join(', ')} contre{' '}
              {c.sides.b.map((x) => names.itemName(x) ?? x).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorldPanel({ data }: { data: Dataset }) {
  const tab = useApp((s) => s.leftTab);
  const toggleLeft = useApp((s) => s.toggleLeft);
  const close = useApp((s) => s.setWorldOpen);
  const title = TABS.find(([t]) => t === tab)?.[1] ?? 'Monde';
  return (
    <aside className="panel world" aria-label={title} data-left-tab={tab}>
      <header className="inspector-head">
        <div className="title">
          <h2>{title}</h2>
          <p className="muted small">Données du {formatDataDate(data.raw.countries.buildDate)}</p>
        </div>
        <button type="button" className="icon" title="Fermer" onClick={() => close(false)}>
          ×
        </button>
      </header>
      <div className="segmented wide" role="tablist">
        {TABS.map(([t, label]) => (
          <button
            type="button"
            role="tab"
            key={t}
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => tab !== t && toggleLeft(t)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'world' && <WorldTab data={data} />}
      {tab === 'model' && <ModelTab />}
      {tab === 'sim' && <SimTab data={data} />}
    </aside>
  );
}
