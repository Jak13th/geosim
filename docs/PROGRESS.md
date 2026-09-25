# Avancement

## Où on en est

| Phase                                              | Statut                                 | Date       |
| -------------------------------------------------- | -------------------------------------- | ---------- |
| Plan initial (sources vérifiées, architecture)     | validé                                 | 2026-09-25 |
| 0 — Fondations                                     | **terminée**, en attente de validation | 2026-09-25 |
| 1a — Géographie et carte                           | à faire                                |            |
| 1b — Données pays et fichiers curés                | à faire                                |            |
| 2 — Carte interactive (lecture seule)              | à faire                                |            |
| 3 — Moteur et temps réel                           | à faire                                |            |
| 4 — Monde interconnecté                            | à faire                                |            |
| 5 — Forces armées et guerre                        | à faire                                |            |
| 6 — Escalade, nucléaire, cyber, espace, événements | à faire                                |            |
| 7 — IA des pays et mode joueur                     | à faire                                |            |
| 8 — Scénarios, branches, Monte Carlo, calibration  | à faire                                |            |

La phase 1 est découpée en deux jalons avec arrêt (voir `DECISIONS.md`).

## Phase 0 — Fondations (2026-09-25)

**Fait**

- Monorepo npm workspaces : `packages/shared`, `packages/engine`, `apps/web`, `apps/cli`, `scripts/data`.
- TypeScript 6.0 `strict` (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), typecheck par workspace.
- Garde-fous d'architecture vérifiés par un test négatif :
  - le `tsconfig` du moteur n'a ni DOM ni types Node ;
  - ESLint interdit dans le moteur et le paquet partagé : `Math.random`, `Date.now`, `new Date()`, `performance`, les minuteries, `window`, `document`, `process`, `fetch`, et les imports `node:*` et React.
- Moteur : RNG xoshiro128** à graine, avec flux par système, sauvegarde et restauration d'état ; vérifié contre l'implémentation C de référence.
- Paquet partagé : types du catalogue (`ParamDef`, provenance, confiance) et catégories. Un test vérifie qu'elles suivent les sections de `PARAMETRES.md`.
- Interface : Vite 8 + React 19, page « GeoSim » ; le moteur tourne dans un Web Worker (Comlink) et répond au chargement.
- Serveur local : plugin Vite (`/api/health`), qui n'écoute que sur 127.0.0.1.
- CLI (`npm run sim`) et pipeline (`npm run data`) : points d'entrée qui lisent leurs arguments.
- `npm run check:console` : démarre l'application dans Chromium headless et échoue en cas d'erreur ou d'avertissement dans la console.
- Squelettes : `config/model.yaml`, `config/events.yaml`, `data/manifest.json`, `data/curated/SOURCES.md`, `docs/`.

**Vérifications** : `npm run typecheck`, `npm test` (10 tests), `npm run lint`, `prettier --check`, `npm run build` et `npm run check:console` passent.

**Limites connues**

- Sous Ubuntu 20.04, Playwright n'est plus officiellement supporté : `npm run setup:browser` force la cible ubuntu22.04 (fonctionne, avec un avertissement).

## Prochaines étapes (phase 1a)

1. Téléchargements avec cache et `data/manifest.json` (Natural Earth 10m, WorldClim 2.1 5′).
2. Projection Equal Earth et rasterisation scanline des pays (owner, sovereign), avec antiméridien et micro-États.
3. Terrain, biomes, fleuves, zones urbaines, infrastructures ; flags (côte, frontière, capitale, port…).
4. Adjacences et longueurs de frontière ; grille océanique, zones maritimes, routes et détroits.
5. Export binaire de la carte, aperçu PNG, tests de surface par pays.
