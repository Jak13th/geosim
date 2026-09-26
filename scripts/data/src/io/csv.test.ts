import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { listZip, parseCsv, splitCsvLine, zipEntryLines } from './csv.ts';

describe('CSV', () => {
  it('découpe les champs, guillemets et guillemets doublés compris', () => {
    expect(splitCsvLine('a,b,,c')).toEqual(['a', 'b', '', 'c']);
    expect(splitCsvLine('"x, y","say ""hi""",3')).toEqual(['x, y', 'say "hi"', '3']);
  });

  it('analyse un fichier avec en-tête, BOM et retours à la ligne entre guillemets', () => {
    const rows = parseCsv('﻿name,note\r\nA,"ligne 1\nligne 2"\r\nB,\r\n');
    expect(rows).toEqual([
      { name: 'A', note: 'ligne 1\nligne 2' },
      { name: 'B', note: '' },
    ]);
  });

  it('lit en flux une entrée d’archive ZIP compressée ou stockée', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geosim-csv-'));
    try {
      const text = Array.from({ length: 5000 }, (_, i) => `${i},${i * 2}`).join('\n');
      const path = join(dir, 'a.zip');
      await writeFile(
        path,
        zipSync({ 'data/big.csv': strToU8(text), 'small.txt': [strToU8('ok'), { level: 0 }] }),
      );
      const entries = await listZip(path);
      expect(entries.map((e) => e.name).sort()).toEqual(['data/big.csv', 'small.txt']);
      const big = entries.find((e) => e.name === 'data/big.csv');
      const read: string[] = [];
      if (big) for await (const line of zipEntryLines(path, big)) read.push(line);
      expect(read.length).toBe(5000);
      expect(read[4999]).toBe('4999,9998');
      const small = entries.find((e) => e.name === 'small.txt');
      const smallLines: string[] = [];
      if (small) for await (const line of zipEntryLines(path, small)) smallLines.push(line);
      expect(smallLines).toEqual(['ok']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
