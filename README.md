# GeoSim

Simulation géopolitique **locale** et **temps réel**, inspirée d'[OpenFront.io](https://openfront.io) et alimentée par des données réelles. Chaque paramètre du monde se modifie pendant que la simulation tourne.

> **État du projet : phase 2 (carte interactive en lecture seule) terminée, en attente de validation.**
> `npm run data` construit la carte du monde et les données de 208 entités (paramètres pays, bilatéraux et mondiaux, avec leur provenance) ; l'application les affiche sur une carte interactive, avec dix couches, un inspecteur de pays et un panneau bilatéral où chaque valeur montre sa source et son année. La simulation arrive en phase 3. L'avancement détaillé est dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Prérequis

- **Node.js ≥ 22.12** (npm inclus) et **git**.
- Windows, macOS ou Linux. Aucune dépendance native à compiler, pas de Python.
- Uniquement pour `npm run check:console` : le Chromium headless de Playwright, installé par `npm run setup:browser` (voir [Dépannage](#dépannage)).

## Installation

```bash
git clone https://github.com/Jak13th/geosim.git
cd geosim
npm install
npm run setup:browser   # facultatif : navigateur headless pour `npm run check:console`
```

## Lancer l'application

```bash
npm run dev
```

Ouvre ensuite http://localhost:5173. La carte s'affiche après quelques secondes si les données ont été construites (`npm run data`, voir [Données](#données)) ; sinon, la page indique la commande à lancer.

- Le serveur n'écoute que sur `localhost` : l'application n'est pas accessible depuis le réseau.
- Sous WSL2, ouvre l'adresse depuis le navigateur Windows ; WSL2 redirige `localhost` automatiquement.

### Utiliser la carte

| Action                          | Effet                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Glisser · molette · double-clic | Déplacer · zoomer vers le curseur · zoomer                                                                        |
| Flèches · `+` / `−` · `Origine` | Déplacer · zoomer · revenir à la vue d'ensemble                                                                   |
| Survol                          | Infobulle : indicateurs clés avec leur année, valeur de la couche                                                 |
| Clic · Maj+clic · `Échap`       | Sélectionner un pays (inspecteur) · second pays (relation A ↔ B) · désélectionner                                 |
| `1` … `9`, `0`                  | Couches : politique, de jure, relations, blocs, indicateurs, sanctions, population, terrain, infrastructures, mer |
| `Ctrl+K` ou `/`                 | Rechercher un pays (Entrée : y aller ; Maj+Entrée : second pays)                                                  |

Dans l'inspecteur, un clic sur un paramètre affiche sa provenance complète (source, date, confiance, méthode, note). Ajoute `?debug` à l'adresse pour afficher le temps GPU et la cadence d'images.

Pour tester le build de production :

```bash
npm run build
npm run preview -w @geosim/web   # http://localhost:4173
```

## Tester

| Commande                | Rôle                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Tests unitaires (Vitest)                                                                                                                                                                                                                          |
| `npm run test:watch`    | Tests en continu pendant le développement                                                                                                                                                                                                         |
| `npm run typecheck`     | Vérification TypeScript de chaque workspace                                                                                                                                                                                                       |
| `npm run lint`          | ESLint, dont les règles d'architecture du moteur                                                                                                                                                                                                  |
| `npm run format:check`  | Vérifie le formatage (Prettier) ; `npm run format` le corrige                                                                                                                                                                                     |
| `npm run check:console` | Lance l'application dans Chromium headless, parcourt l'interface (couches, zoom, recherche, inspecteur, panneaux) et échoue au moindre message d'erreur ou d'avertissement dans la console ; `-- --screenshots <dossier>` enregistre des captures |

Vérification complète, celle de chaque fin de phase :

```bash
npm run typecheck && npm test && npm run lint && npm run check:console
```

Le moteur (`packages/engine`) doit rester pur et déterministe : il tourne à l'identique dans le navigateur et en ligne de commande. Le typecheck et le lint échouent s'il utilise le DOM, une API de Node, `Math.random()`, `Date.now()` ou `performance.now()`.

## Simulation sans interface

```bash
npm run sim -- --scenario <nom> --years <n> --runs <n> --seed <n> --out <dossier>
```

Pour l'instant, la commande lit ses arguments et affiche le premier tirage de la graine. La boucle de simulation arrive en phase 3, le Monte Carlo en phase 8.

## Données

```bash
npm run data                          # construit la carte (4096 px) et les données pays, téléchargements en cache
npm run data -- --refresh             # force un nouveau téléchargement des sources
npm run data -- --resolution 2048     # autre résolution : 2048 (rapide), 4096 (défaut), 8192 (expérimental)
npm run data -- --skip-map            # réutilise la carte déjà construite (itérations sur les données pays)
```

- Le premier passage télécharge environ 700 Mo dans `data/raw/` : Natural Earth 10m, WorldClim 2.1, Banque mondiale, FMI, Our World in Data, FAOSTAT, HCR, CEPII BACI, votes à l'AGNU, PNUD. Les suivants fonctionnent hors ligne. Chaque source est tracée dans `data/manifest.json` (URL, date d'accès, version, licence, empreinte).
- La construction prend environ 4 min à 4096 px. Elle écrit dans `data/build/map/` : la carte binaire compressée (`map-4096.bin.gz`), la population et la valeur économique par pixel (`land-4096.bin.gz`), les métadonnées (`map-4096.json`), les voisinages et distances (`geo-4096.json`), les routes maritimes (`routes-4096.json`), un rapport de validation (`report-4096.md`) et des aperçus PNG ; puis dans `data/build/` : `countries.base.json`, `pairs.base.json`, `world.base.json` et le rapport de couverture `report.md` (sources par paramètre, valeurs estimées, alertes).
- Les données curées à la main (territoires, zones de contrôle, conflits, sanctions, nucléaire, profils décisionnels…) sont dans `data/curated/`, chaque valeur avec sa source, sa date et son niveau de confiance ; les sources consultées sont listées dans `data/curated/SOURCES.md`.
- Les coefficients de construction (terrain, biomes, zones maritimes, routes, population) sont dans `config/model.yaml` (famille `geo`), expliqués dans `docs/MODELES.md` §1 ; la résolution des données pays est décrite au §2.
- `data/raw/` et `data/build/` ne sont pas versionnés (WorldClim interdit la redistribution).

Une fois la carte construite, `npm test` vérifie aussi ses invariants (surfaces, conservation des pixels, frontières, détroits).

## Structure

```
packages/shared   types et catalogue des paramètres
packages/engine   moteur de simulation (TypeScript pur, sans DOM ni Node)
apps/web          interface (Vite + React) ; le moteur tourne dans un Web Worker ; API locale dans server/
apps/cli          simulations sans interface
scripts/data      pipeline de données
config/           coefficients des modèles (model.yaml) et événements (events.yaml)
data/             données curées et sourcées, manifeste des sources
docs/             avancement, décisions, modèles, calibration
```

## Documentation

- [`SPEC.md`](SPEC.md) : spécification complète (vision, architecture, modèles, interface, phases).
- [`PARAMETRES.md`](PARAMETRES.md) : catalogue des paramètres.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) : avancement et prochaines étapes.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) : choix de conception et leurs raisons.
- [`docs/MODELES.md`](docs/MODELES.md) : équations et hypothèses des systèmes.
- [`docs/CALIBRATION.md`](docs/CALIBRATION.md) : tests de plausibilité et de sensibilité.

## Dépannage

- **`npm install` ou `npm test` échoue à cause de la version de Node** : Vitest 5 exige Node 22.12 ou plus récent (`node --version`).
- **`npm run dev` : port 5173 déjà utilisé** : le port est fixe. Arrête l'autre processus qui l'occupe.
- **`npm run check:console` : Chromium ne démarre pas** : installe les bibliothèques système signalées dans le message d'erreur. Sur Ubuntu : `sudo apt-get install -y libgbm1`.
- **`npm run check:console` avec un Chromium déjà installé** : indique son chemin dans `GEOSIM_CHROMIUM_PATH` (ex. `GEOSIM_CHROMIUM_PATH=/usr/bin/chromium npm run check:console`) au lieu de lancer `npm run setup:browser`.
- **`npm run data` derrière un proxy d'entreprise** : les téléchargements suivent les variables `HTTPS_PROXY` et `NO_PROXY`.
- **Ubuntu 20.04** : Playwright ne supporte plus officiellement cette version. `npm run setup:browser` installe alors la version prévue pour Ubuntu 22.04, qui fonctionne ; un avertissement s'affiche pendant l'installation.

## Crédits

Les mécaniques de GeoSim sont inspirées d'OpenFront.io, mais aucun code n'en est repris (OpenFront est sous licence AGPL-3.0). Les sources de données et leurs licences sont listées dans `data/manifest.json` (téléchargements : Natural Earth, domaine public ; WorldClim 2.1, usage non commercial sans redistribution) et `data/curated/SOURCES.md` (données curées).
