/**
 * Worker du moteur : la simulation tourne ici, jamais sur le fil de l'interface (SPEC §7.3).
 * Il charge lui-même les données construites et config/model.yaml (API locale), puis expose le
 * pilote par RPC (Comlink). Les images de l'état sont postées directement, tableaux transférés.
 */
import type { EngineData } from '@geosim/engine';
import type { CoefficientTree, CountriesBase, PairsBase, WorldBaseFile } from '@geosim/shared';
import { expose } from 'comlink';
import { MODEL_API, type ModelFileState } from '../api/contract.ts';
import { DATA_FILES_PREFIX } from '../data/status.ts';
import type { Frame } from './protocol.ts';
import { SimRunner, type RunnerHost } from './runner.ts';

/** Message d'image, distinct des réponses RPC de Comlink (qui portent un `id`). */
export interface FrameMessage {
  geosimFrame: Frame;
}

const host: RunnerHost = {
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  post: (frame, transfer) => {
    const message: FrameMessage = { geosimFrame: frame };
    self.postMessage(message, { transfer });
  },
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Coefficients de config/model.yaml ; une erreur explicite si le fichier est invalide. */
async function loadModel(): Promise<CoefficientTree> {
  const state = await fetchJson<ModelFileState>(MODEL_API);
  if (state.tree === null) {
    throw new Error(`${state.path} invalide : ${state.errors.slice(0, 3).join(' ; ')}`);
  }
  return state.tree;
}

let runner: SimRunner | null = null;

function sim(): SimRunner {
  if (runner === null) throw new Error('Moteur non initialisé');
  return runner;
}

const api = {
  /** Charge les données et le modèle, crée la simulation et envoie la première image. */
  async init(options: { seed: number; mapResolution?: number }) {
    const file = (name: string): string => DATA_FILES_PREFIX + encodeURIComponent(name);
    const [countries, pairs, world, model] = await Promise.all([
      fetchJson<CountriesBase>(file('countries.base.json')),
      fetchJson<PairsBase>(file('pairs.base.json')),
      fetchJson<WorldBaseFile>(file('world.base.json')),
      loadModel(),
    ]);
    const data: EngineData = { countries, pairs, world };
    runner = new SimRunner(host, data, model, options.seed, options.mapResolution);
    runner.flush(true);
    return { engine: runner.info().engine };
  },
  play: () => sim().play(),
  pause: () => sim().pause(),
  setSpeed: (days: number) => sim().setSpeed(days),
  step: (unit: Parameters<SimRunner['step']>[0]) => sim().step(unit),
  runUntil: (date: string) => sim().runUntil(date),
  apply: (command: Parameters<SimRunner['apply']>[0]) => sim().apply(command),
  undo: () => sim().undo(),
  redo: () => sim().redo(),
  model: () => sim().model(),
  reloadModel: (tree: CoefficientTree) => sim().reloadModel(tree),
  hash: () => sim().hash(),
  series: (entity: string, params: string[]) => sim().series(entity, params),
  compare: (param: string, entities: string[]) => sim().compare(param, entities),
  worldSeries: (keys: string[]) => sim().worldSeries(keys),
  capture: (label: string) => sim().capture(label),
  listCaptures: () => sim().listCaptures(),
  deleteCapture: (id: number) => sim().deleteCapture(id),
  restoreCapture: (id: number) => sim().restoreCapture(id),
  exportCapture: (id: number | null, label?: string) => sim().exportCapture(id, label),
  importCapture: (text: string) => sim().importCapture(text),
  verifyReplay: () => sim().verifyReplay(),
  restart: (seed: number) => sim().restart(seed),
};

export type EngineApi = typeof api;

expose(api);
