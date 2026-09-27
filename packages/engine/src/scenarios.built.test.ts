/**
 * Tests d'acceptation de la phase 4 (SPEC §12) sur les données construites par `npm run data` :
 * chaque expérience est comparée à sa référence (même graine) et doit donner des résultats
 * qualitativement plausibles et expliqués (facteurs au journal). Ignorés tant que data/build/
 * n'existe pas.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CountriesBase, PairsBase, WorldBaseFile } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { loadModelTree } from '../test/fixture.ts';
import { checkInvariants } from './invariants.ts';
import {
  compareCountry,
  compareWorld,
  runScenario,
  scenarioById,
  scenarioEvents,
  type ScenarioRun,
  type SeriesComparison,
} from './scenarios.ts';
import { col, type EngineData } from './state.ts';
import { SANCTIONS_OUT } from './systems/sanctions.ts';

const BUILD = fileURLToPath(new URL('../../../data/build', import.meta.url));
const built = existsSync(join(BUILD, 'countries.base.json'));
const read = <T>(name: string): T => JSON.parse(readFileSync(join(BUILD, name), 'utf8')) as T;

const data: EngineData = built
  ? {
      countries: read<CountriesBase>('countries.base.json'),
      pairs: read<PairsBase>('pairs.base.json'),
      world: read<WorldBaseFile>('world.base.json'),
    }
  : ({} as EngineData);
const model = built ? loadModelTree() : {};

const runs = new Map<string, ScenarioRun>();
function run(id: string): ScenarioRun {
  let r = runs.get(id);
  if (r === undefined) {
    const scenario = scenarioById(id);
    if (!scenario) throw new Error(`Scénario inconnu : ${id}`);
    r = runScenario(data, { seed: 1, model }, scenario);
    runs.set(id, r);
  }
  return r;
}

function country(r: ScenarioRun, param: string, entity: string): SeriesComparison {
  const c = compareCountry(r, param, entity);
  if (c === null) throw new Error(`Série absente : ${param} ${entity}`);
  return c;
}

function world(r: ScenarioRun, key: string): SeriesComparison {
  const c = compareWorld(r, key);
  if (c === null) throw new Error(`Série absente : ${key}`);
  return c;
}

/** Écart (scénario − référence) à une date du relevé mensuel. */
function diffAt(r: ScenarioRun, c: SeriesComparison, date: string): number {
  const t = r.scenario.history.ticks.findIndex((x) => r.scenario.calendar.isoAt(x) === date);
  if (t < 0) throw new Error(`Date absente du relevé : ${date}`);
  return (c.scenario[t] as number) - (c.reference[t] as number);
}

function relation(r: ScenarioRun, which: 'scenario' | 'reference', a: string, b: string): number {
  const S = r[which].state;
  const i = S.byId.get(a) as number;
  const j = S.byId.get(b) as number;
  return S.pairMatrix('pair.relation')[i * S.n + j] as number;
}

const SLOW = { timeout: 180_000 };

describe.skipIf(!built)('phase 4 — (a) fermeture d’Ormuz pendant trois mois', () => {
  it(
    'à partir d’un détroit rouvert : choc pétrolier, pénuries expliquées, puis retour',
    SLOW,
    () => {
      const r = run('ormuz-avant-guerre');
      expect(checkInvariants(r.scenario)).toEqual([]);
      expect(checkInvariants(r.reference)).toEqual([]);
      // Prix du pétrole : nette hausse pendant la fermeture, retour après la réouverture.
      const oil = world(r, 'world.oil_price');
      expect(oil.peak.diff).toBeGreaterThan(0.15 * oil.peak.reference);
      expect(oil.peak.date >= '2028-01-01' && oil.peak.date <= '2028-07-01').toBe(true);
      expect(Math.abs(oil.end.diff)).toBeLessThan(0.05 * oil.end.reference);
      // Exportateurs du Golfe : production bloquée, PIB en forte baisse, puis rétabli.
      for (const id of ['SAU', 'QAT']) {
        const gdp = country(r, 'eco.gdp_nominal', id);
        expect(diffAt(r, gdp, '2028-03-01'), id).toBeLessThan(-0.05 * gdp.peak.reference);
        expect(Math.abs(gdp.end.diff), id).toBeLessThan(0.03 * gdp.end.reference);
      }
      // Importateurs d'Asie : inflation en hausse, activité en baisse, stocks entamés.
      for (const id of ['JPN', 'KOR', 'IND']) {
        expect(diffAt(r, country(r, 'eco.inflation', id), '2028-04-01'), id).toBeGreaterThan(0.3);
        expect(diffAt(r, country(r, 'eco.output_gap', id), '2028-04-01'), id).toBeLessThan(0);
        expect(country(r, 'trade.oil_stocks', id).peak.diff, id).toBeLessThan(0);
      }
      // Autres exportateurs : gain de termes de l'échange.
      expect(diffAt(r, country(r, 'eco.current_account', 'NOR'), '2028-04-01')).toBeGreaterThan(0);
      // Pénurie physique là où les stocks sont faibles, expliquée au journal.
      expect(country(r, 'energy.supply_gap', 'IND').peak.diff).toBeGreaterThan(1);
      const shortages = scenarioEvents(r).filter((e) => e.kind === 'energy_shortage');
      expect(shortages.map((e) => e.entities[0])).toContain('IND');
      for (const e of shortages) {
        const ids = (e.factors ?? []).map((f) => f.id);
        expect(ids).toContain('trade.oil_stocks');
        expect(ids.some((id) => id.startsWith('pair.energy_dependence:'))).toBe(true);
      }
    },
  );

  it(
    'à partir de la situation actuelle (détroit déjà réduit) : effet marginal plus faible',
    SLOW,
    () => {
      const r = run('ormuz');
      const avant = run('ormuz-avant-guerre');
      expect(checkInvariants(r.scenario)).toEqual([]);
      const oil = world(r, 'world.oil_price');
      expect(oil.peak.diff).toBeGreaterThan(0);
      expect(oil.peak.diff / oil.peak.reference).toBeLessThan(
        world(avant, 'world.oil_price').peak.diff / world(avant, 'world.oil_price').peak.reference,
      );
      expect(country(r, 'eco.gdp_nominal', 'QAT').peak.diff).toBeLessThan(0);
    },
  );
});

describe.skipIf(!built)('phase 4 — (b) sanctions larges contre une grande économie', () => {
  it(
    'Chine : commerce et activité en recul, coût pour les émetteurs, relations dégradées',
    SLOW,
    () => {
      const r = run('sanctions-chine');
      expect(checkInvariants(r.scenario)).toEqual([]);
      const exports = country(r, 'trade.exports', 'CHN');
      expect(exports.end.diff).toBeLessThan(-3);
      const gap = country(r, 'eco.output_gap', 'CHN');
      expect(gap.peak.diff).toBeLessThan(-2);
      expect(country(r, 'eco.gdp_nominal', 'CHN').end.diff).toBeLessThan(0);
      // Les émetteurs paient aussi, mais moins que la cible.
      for (const id of ['KOR', 'JPN', 'DEU']) {
        const g = country(r, 'eco.output_gap', id).peak.diff;
        expect(g, id).toBeLessThan(0);
        expect(g, id).toBeGreaterThan(gap.peak.diff);
      }
      // Pressions des sanctions expliquées : finance, technologie ; relations.
      const S = r.scenario.state;
      const chn = S.byId.get('CHN') as number;
      expect(S.internalArray(SANCTIONS_OUT.finance, 0)[chn] as number).toBeGreaterThan(0.3);
      for (const id of ['USA', 'JPN', 'DEU']) {
        expect(
          relation(r, 'scenario', 'CHN', id) - relation(r, 'reference', 'CHN', id),
          id,
        ).toBeLessThan(-5);
      }
    },
  );
});

describe.skipIf(!built)('phase 4 — (c) doublement du prix du blé', () => {
  it(
    'tension alimentaire, inflation et instabilité chez les importateurs pauvres, famines expliquées',
    SLOW,
    () => {
      const r = run('ble-x2');
      expect(checkInvariants(r.scenario)).toEqual([]);
      const wheat = world(r, 'world.wheat_price');
      const t0 = r.scenario.history.ticks.findIndex(
        (x) => r.scenario.calendar.isoAt(x) === '2027-01-01',
      );
      expect(diffAt(r, wheat, '2027-01-01')).toBeGreaterThan(0.8 * (wheat.reference[t0] as number));
      for (const id of ['EGY', 'YEM', 'LBN']) {
        expect(diffAt(r, country(r, 'res.food_stress', id), '2027-01-01'), id).toBeGreaterThan(10);
        expect(diffAt(r, country(r, 'eco.inflation', id), '2026-12-01'), id).toBeGreaterThan(2);
      }
      // Instabilité (le Yémen, déjà au plancher, ne peut plus baisser).
      for (const id of ['EGY', 'LBN', 'DZA']) {
        expect(country(r, 'pol.stability', id).peak.diff, id).toBeLessThan(-2);
      }
      // Pays riches : effet d'inflation plus faible.
      const rich = diffAt(r, country(r, 'eco.inflation', 'USA'), '2026-12-01');
      expect(rich).toBeGreaterThan(0);
      expect(rich).toBeLessThan(diffAt(r, country(r, 'eco.inflation', 'EGY'), '2026-12-01'));
      // Exportateurs nets de blé : solde courant amélioré au début du choc.
      for (const id of ['CAN', 'AUS']) {
        expect(diffAt(r, country(r, 'eco.current_account', id), '2026-12-01'), id).toBeGreaterThan(
          0,
        );
      }
      const famines = scenarioEvents(r).filter((e) => e.kind === 'famine');
      expect(famines.length).toBeGreaterThan(3);
      for (const e of famines) {
        const ids = (e.factors ?? []).map((f) => f.id);
        expect(ids).toEqual(expect.arrayContaining(['res.food_stress', 'eco.gdp_per_capita']));
      }
      // Retour après la fin du choc : le prix revient.
      expect(Math.abs(wheat.end.diff)).toBeLessThan(0.1 * wheat.end.reference);
    },
  );
});

describe.skipIf(!built)('phase 4 — (d) élection qui change le profil d’un grand pays', () => {
  it(
    'alternance aux États-Unis : profil d’opposition, relations avec les alliés en hausse',
    SLOW,
    () => {
      const r = run('election-usa');
      expect(checkInvariants(r.scenario)).toEqual([]);
      const election = (which: 'scenario' | 'reference') =>
        r[which].journal.find((e) => e.entities[0] === 'USA' && e.kind.startsWith('election_'));
      const alternance = election('scenario');
      expect(alternance?.kind).toBe('election_alternance');
      expect(alternance?.date).toBe('2028-11-07');
      expect(election('reference')?.kind).toBe('election_continuity');
      // « Pourquoi ? » : approbation, compétitivité, probabilité.
      const ids = (alternance?.factors ?? []).map((f) => f.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'pol.approval',
          'pol.electoral_democracy',
          'politics.elections.probability',
        ]),
      );
      // Profil : celui de l'opposition curé (profiles.yaml) ; l'ancien devient l'opposition.
      const S = r.scenario.state;
      const R = r.reference.state;
      const usa = S.byId.get('USA') as number;
      const opposition = data.countries.entities.find((e) => e.id === 'USA')?.params[
        'ai.opposition_profile'
      ]?.value as Record<string, number>;
      expect(S.v(col('ai.alliance_loyalty'))[usa]).toBe(opposition['ai.alliance_loyalty']);
      expect(S.v(col('ai.revisionism'))[usa]).toBe(opposition['ai.revisionism']);
      expect(R.v(col('ai.alliance_loyalty'))[usa]).not.toBe(opposition['ai.alliance_loyalty']);
      expect(
        (S.genericValue('ai.opposition_profile', usa) as Record<string, number>)[
          'ai.alliance_loyalty'
        ],
      ).toBe(R.v(col('ai.alliance_loyalty'))[usa]);
      // Relations : rapprochement avec les alliés deux ans après.
      for (const id of ['CAN', 'DEU', 'FRA', 'GBR']) {
        expect(
          relation(r, 'scenario', 'USA', id) - relation(r, 'reference', 'USA', id),
          id,
        ).toBeGreaterThan(5);
      }
    },
  );
});
