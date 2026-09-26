# Avancement

## Où on en est

| Phase                                              | Statut                                 | Date       |
| -------------------------------------------------- | -------------------------------------- | ---------- |
| Plan initial (sources vérifiées, architecture)     | validé                                 | 2026-09-25 |
| 0 — Fondations                                     | terminée                               | 2026-09-25 |
| 1a — Géographie et carte                           | terminée                               | 2026-09-25 |
| 1b — Données pays et fichiers curés                | terminée                               | 2026-09-25 |
| 2 — Carte interactive (lecture seule)              | **terminée**, en attente de validation | 2026-09-26 |
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

## Phase 1b — Données pays et fichiers curés (2026-09-25)

**Fait**

- Catalogue des paramètres (`packages/shared/src/params/catalog.ts`) : 279 paramètres alignés sur `PARAMETRES.md` (identifiants, libellés, types vérifiés par un test), avec unité, plage, source et systèmes consommateurs ; 15 plages élargies aux données réelles (D30).
- Sources automatisées téléchargées, mises en cache et tracées : Banque mondiale (58 indicateurs WDI, WGI), FMI (WEO d'avril 2026), Our World in Data (énergie, V-Dem), FAOSTAT (bilans céréaliers, engrais), HCR, CEPII BACI HS22 (2024), points idéaux de l'AGNU, PNUD ; codes vérifiés et remplacements documentés (D9, D28).
- 208 entités : 195 États, 8 entités de facto (dont Abkhazie, Ossétie du Sud, Transnistrie) et 5 factions (Forces de soutien rapide, Houthis, Armée nationale libyenne, AFC/M23, Armée d'Arakan) ; 44 pays au niveau de détail complet.
- Zones de contrôle (`control_zones.geojson`, 19 zones datées) appliquées à la carte : contrôle de facto (`owner`) et souveraineté de jure (`sovereign`) — Crimée et territoires ukrainiens occupés (ligne de front du 24/09/2026), Sahara occidental, Golan, Liban Sud, Gaza, Darfour, Nord du Yémen et Mokha, Est libyen, Kivu, Arakan…
- Population et valeur économique par pixel (noyaux urbains + habitabilité rurale ; `land-4096.bin.gz`), totaux nationaux conservés à 10⁻¹² près (8,216 milliards d'habitants).
- `data/build/countries.base.json` : chaque paramètre pays de chaque entité avec source, année ou date, confiance et méthode (source, repli, curé, dérivé, carte, médiane régionale, hypothèse, zéro documenté, sans objet) ; aucune lacune. `pairs.base.json` : 14 paramètres bilatéraux (commerce, dépendances, traités, sanctions, droits de douane, revendications, bases, guerres, reconnaissance, relations, frontières, distances). `world.base.json` : prix et paramètres mondiaux, blocs, traités, conflits, sanctions, différends, bases, liaisons énergétiques, minerais, semi-conducteurs, céréales, détroits (statut et trafic), zones.
- Fichiers curés datés et sourcés (§5.2), vérifiés par recherche web au 25/09/2026 : conflits (38), blocs (27), traités (30), nucléaire (SIPRI 2026), capacités militaires, sanctions et droits de douane, différends, revendications, séparatismes, fortifications, élections, bases, liaisons énergétiques, détroits (statut et trafic), minerais (USGS 2026), céréales (WASDE de septembre 2026), semi-conducteurs, prix mondiaux, tables pays (notations, régimes de change, effectifs militaires, contrôle de l'information, fractionnement…), hypothèses par défaut (`defaults.yaml`) ; sources listées dans `data/curated/SOURCES.md`.
- Profils décisionnels des 44 pays au niveau complet (`profiles.yaml`, une justification par valeur, profils d'alternance pour 8 démocraties) et 148 relations initiales (`relations_seed.yaml`) : **hypothèses à valider**.
- `data/build/report.md` : couverture par paramètre (source, année médiane, données anciennes, replis), valeurs estimées des pays clés, lacunes, alertes, zones appliquées.
- `npm run data -- --skip-map` : itérations sur les données pays sans reconstruire la carte (≈ 40 s).

**Vérifications** : `npm run typecheck`, `npm test` (124 tests : unitaires + invariants sur la carte et les données construites : provenance de chaque valeur, pas de NaN ni d'infini, bornes du catalogue, populations ≥ 0 et conservées, paires sans doublon), `npm run lint`, `npm run format:check`, `npm run check:console`. Construction complète depuis zéro, puis second passage hors ligne (aucun téléchargement).

**Comment tester**

1. `npm run data` (≈ 500 Mo de sources supplémentaires au premier passage, puis ≈ 4 min à 4096 px).
2. Ouvrir `data/build/report.md` (couverture et alertes) et `data/build/map/preview-population-4096.png`.
3. Consulter une valeur et sa provenance, par exemple : `node -e "const c=require('./data/build/countries.base.json'); console.log(c.entities.find(e=>e.id==='UKR').params['geo.area_controlled'])"`.
4. `npm test` : les invariants des données construites s'exécutent.

**À valider par toi**

- Profils décisionnels et relations initiales (D35) : hypothèses sur les gouvernements, chacune justifiée.
- Ligne de front ukrainienne dérivée de DeepStateMap (D31) : licence à confirmer, surtout si le dépôt est public.
- Souveraineté de jure du Sahara occidental attribuée à la RASD (D32).
- Estimations de confiance faible signalées dans le rapport (médianes régionales, dont la démographie de Taïwan ; entités de facto).

**Limites connues**

- Données anciennes signalées : rentes des ressources (2021), capital humain (2020), production d'hydrocarbures des petits producteurs (2016).
- Consommations d'hydrocarbures hors Energy Institute (≈ 130 pays) : médianes régionales par habitant.
- Paramètres `HYP` du catalogue (cyber, espace, ouverture migratoire, qualité logistique…) : hypothèses par défaut, à calibrer en phase 8.
- Jérusalem-Est (70 km²) est sous la résolution de la carte : souveraineté de jure consignée dans les métadonnées, sans pixel.
- Population par pixel non calibrée sur une grille de référence (GPW, WorldPop) ; biomes climatiques.
- Zones de contrôle statiques jusqu'à la phase 5 (fronts).

## Phase 2 — Carte interactive en lecture seule (2026-09-26)

**Fait**

- Données servies par l'API locale (`/api/data/status`, `/api/data/files/<nom>`, liste blanche de `data/build/`) et chargées en flux (décompression `DecompressionStream`), avec contrôle de cohérence des builds (D37). Contrat des fichiers de données déplacé dans `@geosim/shared` (D38).
- Rendu WebGL2 (D1, D39) : couches de la grille en textures, palette par entité, relief ombré, bordures fines à toute échelle, anticrénelage au dézoom, hachures là où contrôle et souveraineté diffèrent, contour du globe. Palette politique où deux voisins n'ont jamais la même couleur. Surcouche 2D : noms des pays (taille selon la surface, sans chevauchement ; territoires dépendants en italique, D44), capitales et villes selon le zoom.
- Navigation : glisser, molette (zoom vers le curseur), double-clic (zoom), flèches du clavier, `+`/`−`, `Origine` (vue d'ensemble) ; survol (infobulle : nom, cinq indicateurs clés avec leur année, valeur de la couche, relation avec le pays sélectionné, détail du pixel) ; clic (sélection), Maj+clic (second pays), Échap. Rendu à la demande uniquement.
- Dix couches (touches 1–9 et 0, D40) : politique, souveraineté de jure, relations, blocs et alliances, indicateurs (tout paramètre pays du catalogue ; valeurs estimées en pointillés), sanctions, population, terrain et biomes, infrastructures, mer (zones maritimes, routes des principaux flux, statut des détroits). Légende dynamique pour chacune.
- Inspecteur généré depuis le catalogue : aperçu (indicateurs clés, géographie, voisins, appartenances, conflits, zones de contrôle) puis un onglet par catégorie de `PARAMETRES.md` ; chaque paramètre avec sa valeur, un badge « source · année » coloré selon la confiance, et au clic sa provenance complète (source et liens, date, confiance, méthode, note, écrêtage, définition, fiche du catalogue). Recherche de paramètre, filtres « estimés » et « anciens ». Vecteurs détaillés (domaines, postes, minerais…).
- Panneau bilatéral A ↔ B (Maj+clic, ou Maj+Entrée dans la recherche) : chaque paramètre bilatéral dans les deux sens, avec sa source ; panneau Monde : paramètres mondiaux sourcés, détroits, conflits.
- Recherche de pays (Ctrl+K ou `/`) insensible aux accents, par nom français, anglais ou code ; Entrée cadre la carte sur le pays (composante de la capitale, D44).
- Dérivés par définition (PIB par habitant, indice de misère) dans le moteur, avec provenance composée (D41, MODELES §2.4) ; libellés des valeurs catégorielles et des composantes dans le paquet partagé (D42).
- `world.base.json` : position des marqueurs de détroits (D45).
- `npm run check:console` parcourt désormais toute l'interface (D46) ; `?debug` affiche le temps GPU et la cadence d'images.

**Vérifications** : `npm run typecheck`, `npm test` (39 fichiers, 185 tests, dont les invariants de l'interface sur les données construites : chaque paramètre de chaque entité a une source et une date, chaque couche et chacun des indicateurs se construit sans couleur invalide), `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:console` (10 couches, recherche, inspecteur et ses 15 onglets, panneau bilatéral, panneau Monde : aucune erreur ni aucun avertissement).

**Comment tester**

1. Si tes données datent de la phase 1b : `npm run data -- --skip-map` (≈ 40 s, ajoute la position des détroits) ; sinon `npm run data`.
2. `npm run dev`, puis http://localhost:5173 (chargement ≈ 150 Mo décompressés, quelques secondes).
3. Survole et clique des pays ; Ctrl+K « Taïwan » puis Entrée ; parcours les onglets et clique un paramètre pour voir sa provenance ; Maj+clic sur un voisin pour la relation bilatérale.
4. Touches 1 à 0 pour les couches ; en couche 5, choisis un indicateur dans la liste (ex. « Ogives nucléaires », « Type de régime »).
5. Fluidité : http://localhost:5173/?debug affiche le temps GPU par image et la cadence pendant un déplacement.

**À valider par toi**

- La fluidité à 4096 px sur ta machine (`?debug`) : ce conteneur n'a pas de GPU (rendu logiciel, ≈ 4 images/s), je n'ai donc pas pu la mesurer en conditions réelles.
- Drapeaux absents de l'infobulle (D43) : pastille de couleur à la place ; dis-moi si tu veux un jeu de drapeaux (dépendance et licence à choisir).
- Points de la phase 1b toujours ouverts : profils décisionnels et relations initiales (D35), ligne de front DeepStateMap (D31), Sahara occidental (D32).

**Limites connues**

- Lecture seule : aucune modification de paramètre (phase 3).
- Croissance, puissance militaire, dépendance énergétique et autres dérivés : « moteur (phase 3) ».
- Relations : 148 paires initiales seulement ; les autres attendent le modèle d'affinité (phase 4).
- Pas encore de flux commerciaux animés, bases à l'étranger, revendications ni séparatismes dessinés (phases 4 à 6).
- Chargement sur le fil principal : quelques centaines de millisecondes de calcul à l'ouverture (emprises, étiquettes, textures).
- Écran d'ordinateur uniquement (pas de gestes tactiles).

## Prochaines étapes (phase 3)

Moteur et temps réel (SPEC §12) : worker, boucle, vitesses, pas-à-pas, commandes, journal, captures ; couches de valeur (surcharge, verrou, réinitialisation, modificateurs) ; édition en direct dans l'inspecteur ; onglet Modèle avec rechargement à chaud ; démographie, économie, budget, dette, inflation, chômage, marchés simplifiés ; graphiques.
