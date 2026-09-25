/**
 * Simulations sans interface : `npm run sim -- --scenario <nom> --years <n> --runs <n> --seed <n> --out <dossier>`.
 * Phase 0 : lecture des arguments seulement ; la boucle arrive en phase 3, le Monte Carlo en phase 8.
 */
import { parseArgs } from 'node:util';
import { ENGINE_VERSION, Rng } from '@geosim/engine';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'monde' },
    years: { type: 'string', default: '10' },
    runs: { type: 'string', default: '1' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string', default: 'results' },
  },
});

const seed = Number(values.seed);
if (!Number.isInteger(seed)) {
  console.error(`--seed doit être un entier (reçu : ${values.seed})`);
  process.exit(1);
}

console.log(`GeoSim CLI — moteur ${ENGINE_VERSION}`);
console.log(
  `Scénario « ${values.scenario} », ${values.years} an(s), ${values.runs} run(s), graine ${seed}, sortie ${values.out}/`,
);
console.log(`Premier tirage de la graine : ${new Rng(seed).nextU32()}`);
console.log('La boucle de simulation arrive en phase 3, le Monte Carlo en phase 8.');
