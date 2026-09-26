/**
 * Test de fumée (SPEC §11, critère de fin de la phase 3) sur les données construites par
 * `npm run data` : 20 ans simulés sans NaN ni divergence, et relecture du journal à l'identique.
 * Ignoré tant que data/build/ n'existe pas.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CountriesBase, PairsBase, WorldBaseFile } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { loadModelTree } from '../test/fixture.ts';
import { Engine } from './engine.ts';
import { checkInvariants } from './invariants.ts';
import { col } from './state.ts';
import type { EngineData } from './state.ts';

const BUILD = fileURLToPath(new URL('../../../data/build', import.meta.url));
const built = existsSync(join(BUILD, 'countries.base.json'));
const read = <T>(name: string): T => JSON.parse(readFileSync(join(BUILD, name), 'utf8')) as T;

describe.skipIf(!built)('données construites : 20 ans de simulation', () => {
  const data: EngineData = built
    ? {
        countries: read<CountriesBase>('countries.base.json'),
        pairs: read<PairsBase>('pairs.base.json'),
        world: read<WorldBaseFile>('world.base.json'),
      }
    : ({} as EngineData);
  const model = loadModelTree();

  it(
    'tourne 20 ans sans NaN ni divergence (invariants, croissance, dette, inflation)',
    { timeout: 120_000 },
    () => {
      const e = Engine.create(data, { seed: 1, model });
      expect(checkInvariants(e)).toEqual([]);
      const pop0 = e.state
        .v(col('demo.population'))
        .reduce((s, x, i) => s + (e.state.entities[i]?.kind === 'faction' ? 0 : x), 0);
      e.runUntil(e.calendar.tickOf('2046-09-26'));
      expect(checkInvariants(e)).toEqual([]);
      expect(e.date()).toBe('2046-09-26');

      // Croissance mondiale annuelle moyenne dans une plage plausible, sans tendance explosive.
      const g = e.history.worldSeries('world.growth') ?? [];
      const mean = g.slice(1).reduce((s, x) => s + x, 0) / (g.length - 1);
      expect(mean).toBeGreaterThan(1.5);
      expect(mean).toBeLessThan(3.5);

      // Population mondiale : croissance modérée (Nations unies : ≈ + 15 % en 20 ans).
      const pop = e.state
        .v(col('demo.population'))
        .reduce((s, x, i) => s + (e.state.entities[i]?.kind === 'faction' ? 0 : x), 0);
      expect(pop / pop0).toBeGreaterThan(1.05);
      expect(pop / pop0).toBeLessThan(1.3);

      // Pas de divergence : dette et inflation bornées hors des pays déjà en crise au départ.
      const S = e.state;
      const inCrisis = (i: number): boolean => {
        const inflation0 = S.base[col('eco.inflation') * S.n + i] as number;
        const debt0 = S.base[col('eco.public_debt') * S.n + i] as number;
        const rating0 = S.base[col('eco.credit_rating') * S.n + i] as number;
        const balance0 = S.base[col('bud.balance') * S.n + i] as number;
        return inflation0 > 30 || debt0 > 120 || rating0 <= 4 || balance0 < -10;
      };
      const diverging: string[] = [];
      for (let i = 0; i < S.n; i++) {
        const ent = S.entities[i];
        if (!ent || ent.kind === 'faction' || inCrisis(i)) continue;
        const debt = S.e(col('eco.public_debt'))[i] as number;
        const inflation = S.e(col('eco.inflation'))[i] as number;
        if (debt > 250 || inflation > 60)
          diverging.push(`${ent.id} dette ${debt.toFixed(0)} inflation ${inflation.toFixed(0)}`);
      }
      expect(diverging).toEqual([]);
      const defaults = e.journal.filter((x) => x.kind === 'default').length;
      expect(defaults).toBeLessThan(80);
    },
  );

  it(
    'la relecture du journal donne la même empreinte (commandes comprises)',
    { timeout: 120_000 },
    () => {
      const a = Engine.create(data, { seed: 42, model });
      const initial = a.snapshot();
      a.step(60);
      a.apply({
        type: 'set',
        slots: [{ scope: 'country', param: 'bud.defense', entity: 'DEU' }],
        value: 3.5,
      });
      a.apply({
        type: 'addModifier',
        slots: [{ scope: 'world', param: 'world.oil_price' }],
        modifier: {
          op: 'mul',
          amount: 1.6,
          durationDays: 180,
          decay: 'linear',
          label: 'Fermeture d’Ormuz',
        },
      });
      a.step(365);
      a.apply({
        type: 'lock',
        slots: [{ scope: 'country', param: 'eco.inflation', entity: 'TUR' }],
        locked: true,
      });
      a.step(365);
      const replayed = Engine.replay(data, initial, a.journal, a.tick);
      expect(replayed.hash()).toBe(a.hash());
    },
  );
});
