/**
 * Chargement des données construites par `npm run data`, servies par l'API locale.
 * Les archives gzip sont décompressées en flux (DecompressionStream, hors du fil principal) ;
 * le décodage de la carte ne crée que des vues sur le tampon.
 */
import {
  decodeLand,
  decodeMap,
  landIndex,
  type CountriesBase,
  type LandLayers,
  type MapGeo,
  type MapGrid,
  type MapMeta,
  type MapRoutes,
  type PairsBase,
  type WorldBaseFile,
} from '@geosim/shared';
import { DATA_FILES_PREFIX, DATA_STATUS_PATH, type DataStatus } from './status.ts';

export interface RawData {
  status: DataStatus;
  grid: MapGrid;
  meta: MapMeta;
  geo: MapGeo;
  land: { layers: LandLayers; index: Int32Array };
  countries: CountriesBase;
  pairs: PairsBase;
  world: WorldBaseFile;
}

export interface LoadProgress {
  /** Octets reçus (compressés pour les archives). */
  loaded: number;
  /** Total annoncé par le serveur, ou null s'il est inconnu. */
  total: number | null;
}

export type LoadResult =
  { state: 'ready'; data: RawData } | { state: 'missing'; status: DataStatus };

export async function fetchStatus(): Promise<DataStatus> {
  const res = await fetch(DATA_STATUS_PATH);
  if (!res.ok) throw new Error(`État des données : HTTP ${res.status}`);
  return (await res.json()) as DataStatus;
}

/** Suivi agrégé de plusieurs téléchargements. */
class ProgressTracker {
  private readonly loaded = new Map<string, number>();
  private readonly totals = new Map<string, number | null>();
  constructor(private readonly onProgress: (p: LoadProgress) => void) {}
  start(name: string, total: number | null): void {
    this.totals.set(name, total);
    this.loaded.set(name, 0);
    this.emit();
  }
  add(name: string, bytes: number): void {
    this.loaded.set(name, (this.loaded.get(name) ?? 0) + bytes);
    this.emit();
  }
  private emit(): void {
    let loaded = 0;
    let total: number | null = 0;
    for (const [name, t] of this.totals) {
      loaded += this.loaded.get(name) ?? 0;
      total = t === null || total === null ? null : total + t;
    }
    this.onProgress({ loaded, total });
  }
}

async function fetchStream(name: string, tracker: ProgressTracker): Promise<Response> {
  const res = await fetch(DATA_FILES_PREFIX + encodeURIComponent(name));
  if (!res.ok || res.body === null) throw new Error(`${name} : HTTP ${res.status}`);
  const length = Number(res.headers.get('Content-Length'));
  tracker.start(name, Number.isFinite(length) && length > 0 ? length : null);
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        tracker.add(name, chunk.byteLength);
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(counted);
}

async function fetchJson<T>(name: string, tracker: ProgressTracker): Promise<T> {
  return (await (await fetchStream(name, tracker)).json()) as T;
}

async function fetchGzip(name: string, tracker: ProgressTracker): Promise<ArrayBuffer> {
  const res = await fetchStream(name, tracker);
  if (res.body === null) throw new Error(`${name} : réponse vide`);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Charge toutes les données nécessaires à la carte interactive. */
export async function loadData(onProgress: (p: LoadProgress) => void): Promise<LoadResult> {
  const status = await fetchStatus();
  if (!status.ready || status.resolution === null) return { state: 'missing', status };
  const r = status.resolution;
  const tracker = new ProgressTracker(onProgress);
  const [mapBuffer, landBuffer, meta, geo, countries, pairs, world] = await Promise.all([
    fetchGzip(`map-${r}.bin.gz`, tracker),
    fetchGzip(`land-${r}.bin.gz`, tracker),
    fetchJson<MapMeta>(`map-${r}.json`, tracker),
    fetchJson<MapGeo>(`geo-${r}.json`, tracker),
    fetchJson<CountriesBase>('countries.base.json', tracker),
    fetchJson<PairsBase>('pairs.base.json', tracker),
    fetchJson<WorldBaseFile>('world.base.json', tracker),
  ]);
  const grid = decodeMap(mapBuffer);
  const land = decodeLand(landBuffer);
  const ids = {
    carte: grid.header.buildId,
    métadonnées: meta.buildId,
    voisinages: geo.buildId,
    'couches terrestres': land.header.buildId,
    'données pays': countries.mapBuildId,
  };
  const mismatched = Object.entries(ids).filter(([, id]) => id !== grid.header.buildId);
  if (mismatched.length > 0) {
    throw new Error(
      `Builds incohérents (${Object.entries(ids)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}) : relance « npm run data ».`,
    );
  }
  const index = landIndex(grid.layers.terrain);
  if (index.length !== land.header.count) {
    throw new Error(
      `Couches terrestres : ${land.header.count} valeurs pour ${index.length} pixels`,
    );
  }
  return {
    state: 'ready',
    data: {
      status,
      grid,
      meta,
      geo,
      land: { layers: land.layers, index },
      countries,
      pairs,
      world,
    },
  };
}

/** Routes maritimes (≈ 10 Mo), chargées à la demande par la couche « mer et détroits ». */
export async function loadRoutes(resolution: number): Promise<MapRoutes> {
  const tracker = new ProgressTracker(() => undefined);
  return fetchJson<MapRoutes>(`routes-${resolution}.json`, tracker);
}
