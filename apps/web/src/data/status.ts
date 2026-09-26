/**
 * Contrat de l'API locale de données (`/api/data/*`), partagé par le serveur (plugin Vite) et
 * l'interface. Types seuls : ce fichier est lu à la fois avec et sans les types de Node.
 */

export interface MapBuildInfo {
  /** Largeur de la carte en pixels (préréglages : 2048, 4096, 8192). */
  resolution: number;
  buildId: string;
  /** Fichiers présents pour cette résolution. */
  files: { map: boolean; meta: boolean; land: boolean; geo: boolean; routes: boolean };
}

export interface DataStatus {
  /** Toutes les données nécessaires à la carte interactive sont présentes et cohérentes. */
  ready: boolean;
  /** Date du build des données pays, si présentes. */
  buildDate: string | null;
  /** Identifiant de la carte sur laquelle les données pays ont été construites. */
  mapBuildId: string | null;
  /** Résolution de carte retenue (celle des données pays), si disponible. */
  resolution: number | null;
  maps: MapBuildInfo[];
  /** Explication en français quand `ready` est faux (fichier manquant, builds incohérents…). */
  problem: string | null;
}

/** Préfixe des fichiers servis : `/api/data/files/<nom>`. */
export const DATA_FILES_PREFIX = '/api/data/files/';
export const DATA_STATUS_PATH = '/api/data/status';
