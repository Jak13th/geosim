/**
 * Barre supérieure (SPEC §9.1) : date simulée, lecture et pause, vitesses, pas-à-pas, « avancer
 * jusqu'à », annuler et rétablir, indicateurs mondiaux ; sélecteur de couche (et d'indicateur ou
 * de bloc), recherche, panneaux.
 */
import { CATEGORIES, paramById } from '@geosim/shared';
import { useMemo, useState } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { formatDataDate, formatDate, formatNumber } from '../format.ts';
import {
  DEFAULT_BLOC,
  INDICATOR_PRESETS,
  LAYERS,
  indicatorOptions,
  liveSource,
  type LayerId,
} from '../map/layers.ts';
import { run } from '../sim/client.ts';
import { SPEEDS, type Clock } from '../sim/protocol.ts';
import { useSim } from '../sim/store.ts';
import { useApp } from '../store.ts';
import { useLive } from './live.ts';

function LayerPicker({ data }: { data: Dataset }) {
  const layer = useApp((s) => s.layer);
  const setLayer = useApp((s) => s.setLayer);
  const indicator = useApp((s) => s.indicator);
  const setIndicator = useApp((s) => s.setIndicator);
  const bloc = useApp((s) => s.bloc);
  const setBloc = useApp((s) => s.setBloc);
  // Le miroir change d'identité à chaque nouvelle simulation : les options suivent.
  const live = useSim((s) => (s.status.state === 'ready' ? s.live : null));
  const options = useMemo(
    () => indicatorOptions(data, live ? liveSource(data, live) : undefined),
    [data, live],
  );
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

/** Vitesse suivante ou précédente (raccourcis + et −). */
export function nextSpeed(current: number, direction: 1 | -1): number {
  const k = SPEEDS.findIndex((s) => s.days === current);
  const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (k < 0 ? 0 : k) + direction))];
  return next?.days ?? current;
}

export function togglePlay(clock: Clock | null): void {
  if (clock === null) return;
  void run((api) => (clock.running ? api.pause() : api.play()));
}

export function undo(): void {
  void run((api) => api.undo());
}

export function redo(): void {
  void run((api) => api.redo());
}

function TimeControls({ clock }: { clock: Clock }) {
  const live = useLive();
  const [target, setTarget] = useState('');
  const rushing = clock.target !== null;
  return (
    <div className="time" data-running={clock.running ? 'true' : 'false'}>
      <div
        className="sim-date"
        title={`Jour ${clock.tick} de la simulation`}
        data-sim-date={clock.date}
      >
        {formatDate(clock.date)}
      </div>
      <button
        type="button"
        className={`play${clock.running ? ' active' : ''}`}
        onClick={() => togglePlay(clock)}
        title={clock.running ? 'Pause (espace)' : 'Lecture (espace)'}
        aria-label={clock.running ? 'Pause' : 'Lecture'}
        data-play=""
      >
        {clock.running ? '⏸' : '▶'}
      </button>
      <div className="segmented" role="group" aria-label="Vitesse">
        {SPEEDS.map((s) => (
          <button
            type="button"
            key={s.days}
            title={`${s.title} (+ et − pour changer)`}
            className={clock.speed === s.days ? 'active' : ''}
            onClick={() => void run((api) => api.setSpeed(s.days))}
            data-speed={s.days}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Pas-à-pas">
        <button
          type="button"
          title="Avancer d’un jour"
          onClick={() => void run((api) => api.step('day'))}
          data-step="day"
        >
          +1 j
        </button>
        <button
          type="button"
          title="Avancer d’une semaine"
          onClick={() => void run((api) => api.step('week'))}
          data-step="week"
        >
          +1 sem
        </button>
        <button
          type="button"
          title="Avancer jusqu’au premier jour du mois suivant (pas mensuel des systèmes)"
          onClick={() => void run((api) => api.step('month'))}
          data-step="month"
        >
          +1 mois
        </button>
      </div>
      <form
        className="goto"
        onSubmit={(e) => {
          e.preventDefault();
          if (target) void run((api) => api.runUntil(target));
        }}
      >
        <input
          type="date"
          value={target}
          min={clock.date}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Avancer jusqu’au"
          title="Avancer à vitesse maximale jusqu’à cette date"
        />
        <button type="submit" disabled={!target || rushing} title="Avancer jusqu’à la date choisie">
          {rushing ? `⏩ ${formatDate(clock.date)}` : 'Aller'}
        </button>
      </form>
      <div className="segmented" role="group" aria-label="Annuler, rétablir">
        <button
          type="button"
          disabled={!live?.canUndo}
          onClick={undo}
          title="Annuler la dernière modification (Ctrl+Z)"
        >
          ↶
        </button>
        <button type="button" disabled={!live?.canRedo} onClick={redo} title="Rétablir (Ctrl+Y)">
          ↷
        </button>
      </div>
      {clock.lagging && (
        <span className="lagging small" title="Le moteur n’arrive pas à suivre cette vitesse">
          ⚠ ralenti
        </span>
      )}
    </div>
  );
}

/** Indicateurs mondiaux (SPEC §9.1) : pétrole, gaz européen, blé, croissance mondiale, escalade. */
function WorldIndicators() {
  const live = useLive();
  if (live === null) return null;
  const gas = live.world['world.gas_price'];
  const europe =
    gas !== null && typeof gas === 'object' && !Array.isArray(gas) ? gas.europe : undefined;
  const items: [string, string, number | null | undefined, string][] = [
    ['Brent', 'world.oil_price', live.worldEff['world.oil_price'], ' $'],
    ['Gaz UE', 'world.gas_price', europe, ' $/MMBtu'],
    ['Blé', 'world.wheat_price', live.worldEff['world.wheat_price'], ' $/t'],
    ['Croissance', 'world.growth', live.worldEff['world.growth'], ' %'],
    ['Escalade', 'world.escalation', live.worldEff['world.escalation'], ''],
  ];
  return (
    <div className="indicators">
      {items.map(([label, id, value, unit]) => (
        <span
          key={label}
          className="indicator"
          title={`${paramById(id)?.label ?? id}${value === undefined || value === null ? ' — calculé à partir de la phase 6' : ''}`}
        >
          <span className="muted small">{label}</span>{' '}
          <strong>
            {value === undefined || value === null ? '—' : `${formatNumber(value)}${unit}`}
          </strong>
        </span>
      ))}
    </div>
  );
}

export function TopBar({ data }: { data: Dataset | null }) {
  const status = useSim((s) => s.status);
  const clock = useSim((s) => s.clock);
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  const worldOpen = useApp((s) => s.worldOpen);
  const leftTab = useApp((s) => s.leftTab);
  const toggleLeft = useApp((s) => s.toggleLeft);
  const bottomOpen = useApp((s) => s.bottomOpen);
  const bottomTab = useApp((s) => s.bottomTab);
  const setBottom = useApp((s) => s.setBottom);
  const bottomButton = (tab: 'journal' | 'charts', label: string, title: string) => (
    <button
      type="button"
      title={title}
      className={bottomOpen && bottomTab === tab ? 'active' : ''}
      onClick={() => setBottom(!(bottomOpen && bottomTab === tab), tab)}
    >
      {label}
    </button>
  );
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
      {status.state === 'ready' && clock && <TimeControls clock={clock} />}
      {status.state === 'ready' && <WorldIndicators />}
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
            <div className="segmented" role="group" aria-label="Panneaux">
              {(
                [
                  ['world', 'Monde'],
                  ['model', 'Modèle'],
                  ['sim', 'Simulation'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  type="button"
                  key={tab}
                  className={worldOpen && leftTab === tab ? 'active' : ''}
                  onClick={() => toggleLeft(tab)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Journal et graphiques">
              {bottomButton('journal', 'Journal', 'Journal des événements et des modifications')}
              {bottomButton('charts', 'Graphiques', 'Séries des pays et du monde')}
            </div>
          </>
        )}
        <span className="engine muted small" data-engine-state={status.state}>
          {status.state === 'idle' && 'Moteur : en attente des données'}
          {status.state === 'loading' && 'Moteur : chargement…'}
          {status.state === 'ready' && `Moteur ${status.version}`}
          {status.state === 'error' && `Moteur : erreur (${status.message})`}
        </span>
      </div>
    </header>
  );
}
