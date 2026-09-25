/**
 * Pipeline de données : `npm run data [-- --refresh] [-- --resolution 2048|4096|8192]`.
 * Téléchargements mis en cache (data/raw), construction et validation (data/build),
 * manifeste des sources (data/manifest.json).
 *
 * Phase 1a : géographie et carte. Les données pays et les fichiers curés arrivent en phase 1b.
 */
import { parseArgs } from 'node:util';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { ensureSources, type FetchLike } from './download.ts';
import { buildMap } from './map/build.ts';
import { BUILD_DIR, CURATED_DIR, MANIFEST_PATH, MODEL_CONFIG_PATH, RAW_DIR } from './paths.ts';
import { SOURCES } from './sources.ts';

const RESOLUTIONS = [2048, 4096, 8192];

const { values } = parseArgs({
  options: {
    refresh: { type: 'boolean', default: false },
    resolution: { type: 'string', default: '4096' },
  },
});

const resolution = Number(values.resolution);
if (!RESOLUTIONS.includes(resolution)) {
  console.error(`--resolution doit valoir ${RESOLUTIONS.join(', ')} (reçu : ${values.resolution})`);
  process.exit(1);
}

// Le fetch d'undici suit HTTPS_PROXY / NO_PROXY s'ils sont définis (réseaux d'entreprise).
const dispatcher = new EnvHttpProxyAgent();
const httpFetch: FetchLike = (url) => fetch(url, { dispatcher });

const started = performance.now();
const log = (message: string): void => {
  const seconds = ((performance.now() - started) / 1000).toFixed(1).padStart(6);
  console.log(`[${seconds} s] ${message}`);
};

try {
  log(
    `Pipeline de données (résolution ${resolution}, refresh : ${values.refresh ? 'oui' : 'non'})`,
  );
  const paths = await ensureSources(Object.values(SOURCES), {
    rawDir: RAW_DIR,
    manifestPath: MANIFEST_PATH,
    refresh: values.refresh,
    fetch: httpFetch,
    today: new Date().toISOString().slice(0, 10),
    log,
  });
  log('Sources disponibles dans data/raw');
  await buildMap({
    width: resolution,
    sourcePaths: paths,
    buildDir: BUILD_DIR,
    curatedDir: CURATED_DIR,
    modelConfigPath: MODEL_CONFIG_PATH,
    manifestPath: MANIFEST_PATH,
    log,
  });
  log('Terminé');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
