/**
 * Vérification automatique de la console : démarre le serveur Vite, ouvre l'application dans
 * Chromium headless, attend la carte et le moteur, puis parcourt l'interface : couches, zoom,
 * déplacement, recherche, inspecteur, panneau bilatéral, panneau Monde ; puis le temps réel
 * (lecture, vitesses, pas-à-pas, « avancer jusqu'à »), l'édition en direct (curseur, verrou,
 * effet temporaire, édition groupée, annuler / rétablir), l'onglet Modèle, les captures, la
 * relecture du journal, le journal et les graphiques. Échoue si la console contient une erreur
 * ou un avertissement, ou si une vérification échoue.
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

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const simDate = (page) => page.getAttribute('[data-sim-date]', 'data-sim-date');

/** Attend que la date simulée affichée vérifie `accept`. */
async function waitDate(page, accept, what) {
  const deadline = Date.now() + timeout;
  let d = await simDate(page);
  while (!accept(d)) {
    if (Date.now() > deadline) throw new Error(`${what} : date ${d}`);
    await page.waitForTimeout(50);
    d = await simDate(page);
  }
  return d;
}

/** Jours entre deux dates ISO. */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

async function select(page, name, shift = false) {
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.search input', { timeout });
  await page.keyboard.type(name);
  await page.keyboard.press(shift ? 'Shift+Enter' : 'Enter');
}

/** Moteur et temps réel (phase 3). */
async function realTime(page) {
  const journalSize = () =>
    page.evaluate(() => globalThis.document.querySelectorAll('.journal-list li').length);

  // Pas-à-pas : jour, semaine, premier du mois suivant (la date suit l'image du moteur).
  const d0 = await simDate(page);
  await page.click('[data-step="day"]');
  await waitDate(page, (d) => daysBetween(d0, d) === 1, 'pas d’un jour');
  await page.click('[data-step="week"]');
  await waitDate(page, (d) => daysBetween(d0, d) === 8, 'pas d’une semaine');
  const d1 = await simDate(page);
  await page.click('[data-step="month"]');
  await waitDate(page, (d) => d.endsWith('-01'), 'pas mensuel');
  const d2 = await simDate(page);
  console.log(`Pas-à-pas : ${d0} → ${d1} → ${d2}`);

  // Lecture à 3 mois/s pendant 2 s (espace pour lancer et arrêter), puis vitesse au clavier.
  await page.click('[data-speed="90"]');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const d3 = await simDate(page);
  const days = daysBetween(d2, d3);
  check(days >= 60 && days <= 400, `lecture à 90 j/s pendant 2 s : ${days} jours`);
  console.log(`Lecture : ${days} jours simulés en ≈ 2 s à 3 mois/s`);
  await page.keyboard.press('-');
  await page.waitForSelector('[data-speed="30"].active', { timeout });

  // Édition en direct : Budget de l'État de la France, défense à 5 % du PIB.
  await select(page, 'France');
  await page.waitForSelector('[data-inspector="FRA"]', { timeout });
  await page.locator('.inspector .tabs button', { hasText: 'Budget' }).click();
  const row = page.locator('.inspector .param[data-param="bud.defense"]');
  await row.locator('.param-head').click();
  const field = row.locator('.editor input.num').first();
  await field.fill('5');
  await field.press('Enter');
  await row.locator('.src', { hasText: 'modifiée' }).waitFor({ timeout });
  check(
    (await row.locator('.param-value').first().textContent())?.startsWith('5'),
    'défense : valeur saisie non affichée',
  );
  // Verrou, effet temporaire, édition groupée (membres de l'OTAN).
  await row.locator('button', { hasText: 'Verrouiller' }).click();
  await row.locator('button', { hasText: 'Effet temporaire' }).click();
  const form = row.locator('.modifier-form');
  await form.locator('input.num').first().fill('1');
  await form.locator('input.num').first().press('Enter');
  await form.locator('button', { hasText: 'Appliquer' }).click();
  await row.locator('.param-marks').waitFor({ timeout });
  await row.locator('button', { hasText: 'Édition groupée' }).click();
  await row.locator('.bulk select').first().selectOption('bloc:nato');
  await row.locator('.bulk button', { hasText: 'Appliquer à' }).click();
  await page.waitForTimeout(300);
  await shot(page, '09-edition');
  await page.locator('.inspector .segmented button', { hasText: 'Modifiés' }).click();
  const modified = await page.locator('.inspector .param').count();
  check(modified >= 1, 'filtre « Modifiés » vide');
  await page.locator('.inspector .segmented button', { hasText: 'Tous' }).click();
  // Annuler (Ctrl+Z) l'édition groupée, puis la rétablir (Ctrl+Y).
  await page.mouse.move(5, 300);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  console.log(
    `Édition : défense 5 %, verrou, effet temporaire, OTAN +1 ; ${modified} paramètre(s) modifié(s)`,
  );

  // Trajectoire infléchie : six mois simulés, puis graphiques de la France.
  const from = await simDate(page);
  const target = addMonths(from, 6);
  await page.fill('input[aria-label="Avancer jusqu’au"]', target);
  await page.locator('.goto button').click();
  await waitDate(page, (d) => d === target, 'avancer jusqu’au');
  console.log(`Avancer jusqu’au : ${from} → ${await simDate(page)}`);
  await page.locator('.topbar button', { hasText: 'Graphiques' }).click();
  await page.waitForSelector('.panel.bottom .uplot', { timeout });
  await page.locator('.chart-tools select').first().selectOption('eco.public_debt');
  await page.waitForTimeout(500);
  await shot(page, '10-graphiques');
  await page.locator('.charts .segmented button', { hasText: 'Monde' }).click();
  await page.waitForSelector('.small-multiples .uplot', { timeout });

  // Journal : entrées, filtres, « Pourquoi ? ».
  await page.locator('.panel.bottom button', { hasText: 'Journal' }).click();
  await page.waitForSelector('.journal-list li', { timeout });
  const entries = await journalSize();
  check(entries >= 4, `journal : ${entries} entrées`);
  await page.locator('.journal-tools button', { hasText: 'Événements' }).click();
  const events = await journalSize();
  if (events > 0) {
    await page.locator('.journal-list li .journal-head').first().click();
    await page.waitForSelector('.journal-details', { timeout });
  }
  await page.locator('.journal-tools button', { hasText: 'Tout' }).click();
  await shot(page, '11-journal');
  console.log(`Journal : ${entries} entrées, dont ${events} événement(s)`);

  // Monde : effet temporaire sur le pétrole, détroit d'Ormuz fermé.
  if ((await page.locator('.world[data-left-tab="world"]').count()) === 0) {
    await page.locator('.topbar button', { hasText: 'Monde' }).click();
  }
  await page.waitForSelector('.world[data-left-tab="world"]', { timeout });
  const oil = page.locator('.world .param[data-param="world.oil_price"]');
  await oil.locator('.param-head').click();
  await oil.locator('button', { hasText: 'Effet temporaire' }).click();
  await oil.locator('.modifier-form select').first().selectOption('mul');
  await oil.locator('.modifier-form input.num').first().fill('1,5');
  await oil.locator('.modifier-form input.num').first().press('Enter');
  await oil.locator('.modifier-form button', { hasText: 'Appliquer' }).click();
  await oil.locator('.param-marks').waitFor({ timeout });
  await page.locator('[data-chokepoint="hormuz"] select').selectOption('closed');
  await page.click('[data-step="month"]');
  await page.waitForFunction(
    () =>
      globalThis.document
        .querySelector('[data-chokepoint="hormuz"]')
        ?.textContent?.includes('Capacité 0 %') === true,
    null,
    { timeout },
  );
  console.log(
    `Ormuz fermé : ${(await page.textContent('[data-chokepoint="hormuz"] .muted.small'))?.trim()}`,
  );
  // ONU : résolution de condamnation (votes du Conseil, veto, Assemblée générale).
  const un = page.locator('[data-un-form]');
  await un.locator('select[aria-label="Pays visé"]').selectOption('RUS');
  await un.locator('button', { hasText: 'Soumettre au vote' }).click();
  await page.waitForSelector('.un-results li', { timeout });
  console.log(`ONU : ${(await page.textContent('.un-results li'))?.trim().slice(0, 160)}`);
  await shot(page, '12-monde');

  // Modèle : coefficient modifié en direct, puis rechargé depuis le fichier.
  await page.locator('.world .segmented button', { hasText: 'Modèle' }).click();
  const noise = page.locator('[data-coef="economy.cycle.noise"]');
  await noise.waitFor({ timeout });
  await noise.locator('input.num').fill('0,4');
  await noise.locator('input.num').press('Enter');
  await noise.locator('.src', { hasText: 'non enregistré' }).waitFor({ timeout });
  await shot(page, '13-modele');
  await page.locator('.model-actions button', { hasText: 'Recharger le fichier' }).click();
  await page.waitForFunction(
    () => globalThis.document.querySelector('[data-coef="economy.cycle.noise"] .src') === null,
    null,
    { timeout },
  );
  console.log('Modèle : coefficient modifié en direct puis rechargé depuis config/model.yaml');

  // Simulation : capture, un mois, restauration ; enregistrement sur le disque ; relecture.
  await page.locator('.world .segmented button', { hasText: 'Simulation' }).click();
  await page.waitForSelector('.world[data-left-tab="sim"]', { timeout });
  const before = await simDate(page);
  await page.fill('input[aria-label="Libellé de la capture"]', 'check-console');
  await page.locator('.capture-form button', { hasText: 'Capturer' }).click();
  await page.waitForSelector('ul.captures li', { timeout });
  await page.click('[data-step="month"]');
  await waitDate(page, (d) => d !== before, 'pas mensuel après la capture');
  await page.locator('ul.captures li button', { hasText: 'restaurer' }).first().click();
  await page.waitForFunction(
    (d) =>
      globalThis.document.querySelector('[data-sim-date]')?.getAttribute('data-sim-date') === d,
    before,
    { timeout },
  );
  const name = `check-console-${Date.now()}`;
  await page.fill('input[aria-label="Nom du fichier"]', name);
  await page.locator('.capture-form button', { hasText: 'Enregistrer l’état' }).click();
  const saved = page.locator('ul.captures li', { hasText: `${name}.json` });
  await saved.waitFor({ timeout });
  await saved.locator('button', { hasText: 'supprimer' }).click();
  await saved.waitFor({ state: 'detached', timeout });
  await page.locator('button', { hasText: 'Vérifier la relecture' }).click();
  await page.waitForSelector('[data-replay]', { timeout: 120_000 });
  const replay = await page.getAttribute('[data-replay]', 'data-replay');
  check(replay === 'identical', `relecture : ${await page.textContent('[data-replay]')}`);
  await shot(page, '14-simulation');
  console.log(`Captures et relecture : ${await page.textContent('[data-replay]')}`);

  // Carte : couche indicateur en direct (croissance), infobulle.
  await page.keyboard.press('Escape');
  await page.keyboard.press('5');
  await page.selectOption('select[aria-label="Indicateur"]', 'eco.growth');
  await page.waitForTimeout(300);
  await shot(page, '15-croissance');
}

/** Date ISO décalée de `months` mois (jour ramené au 1er). */
function addMonths(iso, months) {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
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
  const title = await page.title();
  console.log(`Page « ${title} » ouverte depuis ${url}`);

  // Données et carte (chargement de ≈ 150 Mo décompressés : délai plus long).
  await page.waitForSelector(
    'main[data-map-state="ready"], main[data-map-state="missing"], main[data-map-state="error"]',
    { timeout: Math.max(timeout, 120_000) },
  );
  const mapState = await page.getAttribute('main.stage', 'data-map-state');
  if (mapState === 'missing') {
    console.log('Données absentes (npm run data) : carte, moteur et interactions non vérifiés.');
  } else if (mapState === 'error') {
    problems.push(`[map] ${await page.textContent('.load-screen')}`);
  } else {
    // Le moteur démarre une fois les données chargées.
    await page.waitForSelector('[data-engine-state="ready"], [data-engine-state="error"]', {
      timeout: Math.max(timeout, 60_000),
    });
    const engine = await page.textContent('[data-engine-state]');
    console.log(`Moteur : ${engine} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    if ((await page.getAttribute('[data-engine-state]', 'data-engine-state')) !== 'ready') {
      throw new Error(`moteur non prêt : ${engine}`);
    }
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
    // « Pourquoi ? » (stabilité, approbation, coup d'État, liens avec le monde) calculé par le moteur.
    await page.waitForSelector('[data-why="FRA"] table.factors', { timeout });
    await shot(page, '04-france-apercu');
    // Appartenances : adhésion à un bloc puis retrait (commande « bloc »).
    const blocs = page.locator('[data-memberships="FRA"]');
    const chips = await blocs.locator('.chip').count();
    await blocs.locator('select').selectOption({ index: 1 });
    await blocs.locator('button', { hasText: 'Adhérer' }).click();
    await page.waitForFunction(
      (n) =>
        globalThis.document.querySelectorAll('[data-memberships="FRA"] .chip').length === n + 1,
      chips,
      { timeout },
    );
    await blocs.locator('.chip button').last().click();
    await page.waitForFunction(
      (n) => globalThis.document.querySelectorAll('[data-memberships="FRA"] .chip').length === n,
      chips,
      { timeout },
    );
    console.log(`Appartenances : ${chips} bloc(s), adhésion puis retrait`);
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
    await page.waitForSelector('[data-affinity="FRA>DEU"] table.factors', { timeout });
    await page.locator('.inspector .param.pair .param-head').first().click();
    console.log(
      `Panneau bilatéral : France ↔ Allemagne — ${(await page.textContent('[data-affinity="FRA>DEU"] p'))?.trim()}`,
    );
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
    await realTime(page);
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
