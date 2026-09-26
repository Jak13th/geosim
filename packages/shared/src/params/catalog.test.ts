import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOG, paramById } from './catalog.ts';

const parametresMd = readFileSync(
  fileURLToPath(new URL('../../../../PARAMETRES.md', import.meta.url)),
  'utf8',
);

/** Lignes des tableaux de PARAMETRES.md : | `id` | libellé | unité · plage | type | source |. */
function rowsFromParametresMd(): { id: string; label: string; kind: string }[] {
  return [
    ...parametresMd.matchAll(/^\| `([a-z]+\.[a-z0-9_]+)` \| ([^|]+) \| [^|]+ \| ([ISD]) \|/gm),
  ].map((m) => ({ id: m[1] ?? '', label: (m[2] ?? '').trim(), kind: m[3] ?? '' }));
}

const KIND_LETTER = { input: 'I', state: 'S', derived: 'D' } as const;

describe('catalogue des paramètres', () => {
  it('reprend PARAMETRES.md : mêmes identifiants, dans le même ordre, mêmes libellés et types', () => {
    const rows = rowsFromParametresMd();
    expect(rows.length).toBeGreaterThan(250);
    expect(CATALOG.map((d) => d.id)).toEqual(rows.map((r) => r.id));
    for (const row of rows) {
      const def = paramById(row.id);
      expect(def?.label, row.id).toBe(row.label);
      expect(def && KIND_LETTER[def.kind], row.id).toBe(row.kind);
    }
  });

  it('a des déclarations cohérentes', () => {
    for (const def of CATALOG) {
      expect(def.description.length, def.id).toBeGreaterThan(5);
      if (def.min !== undefined && def.max !== undefined) {
        expect(def.min, def.id).toBeLessThan(def.max);
      }
      if (def.valueType === 'enum') expect(def.enumValues?.length, def.id).toBeGreaterThan(0);
      if (def.valueType === 'number') expect(def.min, def.id).toBeDefined();
      if (def.scale === 'log') expect(def.max, def.id).toBeGreaterThan(0);
    }
  });
});
