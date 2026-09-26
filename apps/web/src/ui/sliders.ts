/**
 * Curseurs générés depuis le catalogue : plage (bornes du paramètre), échelle linéaire ou
 * logarithmique, pas et arrondi des valeurs saisies (journal lisible).
 */
import type { ParamDef } from '@geosim/shared';

/** Positions du curseur (entiers de 0 à `SLIDER_STEPS`). */
export const SLIDER_STEPS = 1000;

export interface SliderScale {
  min: number;
  max: number;
  log: boolean;
  /** Position (0–SLIDER_STEPS) d'une valeur. */
  toPos(x: number): number;
  /** Valeur d'une position, arrondie pour la saisie. */
  fromPos(t: number): number;
}

/** Arrondi à `digits` chiffres significatifs. */
export function roundSig(x: number, digits = 4): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const scale = 10 ** (digits - 1 - Math.floor(Math.log10(Math.abs(x))));
  return Math.round(x * scale) / scale;
}

/** Valeur saisie arrondie au pas du catalogue, ou à 4 chiffres significatifs, puis bornée. */
export function roundValue(def: ParamDef, x: number): number {
  let y =
    def.step !== undefined && def.step > 0 ? Math.round(x / def.step) * def.step : roundSig(x);
  // Corrige les artefacts binaires (0,30000000000000004).
  y = Number(y.toPrecision(12));
  if (def.min !== undefined) y = Math.max(def.min, y);
  if (def.max !== undefined) y = Math.min(def.max, y);
  return y;
}

/**
 * Échelle du curseur d'un paramètre numérique : bornes du catalogue ; à défaut, une plage autour
 * de la valeur de départ. Échelle logarithmique si le catalogue la demande (population, PIB…).
 */
export function sliderScale(def: ParamDef, reference: number | null): SliderScale {
  const ref = reference !== null && Number.isFinite(reference) ? Math.abs(reference) : 1;
  const min = def.min ?? (reference !== null && reference < 0 ? -4 * ref : 0);
  const max = def.max ?? Math.max(4 * ref, min + 1);
  if (def.scale === 'log' && max > 0) {
    // Borne basse strictement positive : un millionième du maximum au plus bas.
    const lo = Math.max(min, max / 1e6);
    const span = Math.log(max / lo);
    return {
      min,
      max,
      log: true,
      toPos: (x) =>
        x <= lo ? 0 : Math.round((SLIDER_STEPS * Math.log(Math.min(x, max) / lo)) / span),
      fromPos: (t) => roundValue(def, t <= 0 ? min : lo * Math.exp((span * t) / SLIDER_STEPS)),
    };
  }
  return {
    min,
    max,
    log: false,
    toPos: (x) =>
      Math.round((SLIDER_STEPS * (Math.min(max, Math.max(min, x)) - min)) / (max - min || 1)),
    fromPos: (t) => roundValue(def, min + ((max - min) * t) / SLIDER_STEPS),
  };
}

/** Lecture d'un nombre saisi au clavier (virgule décimale acceptée) ; null si illisible. */
export function parseNumber(text: string): number | null {
  const clean = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (clean === '' || clean === '-' || clean === '.') return null;
  const x = Number(clean);
  return Number.isFinite(x) ? x : null;
}
