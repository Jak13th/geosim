/**
 * Coefficients de modèle (`config/model.yaml`, SPEC §6.4) vus par le moteur : l'arbre analysé par
 * l'appelant (interface ou CLI) est validé, aplati par chemin pointé et lu par les systèmes à
 * chaque pas. Une modification (curseur de l'onglet Modèle, rechargement du fichier) passe par
 * une commande et s'applique au pas suivant.
 */
import {
  isCoefficient,
  validateCoefficients,
  type CoefficientTree,
  type ModelCoefficient,
} from '@geosim/shared';

/** Clés de premier niveau qui ne sont pas des familles de coefficients. */
const META_KEYS = new Set(['version']);

/** Retire les métadonnées (`version`) d'un arbre lu dans model.yaml. */
export function coefficientTree(raw: unknown): CoefficientTree {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('config/model.yaml : un objet est attendu à la racine');
  }
  const out: CoefficientTree = {};
  for (const [key, node] of Object.entries(raw as Record<string, unknown>)) {
    if (META_KEYS.has(key)) continue;
    out[key] = node as CoefficientTree;
  }
  return out;
}

function flatten(tree: CoefficientTree, prefix: string, out: Map<string, ModelCoefficient>): void {
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isCoefficient(node)) out.set(path, { ...node, range: [node.range[0], node.range[1]] });
    else flatten(node, path, out);
  }
}

/**
 * Erreurs d'un arbre de coefficients : structure (valeur, plage, unité, description) et
 * coefficients requis par les systèmes absents.
 */
export function checkModel(tree: CoefficientTree, required: readonly string[]): string[] {
  const errors = validateCoefficients(tree);
  const flat = new Map<string, ModelCoefficient>();
  flatten(tree, '', flat);
  for (const path of required) {
    if (!flat.has(path)) errors.push(`${path} : coefficient requis absent de config/model.yaml`);
  }
  return errors;
}

export class Model {
  private readonly coefs = new Map<string, ModelCoefficient>();

  constructor(tree: CoefficientTree, required: readonly string[] = []) {
    const errors = checkModel(tree, required);
    if (errors.length > 0) {
      throw new Error(`config/model.yaml invalide :\n  ${errors.slice(0, 20).join('\n  ')}`);
    }
    flatten(tree, '', this.coefs);
  }

  /** Valeur d'un coefficient ; lève une erreur explicite s'il manque. */
  get(path: string): number {
    const c = this.coefs.get(path);
    if (c === undefined) throw new Error(`Coefficient absent de config/model.yaml : ${path}`);
    return c.value;
  }

  has(path: string): boolean {
    return this.coefs.has(path);
  }

  definition(path: string): ModelCoefficient | undefined {
    return this.coefs.get(path);
  }

  /** Modifie un coefficient ; la valeur doit rester dans sa plage. Renvoie l'ancienne valeur. */
  set(path: string, value: number): number {
    const c = this.coefs.get(path);
    if (c === undefined) throw new Error(`Coefficient inconnu : ${path}`);
    if (!Number.isFinite(value)) throw new Error(`${path} : valeur non finie`);
    const [min, max] = c.range;
    if (value < min || value > max) {
      throw new Error(`${path} : ${value} hors de la plage [${min}, ${max}]`);
    }
    const previous = c.value;
    c.value = value;
    return previous;
  }

  /** Chemins de tous les coefficients, triés (ordre canonique du hash d'état). */
  paths(): string[] {
    return [...this.coefs.keys()].sort();
  }

  /** Arbre complet avec les valeurs courantes (captures, enregistrement du fichier). */
  tree(): CoefficientTree {
    const root: CoefficientTree = {};
    for (const [path, c] of this.coefs) {
      const keys = path.split('.');
      let node = root;
      for (const key of keys.slice(0, -1)) {
        const child = node[key];
        if (child === undefined || isCoefficient(child)) {
          const created: CoefficientTree = {};
          node[key] = created;
          node = created;
        } else node = child;
      }
      node[keys[keys.length - 1] as string] = { ...c, range: [c.range[0], c.range[1]] };
    }
    return root;
  }
}
