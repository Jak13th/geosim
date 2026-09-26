/**
 * Client du moteur côté interface : démarre le worker, intègre les images reçues dans le miroir
 * (`LiveSim`) et le magasin `useSim`, relaie les commandes et signale leurs erreurs, recharge
 * config/model.yaml à chaud (événement HMR du serveur local).
 */
import type { Command, JournalEntry } from '@geosim/engine';
import { wrap, type Remote } from 'comlink';
import { fetchModelFile } from '../api/client.ts';
import { MODEL_EVENT } from '../api/contract.ts';
import type { EngineApi, FrameMessage } from './engine.worker.ts';
import { LiveSim } from './mirror.ts';
import type { Frame } from './protocol.ts';
import { useSim } from './store.ts';

/** Graine de la simulation au lancement (modifiable ensuite : `sim.seed`, nouvelle simulation). */
export const DEFAULT_SEED = 1;

let remote: Remote<EngineApi> | null = null;
let started = false;

/** Interface RPC du worker ; lève une erreur si le moteur n'est pas démarré. */
export function engine(): Remote<EngineApi> {
  if (remote === null) throw new Error('Moteur non démarré');
  return remote;
}

function onFrame(frame: Frame): void {
  const s = useSim.getState();
  let live = s.live;
  let reset = false;
  if (frame.reset) {
    live = new LiveSim(frame.reset, frame.clock);
    reset = true;
  }
  if (live === null) return;
  const changed = live.apply(frame);
  useSim.setState({
    live,
    clock: frame.clock,
    stateVersion: s.stateVersion + (changed.state || reset ? 1 : 0),
    pairVersion: s.pairVersion + (changed.pairs || reset ? 1 : 0),
    journalVersion: s.journalVersion + (changed.journal || reset ? 1 : 0),
    modelVersion: frame.modelVersion,
    resetVersion: s.resetVersion + (reset ? 1 : 0),
    ...(frame.error ? { runtimeError: frame.error } : {}),
  });
}

/** Démarre le worker (une seule fois) et crée la simulation. */
export async function startSimulation(mapResolution: number | null): Promise<void> {
  if (started) return;
  started = true;
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<Partial<FrameMessage> | null>) => {
    const frame = e.data?.geosimFrame;
    if (frame) onFrame(frame);
  });
  worker.addEventListener('error', (e) => {
    useSim.setState({ status: { state: 'error', message: e.message || 'erreur du worker' } });
  });
  remote = wrap<EngineApi>(worker);
  useSim.setState({ status: { state: 'loading' } });
  try {
    const { engine: version } = await remote.init({
      seed: DEFAULT_SEED,
      ...(mapResolution ? { mapResolution } : {}),
    });
    useSim.setState({ status: { state: 'ready', version } });
    void refreshModelFile();
  } catch (e) {
    useSim.setState({ status: { state: 'error', message: errorText(e) } });
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Exécute une action sur le moteur ; en cas d'échec (commande refusée…), affiche l'erreur et
 * renvoie null.
 */
export async function run<T>(action: (api: Remote<EngineApi>) => Promise<T>): Promise<T | null> {
  try {
    return await action(engine());
  } catch (e) {
    useSim.getState().notify('error', errorText(e));
    return null;
  }
}

/** Applique une commande journalisée (modification, verrou, modificateur, coefficient…). */
export function command(cmd: Command): Promise<JournalEntry | null> {
  return run((api) => api.apply(cmd));
}

/** Relit config/model.yaml pour l'onglet Modèle (sans l'appliquer). */
export async function refreshModelFile(): Promise<void> {
  try {
    useSim.setState({ modelFile: await fetchModelFile() });
  } catch (e) {
    useSim.getState().notify('error', `config/model.yaml : ${errorText(e)}`);
  }
}

/**
 * Recharge config/model.yaml et l'applique au moteur (commande `setModel`, journalisée). Sans
 * effet si le fichier ne change aucun coefficient.
 */
export async function reloadModel(manual = false): Promise<void> {
  const { notify } = useSim.getState();
  try {
    const file = await fetchModelFile();
    useSim.setState({ modelFile: file });
    if (file.tree === null) {
      notify(
        'error',
        `${file.path} invalide, modèle inchangé : ${file.errors.slice(0, 2).join(' ; ')}`,
      );
      return;
    }
    const entry = await engine().reloadModel(file.tree);
    const n = entry?.coefficients?.length ?? 0;
    if (n > 0) {
      notify(
        'success',
        `${file.path} rechargé : ${n} coefficient${n > 1 ? 's' : ''} modifié${n > 1 ? 's' : ''}`,
      );
    } else if (manual) notify('info', `${file.path} : aucun changement`);
  } catch (e) {
    notify('error', `Rechargement du modèle : ${errorText(e)}`);
  }
}

// Rechargement à chaud : le serveur de développement signale chaque changement du fichier.
if (import.meta.hot) {
  import.meta.hot.on(MODEL_EVENT, () => {
    if (useSim.getState().status.state === 'ready') void reloadModel();
  });
}
