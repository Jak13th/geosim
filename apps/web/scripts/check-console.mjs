/**
 * Vérification automatique de la console : démarre le serveur Vite, ouvre l'application dans
 * Chromium headless, attend le moteur et la carte, puis parcourt l'interface (couches, zoom,
 * déplacement, recherche, inspecteur, panneau bilatéral, panneau Monde). Échoue si la console
 * contient une erreur ou un avertissement.
 *
 * Usage : npm run check:console [-- --timeout 20000] [-- --screenshots <dossier>]
 * Variable facultative GEOSIM_CHROMIUM_PATH : chemin d'un Chromium déjà installé, à utiliser à la
 * place de celui de Playwright (`npm run setup:browser`).
 *
 * Sans données construites (`npm run data`), seule la page d'accueil est vérifiée.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const { values } = parseArgs({
  options: {
    timeout: { type: 'string', default: '20000' },
    screenshots: { type: 'string' },
  },
});
const timeout = Number(values.timeout);
const shotsDir = values.screenshots ? resolve(values.screenshots) : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, logLevel: 'warn', server: { port: 5174 } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5174/';

const problems = [];
const executablePath = process.env.GEOSIM_CHROMIUM_PATH;
// WebGL logiciel (SwiftShader) : sans processeur graphique, Chromium headless le demande
// explicitement ; sinon il signale des ralentissements de lecture de pixels dans la console.
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch(executablePath ? { executablePath, args } : { args });

async function shot(page, name) {
  if (shotsDir) await page.screenshot({ path: join(shotsDir, `${name}.png`) });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => {
    const line = `[console.${msg.type()}] ${msg.text()}`;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(line);
    else console.log(line);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) =>
    problems.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`),
  );

  const started = Date.now();
  await page.goto(url);
  await page.waitForSelector('[data-engine-state="ready"], [data-engine-state="error"]', {
    timeout,
  });
  const engine = await page.getAttribute('[data-engine-state]', 'data-engine-state');
  const title = await page.title();
  console.log(`Page « ${title} » chargée depuis ${url}, moteur : ${engine}`);
  if (engine !== 'ready') problems.push(`[engine] état ${engine}`);

  // Données et carte (chargement de ≈ 150 Mo décompressés : délai plus long).
  await page.waitForSelector(
    'main[data-map-state="ready"], main[data-map-state="missing"], main[data-map-state="error"]',
    { timeout: Math.max(timeout, 120_000) },
  );
  const mapState = await page.getAttribute('main.stage', 'data-map-state');
  if (mapState === 'missing') {
    console.log('Données absentes (npm run data) : carte et interactions non vérifiées.');
  } else if (mapState === 'error') {
    problems.push(`[map] ${await page.textContent('.load-screen')}`);
  } else {
    await page.waitForSelector('[data-rendered="true"]', { timeout });
    console.log(`Carte affichée ${((Date.now() - started) / 1000).toFixed(1)} s après l’ouverture`);
    await shot(page, '01-politique');

    const map = page.locator('[data-map-canvas]');
    const box = await map.boundingBox();
    if (box === null) throw new Error('carte introuvable');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Couches : touches 1 à 9 puis 0.
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
      const legend = await page.textContent('.legend-title');
      console.log(`Couche ${key} : ${legend?.replace(/[▾▸]/g, '').trim()}`);
      await shot(page, `02-couche-${key}`);
    }
    await page.keyboard.press('1');

    // Navigation : molette, glisser, survol ; mesure des intervalles entre images.
    // Code exécuté dans la page : globalThis y est la fenêtre du navigateur.
    await page.evaluate(() => {
      const g = globalThis;
      g.__frames = [];
      const tick = (t) => {
        g.__frames.push(t);
        if (g.__frames.length < 100000) g.requestAnimationFrame(tick);
      };
      g.requestAnimationFrame(tick);
    });
    await page.mouse.move(cx, cy);
    for (let k = 0; k < 6; k++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(30);
    }
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let k = 0; k < 60; k++) await page.mouse.move(cx - k * 6, cy - k * 2);
    await page.mouse.up();
    const frames = await page.evaluate(() => {
      const f = globalThis.__frames ?? [];
      const d = f.slice(1).map((t, i) => t - (f[i] ?? t));
      d.sort((x, y) => x - y);
      return {
        n: d.length,
        median: d[Math.floor(d.length / 2)] ?? 0,
        p95: d[Math.floor(d.length * 0.95)] ?? 0,
      };
    });
    console.log(
      `Navigation : ${frames.n} images, intervalle médian ${frames.median.toFixed(1)} ms, 95e centile ${frames.p95.toFixed(1)} ms (rendu logiciel SwiftShader)`,
    );
    await page.mouse.move(cx + 40, cy + 20);
    await page.waitForTimeout(200);
    await shot(page, '03-zoom-survol');

    // Recherche (Ctrl+K) et inspecteur.
    await page.keyboard.press('Home');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.search input', { timeout });
    await page.keyboard.type('France');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-inspector="FRA"]', { timeout });
    await page.waitForTimeout(700);
    await shot(page, '04-france-apercu');
    const tabs = page.locator('.inspector .tabs button');
    const count = await tabs.count();
    for (let k = 0; k < count; k++) await tabs.nth(k).click();
    await page.locator('.inspector .param-head').first().click();
    await shot(page, '05-inspecteur-provenance');
    const params = await page.locator('.inspector .param').count();
    console.log(`Inspecteur : ${count} onglets, ${params} paramètres dans le dernier onglet`);
    await page.fill('.inspector input[type="search"]', 'pib');
    await page.locator('.inspector .segmented button', { hasText: 'Estimés' }).click();
    await page.locator('.inspector .segmented button', { hasText: 'Tous' }).click();
    await page.fill('.inspector input[type="search"]', '');

    // Second pays (Maj+Entrée dans la recherche) : panneau bilatéral.
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.search input', { timeout });
    await page.keyboard.type('Allemagne');
    await page.keyboard.press('Shift+Enter');
    await page.waitForSelector('.inspector .segmented.wide', { timeout });
    await page.locator('.inspector .param.pair .param-head').first().click();
    console.log('Panneau bilatéral : France ↔ Allemagne');
    await shot(page, '06-bilateral');

    // Survol d'un pays (infobulle) puis Maj+clic sur un autre (second pays).
    await page.mouse.move(cx - box.width * 0.2, cy);
    await page.waitForTimeout(200);
    const tooltip = await page.locator('.tooltip-body').count();
    console.log(`Infobulle : ${tooltip > 0 ? 'affichée' : 'absente (survol hors d’un pays)'}`);

    // Couche relations avec la France sélectionnée, puis panneau Monde.
    await page.keyboard.press('3');
    await page.waitForTimeout(300);
    await shot(page, '07-relations');
    await page.locator('.topbar button', { hasText: 'Monde' }).click();
    await page.waitForSelector('.world', { timeout });
    await shot(page, '08-monde');
    await page.keyboard.press('Escape');
  }
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
