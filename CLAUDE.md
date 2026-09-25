# GeoSim — instructions permanentes

GeoSim est une simulation géopolitique **locale** et **temps réel**, inspirée du jeu OpenFront.io, alimentée par des données réelles, où chaque paramètre se modifie pendant que la simulation tourne.

## Documents de référence
- `SPEC.md` : spécification complète (vision, architecture, modèles, interface, phases). Relis la section concernée avant chaque phase.
- `PARAMETRES.md` : catalogue des paramètres, source de vérité initiale du schéma.
- `docs/PROGRESS.md` : état d'avancement. **Lis-le au début de chaque session** et mets-le à jour à la fin de chaque phase.
- `docs/DECISIONS.md` : journal des choix de conception (date, décision, alternatives écartées, raison).
- `docs/MODELES.md` : équations et hypothèses de chaque système, tenues à jour avec le code.

## Langue
- Interface et documentation : français.
- Code, identifiants, noms de fichiers : anglais.
- Commentaires des systèmes de simulation : français (ils expliquent les hypothèses).

## Règles d'architecture (non négociables)
1. `packages/engine` ne dépend jamais du DOM, de React ni d'API propres à Node : il tourne à l'identique dans un Web Worker et dans la CLI.
2. Déterminisme : jamais `Math.random()`, `Date.now()` ni `performance.now()` dans le moteur. Utilise le RNG à graine et l'horloge simulée.
3. Aucun nombre magique dans les systèmes : chaque coefficient vient de `config/model.yaml` (valeur, plage, unité, description) ; chaque donnée pays, paire, zone ou monde est déclarée dans le catalogue de paramètres.
4. Tout paramètre déclaré est modifiable depuis l'interface pendant l'exécution ; l'interface est générée depuis le catalogue.
5. Toute modification passe par une commande horodatée du moteur (journal rejouable, annuler/rétablir).
6. Chaque décision d'IA et chaque événement majeur stocke ses facteurs explicatifs (« Pourquoi ? »).

## Données
- Jamais de valeur inventée silencieusement. Toute valeur curée porte `source`, `date` et `confidence` (`high` | `medium` | `low` | `assumption`).
- Ce qui change vite (conflits, lignes de front, sanctions, adhésions, gouvernements, élections, prix) : vérifie par recherche web à la date du jour, date chaque valeur, cite la source dans `data/curated/SOURCES.md`.
- Source inaccessible : dis-le, utilise un repli documenté, marque la confiance `low`.
- Profils décisionnels : hypothèses sur des gouvernements, jamais sur des personnes ; justification d'une ligne pour chacun ; validation par moi.
- Aucun code copié d'OpenFront (licence AGPL-3.0) : inspiration des mécaniques uniquement.

## Qualité
- TypeScript `strict`, pas de `any` non justifié.
- Chaque système : tests unitaires (Vitest) + section dans `docs/MODELES.md`.
- Tests d'invariants obligatoires : pas de NaN ni d'infini, populations ≥ 0, conservation des pixels, relations dans leurs bornes, déterminisme (même graine + même journal ⇒ même hash d'état).
- Performances : rendu fluide (cible 60 images/s) ; le moteur ne bloque jamais l'interface.

## Méthode de travail
- Une phase à la fois (`SPEC.md` §12). En fin de phase : `npm run typecheck && npm test`, lance l'application et vérifie la console, commit (`feat(phase-N): …`), mets à jour `docs/PROGRESS.md`, puis donne-moi un résumé court (ce qui marche, comment le tester, limites connues) et **attends mon feu vert**.
- Ambiguïté mineure : choisis l'option la plus simple qui ne ferme pas la porte au réalisme, note-la dans `docs/DECISIONS.md` et continue. Ambiguïté coûteuse à défaire : demande-moi.
- Commence simple, enrichis ensuite : chaque système marche d'abord en version minimale et testée avant d'être raffiné.

## Commandes
Prérequis : Node ≥ 22.12. Première installation : `npm install`, puis `npm run setup:browser` (Chromium headless pour `check:console`).
- `npm run dev` : lance l'application sur http://localhost:5173 (écoute sur localhost uniquement)
- `npm test` · `npm run typecheck` · `npm run lint` · `npm run format` (Prettier)
- `npm run check:console` : démarre l'application dans Chromium headless et échoue si la console contient une erreur ou un avertissement
- `npm run build` : build de production de l'interface
- `npm run data [-- --refresh] [-- --resolution 2048|4096|8192]` : construit les données (téléchargements, cache, validation, rapport de couverture)
- `npm run sim -- --scenario <nom> --years <n> --runs <n> --seed <n> --out <dossier>` : simulations sans interface
- Fin de phase : `npm run typecheck && npm test && npm run lint && npm run check:console`

## Structure
- `packages/shared` : types, catalogue des paramètres · `packages/engine` : moteur pur (sans DOM ni Node, vérifié par tsconfig et ESLint)
- `apps/web` : interface (Vite + React, moteur dans un Web Worker, API locale dans `server/`) · `apps/cli` : simulations sans interface
- `scripts/data` : pipeline de données · `config/` : `model.yaml`, `events.yaml` · `docs/` : PROGRESS, DECISIONS, MODELES, CALIBRATION
