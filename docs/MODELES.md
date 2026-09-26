# Modèles

Équations, hypothèses et limites de chaque système, tenues à jour avec le code. Chaque coefficient cité se trouve dans `config/model.yaml`.

## 0. Aléa et déterminisme (`packages/engine/src/rng.ts`)

- **Générateur** : xoshiro128** (Blackman et Vigna, 2018), état de 4 × 32 bits. Il est vérifié contre l'implémentation C de référence (vecteurs dans `rng.test.ts`).
- **Initialisation** : les 4 mots d'état sont 4 sorties SplitMix32 de la graine. L'état nul, seul état interdit, est exclu.
- **Flux** : chaque système tire dans son propre flux, `graine_flux = SplitMix32(graine XOR FNV-1a(nom_du_système))`. Ajouter un tirage dans un système ne décale donc pas les tirages des autres.
- **Lois** :
  - uniforme `[0, 1)` = entier 32 bits / 2³² ;
  - entier `[0, n)` par multiplication (biais < n / 2³², négligeable) ;
  - normale par Box-Muller, en ne gardant qu'un des deux tirages.
- **Hypothèse** : le déterminisme bit à bit est garanti au sein d'un même moteur JavaScript (V8 pour Node et Chrome) ; voir DECISIONS D8.

## 1. Carte et géographie (`scripts/data/src/map/`, phase 1a)

La carte est construite une fois par `npm run data` ; elle ne change qu'au fil de la simulation (propriétaires, dommages…). Les seuils sont dans `config/model.yaml`, famille `geo` : les modifier demande de reconstruire la carte. Le rapport `data/build/map/report-<résolution>.md` donne les chiffres de chaque construction.

### 1.1 Grille et projection

- **Equal Earth** (Šavrič, Patterson et Jenny, 2018), via `d3-geo`. Échelle telle que la largeur du globe vaut la largeur de la grille : à 4096 px, grille 4096 × 1994, pixel de 70,9 km² (côté équivalent 8,42 km), 7,2 millions de pixels sur le globe dont 2,06 millions de terre.
- **Surface égale** : chaque pixel représente (R / échelle)² km², R = 6 371,0072 km (rayon authalique). Vérifié : la somme des pixels du globe égale 4πR² à 0,2 % près ; une bande de latitude a la bonne surface à 0,5 % près.
- **Antiméridien** : le premier et le dernier pixel de chaque ligne sont voisins (même méridien ±180°) pour tous les parcours (zones maritimes, routes, partage de la mer). Les polygones qui franchissent l'antiméridien sont découpés : longitudes déroulées, anneau refermé le long du pôle s'il l'entoure, découpage par fenêtres de 360° (Sutherland-Hodgman).
- **Limite** : les distances mesurées en pixels sont déformées aux hautes latitudes (la projection conserve les surfaces, pas les formes). Les distances de routes et entre capitales sont donc calculées en orthodromie entre centres, pas en pixels.

### 1.2 Rasterisation et entités

- **Balayage pair-impair** au centre des pixels, sans anticrénelage : chaque pixel appartient à une seule unité. Écart entre surface rasterisée et surface exacte des polygones : < 1 % pour toute unité d'au moins 1 000 pixels (contrôlé à chaque build, tolérance 2 %).
- **Rattachement** (DECISIONS D5, D18) : chaque unité Natural Earth est rattachée à une entité selon `data/curated/ne_units.yaml`. 200 entités : 195 États (193 membres de l'ONU, Saint-Siège, Palestine) et 5 entités de facto (Taïwan, Kosovo, Chypre du Nord, Somaliland, Sahara occidental).
- **Couches** : `unit` (unité d'origine, pour l'autonomie des territoires dépendants), `owner` (contrôle de facto) et `sovereign` (souveraineté de jure). En phase 1a, `sovereign` = `owner` sauf pour les bases louées (Guantánamo, Baïkonour) ; les corrections de jure (Crimée…) arrivent en phase 1b.
- **Micro-États** : une unité rattachée à une entité et sans pixel reçoit le pixel de son point d'étiquette, pris au voisin si besoin (jamais le dernier pixel d'une autre unité). 15 cas à 4096 px (Monaco, Vatican, Nauru, Tuvalu…).
- **Zones partagées** (champ de glace de Patagonie) : chaque pixel va à l'entité revendicatrice la plus proche.
- **Terre neutre** : Antarctique, Bir Tawil, zone tampon de Chypre, récifs disputés : propriétaire 0.

### 1.3 Terrain

À partir de l'altitude WorldClim 2.1 (5′, ≈ 9 km) :

- relief local `r` = altitude max − min dans une fenêtre de (2·`relief_radius_cells` + 1)² cellules (3 × 3 ≈ 28 km) ;
- haute montagne si altitude ≥ `high_mountain_min_elevation` (3 000 m), quel que soit le relief (hauts plateaux : Tibet, Altiplano) ;
- sinon montagne si `r` ≥ `mountain_min_relief` (600 m), collines si `r` ≥ `hills_min_relief` (200 m), plaine sinon.

Résultat à 4096 px (terres contrôlées) : 69 % de plaines, 20 % de collines, 7,5 % de montagne, 3 % de haute montagne. L'eau est scindée en mer et lac (polygones de lacs Natural Earth ; la Caspienne, classée mer par Natural Earth, reste une mer fermée).

### 1.4 Biomes

Classification climatique (Köppen-Geiger simplifiée, Kottek et al., 2006 ; Peel et al., 2007) à partir des variables WorldClim bio1 (T annuelle), bio10 (T du trimestre le plus chaud), bio11 (T du trimestre le plus froid), bio12 (P annuelles), bio14 (P du mois le plus sec) :

1. glace : polygones de glaciers Natural Earth ; zone humide : régions « Wetlands » et « Delta » de Natural Earth ;
2. toundra si bio10 < `tundra_max_warm_quarter_temp` (10 °C, limite des arbres) ;
3. seuil d'aridité Pseuil = `arid_threshold_slope` × T + `arid_threshold_intercept` (2 T + 14 mm) ; désert si P < `desert_factor` × Pseuil (BW), steppe si P < `steppe_factor` × Pseuil (BS) ;
4. tropical si bio11 ≥ `tropical_min_cold_quarter_temp` (18 °C) : forêt si bio14 ≥ 60 mm (Af) ou bio14 ≥ 100 − P/25 (Am), savane sinon (Aw) ;
5. steppe tempérée si T ≥ `temperate_steppe_min_annual_temp` (0 °C) et P / (bio10 + 10) < `temperate_steppe_max_index` (18) — indice d'aridité de De Martonne adapté à la saison de croissance ; **hypothèse à calibrer**, qui rattrape les steppes que Köppen classe en climat humide (Kazakhstan, Ukraine du Sud, Grandes Plaines) sans toucher la taïga (Iakoutie) ;
6. forêt tempérée ou boréale sinon.

Limites : biome potentiel (climat), pas l'occupation réelle du sol (les terres agricoles d'Europe restent « forêt ») ; la pampa, prairie sous climat humide, reste en forêt ; seules trois zones humides et douze deltas sont cartographiés par Natural Earth.

### 1.5 Fleuves, zones urbaines, infrastructures et drapeaux

- **Fleuves majeurs** : axes Natural Earth de rang ≤ `rivers.max_scalerank` (6 : Dniepr, Don, Dniestr…), tracés en 4-connexité : un fleuve forme une barrière continue.
- **Urbain** (0–255) : part du pixel couverte par les zones urbaines Natural Earth, par sur-échantillonnage `urban.supersampling`² (4 × 4).
- **Infrastructures** (champ de bits) : routes (hors bacs), routes majeures (autoroutes, rocades), voies ferrées.
- **Drapeaux** : côte (voisin d'un pixel de mer), frontière (voisin terrestre d'un autre propriétaire), capitale, ville majeure (≥ `cities.major_min_population`, 1 M), port (port Natural Earth rattaché au pixel côtier le plus proche dans un rayon de `ports.snap_radius_km`), aéroport, détroit (pixels d'eau sur une porte), fleuve.
- **Capitales** : capitale Natural Earth de l'unité principale ; siège effectif de l'exécutif si plusieurs ou aucune (`ne_units.yaml`, section `capitals`) ; repli sur la plus grande ville (aucun cas à 4096 px).

### 1.6 Zones maritimes

Mers, golfes et détroits nommés de Natural Earth ; les océans sont découpés par une grille de `sea_zones.ocean_grid_deg` (30°) ; les polygones de moins de `sea_zones.min_area_km2` (40 000 km²) sont fondus dans la zone voisine ; les eaux non couvertes rejoignent la zone la plus proche par parcours en largeur (et, pour les eaux isolées au pixel près — fjords, mer de Marmara —, en traversant les terres). 200 zones à 4096 px. Les lacs n'ont pas de zone.

### 1.7 Voisinages et longueurs

- **Frontières terrestres** : arêtes de pixels entre deux propriétaires. **Longueur** : une limite droite d'angle θ produit |cos θ| + |sin θ| arêtes par unité de longueur ; l'orientation locale est estimée par le gradient de Sobel (3 × 3) de l'indicatrice d'une des régions, et chaque arête compte pour |n| / (|nx| + |ny|) côté de pixel. Les limites sinueuses restent sous-estimées à l'échelle du pixel (Argentine–Chili : 4 900 km contre 6 700 km publiés ; France–Espagne : 525 contre 623).
- **Façades maritimes** : même estimateur sur les arêtes terre–mer.
- **Voisinages maritimes** : la mer est partagée par équidistance (chaque pixel va à la côte la plus proche, distance de chanfrein 5-7-11 de Borgefors, erreur ≤ 2 %), dans la limite de `maritime.boundary_km` (200 milles marins, comme une ZEE). Deux entités sont voisines si leurs espaces se touchent.
- **Distances entre capitales** : orthodromie ; par voie de terre, plus court chemin sur un graphe grossier des terres (§1.8), borné inférieurement par l'orthodromie ; null si les capitales ne sont pas reliées par la terre.

### 1.8 Graphe océanique, détroits et routes

- **Graphe grossier** : la grille est découpée en blocs de `routing.cell_km` (60 km) ; chaque bloc est scindé en composantes connexes (4-connexité) de pixels de mer, qui deviennent les nœuds. Deux nœuds sont reliés si deux de leurs pixels sont voisins, ou en ligne de vue jusqu'à deux blocs (16 directions) : les chemins ne suivent plus la grille (écart à l'orthodromie < 6 % au lieu de 41 % en diagonale). La connexité fine est conservée : pas de passage fictif à travers un isthme.
- **Détroits** (`data/curated/chokepoints.yaml`) : chaque passage a une ou plusieurs **portes**, lignes qui le coupent de terre à terre ; les pixels d'eau d'une porte forment des nœuds à part, qu'aucune arête en ligne de vue ne peut enjamber. Une route traverse un détroit si elle passe par un de ses nœuds ; fermer un détroit revient à bloquer ces nœuds. Les canaux et les détroits plus étroits qu'un pixel (Suez, Panama, Bosphore et Dardanelles, Kertch, Grand Belt, Gibraltar) ont un **chenal** forcé navigable dans le graphe (la carte n'est pas modifiée). Chaque porte est **vérifiée** à chaque build : extrémités à terre, route de test franchissant la porte, allongée ou coupée quand la porte est fermée.
- **Eaux polaires** : au-delà de `routing.polar_min_lat` (66,5°), le coût des arêtes est multiplié par `routing.polar_cost_factor` (4) pour le choix de la route (glaces, navigation saisonnière) ; la longueur rapportée reste la distance réelle. Une alternative peut ainsi être plus courte que la route principale en kilomètres (route du Nord face à Suez).
- **Ports d'une entité** : ports Natural Earth de son territoire contigu à la capitale (la route États-Unis–Japon part de la côte ouest, pas de Guam) ; à défaut, tous ses ports ; à défaut, sa côte la plus proche de la capitale. **Pays sans façade sur l'océan mondial** : accès par voie de terre jusqu'à la côte la plus proche (distance de chanfrein), pays de transit consigné.
- **Routes** : pour chaque paire d'entités, route principale (Dijkstra multi-sources) et route alternative, qui évite tous les détroits de la principale ; `noAlternative` si aucune n'existe (golfe Persique pour Ormuz, mer Noire pour les détroits turcs). Tracés simplifiés (Douglas-Peucker, 4 px) pour l'affichage.
- **Contrôles de plausibilité** (4096 px) : Chine–Allemagne 18 200 km par Malacca, Suez et Gibraltar ; Corée–Pays-Bas 20 000 km (Busan–Rotterdam ≈ 19 900) ; États-Unis–Japon 7 100 km (Seattle–Tokyo ≈ 7 700) ; Qatar–Royaume-Uni 11 200 km.
- **Limites** : l'accès terrestre des pays enclavés suit la distance, pas les corridors réels (Kazakhstan par la Russie, Mali par la Sierra Leone) ; le canal de Kiel n'est pas modélisé ; la porte de Singapour coupe toute la sortie sud du détroit de Malacca, îles Riau comprises.

### 1.9 Zones de contrôle et souveraineté de jure (`zones.ts`, phase 1b)

- **Données** : `data/curated/control_zones.geojson`, une zone par entité (source, date, confiance). Une zone désigne un **contrôleur** de facto (`controller` → couche `owner`) et/ou un **souverain** de jure (`sovereign` → couche `sovereign`). Sa géométrie vient de polygones propres, de zones disputées Natural Earth (`ne_disputed`, par nom) ou de subdivisions de premier niveau (`admin1`, codes ISO 3166-2).
- **Application** : dans l'ordre du fichier, sur les pixels terrestres dont le centre est dans la zone ; le filtre `within` restreint la modification aux pixels dont le propriétaire actuel est listé (la zone « Sahara occidental » ne touche que la partie tenue par le Maroc). Aucun pixel neutre n'est attribué sans contrôleur.
- **Contrôle** : une zone dont la surface dépasse `ZONE_BELOW_RESOLUTION_PX` (2 pixels) doit modifier au moins un pixel, sinon la construction échoue ; les zones plus petites (Jérusalem-Est, 70 km²) sont signalées et restent dans les métadonnées (`controlZones`, 0 pixel). Toute référence introuvable (entité, zone disputée, subdivision) est une erreur bloquante.
- **Entités nouvelles** : entités de facto (Abkhazie, Ossétie du Sud, Transnistrie) et factions des guerres civiles (Forces de soutien rapide, Houthis, Armée nationale libyenne, AFC/M23, Armée d'Arakan), déclarées dans `entities.yaml` avec leur capitale ; leurs pixels viennent uniquement des zones.
- **Limites** : ligne de front ukrainienne simplifiée (DeepStateMap du 24/09/2026, D31) ; l'Armée d'Arakan est représentée par l'État d'Arakan entier ; les zones sont statiques jusqu'à la phase 5 (fronts).

### 1.10 Population et valeur économique par pixel (`population.ts`, phase 1b)

Unité statistique d'un pixel : l'entité de facto qui publie ses propres statistiques (Taïwan, Kosovo, Chypre du Nord, Somaliland, Abkhazie…) si elle le contrôle, sinon son **souverain de jure** (les pixels ukrainiens occupés comptent dans la population de l'Ukraine, qui les inclut ; ceux du Darfour dans celle du Soudan). Les entités comprises dans les statistiques d'un autre pays (`includedIn` de `entities.yaml` : Abkhazie et Ossétie du Sud dans la Géorgie, Chypre du Nord dans Chypre, Somaliland dans la Somalie, Sahara occidental dans le PIB du Maroc) en sont retirées.

Pour une unité de population P, de PIB Y et de taux d'urbanisation u (Banque mondiale) :

- **Poids urbain** d'un pixel : somme des noyaux gaussiens des villes de l'unité, de masse égale à la population de l'agglomération (Natural Earth `POP_MAX`) et d'écart-type σ = max(0,5 pixel ; `city_kernel_sigma_km` × √(pop / 10⁶)), normalisés sur les pixels de l'unité ; plus `urban_area_density` × aire × couverture urbaine Natural Earth.
- **Poids rural** : habitabilité h = biome × relief (+ `river_bonus` si fleuve), × `coast_factor` sur la côte. Biomes : forêt tempérée 1, forêt tropicale 0,5, steppe et savane 0,6, zone humide 0,5, toundra 0,01, désert 0,005, glace 0 ; relief : plaine 1, collines 0,6, montagne 0,25, haute montagne 0,05.
- **Population** : pop(p) = P × u × wᵤ(p) / Σwᵤ + P × (1 − u) × h(p) / Σh. Sans ville ni zone urbaine, u = 0 ; sans pixel habitable, répartition uniforme.
- **Valeur économique** : Y × w(p) / Σw avec w(p) = pop(p) × (1 + `urban_productivity_premium` × part urbaine du pixel) : un habitant des villes produit deux fois plus qu'un rural (hypothèse).
- **Conservation** : Σ pop = P et Σ valeur = Y par unité, à 10⁻⁹ près (écart constaté : 2 × 10⁻¹² ; contrôle bloquant). Population mondiale répartie : 8,216 milliards.
- **Factions** : leur population et leur PIB sont la somme des pixels qu'elles contrôlent (comptés aussi dans leur pays, qui publie les statistiques de tout son territoire).
- **Stockage** : couches compactées sur les pixels terrestres (`land-<résolution>.bin.gz`, Float32 ; D7).
- **Limites** : les biomes sont climatiques (terres agricoles classées « forêt ») ; densités relatives non calibrées sur une grille de population (GPW, WorldPop), à comparer en phase 8.

## 2. Données pays (`scripts/data/src/country/`, phase 1b)

`npm run data` produit `data/build/countries.base.json` (208 entités × paramètres pays), `pairs.base.json` (paramètres bilatéraux), `world.base.json` (paramètres mondiaux, blocs, conflits, sanctions, détroits, zones) et `report.md` (couverture). Chaque valeur porte `source`, `date` (année de la donnée ou date de curation), `confidence` et `method`.

### 2.1 Chaîne de résolution

Pour chaque paramètre pays, `rules.ts` définit une chaîne de sources essayées dans l'ordre, puis un repli :

1. **Sources** : dernière observation non vide d'année ≤ année courante (Banque mondiale, WGI, FMI, OWID, FAOSTAT, HCR, BACI, AGNU, PNUD), puis valeur curée (`country_*.yaml`, sujets curés). Valeur de plus de trois ans : signalée (`stale`).
2. **Replis** : `regional_median` — médiane des pays de même région Banque mondiale et même groupe de revenu, sinon même revenu, sinon même région, sinon monde (au moins 3 pays, confiance `low`) ; pour les grandeurs extensives, médiane du ratio à la population ou au PIB, multipliée par celui du pays ; `default` — hypothèse de `defaults.yaml`, modulée par nature d'entité, type de régime ou revenu (confiance `assumption`) ; `zero` — absence documentée, certaine (`high`) quand le fichier curé est une liste exhaustive (membres du Conseil de sécurité, monnaies du COFER, réserves gelées, conflits, sanctions) ; `not_applicable` ; `missing` (lacune, listée dans le rapport ; aucune au 25/09/2026).
3. **Écrêtage** : une valeur hors de la plage du catalogue est ramenée à la borne, la valeur d'origine conservée (`clampedFrom`) et signalée (un cas : IDE du Liechtenstein).

Ordre : population, PIB, urbanisation et régime d'abord (les replis et la carte en dépendent), puis tous les paramètres, puis tous les replis.

### 2.2 Transformations et dérivations

- **WGI** : estimation [−2,5 ; 2,5] → [0 ; 100] par (v + 2,5) / 5 × 100.
- **Alignement AGNU** (`dip.alignment`) : point idéal (Bailey, Strezhnev et Voeten) rééchelonné linéairement de −100 (minimum de la dernière session) à +100 (maximum).
- **Type de régime** : Regimes of the World (V-Dem) — autocratie fermée → `autocracy`, électorale → `hybrid`, démocratie électorale → `flawed_democracy`, libérale → `democracy` ; juntes, théocraties et monarchies absolues curées (`country_politics.yaml`).
- **Polarisation** : v2cacamps de V-Dem (0 = forte, 4 = aucune) → (4 − v) / 4 × 100.
- **Structure des exportations** : parts sectorielles des biens (BACI, HS 2022, par chapitres) × (1 − part des services) + part des services (balance des paiements, médiane mondiale à défaut).
- **Autosuffisance céréalière** : production / disponibilité intérieure (bilans FAOSTAT) ; parts mondiales d'exportation de céréales et d'engrais (N + P₂O₅ + K₂O).
- **Autonomie d'armement** : exportations / (importations + exportations) en TIV du SIPRI cumulés sur 10 ans.
- **Croissance potentielle** : moyenne des projections du FMI à 1–5 ans (repli : moyenne des 10 dernières années de la Banque mondiale).
- **Expérience de combat** : intensité (0–1) du conflit actif ou en cessez-le-feu le plus intense où l'entité est belligérante (`conflicts.yaml`).
- **Exposition aux contrôles à l'export** : volet technologique le plus fort des régimes de sanctions visant l'entité.
- **Paramètres de la carte** : surfaces contrôlée et souveraine, façade maritime, enclavement, répartition des terrains et biomes, capitale, détroits riverains.
- **Profils décisionnels** (`ai.*`) : `profiles.yaml` pour les 44 pays au niveau complet (hypothèses sur les gouvernements, une justification par valeur), sinon profil par défaut selon le type de régime.

### 2.3 Paramètres bilatéraux

Commerce (BACI, flux ≥ 1 M$), dépendances énergétique et critique (part des importations ≥ 1 % : chapitre 27 ; puces SH 8542 ; terres rares ; céréales ; armes, chapitre 93), traités (engagement le plus fort, blocs à défense mutuelle compris ; crédibilité des blocs 0,8 par hypothèse), sanctions (maximum par volet), droits de douane, revendications, présence militaire (somme des bases), état de guerre (le plus grave des conflits interétatiques), reconnaissance, relations initiales (`relations_seed.yaml`, 148 paires), frontières et distances (carte). Une paire en double sans règle de fusion arrête la construction.

### 2.4 Limites

- Données anciennes signalées dans le rapport : rentes des ressources (2021), indice de capital humain (2020), production d'hydrocarbures des petits producteurs (2016, Shift Data Portal via OWID).
- Consommations de pétrole, gaz et charbon : Energy Institute (≈ 80 pays) ; les autres par médiane régionale par habitant (confiance faible).
- Paramètres `HYP` du catalogue (ouverture migratoire, cyber, espace…) : hypothèses par défaut à calibrer (phase 8).

## Systèmes (à venir)

| Section SPEC | Système                                      | Phase                     |
| ------------ | -------------------------------------------- | ------------------------- |
| §8.1         | Démographie                                  | 3                         |
| §8.2         | Économie et finances publiques               | 3                         |
| §8.3         | Commerce, routes maritimes, marchés          | 3 (marchés simplifiés), 4 |
| §8.4         | Énergie, alimentation, eau, minerais         | 4                         |
| §8.5         | Politique intérieure                         | 4                         |
| §8.6         | Diplomatie, alliances, sanctions, ONU        | 4                         |
| §8.7         | Forces armées                                | 5                         |
| §8.8         | Guerre et fronts                             | 5                         |
| §8.9         | Nucléaire, escalade, missiles, cyber, espace | 6                         |
| §8.10        | Événements                                   | 6                         |
| §8.11        | IA des pays                                  | 7                         |
| §8.12        | Santé, climat, technologie                   | 6                         |
