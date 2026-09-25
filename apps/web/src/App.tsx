import { useEffect, useState } from 'react';
import { startEngine } from './engineClient.ts';

type EngineStatus =
  { state: 'loading' } | { state: 'ready'; version: string } | { state: 'error'; message: string };

export function App() {
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

  return (
    <main className="shell">
      <h1>GeoSim</h1>
      <p className="tagline">Simulation géopolitique locale et temps réel</p>
      <p className="status" data-engine-state={engine.state}>
        {engine.state === 'loading' && 'Moteur : chargement…'}
        {engine.state === 'ready' && `Moteur ${engine.version} prêt`}
        {engine.state === 'error' && `Moteur : erreur (${engine.message})`}
      </p>
    </main>
  );
}
