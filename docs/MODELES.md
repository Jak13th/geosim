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

### 2.4 Paramètres dérivés par définition (`packages/engine/src/derived.ts`, phase 2)

Certains dérivés sont de simples définitions, sans coefficient ; ils sont calculés à la volée depuis les valeurs de base :

- **PIB par habitant** (`eco.gdp_per_capita`, $) = PIB nominal (Md$) × 10⁹ / population ; 0 si la population est nulle.
- **Indice de misère** (`eco.misery_index`, points) = inflation + chômage (Okun).

Provenance composée : source `DER`, méthode `derived`, date = la plus récente des entrées, confiance = la plus faible des entrées, note = formule et sources des entrées (ex. « `eco.gdp_nominal` : IMF:NGDPD, 2026 ; `demo.population` : WB:SP.POP.TOTL, 2025 »). Les autres dérivés (croissance, puissance militaire, dépendance énergétique, cohésion sociale…) relèvent de leur système et sont calculés par le moteur à partir de la phase 3.

### 2.5 Limites

- Données anciennes signalées dans le rapport : rentes des ressources (2021), indice de capital humain (2020), production d'hydrocarbures des petits producteurs (2016, Shift Data Portal via OWID).
- Consommations de pétrole, gaz et charbon : Energy Institute (≈ 80 pays) ; les autres par médiane régionale par habitant (confiance faible).
- Paramètres `HYP` du catalogue (ouverture migratoire, cyber, espace…) : hypothèses par défaut à calibrer (phase 8).

## 3. Moteur (`packages/engine/src/`, phase 3)

### 3.1 Temps et ordonnancement

- Un tick = un jour simulé (calendrier grégorien proleptique, sans `Date` : `calendar.ts`). Départ : date de construction des données.
- Chaque jour : expiration des modificateurs arrivés à échéance, puis valeurs effectives recalculées si des modificateurs sont actifs.
- Le premier jour de chaque mois, dans cet ordre : **marchés** (prix du mois) → **démographie** → **économie** → **budget**, puis les valeurs dérivées (`derive` : démographie, budget, comptes) et un point d'historique. Les systèmes lisent les valeurs effectives et écrivent les valeurs courantes ; `effNow` relit une valeur écrite dans le même pas, modificateurs compris.
- Après chaque commande, les valeurs dérivées sont recalculées sans avancer le temps : un curseur budgétaire change aussitôt le solde, les intérêts, le taux souverain affichés.
- Les systèmes des phases suivantes (combats quotidiens, IA hebdomadaire) s'inséreront dans ce calendrier.

### 3.2 Couches de valeur (`state.ts`, `commands.ts`)

Pour chaque paramètre pays numérique, trois tableaux P × N (colonne par paramètre) :

- `base` : donnée réelle ; pour un paramètre sans donnée (calculé par le moteur), sa valeur initiale calculée ;
- valeur courante : surcharge de l'utilisateur et évolution simulée ;
- valeur effective = courante × Π(1 + (a − 1)·w) + Σ b·w, bornée à la plage du catalogue, où chaque modificateur multiplie (`mul`, facteur a) ou ajoute (`add`, montant b) avec un poids w(t) : 1 (constant), 1 − âge/durée (linéaire) ou 0,5^(âge/demi-vie) (exponentiel), nul après la durée.

Le moteur garde aussi les valeurs **au départ** (après calage et calcul des dérivés), qui distinguent une valeur simulée d'une valeur calculée dès le départ (badges « simulée » et « calcul » de l'inspecteur).

Sémantique des commandes par nature de paramètre (PARAMETRES.md) : un levier (`I`) ou un état (`S`) saisi remplace la valeur courante, la simulation repart de là ; un dérivé (`D`) saisi est forcé (verrouillé), ce qui court-circuite son calcul, et « réinitialiser » rend le calcul. Le verrou interdit à la simulation d'écrire la valeur. Les paramètres bilatéraux, mondiaux, de zone (statut des détroits) et de simulation (graine, réalisme…) suivent les mêmes règles ; les paramètres fixés au lancement ou à la construction des données (date de départ, résolution, point de vue) et les zones géographiques (outils de scénario, phase 8) ne se modifient pas par commande.

### 3.3 Commandes, journal, annuler et rétablir

- Toute modification est une commande horodatée (`set`, `adjust`, `reset`, `lock`, `addModifier`, `removeModifier`, `setCoefficient`, `setModel`) : validée contre le catalogue (type, bornes, composantes), appliquée, puis journalisée avec ses effets (valeur avant, valeur après) et son opération inverse. Une commande invalide lève une erreur et ne laisse aucune trace.
- Annuler applique l'inverse de la dernière commande de l'utilisateur et journalise l'annulation (entrée `undo` qui vise l'entrée annulée) ; rétablir rejoue la commande. Les événements de la simulation (défauts, crises) sont journalisés avec leurs facteurs explicatifs (« Pourquoi ? »), leurs effets et les modificateurs qu'ils créent.
- La vitesse et le pas-à-pas ne sont pas des commandes : ils ne changent pas l'histoire simulée.

### 3.4 Empreinte, relecture, captures

- **Empreinte** (`hash.ts`) : deux hachages de 32 bits indépendants (FNV-1a et MurmurHash3 sur des mots de 32 bits) de tout ce qui détermine la suite : date, graine, coefficients, valeurs courantes, verrous, valeurs non numériques, paires, monde, zones, simulation, surcharges, modificateurs, états internes des systèmes, états des générateurs. Le journal et l'historique n'en font pas partie. NaN normalisé, −0 = +0.
- **Relecture** : repartir de la capture initiale et rejouer les commandes de l'utilisateur du journal à leur tick (événements reproduits par l'aléa) redonne la même empreinte (tests `engine.test.ts`, `engine.built.test.ts` sur 20 ans de données réelles, bouton « Vérifier la relecture » de l'onglet Simulation).
- **Captures** (`codec.ts`) : état complet, journal, pile d'annulation et historique sérialisés en JSON (tableaux typés en base64 petit-boutiste) ; restaurées uniquement sur les mêmes données (identifiant `date du build | carte`).
- **Aléa en nombre fixe** : chaque système tire le même nombre de valeurs chaque mois (un choc par pays pour l'économie, un tirage par pays pour le défaut, un choc par prix pour les marchés), quel que soit l'état : deux trajectoires de même graine partagent leurs chocs (nombres aléatoires communs), ce qui isole l'effet d'une modification.

### 3.5 Historique

Échantillon mensuel (simple précision) des paramètres pays que les systèmes font évoluer, plus ceux que l'utilisateur modifie (suivis dès la modification, les mois passés prenant la valeur d'alors), et des séries mondiales (paramètres numériques et composantes des vecteurs de prix).

### 3.6 Worker et temps réel (`apps/web/src/sim/`)

- Le moteur tourne dans un Web Worker. La boucle avance par tranches de 20 ms au plus (50 ms pour « avancer jusqu'à ») : les jours dus = vitesse × temps réel écoulé ; une commande de l'interface attend au plus une tranche. Si le moteur ne suit pas (retard de plus de 0,5 s de simulation), le retard est abandonné et signalé.
- Vitesses : 1 jour, 1 semaine, 30 jours ou 90 jours simulés par seconde (`sim.speed`, 0–90). Pas-à-pas : un jour, une semaine, ou jusqu'au premier jour du mois suivant (un pas mensuel des systèmes).
- Images vers l'interface à 5 Hz au plus, et aussitôt après chaque commande : horloge ; valeurs effectives des pays (tableau transféré, sans copie) ; valeurs non numériques par différences ; monde, zones, simulation, verrous, surcharges, modificateurs ; paramètres bilatéraux seulement quand ils changent ; nouvelles entrées du journal. L'horloge réelle ne sert qu'à cadencer la boucle : elle n'entre jamais dans le moteur.

## 4. Démographie (`systems/demography.ts`, SPEC §8.1)

Pas mensuel (dt = 1/12 an), par pays, trois tranches d'âge A₀ (0–14), A₁ (15–64), A₂ (65+).

- **Profil par âge** : à l'intérieur des tranches, les effectifs par année d'âge suivent c(a) ∝ e^(−r·a). La pente r est déduite chaque mois du rapport des effectifs moyens par âge des deux premières tranches (dichotomie sur [−0,1 ; 0,1], sommes géométriques en forme close). Elle donne les parts qui changent de tranche en un an : `passage₀₁ = c(14) / Σ₀¹⁴ c`, `passage₁₂ = c(64) / Σ₁₅⁶⁴ c`, et la part des 18–49 ans parmi les 15–64 ans.
- **Mortalité** par tranche : `m_k = taux de référence_k × facteur du pays × e^(−baisse·t)` (`demography.mortality.age_*`, `annual_decline` = 1 %/an). Le facteur du pays est calé au départ pour reproduire la mortalité brute observée : `facteur = TBM₀ / Σ_k m_k·part_k`. La mortalité brute évolue ensuite avec le vieillissement.
- **Fécondité** (état) : converge vers le niveau de long terme, `F ← F + (F_LT − F)·dt / durée` (`fertility.long_run` = 1,8, `convergence_years` = 50 ans).
- **Natalité** (dérivé) : `TBN = TBN₀ × (F / F₀) × (part des 15–64 / part initiale)` : la fécondité et le poids des âges féconds modulent les naissances, calées sur la natalité observée.
- **Bilan mensuel** : `A₀ += naissances − décès₀ − passages₀₁` ; `A₁ += passages₀₁ − décès₁ − passages₁₂ + migrants` ; `A₂ += passages₁₂ − décès₂`. Solde migratoire (levier, ‰) versé dans les 15–64 ans ; les données utilisent la moyenne du solde sur dix ans (DECISIONS D52).
- **Population active** : proportionnelle aux 15–64 ans (taux d'activité constant). **Réservoir mobilisable** : 18–49 ans × taux d'aptitude (`manpower.fitness_rate`).
- **Espérance de vie** : gain annuel `0,25 × (plafond − e) / (plafond − 60)` (`life_expectancy.*`). **Urbanisation** : croissance logistique vers 95 %.
- **IDH** (dérivé) : l'IDH initial du PNUD est ajusté par l'évolution de ses composantes santé (espérance de vie, bornes 20–85 ans) et revenu (log du revenu PPA réel, bornes 100–75 000 $), en moyenne géométrique ; l'éducation reste celle du départ.
- **Croissance des 15–64 ans** : mémorisée pour la croissance de long terme (§5.1).

**Limites** : trois tranches seulement (pas de pyramide détaillée ni d'écho des cohortes) ; taux d'activité constant ; migrations constantes (réfugiés en phase 4) ; pertes de guerre, famines et épidémies en phases 5 et 6.

## 5. Économie et finances publiques (`systems/economy.ts`, `budget.ts`, `finance.ts`, SPEC §8.2)

**Principe** : les niveaux viennent des données ; le modèle simule les **écarts à la situation initiale**. Les projections du FMI qui fixent la croissance potentielle intègrent déjà la dette, l'instabilité ou la rente de départ ; les termes de choc sont donc mesurés par rapport à l'état initial (DECISIONS D49).

### 5.1 Croissance potentielle et de long terme

- Croissance de long terme : `g_LT = g_frontière + β · max(0, ln(Y_frontière / y) − seuil) · institutions + α · croissance des 15–64 ans`, bornée à [−1 ; 7] %/an. Frontière : 85 000 $ PPA par habitant croissant de 1,3 %/an ; y = revenu PPA réel par habitant ; institutions = (efficacité de l'État + état de droit) / 200 ; β = 2,5 %/an par point de log au-delà d'un seuil de 0,3 (convergence conditionnelle) ; α = 0,7.
- La croissance potentielle (état, initialisée aux projections du FMI) converge vers g_LT : `g_pot ← g_pot + (g_LT − g_pot)·dt / 8 ans`.
- Croissance structurelle du mois : `g_s = g_pot − e_stab·[pén(S) − pén(S₀)] − e_dette·[excès(d)·prime(n) − excès(d₀)·prime(n₀)] + e_inv·(investissement public − initial) − e_ins·(insurrection − insurrection₀)/100 + frein technologique`, avec `pén(S) = max(0, 50 − S)²` (stabilité), `excès(d) = max(0, d − 90 − 150·monnaie de réserve)`, la prime de risque de la notation (§5.8), e_ins = 4 %/an pour 100 points d'insurrection (phase 4) et le frein des contrôles technologiques (§9).

### 5.2 Cycle : écart de production

`x(t+1) = φ·x(t) + (1 − φ)·e_trade·Σ_j (exportations i→j / PIB_i)·x_j(t) + impulsion énergie + impulsions du monde + ε`

- φ = 0,95 par mois (demi-vie d'un an), e_trade = 1 (contagion par les exportations).
- Impulsion énergie : `−e_imp·Δ(facture nette)` pour un importateur, `−e_exp·Δ(facture nette)` pour un exportateur (`energy_importer` = 0,6, `energy_exporter` = 0,15), la facture nette étant (consommation − production) × (prix courant − prix initial indexé), en % du PIB.
- Impulsions du monde (phase 4, variations du mois) : pertes d'exportations hors énergie (`−0,6 × Δpertes`, §8), choc financier des sanctions (§9), pénurie d'énergie (`−0,5 × Δpénurie`, §10), pénurie de produits critiques (§11), facture du blé (`−0,6 × Δfacture` pour un importateur net, `−0,15 × Δfacture` pour un exportateur, §11).
- ε ~ N(0, σ·(1 + k·fragilité²)), fragilité = 1 − stabilité/100, σ = 0,3 point, k = 3 : les pays instables ont des cycles plus amples.
- PIB en volume = PIB potentiel × niveau commercial × niveau des hydrocarbures × (1 + x/100), le PIB potentiel croissant au rythme g_s. Niveau commercial : gains à l'échange (§8). Niveau des hydrocarbures : `1 + e_vol × Σ rente₀ × (production / production de référence − 1) / 100` (e_vol = 1) : la production est de la valeur ajoutée, l'effet dure autant que la variation de production (DECISIONS D78). La croissance affichée est le glissement sur douze mois (historique reconstitué au rythme potentiel initial : elle part de g_pot).
- PIB en dollars courants : suit le volume et l'inflation du dollar (numéraire, les États-Unis) ; le PIB en PPA suit le même rythme.

### 5.3 Inflation

- π = cœur + choc de prix importés. Le choc cumule les sauts de prix (énergie, alimentation, dévaluation) et s'estompe en douze mois (facteur e^(−1/12) par mois).
- Saut énergie (points) : `pass_énergie × Σ_combustibles consommation × Δprix / PIB` ; saut alimentation : `pass_alim × part de l'alimentation × variation du prix du blé` ; saut des prix importés (phase 4) : `0,5 × Δ(surcoût des importations)`, droits de douane et primes des fournisseurs de remplacement (§8).
- Cœur : `cœur ← cœur + (cible_cœur − cœur) / 12`, avec `cible_cœur = ancrage + monétisation + 0,3·x + 0,3·choc`. Ancrage = a·cible + (1 − a)·π₀, a = 0,2 + 0,7 × indépendance de la banque centrale (bornée à [0, 1]) : les banques centrales indépendantes ramènent l'inflation vers leur cible, les autres restent près de l'inflation de départ.
- Monétisation : `m = part monétisée × déficit` (% du PIB) ; `3 × m × (1 + (m / 8)²)` points d'inflation : au-delà de 8 % du PIB monétisés, l'emballement est rapide (hyperinflation).

### 5.4 Chômage

Loi d'Okun sur la variation de l'écart de production et retour lent vers le taux initial : `u ← u − 0,4·(x − x_préc) + (u₀ − u)·dt / 5 ans`.

### 5.5 Comptes extérieurs

- Rentes d'hydrocarbures : `rente = rente₀ × (prix / prix₀) × (production / production de référence)`, la référence suivant la capacité mondiale (§6) ; rentes des ressources = initiales + variations.
- Solde courant : `CA ← CA − Δ(facture énergétique) + Δ(volumes) − Δ(pertes d'exportations) + Δ(importations perdues) − Δ(surcoût des importations) − Δ(facture du blé) + (CA₀ − CA)·dt / 5 ans`.
- Réserves : suivent le PIB nominal (le déficit courant initial est financé par les entrées de capitaux) ; les écarts du solde courant à son niveau initial les font varier selon le régime de change (flottant 0,1 ; administré 0,3 ; fixe ou dollarisé 0,5 ; union monétaire 0). Mois d'importations = réserves utilisables (hors gelées) / importations × 12.
- **Crise de balance des paiements** (changes administrés, fixes ou dollarisés ; hors factions) : quand les réserves passent sous 1,5 mois d'importations, dévaluation de 30 % (saut des prix importés = 0,5 × importations × 30 %, transmis à l'inflation), soutien extérieur de 2 mois d'importations, notation −2 crans et −3 points de croissance potentielle décroissant sur un an. Journalisée avec ses facteurs.

### 5.6 Budget et dette

- Recettes = `recettes × efficacité / efficacité initiale + 0,6 × (rentes − rentes initiales)`. Efficacité de collecte (levier) calculée au départ : `0,5 + 0,5 × (efficacité de l'État + contrôle de la corruption) / 200`.
- Dépenses primaires = Σ postes (défense, social, santé, éducation, R&D, infrastructures, subventions, sécurité, aide) + autres dépenses − ajustement de la règle budgétaire + coût d'accueil des nouveaux réfugiés (§14). Les **autres dépenses** sont calées au départ pour que le solde soit celui du FMI (elles absorbent postes non ventilés et écarts de définition).
- Intérêts = taux moyen apparent × dette ; solde = recettes − dépenses primaires − intérêts (recalculés à chaque commande).
- Financement mensuel : un déficit est couvert d'abord par le fonds souverain, au prorata de sa taille (`min(1, tirage × fonds / PIB)`, sans dépasser ce qu'il contient), puis par la dette pour sa part non monétisée ; un excédent va au fonds (pays qui en ont un) ou au désendettement. `dette ← (dette + déficit financé par emprunt × dt) / (croissance nominale du mois)`.

### 5.7 Règle budgétaire (en attendant les décisions des pays, phase 7)

Le solde primaire se rapproche d'une cible : `cible = (i − g_n) / (100 + g_n) × dette + 0,03 × (dette − dette initiale)` (solde qui stabilise la dette, plus une réaction à la dette de type Bohn, 1998), g_n = croissance potentielle + inflation anticipée. L'ajustement (`bud.fiscal_adjustment`, état) évolue de `0,2 × (cible − solde primaire) × dt`, borné à ±20 points de PIB (catalogue). En défaut, sans accès aux marchés, la cible est au moins l'équilibre primaire et la vitesse au moins 1/an (austérité).

### 5.8 Taux souverains (`finance.ts`)

- Inflation anticipée = a·cible + (1 − a)·π (même ancrage qu'au §5.3).
- Prime de risque = `0,3 × e^(0,2 × (20 − notation))` (notation 0–20, 20 = AAA ; en défaut, notation 0).
- Taux de marché = `taux moyen initial + Δ taux directeur mondial + 1 × Δ inflation anticipée + Δ prime + prime des sanctions financières (§9)`, plancher −1 % : le niveau initial vient des données (dette concessionnelle comprise), seuls les écarts à la situation de départ le déplacent. Un pays déjà en défaut au départ paie le taux de sa dette restructurée.
- Le taux moyen apparent converge vers le taux de marché au rythme du renouvellement de la dette : `i ← i + (taux de marché − i)·dt / maturité` (gelé pendant un défaut).

### 5.9 Notation et défaut souverain

- Révision tous les six mois vers la notation implicite `n₀ − Δdette/15 − max(0, Δinflation)/10 + Δcroissance potentielle/2`, d'un cran au plus par révision, sans dépasser n₀ + 3 ni sortir de [1, 20].
- Probabilité annuelle de défaut : `min(30 %, 0,1 % × e^(0,43 × (12 − notation)))` (BBB : 0,1 %/an ; B− : ≈ 2 % ; CCC+ : ≈ 3 % ; C : ≈ 11 %), proche des fréquences historiques de défaut des souverains. Tirage mensuel `1 − (1 − p)^(1/12)` (hors factions).
- Défaut : notation 0, `eco.in_default`, −4 points de croissance potentielle (décroissance linéaire sur deux ans) et −10 points de stabilité (demi-vie de six mois) ; journalisé avec ses facteurs (notation, probabilité, dette, intérêts / recettes, taux, croissance, réserves). Restructuration au bout de 24 mois : décote de 30 % sur la dette, notation 4 (CCC+), et le taux moyen repart du taux de marché d'après la restructuration (nouveaux coupons).

**Limites** : pas de secteur bancaire ni de taux de change explicite (hors crises) ; politique monétaire résumée par l'ancrage et le taux directeur mondial (levier) ; règle budgétaire uniforme ; cycles d'autant plus amples que la stabilité est faible (y compris pour de grandes économies diversifiées) : σ et k sont à calibrer (CALIBRATION.md).

## 6. Marchés mondiaux simplifiés (`systems/markets.ts`, SPEC §8.3)

Pour chaque produit (pétrole, gaz par zone, charbon, blé, engrais, cuivre, lithium, terres rares, uranium) :

`prix* = prix d'ancrage × (demande / offre)^(1/ε)` ; `ln p(t+1) = ln p + (ln p* − ln p) / délai + σ·N(0, 1)`

- **Ancrage** : prix au jour des données, en dollars constants (indexé sur l'inflation du dollar). Il contient la prime de crise du départ (guerre d'Iran, détroit d'Ormuz), expliquée par les routes (phase 4) : le prix structurel que vise l'investissement est `p₀ · A₀^(1/ε)`, A₀ offre de départ / offre routes libres (0,893 pour le pétrole), et ε = 0,31 le place à 72,5 $, le Brent d'avant la guerre (DECISIONS D68). Rouvrir les détroits y ramène le prix.
- **Demande et offre** : indices relatifs au départ. Énergies fossiles : consommation de chaque pays déplacée par son PIB en volume (élasticité-revenu), une tendance et le prix (élasticité-prix appliquée après la formation du prix) ; production de chaque pays = capacité × [d + (1 − d)·a], d part consommée sur place, a accès de ses exportations (routes, sanctions, guerres ; §8), la capacité croissant avec la capacité mondiale, `capacité += (tendance + réponse × ln(p / p_structurel))·dt` : l'investissement ramène le prix vers son niveau structurel à long terme. Blé, engrais : offre selon les parts d'exportation (`res.*`), demande selon la population mondiale ; métaux : parts de production minière (USGS), demande selon le PIB mondial.
- **Pétrole** : la capacité inutilisée (OPEP+, `energy.spare_capacity`) se mobilise en trois mois quand la demande dépasse l'offre (indices relatifs au départ, qui intègre déjà la crise d'Ormuz : il faut un marché plus tendu qu'au départ), seulement celle des producteurs dont les exportations passent (un producteur bloqué derrière Ormuz ne peut la vendre) ; les prélèvements sur les stocks stratégiques des importateurs (§10) réduisent les achats sur le marché.
- **Gaz** : trois zones (Europe : Europe, Moyen-Orient, Afrique ; Asie ; Amériques). L'écart de chaque zone est mélangé à la moyenne des autres par l'arbitrage du GNL (0,3).
- **Engrais** : prix d'équilibre multiplié par (gaz européen / initial)^part du gaz dans le coût.
- **Puces avancées** : indice d'offre = 100 × parts de fabrication courantes / initiales.
- Consommation d'énergie primaire : activité (élasticité 0,6) et efficacité (−1 %/an).

**Limites** : pas de spéculation ni de prime de précaution (le prix monte au rythme de l'ajustement, pas d'un bond à l'annonce d'une fermeture) ; demande et offre en indices (les volumes mondiaux des sources ne s'équilibrent pas) ; coûts de production implicites dans l'ancrage.

## 7. Comptes dérivés (`systems/accounts.ts`, `derived.ts`)

Recalculés après chaque pas et chaque commande, sans coefficient : PIB par habitant, indice de misère (inflation + chômage), budget de défense (PIB × part de la défense), aide versée (PIB × part de l'aide, approximation du RNB), intensité énergétique (énergie primaire / PIB), dépendance énergétique ((consommation − production de pétrole, gaz et charbon) / énergie primaire). Croissance mondiale : moyenne des croissances pondérée par le PIB en PPA (convention du FMI), hors factions.

## 8. Commerce, routes et détroits (`systems/trade.ts`, SPEC §8.3, phase 4)

Pas mensuel ; accès, parts maritimes et flux par les détroits recalculés après chaque commande. Principe (DECISIONS D66) : le commerce observé est celui de routes libres (BACI 2024, avant la fermeture d'Ormuz) ; les frictions se mesurent par rapport au départ, les données les intégrant déjà.

### 8.1 Détroits

La capacité de passage `zone.chokepoint_traffic` (% du trafic normal) rejoint la cible de son statut : ouvert 100 ; contesté : capacité de départ si le passage l'était déjà, sinon `contested_capacity` = 50 ; fermé 0. Délai : 1 mois à la fermeture, 3 mois à la réouverture.

### 8.2 Routes

- Part terrestre L d'une paire : voisins 0,8 ; reliés par la terre `0,6 · e^(−km / 2 500)` ; au moins 0,8 si l'un des deux est enclavé (rail, route, oléoducs plutôt qu'un port étranger ; D79).
- Accès : `ρ_ij = L + (1 − L) · [p_p + (1 − p_p) · p_a · (km_p / km_a)^γ]`, p_p et p_a produits des capacités des détroits de la route principale et de l'alternative (graphe océanique, §1.8), γ = 0,5 : le détour coûte du volume ; sans alternative, la part maritime bloquée est coupée.

### 8.3 Échanges bilatéraux

`T_ij = T⁰_ij · (Y_i / Y_i⁰)^α · (Y_j / Y_j⁰)^β / (Y_w / Y_w⁰)^(α+β−1) · Φ_ij` (α = β = 1), exportations de i vers j.

Φ rejoint `Φ* = min(20, ρ_ij(t) · Π_k F_k(t) / F_k(0))`, vite à la baisse (1,5 mois), lentement à la hausse (6 mois). Frictions, en logarithme :

| Friction                     | ln F                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Droits de douane             | `−4 · ln(1 + (droit moyen de j + droit bilatéral de j sur i) / 100)`                                                                                                                                                                                                                                                                               |
| Sanctions (dans chaque sens) | `ln(1 − b)`, `b = min(0,95 ; 1 − (1 − min(1, g)) · (1 − 0,3 · finance) · (1 − 0,5 · transport · part maritime))`, g = Σ biens poids × volet : énergie (volet énergie), alimentation et minerais (commerce), puces (technologie), manufacturés (max(commerce, 0,3 · technologie)) ; poids = composition des exportations de i (`trade.composition`) |
| État de la relation          | `ln(1 − coupure)` : guerre 0,95, blocus 0,9, cessez-le-feu 0,5, crise 0,3, tension 0,1                                                                                                                                                                                                                                                             |
| Bloc commercial commun       | +0,5                                                                                                                                                                                                                                                                                                                                               |
| Relations                    | `+0,2 · (R_ij + R_ji) / 200`                                                                                                                                                                                                                                                                                                                       |
| Fragmentation                | `−0,5 · (fragmentation mondiale / 100) · \|alignement_i − alignement_j\| / 200`                                                                                                                                                                                                                                                                    |

### 8.4 Réorientation

La perte `T_réf − T` est répartie entre ses causes par la décomposition logarithmique des frictions (routes comprises). Part reportée par l'exportateur : droits, blocs, relations, fragmentation 0,5 ; sanctions contre lui : son contournement (§9) ; sanctions qu'il impose 0,6 ; guerre 0,5 ; routes 0,2. Part remplacée par l'importateur : 0,7 (droits, sanctions qu'il impose, blocs, relations, fragmentation) ; sanctions contre lui : son contournement ; guerre 0,5 ; routes 0,6. Décote de 15 % sur les exportations réorientées, prime de 15 % sur les importations de remplacement.

### 8.5 Effets sur l'économie

Hors énergie (marchés, §6, et approvisionnement, §10), en % du PIB, variations du mois :

- pertes d'exportations nettes des reports → impulsion `−0,6 · Δ` sur l'écart de production ;
- importations perdues non remplacées → niveau du PIB par les gains à l'échange (Arkolakis, Costinot et Rodríguez-Clare, 2012) : `niveau = (λ / λ₀)^(−1/θ)`, λ = 1 − m₀ + pertes / 100 part de la demande servie par la production nationale, m₀ importations de départ, θ = 5 ;
- surcoût des importations (droits en plus, primes de remplacement) → saut de prix `0,5 · Δ` ;
- solde courant : `−Δ(pertes d'exportations) + Δ(importations perdues) − Δ(surcoût)`.

**Limites** : les échanges de services ne sont pas bilatéralisés ; la réorientation ne choisit pas de partenaire (elle s'agrège par pays) ; pas de coût de transport explicite au-delà du détour.

## 9. Sanctions (`systems/sanctions.ts`, SPEC §8.6, phase 4)

`pair.sanctions` (émetteur → visé) porte six volets d'intensité 0–1 : commerce, finance, technologie, énergie, élites, transport. Les effets sur les flux sont dans le commerce (§8), l'énergie (§10) et les produits critiques (§11). Pour chaque pays visé :

- **pression financière** : `0,8 · Σ_groupes monétaires part de réserve du groupe · intensité maximale du volet finance dans le groupe + 0,2 · Σ_émetteurs intensité · part du PIB mondial` (une union monétaire compte une fois : l'euro) ;
- **sanctions secondaires** : puissance des monnaies de réserve des émetteurs (dollar, euro) ;
- **pression technologique** : `Σ intensité · (0,5 · part de la fabrication mondiale de puces + 0,5 · part du PIB mondial)` de l'émetteur ; **élites** : `Σ intensité · part du PIB mondial` ;
- **contournement** : `capacité (trade.sanction_evasion) · (1 − 0,8 · secondaires) · (1 − e^(−âge / 12 mois))`, l'âge repartant de zéro quand la pression d'ensemble augmente de plus de 0,02 ;
- **réserves gelées** : part des réserves détenues dans les monnaies des émetteurs, par rapport au départ (les gels en cours sont dans les données).

Effets, par rapport au départ, avec l'exposition financière = pression financière × intégration financière :

- choc financier : impulsion `−3 · Δ(exposition)` sur l'écart de production ;
- prime de risque souveraine : `+3 points · (exposition − exposition₀)` ;
- exposition aux contrôles à l'exportation = donnée de départ + écart de pression technologique ; frein de la croissance potentielle `−1 %/an · Δexposition · (1 − autonomie en semi-conducteurs)` ;
- élites : stabilité `−10 points × Δ` (§13) et risque de coup d'État `× (1 + 2 · Δ)`.

## 10. Énergie (`systems/energy.ts`, SPEC §8.4, phase 4)

Chaque importateur j reçoit de chaque fournisseur i une part de ses importations d'énergie (`pair.energy_dependence`, chapitre 27 du SH). Le flux passe selon la route, les sanctions sur l'énergie (dans un sens ou dans l'autre) et la guerre : `f_ij = ρ_ij · (1 − sanctions_énergie) · (1 − 0,95 · guerre)`.

- **Flux établis** E_ij (ceux sur lesquels l'importateur compte, D77) : flux de départ, qui suivent ensuite les flux courants, en 3 mois quand un fournisseur revient, en 24 mois quand une perte dure et devient la nouvelle normale.
- **Manque** : `manque_j = Σ_i dép_ji · max(0, E_ij − f_ij) / Σ_i dép_ji · E_ij`, remplacé par d'autres fournisseurs en 3 mois (au prix mondial, qui monte avec la perte d'offre).
- **Stocks stratégiques** (`trade.oil_stocks`, jours de consommation de pétrole) : convertis en jours d'énergie primaire par la part du pétrole ; prélèvement `min(stock × part du pétrole, besoin en jours)`, reconstitution en 12 mois quand l'approvisionnement revient ; les prélèvements réduisent les achats sur le marché du pétrole.
- **Pénurie** (% de la consommation d'énergie) : `(manque − remplacé) · dépendance aux importations − prélèvement`. Effets : impulsion `−0,5 · Δpénurie` sur l'écart de production ; stabilité `−0,5` et approbation `−0,8` point par point ; événement au-delà de 2 %, avec les fournisseurs perdus pour facteurs.

Volumes et prix : la production d'un exportateur bloqué baisse (§6), avec un effet de niveau sur son PIB (§5.2, D78) ; les prix alimentent la facture énergétique (§5.2, §5.5).

**Limites** : pas de réseau de gazoducs explicite (les dépendances bilatérales en tiennent lieu) ; électricité non modélisée ; pas de prime de précaution sur les prix (§6).

## 11. Alimentation et produits critiques (`systems/resources.ts`, phase 4)

- **Tension alimentaire** (points de consommation des ménages, recalculée après chaque commande) : `tension = part de l'alimentation · (0,3 + 0,7 · dépendance céréalière) · max(0, p / p₀ − 1)`, dépendance = 1 − autosuffisance (bornée à [0, 1]), p prix effectif du blé, p₀ prix de départ indexé sur le dollar. Effets : stabilité `−0,4`, approbation `−0,5` point par point (§13).
- **Famine** : surmortalité (‰/an) `= 0,05 · max(0, tension − 15) · max(0, 1 − PIB par habitant / 4 000 $)`, lue par la démographie ; consignée au-delà de 0,5 ‰/an ; elle alimente la pression de départ des réfugiés (§14).
- **Facture du blé** (D80) : importations nettes `population · 0,1 t · (1 − autosuffisance)` (négatives pour un exportateur) × (p − p₀), en % du PIB ; impulsion `−0,6 · Δfacture` (importateur net), `−0,15 · Δfacture` (exportateur : gain) ; solde courant.
- **Produits critiques** (puces, terres rares) : chaque importateur reçoit de chaque fournisseur une part (`pair.critical_dependence`). Le flux passe selon la route, les sanctions (technologie pour les puces, commerce pour les terres rares), les restrictions d'exportation du fournisseur et la guerre. La part perdue depuis le départ est remplacée en 6 mois ; le reste freine l'activité : `impulsion = −e · 100 · Δ(non remplacé) · part manufacturière · exposition`, e = 0,15 (puces, exposition = 1 − autonomie en semi-conducteurs) ou 0,05 (terres rares, exposition = 1). Les sommes se font dans l'ordre des indices (D83).

**Limites** : un seul produit alimentaire (le blé) ; pas d'eau ni de sécheresse (phase 6) ; engrais par le prix seulement (§6).

## 12. Relations, affinité, blocs et ONU (`systems/diplomacy.ts`, SPEC §8.6, phase 4)

### 12.1 Affinité structurelle

Affinité de i envers j (−100 à +100), somme bornée de facteurs, chacun consultable dans « Pourquoi ? » :

| Facteur                | Contribution (points)                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Similarité des régimes | `15 · (1 − 2 · \|dém._i − dém._j\|) · (0,5 + idéologie_i)`                                                          |
| Blocs communs          | `25 · min(1, Σ poids)` : militaire 1, union 0,6, économique et sécurité 0,4, régional 0,25, énergie 0,2, forum 0,15 |
| Interdépendance        | `15 · min(1, (T_ij + T_ji) / PIB_i / 5 %)`                                                                          |
| Ennemis communs        | `10 · min(1, communs / 2)` (relation < −40)                                                                         |
| Griefs, revendications | `−30 · grief / 100`, `−30 · revendication / 100` (`pair_ties.yaml`, D85)                                            |
| Proximité culturelle   | `15 · proximité / 100` (20 par défaut dans la même région)                                                          |
| Votes à l'AGNU         | `25 · (1 − \|alignement_i − alignement_j\| / 100)`                                                                  |
| Aide reçue de j        | `10 · min(1, aide / PIB_i / 1 %)`                                                                                   |
| Menace perçue          | `−25 · part militaire de j · proximité · hostilité de j` (proximité 1 si frontière, sinon `e^(−km / 2 000)`)        |
| État de la relation    | `−50 ×` guerre 1, blocus 0,8, crise 0,5, cessez-le-feu 0,4, tension 0,2                                             |
| Sanctions              | `−25 · max(intensités dans les deux sens)`                                                                          |
| Traité                 | `20 ×` défense mutuelle 1, partenariat 0,5, non-agression 0,25, `× (0,5 + loyauté envers les alliés)`               |
| Écart de révisionnisme | `−15 · \|révisionnisme_i − révisionnisme_j\|`                                                                       |

### 12.2 Relation

`R_ij(t+1) = R_ij + 0,05 · (A_ij + résidu_ij + mémoire_ij − R_ij)` (D72) :

- **résidu de calage** = relation de départ (`relations_seed.yaml`) − affinité de départ ; demi-vie 10 ans ; une alternance en efface la moitié (§13) ; une relation saisie par l'utilisateur déplace le résidu d'autant ;
- **mémoire des chocs**, demi-vie 24 mois : sanctions imposées (visé −0,3, émetteur −0,15 point par % d'intensité), levées (+0,1), guerre −40, paix +10, traité +5 par niveau, condamnations de coup d'État et de l'ONU.

### 12.3 Blocs

Les appartenances (`dip.memberships`) se modifient par la commande `bloc` (adhésion, retrait, D71) : les traités de défense mutuelle des blocs militaires suivent (crédibilité 0,8, D73), un bloc aux sanctions communes (UE) transmet ses sanctions à l'adhérent, le bloc commercial joue sur les frictions (§8.3) et l'affinité.

### 12.4 ONU

Commande `unResolution` (sanctions, condamnation, cessez-le-feu, maintien de la paix), pays visé, auteur facultatif. Soutien de chaque membre du Conseil de sécurité : `−R_mt / 100 + base du type (sanctions −0,1, condamnation 0, cessez-le-feu 0,2, maintien de la paix 0,3) + 0,2 si le pays visé est en guerre` ; pour au-delà de 0,15, contre en deçà de −0,15 ou si allié par défense mutuelle, abstention sinon. Adoption : 9 voix et aucun veto d'un membre permanent (Charte, article 27) ; sinon, vote non contraignant de l'Assemblée générale. Effets d'une résolution adoptée :

- sanctions : chaque État les applique à hauteur de `(0,5 + 0,5 · efficacité de l'ONU) · (1 − max(0, R_it) / 100)` (commerce 0,5 si aucun volet n'est précisé) ;
- condamnation : relations du pays visé envers les votants −10 (réciproque × 0,5) ; sanctions et vote de l'Assemblée : moitié de ce choc ;
- maintien de la paix : insurrection `−15 × (0,5 + 0,5 · efficacité)` pendant 730 jours ;
- cessez-le-feu : consigné (fronts en phase 5).

Les facteurs (votes, relations, veto) sont consignés au journal.

**Limites** : les pays ne décident pas encore (sanctions, adhésions, résolutions viennent de l'utilisateur ou des scénarios, IA en phase 7) ; pas de soutien militaire aux factions (phase 5) ; l'aide compte pour son destinataire seulement.

## 13. Politique intérieure (`systems/politics.ts`, SPEC §8.5, phase 4)

### 13.1 Stabilité

Calée sur la situation de départ (WGI, D49) : `S* = S₀ + Σ_k signe_k · a_k · (f_k(t) − f_k(0))`, `S(t+1) = S + 0,08 · (S* − S)`. Facteurs et coefficients (points par point sauf mention) : misère (chômage + inflation amortie, échelle 10 %) 0,4 ; récession 1 ; tension alimentaire 0,4 ; pénurie d'énergie 0,5 ; lassitude de la guerre 8 points sur 3 ans selon la tolérance aux pertes ; ralliement au drapeau 8 points, demi-vie 6 mois ; inégalités 0,3 ; corruption 0,15 ; contrôle de l'information 0,1 ; répression 0,1 (hors démocraties) ; légitimité 0,3 ; fragmentation × insurrection 20 points ; ingérence étrangère 5 points ; sanctions visant les élites 10 points ; réfugiés 2 points par % de la population au-delà de la capacité d'absorption (1 % × cohésion / 50). Les chocs d'événements (défaut, coup d'État, révolution…) sont des effets temporaires sur la valeur effective.

### 13.2 Approbation, légitimité, cohésion

- **Approbation** du gouvernement, calée sur son début : croissance 1, misère 0,8, tension alimentaire 0,5, pénurie d'énergie 0,8, ralliement 15 points, usure `8 · (1 − e^(−ancienneté / 3 ans))` (elle sature), état de grâce 8 points (demi-vie 6 mois) ; inertie 0,15/mois ; un nouveau gouvernement part de 50 %.
- **Légitimité** : `L* = ancre + 0,2 · (approbation − approbation de départ)`, inertie 0,05/mois ; ancre = légitimité de départ `0,5 · voix et responsabilité + 0,5 · efficacité du gouvernement`, abaissée par un coup d'État (× 0,6).
- **Cohésion sociale** : départ `100 · (1 − 0,35 · fractionnement ethnique − 0,25 · religieux) − 0,8 · max(0, Gini − 30)` ; baisse de 3 points par % de réfugiés et de 0,2 par point d'insurrection au-delà du départ ; inertie 0,02/mois.
- **Insurrection** : `I* = I₀ + [fragile(S) − fragile(S₀)] · (0,5 + fragmentation)`, `fragile(x) = max(0, 30 − x)`, fragmentation = 1 − cohésion / 100, inertie 0,05/mois (D76 : un État solide qui perd de la stabilité ne voit pas naître d'insurrection). Guerre civile à 60, fin à 30 (sans faction armée : phase 5, D75) ; l'insurrection freine la croissance (§5.1).
- **Contestation** : manifestations sous 30 de stabilité, crise politique sous 20, soulèvement sous 8, avec une marge de 3 points (hystérésis) ; retour au calme consigné.

### 13.3 Élections (démocraties, à la date de `pol.next_election`, contrôle quotidien, D70)

`p(alternance) = compétitivité · σ(0,12 · (50 − approbation − 4))`, compétitivité = `(démocratie électorale − 0,3) / (0,7 − 0,3)` bornée à [0, 1]. Tirage désigné par une clé (`election|pays|date`, D69). Alternance (D67) : le profil d'opposition (`ai.opposition_profile`) remplace le profil décisionnel, qui devient l'opposition ; nouveau gouvernement (approbation 50 %, ancienneté 0) ; la moitié du résidu de calage des relations s'efface. Prochaine élection au même jour, un mandat (4 ans par défaut) plus tard. En crise politique, élections anticipées : 5 %/mois, 60 jours après.

### 13.4 Régimes non démocratiques

- **Coup d'État** : `risque (%/an) = min(15, base · e^(0,4 · (40 − S) / 10) · e^(0,3 · (80 − loyauté de l'armée) / 10) · (1 + 0,1 · max(0, −croissance)) · (1 + 2 · max(0, élites − élites₀)) · min(1, (5 000 $ / PIB par habitant)^1))`, base : junte 2, autocratie 0,6, hybride 0,8, démocratie imparfaite 0,2, démocratie 0,02, autre 0,5 ; le PIB par habitant est en dollars du départ, et la richesse protège au-delà du seuil (Londregan et Poole, 1990 ; Przeworski et Limongi, 1997 ; D86). Un coup réussi : régime de junte (profil par défaut des juntes), stabilité −15 (demi-vie 180 jours), ancre de légitimité × 0,6, démocratie électorale × 0,3, élections suspendues, suspension de l'UA et de la CEDEAO, condamnation (−10) par les démocraties (indice ≥ 0,5).
- **Transition d'une junte** : 11 %/an (durée moyenne d'environ 9 ans des régimes militaires de 1946 à 1999, Geddes 1999) : régime hybride, même profil, élections rétablies au terme d'un mandat (la junte gagne le plus souvent l'élection qu'elle organise).
- **Succession non planifiée** : probabilité annuelle `pol.succession_risk` (hypothèse par défaut selon le régime) `× (1 − compétitivité)` : là où les élections choisissent l'exécutif, la constitution règle la succession ; stabilité −8, nouveau gouvernement.
- **Révolution** (stabilité < 12) : `taux = 10 %/an · (12 − S) / 12 · (1 − répression · loyauté)` ; stabilité −10, démocratie électorale au moins 0,4, élection un an plus tard.

**Limites** : pas de partis ni de résultats en voix ; la guerre civile ne crée pas encore de faction (phase 5) ; le soutien à la guerre (`pol.war_support`) viendra avec les guerres (phase 5).

## 14. Réfugiés (`systems/refugees.ts`, SPEC §8.1, phase 4)

Pas mensuel, après la démographie ; les réfugiés présents au départ (HCR) sont conservés.

- **Pression de départ** : `D = 1 · insurrection / 100 + 1 · exposition à une guerre terrestre + 0,1 · surmortalité de famine (‰/an) + 0,1 · max(0, 10 − stabilité) / 10` ; exposition : part militaire de l'ennemi le plus fort parmi les voisins terrestres en guerre avec le pays.
- **Stock visé de nouveaux réfugiés** : `population · 0,15 · max(0, D − D₀ − 0,1)` (zone morte : une hausse modérée déplace surtout à l'intérieur du pays, D74). Départs vers ce stock en 4 mois (au plus 20 % de la population par mois), retours en 24 mois, depuis les pays d'accueil au prorata des nouveaux réfugiés qu'ils accueillent.
- **Destinations** : poids `(population_j / 10⁶)^1 · proximité · revenu · stabilité · ouverture · (1 − hostilité)`, proximité 1 si frontière, sinon `e^(−km / 1 000)` ; revenu `(PIB/hab._j / PIB/hab._i)^0,25` borné à [1/3, 3] ; stabilité `max(0,05, S_j / 50)` ; ouverture `demo.migration_openness / 100` ; hostilité = max(0, −R_ji) / 100 ; aucun départ vers un pays en crise, en blocus ou en guerre avec le pays de départ.
- La population passe d'un pays à l'autre avec la structure par âge du pays de départ (conservation de la population mondiale).
- **Accueil** : coût budgétaire `0,3 · PIB par habitant` par réfugié supplémentaire, dont 30 % couverts par l'aide internationale ; charge pour la stabilité et la cohésion (§13) ; crise des réfugiés consignée au-delà de 0,1 % de la population (fin consignée, hystérésis).

**Limites** : pas de migrations économiques ; pas de camps ni de routes migratoires ; l'ouverture migratoire vient d'un repli par défaut pour de nombreux pays (PARAMETRES.md).

## 15. Scénarios et explications (`scenarios.ts`, `explain.ts`, phase 4)

- **Scénarios** (D81) : suites de commandes datées (`SCENARIOS`), comparées à une référence de même graine sans ces commandes (ou avec leur contraire) : même journal hors scénario, tirages désignés par une clé, donc l'écart mesure l'effet du scénario et non l'aléa. `npm run sim -- --scenario <nom> --seed <n> --out <dossier>` écrit les deux trajectoires, les journaux et un rapport (`report.md` : monde, pays, événements propres au scénario avec leurs facteurs). Scénarios fournis : `ormuz` (fermeture de trois mois à partir de l'état de départ, où le détroit est déjà contesté), `ormuz-avant-guerre` (détroit rouvert, puis fermé trois mois), `sanctions-chine` (sanctions larges du G7, de l'UE et de leurs partenaires), `ble-x2` (prix du blé doublé pendant un an), `election-usa` (élection de 2028 perdue par le gouvernement sortant).
- **Explications** (D82) : `explainCountry` décompose la stabilité, l'approbation (valeur, cible, ancre, chocs temporaires, facteurs), le risque de coup d'État, la pression de départ, les pressions des sanctions et le contournement, l'approvisionnement en énergie (fournisseurs perdus), le niveau commercial et les appartenances ; `explainPair` décompose l'affinité (§12.1), le résidu et la mémoire. Fonctions en lecture seule : elles ne modifient pas l'empreinte de l'état.

## Systèmes à venir

| Section SPEC | Système                                      | Phase               |
| ------------ | -------------------------------------------- | ------------------- |
| §8.1         | Démographie, réfugiés                        | 3, 4 (fait)         |
| §8.2         | Économie et finances publiques               | 3 (fait)            |
| §8.3         | Commerce, routes maritimes, marchés          | 3, 4 (fait)         |
| §8.4         | Énergie, alimentation, minerais              | 4 (fait) ; eau en 6 |
| §8.5         | Politique intérieure                         | 4 (fait)            |
| §8.6         | Diplomatie, alliances, sanctions, ONU        | 4 (fait)            |
| §8.7         | Forces armées                                | 5                   |
| §8.8         | Guerre et fronts                             | 5                   |
| §8.9         | Nucléaire, escalade, missiles, cyber, espace | 6                   |
| §8.10        | Événements                                   | 6                   |
| §8.11        | IA des pays                                  | 7                   |
| §8.12        | Santé, climat, technologie                   | 6                   |
