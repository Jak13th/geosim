/**
 * Libellés partagés par les panneaux : régions et catégories de revenu de la Banque mondiale,
 * natures d'entités.
 */
import type { EntityKind } from '@geosim/shared';

export const REGION_LABELS: Record<string, string> = {
  EAS: 'Asie de l’Est et Pacifique',
  ECS: 'Europe et Asie centrale',
  LCN: 'Amérique latine et Caraïbes',
  MEA: 'Moyen-Orient et Afrique du Nord',
  NAC: 'Amérique du Nord',
  SAS: 'Asie du Sud',
  SSF: 'Afrique subsaharienne',
};

export const INCOME_LABELS: Record<string, string> = {
  HIC: 'revenu élevé',
  UMC: 'revenu intermédiaire supérieur',
  LMC: 'revenu intermédiaire inférieur',
  LIC: 'faible revenu',
};

export const KIND_LABELS: Record<EntityKind, string> = {
  state: 'État',
  de_facto: 'Entité de facto',
  faction: 'Faction armée',
};
