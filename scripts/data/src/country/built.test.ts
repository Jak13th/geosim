/**
 * Invariants des données pays construites par `npm run data` (SPEC §5, phase 1b). Ces tests
 * sont ignorés tant que data/build/countries.base.json n'existe pas : ils ne demandent pas de
 * réseau.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { BUILD_DIR } from '../paths.ts';
import type { Resolved } from './context.ts';
import type { CountriesBase, PairsBase, WorldBase } from './output.ts';

const built = existsSync(join(BUILD_DIR, 'countries.base.json'));
const load = <T>(name: string): T => JSON.parse(readFileSync(join(BUILD_DIR, name), 'utf8')) as T;
const CONFIDENCES = ['high', 'medium', 'low', 'assumption'];
const METHODS = [
  'source',
  'fallback_source',
  'curated',
  'derived',
  'map',
  'regional_median',
  'default',
  'zero',
  'not_applicable',
  'missing',
];

/** Toutes les valeurs numériques d'une valeur de paramètre (nombre, vecteur). */
function numbers(v: unknown): number[] {
  if (typeof v === 'number') return [v];
  if (v !== null && typeof v === 'object' && !Array.isArray(v))
    return Object.values(v).flatMap(numbers);
  return [];
}

function checkResolved(r: Resolved, where: string): void {
  expect(r.source.length, where).toBeGreaterThan(0);
  expect(r.date.length, where).toBeGreaterThan(0);
  expect(CONFIDENCES, where).toContain(r.confidence);
  expect(METHODS, where).toContain(r.method);
  // Une valeur nulle n'est admise que pour une lacune signalée ou un paramètre sans objet
  // (JSON écrit NaN et l'infini comme null : ce test les détecte aussi).
  if (r.value === null) expect(['missing', 'not_applicable'], where).toContain(r.method);
  for (const x of numbers(r.value)) expect(Number.isFinite(x), where).toBe(true);
}

describe.skipIf(!built)('données pays construites', () => {
  const countries = built ? load<CountriesBase>('countries.base.json') : ({} as CountriesBase);
  const pairs = built ? load<PairsBase>('pairs.base.json') : ({} as PairsBase);
  const world = built ? load<WorldBase>('world.base.json') : ({} as WorldBase);
  const param = (id: string, code: string) =>
    countries.entities.find((e) => e.id === code)?.params[id];

  it('compte au moins 190 entités, dont les 44 pays au niveau de détail complet', () => {
    expect(countries.entities.length).toBeGreaterThanOrEqual(190);
    expect(countries.entities.filter((e) => e.detail === 'full')).toHaveLength(44);
    expect(new Set(countries.entities.map((e) => e.id)).size).toBe(countries.entities.length);
  });

  it('donne à chaque entité chaque paramètre pays (hors dérivés du moteur), avec sa provenance', () => {
    const ids = CATALOG.filter(
      (d) => d.scope === 'country' && !countries.runtimeParams.includes(d.id),
    ).map((d) => d.id);
    for (const e of countries.entities) {
      expect(Object.keys(e.params).sort(), e.id).toEqual([...ids].sort());
      for (const [id, r] of Object.entries(e.params)) checkResolved(r, `${e.id}.${id}`);
    }
  });

  it('respecte les bornes du catalogue et les invariants de population', () => {
    for (const e of countries.entities) {
      for (const [id, r] of Object.entries(e.params)) {
        const def = CATALOG.find((d) => d.id === id);
        if (def?.valueType !== 'number' || typeof r.value !== 'number') continue;
        if (def.min !== undefined) expect(r.value, `${e.id}.${id}`).toBeGreaterThanOrEqual(def.min);
        if (def.max !== undefined) expect(r.value, `${e.id}.${id}`).toBeLessThanOrEqual(def.max);
      }
      expect(param('demo.population', e.id)?.value as number, e.id).toBeGreaterThanOrEqual(0);
    }
    // Population mondiale : États et entités de facto (les factions sont comptées dans leur pays).
    const total = countries.entities
      .filter((e) => e.kind !== 'faction')
      .reduce((s, e) => s + (param('demo.population', e.id)?.value as number), 0);
    expect(total).toBeGreaterThan(7.9e9);
    expect(total).toBeLessThan(8.5e9);
  });

  it('valeurs clés plausibles (sources automatisées)', () => {
    expect(param('demo.population', 'CHN')?.method).toBe('source');
    expect(param('eco.gdp_nominal', 'USA')?.value as number).toBeGreaterThan(25_000);
    expect(param('strat.warheads_total', 'RUS')?.method).toBe('curated');
    expect(param('ai.aggressiveness', 'RUS')?.confidence).toBe('assumption');
  });

  it('paires : chaque paramètre bilatéral du catalogue est présent ou calculé par le moteur', () => {
    for (const def of CATALOG.filter((d) => d.scope === 'pair')) {
      const p = pairs.params[def.id];
      if (pairs.runtimeParams.includes(def.id)) expect(p, def.id).toBeUndefined();
      else expect(p?.defaultNote.length, def.id).toBeGreaterThan(0);
    }
  });

  it('paires : provenance valide, sans doublon, relations bornées', () => {
    for (const [id, p] of Object.entries(pairs.params)) {
      const seen = new Set<string>();
      for (const [a, b, value, ref] of p.entries) {
        const key = `${a}>${b}`;
        expect(seen.has(key), `${id} ${key}`).toBe(false);
        seen.add(key);
        expect(a).not.toBe(b);
        expect(p.refs[ref], `${id} ${key}`).toBeDefined();
        for (const x of numbers(value)) expect(Number.isFinite(x), `${id} ${key}`).toBe(true);
      }
      for (const r of p.refs) expect(CONFIDENCES).toContain(r.confidence);
    }
    for (const [, , v] of pairs.params['pair.relation']?.entries ?? []) {
      expect(Math.abs(v as number)).toBeLessThanOrEqual(100);
    }
  });

  it('monde : chaque paramètre mondial a une provenance', () => {
    for (const def of CATALOG.filter((d) => d.scope === 'world')) {
      const r = world.params[def.id];
      expect(r, def.id).toBeDefined();
      checkResolved(r as Resolved, def.id);
    }
    expect(world.chokepoints).toHaveLength(17);
    for (const c of world.chokepoints) {
      const [lon, lat] = c.lonLat;
      expect(Math.abs(lon) <= 180 && Math.abs(lat) <= 90, c.id).toBe(true);
    }
  });

  it('écrit le rapport de couverture', () => {
    const report = readFileSync(join(BUILD_DIR, 'report.md'), 'utf8');
    expect(report).toMatch(/Couverture/);
  });
});
