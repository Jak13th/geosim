/**
 * Coefficients de modèle (`config/model.yaml`, SPEC §6.4) servis à l'interface :
 * - `GET /api/model` : arbre des coefficients, validé comme le fera le moteur ;
 * - `PUT /api/model` : enregistre des valeurs modifiées dans l'onglet « Modèle ». Le document YAML
 *   est modifié en place (commentaires, ordre et guillemets conservés), puis mis en forme par
 *   Prettier comme le reste du dépôt ; seules les lignes `value:` concernées changent.
 * Le serveur de développement surveille le fichier et prévient l'interface à chaque changement
 * (rechargement à chaud, `apiPlugin.ts`).
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_COEFFICIENTS, checkModel, coefficientTree } from '@geosim/engine';
import { isCoefficient, type CoefficientTree } from '@geosim/shared';
import { isMap, parseDocument } from 'yaml';
import { MODEL_API, type CoefficientChange, type ModelFileState } from '../src/api/contract.ts';
import { HttpError, checkWrite, readBody, sendError, sendJson } from './http.ts';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
export const MODEL_PATH = resolve(REPO_ROOT, 'config/model.yaml');

/** Arbre et erreurs d'un texte de model.yaml (syntaxe YAML, structure, coefficients requis). */
export function parseModelText(text: string): {
  tree: CoefficientTree | null;
  errors: string[];
} {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    return { tree: null, errors: doc.errors.map((e) => e.message.split('\n')[0] ?? e.message) };
  }
  let tree: CoefficientTree;
  try {
    tree = coefficientTree(doc.toJS());
  } catch (e) {
    return { tree: null, errors: [e instanceof Error ? e.message : String(e)] };
  }
  const errors = checkModel(tree, REQUIRED_COEFFICIENTS);
  return { tree: errors.length > 0 ? null : tree, errors };
}

export async function readModelFile(path: string = MODEL_PATH): Promise<ModelFileState> {
  const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
  return {
    path: relative(REPO_ROOT, path),
    ...parseModelText(text),
    mtime: info.mtimeMs,
  };
}

/**
 * Nouvelles valeurs de coefficients appliquées au texte de model.yaml : chaque chemin doit
 * désigner un coefficient existant et la valeur rester dans sa plage. Le reste du document est
 * conservé tel quel.
 */
export function applyCoefficientChanges(
  text: string,
  changes: readonly CoefficientChange[],
): string {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    throw new HttpError(409, `config/model.yaml illisible : ${doc.errors[0]?.message ?? ''}`);
  }
  for (const { path, value } of changes) {
    const keys = path.split('.');
    const node: unknown = doc.getIn(keys, true);
    const plain: unknown = isMap(node) ? node.toJSON() : null;
    if (!isCoefficient(plain)) throw new HttpError(400, `${path} : coefficient inconnu`);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new HttpError(400, `${path} : nombre attendu`);
    }
    const [min, max] = plain.range;
    if (value < min || value > max) {
      throw new HttpError(400, `${path} : ${value} hors de la plage [${min}, ${max}]`);
    }
    doc.setIn([...keys, 'value'], value);
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** Mise en forme Prettier avec la configuration du dépôt (chargée à la demande). */
export async function formatYaml(text: string): Promise<string> {
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(MODEL_PATH)) ?? {};
  return prettier.format(text, { ...config, parser: 'yaml', filepath: MODEL_PATH });
}

/** Enregistre des valeurs dans model.yaml ; un résultat invalide n'est jamais écrit. */
export async function saveCoefficients(
  changes: readonly CoefficientChange[],
  path: string = MODEL_PATH,
): Promise<ModelFileState> {
  const text = await readFile(path, 'utf8');
  const next = await formatYaml(applyCoefficientChanges(text, changes));
  const parsed = parseModelText(next);
  if (parsed.errors.length > 0) {
    throw new HttpError(422, `Enregistrement refusé : ${parsed.errors.slice(0, 3).join(' ; ')}`);
  }
  if (next !== text) await writeFile(path, next, 'utf8');
  return readModelFile(path);
}

function parseChanges(body: string): CoefficientChange[] {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Corps JSON invalide');
  }
  const changes = (raw as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(changes)) throw new HttpError(400, 'Liste « changes » attendue');
  return changes.map((c: unknown) => {
    const o = c as Partial<CoefficientChange> | null;
    if (typeof o?.path !== 'string' || typeof o.value !== 'number') {
      throw new HttpError(400, 'Chaque changement porte un chemin et une valeur numérique');
    }
    return { path: o.path, value: o.value };
  });
}

/** Middleware Connect : `GET` et `PUT` sur `/api/model`. */
export function modelMiddleware(path: string = MODEL_PATH) {
  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== MODEL_API) {
      next();
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      readModelFile(path).then(
        (state) => sendJson(res, 200, state),
        (e: unknown) => sendError(res, e),
      );
      return;
    }
    if (req.method === 'PUT') {
      (async () => {
        checkWrite(req);
        const changes = parseChanges(await readBody(req, 1 << 20));
        sendJson(res, 200, await saveCoefficients(changes, path));
      })().catch((e: unknown) => sendError(res, e));
      return;
    }
    sendJson(res, 405, { error: 'Méthode non autorisée' });
  };
}
