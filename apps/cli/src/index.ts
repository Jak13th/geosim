/**
 * Simulations sans interface :
 *   npm run sim -- --scenario monde --years 20 --runs 1 --seed 1 --out results
 *   npm run sim -- --scenario ormuz --seed 1 --out results/ormuz
 *
 * Scénarios d'expérience (ormuz, ormuz-avant-guerre, sanctions-chine, ble-x2, election-usa) :
 * chaque run déroule le scénario et sa référence avec la même graine et écrit `report.md` (écarts
 * des indicateurs, événements propres au scénario et leurs facteurs explicatifs) ; leur durée est
 * fixée par le scénario (--years ignoré).
 *
 * Chaque run part des données construites (`npm run data`) et de config/model.yaml, avec la
 * graine seed + numéro du run. Sorties dans <out>/ : séries mensuelles par pays et mondiales
 * (CSV), journal des événements (JSON) et `summary.json` (empreinte d'état, invariants,
 * croissance mondiale par an, événements). Le Monte Carlo parallèle arrive en phase 8.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  ENGINE_VERSION,
  Engine,
  SCENARIOS as EXPERIMENTS,
  checkInvariants,
  runScenario,
  scenarioById,
  type JournalEntry,
} from '@geosim/engine';
import { loadData, loadModel } from './load.ts';
import { csvTable, summarizeRun, type RunSummary } from './report.ts';
import { scenarioReport } from './scenario.ts';

const SCENARIOS: Record<string, string> = {
  monde: 'Monde au jour des données (situation actuelle)',
  ...Object.fromEntries(EXPERIMENTS.map((s) => [s.id, s.label])),
};

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'monde' },
    years: { type: 'string', default: '10' },
    runs: { type: 'string', default: '1' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string', default: 'results' },
    quiet: { type: 'boolean', default: false },
  },
});

function integer(name: string, raw: string | undefined, min: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    console.error(`--${name} doit être un entier ≥ ${min} (reçu : ${raw})`);
    process.exit(1);
  }
  return n;
}

const scenario = values.scenario ?? 'monde';
if (!(scenario in SCENARIOS)) {
  console.error(
    `Scénario inconnu : ${scenario}. Disponibles : ${Object.entries(SCENARIOS)
      .map(([k, d]) => `${k} (${d})`)
      .join(', ')}.`,
  );
  process.exit(1);
}
const years = integer('years', values.years, 1);
const runs = integer('runs', values.runs, 1);
const seed = integer('seed', values.seed, 0);
// `npm run sim` s'exécute dans le dossier du paquet : le chemin de sortie se lit depuis le dossier
// où la commande a été lancée (INIT_CWD, fourni par npm).
const outDir = resolve(process.env.INIT_CWD ?? process.cwd(), values.out ?? 'results');

const data = loadData();
const model = loadModel();
console.log(`GeoSim CLI — moteur ${ENGINE_VERSION}, données du ${data.countries.buildDate}`);
const experiment = scenarioById(scenario);
const period = experiment ? `jusqu’au ${experiment.until}` : `${years} an(s)`;
console.log(
  `Scénario « ${scenario} », ${period}, ${runs} run(s), graine ${seed}, sortie ${outDir}/`,
);

mkdirSync(outDir, { recursive: true });
const summaries: RunSummary[] = [];
let failed = false;
if (experiment !== undefined) {
  for (let r = 0; r < runs; r++) {
    const runSeed = seed + r;
    const started = performance.now();
    const run = runScenario(data, { seed: runSeed, model }, experiment);
    const elapsed = performance.now() - started;
    const violations = [...checkInvariants(run.scenario), ...checkInvariants(run.reference)];
    if (violations.length > 0) failed = true;
    const dir = join(outDir, runs > 1 ? `run-${String(r + 1).padStart(3, '0')}` : 'run');
    mkdirSync(join(dir, 'scenario'), { recursive: true });
    mkdirSync(join(dir, 'reference'), { recursive: true });
    for (const [name, engine] of [
      ['scenario', run.scenario],
      ['reference', run.reference],
    ] as const) {
      const tables = csvTable(engine);
      writeFileSync(join(dir, name, 'countries.csv'), tables.countries);
      writeFileSync(join(dir, name, 'world.csv'), tables.world);
      writeFileSync(
        join(dir, name, 'journal.json'),
        JSON.stringify(
          engine.journal.filter((e) => e.author === 'event' || e.author === 'user'),
          null,
          1,
        ),
      );
    }
    const report = scenarioReport(experiment, run, runSeed);
    writeFileSync(join(dir, 'report.md'), report);
    if (!values.quiet) {
      console.log(`\nRun ${r + 1} (graine ${runSeed}) : ${(elapsed / 1000).toFixed(1)} s`);
      console.log(
        `  Invariants : ${violations.length === 0 ? 'respectés' : `${violations.length} violation(s)`}`,
      );
      for (const v of violations.slice(0, 10)) console.log(`    ${v}`);
      console.log(`  Rapport : ${join(dir, 'report.md')}`);
    }
  }
  console.log(`\nRésultats écrits dans ${outDir}/`);
  process.exit(failed ? 2 : 0);
}
for (let r = 0; r < runs; r++) {
  const runSeed = seed + r;
  const started = performance.now();
  const engine = Engine.create(data, { seed: runSeed, model });
  const end = engine.calendar.tickOf(
    `${Number(engine.calendar.isoAt(0).slice(0, 4)) + years}${engine.calendar.isoAt(0).slice(4)}`,
  );
  const events: JournalEntry[] = engine.runUntil(end).filter((e) => e.author === 'event');
  const elapsed = performance.now() - started;
  const violations = checkInvariants(engine);
  if (violations.length > 0) failed = true;
  const summary = summarizeRun(engine, runSeed, elapsed, violations, events);
  summaries.push(summary);

  const dir = join(outDir, runs > 1 ? `run-${String(r + 1).padStart(3, '0')}` : 'run');
  mkdirSync(dir, { recursive: true });
  const tables = csvTable(engine);
  writeFileSync(join(dir, 'countries.csv'), tables.countries);
  writeFileSync(join(dir, 'world.csv'), tables.world);
  writeFileSync(join(dir, 'journal.json'), JSON.stringify(events, null, 1));

  if (!values.quiet) {
    console.log(
      `\nRun ${r + 1} (graine ${runSeed}) : ${engine.date()} atteint en ${(elapsed / 1000).toFixed(1)} s, empreinte ${summary.hash}`,
    );
    console.log(
      `  Croissance mondiale par an : ${summary.worldGrowth.map((g) => g.toFixed(1)).join(' · ')} %`,
    );
    console.log(
      `  Événements : ${
        Object.entries(summary.events)
          .map(([k, n]) => `${k} ${n}`)
          .join(', ') || 'aucun'
      }`,
    );
    console.log(
      `  Invariants : ${violations.length === 0 ? 'respectés' : `${violations.length} violation(s)`}`,
    );
    for (const v of violations.slice(0, 10)) console.log(`    ${v}`);
    for (const line of summary.keyCountries) console.log(`  ${line}`);
  }
}
writeFileSync(
  join(outDir, 'summary.json'),
  JSON.stringify(
    {
      engine: ENGINE_VERSION,
      scenario,
      years,
      runs,
      seed,
      dataBuild: data.countries.buildDate,
      runsSummary: summaries,
    },
    null,
    2,
  ),
);
console.log(`\nRésultats écrits dans ${outDir}/`);
if (failed) process.exit(2);
