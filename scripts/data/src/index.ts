/**
 * Pipeline de données : `npm run data [-- --refresh] [-- --resolution 2048|4096|8192]`.
 * Téléchargements mis en cache (data/raw), construction et validation (data/build),
 * manifeste des sources (data/manifest.json).
 *
 * Étapes : sources → entités → données pays de base (population, PIB) → carte (zones de contrôle,
 * population par pixel, routes) → données pays complètes, paires, monde → rapport de couverture.
 * `--skip-map` réutilise la carte déjà construite (itérations sur les données pays).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { EnvHttpProxyAgent, fetch } from 'undici';
import type { MapGeo, MapMeta, MapRoutes } from '@geosim/shared';
import { loadYaml } from './config.ts';
import { loadCountryValues, parseDefaults } from './country/curated.ts';
import type { Ctx } from './country/context.ts';
import {
  entityInfos,
  extraEntityDefs,
  loadEntitiesFile,
  loadEntityTable,
} from './country/entities.ts';
import { geoZoneErrors, parseGeoZones } from './country/geozones.ts';
import { loadAutomated } from './country/load.ts';
import { countriesBase, pairsBase, worldBase } from './country/output.ts';
import { consistencyAlerts, writeReport } from './country/report.ts';
import { checkRules, resolveAll, resolveBase } from './country/resolve.ts';
import { MAP_PARAMS, RULES } from './country/rules.ts';
import { COUNTRY_SOURCES } from './country/sources.ts';
import { checkTopicCodes, loadTopics } from './country/topics.ts';
import { ensureSources, readManifest, type FetchLike } from './download.ts';
import { loadNaturalEarth, str } from './io/naturalEarth.ts';
import { buildMap } from './map/build.ts';
import type { UnitTotals } from './map/population.ts';
import { parseChokepoints } from './map/routing.ts';
import { parseControlZones } from './map/zones.ts';
import { BUILD_DIR, CURATED_DIR, MANIFEST_PATH, MODEL_CONFIG_PATH, RAW_DIR } from './paths.ts';
import { SOURCES } from './sources.ts';

const RESOLUTIONS = [2048, 4096, 8192];

const { values } = parseArgs({
  options: {
    refresh: { type: 'boolean', default: false },
    resolution: { type: 'string', default: '4096' },
    'skip-map': { type: 'boolean', default: false },
  },
});

const resolution = Number(values.resolution);
if (!RESOLUTIONS.includes(resolution)) {
  console.error(`--resolution doit valoir ${RESOLUTIONS.join(', ')} (reçu : ${values.resolution})`);
  process.exit(1);
}

// Le fetch d'undici suit HTTPS_PROXY / NO_PROXY s'ils sont définis (réseaux d'entreprise).
const dispatcher = new EnvHttpProxyAgent();
// Certains serveurs (FMI) refusent les requêtes sans User-Agent explicite.
const httpFetch: FetchLike = (url) =>
  fetch(url, {
    dispatcher,
    headers: { 'user-agent': 'GeoSim-data-pipeline/0.1 (usage local, non commercial)' },
  });

const started = performance.now();
const log = (message: string): void => {
  const seconds = ((performance.now() - started) / 1000).toFixed(1).padStart(6);
  console.log(`[${seconds} s] ${message}`);
};

try {
  const today = new Date().toISOString().slice(0, 10);
  log(
    `Pipeline de données (résolution ${resolution}, refresh : ${values.refresh ? 'oui' : 'non'})`,
  );
  const paths = await ensureSources(
    [...Object.values(SOURCES), ...Object.values(COUNTRY_SOURCES)],
    {
      rawDir: RAW_DIR,
      manifestPath: MANIFEST_PATH,
      refresh: values.refresh,
      fetch: httpFetch,
      today,
      log,
    },
  );
  log('Sources disponibles dans data/raw');

  // Entités et fichiers curés.
  const entitiesFile = await loadEntitiesFile(CURATED_DIR);
  const countriesZip = paths.get(SOURCES.countries.id) as string;
  const table = await loadEntityTable(countriesZip, CURATED_DIR, entitiesFile);
  const auto = await loadAutomated(paths, MANIFEST_PATH, log);
  const { entities, errors: entityErrors } = entityInfos(table, entitiesFile, auto.wbMeta);
  const topics = await loadTopics(CURATED_DIR);
  const curated = await loadCountryValues(CURATED_DIR);
  const defaults = parseDefaults(await loadYaml(join(CURATED_DIR, 'defaults.yaml')));
  const zones = parseControlZones(await loadYaml(join(CURATED_DIR, 'control_zones.geojson')));
  const chokepoints = parseChokepoints(await loadYaml(join(CURATED_DIR, 'chokepoints.yaml')));
  const geoZones = {
    separatism: parseGeoZones(
      await loadYaml(join(CURATED_DIR, 'separatism.geojson')),
      'separatism.geojson',
    ),
    fortifications: parseGeoZones(
      await loadYaml(join(CURATED_DIR, 'fortifications.geojson')),
      'fortifications.geojson',
    ),
    claims: parseGeoZones(await loadYaml(join(CURATED_DIR, 'claims.geojson')), 'claims.geojson'),
  };
  const codes = new Set(entities.map((e) => e.id));
  const admin1 = await loadNaturalEarth(paths.get(SOURCES.admin1.id) as string);
  const disputed = await loadNaturalEarth(paths.get(SOURCES.disputed.id) as string);
  const known = {
    codes,
    admin1: new Set(
      admin1.features.flatMap((f) => [str(f, 'iso_3166_2') ?? '', str(f, 'adm1_code') ?? '']),
    ),
    disputed: new Set(disputed.features.map((f) => str(f, 'BRK_NAME') ?? '')),
  };
  const curatedErrors = [
    ...entityErrors,
    ...checkRules(),
    ...checkTopicCodes(topics, codes),
    ...[...curated].flatMap(([id, t]) =>
      [...t.keys()]
        .filter((c) => !codes.has(c))
        .map((c) => `country_*.yaml › ${id} : entité inconnue « ${c} »`),
    ),
    ...geoZoneErrors(geoZones.separatism, 'separatism.geojson', known),
    ...geoZoneErrors(geoZones.fortifications, 'fortifications.geojson', known),
    ...geoZoneErrors(geoZones.claims, 'claims.geojson', known),
  ];
  if (curatedErrors.length > 0) {
    throw new Error(
      `Fichiers curés : ${curatedErrors.length} erreur(s)\n  ${curatedErrors.join('\n  ')}`,
    );
  }
  log(
    `${entities.length} entités (${entities.filter((e) => e.detail === 'full').length} au niveau complet) ; ${curated.size} paramètres curés ; ${topics.blocs.length} blocs, ${topics.treaties.length} traités, ${topics.conflicts.length} conflits, ${zones.length} zones de contrôle`,
  );

  const ctx: Ctx = {
    buildDate: today,
    buildYear: Number(today.slice(0, 4)),
    ...auto,
    curated,
    defaults,
    topics,
    entities: entities.filter((e) => e.kind !== 'faction'),
    resolved: new Map(),
    mapTotals: new Map(),
  };

  // Passe 1 : population, PIB, urbanisation (totaux de la carte).
  resolveBase(ctx);
  const num = (id: string, code: string): number => {
    const v = ctx.resolved.get(id)?.get(code)?.value;
    return typeof v === 'number' ? v : 0;
  };
  const totals = new Map<string, UnitTotals>();
  for (const e of ctx.entities) {
    totals.set(e.id, {
      population: num('demo.population', e.id),
      gdp: num('eco.gdp_nominal', e.id) * 1000,
      urbanShare: num('demo.urbanization', e.id) / 100,
    });
  }
  // Entités de facto comprises dans les statistiques d'un autre pays : on les en retire.
  for (const [code, meta] of Object.entries(topics.entities.meta)) {
    const child = totals.get(code);
    for (const [key, parentId] of [
      ['population', meta.includedIn?.population],
      ['gdp', meta.includedIn?.gdp],
    ] as const) {
      const parent = parentId ? totals.get(parentId) : undefined;
      if (child && parent) parent[key] = Math.max(0, parent[key] - child[key]);
    }
  }
  const ownStats = new Set(entities.filter((e) => e.kind === 'de_facto').map((e) => e.id));

  // Carte.
  const mapDir = join(BUILD_DIR, 'map');
  let meta: MapMeta;
  let geo: MapGeo;
  if (values['skip-map'] && existsSync(join(mapDir, `map-${resolution}.json`))) {
    log('Carte réutilisée (--skip-map)');
    meta = JSON.parse(await readFile(join(mapDir, `map-${resolution}.json`), 'utf8')) as MapMeta;
    geo = JSON.parse(await readFile(join(mapDir, `geo-${resolution}.json`), 'utf8')) as MapGeo;
  } else {
    const built = await buildMap({
      width: resolution,
      sourcePaths: paths,
      buildDir: BUILD_DIR,
      curatedDir: CURATED_DIR,
      modelConfigPath: MODEL_CONFIG_PATH,
      manifestPath: MANIFEST_PATH,
      log,
      extraEntities: extraEntityDefs(entitiesFile),
      zones,
      totals,
      ownStats,
    });
    meta = built.meta;
    geo = built.geo;
  }
  const routesFile = JSON.parse(
    await readFile(join(mapDir, `routes-${resolution}.json`), 'utf8'),
  ) as MapRoutes;
  const routes = new Map(routesFile.routes.map((r) => [`${r.a}>${r.b}`, r.primary.km]));

  // Passes 2 et 3 : toutes les entités, factions comprises (population et PIB depuis la carte).
  for (const e of meta.entities) {
    ctx.mapTotals.set(e.id, { population: e.stats.population, gdp: e.stats.economicValue / 1000 });
  }
  ctx.entities = entities;
  resolveBase(ctx);
  resolveAll(ctx);
  const mapRef = {
    source: `MAP:${meta.buildId}`,
    date: today,
    confidence: 'high' as const,
    method: 'map' as const,
  };
  const setMap = (id: string, code: string, value: unknown, note?: string): void => {
    let m = ctx.resolved.get(id);
    if (m === undefined) ctx.resolved.set(id, (m = new Map()));
    m.set(code, { ...mapRef, value: value as never, ...(note ? { note } : {}) });
  };
  for (const e of meta.entities) {
    setMap('geo.area_controlled', e.id, e.stats.areaKm2);
    setMap('geo.area_sovereign', e.id, e.stats.sovereignAreaKm2);
    setMap('geo.coastline', e.id, Math.round(e.stats.coastlineKm));
    setMap('geo.landlocked', e.id, e.stats.landlocked);
    setMap('geo.terrain_mix', e.id, {
      ...e.stats.terrainMix,
      ...Object.fromEntries(Object.entries(e.stats.biomeMix).map(([k, v]) => [`biome:${k}`, v])),
    });
    setMap(
      'geo.capital',
      e.id,
      { capital: e.capital?.pixel ?? -1, fallback: -1 },
      'capitale de repli : à désigner (phase 5)',
    );
    setMap(
      'geo.chokepoints',
      e.id,
      meta.chokepoints.filter((c) => c.riparians.includes(e.id)).map((c) => c.id),
    );
  }

  const runtimeParams = Object.entries(RULES)
    .filter(([, r]) => r.runtime)
    .map(([id]) => id);
  const countries = countriesBase(ctx, meta.buildId, runtimeParams);
  const pairs = pairsBase(ctx, geo, routes);
  const world = worldBase(ctx, meta, chokepoints, geoZones);
  await mkdir(BUILD_DIR, { recursive: true });
  await writeFile(join(BUILD_DIR, 'countries.base.json'), JSON.stringify(countries));
  await writeFile(join(BUILD_DIR, 'pairs.base.json'), JSON.stringify(pairs));
  await writeFile(join(BUILD_DIR, 'world.base.json'), JSON.stringify(world));
  log(
    `Données écrites : countries.base.json (${countries.entities.length} entités), pairs.base.json, world.base.json`,
  );

  const manifest = await readManifest(MANIFEST_PATH);
  const alerts = consistencyAlerts(ctx);
  const populationCheck = meta.entities.reduce((s, e) => s + e.stats.population, 0);
  await writeReport(join(BUILD_DIR, 'report.md'), ctx, {
    sources: manifest.sources.map((s) => ({ id: s.id, version: s.version, accessed: s.accessed })),
    alerts,
    zones: meta.controlZones.map((z) => ({ id: z.id, nameFr: z.nameFr, pixels: z.pixels })),
    mapChecks: [
      `Carte ${meta.width} × ${meta.height} (${meta.buildId}) : ${meta.entities.length} entités, ${meta.controlZones.length} zones de contrôle.`,
      `Population répartie sur les pixels : ${(populationCheck / 1e9).toFixed(3)} milliard(s) d'habitants (totaux nationaux conservés, contrôle bloquant).`,
      `Paramètres calculés depuis la carte : ${MAP_PARAMS.join(', ')}.`,
    ],
    pairs: Object.fromEntries(
      Object.entries(pairs.params).map(([id, p]) => [
        id,
        { entries: p.entries.length, default: p.default, defaultNote: p.defaultNote },
      ]),
    ),
    pairRuntime: pairs.runtimeParams,
  });
  log(`Rapport de couverture : data/build/report.md (${alerts.length} alerte(s))`);
  log('Terminé');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
