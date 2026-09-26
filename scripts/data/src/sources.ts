/**
 * Sources téléchargées par le pipeline (SPEC §4.2). URL, licences et versions vérifiées
 * le 2026-09-25 ; la version exacte de chaque archive est relue à l'extraction et consignée
 * dans data/manifest.json.
 */

export interface SourceDef {
  /** Identifiant stable, utilisé comme nom de fichier dans data/raw. */
  id: string;
  url: string;
  provider: string;
  description: string;
  license: string;
  licenseUrl: string;
  /** Version annoncée ; pour Natural Earth, relue dans le fichier VERSION.txt de l'archive. */
  version: string;
  /** Extension du fichier en cache, quand l'URL n'en porte pas (API). */
  ext?: string;
}

const NE_BASE = 'https://naciscdn.org/naturalearth/10m';
const NE_LICENSE = {
  provider: 'Natural Earth',
  license: 'Domaine public',
  licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  version: '5.1.1',
};

function naturalEarth(
  theme: 'cultural' | 'physical',
  name: string,
  description: string,
): SourceDef {
  return {
    id: `ne_10m_${name}`,
    url: `${NE_BASE}/${theme}/ne_10m_${name}.zip`,
    description,
    ...NE_LICENSE,
  };
}

const WORLDCLIM = {
  provider: 'WorldClim 2.1 (Fick et Hijmans, 2017)',
  license: 'Usage académique et non commercial libre ; redistribution interdite sans autorisation',
  licenseUrl: 'https://www.worldclim.org/about.html',
  version: '2.1',
};

export const SOURCES = {
  countries: naturalEarth(
    'cultural',
    'admin_0_countries_lakes',
    'Pays et territoires (admin 0, vue de facto), grands lacs découpés',
  ),
  places: naturalEarth('cultural', 'populated_places', 'Villes et capitales, avec population'),
  ports: naturalEarth('cultural', 'ports', 'Ports'),
  airports: naturalEarth('cultural', 'airports', 'Aéroports'),
  roads: naturalEarth('cultural', 'roads', 'Routes'),
  railroads: naturalEarth('cultural', 'railroads', 'Voies ferrées'),
  urban: naturalEarth('cultural', 'urban_areas', 'Zones urbaines (MODIS 2002-2003)'),
  rivers: naturalEarth('physical', 'rivers_lake_centerlines', 'Fleuves et axes des lacs'),
  lakes: naturalEarth('physical', 'lakes', 'Lacs et réservoirs'),
  glaciers: naturalEarth('physical', 'glaciated_areas', 'Glaciers et calottes'),
  marine: naturalEarth(
    'physical',
    'geography_marine_polys',
    'Océans, mers, golfes et détroits nommés',
  ),
  regions: naturalEarth(
    'physical',
    'geography_regions_polys',
    'Régions physiques nommées (zones humides, deltas)',
  ),
  admin1: naturalEarth(
    'cultural',
    'admin_1_states_provinces',
    'Subdivisions de premier niveau (régions, provinces), pour les zones de contrôle',
  ),
  disputed: naturalEarth(
    'cultural',
    'admin_0_disputed_areas',
    'Zones disputées et entités séparatistes (souveraineté de jure, revendications)',
  ),
  elevation: {
    id: 'wc2.1_5m_elev',
    url: 'https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_5m_elev.zip',
    description: 'Altitude, résolution 5 minutes d’arc',
    ...WORLDCLIM,
  },
  bioclim: {
    id: 'wc2.1_5m_bio',
    url: 'https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_5m_bio.zip',
    description:
      'Variables bioclimatiques 1970-2000, 5 minutes d’arc (bio1, bio10, bio11, bio12, bio14)',
    ...WORLDCLIM,
  },
} as const satisfies Record<string, SourceDef>;

export type SourceKey = keyof typeof SOURCES;
