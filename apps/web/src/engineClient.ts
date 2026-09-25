import { wrap, type Remote } from 'comlink';
import type { EngineApi } from './engine.worker.ts';

/** Démarre le worker du moteur et renvoie son interface RPC. */
export function startEngine(): Remote<EngineApi> {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  return wrap<EngineApi>(worker);
}
