/**
 * Relations financières partagées par l'économie et le budget (SPEC §8.2) : ancrage des
 * anticipations d'inflation, prime de risque selon la notation, probabilité de défaut.
 */
import type { Model } from '../model.ts';

export const FINANCE = {
  anchorBase: 'economy.inflation.anchor_base',
  anchorCb: 'economy.inflation.anchor_central_bank',
  spreadAaa: 'economy.rates.spread_aaa',
  spreadSlope: 'economy.rates.spread_per_notch',
  pdBbb: 'economy.default.probability_bbb',
  pdSlope: 'economy.default.probability_per_notch',
  pdMax: 'economy.default.probability_max',
} as const;

/** Notation maximale (AAA) et notation de référence de la probabilité de défaut (BBB). */
export const RATING_MAX = 20;
export const RATING_BBB = 12;

/**
 * Poids de la cible dans les anticipations d'inflation : croît avec l'indépendance de la banque
 * centrale (0–1).
 */
export function anchorWeight(model: Model, cbIndependence: number): number {
  const cbi = Math.min(1, Math.max(0, cbIndependence));
  return Math.min(
    1,
    Math.max(0, model.get(FINANCE.anchorBase) + model.get(FINANCE.anchorCb) * cbi),
  );
}

/** Inflation anticipée : moyenne pondérée de la cible et de l'inflation courante. */
export function expectedInflation(
  model: Model,
  cbIndependence: number,
  target: number,
  inflation: number,
): number {
  const a = anchorWeight(model, cbIndependence);
  return a * target + (1 - a) * inflation;
}

/**
 * Prime de risque souveraine (points de %) : croît exponentiellement quand la notation baisse,
 * maximale en défaut (notation 0).
 */
export function spreadOf(model: Model, rating: number, inDefault: boolean): number {
  const r = inDefault ? 0 : Math.min(RATING_MAX, Math.max(0, rating));
  return model.get(FINANCE.spreadAaa) * Math.exp(model.get(FINANCE.spreadSlope) * (RATING_MAX - r));
}

/**
 * Probabilité annuelle de défaut (%) selon la notation : valeur de référence pour BBB, multipliée
 * par un facteur constant à chaque cran perdu (fréquences historiques de défaut des souverains).
 */
export function defaultProbability(model: Model, rating: number): number {
  const r = Math.min(RATING_MAX, Math.max(0, rating));
  const pd = model.get(FINANCE.pdBbb) * Math.exp(model.get(FINANCE.pdSlope) * (RATING_BBB - r));
  return Math.min(model.get(FINANCE.pdMax), pd);
}
