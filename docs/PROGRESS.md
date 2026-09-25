# Avancement

## Où on en est

| Phase                                              | Statut                                 | Date       |
| -------------------------------------------------- | -------------------------------------- | ---------- |
| Plan initial (sources vérifiées, architecture)     | validé                                 | 2026-09-25 |
| 0 — Fondations                                     | terminée                               | 2026-09-25 |
| 1a — Géographie et carte                           | **terminée**, en attente de validation | 2026-09-25 |
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

## Phase 1a — Géographie et carte (2026-09-25)

**Fait**

- `npm run data [-- --refresh] [-- --resolution 2048|4096|8192]` : téléchargements mis en cache dans `data/raw` et tracés dans `data/manifest.json` (URL, date d'accès, version relue dans l'archive, licence, taille, SHA-256) ; second passage hors ligne. Sources : Natural Earth (12 couches 10m, versions 4.1.0 à 5.1.2 selon la couche ; pays : 5.1.1) et WorldClim 2.1 (altitude et variables bioclimatiques, 5′).
- Grille Equal Earth (4096 × 1994, pixel de 70,9 km²), rasterisation par balayage pair-impair, antiméridien géré (voisinage et découpage des polygones).
- 200 entités (195 États, 5 entités de facto) et 258 unités Natural Earth, rattachées selon `data/curated/ne_units.yaml` (sourcé, daté) ; micro-États garantis d'un pixel ; bases louées (contrôle ≠ souveraineté) ; terres neutres ; 200 capitales.
- Couches : `owner`, `sovereign`, `unit`, `terrain` (mer, lac, plaine, collines, montagne, haute montagne), `biome` (7 classes), `elevation`, `urban`, `infrastructure` (routes, routes majeures, rail), `seaZone`, `flags` (côte, frontière, capitale, ville majeure, port, aéroport, détroit, fleuve). Seuils dans `config/model.yaml` (famille `geo`).
- 200 zones maritimes ; 328 frontières terrestres et 322 voisinages maritimes avec leurs longueurs ; distances entre capitales (orthodromie et voie de terre) ; façades maritimes, enclavement, répartition des terrains et biomes par entité.
- Graphe océanique, 17 détroits (`data/curated/chokepoints.yaml`, portes vérifiées à chaque build), 19 900 routes (principale et alternative évitant ses détroits), accès à la mer des pays enclavés avec pays de transit.
- Export : `data/build/map/map-4096.bin.gz` (format décrit dans `packages/shared/src/map/format.ts`), `map-4096.json`, `geo-4096.json`, `routes-4096.json`, 4 aperçus PNG et `report-4096.md` (validation, surfaces, mémoire, détroits).
- Contrôles bloquants à chaque build : surfaces rasterisées à 2 % près (écart maximal constaté : 0,9 %), chaque entité a des pixels et une capitale sur son territoire, pixels d'eau sans propriétaire, portes de détroit cohérentes.
- Mémoire mesurée (D25) : 71,7 Mo par état de simulation avec compactage, contre 138,8 Mo en grille pleine.

**Vérifications** : `npm run typecheck`, `npm test` (unitaires + invariants sur la carte construite, ignorés si `npm run data` n'a pas tourné), `npm run lint`, `prettier --check`, `npm run check:console`. Builds complets réussis à 2048, 4096 et 8192 px.

**Comment tester**

1. `npm run data` (≈ 200 Mo téléchargés la première fois, puis ≈ 2 min 40 de calcul à 4096 px).
2. Relancer `npm run data` : aucun téléchargement.
3. Ouvrir `data/build/map/report-4096.md` et les aperçus `preview-*-4096.png` (politique, terrain et biomes, infrastructures, zones maritimes et routes).
4. `npm test` : les invariants de la carte s'exécutent.

**Limites connues**

- Souveraineté de jure : `sovereign` = `owner` sauf bases louées ; Natural Earth attribue la Crimée à la Russie dans sa vue de facto. Corrections en phase 1b (D19).
- Biomes climatiques (potentiels) : terres agricoles classées « forêt », pampa en forêt, zones humides très partielles (D23).
- Frontières sinueuses sous-estimées à l'échelle du pixel (Argentine–Chili 4 900 km contre 6 700 publiés).
- Accès des pays enclavés à la mer par la côte la plus proche, pas par les corridors réels ; canal de Kiel absent.
- Construction à 4096 px : ≈ 2 min 40, dont 2 min pour les 19 900 routes ; le préréglage 8192 (≈ 4 min, carte de 523 Mo non compressée) reste expérimental.
- `routes-4096.json` pèse ≈ 10 Mo : à charger à la demande en phase 2.

## Prochaines étapes (phase 1b)

1. Données automatisées (§5.1) → `countries.base.json` : Banque mondiale, WGI, FMI, OWID, FAOSTAT, UNHCR, BACI ; codes vérifiés (D9) ; mise à jour de `PARAMETRES.md` et du catalogue.
2. Population et valeur économique par pixel (noyaux autour des villes + fond rural), totaux nationaux conservés.
3. Fichiers curés datés (§5.2), dont `control_zones.geojson` (Ukraine, Sahara occidental, Palestine, Abkhazie, Ossétie du Sud, Transnistrie…), `disputes.yaml` (souveraineté de jure, revendications), enrichissement de `chokepoints.yaml` (trafic, statut).
4. `data/build/report.md` : couverture par paramètre, valeurs estimées, alertes.
