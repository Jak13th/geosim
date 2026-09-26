/**
 * Présentation de la provenance des valeurs : nom lisible de la source, année, confiance.
 */
import type { Confidence } from '@geosim/shared';

const SOURCE_NAMES: Readonly<Record<string, string>> = {
  WB: 'Banque mondiale',
  WGI: 'Banque mondiale (WGI)',
  IMF: 'FMI',
  OWID: 'Our World in Data',
  FAO: 'FAOSTAT',
  UNHCR: 'HCR',
  UNDP: 'PNUD',
  UNGA: 'Votes à l’AGNU',
  BACI: 'CEPII BACI',
  USGS: 'USGS',
  CUR: 'Donnée curée',
  HYP: 'Hypothèse',
  DER: 'Calcul',
  MAP: 'Carte',
  MED: 'Médiane régionale',
  ZERO: 'Absence documentée',
  NA: 'Sans objet',
};

/** Préfixe d'une référence de source (`WB:SP.POP.TOTL` → `WB`). */
export function sourcePrefix(source: string): string {
  return /^[A-Z]+/.exec(source)?.[0] ?? source;
}

/** Nom court de la source, pour les badges. */
export function sourceName(source: string): string {
  return SOURCE_NAMES[sourcePrefix(source)] ?? source;
}

/** Année d'une date de donnée (`2026-09-25` → `2026`). */
export function dataYear(date: string): string {
  return /^\d{4}/.exec(date)?.[0] ?? date;
}

export const CONFIDENCE_CLASS: Readonly<Record<Confidence, string>> = {
  high: 'conf-high',
  medium: 'conf-medium',
  low: 'conf-low',
  assumption: 'conf-assumption',
};

/** Découpe un texte en morceaux et liens (URL http ou https). */
export function splitLinks(text: string): { text: string; href: string | null }[] {
  const out: { text: string; href: string | null }[] = [];
  const re = /https?:\/\/[^\s)»,;]+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index;
    if (at > last) out.push({ text: text.slice(last, at), href: null });
    out.push({ text: m[0], href: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null });
  return out;
}
