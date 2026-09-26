/**
 * Barre supérieure (SPEC §9.1) : date des données, sélecteur de couche (et d'indicateur ou de
 * bloc), recherche, panneau Monde, état du moteur.
 */
import { CATEGORIES, paramById } from '@geosim/shared';
import { useMemo } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { formatDataDate } from '../format.ts';
import {
  DEFAULT_BLOC,
  INDICATOR_PRESETS,
  LAYERS,
  indicatorOptions,
  type LayerId,
} from '../map/layers.ts';
import { useApp } from '../store.ts';

export type EngineStatus =
  { state: 'loading' } | { state: 'ready'; version: string } | { state: 'error'; message: string };

function LayerPicker({ data }: { data: Dataset }) {
  const layer = useApp((s) => s.layer);
  const setLayer = useApp((s) => s.setLayer);
  const indicator = useApp((s) => s.indicator);
  const setIndicator = useApp((s) => s.setIndicator);
  const bloc = useApp((s) => s.bloc);
  const setBloc = useApp((s) => s.setBloc);
  const options = useMemo(() => indicatorOptions(data), [data]);
  const available = new Set(options.map((d) => d.id));
  return (
    <div className="layer-picker">
      <label>
        <span className="muted small">Couche</span>
        <select
          value={layer}
          onChange={(e) => setLayer(e.target.value as LayerId)}
          aria-label="Couche"
          data-layer-select=""
        >
          {LAYERS.map((l) => (
            <option key={l.id} value={l.id} title={l.description}>
              {l.key} · {l.label}
            </option>
          ))}
        </select>
      </label>
      {layer === 'indicator' && (
        <select
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
          aria-label="Indicateur"
          className="wide"
        >
          <optgroup label="Principaux">
            {INDICATOR_PRESETS.filter((id) => available.has(id)).map((id) => (
              <option key={`p-${id}`} value={id}>
                {paramById(id)?.label ?? id}
              </option>
            ))}
          </optgroup>
          {CATEGORIES.filter((c) => c.scope === 'country').map((c) => {
            const defs = options.filter((d) => d.category === c.id);
            if (defs.length === 0) return null;
            return (
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
      )}
      {layer === 'blocs' && (
        <select
          value={bloc}
          onChange={(e) => setBloc(e.target.value)}
          aria-label="Bloc"
          className="wide"
        >
          <option value={DEFAULT_BLOC}>Alliances militaires (vue d’ensemble)</option>
          {[...data.raw.world.blocs]
            .sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameFr}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}

export function TopBar({ data, engine }: { data: Dataset | null; engine: EngineStatus }) {
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  const worldOpen = useApp((s) => s.worldOpen);
  const setWorldOpen = useApp((s) => s.setWorldOpen);
  return (
    <header className="topbar">
      <div className="brand">
        <strong>GeoSim</strong>
        {data && (
          <span
            className="muted small"
            title={`Carte ${data.raw.grid.header.buildId} · ${data.width} × ${data.height} px`}
          >
            Données du {formatDataDate(data.raw.countries.buildDate)}
          </span>
        )}
      </div>
      {data && <LayerPicker data={data} />}
      <div className="actions">
        {data && (
          <>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Rechercher un pays (Ctrl+K)"
            >
              Rechercher <kbd>Ctrl K</kbd>
            </button>
            <button
              type="button"
              className={worldOpen ? 'active' : ''}
              onClick={() => setWorldOpen(!worldOpen)}
            >
              Monde
            </button>
          </>
        )}
        <span className="engine muted small" data-engine-state={engine.state}>
          {engine.state === 'loading' && 'Moteur : chargement…'}
          {engine.state === 'ready' && `Moteur ${engine.version}`}
          {engine.state === 'error' && `Moteur : erreur (${engine.message})`}
        </span>
      </div>
    </header>
  );
}
