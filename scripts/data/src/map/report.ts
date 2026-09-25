/** Rapport de construction de la carte (data/build/map/report-<résolution>.md). */
import { writeFile } from 'node:fs/promises';
import { Terrain, isLand, type EntityGeoStats, type MapLayers } from '@geosim/shared';
import type { Adjacency } from './adjacency.ts';
import type { EntityTable } from './entities.ts';
import type { Capital, City, Port } from './features.ts';
import type { Grid } from './grid.ts';
import type { PhysicalLayers } from './physical.ts';
import type { PoliticalLayers } from './political.ts';
import type { Access, ChokepointDef, Route, SeaNetwork } from './routing.ts';
import type { SeaZone } from './seaZones.ts';
import { areaErrors } from './validate.ts';

export interface MapReportInput {
  grid: Grid;
  globe: Uint8Array;
  layers: MapLayers;
  table: EntityTable;
  political: PoliticalLayers;
  physical: PhysicalLayers;
  capitals: readonly Capital[];
  cities: readonly City[];
  ports: readonly Port[];
  droppedPorts: readonly string[];
  unplaced: readonly string[];
  zones: readonly SeaZone[];
  adjacency: Adjacency;
  network: SeaNetwork;
  chokepoints: readonly ChokepointDef[];
  access: readonly Access[];
  routes: readonly Route[];
  stats: readonly EntityGeoStats[];
  binaryBytes: number;
  gzBytes: number;
  errors: readonly string[];
}

const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(1)} Mo`;

export async function writeMapReport(path: string, r: MapReportInput): Promise<void> {
  const { grid, layers, table } = r;
  const n = grid.width * grid.height;
  let land = 0;
  let sea = 0;
  let lake = 0;
  let neutral = 0;
  let seaNoZone = 0;
  let onGlobe = 0;
  for (let p = 0; p < n; p++) {
    if (!r.globe[p]) continue;
    onGlobe++;
    const t = layers.terrain[p] as number;
    if (isLand(t)) {
      land++;
      if (layers.owner[p] === 0) neutral++;
    } else if (t === Terrain.Sea) {
      sea++;
      if (layers.seaZone[p] === 0) seaNoZone++;
    } else if (t === Terrain.Lake) lake++;
  }
  const id = (e: number): string => table.entities[e - 1]?.id ?? '?';
  const lines: string[] = [];
  const push = (...l: string[]): void => void lines.push(...l);

  push(
    `# Rapport de la carte ${grid.width} × ${grid.height}`,
    '',
    r.errors.length === 0
      ? '**Validation : aucune erreur.**'
      : `**Validation : ${r.errors.length} erreur(s).**`,
    ...r.errors.map((e) => `- ${e}`),
    '',
    '## Grille',
    '',
    `- Projection Equal Earth, pixel de ${grid.pixelAreaKm2.toFixed(2)} km² (côté équivalent ${grid.pixelSideKm.toFixed(2)} km).`,
    `- Pixels : ${n.toLocaleString('fr-FR')}, dont ${onGlobe.toLocaleString('fr-FR')} sur le globe ; terre ${land.toLocaleString('fr-FR')} (dont ${neutral.toLocaleString('fr-FR')} neutres, Antarctique compris) ; mer ${sea.toLocaleString('fr-FR')} ; lacs ${lake.toLocaleString('fr-FR')}.`,
    `- Carte binaire : ${mb(r.binaryBytes)}, ${mb(r.gzBytes)} compressée.`,
    '',
    '### Mémoire par état de simulation (mesure pour DECISIONS D7)',
    '',
    '| Stockage | Octets/pixel | Grille pleine | Pixels terrestres seuls |',
    '| --- | --- | --- | --- |',
    `| owner + sovereign + flags (dynamiques, lus par le rendu) | 6 | ${mb(6 * n)} | — |`,
    `| population, valeur économique (Float32) | 8 | ${mb(8 * n)} | ${mb(8 * land)} |`,
    `| fortification, dommages, retombées (Uint8) | 3 | ${mb(3 * n)} | ${mb(3 * land)} |`,
    `| Total | | ${mb(17 * n)} | ${mb(6 * n + 11 * land)} |`,
    '',
    'Les couches statiques (terrain, biome, altitude, urbain, infrastructures, unité, zone maritime) sont partagées entre états, branches et runs.',
    '',
    '## Entités et unités',
    '',
    `- ${table.entities.length} entités : ${table.entities.filter((e) => e.kind === 'state').length} États, ${table.entities.filter((e) => e.kind === 'de_facto').length} entités de facto (${table.entities
      .filter((e) => e.kind === 'de_facto')
      .map((e) => e.id)
      .join(', ')}).`,
    `- ${table.units.length} unités Natural Earth : ${table.units.filter((u) => u.role === 'dependency').length} rattachées à leur État souverain, ${table.units.filter((u) => u.role === 'special').length} particulières.`,
    `- Chevauchements entre unités : ${r.political.overlaps} pixel(s).`,
    `- Pixels garantis (micro-États et petits territoires) : ${r.political.forced.length} — ${r.political.forced.map((f) => `${table.units[f.unit - 1]?.neA3}${f.takenFrom ? ` (pris à ${table.units[f.takenFrom - 1]?.neA3})` : ''}`).join(', ')}.`,
    '',
    '### Surfaces rasterisées',
    '',
    `Écart entre le nombre de pixels et la surface exacte des polygones projetés (unités d'au moins 1 000 pixels ; tolérance 2 %). Les 10 plus grands écarts :`,
    '',
    '| Unité | Pixels exacts | Pixels | Écart |',
    '| --- | --- | --- | --- |',
    ...areaErrors(table, r.political)
      .slice(0, 10)
      .map(
        (a) =>
          `| ${a.neA3} | ${a.exact.toFixed(0)} | ${a.raster} | ${(100 * a.error).toFixed(2)} % |`,
      ),
    '',
    '### Capitales',
    '',
    `- ${r.capitals.length} capitales pour ${table.entities.length} entités.`,
    `- Fichier curé : ${
      r.capitals
        .filter((c) => c.rule === 'curated')
        .map((c) => `${id(c.entity)} (${c.city.name})`)
        .join(', ') || 'aucune'
    }.`,
    `- Repli « plus grande ville » : ${
      r.capitals
        .filter((c) => c.rule === 'largest_city')
        .map((c) => `${id(c.entity)} (${c.city.name})`)
        .join(', ') || 'aucun'
    }.`,
    '',
    '## Couches physiques et éléments',
    '',
    `- Pixels terrestres sans altitude WorldClim à proximité (altitude 0) : ${r.physical.missingElevation}.`,
    `- Pixels terrestres sans climat à proximité (biome déduit de la latitude) : ${r.physical.missingClimate}.`,
    `- Villes exportées : ${r.cities.length} ; non placées : ${r.unplaced.length}${r.unplaced.length ? ` (${r.unplaced.slice(0, 20).join(', ')}${r.unplaced.length > 20 ? '…' : ''})` : ''}.`,
    `- Ports : ${r.ports.length} rattachés, ${r.droppedPorts.length} écartés (pas de côte à portée${r.droppedPorts.length ? ` : ${r.droppedPorts.slice(0, 30).join(', ')}${r.droppedPorts.length > 30 ? '…' : ''}` : ''}).`,
    '',
    '## Zones maritimes et voisinages',
    '',
    `- ${r.zones.length} zones maritimes ; pixels de mer sans zone : ${seaNoZone}.`,
    `- ${r.adjacency.land.length} frontières terrestres, ${r.adjacency.maritime.length} voisinages maritimes.`,
    '',
    '## Routes maritimes et détroits',
    '',
    `- Graphe océanique : ${r.network.graph.nodeCount.toLocaleString('fr-FR')} nœuds.`,
    `- ${r.routes.length} routes ; ${r.routes.filter((x) => x.primary.straits.length > 0).length} franchissent au moins un détroit ; ${r.routes.filter((x) => x.alternative).length} ont une alternative ; ${r.routes.filter((x) => x.noAlternative).length} n'en ont aucune (ex. golfe Persique, mer Noire).`,
    '',
    '| Détroit | Pixels de porte | Chenal forcé (px) | Route de test ouverte | Fermée |',
    '| --- | --- | --- | --- | --- |',
    ...r.network.checks.map(
      (c) =>
        `| ${c.id} | ${c.gatePixels} | ${c.carvedPixels} | ${c.openKm ?? '—'} km${c.traversesGate ? '' : ' (hors porte)'} | ${c.closedKm === null ? 'inaccessible' : `${c.closedKm} km`} |`,
    ),
    '',
    '### Accès à la mer',
    '',
    `- Par des ports Natural Earth : ${r.access.filter((a) => a.kind === 'ports').length} ; par la côte la plus proche de la capitale : ${
      r.access
        .filter((a) => a.kind === 'coast')
        .map((a) => id(a.entity))
        .join(', ') || 'aucun'
    }.`,
    `- Par voie de terre (sans façade sur l'océan mondial) : ${r.access
      .filter((a) => a.kind === 'overland')
      .map((a) => `${id(a.entity)}${a.transit ? ` via ${id(a.transit)}` : ''}`)
      .join(', ')}.`,
    `- Sans accès : ${
      r.access
        .filter((a) => a.kind === 'none')
        .map((a) => id(a.entity))
        .join(', ') || 'aucun'
    }.`,
    '',
  );
  await writeFile(path, `${lines.join('\n')}\n`);
}
