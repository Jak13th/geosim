import type { CategoryId, ParamScope } from './types.ts';

export interface CategoryDef {
  id: CategoryId;
  /** Libellé de l'onglet de l'inspecteur. */
  label: string;
  /** Préfixe des identifiants de paramètres, tel que déclaré dans PARAMETRES.md (ex. `demo`). */
  prefix: string;
  scope: ParamScope;
}

/** Catégories, dans l'ordre des sections de PARAMETRES.md (§1 à §18). */
export const CATEGORIES: readonly CategoryDef[] = [
  { id: 'demographie', label: 'Démographie et société', prefix: 'demo', scope: 'country' },
  { id: 'economie', label: 'Économie et finances', prefix: 'eco', scope: 'country' },
  { id: 'budget', label: "Budget de l'État", prefix: 'bud', scope: 'country' },
  { id: 'commerce', label: 'Commerce et dépendances', prefix: 'trade', scope: 'country' },
  { id: 'energie', label: 'Énergie', prefix: 'energy', scope: 'country' },
  { id: 'ressources', label: 'Alimentation, eau et ressources', prefix: 'res', scope: 'country' },
  { id: 'forces', label: 'Forces armées', prefix: 'mil', scope: 'country' },
  {
    id: 'strategique',
    label: 'Nucléaire, missiles, cyber et espace',
    prefix: 'strat',
    scope: 'country',
  },
  { id: 'politique', label: 'Politique intérieure', prefix: 'pol', scope: 'country' },
  { id: 'diplomatie', label: 'Diplomatie et positionnement', prefix: 'dip', scope: 'country' },
  { id: 'technologie', label: 'Technologie et information', prefix: 'tech', scope: 'country' },
  { id: 'geographie', label: 'Géographie et infrastructures', prefix: 'geo', scope: 'country' },
  { id: 'risques', label: 'Santé, climat et risques', prefix: 'risk', scope: 'country' },
  { id: 'profil', label: 'Profil décisionnel (IA)', prefix: 'ai', scope: 'country' },
  { id: 'bilateral', label: 'Paramètres bilatéraux', prefix: 'pair', scope: 'pair' },
  { id: 'zone', label: 'Paramètres de zone', prefix: 'zone', scope: 'zone' },
  { id: 'monde', label: 'Paramètres mondiaux', prefix: 'world', scope: 'world' },
  { id: 'simulation', label: 'Simulation', prefix: 'sim', scope: 'sim' },
];

export function categoryByPrefix(prefix: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.prefix === prefix);
}
