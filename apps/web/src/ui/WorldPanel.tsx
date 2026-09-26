/**
 * Panneau « Monde » (SPEC §9.5), en lecture seule : paramètres mondiaux avec leur source,
 * conflits en cours et statut des détroits.
 */
import { CATALOG, CONFIDENCE_LABELS, enumLabel } from '@geosim/shared';
import { useMemo } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { formatDataDate } from '../format.ts';
import { toCss } from '../map/colors.ts';
import { CHOKEPOINT_COLORS } from '../map/style.ts';
import { useApp } from '../store.ts';
import { namesFor } from './names.ts';
import { ParamRow } from './ParamRow.tsx';

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

export function WorldPanel({ data }: { data: Dataset }) {
  const names = useMemo(() => namesFor(data), [data]);
  const close = useApp((s) => s.setWorldOpen);
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
    <aside className="panel world" aria-label="Monde">
      <header className="inspector-head">
        <div className="title">
          <h2>Monde</h2>
          <p className="muted small">Données du {formatDataDate(data.raw.countries.buildDate)}</p>
        </div>
        <button type="button" className="icon" title="Fermer" onClick={() => close(false)}>
          ×
        </button>
      </header>
      <div className="params">
        <h3>Paramètres mondiaux</h3>
        {WORLD_PARAMS.map((def) => {
          const v = data.worldParam(def.id);
          const runtime = v?.method === 'not_applicable' && v.value === null;
          return (
            <ParamRow
              key={def.id}
              def={def}
              lookup={
                runtime || v === undefined ? { state: 'runtime' } : { state: 'value', value: v }
              }
              names={names}
            />
          );
        })}
        <h3>Détroits et passages</h3>
        <ul className="conflicts">
          {data.raw.world.chokepoints.map((c) => (
            <li
              key={c.id}
              title={`${c.status.source} (${formatDataDate(c.status.date)}, confiance ${CONFIDENCE_LABELS[c.status.confidence]})`}
            >
              <span
                className="swatch"
                style={{ background: toCss(CHOKEPOINT_COLORS[c.status.value]) }}
              />
              <strong>{c.nameFr}</strong> —{' '}
              {enumLabel('zone.chokepoint_status', c.status.value).toLowerCase()}, trafic{' '}
              {c.status.traffic_pct} % de la normale
            </li>
          ))}
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
    </aside>
  );
}
