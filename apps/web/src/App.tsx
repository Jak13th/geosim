import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dataset } from './data/dataset.ts';
import { loadData } from './data/load.ts';
import { formatNumber } from './format.ts';
import { LAYERS, buildLayer, liveSource } from './map/layers.ts';
import { MapView } from './map/MapView.tsx';
import { run, startSimulation } from './sim/client.ts';
import { useSim } from './sim/store.ts';
import { useApp } from './store.ts';
import { BottomPanel } from './ui/BottomPanel.tsx';
import { Inspector } from './ui/Inspector.tsx';
import { Legend } from './ui/Legend.tsx';
import { Notices } from './ui/Notices.tsx';
import { SearchDialog } from './ui/SearchDialog.tsx';
import { Tooltip } from './ui/Tooltip.tsx';
import { TopBar, nextSpeed, redo, togglePlay, undo } from './ui/TopBar.tsx';
import { WorldPanel } from './ui/WorldPanel.tsx';

function useDataLoading(): void {
  const setLoad = useApp((s) => s.setLoad);
  const setData = useApp((s) => s.setData);
  useEffect(() => {
    let cancelled = false;
    loadData((progress) => {
      if (!cancelled) setLoad({ state: 'loading', progress });
    })
      .then((result) => {
        if (cancelled) return;
        if (result.state === 'missing') setLoad({ state: 'missing', status: result.status });
        else setData(new Dataset(result.data));
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [setLoad, setData]);
}

/** Le moteur démarre une fois les données de la carte chargées (mêmes fichiers, même build). */
function useSimulation(data: Dataset | null): void {
  useEffect(() => {
    if (data !== null) void startSimulation(data.raw.status.resolution);
  }, [data]);
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    el !== null &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'SELECT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable)
  );
}

/**
 * Raccourcis clavier (SPEC §9.10) : espace (lecture, pause), + et − (vitesse), Ctrl+Z et
 * Ctrl+Y (annuler, rétablir), 1–9 et 0 (couches), Ctrl+K ou / (recherche), Échap.
 */
function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const app = useApp.getState();
      const sim = useSim.getState();
      const ready = sim.status.state === 'ready';
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        if (app.data) app.setSearchOpen(!app.searchOpen);
        return;
      }
      if (isTyping(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && ready && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (app.searchOpen) app.setSearchOpen(false);
        else app.clearSelection();
        return;
      }
      if (e.key === '/' && app.data) {
        e.preventDefault();
        app.setSearchOpen(true);
        return;
      }
      if (ready && e.key === ' ') {
        e.preventDefault();
        togglePlay(sim.clock);
        return;
      }
      if (ready && sim.clock && (e.key === '+' || e.key === '-' || e.key === '=')) {
        e.preventDefault();
        const days = nextSpeed(sim.clock.speed, e.key === '-' ? -1 : 1);
        void run((api) => api.setSpeed(days));
        return;
      }
      const layer = LAYERS.find((l) => l.key === e.key);
      if (layer) app.setLayer(layer.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function LoadScreen() {
  const load = useApp((s) => s.load);
  if (load.state === 'ready') return null;
  return (
    <div className="load-screen" data-map-state={load.state}>
      {load.state === 'loading' && (
        <>
          <p>Chargement de la carte et des données…</p>
          {load.progress && (
            <>
              <progress
                max={load.progress.total ?? undefined}
                value={load.progress.total ? load.progress.loaded : undefined}
              />
              <p className="muted small">
                {formatNumber(load.progress.loaded / 1e6)} Mo
                {load.progress.total ? ` sur ${formatNumber(load.progress.total / 1e6)} Mo` : ''}
              </p>
            </>
          )}
        </>
      )}
      {load.state === 'missing' && (
        <>
          <p>Données non construites.</p>
          <p className="muted">{load.status.problem}</p>
        </>
      )}
      {load.state === 'error' && (
        <>
          <p>Erreur de chargement.</p>
          <p className="muted">{load.message}</p>
        </>
      )}
    </div>
  );
}

/** Couches qui lisent des valeurs simulées (redessinées quand elles changent). */
const LIVE_LAYERS = new Set(['indicator', 'relations', 'blocs', 'sanctions']);

export function App() {
  useDataLoading();
  useShortcuts();
  const data = useApp((s) => s.data);
  useSimulation(data);
  const load = useApp((s) => s.load);
  const layer = useApp((s) => s.layer);
  const indicator = useApp((s) => s.indicator);
  const bloc = useApp((s) => s.bloc);
  const selected = useApp((s) => s.selected);
  const searchOpen = useApp((s) => s.searchOpen);
  const worldOpen = useApp((s) => s.worldOpen);
  const bottomOpen = useApp((s) => s.bottomOpen);
  const live = useSim((s) => (s.status.state === 'ready' ? s.live : null));
  const liveLayer = LIVE_LAYERS.has(layer);
  // Version des valeurs lues par la couche affichée (0 : couche sans valeurs simulées).
  const stateVersion = useSim((s) => (liveLayer ? s.stateVersion : 0));
  const pairVersion = useSim((s) => (liveLayer ? s.pairVersion : 0));
  // Seules les couches « relations » et « sanctions » dépendent de la sélection.
  const layerSelected = layer === 'relations' || layer === 'sanctions' ? selected : 0;
  const layerView = useMemo(
    () =>
      data
        ? buildLayer(data, {
            layer,
            indicator,
            bloc,
            selected: layerSelected,
            ...(live && liveLayer ? { values: liveSource(data, live) } : {}),
          })
        : null,
    // Les compteurs de version signalent un nouvel état du miroir (mutable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, layer, indicator, bloc, layerSelected, live, liveLayer, stateVersion, pairVersion],
  );
  const tooltip = useRef<HTMLDivElement>(null);
  const onPointer = useCallback((x: number, y: number, inside: boolean) => {
    const el = tooltip.current;
    if (!el) return;
    el.style.display = inside ? '' : 'none';
    const parent = el.parentElement;
    const width = parent?.clientWidth ?? 0;
    const flip = x > width - 320;
    el.style.transform = `translate(${flip ? x - 16 : x + 16}px, ${y + 16}px) translateX(${flip ? '-100%' : '0'})`;
  }, []);

  return (
    <div className="app">
      <TopBar data={data} />
      <main
        className={`stage${bottomOpen && data ? ' with-bottom' : ''}`}
        data-map-state={load.state}
      >
        {data && layerView && (
          <>
            <MapView data={data} layerView={layerView} onPointer={onPointer} />
            <div className="tooltip" ref={tooltip} style={{ display: 'none' }}>
              <Tooltip data={data} layerView={layerView} />
            </div>
            {worldOpen && <WorldPanel data={data} />}
            <Legend layerView={layerView} />
            {selected !== 0 && <Inspector data={data} />}
            {bottomOpen && <BottomPanel data={data} />}
            {searchOpen && <SearchDialog data={data} />}
          </>
        )}
        <LoadScreen />
        <Notices />
      </main>
    </div>
  );
}
