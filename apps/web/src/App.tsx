import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dataset } from './data/dataset.ts';
import { loadData } from './data/load.ts';
import { startEngine } from './engineClient.ts';
import { formatNumber } from './format.ts';
import { LAYERS, buildLayer } from './map/layers.ts';
import { MapView } from './map/MapView.tsx';
import { useApp } from './store.ts';
import { Inspector } from './ui/Inspector.tsx';
import { Legend } from './ui/Legend.tsx';
import { SearchDialog } from './ui/SearchDialog.tsx';
import { Tooltip } from './ui/Tooltip.tsx';
import { TopBar, type EngineStatus } from './ui/TopBar.tsx';
import { WorldPanel } from './ui/WorldPanel.tsx';

function useEngine(): EngineStatus {
  const [engine, setEngine] = useState<EngineStatus>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    startEngine()
      .hello(1)
      .then((r) => {
        if (!cancelled) setEngine({ state: 'ready', version: r.version });
      })
      .catch((e: unknown) => {
        if (!cancelled) setEngine({ state: 'error', message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return engine;
}

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

/** Raccourcis clavier (SPEC §9.10) : 1–9 et 0 pour les couches, Ctrl+K, Échap. */
function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const app = useApp.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (app.data) app.setSearchOpen(!app.searchOpen);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)
      )
        return;
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

export function App() {
  const engine = useEngine();
  useDataLoading();
  useShortcuts();
  const data = useApp((s) => s.data);
  const load = useApp((s) => s.load);
  const layer = useApp((s) => s.layer);
  const indicator = useApp((s) => s.indicator);
  const bloc = useApp((s) => s.bloc);
  const selected = useApp((s) => s.selected);
  const searchOpen = useApp((s) => s.searchOpen);
  const worldOpen = useApp((s) => s.worldOpen);
  // Seules les couches « relations » et « sanctions » dépendent de la sélection.
  const layerSelected = layer === 'relations' || layer === 'sanctions' ? selected : 0;
  const layerView = useMemo(
    () => (data ? buildLayer(data, { layer, indicator, bloc, selected: layerSelected }) : null),
    [data, layer, indicator, bloc, layerSelected],
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
      <TopBar data={data} engine={engine} />
      <main className="stage" data-map-state={load.state}>
        {data && layerView && (
          <>
            <MapView data={data} layerView={layerView} onPointer={onPointer} />
            <div className="tooltip" ref={tooltip} style={{ display: 'none' }}>
              <Tooltip data={data} layerView={layerView} />
            </div>
            {worldOpen && <WorldPanel data={data} />}
            <Legend layerView={layerView} />
            {selected !== 0 && <Inspector data={data} />}
            {searchOpen && <SearchDialog data={data} />}
          </>
        )}
        <LoadScreen />
      </main>
    </div>
  );
}
