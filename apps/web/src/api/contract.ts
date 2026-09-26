/**
 * Contrat de l'API locale du modèle et des captures (`/api/model`, `/api/captures`), partagé par
 * le serveur (plugin Vite) et l'interface. Types et constantes seuls : ce fichier est lu avec et
 * sans les types de Node.
 */
import type { CoefficientTree } from '@geosim/shared';

export const MODEL_API = '/api/model';
export const CAPTURES_API = '/api/captures';

/**
 * En-tête obligatoire des requêtes qui écrivent sur le disque : une page d'un autre site ne peut
 * pas l'ajouter sans autorisation CORS, que le serveur local n'accorde pas.
 */
export const CLIENT_HEADER = 'x-geosim-client';

/** Événement HMR envoyé quand config/model.yaml change sur le disque. */
export const MODEL_EVENT = 'geosim:model';

/** État du fichier config/model.yaml. */
export interface ModelFileState {
  /** Chemin affiché (relatif à la racine du dépôt). */
  path: string;
  /** Arbre des coefficients (familles, sans les métadonnées), ou null si le fichier est invalide. */
  tree: CoefficientTree | null;
  /** Erreurs de syntaxe ou de structure (valeur hors plage, coefficient requis absent…). */
  errors: string[];
  /** Date de dernière modification (ms depuis l'époque Unix). */
  mtime: number;
}

export interface CoefficientChange {
  path: string;
  value: number;
}

/** Capture enregistrée dans `captures/`. */
export interface CaptureFileInfo {
  /** Nom sans extension. */
  name: string;
  size: number;
  mtime: number;
  /** Tick et date de départ lus dans l'en-tête de la capture (null s'ils manquent). */
  tick: number | null;
  startDate: string | null;
  dataId: string | null;
  label: string | null;
}

/** Caractères autorisés dans un nom de capture (pas de chemin, pas de caractère spécial). */
export const CAPTURE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,79}$/u;

export function isCaptureName(name: string): boolean {
  return CAPTURE_NAME.test(name) && !name.includes('..') && !name.endsWith('.');
}
