/**
 * Construction de la carte : grille Equal Earth, couches politiques (zones de contrôle comprises)
 * et physiques, éléments, population et valeur économique par pixel, zones maritimes,
 * voisinages, routes et détroits, puis export et validation.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  MapFlag,
  createLayers,
  encodeLand,
  encodeMap,
  isLand,
  type MapEntity,
  type MapGeo,
  type MapLayers,
  type MapMeta,
  type MapRoutes,
} from '@geosim/shared';
import { loadModelConfig, loadYaml } from '../config.ts';
import { readManifest, recordVersion } from '../download.ts';
import { loadNaturalEarth, str } from '../io/naturalEarth.ts';
import { encodePng } from '../io/png.ts';
import { readGeoTiff, type Raster } from '../io/tiff.ts';
import { readZip } from '../io/zip.ts';
import { SOURCES, type SourceKey } from '../sources.ts';
import { buildAdjacency } from './adjacency.ts';
import { buildDistances } from './distances.ts';
import {
  appendExtraEntities,
  buildEntities,
  parseCuratedUnits,
  type ExtraEntityDef,
} from './entities.ts';
import {
  buildCities,
  buildPorts,
  markAirports,
  markCoastAndBorders,
  markRivers,
  rasterizeInfrastructure,
  rasterizeUrban,
} from './features.ts';
import { globeMask, makeGrid, pixelLonLat } from './grid.ts';
import { labelPoints, makeTopology } from './gridops.ts';
import { buildPhysical } from './physical.ts';
import { rasterizePolitical } from './political.ts';
import {
  infrastructurePreview,
  politicalPreview,
  populationPreview,
  seaPreview,
  terrainPreview,
} from './preview.ts';
import { tracePolyline } from './raster.ts';
import { writeMapReport, type MapReportInput } from './report.ts';
import {
  buildAccess,
  buildRoutes,
  buildSeaNetwork,
  chokepointErrors,
  parseChokepoints,
} from './routing.ts';
import { distributePopulation, type UnitTotals } from './population.ts';
import { buildSeaZones } from './seaZones.ts';
import { entityStats } from './stats.ts';
import { validateMap } from './validate.ts';
import { applyControlZones, type ControlZone, type ZoneResult } from './zones.ts';

/**
 * Surface (en pixels) sous laquelle une zone de contrôle peut ne contenir aucun centre de pixel :
 * elle est alors seulement signalée (Jérusalem-Est, 70 km², tombe entre les centres à 4096 px).
 */
const ZONE_BELOW_RESOLUTION_PX = 2;

/** Tolérance de simplification des tracés de routes (pixels) : tracés pour l'affichage seulement. */
const ROUTE_SIMPLIFY_PX = 4;

export interface BuildMapOptions {
  width: number;
  sourcePaths: Map<string, string>;
  buildDir: string;
  curatedDir: string;
  modelConfigPath: string;
  manifestPath: string;
  log: (message: string) => void;
  /** Entités sans unité Natural Earth (entities.yaml). */
  extraEntities: readonly ExtraEntityDef[];
  /** Zones de contrôle (control_zones.geojson), appliquées dans l'ordre. */
  zones: readonly ControlZone[];
  /** Totaux statistiques par code d'entité (population, PIB, urbanisation). */
  totals: ReadonlyMap<string, UnitTotals>;
  /** Entités de facto dont les statistiques propres couvrent le territoire qu'elles contrôlent. */
  ownStats: ReadonlySet<string>;
}

export interface BuiltMap {
  meta: MapMeta;
  geo: MapGeo;
  zones: ZoneResult[];
}

export async function buildMap(options: BuildMapOptions): Promise<BuiltMap> {
  const { log } = options;
  const config = await loadModelConfig(options.modelConfigPath);
  const curated = parseCuratedUnits(await loadYaml(join(options.curatedDir, 'ne_units.yaml')));
  const chokepoints = parseChokepoints(
    await loadYaml(join(options.curatedDir, 'chokepoints.yaml')),
  );
  const pathOf = (key: SourceKey): string => {
    const path = options.sourcePaths.get(SOURCES[key].id);
    if (path === undefined) throw new Error(`Source manquante : ${key}`);
    return path;
  };
  const ne = async (key: SourceKey) => {
    const layer = await loadNaturalEarth(pathOf(key));
    if (layer.version) await recordVersion(options.manifestPath, SOURCES[key].id, layer.version);
    return layer.features;
  };

  // Grille.
  const grid = makeGrid(options.width);
  const topology = makeTopology(grid);
  const globe = globeMask(grid);
  log(
    `Grille ${grid.width} × ${grid.height}, pixel de ${grid.pixelAreaKm2.toFixed(1)} km² (${grid.pixelSideKm.toFixed(2)} km de côté)`,
  );

  // Couches politiques.
  const countries = await ne('countries');
  const table = buildEntities(countries, curated);
  appendExtraEntities(table, curated, options.extraEntities);
  const political = rasterizePolitical(grid, topology, countries, table);
  log(
    `${table.entities.length} entités, ${table.units.length} unités ; ${political.forced.length} pixels garantis (micro-États), ${political.overlaps} chevauchements`,
  );

  // Couches physiques.
  const elevation = await readTiff(pathOf('elevation'), (n) => n.endsWith('elev.tif'));
  const bioFiles = await readZip(pathOf('bioclim'), (n) => /_bio_(1|10|11|12|14)\.tif$/.test(n));
  const bio = async (k: number): Promise<Raster> => {
    const bytes = [...bioFiles].find(([name]) => name.endsWith(`_bio_${k}.tif`))?.[1];
    if (!bytes) throw new Error(`bio${k} absent de l'archive WorldClim`);
    return readGeoTiff(bytes);
  };
  const regions = await ne('regions');
  const physical = buildPhysical(
    grid,
    globe,
    political.unit,
    {
      lakes: await ne('lakes'),
      glaciers: await ne('glaciers'),
      wetlands: regions.filter((f) => ['Wetlands', 'Delta'].includes(str(f, 'FEATURECLA') ?? '')),
      elevation,
      climate: {
        bio1: await bio(1),
        bio10: await bio(10),
        bio11: await bio(11),
        bio12: await bio(12),
        bio14: await bio(14),
      },
    },
    config,
  );
  log(
    `Terrain et biomes ; sans altitude : ${physical.missingElevation} px, sans climat : ${physical.missingClimate} px`,
  );

  // Zones de contrôle et souveraineté de jure (control_zones.geojson).
  const zoneResults = applyControlZones(
    grid,
    physical.terrain,
    political.owner,
    political.sovereign,
    options.zones,
    table.entityIndex,
    await ne('disputed'),
    await ne('admin1'),
  );
  log(
    `Zones de contrôle : ${zoneResults.length} appliquées, ${zoneResults.reduce((s, z) => s + z.pixels, 0)} pixels modifiés`,
  );
  const belowResolution = zoneResults.filter(
    (z) => z.pixels === 0 && z.areaPx < ZONE_BELOW_RESOLUTION_PX,
  );
  if (belowResolution.length > 0) {
    log(
      `Zones sous la résolution de la carte : ${belowResolution.map((z) => `${z.id} (${z.areaPx.toFixed(2)} px)`).join(', ')}`,
    );
  }

  const layers: MapLayers = createLayers(grid.width, grid.height);
  layers.unit.set(political.unit);
  layers.owner.set(political.owner);
  layers.sovereign.set(political.sovereign);
  layers.terrain.set(physical.terrain);
  layers.biome.set(physical.biome);
  layers.elevation.set(physical.elevation);

  // Éléments.
  markCoastAndBorders(topology, layers.terrain, layers.owner, layers.flags);
  const riverPixels = markRivers(
    grid,
    layers.terrain,
    layers.flags,
    await ne('rivers'),
    config.get('geo.rivers.max_scalerank'),
  );
  layers.urban.set(
    rasterizeUrban(grid, layers.terrain, await ne('urban'), config.get('geo.urban.supersampling')),
  );
  layers.infrastructure.set(
    rasterizeInfrastructure(grid, layers.terrain, await ne('roads'), await ne('railroads')),
  );
  const airports = markAirports(
    grid,
    topology,
    layers.terrain,
    layers.owner,
    layers.flags,
    await ne('airports'),
  );
  const { cities, capitals, unplaced } = buildCities(
    grid,
    topology,
    layers.terrain,
    layers.owner,
    await ne('places'),
    table,
    curated,
    config.get('geo.cities.list_min_population'),
  );
  const majorMin = config.get('geo.cities.major_min_population');
  for (const city of cities) {
    if (city.population >= majorMin) {
      layers.flags[city.pixel] = (layers.flags[city.pixel] as number) | MapFlag.MajorCity;
    }
  }
  for (const capital of capitals) {
    layers.flags[capital.city.pixel] =
      (layers.flags[capital.city.pixel] as number) | MapFlag.Capital;
  }
  const { ports, dropped } = buildPorts(
    grid,
    topology,
    layers.terrain,
    layers.owner,
    layers.flags,
    await ne('ports'),
    config.get('geo.ports.snap_radius_km'),
  );
  log(
    `Fleuves : ${riverPixels} px ; aéroports : ${airports.length} ; villes : ${cities.length} ; capitales : ${capitals.length}/${table.entities.length} ; ports : ${ports.length} (${dropped.length} écartés)`,
  );

  // Population et valeur économique : chaque pixel relève de l'unité statistique qui le couvre.
  const ownStatsIndex = new Set(
    [...options.ownStats].map((id) => table.entityIndex.get(id)).filter((i) => i !== undefined),
  );
  const unitOf = new Uint16Array(grid.width * grid.height);
  for (let p = 0; p < unitOf.length; p++) {
    if (!isLand(layers.terrain[p] as number)) continue;
    const o = layers.owner[p] as number;
    unitOf[p] = ownStatsIndex.has(o) ? o : (layers.sovereign[p] as number);
  }
  const totalsByIndex = new Map<number, UnitTotals>();
  for (const [id, t] of options.totals) {
    const index = table.entityIndex.get(id);
    if (index !== undefined) totalsByIndex.set(index, t);
  }
  const people = distributePopulation({
    grid,
    terrain: layers.terrain,
    biome: layers.biome,
    urban: layers.urban,
    flags: layers.flags,
    unitOf,
    cities,
    totals: totalsByIndex,
    config,
  });
  let worldPopulation = 0;
  for (let p = 0; p < unitOf.length; p++) worldPopulation += people.population[p] as number;
  log(
    `Population répartie : ${(worldPopulation / 1e9).toFixed(3)} milliard(s) d'habitants ; écart maximal aux totaux ${(100 * people.maxRelativeError).toExponential(1)} %`,
  );

  // Zones maritimes et voisinages.
  const { seaZone, zones } = buildSeaZones(
    grid,
    topology,
    layers.terrain,
    globe,
    await ne('marine'),
    config.get('geo.sea_zones.min_area_km2'),
    config.get('geo.sea_zones.ocean_grid_deg'),
  );
  layers.seaZone.set(seaZone);
  const entityCount = table.entities.length;
  const adjacency = buildAdjacency(
    grid,
    topology,
    globe,
    layers.terrain,
    layers.owner,
    entityCount,
    config.get('geo.maritime.boundary_km'),
  );
  log(
    `${zones.length} zones maritimes ; ${adjacency.land.length} frontières terrestres, ${adjacency.maritime.length} voisinages maritimes`,
  );

  // Réseau maritime, détroits et routes.
  const cellKm = config.get('geo.routing.cell_km');
  const network = buildSeaNetwork(
    grid,
    topology,
    globe,
    layers.terrain,
    layers.flags,
    chokepoints,
    cellKm,
    {
      minLat: config.get('geo.routing.polar_min_lat'),
      costFactor: config.get('geo.routing.polar_cost_factor'),
    },
  );
  const capitalPixel = new Int32Array(entityCount + 1).fill(-1);
  for (const c of capitals) capitalPixel[c.entity] = c.city.pixel;
  const access = buildAccess(
    grid,
    topology,
    layers.terrain,
    layers.owner,
    network,
    ports,
    capitalPixel,
    entityCount,
  );
  const routes = buildRoutes(grid, network, access, chokepoints, ROUTE_SIMPLIFY_PX);
  log(
    `Graphe océanique : ${network.graph.nodeCount} nœuds ; ${routes.length} routes, dont ${routes.filter((r) => r.alternative).length} avec alternative`,
  );
  const ids = table.entities.map((e) => e.id);
  const distances = buildDistances(grid, topology, layers.terrain, capitals, ids, cellKm);

  // Statistiques et métadonnées.
  const stats = entityStats(
    grid,
    layers.terrain,
    layers.biome,
    layers.owner,
    layers.sovereign,
    adjacency.coastlineKm,
    access,
    ids,
    people.population,
    people.economicValue,
  );
  const labels = labelPoints(topology, layers.owner, entityCount);
  const lonLatOf = (p: number): [number, number] => {
    const j = Math.floor(p / grid.width);
    return pixelLonLat(grid, p - j * grid.width, j) ?? [0, 0];
  };
  const entities: MapEntity[] = table.entities.map((e) => {
    const capital = capitals.find((c) => c.entity === e.index);
    const lp = labels[e.index] as number;
    return {
      index: e.index,
      id: e.id,
      name: e.name,
      nameFr: e.nameFr,
      kind: e.kind,
      capital: capital ? { ...capital.city, rule: capital.rule } : null,
      label: lp >= 0 ? { pixel: lp, lon: lonLatOf(lp)[0], lat: lonLatOf(lp)[1] } : null,
      stats: stats[e.index - 1] as MapEntity['stats'],
      provenance: e.provenance,
    };
  });

  const buildId = hashLayers(layers);
  const manifest = await readManifest(options.manifestPath);
  const idOf = (index: number): string => ids[index - 1] ?? '';
  const meta: MapMeta = {
    version: 1,
    buildId,
    width: grid.width,
    height: grid.height,
    projection: grid.projectionSpec,
    pixelAreaKm2: grid.pixelAreaKm2,
    pixelSideKm: grid.pixelSideKm,
    sources: manifest.sources.map((s) => ({ id: s.id, version: s.version })),
    entities,
    units: table.units.map((u) => ({
      index: u.index,
      neA3: u.neA3,
      name: u.name,
      nameFr: u.nameFr,
      neType: u.neType,
      role: u.role,
      owner: u.owner,
      sovereign: u.sovereign,
      pixels: political.unitPixels[u.index] as number,
      note: u.note,
      provenance: u.provenance,
    })),
    seaZones: zones,
    chokepoints: chokepoints.map((c, k) => {
      const riparians = new Set<number>();
      for (const p of network.gatePixels[k] ?? []) {
        const o = adjacency.seaOwner[p] as number;
        if (o > 0) riparians.add(o);
      }
      for (const p of network.gateLand[k] ?? []) {
        const o = layers.owner[p] as number;
        if (o > 0) riparians.add(o);
      }
      const check = network.checks[k];
      return {
        id: c.id,
        name: c.name,
        nameFr: c.nameFr,
        kind: c.kind,
        riparians: [...riparians].map(idOf).sort(),
        testOpenKm: check?.openKm ?? null,
        testClosedKm: check?.closedKm ?? null,
        provenance: {
          source: c.source,
          date: c.date,
          confidence: c.confidence,
          ...(c.note ? { note: c.note } : {}),
        },
      };
    }),
    cities,
    ports,
    airports,
    controlZones: options.zones.map((z) => ({
      id: z.id,
      nameFr: z.nameFr,
      controller: z.controller,
      sovereign: z.sovereign,
      pixels: zoneResults.find((r) => r.id === z.id)?.pixels ?? 0,
      provenance: {
        source: z.source,
        date: z.date,
        confidence: z.confidence,
        ...(z.note ? { note: z.note } : {}),
      },
    })),
  };
  const geo: MapGeo = {
    version: 1,
    buildId,
    landBorders: adjacency.land.map((p) => ({ a: idOf(p.a), b: idOf(p.b), km: p.km })),
    maritimeBorders: adjacency.maritime.map((p) => ({ a: idOf(p.a), b: idOf(p.b), km: p.km })),
    distances,
  };
  const routesFile: MapRoutes = {
    version: 1,
    buildId,
    routes: routes.map((r) => ({ ...r, a: idOf(r.a), b: idOf(r.b) })),
  };

  // Validation : toute erreur arrête le pipeline.
  const errors = [
    ...chokepointErrors(network.checks),
    ...validateMap(grid, layers, table, political, capitals),
    ...zoneResults.flatMap((z) => [
      ...z.missing.map((m) => `zone ${z.id} : ${m} introuvable`),
      ...(z.pixels === 0 && z.areaPx >= ZONE_BELOW_RESOLUTION_PX
        ? [`zone ${z.id} : aucun pixel modifié`]
        : []),
    ]),
    ...people.unplaced.map((u) => `${ids[u - 1]} : population sans pixel`),
    ...(people.maxRelativeError > 1e-6
      ? [`population : écart aux totaux nationaux ${people.maxRelativeError}`]
      : []),
  ];

  // Export.
  const outDir = join(options.buildDir, 'map');
  await mkdir(outDir, { recursive: true });
  const tag = String(grid.width);
  const binary = encodeMap(
    {
      width: grid.width,
      height: grid.height,
      projection: grid.projectionSpec,
      pixelAreaKm2: grid.pixelAreaKm2,
      pixelSideKm: grid.pixelSideKm,
      buildId,
    },
    layers,
  );
  const gz = gzipSync(binary, { level: 6 });
  await writeFile(join(outDir, `map-${tag}.bin.gz`), gz);
  await writeFile(join(outDir, `map-${tag}.json`), JSON.stringify(meta));
  await writeFile(join(outDir, `geo-${tag}.json`), JSON.stringify(geo));
  await writeFile(join(outDir, `routes-${tag}.json`), JSON.stringify(routesFile));
  // Couches compactées sur les pixels terrestres (DECISIONS D7).
  let landCount = 0;
  for (let p = 0; p < layers.terrain.length; p++)
    if (isLand(layers.terrain[p] as number)) landCount++;
  const landPopulation = new Float32Array(landCount);
  const landEconomy = new Float32Array(landCount);
  for (let p = 0, k = 0; p < layers.terrain.length; p++) {
    if (!isLand(layers.terrain[p] as number)) continue;
    landPopulation[k] = people.population[p] as number;
    landEconomy[k] = people.economicValue[p] as number;
    k++;
  }
  await writeFile(
    join(outDir, `land-${tag}.bin.gz`),
    gzipSync(encodeLand(buildId, { population: landPopulation, economicValue: landEconomy }), {
      level: 6,
    }),
  );
  log(
    `Carte binaire : ${(binary.byteLength / 1e6).toFixed(1)} Mo, ${(gz.byteLength / 1e6).toFixed(1)} Mo compressée`,
  );

  const png = (name: string, rgb: Uint8Array) =>
    writeFile(join(outDir, `preview-${name}-${tag}.png`), encodePng(grid.width, grid.height, rgb));
  await png('political', politicalPreview(layers, globe));
  await png('terrain', terrainPreview(layers, globe));
  await png('infrastructure', infrastructurePreview(layers, globe));
  await png('population', populationPreview(layers, globe, people.population, grid.pixelAreaKm2));
  await png(
    'sea',
    seaPreview(layers, globe, routeSample(grid, routesFile, ['CHN', 'USA', 'DEU', 'BRA'])),
  );

  const reportInput: MapReportInput = {
    grid,
    globe,
    layers,
    table,
    political,
    physical,
    capitals,
    cities,
    ports,
    droppedPorts: dropped,
    unplaced,
    zones,
    adjacency,
    network,
    chokepoints,
    access,
    routes,
    stats,
    binaryBytes: binary.byteLength,
    gzBytes: gz.byteLength,
    errors,
  };
  await writeMapReport(join(outDir, `report-${tag}.md`), reportInput);
  log(`Aperçus PNG et rapport écrits dans data/build/map/`);

  if (errors.length > 0) {
    throw new Error(
      `Validation de la carte : ${errors.length} erreur(s)\n  ${errors.join('\n  ')}`,
    );
  }
  return { meta, geo, zones: zoneResults };
}

async function readTiff(zipPath: string, keep: (name: string) => boolean): Promise<Raster> {
  const files = await readZip(zipPath, keep);
  const [first] = files.values();
  if (!first) throw new Error(`Aucun GeoTIFF dans ${zipPath}`);
  return readGeoTiff(first);
}

/** Empreinte courte des couches : identifie un build dans les fichiers associés. */
function hashLayers(layers: MapLayers): string {
  const hash = createHash('sha256');
  for (const layer of Object.values(layers)) {
    hash.update(new Uint8Array(layer.buffer, layer.byteOffset, layer.byteLength));
  }
  return hash.digest('hex').slice(0, 16);
}

/** Pixels des routes principales (1) et alternatives (2) partant de quelques pays, pour l'aperçu. */
function routeSample(
  grid: ReturnType<typeof makeGrid>,
  file: MapRoutes,
  from: readonly string[],
): Uint8Array {
  const out = new Uint8Array(grid.width * grid.height);
  for (const route of file.routes) {
    if (!from.includes(route.a) && !from.includes(route.b)) continue;
    if (route.alternative) tracePolyline(grid, route.alternative.path, (p) => void (out[p] ||= 2));
    tracePolyline(grid, route.primary.path, (p) => void (out[p] = 1));
  }
  return out;
}
