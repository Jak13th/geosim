/**
 * Coefficients de modèle (`config/model.yaml`, SPEC §6.4) : chaque coefficient porte une valeur,
 * une plage, une unité et une description. Ce module valide la structure une fois le YAML
 * analysé (l'analyse elle-même est faite par l'appelant) et donne un accès typé par chemin.
 */

export interface ModelCoefficient {
  value: number;
  range: [number, number];
  unit: string;
  description: string;
}

/** Arbre de familles : `geo.terrain.hills_min_relief` → { geo: { terrain: { hills_min_relief: … } } }. */
export interface CoefficientTree {
  [key: string]: CoefficientTree | ModelCoefficient;
}

export function isCoefficient(node: unknown): node is ModelCoefficient {
  if (typeof node !== 'object' || node === null) return false;
  const c = node as Record<string, unknown>;
  return (
    typeof c.value === 'number' &&
    Array.isArray(c.range) &&
    c.range.length === 2 &&
    typeof c.range[0] === 'number' &&
    typeof c.range[1] === 'number' &&
    typeof c.unit === 'string' &&
    typeof c.description === 'string'
  );
}

/**
 * Parcourt l'arbre et renvoie la liste des erreurs de structure : nœud feuille mal formé,
 * valeur hors de sa plage, plage inversée, description vide.
 */
export function validateCoefficients(tree: unknown, path = ''): string[] {
  const errors: string[] = [];
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) {
    return [`${path || 'racine'} : famille attendue`];
  }
  for (const [key, node] of Object.entries(tree)) {
    const here = path ? `${path}.${key}` : key;
    if (typeof node === 'object' && node !== null && 'value' in node) {
      if (!isCoefficient(node)) {
        errors.push(`${here} : il faut value, range [min, max], unit et description`);
        continue;
      }
      const [min, max] = node.range;
      if (!Number.isFinite(node.value)) errors.push(`${here} : valeur non finie`);
      if (min > max) errors.push(`${here} : plage inversée [${min}, ${max}]`);
      if (node.value < min || node.value > max) {
        errors.push(`${here} : ${node.value} hors de la plage [${min}, ${max}]`);
      }
      if (node.description.trim() === '') errors.push(`${here} : description vide`);
    } else {
      errors.push(...validateCoefficients(node, here));
    }
  }
  return errors;
}

/** Valeur d'un coefficient par chemin pointé ; lève une erreur explicite s'il manque. */
export function coefficient(tree: CoefficientTree, path: string): number {
  let node: CoefficientTree | ModelCoefficient | undefined = tree;
  for (const key of path.split('.')) {
    if (node === undefined || isCoefficient(node)) break;
    node = node[key];
  }
  if (!isCoefficient(node)) throw new Error(`Coefficient absent de config/model.yaml : ${path}`);
  return node.value;
}
