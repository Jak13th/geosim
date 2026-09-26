/**
 * Mise en forme des valeurs pour l'affichage (conventions françaises : virgule décimale,
 * espace fine insécable entre milliers, espace insécable avant l'unité).
 */
import { enumLabel, type ParamDef, type ParamValue } from '@geosim/shared';

const NBSP = '\u00a0';

const formatters = new Map<string, Intl.NumberFormat>();
function nf(maximumFractionDigits: number, minimumFractionDigits = 0): Intl.NumberFormat {
  const key = `${maximumFractionDigits}:${minimumFractionDigits}`;
  let f = formatters.get(key);
  if (f === undefined) {
    f = new Intl.NumberFormat('fr-FR', { maximumFractionDigits, minimumFractionDigits });
    formatters.set(key, f);
  }
  return f;
}

/** Nombre avec une précision adaptée à son ordre de grandeur (3 chiffres significatifs environ). */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 100) return nf(0).format(v);
  if (a >= 10) return nf(1).format(v);
  if (a >= 1) return nf(2).format(v);
  if (a >= 0.01) return nf(3).format(v);
  return v.toExponential(1).replace('.', ',');
}

const SCALES: readonly [number, string][] = [
  [1e12, 'billion'],
  [1e9, 'milliard'],
  [1e6, 'million'],
];

/** Grands effectifs en toutes lettres : « 68,7 millions », « 1,42 milliard ». */
export function formatCount(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  for (const [base, word] of SCALES) {
    if (a >= base) {
      const x = v / base;
      const plural = Math.abs(x) >= 2 ? 's' : '';
      return `${formatNumber(x)}${NBSP}${word}${plural}`;
    }
  }
  return nf(0).format(v);
}

/** Forme courte pour les légendes : 1,2 k ; 3,4 M ; 5,6 Md. */
export function formatShort(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `${formatNumber(v / 1e12)}${NBSP}T`;
  if (a >= 1e9) return `${formatNumber(v / 1e9)}${NBSP}Md`;
  if (a >= 1e6) return `${formatNumber(v / 1e6)}${NBSP}M`;
  if (a >= 1e4) return `${formatNumber(v / 1e3)}${NBSP}k`;
  return formatNumber(v);
}

const COUNT_UNITS = new Set(['habitants', 'personnes', 'ogives', 'missiles', 'unités-équivalent']);

/** Nombre suivi de son unité du catalogue. */
export function formatQuantity(v: number, unit: string): string {
  if (!Number.isFinite(v)) return '—';
  if (COUNT_UNITS.has(unit) && Math.abs(v) >= 1e6) {
    // « 68,7 millions d’habitants » : complément introduit par « de », élidé devant une voyelle.
    const de = /^[aeiouhéèêàâîôû]/i.test(unit) ? 'd’' : 'de ';
    return `${formatCount(v)} ${de}${unit}`;
  }
  const n = COUNT_UNITS.has(unit) ? nf(0).format(v) : formatNumber(v);
  if (unit === '' || unit === 'indice' || unit === 'entier') return n;
  if (unit === 'multiplicateur') return `×${NBSP}${n}`;
  return `${n}${NBSP}${unit}`;
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Date ISO (AAAA, AAAA-MM ou AAAA-MM-JJ) en toutes lettres, sans passer par `Date`. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = mo ? MONTHS[Number(mo) - 1] : undefined;
  if (!month) return y ?? iso;
  if (!d) return `${month} ${y}`;
  const day = Number(d);
  return `${day === 1 ? '1er' : day} ${month} ${y}`;
}

export interface ValueContext {
  /** Nom d'un élément de liste (entité, bloc, détroit…), ou null s'il n'est pas reconnu. */
  itemName(code: string): string | null;
}

/** Valeur d'un paramètre en texte court (les vecteurs sont détaillés ailleurs). */
export function formatValue(v: ParamValue, def: ParamDef | undefined, ctx: ValueContext): string {
  if (v === null) return '—';
  if (typeof v === 'number') return formatQuantity(v, def?.unit ?? '');
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'string') {
    if (def?.valueType === 'date') return formatDate(v);
    return def ? enumLabel(def.id, v) : v;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return 'Aucun';
    return v.map((item) => ctx.itemName(item) ?? item).join(', ');
  }
  const entries = Object.entries(v);
  if (entries.length === 0) return 'Aucun';
  return `${entries.length} composante${entries.length > 1 ? 's' : ''}`;
}

/** Année (ou date) de la donnée, affichée à côté de chaque valeur. */
export function formatDataDate(date: string): string {
  return /^\d{4}$/.test(date) ? date : formatDate(date);
}
