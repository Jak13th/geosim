# GeoSim — Spécification

> Simulation géopolitique **locale** et **temps réel**, inspirée d'OpenFront.io, alimentée par des **données réelles**, où **chaque aspect de la vie réelle est un paramètre ajustable pendant que la simulation tourne**.
>
> Document destiné à Claude Code. Lis-le **en entier** avant d'écrire la moindre ligne de code.
> Catalogue des paramètres : `PARAMETRES.md`. Règles permanentes : `CLAUDE.md`.

## Sommaire

1. Vision et principes
2. Ce qu'on reprend d'OpenFront
3. Stack technique et structure du dépôt
4. Carte et géographie
5. Données
6. Modèle de données et système de paramètres
7. Moteur de simulation
8. Systèmes (modèles de référence)
9. Interface
10. Scénarios, sauvegarde et analyse
11. Qualité, tests et calibration
12. Phases de livraison
13. Méthode de travail
14. Options avancées

---

## 1. Vision et principes

**Ce que c'est.** Une application web qui tourne entièrement sur ma machine (navigateur + Node.js). Elle affiche une carte du monde en pixels où chaque pays (≈ 200 entités) évolue jour après jour selon des modèles démographiques, économiques, politiques, diplomatiques et militaires, initialisés avec des données réelles à la date du jour. Quand une guerre éclate, les frontières bougent pixel par pixel, comme dans OpenFront. Je peux tout observer, tout comprendre et tout modifier en direct.

**Modes**
- *Observateur* : tous les pays sont pilotés par l'IA.
- *Joueur* : je prends le contrôle d'un ou plusieurs pays ; l'IA me propose des options argumentées.
- *Bac à sable* : je modifie librement l'état du monde (carte, paramètres, guerres, traités, gouvernements) pendant que ça tourne.

**Principes non négociables**
1. **Tout est paramètre.** Chaque donnée pays, chaque relation bilatérale, chaque paramètre mondial et chaque coefficient de modèle se modifie depuis l'interface, pendant l'exécution. Aucun nombre magique dans le code des systèmes.
2. **Données réelles et traçables.** Chaque valeur initiale a une source, une année et un niveau de confiance. Ce qui est estimé est affiché comme tel.
3. **Explicable.** Chaque décision d'un pays et chaque événement majeur expose ses principaux facteurs (« Pourquoi ? »).
4. **Reproductible.** Même graine + mêmes actions ⇒ même histoire. Mes modifications sont des actions horodatées et rejouables.
5. **Réaliste par défaut, arcade en option.** Un curseur global « réalisme ↔ arcade » permet de retrouver le rythme nerveux d'OpenFront.

**Questions que la simulation doit permettre d'explorer** (elles servent aussi de tests d'acceptation)
- Que se passe-t-il pour l'Europe et l'Asie si un grand détroit pétrolier ferme pendant trois mois ?
- Quel effort de défense rend une invasion trop coûteuse pour l'agresseur ?
- Comment une crise de la dette d'une grande économie se propage-t-elle au reste du monde ?
- Quel est l'effet d'un blocus naval autour d'une île productrice de semi-conducteurs sur l'économie mondiale ?
- Que devient la stabilité des pays importateurs de céréales si les prix doublent ?
- Sur 200 simulations de dix ans, quelle est la probabilité d'un conflit majeur selon les profils des dirigeants ?

**Hors périmètre** : multijoueur en ligne, comptes, hébergement distant, monétisation.

---

## 2. Ce qu'on reprend d'OpenFront

OpenFront.io est un jeu de stratégie en temps réel open source (navigateur, TypeScript) de conquête de territoire sur des cartes réelles. On garde l'esprit et le « feeling » visuel, on remplace la logique de jeu par des modèles réalistes :

| OpenFront | GeoSim |
|---|---|
| Carte en grille de pixels, un propriétaire par pixel | Idem, en projection à surface égale ; contrôle *de facto* distinct de la souveraineté *de jure* |
| Expansion par vagues le long des frontières, curseur de ratio d'attaque | Fronts de guerre résolus pixel par pixel ; allocation des forces par front (curseurs) |
| Troupes et or | Démographie, économie, budget de l'État et forces armées réelles |
| Terrain (plaines, hauts plateaux, montagnes) qui ralentit l'avance | Relief, biomes, fleuves, villes, saisons, fortifications, ravitaillement |
| Villes, ports, postes de défense, silos, SAM, usines | Villes, ports, bases, fortifications, défense antiaérienne, arsenaux nucléaires, industrie |
| Navires de commerce, navires de guerre, bateaux de transport | Flux commerciaux réels sur routes maritimes, marines, capacités amphibies |
| Bombes atomiques, bombes H, MIRV, zones irradiées | Arsenaux réels avec doctrines, dissuasion, escalade et retombées |
| Alliances, embargos, dons | Traités, blocs, sanctions, aide militaire et financière |
| Nations contrôlées par des bots | IA de pays avec profil décisionnel, perception imparfaite et raisonnement explicable |

Tu peux étudier le dépôt public d'OpenFront (`github.com/openfrontio/OpenFrontIO`) pour t'inspirer du rendu et des mécaniques, **sans en copier le code** (licence AGPL-3.0) : tout est écrit from scratch.

---

## 3. Stack technique et structure du dépôt

**Contraintes**
- Node.js ≥ 20 LTS, npm workspaces, TypeScript `strict` partout.
- Fonctionne sous Windows, macOS et Linux **sans dépendance native à compiler** (pas de GDAL, pas de node-canvas/Cairo) et **sans Python**.
- Tout fonctionne hors ligne une fois `npm run data` exécuté une première fois (téléchargements mis en cache).
- Le serveur local n'écoute que sur `localhost`.

**Choix proposés** (tu peux en proposer d'autres dans ton plan, avec justification)
- Interface : Vite + React + Zustand ; graphiques : uPlot (ou équivalent léger et rapide).
- Carte : Canvas 2D avec `ImageData` mis à jour par régions modifiées pour démarrer ; passage à WebGL2 (texture d'identifiants de propriétaires + palette dans un shader) si les performances l'exigent.
- Moteur : TypeScript pur, exécuté dans un Web Worker côté navigateur (Comlink autorisé) et dans des `worker_threads` côté CLI.
- Petit serveur local (middleware Vite ou Fastify) pour lire et écrire scénarios, captures et configuration.
- Pipeline de données : scripts Node ; `d3-geo` et `d3-geo-projection` (projection Equal Earth), lecteur de shapefiles ou de GeoJSON, `geotiff` pour les rasters.
- Tests : Vitest. Lint et format : ESLint + Prettier.

**Arborescence cible**
```
geosim/
  CLAUDE.md  SPEC.md  PARAMETRES.md
  packages/
    shared/        # types, catalogue des paramètres, utilitaires communs
    engine/        # moteur pur TS (aucun DOM) : état, systèmes, commandes, RNG
  apps/
    web/           # interface (carte, panneaux, graphiques)
    cli/           # simulations sans interface, Monte Carlo, exports
  scripts/data/    # pipeline de données
  config/
    model.yaml     # coefficients des modèles (rechargés à chaud)
    events.yaml    # bibliothèque d'événements
  data/
    raw/           # téléchargements bruts (gitignore)
    curated/       # données éditées à la main et sourcées (YAML/GeoJSON) + SOURCES.md
    build/         # artefacts générés : carte binaire, pays, rapport de couverture
    manifest.json  # sources, URL, versions, licences, dates d'accès
  scenarios/       # scénarios sauvegardés
  docs/            # PROGRESS.md, DECISIONS.md, MODELES.md, CALIBRATION.md
```

**Commandes**
- `npm run data` : télécharge (si absent du cache), construit et valide toutes les données ; `--refresh` force la mise à jour.
- `npm run dev` : lance l'application.
- `npm test`, `npm run typecheck`, `npm run lint`.
- `npm run sim -- --scenario <nom> --years <n> --runs <n> --seed <n> --out <dossier>` : simulations sans interface.

---

## 4. Carte et géographie

### 4.1 Grille
- Projection **Equal Earth** : chaque pixel représente la même surface. (En équirectangulaire, Russie, Canada et Groenland seraient surdimensionnés et fausseraient toutes les mécaniques territoriales.)
- Résolution paramétrable au build. Défaut : 4096 px de large (≈ 70 km² par pixel, ≈ 2 millions de pixels terrestres — à recalculer et consigner). Préréglages : 2048 (rapide), 4096 (défaut), 8192 (détaillé, expérimental).
- Couches par pixel (typed arrays) :
  - `owner` (Uint16) : contrôle de facto ; `sovereign` (Uint16) : souveraineté de jure
  - `terrain` (Uint8) : eau, plaine, collines, montagne, haute montagne
  - `biome` (Uint8) : forêt tempérée, forêt tropicale, steppe/savane, désert, toundra, glace, zone humide
  - `elevation` (Int16), `river` (drapeau fleuve majeur), `urban` (0–255)
  - `population` (Float32), `economicValue` (Float32), `infrastructure` (Uint8 : routes, rail, ports)
  - `fortification`, `damage`, `fallout` (Uint8), `seaZone` (Uint16, pour les pixels d'eau)
  - `flags` : côte, frontière, capitale, ville majeure, port, aéroport, détroit

### 4.2 Sources géographiques
Vérifie URL, versions et licences au moment du build et consigne-les dans `data/manifest.json`.

| Donnée | Source |
|---|---|
| Frontières (de facto par défaut) et variantes « point de vue » | Natural Earth — Admin 0 Countries (1:10m ou 1:50m) et Admin 0 Countries point-of-views |
| Zones disputées et entités séparatistes | Natural Earth — Admin 0 Breakaway & Disputed Areas |
| Villes (avec population), capitales | Natural Earth — Populated Places |
| Ports, aéroports, routes, voies ferrées, zones urbaines | Natural Earth — Ports, Airports, Roads, Railroads, Urban Areas |
| Fleuves, lacs, glaciers, mers nommées | Natural Earth — vecteurs physiques (rivières et lacs, zones glaciaires, polygones marins) |
| Altitude | WorldClim 2.1 — elevation (5' ou 2.5'), ou ETOPO (NOAA) |
| Climat (température et précipitations annuelles → biomes) | WorldClim 2.1 — variables bioclimatiques (bio1, bio12) |

Natural Earth trace par défaut les frontières *de facto* et publie des variantes « point de vue » (*de jure* selon un pays donné). Garde la version de facto par défaut et rends le point de vue paramétrable (`sim.pov`).

### 4.3 Rasterisation : pièges à éviter
- Implémente un remplissage scanline (règle pair-impair) **sans anticrénelage**. Ne dessine pas les pays dans un canvas qui mélangerait les couleurs aux bords.
- Gère l'antiméridien (Russie, Fidji). Exclus l'Antarctique du jeu (terre neutre, non conquérable, paramétrable).
- Micro-États et petites îles : au moins 1 pixel ; ils restent des acteurs économiques et diplomatiques à part entière.
- Territoires dépendants (Groenland, outre-mer…) : rattachés à leur État souverain avec un attribut d'autonomie.
- Biomes : seuils sur température et précipitations annuelles, relief par altitude et rugosité locale — tous les seuils dans `config/model.yaml`.
- Population par pixel : répartis la population de chaque pays autour des villes (noyaux de densité proportionnels à leur population) + un fond rural pondéré par l'habitabilité (climat, relief). Le total par pays doit égaler la donnée nationale. Même logique pour la valeur économique (pondérée par l'urbanisation et la productivité).

### 4.4 Dérivés précalculés
- Graphe d'adjacence terrestre et maritime entre pays, longueur des frontières.
- Distances entre pays (capitale ↔ capitale, par voie terrestre et maritime).
- Grille océanique grossière pour le routage maritime (A*) ; pour chaque paire de pays commerçants, route principale et route alternative avec la liste des détroits traversés.
- Zones maritimes (mers nommées ou partition régulière) pour le contrôle naval.

### 4.5 Contrôle de facto et zones
- `data/curated/control_zones.geojson` : zones dont le contrôle de facto diffère de la carte de base (territoires occupés, zones tenues par des factions). **À vérifier par recherche web à la date du build**, avec source et date pour chaque zone.
- `claims.geojson` (revendications terrestres et maritimes), `separatism.geojson` (séparatismes, insurrections), `fortifications.geojson` (lignes fortifiées, zones démilitarisées).
- Tout est éditable dans l'interface (pinceau et polygones).

---

## 5. Données

### 5.1 Sources automatisées

| Domaine | Source | Accès |
|---|---|---|
| Démographie, économie, social, commerce agrégé, dépenses militaires, effectifs | Banque mondiale — World Development Indicators | API JSON sans clé, ex. `https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&per_page=20000&date=2010:2026` (ou `mrnev=1` pour la dernière valeur non vide) |
| Gouvernance (stabilité, efficacité, corruption, état de droit) | Banque mondiale — Worldwide Governance Indicators | même API (vérifie le format de l'édition en cours) |
| Croissance, dette publique, inflation, chômage, projections à 5 ans | FMI — World Economic Outlook, API DataMapper | ex. `https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH` |
| Énergie (production, consommation, mix) | Our World in Data — energy dataset | `https://owid-public.owid.io/data/energy/owid-energy-data.csv` |
| Démocratie (V-Dem), ogives nucléaires, autres séries | Our World in Data — API des graphiques (ajouter `.csv` à l'URL d'un graphique) | slugs à trouver sur `ourworldindata.org/data` |
| Alimentation (production, commerce céréalier) | FAOSTAT | téléchargements en masse |
| Minerais critiques (parts de production) | USGS — Mineral Commodity Summaries | tableaux annuels |
| Alignement diplomatique | Points idéaux des votes à l'Assemblée générale de l'ONU (Bailey, Strezhnev, Voeten — Harvard Dataverse) | fichier de données |
| Commerce bilatéral | Source ouverte sans clé si disponible (FMI, WITS, BACI) ; sinon modèle de gravité (§8.3) | — |

**Règles**
- Cache local de chaque téléchargement ; `data/manifest.json` trace URL, date d'accès, version et licence.
- Pour chaque indicateur, prends la valeur la plus récente non vide et **enregistre son année**. Si la donnée a plus de trois ans, signale-le.
- Les codes d'indicateurs donnés dans `PARAMETRES.md` sont indicatifs : vérifie-les (certains sont discontinués ou peu couverts) et documente les remplacements.

### 5.2 Données curées (`data/curated/*.yaml`)
Chaque entrée porte : `value`, `source` (URL ou référence), `date` (de la donnée ou d'accès), `confidence` (`high` | `medium` | `low` | `assumption`), `note` optionnelle.

- `blocs.yaml` : OTAN, UE, OTSC, OCS, BRICS (membres et partenaires), ASEAN, UA, Ligue arabe, CCG, OPEP+, G7, G20, Quad, AUKUS, Mercosur, CEDEAO, AES… avec leurs règles (clause de défense mutuelle et zone couverte, politique commerciale commune, sanctions communes, coordination pétrolière).
- `treaties.yaml` : traités bilatéraux de défense et accords de bases.
- `nuclear.yaml` : ogives (stock, déployées), vecteurs, doctrine déclarée, parapluies nucléaires, États du seuil.
- `military_capabilities.yaml` : capacités clés (porte-avions, sous-marins nucléaires, chasseurs de 5e génération, bombardiers stratégiques, défense antimissile longue portée, satellites militaires, capacité amphibie).
- `conflicts.yaml` + `control_zones.geojson` : conflits en cours (interétatiques, guerres civiles, insurrections), belligérants, soutiens extérieurs, lignes de contrôle.
- `sanctions.yaml` : régimes de sanctions en vigueur (qui sanctionne qui, volets, intensité).
- `disputes.yaml` + `claims.geojson` : revendications territoriales et maritimes.
- `elections.yaml` : calendrier des prochaines élections nationales.
- `bases.yaml` : bases et troupes stationnées à l'étranger.
- `chokepoints.yaml` : détroits et passages (géométrie, trafic, pays riverains, statut) — au minimum Ormuz, Bab-el-Mandeb, Suez, Malacca, Singapour, Sonde, Lombok, Taïwan, Luçon, Bosphore et Dardanelles, Gibraltar, détroits danois, Pas-de-Calais, Panama, Kertch, cap de Bonne-Espérance et passage de Drake (routes de contournement).
- `energy_links.yaml` : gazoducs, oléoducs, terminaux GNL, câbles sous-marins majeurs.
- `minerals.yaml`, `food.yaml`, `semiconductors.yaml` : parts de production, de raffinage et d'exportation.
- `profiles.yaml` : profils décisionnels (IA). Ce sont des **hypothèses** : propose des valeurs avec une justification d'une ligne fondée sur des comportements observables (doctrines publiées, historique récent), toutes marquées `assumption`, pour que je les valide.
- `relations_seed.yaml` : relations bilatérales initiales pour les paires importantes (le reste vient du modèle d'affinité, §8.6).

**Tout ce qui change vite** (conflits, lignes de front, sanctions, adhésions, gouvernements, élections, prix des matières premières) doit être vérifié par recherche web au moment du build et daté. Liste toutes les sources dans `data/curated/SOURCES.md`.

### 5.3 Niveau de détail
- *Complet* pour ≈ 40 pays clés (G20, puissances régionales, pays en conflit, détenteurs de ressources critiques) : toutes les catégories renseignées, curées si besoin.
- *Standard* pour les autres : données automatisées + valeurs par défaut régionales (médianes de pays comparables), signalées comme telles dans l'interface.

### 5.4 Rapport de couverture
`npm run data` produit `data/build/report.md` : pour chaque paramètre, nombre de pays couverts, année médiane, repli utilisé ; liste des valeurs estimées ; alertes (données anciennes, incohérences comme une somme de parts supérieure à 100 %).

---

## 6. Modèle de données et système de paramètres

### 6.1 Entités
- `Country` : `kind: 'state' | 'de_facto' | 'faction'`. Les entités de facto portent un statut de reconnaissance (liste des États qui les reconnaissent). Les factions (rebelles, groupes armés, gouvernements rivaux) peuvent tenir du territoire et naître ou disparaître en cours de partie.
- `Pair` : matrices N×N (`Float32Array`) pour relations, commerce, dépendances, traités, sanctions, revendications…
- `Bloc`, `Treaty`, `Sanction`, `Chokepoint`, `SeaZone`, `War`, `Front`, `Event`.
- `World` : date, marchés, paramètres mondiaux, indicateurs globaux (escalade, tabou nucléaire…).

### 6.2 Catalogue des paramètres (cœur du projet)
Chaque paramètre est déclaré **une seule fois** dans `packages/shared/src/params/catalog.ts`, construit à partir de `PARAMETRES.md` puis maintenu en synchronisation avec lui :

```ts
interface ParamDef {
  id: string;                  // 'eco.gdp_nominal'
  label: string;               // 'PIB nominal'
  category: CategoryId;        // 'economie'
  scope: 'country' | 'pair' | 'zone' | 'world' | 'model' | 'sim';
  kind: 'input' | 'state' | 'derived';
  unit: string;                // 'Md$'
  min: number; max: number; step: number; scale?: 'linear' | 'log';
  enumValues?: string[];       // paramètres catégoriels
  source?: string;             // 'WB:NY.GDP.MKTP.CD' | 'IMF:GGXWDG_NGDP' | 'OWID:…' | 'CUR' | 'HYP' | 'DER' | 'MAP'
  description: string;         // explication en français (infobulle)
  usedBy: SystemId[];          // systèmes qui lisent ce paramètre
}
```
- `input` : levier ou hypothèse (part du budget consacrée à la défense, agressivité…). La simulation ne le change qu'à travers les décisions du pays.
- `state` : variable d'état qui évolue (PIB, population, stabilité, stocks). Si je la modifie, ma valeur remplace l'état courant.
- `derived` : valeur calculée (PIB par habitant, indice de puissance). Affichée ; je peux la **forcer** (verrou), ce qui court-circuite son calcul.

L'interface est **générée depuis ce catalogue** : ajouter un paramètre = une ligne au catalogue + son usage dans un système + sa source. Rien d'autre.

### 6.3 Couches de valeur
Pour chaque valeur : `base` (donnée réelle) → `override` (ma modification) → `modifiers` (effets temporaires d'événements, avec durée et décroissance) → `effective`. L'interface montre la provenance de chaque couche, permet de **réinitialiser à la donnée réelle** et de **verrouiller** une valeur (la simulation ne peut plus la modifier).

### 6.4 Coefficients de modèle
Dans `config/model.yaml`, rechargé à chaud (appliqué au tick suivant) et éditable dans l'interface (onglet « Modèle », avec bouton d'enregistrement dans le fichier) :
```yaml
economy:
  trade_spillover:
    value: 0.35
    range: [0, 1]
    unit: ""
    description: "Part des écarts de croissance des partenaires transmise par le commerce."
```
Les valeurs par défaut sont des points de départ raisonnables à calibrer (§11), jamais des vérités.

---

## 7. Moteur de simulation

### 7.1 Temps
- 1 tick = 1 jour simulé. Vitesses : pause, 1 j/s, 1 semaine/s, 1 mois/s, 3 mois/s ; pas-à-pas (jour, semaine, mois) ; « avancer jusqu'à une date ».
- Ordonnancement : combats et fronts chaque jour ; économie, démographie, politique, diplomatie et marchés chaque mois ; décisions IA chaque semaine (pays en crise ou en guerre) ou chaque mois, **décalées** entre pays pour lisser la charge ; événements tirés chaque jour.

### 7.2 Déterminisme et journal
- RNG à graine (ex. xoshiro128**), un flux par système pour limiter les effets de bord.
- Toute action (mes modifications, décisions IA, événements) est une commande horodatée ajoutée au journal. Rejouer le journal depuis le même état initial reproduit exactement la même histoire (test automatique par hash d'état).

### 7.3 Worker et protocole
- Le moteur tourne dans un Web Worker ; l'interface ne bloque jamais.
- Interface → moteur : `setParam`, `lockParam`, `resetParam`, `setSpeed`, `step`, `runUntil`, `triggerEvent`, `declareWar`, `proposePeace`, `setSanction`, `setTreaty`, `setAllocation`, `paintTerritory`, `snapshot`, `branch`, `load`, `undo`, `redo`.
- Moteur → interface : diffs de pixels (indices + nouvelles valeurs, `ArrayBuffer` transférables) à chaque image, instantanés légers de l'état des pays à ≈ 5 Hz, entrées du journal.

### 7.4 Captures, branches, relecture
- Capture complète de l'état à tout moment (sérialisation compacte, carte compressée en RLE).
- Branche « et si ? » : dupliquer l'état courant, modifier, faire tourner les branches et les comparer (§9.7).
- Relecture d'une partie à partir de son journal.

### 7.5 Performances
- Budget indicatif : tick moyen < 5 ms hors combats intenses, < 15 ms avec plusieurs fronts actifs ; rendu fluide (cible 60 images/s) à 4096 px.
- Les combats ne traitent que les pixels de front actifs ; les systèmes mensuels sont vectorisés sur des typed arrays.
- Historique des séries échantillonné (mensuel) ; journal en tampon circulaire avec export.

---

## 8. Systèmes — modèles de référence

Ce sont des points de départ simples et calibrables. Chaque coefficient (`e_trade`, `a1`, `w3`…) est un paramètre de `config/model.yaml`. Implémente d'abord la version minimale de chaque système, teste-la, puis enrichis. Documente chaque équation dans `docs/MODELES.md`.

### 8.1 Démographie (mensuel)
```
Δpop = pop × (natalité − mortalité) / 12 000
     + solde_migratoire_mensuel
     − pertes_militaires − pertes_civiles − décès_catastrophes
     − réfugiés_sortants + réfugiés_entrants
```
- La mortalité augmente avec la guerre, la famine (autosuffisance × prix alimentaires), les pandémies, l'effondrement des dépenses de santé ; la natalité suit une tendance lente liée au développement.
- Pyramide simplifiée en trois tranches (0–14, 15–64, 65+) avec vieillissement annuel → population active, dépenses sociales induites, réservoir mobilisable.
- Réfugiés : flux sortants = f(intensité des combats sur le territoire, famine, répression, effondrement de l'État) ; destinations pondérées par la proximité, l'attractivité (PIB/hab, stabilité, ouverture migratoire) et la diaspora. Coût pour le pays d'accueil (budget, stabilité selon sa capacité d'absorption), aide internationale possible.
- Population par pixel : une capture transfère la population ; frappes et combats causent pertes et déplacements.

### 8.2 Économie et finances publiques (mensuel)
```
g = g_pot
  + e_trade  · Σ_p part_export(p) · (g_p − g_pot_p)                   contagion par les partenaires
  − e_energy · dépendance_énergie · intensité · Δprix_énergie          (signe inversé pour les exportateurs nets)
  − e_sanc   · Σ_s intensité_s · part_commerce_s · (1 − contournement) − choc_financier
  − e_war    · (part_territoire_disputé + destructions + mobilisés / population_active)
  + e_wareco · effort_de_guerre · capacité_industrielle                stimulus de court terme
  − e_stab   · max(0, seuil_stabilité − stabilité)²
  − e_debt   · max(0, dette − seuil_dette(statut_monnaie_réserve)) · prime_de_risque
  + e_inv    · (investissement_public − référence)
  + e_tech   · Δniveau_technologique
  + ε        (ε ~ N(0, σ_pays))
PIB(mois suivant) = PIB · (1 + g)^(1/12)
```
- `g_pot` : projections à moyen terme du FMI si disponibles, sinon moyenne lissée sur dix ans ; ajustée lentement par la démographie (population active), la productivité (R&D, capital humain, technologie) et les dommages climatiques.
- **Budget** : recettes = PIB × taux de prélèvement × efficacité de collecte + rentes (hydrocarbures × prix, minerais). Dépenses = somme des postes (en % du PIB, curseurs) + service de la dette. Le solde s'ajoute à la dette, ou est monétisé (→ inflation).
- **Taux souverain** = taux directeur mondial + prime (dette/PIB, inflation, stabilité, notation, guerre) − privilège de monnaie de réserve. Le taux moyen de la dette converge vers le taux de marché selon la maturité moyenne.
- **Inflation** = ancrage × cible + (1 − ancrage) × inflation passée + monétisation + transmission des prix importés (énergie, alimentation, dévaluation) + surchauffe (g − g_pot). Hyperinflation possible si monétisation massive.
- **Chômage** : loi d'Okun (Δu = −k · (g − g_pot)), bornée ; la mobilisation réduit le chômage.
- **Réserves et change** : les réserves suivent le solde courant ; gel partiel par sanctions ; crise de balance des paiements si les réserves tombent sous X mois d'importations (dévaluation, appel au FMI).
- **Défaut souverain** : probabilité croissante au-delà de seuils de dette et de prime ; effets sur la croissance, l'accès aux marchés et la stabilité.
- **Valeur économique par pixel** : le PIB réparti selon population et productivité ; une capture la transfère, une destruction la supprime.

### 8.3 Commerce, routes maritimes et marchés mondiaux (mensuel)
- Matrice `T[i][j]` (exportations de i vers j). Initialisation par données bilatérales ouvertes si disponibles, sinon modèle de gravité ajusté par la méthode biproportionnelle (RAS) pour respecter les totaux d'exportations et d'importations de chaque pays :
  ```
  T_ij ∝ PIB_i^α · PIB_j^β · exp(b_bloc·bloc_commun + b_langue·langue_commune + b_front·frontière_commune) / distance_ij^γ
  ```
- Composition simplifiée des échanges par pays : énergie, alimentation, minerais critiques, semi-conducteurs, biens manufacturés, services.
- Routes : chaque flux maritime suit sa route principale (détroits traversés, distance). Détroit contesté ou fermé → bascule sur la route alternative (surcoût et délai → prix importés en hausse, volumes en baisse selon une élasticité) ou coupure.
- Chocs sur `T` : sanctions (par volet), embargos, guerre entre i et j (→ 0), blocus naval, droits de douane, fragmentation mondiale. Réorientation partielle vers des pays tiers avec pénalité d'efficacité ; les sanctions secondaires réduisent ce contournement.
- **Marchés mondiaux** : pétrole ; gaz (trois zones : Europe, Asie, Amériques, reliées par un arbitrage GNL limité) ; charbon ; céréales ; engrais ; cuivre, lithium, terres rares, uranium ; puces avancées.
  ```
  prix_k = lissage( prix_ref_k · (demande_k / offre_k)^(1 / élasticité_k) )
  ```
  L'offre agrège les productions (quotas OPEP+, pertes dues aux guerres, sanctions et détroits, stocks stratégiques) ; la demande suit le PIB mondial et l'intensité d'usage. Les chocs de prix se transmettent aux importateurs et profitent aux exportateurs.
- **Dépendances critiques** : si un fournisseur concentré (puces avancées, terres rares…) est perturbé, choc sur la technologie et l'industrie de chaque pays à proportion de sa dépendance.

### 8.4 Énergie, alimentation, eau, minerais (mensuel)
- Bilan énergétique par source ; importations par partenaire (gazoducs et oléoducs de `energy_links.yaml`, GNL via les routes maritimes).
- Coupure d'approvisionnement (sabotage, sanctions, guerre) → pénurie, puis substitution progressive (GNL, stocks, rationnement) avec délais ; coût économique et politique.
- Alimentation : production céréalière, importations, autosuffisance ; prix mondiaux → inflation alimentaire → stabilité, pondérée par la part de l'alimentation dans la consommation (forte dans les pays pauvres).
- Eau : stress hydrique ; fleuves transfrontaliers et barrages en amont (Nil, Indus, Tigre-Euphrate, Mékong) → tensions bilatérales et événements ; sécheresses.
- Minerais critiques : parts de production et de raffinage ; restrictions d'exportation utilisables comme arme économique.

### 8.5 Politique intérieure (mensuel)
```
S* = s0
   − a1·(inflation + chômage) − a2·max(0, −g) − a3·choc_prix_alimentaires
   − a4·(pertes_de_guerre / tolérance_aux_pertes) − a5·inégalités − a6·corruption
   + a7·ralliement_au_drapeau(temps depuis le début de la guerre, décroissant)
   + a8·contrôle_information + a9·capacité_répressive·(1 − démocratie)
   + a10·légitimité − a11·fragmentation·tensions − a12·ingérence_étrangère
S(t+1) = S(t) + inertie · (S* − S(t)) + chocs d'événements
```
- **Démocraties** : l'approbation du gouvernement détermine, aux dates de `elections.yaml`, la probabilité d'alternance (logistique sur approbation, économie, guerre). En cas d'alternance, le profil `ai.opposition_profile` remplace le profil actuel. Élections anticipées possibles en cas de crise.
- **Régimes autoritaires** : risque de coup (loyauté de l'armée, défaites, crise économique), de succession non planifiée, de révolution (stabilité très basse et répression faible).
- **Seuils** (paramétrables) : manifestations → crise politique → coup, révolution ou guerre civile. Une guerre civile crée une faction (`kind: 'faction'`) qui prend des régions (zones de `separatism.geojson`, ou régions périphériques et distinctes), avec son propre profil ; soutiens étrangers et reconnaissance possibles.
- **Séparatismes et insurrections** : zones avec intensité → pertes de contrôle, coût sécuritaire, événements.
- **Soutien à chaque guerre** = f(légitimité perçue — défensive ou offensive —, pertes, gains, contrôle de l'information, durée). Sous un seuil, pression pour la paix (plus forte en démocratie).

### 8.6 Diplomatie, alliances, sanctions, ONU (mensuel, hebdomadaire en crise)
```
A_ij = w1·similarité_de_régime + w2·blocs_communs + w3·interdépendance(commerce, énergie, finance)
     + w4·ennemis_communs − w5·griefs − w6·revendications + w7·proximité_culturelle
     + w8·proximité_des_votes_à_l'AGNU + w9·aide_reçue − w10·menace_perçue(puissance_j, proximité, hostilité)
R_ij(t+1) = R_ij(t) + κ · (A_ij − R_ij(t)) + Σ chocs(actions récentes, décroissance exponentielle, demi-vie paramétrable)
```
- Relations `R_ij ∈ [−100, 100]`, asymétriques si besoin ; la décomposition de `A_ij` en facteurs est affichée dans l'interface.
- **Traités** : type (défense mutuelle, consultation, non-agression, partenariat stratégique, bases), membres, zone géographique couverte, crédibilité (0–1).
- **Réaction à une agression** : chaque allié ou partenaire compare l'utilité de ses options — intervention directe, aide militaire (transferts d'équipements et de munitions, limités par ses stocks et sa production), aide financière, sanctions, condamnation, neutralité, soutien à l'agresseur — selon : obligation × crédibilité, relation, dissuasion nucléaire de l'agresseur, distance et capacité de projection, engagements ailleurs, opinion publique, coût économique.
- **Sanctions** : coalition, volets (commerce, finance et accès au dollar/SWIFT, technologie et contrôles à l'export, énergie, élites, transport), intensité, sanctions secondaires ; effets progressifs, érosion par contournement, lassitude des sanctionneurs (qui en paient aussi le coût).
- **ONU** : Conseil de sécurité (5 membres permanents avec veto + membres élus), résolutions (sanctions, condamnation, maintien de la paix, cessez-le-feu) ; Assemblée générale (votes non contraignants qui nourrissent l'affinité).
- **Négociations et paix** : propositions (cessez-le-feu, armistice, paix) et termes (ligne de contact gelée, retour aux frontières, cessions, démilitarisation, garanties, levée de sanctions). Acceptation = f(situation militaire et tendance, lassitude, pression des alliés, légitimité interne, buts de guerre atteints). Un médiateur (pays en bons termes avec les deux camps) augmente les chances d'accord.
- **Reconnaissance** des entités de facto comme action diplomatique.
- **Influence** : aide au développement, prêts (levier sur les débiteurs), bases, médias ; sphères d'influence.

### 8.7 Forces armées (mensuel, quotidien pour la consommation en guerre)
- **Capital militaire par domaine** (terre, air, mer, frappes longue portée, défense aérienne, drones, espace, cyber) par inventaire permanent :
  ```
  K_d(t+1) = K_d(t) · (1 − δ_d) + budget_défense · part_équipement · part_domaine_d · efficacité_coût / coût_unitaire_d
  efficacité_coût = f(ajustement de parité de pouvoir d'achat, corruption, base industrielle, autonomie d'armement)
  ```
  Initialisation : ≈ 20 ans d'historique de dépenses militaires (séries de la Banque mondiale issues du SIPRI), puis correction par les capacités clés curées (`military_capabilities.yaml`).
- **Personnel** : actifs, réserves, paramilitaires. Mobilisation partielle ou générale : conversion progressive de la main-d'œuvre en troupes (délai de formation paramétrable), coût économique (main-d'œuvre retirée), coût politique, qualité moindre des recrues.
- **Qualité** : entraînement, commandement, expérience, doctrine, corruption, moral → multiplicateur.
- **Munitions et industrie** : stocks (en jours de combat intense) ; production mensuelle (obus, missiles, drones, intercepteurs) ; montée en cadence lente ; aide étrangère ; épuisement → efficacité en baisse.
- **Projection** : `puissance_projetée(d) = puissance · exp(−d / portée_logistique) · (1 + bonus_bases_alliées)` ; une traversée maritime exige le contrôle naval local et une capacité amphibie.
- **Déploiements** : répartition des forces entre théâtres (fronts, garnisons, défense du territoire, missions extérieures) — curseurs en mode joueur, IA sinon.
- **Indice de puissance** : dérivé, utilisé pour l'affichage et l'IA, **jamais** pour résoudre directement un combat.

### 8.8 Guerre et fronts (quotidien) — le cœur « OpenFront »
- `War` : belligérants et co-belligérants, casus belli, buts de guerre (zones, changement de régime, destruction de capacités, blocus), type (invasion, frappes limitées, blocus, guerre civile), date, pertes, lassitude, statut (active, cessez-le-feu, terminée).
- **Fronts** : segments de frontière entre adversaires (composantes connexes des pixels frontaliers). Chaque front reçoit des forces ; densité = forces allouées / longueur du front.
- **Résolution par pixel frontalier**, chaque jour :
  ```
  pression_A   = densité_A · qualité_A · (1 + appui_aérien_A) · ravitaillement_A · munitions_A · moral_A · saison
  résistance_D = densité_D · qualité_D · terrain · fortification · bonus_urbain · franchissement_fleuve
                 · (1 + appui_aérien_D) · ravitaillement_D · moral_D
  rapport = pression_A / résistance_D
  si rapport > seuil_percée · bruit : le pixel passe à A (probabilité croissante avec le rapport, × sim.conquest_speed)
  pertes_A ∝ résistance_D · c_att   et   pertes_D ∝ pression_A · c_def   (forme de Lanchester, exposant paramétrable)
  ```
- Avancée par front d'onde comme dans OpenFront, avec priorité aux pixels de forte valeur (villes, nœuds routiers, objectifs de guerre) et de faible résistance ; les percées créent des saillants.
- **Fortifications** : croissent sur les fronts statiques (jusqu'à un plafond) → guerre de position ; l'artillerie et les frappes les réduisent.
- **Ravitaillement** : distance, sur les pixels contrôlés et pondérée par les infrastructures, aux sources (capitale, grandes villes, ports, dépôts). Les poches encerclées (composantes connexes sans source) voient leur ravitaillement décroître → effondrement ou reddition.
- **Saisons et météo** selon latitude et biome : boue de printemps et d'automne, hiver, mousson, chaleur désertique.
- **Air** : supériorité aérienne par théâtre = f(capital aérien, défense aérienne adverse, portée) ; frappes stratégiques (industrie, énergie, logistique) consommant missiles et drones ; interceptions limitées par les stocks.
- **Mer** : contrôle naval par zone maritime = f(capital naval local, sous-marins, missiles antinavires, aviation côtière) ; blocus → commerce coupé ; débarquement possible seulement avec contrôle naval et capacité amphibie → tête de pont côtière, renforts limités par la logistique maritime.
- **Occupation** : les pixels occupés gardent leur souveraineté de jure ; résistance et insurrection proportionnelles à la population et à la cohésion, soutenues de l'extérieur ; coût de garnison ; annexion = acte politique avec réactions internationales.
- **Coûts** : pertes militaires, pertes civiles (densité × intensité), destructions d'infrastructures et de valeur économique, réfugiés.
- **Fin de guerre** : capitulation (effondrement militaire ou politique), cessez-le-feu (la ligne de contact devient frontière de facto : conflit gelé), traité de paix.

### 8.9 Nucléaire, escalade, missiles, cyber, espace
- **Arsenaux** : ogives (stock, déployées), vecteurs (sol fixe ou mobile, sous-marins, bombardiers), capacité de seconde frappe, doctrine déclarée, niveau d'alerte, parapluies nucléaires.
- **Échelle d'escalade mondiale** (0–100, affichée comme une horloge) alimentée par les guerres impliquant des puissances nucléaires, les alertes, les menaces, les frappes sur le territoire d'une puissance nucléaire, les essais.
- **Décision d'emploi**, évaluée seulement pour une puissance nucléaire en guerre :
  ```
  P(emploi) = σ( β0 + β1·menace_existentielle + β2·doctrine + β3·seuil_du_profil
                 − β4·tabou_mondial − β5·dissuasion_adverse − β6·pression_des_alliés )
  menace_existentielle = f(perte du territoire central, capitale menacée, effondrement de l'armée, survie du régime)
  ```
  Calibrée pour être extrêmement faible hors situations extrêmes. Échelle : signal (alerte, déclaration) → essai → frappe tactique → frappe stratégique ; riposte selon la doctrine adverse.
- **Effets (à la OpenFront)** : rayon selon le type d'arme ; destruction de population, de valeur économique, d'infrastructures et de forces ; retombées (pixels contaminés, décroissance lente). Effets mondiaux : krach, tabou brisé (hausse de l'escalade partout), sanctions quasi universelles ; au-delà d'un seuil de détonations, « hiver nucléaire » paramétrable qui réduit les rendements agricoles mondiaux pendant plusieurs années.
- **Défense antimissile** : interceptions probabilistes, limitées par les stocks et la couverture.
- **Programmes nucléaires** (États du seuil) : progression (budget, sanctions, sabotage), détection, frappes préventives possibles.
- **Missiles et drones conventionnels** : frappes sur les infrastructures, interceptions, épuisement des stocks.
- **Cyber** : opérations (espionnage, sabotage d'infrastructures, finance, ingérence électorale) ; succès = f(cyber offensif vs défensif) ; attribution incertaine ; effets économiques et politiques ; riposte.
- **Espace** : satellites (renseignement → moins de brouillard, précision des frappes), armes antisatellites (débris : pénalité mondiale).

### 8.10 Événements
- Bibliothèque déclarative `config/events.yaml` : identifiant, catégorie, conditions (expression), probabilité quotidienne de base et modificateurs, effets (paramètres touchés, durée, décroissance), texte en français, gravité.
- Catégories : naturels (séismes selon zones sismiques, tsunamis, cyclones, sécheresses, canicules, inondations, éruptions) ; sanitaires (épidémies, pandémies) ; économiques (krach, crise bancaire, défaut, choc pétrolier, crise de change) ; politiques (coup d'État, décès d'un dirigeant, scandale, élections anticipées, manifestations de masse) ; sécuritaires (attentat, piraterie, sabotage de câbles ou de gazoducs, incident naval ou aérien, cyberattaque majeure) ; technologiques (percées) ; découvertes de gisements.
- **Déclenchement manuel** depuis l'interface, avec formulaire (cibles, intensité, durée) et préréglages de crises : fermeture d'un détroit, blocus d'une île, crise en mer de Chine méridionale, pandémie (R0 paramétrable), krach mondial, coup d'État, effondrement d'un régime, rupture d'un traité, sabotage d'infrastructures sous-marines.
- Multiplicateur global de fréquence (`world.event_frequency`).

### 8.11 IA des pays
- **Cadence** : hebdomadaire en crise ou en guerre, mensuelle sinon ; décalée entre pays.
- **Actions** (avec préconditions et délais de réutilisation) : ajuster le budget, mobiliser ou démobiliser, déclarer une guerre, frappes limitées, blocus, proposer ou accepter un cessez-le-feu ou la paix, rejoindre ou quitter un bloc ou un traité, imposer ou lever des sanctions, aider un pays (militaire, financier), accords commerciaux et droits de douane, restrictions d'exportation, signalement nucléaire, programme nucléaire, opérations cyber, reconnaissance diplomatique, ingérence, médiation.
- **Utilité** :
  ```
  U(a) = Σ_k w_k(profil) · Ê_k(a) − aversion_au_risque · risque(a) − coût_d'inertie(a) + ε
  k ∈ {sécurité, survie du régime, économie, prestige, buts territoriaux, idéologie, alliances}
  ```
  `Ê_k` est estimé par des heuristiques rapides, et pour les décisions de guerre par une anticipation simplifiée (quelques mois de fronts simulés en version allégée).
- **Perception imparfaite** : chaque pays voit les autres à travers un brouillard dépendant de la qualité de son renseignement et de son biais (`ai.misperception`) → erreurs de calcul possibles.
- **Stabilité des décisions** : seuil d'action, inertie, délais de réutilisation, cohérence avec les buts de guerre.
- **Explicabilité** : chaque décision stocke ses 3 à 5 principales contributions, affichées dans le journal (« Pourquoi ? »).
- **Mode joueur** : le pays contrôlé n'agit plus seul ; l'IA propose ses meilleures options avec leurs explications (« conseillers »).

### 8.12 Santé, climat, technologie
- **Pandémie** : modèle SEIR par pays ; importations via les flux de voyage (commerce, tourisme, proximité) ; capacité hospitalière ; mesures (confinement, fermeture des frontières) avec coût économique ; vaccins après un délai dépendant de la R&D.
- **Climat** : scénario SSP paramétrable ; fréquence et intensité croissantes des catastrophes ; rendements agricoles par latitude et biome ; stress hydrique ; montée des eaux (perte progressive de valeur des pixels côtiers bas) ; migrations climatiques.
- **Technologie** : niveau par domaine (IA et calcul, semi-conducteurs, énergie, militaire, spatial) ; progression = f(R&D, capital humain, accès aux puces et intrants, transferts, espionnage) − contrôles à l'export ; effets sur la productivité, la qualité militaire et le cyber.

---

## 9. Interface

### 9.1 Disposition
- Centre : la carte, en plein écran.
- Barre supérieure : date simulée, lecture/pause, vitesses, pas-à-pas, indicateurs mondiaux (pétrole, croissance mondiale, escalade), sélecteur de couche, recherche de pays (Ctrl+K), menu scénario.
- Panneau droit (repliable) : inspecteur du pays sélectionné.
- Panneau gauche (repliable) : monde, modèle, outils de scénario.
- Panneau bas (repliable) : journal et graphiques.

### 9.2 Carte
- Rendu inspiré d'OpenFront : océan sombre, territoires colorés aux bordures plus claires, noms des pays au centre de leur territoire (taille selon la surface), relief ombré discret.
- Interactions : glisser pour déplacer, molette pour zoomer vers le curseur, survol → infobulle (nom, drapeau, cinq indicateurs clés, relation avec le pays sélectionné), clic → sélection, Maj+clic → second pays (panneau bilatéral), double-clic → zoom.
- Couches : politique ; blocs et alliances ; relations avec le pays sélectionné (rouge ↔ vert) ; stabilité ; PIB/hab ; croissance ; inflation ; puissance militaire ; dépendance énergétique ; sanctions ; fronts et zones occupées (hachures) ; revendications ; population ; terrain et biomes ; infrastructures ; flux commerciaux (arcs animés) ; routes maritimes et statut des détroits ; bases à l'étranger ; retombées.
- Animations : pixels de front qui scintillent, flèches d'offensive, navires (échantillon représentatif des flux), trajectoires de missiles, explosions avec onde de choc.
- Légende dynamique pour chaque couche.

### 9.3 Inspecteur de pays (généré depuis le catalogue)
- Onglets = catégories de `PARAMETRES.md`. Pour chaque paramètre : libellé, valeur, unité, curseur + champ numérique (échelle log si pertinent), icône de source (infobulle : source, année, confiance, couches base/override/modificateurs), bouton de réinitialisation, cadenas, mini-graphe d'historique.
- Recherche et filtres (favoris, paramètres modifiés, paramètres estimés).
- **Édition groupée** : appliquer une modification à un bloc ou à une sélection de pays (ex. +1 point de PIB en défense pour tous les membres d'une alliance).
- Actions rapides : prendre le contrôle, déclarer la guerre, proposer la paix, sanctionner, aider, rejoindre ou quitter un bloc.

### 9.4 Panneau bilatéral (A ↔ B)
Relation (et sa décomposition en facteurs), commerce, dépendances, traités, sanctions, revendications, présence militaire, aide, historique — tout est éditable ; actions directes.

### 9.5 Monde et modèle
- Paramètres mondiaux (marchés, taux, tabou nucléaire, climat, fréquence des événements, curseur réalisme ↔ arcade).
- Coefficients de modèle (`config/model.yaml`) avec descriptions, plages et bouton d'enregistrement.
- Liste des guerres, sanctions et crises en cours ; statut des détroits.

### 9.6 Journal
- Filtres (pays, type, gravité, période). Chaque entrée est cliquable : centrage de la carte + « Pourquoi ? » (facteurs et contributions) + effets appliqués.
- Mes propres modifications y figurent, distinguées, avec annuler/rétablir.

### 9.7 Tableaux de bord et comparaison
- Graphiques multi-pays (PIB, croissance, inflation, dette, stabilité, puissance, pertes, territoire…), classements, matrice des relations (heatmap), séries mondiales.
- Comparaison de deux branches (« et si ? ») sur les mêmes graphiques.
- Export CSV et PNG.

### 9.8 Outils de scénario
- Déclencher un événement (formulaire, préréglages de crises).
- Pinceau de territoire (réassigner des pixels, créer une faction) ; dessin de zones (revendications, séparatismes, fortifications).
- Déclarer ou terminer une guerre, imposer un cessez-le-feu, créer ou dissoudre un traité ou un bloc, imposer ou lever des sanctions, changer de gouvernement (profil IA).
- Captures, branches, sauvegarde et chargement.

### 9.9 Mode joueur
Prendre le contrôle d'un ou plusieurs pays ; leurs décisions passent en manuel ; conseillers (meilleures options de l'IA, avec explications) ; file d'actions ; alertes (crises, ultimatums, votes à l'ONU) ; allocation des forces par front via des curseurs, dans l'esprit du curseur d'attaque d'OpenFront.

### 9.10 Ergonomie
Thème sombre par défaut ; raccourcis clavier (espace = pause, +/− = vitesse, 1–9 = couches, Ctrl+Z / Ctrl+Y) ; infobulles partout ; textes en français (i18n prête) ; pensé pour un écran d'ordinateur.

---

## 10. Scénarios, sauvegarde et analyse
- **Format de scénario** (JSON versionné) : métadonnées (nom, date de départ, description), surcharges de paramètres (pays, paires, zones, monde, modèle), carte (différence RLE du contrôle de facto par rapport à la base), guerres, traités et sanctions actifs, événements programmés, graine.
- **Scénarios fournis** : « Monde au <date du build> » (situation actuelle vérifiée) ; « Bac à sable » (monde en paix, tensions gelées) ; 3 ou 4 scénarios de crise à définir avec moi.
- **Monte Carlo** : `npm run sim -- --scenario X --years 10 --runs 200 --seed 1 --out results/`, parallélisé par `worker_threads`. Sorties : CSV par run (séries clés), `summary.json` (probabilités de guerre par paire, de changement de régime, d'emploi nucléaire ; variations de territoire ; PIB aux déciles 10/50/90), rapport HTML autonome avec graphiques.

---

## 11. Qualité, tests et calibration
- **Tests unitaires** par système (Vitest) et **tests d'invariants** : pas de NaN ni d'infini, populations ≥ 0, conservation du nombre de pixels, relations dans leurs bornes, prix positifs, déterminisme (même graine + même journal ⇒ même hash d'état).
- **Test de fumée** : 20 ans simulés sans interface, sans erreur ni divergence.
- **Plausibilité** (vérifiée en Monte Carlo, résultats dans `docs/CALIBRATION.md`), sans intervention sur dix ans :
  - croissance mondiale dans une plage proche des projections du FMI ; pas de divergence du PIB, de la dette ou de l'inflation hors des pays déjà en crise ;
  - nombre de nouvelles guerres interétatiques et de changements de régime du même ordre de grandeur que lors des décennies récentes (données UCDP) ;
  - frontières quasi stables hors conflits déjà en cours ; emploi nucléaire rarissime.
- **Sensibilité** : chaque coefficient majeur varié de ±50 % ne doit pas faire exploser le modèle ; documente les paramètres les plus influents.
- **Rétro-test** (optionnel) : initialiser vers 2014–2015 et comparer aux données de 2024–2025 pour documenter les limites du modèle.

---

## 12. Phases de livraison

Chaque phase se termine par : tests verts, application lancée sans erreur en console, commit, mise à jour de `docs/PROGRESS.md`, résumé pour moi (ce qui marche, comment le tester, limites) — puis **attente de mon feu vert**.

**Phase 0 — Fondations**
Monorepo, TypeScript strict, Vite + React, Vitest, lint, scripts npm, `docs/` (PROGRESS, DECISIONS, MODELES, CALIBRATION), `.gitignore` (`data/raw`, `data/build`), dépôt git ; section « Commandes » de `CLAUDE.md` complétée.
*Terminée quand* `npm install`, `npm run dev` (page « GeoSim » vide), `npm test` et `npm run typecheck` passent.

**Phase 1 — Données et carte**
Téléchargements + cache + manifeste ; rasterisation Equal Earth ; terrain, biomes, fleuves, zones urbaines ; villes, ports, routes, voies ferrées → infrastructures ; population et valeur économique par pixel ; adjacences ; grille océanique, zones maritimes, routes et détroits. Données automatisées (§5.1) → `countries.base.json` ; fichiers curés (§5.2) avec recherche web datée ; zones de contrôle ; validation et `report.md`.
*Terminée quand* `npm run data` tourne de bout en bout (et hors ligne au second passage), produit ≥ 190 entités, aucune valeur sans provenance, et un rapport de couverture qui liste les lacunes.

**Phase 2 — Carte interactive (lecture seule)**
Rendu, déplacement et zoom, survol, sélection, couches principales et légendes ; inspecteur de pays généré depuis le catalogue, en lecture seule, sources visibles ; recherche de pays.
*Terminée quand* la navigation est fluide à 4096 px et que chaque paramètre s'affiche avec sa source et son année.

**Phase 3 — Moteur et temps réel**
Worker, boucle, vitesses, pas-à-pas, commandes, journal, captures ; couches de valeur (surcharge, verrou, réinitialisation, modificateurs) ; édition en direct dans l'inspecteur ; onglet Modèle avec rechargement à chaud ; démographie, économie, budget, dette, inflation, chômage, marchés simplifiés ; graphiques.
*Terminée quand* 20 ans tournent sans NaN ni divergence, qu'un curseur modifié infléchit immédiatement la trajectoire, et que la relecture du journal donne un hash identique.

**Phase 4 — Monde interconnecté**
Commerce, routes et détroits ; énergie, alimentation, minerais ; sanctions ; relations et affinité ; blocs ; ONU ; politique intérieure (stabilité, élections, coups, guerres civiles simples) ; réfugiés.
*Terminée quand* ces tests donnent des résultats qualitativement plausibles et expliqués : (a) fermeture d'un grand détroit pétrolier pendant trois mois ; (b) sanctions financières et commerciales larges contre une grande économie ; (c) doublement du prix du blé ; (d) élection qui change le profil d'un grand pays.

**Phase 5 — Forces armées et guerre**
Capital militaire, mobilisation, industrie et munitions, projection ; fronts pixel par pixel (terrain, fortifications, ravitaillement, encerclements, saisons) ; air, mer, blocus, débarquements ; occupation, pertes, réfugiés ; négociations et paix ; animations.
*Terminée quand* une guerre terrestre produit un front crédible (percées puis stabilisation, poches), qu'un débarquement échoue sans supériorité navale, qu'un cessez-le-feu gèle la ligne de contact, et que le curseur réalisme ↔ arcade change nettement le rythme.

**Phase 6 — Escalade, nucléaire, cyber, espace, événements**
Échelle d'escalade, doctrines, décision d'emploi, effets et retombées, défense antimissile, programmes nucléaires ; missiles et drones conventionnels ; cyber ; espace ; `events.yaml` (≥ 40 événements), déclenchement manuel et préréglages de crises ; pandémie (SEIR simple) ; tendances climatiques.
*Terminée quand*, en Monte Carlo sur le scénario de base, l'emploi nucléaire reste rarissime sauf paramétrage extrême, et que chaque événement affiche ses effets et son explication.

**Phase 7 — IA des pays et mode joueur**
Catalogue d'actions, utilité par profil, perception imparfaite, cadence, inertie, délais, explications ; réactions des alliés ; mode joueur avec conseillers.
*Terminée quand* 20 ans en mode observateur produisent une histoire plausible sans oscillations absurdes, chaque décision ayant son « Pourquoi ? », et que je peux jouer un pays de bout en bout.

**Phase 8 — Scénarios, branches, Monte Carlo, calibration**
Format de scénario versionné, sauvegarde et chargement, branches et comparaison, CLI Monte Carlo parallélisée avec rapport HTML, `docs/CALIBRATION.md`.
*Terminée quand* je peux lancer 200 runs de dix ans et lire les distributions de résultats, et que les tests de plausibilité passent.

**Phase 9 — Options** (§14), à la demande.

---

## 13. Méthode de travail
1. **Avant de coder** : lis `CLAUDE.md`, ce document et `PARAMETRES.md`, puis présente-moi un plan : architecture retenue, bibliothèques, sources de données vérifiées (accessibles ou non), principaux risques, questions vraiment bloquantes. N'écris pas de code avant mon accord.
2. **Une phase à la fois**, dans l'ordre du §12. Commits petits et fréquents.
3. **Toujours vérifier** : tests, lancement de l'application, lecture de la console, et pour les modèles, une courte simulation dont tu commentes les courbes.
4. **Décisions** : ambiguïté mineure → l'option la plus simple qui ne ferme pas la porte au réalisme, notée dans `docs/DECISIONS.md` ; ambiguïté coûteuse à défaire → demande-moi.
5. **Données** : jamais d'invention silencieuse ; si une source est inaccessible, dis-le et propose un repli.
6. **Documentation vivante** : `docs/PROGRESS.md` (où on en est, prochaines étapes), `docs/MODELES.md` (équations, hypothèses, limites), `docs/DECISIONS.md`.

---

## 14. Options avancées (après la phase 8)
- **Dirigeants pilotés par un modèle de langage** (désactivé par défaut) : pour quelques pays choisis, décisions stratégiques confiées à l'API Claude (clé dans `.env`) ou à un modèle local (Ollama), à intervalle régulier (ex. trimestriel). Entrée : résumé de l'état et options possibles ; sortie : JSON validé par le moteur. Budget d'appels paramétrable, prompts et réponses journalisés, appel asynchrone qui ne bloque jamais la boucle (décision par défaut en l'absence de réponse).
- **Éditeur de formules** : les équations nationales exprimées en expressions (mathjs ou expr-eval) éditables dans l'interface.
- **Rétro-test historique** automatisé.
- **Mods** : packs de scénarios, de profils et d'événements en YAML.
- **Zoom régional** à plus haute résolution.
