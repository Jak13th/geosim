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
- Croissance structurelle du mois : `g_s = g_pot − e_stab·[pén(S) − pén(S₀)] − e_dette·[excès(d)·prime(n) − excès(d₀)·prime(n₀)] + e_inv·(investissement public − initial)`, avec `pén(S) = max(0, 50 − S)²` (stabilité), `excès(d) = max(0, d − 90 − 150·monnaie de réserve)` et la prime de risque de la notation (§5.8).

### 5.2 Cycle : écart de production

`x(t+1) = φ·x(t) + (1 − φ)·e_trade·Σ_j (exportations i→j / PIB_i)·x_j(t) + impulsion énergie + ε`

- φ = 0,95 par mois (demi-vie d'un an), e_trade = 1 (contagion par les exportations).
- Impulsion énergie : `−e_imp·Δ(facture nette)` pour un importateur, `−e_exp·Δ(facture nette)` pour un exportateur (`energy_importer` = 0,6, `energy_exporter` = 0,15), la facture nette étant (consommation − production) × (prix courant − prix initial indexé), en % du PIB ; plus `e_vol` × l'écart des volumes d'hydrocarbures à leur trajectoire de référence, pondéré par les rentes initiales.
- ε ~ N(0, σ·(1 + k·fragilité²)), fragilité = 1 − stabilité/100, σ = 0,3 point, k = 3 : les pays instables ont des cycles plus amples.
- PIB en volume = PIB potentiel × (1 + x/100), le PIB potentiel croissant au rythme g_s. La croissance affichée est le glissement sur douze mois (historique reconstitué au rythme potentiel initial : elle part de g_pot).
- PIB en dollars courants : suit le volume et l'inflation du dollar (numéraire, les États-Unis) ; le PIB en PPA suit le même rythme.

### 5.3 Inflation

- π = cœur + choc de prix importés. Le choc cumule les sauts de prix (énergie, alimentation, dévaluation) et s'estompe en douze mois (facteur e^(−1/12) par mois).
- Saut énergie (points) : `pass_énergie × Σ_combustibles consommation × Δprix / PIB` ; saut alimentation : `pass_alim × part de l'alimentation × variation du prix du blé`.
- Cœur : `cœur ← cœur + (cible_cœur − cœur) / 12`, avec `cible_cœur = ancrage + monétisation + 0,3·x + 0,3·choc`. Ancrage = a·cible + (1 − a)·π₀, a = 0,2 + 0,7 × indépendance de la banque centrale (bornée à [0, 1]) : les banques centrales indépendantes ramènent l'inflation vers leur cible, les autres restent près de l'inflation de départ.
- Monétisation : `m = part monétisée × déficit` (% du PIB) ; `3 × m × (1 + (m / 8)²)` points d'inflation : au-delà de 8 % du PIB monétisés, l'emballement est rapide (hyperinflation).

### 5.4 Chômage

Loi d'Okun sur la variation de l'écart de production et retour lent vers le taux initial : `u ← u − 0,4·(x − x_préc) + (u₀ − u)·dt / 5 ans`.

### 5.5 Comptes extérieurs

- Rentes d'hydrocarbures : `rente = rente₀ × (prix / prix₀) × (production / production de référence)`, la référence suivant la capacité mondiale (§6) ; rentes des ressources = initiales + variations.
- Solde courant : `CA ← CA − Δ(facture énergétique) + Δ(volumes) + (CA₀ − CA)·dt / 5 ans`.
- Réserves : suivent le PIB nominal (le déficit courant initial est financé par les entrées de capitaux) ; les écarts du solde courant à son niveau initial les font varier selon le régime de change (flottant 0,1 ; administré 0,3 ; fixe ou dollarisé 0,5 ; union monétaire 0). Mois d'importations = réserves utilisables (hors gelées) / importations × 12.
- **Crise de balance des paiements** (changes administrés, fixes ou dollarisés ; hors factions) : quand les réserves passent sous 1,5 mois d'importations, dévaluation de 30 % (saut des prix importés = 0,5 × importations × 30 %, transmis à l'inflation), soutien extérieur de 2 mois d'importations, notation −2 crans et −3 points de croissance potentielle décroissant sur un an. Journalisée avec ses facteurs.

### 5.6 Budget et dette

- Recettes = `recettes × efficacité / efficacité initiale + 0,6 × (rentes − rentes initiales)`. Efficacité de collecte (levier) calculée au départ : `0,5 + 0,5 × (efficacité de l'État + contrôle de la corruption) / 200`.
- Dépenses primaires = Σ postes (défense, social, santé, éducation, R&D, infrastructures, subventions, sécurité, aide) + autres dépenses − ajustement de la règle budgétaire. Les **autres dépenses** sont calées au départ pour que le solde soit celui du FMI (elles absorbent postes non ventilés et écarts de définition).
- Intérêts = taux moyen apparent × dette ; solde = recettes − dépenses primaires − intérêts (recalculés à chaque commande).
- Financement mensuel : un déficit est couvert d'abord par le fonds souverain, au prorata de sa taille (`min(1, tirage × fonds / PIB)`, sans dépasser ce qu'il contient), puis par la dette pour sa part non monétisée ; un excédent va au fonds (pays qui en ont un) ou au désendettement. `dette ← (dette + déficit financé par emprunt × dt) / (croissance nominale du mois)`.

### 5.7 Règle budgétaire (en attendant les décisions des pays, phase 7)

Le solde primaire se rapproche d'une cible : `cible = (i − g_n) / (100 + g_n) × dette + 0,03 × (dette − dette initiale)` (solde qui stabilise la dette, plus une réaction à la dette de type Bohn, 1998), g_n = croissance potentielle + inflation anticipée. L'ajustement (`bud.fiscal_adjustment`, état) évolue de `0,2 × (cible − solde primaire) × dt`, borné à ±20 points de PIB (catalogue). En défaut, sans accès aux marchés, la cible est au moins l'équilibre primaire et la vitesse au moins 1/an (austérité).

### 5.8 Taux souverains (`finance.ts`)

- Inflation anticipée = a·cible + (1 − a)·π (même ancrage qu'au §5.3).
- Prime de risque = `0,3 × e^(0,2 × (20 − notation))` (notation 0–20, 20 = AAA ; en défaut, notation 0).
- Taux de marché = `taux moyen initial + Δ taux directeur mondial + 1 × Δ inflation anticipée + Δ prime`, plancher −1 % : le niveau initial vient des données (dette concessionnelle comprise), seuls les écarts à la situation de départ le déplacent. Un pays déjà en défaut au départ paie le taux de sa dette restructurée.
- Le taux moyen apparent converge vers le taux de marché au rythme du renouvellement de la dette : `i ← i + (taux de marché − i)·dt / maturité` (gelé pendant un défaut).

### 5.9 Notation et défaut souverain

- Révision tous les six mois vers la notation implicite `n₀ − Δdette/15 − max(0, Δinflation)/10 + Δcroissance potentielle/2`, d'un cran au plus par révision, sans dépasser n₀ + 3 ni sortir de [1, 20].
- Probabilité annuelle de défaut : `min(30 %, 0,1 % × e^(0,43 × (12 − notation)))` (BBB : 0,1 %/an ; B− : ≈ 2 % ; CCC+ : ≈ 3 % ; C : ≈ 11 %), proche des fréquences historiques de défaut des souverains. Tirage mensuel `1 − (1 − p)^(1/12)` (hors factions).
- Défaut : notation 0, `eco.in_default`, −4 points de croissance potentielle (décroissance linéaire sur deux ans) et −10 points de stabilité (demi-vie de six mois) ; journalisé avec ses facteurs (notation, probabilité, dette, intérêts / recettes, taux, croissance, réserves). Restructuration au bout de 24 mois : décote de 30 % sur la dette, notation 4 (CCC+), et le taux moyen repart du taux de marché d'après la restructuration (nouveaux coupons).

**Limites** : pas de secteur bancaire ni de taux de change explicite (hors crises) ; politique monétaire résumée par l'ancrage et le taux directeur mondial (levier) ; règle budgétaire uniforme ; cycles d'autant plus amples que la stabilité est faible (y compris pour de grandes économies diversifiées) : σ et k sont à calibrer (CALIBRATION.md) ; commerce, sanctions et effets des détroits sur l'activité en phase 4.

## 6. Marchés mondiaux simplifiés (`systems/markets.ts`, SPEC §8.3)

Pour chaque produit (pétrole, gaz par zone, charbon, blé, engrais, cuivre, lithium, terres rares, uranium) :

`prix* = prix d'ancrage × (demande / offre)^(1/ε)` ; `ln p(t+1) = ln p + (ln p* − ln p) / délai + σ·N(0, 1)`

- **Ancrage** : prix au jour des données, en dollars constants (indexé sur l'inflation du dollar). Il contient la prime de crise du départ (guerre d'Iran, détroit d'Ormuz), qui sera expliquée par le statut des détroits en phase 4.
- **Demande et offre** : indices relatifs au départ. Énergies fossiles : consommation de chaque pays déplacée par son PIB en volume (élasticité-revenu), une tendance et le prix (élasticité-prix appliquée après la formation du prix) ; production de chaque pays croissant avec la capacité mondiale, `capacité += (tendance + réponse × ln(p / p_ancrage))·dt` : l'investissement ramène le prix vers l'ancrage à long terme. Blé, engrais : offre selon les parts d'exportation (`res.*`), demande selon la population mondiale ; métaux : parts de production minière (USGS), demande selon le PIB mondial.
- **Pétrole** : la capacité inutilisée (OPEP+, `energy.spare_capacity`) se mobilise en trois mois quand la demande dépasse l'offre.
- **Gaz** : trois zones (Europe : Europe, Moyen-Orient, Afrique ; Asie ; Amériques). L'écart de chaque zone est mélangé à la moyenne des autres par l'arbitrage du GNL (0,3).
- **Engrais** : prix d'équilibre multiplié par (gaz européen / initial)^part du gaz dans le coût.
- **Puces avancées** : indice d'offre = 100 × parts de fabrication courantes / initiales.
- Consommation d'énergie primaire : activité (élasticité 0,6) et efficacité (−1 %/an).

**Limites** : pas de stocks ni de spéculation ; demande et offre en indices (les volumes mondiaux des sources ne s'équilibrent pas) ; pas de commerce bilatéral des matières premières ni de routes (phase 4) ; coûts de production implicites dans l'ancrage.

## 7. Comptes dérivés (`systems/accounts.ts`, `derived.ts`)

Recalculés après chaque pas et chaque commande, sans coefficient : PIB par habitant, indice de misère (inflation + chômage), budget de défense (PIB × part de la défense), aide versée (PIB × part de l'aide, approximation du RNB), intensité énergétique (énergie primaire / PIB), dépendance énergétique ((consommation − production de pétrole, gaz et charbon) / énergie primaire). Croissance mondiale : moyenne des croissances pondérée par le PIB en PPA (convention du FMI), hors factions.

## Systèmes à venir

| Section SPEC | Système                                      | Phase                     |
| ------------ | -------------------------------------------- | ------------------------- |
| §8.1         | Démographie                                  | 3 (fait)                  |
| §8.2         | Économie et finances publiques               | 3 (fait)                  |
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
