/**
 * Pipeline de données : `npm run data [-- --refresh]`.
 * Téléchargements mis en cache (data/raw), construction et validation (data/build),
 * manifeste des sources (data/manifest.json), rapport de couverture (data/build/report.md).
 * Phase 0 : point d'entrée seulement ; le pipeline arrive en phase 1.
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { refresh: { type: 'boolean', default: false } },
});

console.log(`Pipeline de données (refresh : ${values.refresh ? 'oui' : 'non'})`);
console.log('Rien à construire pour l’instant : le pipeline arrive en phase 1.');
