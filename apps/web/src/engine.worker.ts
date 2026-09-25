/**
 * Worker du moteur : le moteur tourne ici, jamais sur le fil de l'interface (SPEC §7.3).
 */
import { ENGINE_VERSION, Rng } from '@geosim/engine';
import { expose } from 'comlink';

const api = {
  /** Poignée de main : confirme que le moteur est chargé et déterministe. */
  hello(seed: number): { version: string; sample: number } {
    return { version: ENGINE_VERSION, sample: new Rng(seed).nextU32() };
  },
};

export type EngineApi = typeof api;

expose(api);
