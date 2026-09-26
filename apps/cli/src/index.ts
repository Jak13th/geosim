/**
 * Simulations sans interface :
 *   npm run sim -- --scenario monde --years 20 --runs 1 --seed 1 --out results
 *
 * Chaque run part des données construites (`npm run data`) et de config/model.yaml, avec la
 * graine seed + numéro du run. Sorties dans <out>/ : séries mensuelles par pays et mondiales
 * (CSV), journal des événements (JSON) et `summary.json` (empreinte d'état, invariants,
 * croissance mondiale par an, événements). Le Monte Carlo parallèle arrive en phase 8.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ENGINE_VERSION, Engine, checkInvariants, type JournalEntry } from '@geosim/engine';
import { loadData, loadModel } from './load.ts';
import { csvTable, summarizeRun, type RunSummary } from './report.ts';

const SCENARIOS = { monde: 'Monde au jour des données (situation actuelle)' } as const;

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
console.log(
  `Scénario « ${scenario} », ${years} an(s), ${runs} run(s), graine ${seed}, sortie ${outDir}/`,
);

mkdirSync(outDir, { recursive: true });
const summaries: RunSummary[] = [];
let failed = false;
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
