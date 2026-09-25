# GeoSim

Simulation géopolitique **locale** et **temps réel**, inspirée d'[OpenFront.io](https://openfront.io) et alimentée par des données réelles. Chaque paramètre du monde se modifie pendant que la simulation tourne.

> **État du projet : phase 0 (fondations) terminée.**
> Pour l'instant, l'application affiche une page d'accueil et vérifie que le moteur démarre dans son worker. La carte, les données et la simulation arriveront phase par phase (voir [`SPEC.md`](SPEC.md) §12). L'avancement détaillé est dans [`docs/PROGRESS.md`](docs/PROGRESS.md).

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

Ouvre ensuite http://localhost:5173. La page affiche « GeoSim » et, en vert, « Moteur 0.0.0 prêt ».

- Le serveur n'écoute que sur `localhost` : l'application n'est pas accessible depuis le réseau.
- Sous WSL2, ouvre l'adresse depuis le navigateur Windows ; WSL2 redirige `localhost` automatiquement.

Pour tester le build de production :

```bash
npm run build
npm run preview -w @geosim/web   # http://localhost:4173
```

## Tester

| Commande                | Rôle                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Tests unitaires (Vitest)                                                                                            |
| `npm run test:watch`    | Tests en continu pendant le développement                                                                           |
| `npm run typecheck`     | Vérification TypeScript de chaque workspace                                                                         |
| `npm run lint`          | ESLint, dont les règles d'architecture du moteur                                                                    |
| `npm run format:check`  | Vérifie le formatage (Prettier) ; `npm run format` le corrige                                                       |
| `npm run check:console` | Lance l'application dans Chromium headless et échoue au moindre message d'erreur ou d'avertissement dans la console |

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
npm run data              # construit les données (avec cache)
npm run data -- --refresh # force un nouveau téléchargement
```

Le pipeline arrive en phase 1 ; il ne fait encore rien. Ensuite :

- les téléchargements seront mis en cache dans `data/raw/` ;
- les fichiers générés iront dans `data/build/` (ces deux dossiers ne sont pas versionnés) ;
- chaque source sera tracée dans `data/manifest.json` (URL, date d'accès, version, licence).

Une fois les données construites, tout fonctionnera hors ligne.

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
- **Ubuntu 20.04** : Playwright ne supporte plus officiellement cette version. `npm run setup:browser` installe alors la version prévue pour Ubuntu 22.04, qui fonctionne ; un avertissement s'affiche pendant l'installation.

## Crédits

Les mécaniques de GeoSim sont inspirées d'OpenFront.io, mais aucun code n'en est repris (OpenFront est sous licence AGPL-3.0). Les sources de données et leurs licences seront listées dans `data/manifest.json` et `data/curated/SOURCES.md`.
