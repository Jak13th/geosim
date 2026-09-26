/**
 * Inspecteur du pays sélectionné (SPEC §9.3), généré depuis le catalogue : un onglet par
 * catégorie de PARAMETRES.md, chaque paramètre avec sa valeur, sa source et son année.
 * Lecture seule en phase 2 (l'édition arrive avec le moteur, phase 3).
 */
import { CATALOG, CATEGORIES, type CategoryId, type ParamDef } from '@geosim/shared';
import { useMemo, useState } from 'react';
import type { Dataset, EntityView } from '../data/dataset.ts';
import { formatNumber } from '../format.ts';
import { toCss } from '../map/colors.ts';
import { useApp, type ParamFilter } from '../store.ts';
import { namesFor } from './names.ts';
import { PairPanel } from './PairPanel.tsx';
import { ParamRow, isEstimate } from './ParamRow.tsx';
import { normalize } from './search.ts';

export const REGION_LABELS: Record<string, string> = {
  EAS: 'Asie de l’Est et Pacifique',
  ECS: 'Europe et Asie centrale',
  LCN: 'Amérique latine et Caraïbes',
  MEA: 'Moyen-Orient et Afrique du Nord',
  NAC: 'Amérique du Nord',
  SAS: 'Asie du Sud',
  SSF: 'Afrique subsaharienne',
};

export const INCOME_LABELS: Record<string, string> = {
  HIC: 'revenu élevé',
  UMC: 'revenu intermédiaire supérieur',
  LMC: 'revenu intermédiaire inférieur',
  LIC: 'faible revenu',
};

export const KIND_LABELS: Record<EntityView['kind'], string> = {
  state: 'État',
  de_facto: 'Entité de facto',
  faction: 'Faction armée',
};

/** Indicateurs clés de l'aperçu. */
const OVERVIEW = [
  'demo.population',
  'eco.gdp_nominal',
  'eco.gdp_per_capita',
  'eco.potential_growth',
  'eco.inflation',
  'eco.unemployment',
  'eco.public_debt',
  'pol.stability',
  'pol.regime_type',
  'mil.budget',
  'bud.defense',
  'demo.hdi',
] as const;

const COUNTRY_CATEGORIES = CATEGORIES.filter((c) => c.scope === 'country');

const FILTERS: [ParamFilter, string][] = [
  ['all', 'Tous'],
  ['estimated', 'Estimés'],
  ['stale', 'Anciens'],
];

function matchesFilter(data: Dataset, e: EntityView, def: ParamDef, filter: ParamFilter): boolean {
  if (filter === 'all') return true;
  const r = data.param(e, def.id);
  if (r.state !== 'value') return false;
  return filter === 'estimated' ? isEstimate(r.value) : r.value.stale === true;
}

function Overview({ data, entity }: { data: Dataset; entity: EntityView }) {
  const names = useMemo(() => namesFor(data), [data]);
  const select = useApp((s) => s.select);
  const focusOn = useApp((s) => s.focusOn);
  const neighbors = data.raw.geo.landBorders
    .filter((b) => b.a === entity.id || b.b === entity.id)
    .map((b) => ({ id: b.a === entity.id ? b.b : b.a, km: b.km }))
    .sort((x, y) => y.km - x.km);
  const conflicts = data.raw.world.conflicts.filter(
    (c) =>
      c.sides.a.includes(entity.id) ||
      c.sides.b.includes(entity.id) ||
      c.countries.includes(entity.id) ||
      c.supporters?.a?.includes(entity.id) ||
      c.supporters?.b?.includes(entity.id),
  );
  const zones = data.raw.meta.controlZones.filter(
    (z) => z.controller === entity.id || z.sovereign === entity.id,
  );
  const goTo = (id: string): void => {
    const e = data.byId.get(id);
    if (e) {
      select(e.index);
      focusOn(e.index);
    }
  };
  const role = (c: (typeof conflicts)[number]): string => {
    if (c.sides.a.includes(entity.id) || c.sides.b.includes(entity.id)) return 'belligérant';
    if (c.countries.includes(entity.id)) return 'sur son territoire';
    return 'soutien extérieur';
  };
  const STATUS: Record<string, string> = {
    active: 'actif',
    ceasefire: 'cessez-le-feu',
    frozen: 'gelé',
  };
  return (
    <div className="overview">
      <section>
        {OVERVIEW.map((id) => {
          const def = CATALOG.find((d) => d.id === id);
          return def ? (
            <ParamRow key={id} def={def} lookup={data.param(entity, id)} names={names} />
          ) : null;
        })}
      </section>
      <section>
        <h3>Géographie</h3>
        <p>
          Capitale : <strong>{entity.map.capital?.nameFr ?? '—'}</strong>
          {entity.map.stats.landlocked ? ' · pays enclavé' : ''}
        </p>
        <p className="muted">
          {formatNumber(entity.map.stats.areaKm2)} km² contrôlés
          {Math.abs(entity.map.stats.sovereignAreaKm2 - entity.map.stats.areaKm2) > 1
            ? ` · ${formatNumber(entity.map.stats.sovereignAreaKm2)} km² de jure`
            : ''}{' '}
          (carte)
        </p>
        {neighbors.length > 0 && (
          <p className="chips">
            {neighbors.map((n) => (
              <button
                type="button"
                key={n.id}
                className="chip"
                onClick={() => goTo(n.id)}
                title={`${formatNumber(n.km)} km de frontière`}
              >
                {data.byId.get(n.id)?.nameFr ?? n.id}
              </button>
            ))}
          </p>
        )}
      </section>
      <section>
        <h3>Appartenances</h3>
        <p>{memberships(entity, data, names)}</p>
      </section>
      {conflicts.length > 0 && (
        <section>
          <h3>Conflits</h3>
          <ul className="conflicts">
            {conflicts.map((c) => (
              <li key={c.id} title={`${c.source} (${c.date})`}>
                <strong>{c.nameFr}</strong> — {role(c)}, {STATUS[c.status] ?? c.status}, intensité{' '}
                {c.intensity}
              </li>
            ))}
          </ul>
        </section>
      )}
      {zones.length > 0 && (
        <section>
          <h3>Zones de contrôle</h3>
          <ul className="conflicts">
            {zones.map((z) => (
              <li key={z.id} title={`${z.provenance.source} (${z.provenance.date})`}>
                <strong>{z.nameFr}</strong> — contrôle{' '}
                {z.controller ? (data.byId.get(z.controller)?.nameFr ?? z.controller) : 'inchangé'},
                souveraineté{' '}
                {z.sovereign ? (data.byId.get(z.sovereign)?.nameFr ?? z.sovereign) : 'inchangée'} (
                {formatNumber(z.pixels)} px)
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function memberships(
  entity: EntityView,
  data: Dataset,
  names: ReturnType<typeof namesFor>,
): string {
  const r = data.param(entity, 'dip.memberships');
  if (r.state !== 'value' || !Array.isArray(r.value.value) || r.value.value.length === 0)
    return 'Aucune';
  return r.value.value.map((b) => names.itemName(b) ?? b).join(', ');
}

function CountryParams({ data, entity }: { data: Dataset; entity: EntityView }) {
  const tab = useApp((s) => s.inspectorTab);
  const setTab = useApp((s) => s.setInspectorTab);
  const query = useApp((s) => s.paramQuery);
  const setQuery = useApp((s) => s.setParamQuery);
  const filter = useApp((s) => s.paramFilter);
  const setFilter = useApp((s) => s.setParamFilter);
  const names = useMemo(() => namesFor(data), [data]);
  const q = normalize(query);
  const searching = q !== '' || filter !== 'all';
  const rows = CATALOG.filter(
    (d) =>
      d.scope === 'country' &&
      (searching || d.category === tab) &&
      (q === '' || normalize(`${d.label} ${d.id} ${d.description}`).includes(q)) &&
      matchesFilter(data, entity, d, filter),
  );
  return (
    <>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={!searching && tab === 'apercu'}
          className={!searching && tab === 'apercu' ? 'active' : ''}
          onClick={() => setTab('apercu')}
        >
          Aperçu
        </button>
        {COUNTRY_CATEGORIES.map((c) => (
          <button
            type="button"
            role="tab"
            key={c.id}
            aria-selected={!searching && tab === c.id}
            className={!searching && tab === c.id ? 'active' : ''}
            onClick={() => {
              setTab(c.id as CategoryId);
              setQuery('');
              setFilter('all');
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="param-tools">
        <input
          type="search"
          placeholder="Chercher un paramètre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Chercher un paramètre"
        />
        <div className="segmented" role="group" aria-label="Filtre">
          {FILTERS.map(([f, label]) => (
            <button
              type="button"
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="params">
        {!searching && tab === 'apercu' ? (
          <Overview data={data} entity={entity} />
        ) : (
          <>
            {searching && (
              <p className="muted small">
                {rows.length} paramètre{rows.length > 1 ? 's' : ''} sur{' '}
                {CATALOG.filter((d) => d.scope === 'country').length}
              </p>
            )}
            {rows.map((def) => (
              <ParamRow key={def.id} def={def} lookup={data.param(entity, def.id)} names={names} />
            ))}
          </>
        )}
      </div>
    </>
  );
}

export function Inspector({ data }: { data: Dataset }) {
  const selected = useApp((s) => s.selected);
  const second = useApp((s) => s.second);
  const clear = useApp((s) => s.clearSelection);
  const focusOn = useApp((s) => s.focusOn);
  const [pane, setPane] = useState<{ key: string; view: 'a' | 'pair' | 'b' }>({
    key: '',
    view: 'a',
  });
  const a = data.byIndex[selected];
  const b = second ? data.byIndex[second] : undefined;
  if (a === undefined) return null;
  // Un nouveau second pays ouvre la vue bilatérale.
  const key = `${selected}:${second}`;
  const view = pane.key === key ? pane.view : b ? 'pair' : 'a';
  const shown = view === 'b' && b ? b : a;
  const r = shown.record;
  return (
    <aside className="panel inspector" aria-label="Inspecteur" data-inspector={shown.id}>
      <header className="inspector-head">
        <span className="swatch big" style={{ background: toCss(shown.color) }} />
        <div className="title">
          <h2>{view === 'pair' && b ? `${a.nameFr} ↔ ${b.nameFr}` : shown.nameFr}</h2>
          {view !== 'pair' && (
            <p className="muted small">
              {KIND_LABELS[shown.kind]} · {shown.id} · niveau{' '}
              {r.detail === 'full' ? 'complet' : 'standard'} · {REGION_LABELS[r.region] ?? r.region}
              , {INCOME_LABELS[r.income] ?? r.income}
              {r.parent ? ` · conteste ${data.byId.get(r.parent)?.nameFr ?? r.parent}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          className="icon"
          title="Cadrer sur la carte"
          onClick={() => focusOn(shown.index)}
        >
          ⌖
        </button>
        <button type="button" className="icon" title="Fermer (Échap)" onClick={clear}>
          ×
        </button>
      </header>
      {b && (
        <div className="segmented wide" role="group">
          <button
            type="button"
            className={view === 'a' ? 'active' : ''}
            onClick={() => setPane({ key, view: 'a' })}
          >
            {a.nameFr}
          </button>
          <button
            type="button"
            className={view === 'pair' ? 'active' : ''}
            onClick={() => setPane({ key, view: 'pair' })}
          >
            Relation
          </button>
          <button
            type="button"
            className={view === 'b' ? 'active' : ''}
            onClick={() => setPane({ key, view: 'b' })}
          >
            {b.nameFr}
          </button>
        </div>
      )}
      {view === 'pair' && b ? (
        <PairPanel data={data} a={a} b={b} />
      ) : (
        <CountryParams data={data} entity={shown} />
      )}
      {!b && <p className="hint">Maj+clic sur un autre pays : relation bilatérale.</p>}
    </aside>
  );
}
