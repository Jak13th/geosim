# Avancement

## Où on en est

| Phase                                              | Statut                                 | Date       |
| -------------------------------------------------- | -------------------------------------- | ---------- |
| Plan initial (sources vérifiées, architecture)     | validé                                 | 2026-09-25 |
| 0 — Fondations                                     | terminée                               | 2026-09-25 |
| 1a — Géographie et carte                           | terminée                               | 2026-09-25 |
| 1b — Données pays et fichiers curés                | terminée                               | 2026-09-25 |
| 2 — Carte interactive (lecture seule)              | terminée                               | 2026-09-26 |
| 3 — Moteur et temps réel                           | terminée                               | 2026-09-26 |
| 4 — Monde interconnecté                            | **terminée**, en attente de validation | 2026-09-26 |
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

## Phase 3 — Moteur et temps réel (2026-09-26)

**Fait**

- **Moteur** (`packages/engine`, pur et déterministe) : état vectorisé en trois couches — donnée réelle, valeur courante, valeur effective avec modificateurs à durée et décroissance (D48) ; tick quotidien, systèmes mensuels le 1er du mois, dérivés recalculés après chaque commande ; commandes validées contre le catalogue et journalisées avec leurs effets et leur inverse (annuler, rétablir) ; événements journalisés avec leurs facteurs explicatifs ; empreinte d'état de 64 bits ; relecture du journal ; captures sérialisées ; historique mensuel ; invariants (MODELES §3).
- **Systèmes** calés sur la situation initiale (D49) : démographie par tranches d'âge (§4) ; économie — croissance potentielle et de long terme, cycle avec contagion commerciale et chocs énergétiques, PIB, inflation, chômage, rentes, solde courant, réserves, crises de balance des paiements (§5) ; budget, dette, fonds souverains, règle budgétaire provisoire, taux souverains, notation, défauts et restructurations (§5.6–5.9) ; marchés simplifiés du pétrole (capacité inutilisée de l'OPEP+), du gaz en trois zones (arbitrage du GNL), du charbon, du blé, des engrais, des métaux critiques et des puces (§6) ; comptes dérivés et croissance mondiale (§7). 196 coefficients dans `config/model.yaml`, chacun avec valeur, plage, unité et description.
- **Données** : nouveaux paramètres (croissance de long terme, écart de production, taux moyen de la dette, probabilité de défaut, défaut en cours, réserves en mois d'importations, autres dépenses, ajustement budgétaire, intérêts) et natures alignées sur le moteur (D54) ; solde migratoire moyen sur dix ans (D52) ; taux moyen de la dette depuis la Banque mondiale, l'API du FMI étant inaccessible pour cette série (D53) ; agrégats de la Banque mondiale exclus (collision d'un code de pays), parts d'âge normalisées, consommations d'hydrocarbures manquantes par part de l'énergie primaire.
- **Temps réel** (`apps/web/src/sim/`) : le moteur tourne dans un Web Worker, par tranches courtes ; vitesses de 1 jour à 3 mois par seconde, pas-à-pas (jour, semaine, mois), « avancer jusqu'à une date » ; images à 5 Hz avec tableaux transférés, et aussitôt après chaque commande ; une erreur du moteur met la simulation en pause et s'affiche (D58, D59).
- **API locale** : `config/model.yaml` lu, enregistré (seules les lignes `value:` changent) et rechargé à chaud par une commande journalisée (D60) ; captures dans `captures/` (hors git), écritures réservées à l'interface locale (D61).
- **Interface** : barre de temps (date simulée, lecture, vitesses, pas-à-pas, aller à une date, annuler et rétablir, indicateurs mondiaux) ; inspecteur éditable — curseur (logarithmique pour population, PIB…) et champ, liste, case, vecteur ; réinitialiser, verrouiller, effet temporaire, édition groupée (bloc, région, tous) ; badges « modifiée », « simulée », « calcul » (D65) ; filtres « Modifiés » et « Favoris » ; trajectoires et historique de chaque paramètre ; panneau bilatéral et paramètres mondiaux éditables, statut des détroits ; onglet Modèle (coefficients en direct, enregistrement, rechargement) ; onglet Simulation (graine, nouvelle simulation, captures, vérification de la relecture) ; journal filtrable avec « Pourquoi ? », effets et coefficients ; graphiques uPlot par pays et mondiaux, export CSV (D62) ; couches de la carte en direct, échelles calées sur le départ (D63) ; raccourcis espace, `+`/`−`, `Ctrl+Z`, `Ctrl+Y`.
- **CLI** : `npm run sim -- --years 20 --runs 5 --seed 1 --out results/essai` écrit séries par pays et mondiales (CSV), journal des événements et résumé (empreinte, invariants, croissance mondiale par an, pays clés).
- **Calibration** : premiers résultats (5 runs de 20 ans, sensibilité ±50 % sur 30 coefficients) dans `docs/CALIBRATION.md`. La sensibilité a révélé des références de calage figées avec les anciens coefficients (saut artificiel des taux quand on modifiait un coefficient en cours de partie) et un taux moyen non réinitialisé après restructuration : corrigés et testés.

**Critères de fin de phase**

- 20 ans sans NaN ni divergence : 5 runs de 20 ans sur les données réelles, aucune violation d'invariant, croissance mondiale de 3,2 % la première année à ≈ 2 % la vingtième, 30 à 40 défauts souverains par run (CALIBRATION.md) ; test automatique de 20 ans (`engine.built.test.ts`).
- Un curseur modifié infléchit aussitôt la trajectoire : la valeur et les dérivés changent dès la commande (image immédiate), la trajectoire au pas mensuel suivant ; tests « une modification est visible aussitôt et infléchit la trajectoire » (même graine, seule la modification sépare les deux trajectoires) ; visible dans les mini-graphes et les graphiques.
- La relecture du journal donne une empreinte identique : tests du moteur (fixture et 20 ans de données réelles), du pilote du worker, et bouton « Vérifier la relecture » parcouru par `check:console`.

**Vérifications** : `npm run typecheck`, `npm test` (48 fichiers, 266 tests), `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:console` (couches, navigation, recherche, inspecteur, panneau bilatéral, puis pas-à-pas, lecture à 3 mois/s — 180 jours en 2 s —, édition en direct avec verrou, effet temporaire et édition groupée, annuler et rétablir, « avancer jusqu'à », graphiques, journal, effet sur le pétrole et fermeture d'Ormuz, coefficient modifié puis rechargé, capture et restauration, enregistrement sur le disque, relecture identique : aucune erreur ni aucun avertissement). Prévisualisation du build de production vérifiée dans Chromium.

**Comment tester**

1. `npm install` (nouvelle dépendance : uPlot), puis `npm run data -- --skip-map` (nouveaux indicateurs de la Banque mondiale et règles des données, ≈ 1 min) ; ou `npm run data` complet.
2. `npm run dev`, puis http://localhost:5173 ; le moteur démarre une fois la carte chargée (« Moteur 0.3.0 » en haut à droite).
3. Espace pour lancer, `+`/`−` pour la vitesse. Ctrl+K « France », onglet « Budget de l'État », clic sur « Défense », curseur à 5 % : la valeur et le solde changent aussitôt ; « Graphiques » → « Dette publique brute » : la trajectoire s'infléchit au mois suivant ; Ctrl+Z annule.
4. « Monde » : effet temporaire ×1,5 sur le Brent, statut d'un détroit ; « Journal » : clique un défaut souverain pour son « Pourquoi ? ».
5. « Modèle » : modifie un coefficient, puis « Enregistrer dans le fichier » (`git diff config/model.yaml` : une seule ligne) ; modifie `config/model.yaml` dans un éditeur : l'interface le recharge et l'annonce.
6. « Simulation » : « Capturer », avance, « restaurer » ; « Vérifier la relecture » → « Identique ».
7. Sans interface : `npm run sim -- --years 20 --runs 5 --seed 1 --out results/essai`, puis `results/essai/summary.json`.

**À valider par toi**

- Les coefficients par défaut de `config/model.yaml` (points de départ, pas des vérités) : en particulier la croissance de long terme, qui passe sous les projections du FMI au-delà de trois ans (≈ 2,3 % contre 3,1 % en 2031), et l'amplitude des cycles (CALIBRATION.md). À recalibrer maintenant ou en phase 8, selon ta préférence.
- La règle budgétaire provisoire (D57) et le modèle de défaut souverain (D56).
- Points des phases précédentes toujours ouverts : profils décisionnels et relations initiales (D35), ligne de front DeepStateMap (D31), Sahara occidental (D32), drapeaux (D43).

**Limites connues**

- Économie simplifiée : pas de secteur bancaire ni de change explicite hors crises ; politique monétaire résumée par l'ancrage des anticipations et le taux directeur mondial ; règle budgétaire uniforme.
- Commerce, sanctions, relations et statut des détroits n'agissent pas encore sur l'économie (phase 4) : fermer Ormuz se journalise mais ne change pas les prix ; les paramètres politiques, militaires et stratégiques restent constants et ceux qui ne sont pas encore calculés portent le badge « phase N ».
- Écarts de calibration relevés : chômage du Nigeria (donnée de 2018), taux de l'Argentine au plancher, dérive de la dette ukrainienne si l'on accentue fortement la pente des primes de risque (financements officiels absents avant la phase 4).
- Le rechargement à chaud de `config/model.yaml` suppose `npm run dev` ; en prévisualisation du build, bouton « Recharger le fichier ».
- Une capture ne se restaure que sur les mêmes données ; le format de scénario versionné viendra en phase 8.
- Ce conteneur n'a pas de GPU : fluidité de la carte mesurée en rendu logiciel uniquement (≈ 4 images/s) ; le moteur, lui, tourne dans son worker sans bloquer l'interface.

## Phase 4 — Monde interconnecté (2026-09-26)

**Fait**

- **Commerce, routes et détroits** (`systems/trade.ts`, MODELES §8) : échanges bilatéraux par gravité, calés sur le commerce observé (BACI) ; part terrestre, route maritime principale et contournement, capacité de passage des détroits qui suit leur statut ; frictions (droits de douane, sanctions par volet, guerre, bloc commercial, relations, fragmentation) mesurées par rapport au départ (D66) ; réorientation du commerce perdu selon sa cause ; effets sur l'activité (demande extérieure), le niveau du PIB (gains à l'échange), les prix importés et le solde courant.
- **Énergie** (§10) : approvisionnement de chaque importateur par fournisseur, flux établis (D77), remplacement, stocks stratégiques, pénuries expliquées par les fournisseurs perdus ; production des exportateurs bloqués en baisse, avec effet de niveau sur leur PIB (D78) ; capacité inutilisée de l'OPEP+ mobilisable seulement si elle peut passer ; prix structurel du pétrole (D68).
- **Alimentation et produits critiques** (§11) : tension alimentaire, surmortalité de famine dans les pays pauvres, facture du blé (D80) ; puces avancées et terres rares par fournisseur (routes, sanctions, restrictions, guerre).
- **Sanctions** (§9) : six volets par paire (commerce, finance, technologie, énergie, élites, transport) ; pression financière par groupe monétaire, sanctions secondaires, contournement qui mûrit, gel des réserves, contrôles technologiques ; choc financier, prime de risque, frein technologique, pression sur les élites.
- **Relations, blocs et ONU** (§12) : affinité structurelle en 14 facteurs ; relation = affinité + résidu de calage + mémoire des chocs (D72) ; griefs et proximités culturelles curés (D85) ; commande `bloc` (adhésion, retrait : traités, sanctions communes ; suspension de l'UA et de la CEDEAO après un coup) (D71, D73) ; commande `unResolution` : vote du Conseil de sécurité avec veto, Assemblée générale sinon, effets (sanctions appliquées par les États, condamnation, maintien de la paix, cessez-le-feu consigné).
- **Politique intérieure** (§13) : stabilité et approbation calées sur le départ, légitimité, cohésion, insurrection et guerres civiles simples (D75, D76), contestation (manifestations, crise, soulèvement) ; élections à leur date, qui changent le profil décisionnel en cas d'alternance (D67, D70) ; coups d'État, transition des juntes, successions, révolutions (D86) ; tirages désignés par une clé (D69).
- **Réfugiés** (§14) : pression de départ mesurée par rapport au départ, zone morte, destinations par gravité (population, proximité, revenu, stabilité, ouverture, hostilité), personnes transférées avec leur structure par âge, coût budgétaire et charge d'accueil (D74).
- **Scénarios et explications** (§15, D81, D82) : cinq scénarios d'expérience comparés à leur référence de même graine ; « Pourquoi ? » calculé par le moteur à la demande.
- **Données** : 6 nouveaux paramètres (accès des routes, pénurie d'énergie, tension alimentaire, contestation ; capacité de passage et flux des détroits) ; `pair_ties.yaml` (50 griefs, 124 proximités, hypothèses) ; élections ramenées à celles qui désignent l'exécutif (États-Unis 2028, Japon, Corée du Sud, Mexique) ; règle de suspension après un coup (UA, CEDEAO) ; routes compactes dans `pairs.base.json`.
- **Coefficients** : 426 dans `config/model.yaml` (196 en phase 3), chacun avec valeur, plage, unité et description.
- **Interface** : « Pourquoi ? » d'un pays (stabilité, approbation, risque de coup, gains à l'échange, énergie et fournisseurs perdus, sanctions et contournement, pression de départ) et d'une paire (affinité décomposée, résidu, mémoire), avec sanctions larges ou levée en un clic ; appartenances aux blocs en direct (adhérer, quitter) ; résolutions de l'ONU (onglet Monde) ; détroits avec capacité et flux ; couche des blocs en direct ; journal des nouveaux événements avec leurs facteurs ; badge « phase N » des paramètres encore sans valeur.
- **CLI** : `--scenario <nom>` déroule un scénario et sa référence, écrit leurs séries et journaux et un rapport `report.md` (écarts, événements propres au scénario et leurs facteurs) ; séries CSV étendues (échanges, pénurie d'énergie, stocks, tension alimentaire, stabilité, soutien, insurrection, réfugiés).
- **Performances** : coefficients et distances hors des boucles N × N (D84) ; 20 ans simulés en ≈ 16 s sans interface.

**Critères de fin de phase** : quatre tests qualitativement plausibles et expliqués (graine 1, écarts à la référence de même graine ; détails dans CALIBRATION.md, tests automatiques dans `scenarios.built.test.ts`) :

- **(a) Fermeture d'Ormuz pendant trois mois** (`ormuz-avant-guerre`, détroit rouvert au préalable) : Brent +14 $ au pic, puis retour ; PIB de l'Arabie saoudite −11 %, du Qatar −35 %, rattrapés à la réouverture ; écart de production de l'Inde −2,7 et du Pakistan −2,1 points ; stocks stratégiques du Japon et de la Corée entamés, ceux de l'Inde et du Pakistan vidés, pénuries de 4,8 et 3,5 % expliquées par les fournisseurs du Golfe perdus ; la Norvège gagne. À partir de la situation actuelle (`ormuz`, trafic déjà réduit à ≈ 15 %), l'effet marginal est faible (Brent +1,8 $).
- **(b) Sanctions financières et commerciales larges contre la Chine** (`sanctions-chine`) : écart de production chinois −3,9 points, PIB −4,3 % au pic, exportations −5,2 points de PIB ; coût pour les émetteurs (Corée −1,4, Japon −0,55, Allemagne −0,44, États-Unis −0,13) ; croissance mondiale −1 point au pic ; relations de la Chine en baisse avec les émetteurs, inchangées avec la Russie, l'Inde et le Brésil.
- **(c) Doublement du prix du blé** (`ble-x2`) : tension alimentaire et inflation (+5,5 points) chez les importateurs pauvres, instabilité (Égypte −5,9, Liban −8,8), famines expliquées dans 15 pays pauvres, manifestations et soulèvements, réfugiés yéménites ; effets faibles chez les pays riches.
- **(d) Élection qui change le profil d'un grand pays** (`election-usa`) : alternance aux États-Unis le 07/11/2028, le profil d'opposition devient le profil du gouvernement (loyauté envers les alliés 45 → 75, révisionnisme 45 → 15, agressivité 60 → 30) ; relations avec les alliés en hausse (Canada +21, Danemark +18, France +14, Allemagne +13).

**Vérifications** : `npm run typecheck`, `npm test` (50 fichiers, 294 tests, dont les tests d'acceptation (a) à (d) sur les données construites), `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:console` (phase 3, plus « Pourquoi ? » d'un pays, adhésion puis retrait d'un bloc, affinité d'une paire, Ormuz fermé avec capacité et flux, résolution de l'ONU : aucune erreur ni aucun avertissement). Référence de 5 runs de 20 ans sans violation d'invariant ; sensibilité ±50 % sur 31 coefficients de la phase 4 (CALIBRATION.md).

**Comment tester**

1. `npm run data -- --skip-map` (nouvelles données : griefs et proximités, élections, routes compactes ; ≈ 1 min), ou `npm run data` complet.
2. `npm run dev`, puis http://localhost:5173 (« Moteur 0.4.0 » en haut à droite).
3. Ormuz : onglet « Monde », détroit d'Ormuz sur « ouvert », « avancer jusqu'à » quelques mois (le trafic se rétablit), puis « fermé » et lecture : le Brent monte ; Ctrl+K « Inde » : « Pourquoi ? » montre l'énergie perdue par fournisseur et le soutien au gouvernement ; « Journal » : pénuries d'énergie et leurs facteurs.
4. Sanctions : Ctrl+K « Chine », puis Ctrl+K « États-Unis » et Maj+Entrée : panneau bilatéral, « Sanctions larges USA → CHN » ; l'affinité et la relation se décomposent, les échanges de la Chine baissent au fil des mois (« Graphiques »).
5. Blé : onglet « Monde », prix du blé, « Effet temporaire » ×2 sur 365 jours ; « Pourquoi ? » de l'Égypte ou du Liban : tension alimentaire dans la stabilité ; journal : famines et manifestations.
6. Élection : « avancer jusqu'au » 08/11/2028 : le journal consigne l'élection présidentielle américaine avec son « Pourquoi ? » (soutien au gouvernement sortant, compétitivité, probabilité d'alternance) ; en cas d'alternance, les paramètres du profil décisionnel des États-Unis ont changé. Pour la forcer, fixe et verrouille le « Soutien au gouvernement » à 10 % quelques jours avant.
7. Blocs et ONU : « Appartenances » d'un pays (adhérer, quitter) ; onglet « Monde », section ONU : résolution contre un pays, votes et veto consignés.
8. Sans interface : `npm run sim -- --scenario ormuz-avant-guerre --seed 1 --out results/ormuz`, puis `results/ormuz/run/report.md` ; de même `ormuz`, `sanctions-chine`, `ble-x2`, `election-usa`.

**À valider par toi**

- Les hypothèses curées : `pair_ties.yaml` (50 griefs et 124 proximités culturelles, D85), les profils d'opposition (`profiles.yaml`) qui remplacent le profil décisionnel en cas d'alternance, les dates d'élection retenues (D67).
- Les coefficients de la phase 4 (points de départ) et les choix D66 à D86, en particulier : prix structurel du pétrole (D68), flux énergétiques établis (D77), hydrocarbures en effet de niveau (D78), réfugiés (D74), coups d'État (facteur de revenu, transition des juntes, D86).
- Les hypothèses par défaut sans donnée curée : risque de succession non planifiée (`pol.succession_risk`, 1 à 8 %/an selon le régime : 3,2 successions par an), loyauté de l'armée (70 pour tous les régimes hybrides), ouverture migratoire. Proposition : curer la loyauté de l'armée (V-Dem, dimension militaire) et l'historique des coups (Powell et Thyne) pour les pays à risque.
- Points des phases précédentes toujours ouverts : profils décisionnels et relations initiales (D35), ligne de front DeepStateMap (D31), Sahara occidental (D32), drapeaux (D43), coefficients de la phase 3 (croissance de long terme sous les projections du FMI).

**Limites connues**

- Pas de prime de précaution sur le pétrole : le prix monte au rythme de l'ajustement, pas dès l'annonce d'une fermeture (+14 $ pour trois mois de fermeture totale, amortis par les stocks et la capacité inutilisée).
- Les pays ne décident pas encore (IA en phase 7) : sanctions, adhésions, résolutions et contre-mesures viennent de l'utilisateur ou des scénarios ; la réorientation du commerce est agrégée par pays (pas de nouveaux partenaires nommés).
- Guerres civiles sans faction armée ni soutien extérieur, soutien à la guerre et cessez-le-feu sans effet sur les combats : phase 5.
- Après une alternance, la relation États-Unis → Ukraine baisse légèrement (−5,7) : l'alternance efface la moitié du résidu de calage, et l'aide ne compte dans l'affinité que pour son destinataire.
- Coups d'État : 2,0 par an (1,5 à 2,2 dans les décennies récentes), mais encore 1,2 %/an pour de grandes autocraties électorales pauvres sans tradition de coup (Inde), faute d'historique des coups et de loyauté de l'armée curée.
- Effet de base du glissement annuel après un choc de niveau (Qatar : +47 points de croissance un an après la réouverture d'Ormuz).
- Un seul produit alimentaire (le blé) ; pas d'eau ni de sécheresse (phase 6) ; électricité et réseaux de gazoducs implicites dans les dépendances bilatérales.
- Réouverture ou fermeture des passages terrestres (frontières) non modélisée ; pas de migrations économiques.

## Prochaines étapes (phase 5)

Forces armées et guerre (SPEC §12) : capital militaire, mobilisation, industrie et munitions, projection ; fronts pixel par pixel (terrain, fortifications, ravitaillement, encerclements, saisons) ; air, mer, blocus, débarquements ; occupation, pertes, réfugiés ; négociations et paix ; animations. S'y rattacheront les factions issues des guerres civiles, le soutien à la guerre et l'effet des cessez-le-feu de l'ONU sur les combats.
