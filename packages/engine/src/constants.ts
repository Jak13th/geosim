/**
 * Conventions des données (pas des coefficients de modèle) : unité monétaire et entité dont la
 * monnaie sert de numéraire.
 */

/**
 * Les grandeurs monétaires des sources (Banque mondiale, FMI) sont en dollars américains courants :
 * l'inflation simulée des États-Unis fait croître toutes les grandeurs en dollars (hypothèse de
 * taux de change réels constants). Sans cette entité, les dollars restent constants.
 */
export const NUMERAIRE = 'USA';
