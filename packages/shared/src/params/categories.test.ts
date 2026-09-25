import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './categories.ts';

const parametresMd = readFileSync(
  fileURLToPath(new URL('../../../../PARAMETRES.md', import.meta.url)),
  'utf8',
);

/** Préfixes déclarés dans les titres de section de PARAMETRES.md, ex. « ## 1. Démographie — `demo.*` ». */
function prefixesFromParametresMd(): string[] {
  return [...parametresMd.matchAll(/^## \d+\. .*`([a-z]+)\.\*`\s*$/gm)].map((m) => m[1] ?? '');
}

describe('catégories', () => {
  it('ont des identifiants et des préfixes uniques', () => {
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    expect(new Set(CATEGORIES.map((c) => c.prefix)).size).toBe(CATEGORIES.length);
  });

  it('suivent les sections de PARAMETRES.md, dans le même ordre', () => {
    expect(CATEGORIES.map((c) => c.prefix)).toEqual(prefixesFromParametresMd());
  });
});
