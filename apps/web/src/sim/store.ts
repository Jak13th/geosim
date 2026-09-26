/**
 * État de la simulation côté interface (Zustand) : statut du moteur, miroir de l'état, horloge,
 * compteurs de version (ce qui doit être redessiné), état du fichier model.yaml et notifications.
 */
import { create } from 'zustand';
import type { ModelFileState } from '../api/contract.ts';
import type { LiveSim } from './mirror.ts';
import type { Clock } from './protocol.ts';

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface Notice {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

export interface SimState {
  status: EngineStatus;
  live: LiveSim | null;
  clock: Clock | null;
  /** Valeurs des pays, du monde et des couches de valeur. */
  stateVersion: number;
  pairVersion: number;
  journalVersion: number;
  /** Coefficients du moteur (onglet Modèle). */
  modelVersion: number;
  /** Nouvelle simulation ou capture restaurée. */
  resetVersion: number;
  /** Dernière erreur de la simulation (elle s'est mise en pause). */
  runtimeError: string | null;
  modelFile: ModelFileState | null;
  notices: Notice[];
  notify(kind: Notice['kind'], text: string): void;
  dismiss(id: number): void;
  clearRuntimeError(): void;
}

let nextNotice = 1;
/** Durée d'affichage des notifications (ms). */
const NOTICE_MS = 6000;

export const useSim = create<SimState>()((set, get) => ({
  status: { state: 'idle' },
  live: null,
  clock: null,
  stateVersion: 0,
  pairVersion: 0,
  journalVersion: 0,
  modelVersion: 0,
  resetVersion: 0,
  runtimeError: null,
  modelFile: null,
  notices: [],
  notify: (kind, text) => {
    const id = nextNotice++;
    set({ notices: [...get().notices.slice(-4), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 2 * NOTICE_MS : NOTICE_MS);
  },
  dismiss: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  clearRuntimeError: () => set({ runtimeError: null }),
}));
