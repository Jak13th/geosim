/** Chemins du dépôt utilisés par le pipeline de données. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const RAW_DIR = resolve(REPO_ROOT, 'data/raw');
export const BUILD_DIR = resolve(REPO_ROOT, 'data/build');
export const CURATED_DIR = resolve(REPO_ROOT, 'data/curated');
export const MANIFEST_PATH = resolve(REPO_ROOT, 'data/manifest.json');
export const MODEL_CONFIG_PATH = resolve(REPO_ROOT, 'config/model.yaml');
