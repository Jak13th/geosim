/**
 * Vérification automatique de la console : démarre le serveur Vite, ouvre l'application dans
 * Chromium headless, attend que le moteur réponde, et échoue si la console contient des erreurs
 * ou des avertissements.
 *
 * Usage : npm run check:console [-- --timeout 20000]
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const { values } = parseArgs({
  options: { timeout: { type: 'string', default: '20000' } },
});
const timeout = Number(values.timeout);

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'warn', server: { port: 5174 } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5174/';

const problems = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    const line = `[console.${msg.type()}] ${msg.text()}`;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(line);
    else console.log(line);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) =>
    problems.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`),
  );

  await page.goto(url);
  await page.waitForSelector('[data-engine-state="ready"], [data-engine-state="error"]', {
    timeout,
  });
  const state = await page.getAttribute('[data-engine-state]', 'data-engine-state');
  const title = await page.title();
  console.log(`Page « ${title} » chargée depuis ${url}, moteur : ${state}`);
  if (state !== 'ready') problems.push(`[engine] état ${state}`);
} catch (e) {
  problems.push(`[check] ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await browser.close();
  await server.close();
}

if (problems.length > 0) {
  console.error(`Console : ${problems.length} problème(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Console : aucune erreur ni avertissement.');
