/**
 * Moteur de simulation GeoSim : TypeScript pur, sans DOM ni API propre à Node.
 * Il tourne à l'identique dans un Web Worker (interface) et dans la CLI.
 */
export { Rng, deriveSeed, fnv1a32, type RngState } from './rng.ts';

export const ENGINE_VERSION = '0.0.0';
