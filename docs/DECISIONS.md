# Journal des décisions

Format : date — décision. _Alternatives écartées_ — _raison_.

---

## 2026-09-25 — Plan initial validé

### D1. Carte rendue en WebGL2 dès le départ

Texture d'identifiants de propriétaires (R16UI) combinée à une palette 1D pays → couleur. Bordures et hachures calculées dans le shader ; diffs de pixels appliqués par `texSubImage2D` ; un canvas 2D superposé porte les noms, les flèches et les animations.

- _Écartée_ : Canvas 2D avec `ImageData` pour commencer (proposition de SPEC §3).
- _Raison_ : avec la palette, changer de couche ou recolorer un choroplèthe ne met à jour qu'environ 250 couleurs, au lieu de réécrire environ 8 M pixels. Canvas 2D aurait vraisemblablement dû être réécrit dès la phase 2.

### D2. Serveur local : plugin Vite (`configureServer`)

L'API `/api/*` (scénarios, captures, `model.yaml`) est servie par le serveur de développement, qui n'écoute que sur `localhost`.

- _Écartée_ : Fastify dans un processus séparé.
- _Raison_ : un seul processus à lancer ; le HMR de Vite sert aussi à pousser le rechargement de `model.yaml`.

### D3. Phase 1 découpée en deux jalons avec arrêt

1a : géographie et carte. 1b : données pays, fichiers curés et rapport de couverture.

- _Écartée_ : une phase 1 d'un seul tenant.
- _Raison_ : c'est la phase la plus volumineuse (pipeline carte, une quinzaine de fichiers curés, environ 40 pays sourcés). Un arrêt intermédiaire permet de valider la carte avant d'y attacher les données.

### D4. Commerce bilatéral : BACI HS22 (CEPII), dernière année

Archive de 287 Mo (V202601, licence Etalab 2.0), agrégée en totaux et en 6 postes (énergie, alimentation, minerais, puces, manufacturés, services estimés).

- _Écartées_ : API SDMX IMTS du FMI (plus légère, mais sans décomposition par produit) ; modèle de gravité seul.
- _Raison_ : une seule source donne à la fois les flux bilatéraux et la composition des échanges. Le modèle de gravité + RAS reste le repli.

### D5. Classement des entités

- `state` : membres de l'ONU et États observateurs (Palestine, Saint-Siège).
- `de_facto` : entités qui contrôlent un territoire mais dont la reconnaissance est limitée (ex. Taïwan, Kosovo, Chypre du Nord, Somaliland…), avec la liste des États qui les reconnaissent.
- Territoires dépendants (Groenland, outre-mer…) : rattachés à leur État souverain, avec un attribut d'autonomie.
- _Écartée_ : reprendre tel quel le classement de Natural Earth.
- _Raison_ : règle explicite, vérifiable et neutre. Le classement n'influe que sur les mécaniques diplomatiques et reste modifiable.

### D6. Pays au niveau de détail « complet » (liste amendable)

G20 + UKR, BLR, POL, NLD, NOR, IRN, ISR, IRQ, ARE, QAT, EGY, PAK, PRK, TWN, VNM, PHL, SGP, NGA, ETH, SDN, COD, CHL, KAZ, YEM, VEN.

- _Raison_ : puissances régionales, pays en conflit et détenteurs de ressources ou de passages critiques (SPEC §5.3).

### D7. Couches de carte lourdes compactées sur les pixels terrestres

`owner`, `sovereign`, `terrain` et `flags` restent en grille pleine, car le rendu les lit. Population, valeur économique, fortification, dommages et retombées ne sont stockées que pour les pixels terrestres, via une table d'index.

- _Écartée_ : toutes les couches en grille pleine.
- _Raison_ : environ 70 Mo par état au lieu d'environ 220 Mo, ce qui compte pour les branches et le Monte Carlo. À mesurer en phase 1a.

### D8. Déterminisme garanti au sein d'un même moteur JavaScript

`Math.exp`, `Math.log` et `Math.pow` peuvent différer d'un dernier bit entre V8 et SpiderMonkey. Le hash d'état est garanti identique pour un même moteur ; Node et Chrome partagent V8.

- _Écartée_ : une bibliothèque mathématique déterministe maison.
- _Raison_ : coût élevé, gain nul pour un usage local dans Chrome et Node.

### D9. Codes d'indicateurs remplacés (vérifiés le 25/09/2026)

- WGI : `PV.EST`, `GE.EST`… → `GOV_WGI_PV.EST`, `GOV_WGI_GE.EST`… (source 3 de l'API Banque mondiale).
- `SM.POP.REFG` et `SM.POP.REFG.OR` supprimés du WDI → API UNHCR (Refugee Data Finder).
- Dette publique : FMI `GGXWDG_NGDP` en priorité, car `GC.DOD.TOTL.GD.ZS` ne couvre que 109 pays, avec une médiane en 2020.
- Chômage : FMI `LUR` ne couvre que 122 pays → repli Banque mondiale `SL.UEM.TOTL.ZS`.
- Natural Earth : `admin_0_breakaway_disputed_areas` est renommé `ne_10m_admin_0_disputed_areas`.
- USGS : les données brutes (sciencebase) renvoient 403 → `minerals.yaml` est curé à la main depuis le PDF MCS 2026.

`PARAMETRES.md` sera mis à jour en phase 1b, en même temps que le catalogue.

## 2026-09-25 — Phase 0

### D10. TypeScript 6.0 plutôt que 7.0

- _Écartée_ : TypeScript 7.0.2 (portage natif, le plus récent).
- _Raison_ : typescript-eslint 8.70 ne supporte que TypeScript < 6.1.

### D11. Node ≥ 22.12

- _Écartée_ : Node 20 (SPEC §3).
- _Raison_ : Vitest 5 exige Node 22.12 ou plus, et Node 20 est en fin de vie depuis avril 2026.

### D12. Workspaces consommés par leurs sources TypeScript

Les paquets exposent `src/index.ts` directement ; Vite, Vitest et tsx les compilent à la volée. Le typecheck se fait par workspace (`tsc -p`).

- _Écartées_ : une étape de build par paquet ; `tsc -b` avec références de projet (annoncé dans le plan).
- _Raison_ : les références imposent `composite` et l'émission de déclarations, sans bénéfice à cette taille. Le typecheck par workspace vérifie chaque paquet avec ses propres bibliothèques : le moteur est vérifié sans DOM ni Node.

### D13. Garde-fous d'architecture automatiques

- `packages/engine` et `packages/shared` sont vérifiés sans lib DOM ni `@types/node`. Leurs tests sont vérifiés par un `tsconfig.test.json` séparé, pour que les types de Vitest et de Node ne fuient pas dans le code du moteur.
- ESLint interdit dans ces deux paquets : `Math.random`, `Date.now`, `new Date()`, `performance`, les minuteries, `window`, `document`, `self`, `fetch`, `process`, et les imports `node:*` et React.
- _Raison_ : les règles 1 et 2 de CLAUDE.md sont vérifiées par l'outillage, pas seulement par discipline.

### D14. RNG : xoshiro128** initialisé par SplitMix32, un flux par système

Chaque flux est dérivé de la graine et d'un FNV-1a du nom du système. La loi normale est tirée par Box-Muller, sans mise en cache du second tirage, pour que l'état du générateur se résume à 4 entiers.

- _Raison_ : générateur rapide, bien étudié et à petit état. Des flux séparés évitent qu'un tirage ajouté dans un système décale tous les autres.

### D15. Vérification de la console par Playwright (Chromium headless)

`npm run check:console` démarre Vite, ouvre la page et échoue en cas d'erreur, d'avertissement, d'exception ou de requête échouée. Sous Ubuntu 20.04, `npm run setup:browser` force la cible Playwright `ubuntu22.04-x64`, qui fonctionne avec la glibc 2.31.

- _Raison_ : la fin de chaque phase exige de vérifier la console (CLAUDE.md) ; l'automatiser la rend systématique.

### D16. Projection : `d3-geo` seul

`geoEqualEarth` fait partie de `d3-geo` depuis la version 1.11.

- _Écartée_ : `d3-geo-projection`.
- _Raison_ : dépendance inutile.

### D17. `ParamDef` étendu

Ajout de `valueType` (`number | enum | bool | date | list | vector`) et de `components` (paramètres par domaine ou par poste). `min`, `max` et `step` deviennent optionnels, puisqu'ils n'ont pas de sens pour les listes et les dates.

- _Raison_ : `PARAMETRES.md` contient des paramètres non scalaires (`bud.defense_domains`, `mil.overseas_bases`, `pol.next_election`…) que l'interface doit savoir afficher.

## 2026-09-25 — Phase 1a (géographie et carte)

### D18. Rattachement des unités Natural Earth aux entités

Règle générale : une unité principale de Natural Earth (ADMIN = SOVEREIGNT) devient une entité identifiée par son code ISO 3166-1 alpha-3 ; les territoires dépendants, régions administratives spéciales et États associés sont rattachés à leur État souverain ; les cas particuliers sont listés, avec source, date et confiance, dans `data/curated/ne_units.yaml`. Résultat : 200 entités, dont 195 États (193 membres de l'ONU, Saint-Siège, Palestine) et 5 entités de facto.

- Kosovo : code `XKX` (Banque mondiale, UE) ; Chypre du Nord et Somaliland : codes Natural Earth `CYN`, `SOL`.
- Sahara occidental : entité de facto `ESH` (RASD) sur tout le territoire tracé par Natural Earth ; la zone contrôlée par le Maroc sera appliquée en phase 1b.
- Bases louées (Guantánamo, Baïkonour) : contrôle au locataire, souveraineté au bailleur.
- Terres neutres (propriétaire 0) : Antarctique, Bir Tawil, zone tampon de Chypre, Spratleys et récifs disputés (revendications en phase 1b).
- Champ de glace de Patagonie : partage par proximité entre l'Argentine et le Chili (hypothèse).
- Chagos : rattachées au Royaume-Uni ; le traité de 2025 avec Maurice n'est pas en vigueur au 25/09/2026.
- Abkhazie, Ossétie du Sud, Transnistrie : non découpées par Natural Earth admin 0, elles arriveront avec les zones de contrôle de la phase 1b.
- _Écartée_ : reprendre le champ TYPE de Natural Earth (« Sovereign country », « Disputed »…), qui mélange statut et dépendance.
- _Raison_ : règle explicite, contrôlée par un test (195 États), exceptions sourcées et modifiables.

### D19. Souveraineté de jure différée à la phase 1b

En phase 1a, `sovereign` = `owner` (vue de facto de Natural Earth), sauf pour les bases louées. Natural Earth attribue par exemple la Crimée à la Russie dans sa vue par défaut : la souveraineté ukrainienne sera appliquée avec les fichiers curés (`control_zones.geojson`, `disputes.yaml`).

- _Raison_ : ces corrections demandent une recherche datée, zone par zone, prévue en 1b ; les faire à moitié en 1a créerait des incohérences.

### D20. Couches de la carte

- Ajout d'une couche `unit` (Uint16) : unité Natural Earth d'origine, pour l'autonomie et le nom des territoires dépendants (Groenland, Porto Rico…).
- `terrain` distingue la mer et les lacs (tous deux « eau » au sens de SPEC §4.1).
- `flags` passe en Uint16 et inclut le fleuve majeur ; `infrastructure` est un champ de bits (route, route majeure, voie ferrée), les ports et aéroports étant des drapeaux.
- Population et valeur économique par pixel : reportées en phase 1b, car leur répartition exige les totaux nationaux.
- _Raison_ : couches statiques partagées entre états ; seul le dynamique est copié (voir D25).

### D21. Lecture des données sans dépendance lourde

Lecteur de shapefiles écrit à la main (format simple, cas limites maîtrisés), `fflate` pour les archives ZIP, `geotiff` pour WorldClim, `undici` 7 pour les téléchargements (suit `HTTPS_PROXY` ; la version 8 exige Node ≥ 22.19).

- _Écartées_ : `shapefile` (non maintenu depuis 2017), GDAL (dépendance native, interdite par SPEC §3).

### D22. Format de la carte : binaire compressé et JSON associés

`map-<résolution>.bin.gz` : en-tête JSON (ASCII) et couches brutes alignées sur 8 octets, compressé en gzip (4,5 Mo à 4096 px au lieu de 131 Mo). Le décodage est pur (`packages/shared`), la décompression est faite par l'appelant (zlib ou `DecompressionStream`). Les métadonnées (`map-*.json`), voisinages et distances (`geo-*.json`) et routes (`routes-*.json`) sont des JSON portant le même `buildId`.

### D23. Biomes : Köppen-Geiger simplifié et règle de steppe tempérée

Biomes calculés depuis cinq variables bioclimatiques WorldClim, avec une règle supplémentaire de steppe tempérée (indice de De Martonne adapté à la saison chaude, hypothèse à calibrer) : Köppen seul classait en forêt les steppes du Kazakhstan, d'Ukraine du Sud et des Grandes Plaines.

- _Écartée_ : une carte d'occupation du sol (MODIS, ESA CCI), plus fidèle aux terres agricoles actuelles mais lourde et hors des sources prévues par SPEC §4.2. À reconsidérer si les combats l'exigent.

### D24. Routes maritimes : graphe grossier, portes de détroit et chenaux

Graphe de blocs de 60 km découpés en composantes connexes (connexité fine préservée) avec arêtes en ligne de vue ; chaque détroit est une « porte » (ligne de terre à terre) dont les nœuds sont séparés ; canaux et détroits plus étroits qu'un pixel ont un chenal forcé navigable dans le graphe. La géométrie des 17 passages de SPEC §5.2 est créée dès la phase 1a dans `chokepoints.yaml` (trafic et statut en 1b) ; chaque porte est vérifiée à chaque build.

- Ports d'une entité : ceux de son territoire contigu à la capitale ; pays enclavés : accès par voie de terre jusqu'à la côte la plus proche, pays de transit consigné.
- Eaux polaires pénalisées (facteur 4 au-delà de 66,5°) pour le choix des routes.
- _Écartées_ : A* sur la grille fine (5 millions de pixels de mer, trop lent pour 20 000 paires) ; graphe à maille fixe (passages fictifs à travers les isthmes étroits : Panama, Kra, Suez).
- _Raison_ : routes plausibles (Chine–Allemagne par Malacca et Suez, 18 200 km) en 2 minutes de calcul.

### D25. Mémoire par état mesurée (confirme D7)

À 4096 px : 2,06 millions de pixels terrestres sur 8,17 millions. Couches dynamiques en grille pleine (owner, sovereign, flags) : 49 Mo ; couches lourdes compactées sur les pixels terrestres (population, valeur économique, fortification, dommages, retombées) : 22,7 Mo ; soit 71,7 Mo par état, contre 138,8 Mo en grille pleine.

### D26. Longueur des limites selon leur orientation locale

Chaque arête de pixel d'une limite compte pour |n| / (|nx| + |ny|) côté de pixel, n étant le gradient de Sobel de l'indicatrice d'une région.

- _Écartée_ : correction moyenne π/4 (sous-estimait de 21 % les limites alignées sur la grille, comme le 49ᵉ parallèle).

### D27. Données WorldClim : usage local

WorldClim 2.1 est libre pour un usage non commercial, sans redistribution. Les données brutes (`data/raw`) et dérivées (`data/build`) restent locales et ne sont pas versionnées.

## 2026-09-25 — Phase 1b (données pays et fichiers curés)

### D28. Sources automatisées : compléments à D9

- FMI (API DataMapper, World Economic Outlook d'avril 2026) : la valeur retenue est celle de l'année en cours (2026), estimation ou projection du FMI, notée comme telle (confiance `medium`). L'API refuse les requêtes sans en-tête `User-Agent` (403) : le pipeline s'identifie (`GeoSim-data-pipeline/0.1`).
- WGI : certaines lignes de l'API n'ont pas de code ISO ; elles sont rattachées par le nom du pays (liste des pays de la source 3).
- Type de régime, démocratie, polarisation : V-Dem via les graphiques d'Our World in Data ; alignement : points idéaux des votes à l'AGNU (Bailey, Strezhnev et Voeten, Harvard Dataverse) ; IDH : PNUD, rapport 2025 ; bilans alimentaires et engrais : FAOSTAT ; commerce : CEPII BACI HS22 V202601 (année 2024), lu en flux dans l'archive (366 Mo décompressés).
- Indice de capital humain : dernière édition 2020, signalée comme ancienne.
- Taïwan, absente des données de la Banque mondiale : FMI pour les agrégats macroéconomiques, budget de défense curé, médianes régionales (signalées dans le rapport) pour le reste.
- _Raison_ : chaque remplacement est tracé dans la provenance de la valeur et dans `data/build/report.md`.

### D29. Chaîne de résolution et replis

Chaque paramètre pays a une règle explicite (`scripts/data/src/country/rules.ts`, vérifiée par un test) : sources dans l'ordre, puis un repli parmi médiane régionale (même région et même revenu, puis revenu, région, monde ; ratio à la population ou au PIB pour les grandeurs extensives), hypothèse par défaut (`defaults.yaml`), zéro documenté, sans objet ou lacune signalée. Une absence dans un fichier curé exhaustif (membres du Conseil de sécurité, monnaies du COFER, réserves gelées, conflits, sanctions) vaut « aucun » avec certitude.

- _Écartées_ : imputation statistique (régression sur le revenu), plus précise mais opaque ; laisser des trous, que le moteur ne sait pas traiter.
- _Raison_ : chaque valeur estimée reste lisible (« médiane de 12 pays comparables : région SSF, revenu LIC ») et remplaçable par une donnée curée.

### D30. Plages du catalogue élargies et écrêtage

Les plages indicatives de 15 paramètres ont été élargies pour contenir les données réelles (solde courant −50–50, recettes publiques 0–120, dette publique 0–400, IDE −100–200…), comme le prévoit `PARAMETRES.md`. Une valeur encore hors plage est écrêtée à la borne ; la valeur d'origine est conservée (`clampedFrom`) et signalée (IDE du Liechtenstein, −1 303 % du PIB).

Unité de `world.metals_prices` : prix de marché en $/t (uranium : $/lb, usage du marché) au lieu d'« indices », pour citer des cotations datées sans année de base arbitraire.

### D31. Ligne de front ukrainienne : polygone simplifié de DeepStateMap (à valider)

Les territoires ukrainiens occupés (hors Crimée) viennent de la carte DeepStateMap du 24/09/2026, simplifiée (Douglas-Peucker, 18 polygones) et attribuée dans `control_zones.geojson`. Les cartes de l'ISW exigent un consentement et n'ont pas été utilisées.

- _Point à valider_ : les conditions de DeepStateMap (© DEEPSTATEUATECH LLC) encadrent la réutilisation de leurs données ; le polygone dérivé et simplifié est versionné dans le dépôt. Si le dépôt est ou devient public, ou si la licence ne convient pas, le remplacer par un tracé propre (oblasts entiers ou tracé manuel à partir des cartes publiques).

### D32. Sahara occidental : souveraineté de jure à la RASD (à valider)

La partie administrée par le Maroc reste contrôlée par le Maroc (`owner`) avec une souveraineté de jure attribuée à l'entité `ESH` (RASD, reconnue par 45 États membres de l'ONU et membre de l'Union africaine) ; la partie tenue par le Front Polisario est contrôlée par `ESH`. Confiance `low` : statut non réglé (territoire non autonome selon l'ONU), reconnaissances fréquemment retirées ou gelées.

- _Écartée_ : souveraineté marocaine (reconnue par les États-Unis, Israël et plusieurs États, mais pas par l'ONU).
- _Point à valider_ : le choix a un effet sur la légitimité des revendications en simulation.

### D33. Entités de facto, factions et unités statistiques

Huit entités de facto (dont Abkhazie, Ossétie du Sud et Transnistrie, nouvelles) et cinq factions de guerres civiles (Forces de soutien rapide, Houthis, Armée nationale libyenne, AFC/M23, Armée d'Arakan) s'ajoutent aux États : 208 entités. Leurs territoires viennent des zones de contrôle. Les entités de facto qui publient leurs statistiques sont leur propre unité statistique, retirée des totaux du pays qui les incluait (`includedIn`) ; les factions ne publient rien : leurs pixels comptent dans leur pays, et leur population et leur PIB sont calculés depuis la carte.

- _Écartées_ : ignorer les factions (la guerre au Soudan ou au Yémen n'aurait pas d'acteur) ; les traiter comme des États (double comptage des populations).

### D34. Population par pixel : noyaux urbains et habitabilité rurale

Répartition décrite dans `MODELES.md` §1.10 : noyaux gaussiens autour des villes (écart-type en racine de la population) et zones urbaines Natural Earth pour la part urbaine (taux d'urbanisation de la Banque mondiale), habitabilité biome × relief pour la part rurale ; valeur économique proportionnelle à la population avec une prime urbaine. Totaux conservés exactement.

- _Écartées_ : grilles de population GPW ou WorldPop (fidèles, mais lourdes, sous licence et hors des sources de SPEC §4.2) ; population uniforme (fronts et frappes sans enjeu).
- _Raison_ : 13 coefficients dans `config/model.yaml`, calibrables ; la comparaison avec une grille de référence est prévue en phase 8.

### D35. Profils décisionnels et relations initiales (à valider)

`profiles.yaml` : 44 profils (pays au niveau complet), 14 valeurs chacun avec une justification d'une ligne tirée des comportements observables, buts stratégiques, et profil d'alternance pour 8 démocraties ; hypothèses sur les gouvernements, jamais sur des personnes (confiance `assumption`). `relations_seed.yaml` : 148 paires clés, asymétriques quand il le faut. Les autres pays reçoivent un profil par défaut selon leur type de régime ; les autres paires viendront du modèle d'affinité (phase 4).

### D36. Construction : `--skip-map` et contrôles bloquants

`npm run data -- --skip-map` réutilise la carte construite pour itérer sur les données pays (40 s au lieu de 4 min). Arrêtent la construction : référence introuvable dans un fichier curé, provenance incomplète, valeur de profil ou de relation hors plage, paire bilatérale en double, zone de contrôle sans pixel (au-delà de 2 pixels de surface), écart aux totaux de population.

## 2026-09-26 — Phase 2 (carte interactive en lecture seule)

### D37. Données servies par l'API locale et chargées dans l'interface

Le plugin Vite sert `data/build/` en lecture seule (`/api/data/status`, `/api/data/files/<nom>`), limité à une liste blanche de fichiers ; il sert aussi le build de production (`vite preview`). L'interface choisit la carte dont le `buildId` correspond aux données pays, télécharge les archives gzip en flux et les décompresse avec `DecompressionStream` ; le décodage ne crée que des vues sur le tampon. Des builds incohérents (carte et données pays de deux constructions différentes) sont signalés à l'écran, pas dans la console.

- _Écartée_ : charger la carte dans le worker du moteur dès la phase 2.
- _Raison_ : en lecture seule, le fil principal doit de toute façon posséder les couches pour le rendu et le survol. En phase 3, le moteur possédera l'état dynamique et enverra des diffs de pixels (SPEC §7.3) ; seules les couches statiques resteront partagées.

### D38. Contrat des fichiers de données dans `@geosim/shared`

Les types de `countries.base.json`, `pairs.base.json` et `world.base.json` (valeurs résolues, provenance, méthodes, paires, blocs, conflits, détroits) passent du pipeline au paquet partagé. Le pipeline les réexporte et vérifie à la compilation que son `WorldBase` respecte la vue lue par l'interface.

### D39. Rendu : un shader, remplissage anticrénelé, bordures à l'échelle de l'écran

Complète D1. Les couches `owner`, `sovereign`, `flags`, `elevation` et un RGBA8UI (terrain, biome, urbanisation, infrastructures) sont des textures entières ; zones maritimes et densité de population sont chargées à la première utilisation de leur couche. Chaque fragment :

- au dézoom (un pixel d'écran couvre plus de 1,25 pixel de carte), moyenne la couleur de remplissage de 2 × 2 échantillons ;
- calcule une seule fois bordures (voisins à ≈ un pixel d'écran, donc fines à toute échelle), relief ombré (altitude WorldClim, lumière au nord-ouest) et mise en évidence (survol, sélection) ;
- hachure en espace écran les pixels dont contrôle et souveraineté diffèrent (couleur de l'autre entité dans les couches politiques, sombre dans les choroplèthes) ; pointille les valeurs estimées.

Le contour du globe vient de la demi-largeur Equal Earth de chaque ligne (texture R32F). Palette politique : 20 teintes OKLCH et coloration gloutonne (Welsh-Powell) sur les voisinages terrestres et maritimes, factions et entités de facto comprises, de sorte que deux voisins n'ont jamais la même couleur ; couleur de départ dérivée du code (stable d'un build à l'autre). Une surcouche Canvas 2D porte les noms, capitales, villes, détroits et routes.

- _Écartée_ : image couleur précalculée avec mipmaps (une seule lecture de texture au dézoom).
- _Raison_ : les bordures y deviendraient floues au dézoom et tout changement de couche imposerait de recalculer 8 M pixels.
- _Mesure_ : `?debug` affiche le temps GPU mesuré (extension `EXT_disjoint_timer_query_webgl2` quand le navigateur l'expose) et la cadence d'images pendant une interaction. Le conteneur de développement n'a pas de GPU (rendu logiciel SwiftShader, ≈ 4 images/s) : la fluidité à 4096 px reste à confirmer sur une machine réelle.

### D40. Couches de la phase 2

Dix couches, raccourcis 1–9 et 0 : politique (contrôle de facto), souveraineté de jure, relations du pays sélectionné, blocs et alliances (vue d'ensemble des alliances de défense mutuelle, traités bilatéraux compris, ou un bloc au choix avec membres, partenaires, observateurs et suspendus), indicateurs, sanctions (reçues, ou croisées avec le pays sélectionné), population (densité par pixel), terrain et biomes, infrastructures, mer (zones maritimes, routes des plus gros flux commerciaux, statut des détroits).

- La couche « indicateurs » accepte **tout** paramètre pays numérique, catégoriel ou booléen du catalogue qui a des valeurs (liste générée) : échelle bornée aux 2ᵉ et 98ᵉ centiles (un pays extrême n'écrase pas les couleurs), logarithmique quand le catalogue le demande, rampe viridis ; catégories en palette qualitative.
- Croissance, puissance militaire et dépendance énergétique (SPEC §9.2) sont des dérivés calculés par le moteur : proposées à partir de la phase 3 ; en attendant, croissance potentielle et budget de défense figurent parmi les indicateurs principaux.
- Différées : flux commerciaux animés, bases à l'étranger, revendications et séparatismes (polygones), fronts, retombées (phases 4 à 6).

### D41. Dérivés « par définition » dès la phase 2

PIB par habitant et indice de misère ne demandent aucun coefficient : ils sont calculés dans `packages/engine/src/derived.ts` (réutilisé par le moteur en phase 3) et affichés avec une provenance composée (voir MODELES §2.4). Les autres dérivés (croissance, puissance, cohésion sociale…) affichent « moteur (phase 3) ».

### D42. Libellés des valeurs catégorielles dans le paquet partagé

`ENUM_LABELS` (valeurs des paramètres `enum`) et `componentLabel` (composantes des vecteurs : domaines militaires, postes commerciaux, minerais, volets de sanctions…) sont déclarés à côté du catalogue ; un test vérifie que chaque valeur de chaque paramètre catégoriel a son libellé.

- _Écartée_ : ajouter les libellés dans `ParamDef`.
- _Raison_ : le test d'alignement du catalogue sur `PARAMETRES.md` reste inchangé ; la complétude est vérifiée à part.

### D43. Pas de drapeaux dans l'infobulle pour l'instant

L'infobulle montre la couleur politique du pays à la place du drapeau (SPEC §9.2). Les données ne portent pas de code ISO alpha-2, les émojis de drapeaux ne s'affichent pas sous Windows, et un jeu de drapeaux (SVG) serait une nouvelle dépendance à licence à vérifier ; les factions et entités de facto n'y figurent pas. À décider avec toi.

### D44. Cadrage et noms sur la carte

- Cadrage (recherche, bouton ⌖) : composante connexe de la capitale, plus les composantes proches (moins de 0,6 diagonale) représentant au moins 1 % du territoire. La France est cadrée sur la métropole, pas sur l'Atlantique jusqu'à la Guyane ; les États-Unis incluent l'Alaska ; le Danemark est cadré sur le Danemark.
- Noms : au point d'étiquette de l'entité (pôle d'inaccessibilité calculé par le pipeline), sauf s'il tombe dans un territoire dépendant (Danemark → Groenland) ; les territoires dépendants de plus de 100 pixels (Groenland, Nouvelle-Calédonie, Porto Rico, Malouines, Antarctique…) reçoivent leur nom, en italique, au point le plus intérieur de l'unité (transformée de distance du chanfrein). Taille selon la surface, placement glouton sans chevauchement.

### D45. Position des détroits dans `world.base.json`

Chaque détroit reçoit `lonLat`, centre de sa première porte (le cap lui-même pour les routes des caps, dont la porte court jusqu'à l'Antarctique), pour ses marqueurs sur la carte. Les données construites avant la phase 2 doivent être reconstruites : `npm run data -- --skip-map` (≈ 40 s).

### D46. `check:console` devient un test de fumée de l'interface

Le script attend la carte, parcourt les dix couches, zoome, déplace, ouvre la recherche, l'inspecteur (tous les onglets, provenance, filtres), le panneau bilatéral (Maj+Entrée dans la recherche) et le panneau Monde, et échoue au moindre avertissement. `--screenshots <dossier>` enregistre des captures. Chromium est lancé avec `--use-angle=swiftshader --enable-unsafe-swiftshader` : sans ces options, le WebGL logiciel du mode headless signale des ralentissements de lecture de pixels dans la console. Sans données construites, seule la page est vérifiée.

### D47. État de l'interface : Zustand

Couche, indicateur, bloc, survol, sélection et panneaux sont dans un magasin Zustand (SPEC §3). L'état de la simulation vivra dans le moteur (phase 3), pas dans ce magasin.

## 2026-09-26 — Phase 3 (moteur et temps réel)

### D48. État vectorisé en trois couches, tick quotidien, systèmes mensuels

Paramètres pays numériques dans des `Float64Array` P × N (colonne par paramètre) : donnée réelle (`base`), valeur courante (surcharges et évolution simulée), valeur effective (modificateurs). Un tick = un jour ; marchés, démographie, économie et budget tournent le 1er de chaque mois ; les valeurs dérivées (soldes, taux, ratios) sont recalculées après chaque pas et chaque commande, sans aléa.

- _Écartées_ : un objet par pays (lent à 208 entités × 200 paramètres, difficile à hacher) ; systèmes quotidiens (inutile pour des grandeurs mensuelles et 30 fois plus coûteux).
- _Raison_ : un pas mensuel coûte ≈ 8 ms pour 208 entités ; 20 ans se simulent en ≈ 2 s ; un curseur modifié se voit aussitôt dans les dérivés.

### D49. Calage sur la situation initiale : le modèle simule des écarts

Les niveaux viennent des données (projections du FMI pour la croissance potentielle, taux moyen apparent de la dette, solde budgétaire, prix au jour des données). Les termes de choc (stabilité, dette, prix de l'énergie, primes de risque, inflation anticipée) sont mesurés par rapport au départ, et les références de calage sont recalculées avec les coefficients courants : modifier un coefficient en cours de partie ne crée pas de saut artificiel (même résultat qu'en le modifiant avant le départ, vérifié sur 30 coefficients).

- _Écartée_ : modèle structurel en niveaux, calé globalement.
- _Raison_ : sans calage, chaque pays dériverait dès le premier mois (les projections du FMI intègrent déjà dette, instabilité ou rente) ; le calage garantit « sans intervention, le monde continue sur sa lancée ».

### D50. Numéraire : le dollar ; prix d'ancrage en dollars constants

Les grandeurs en dollars courants (PIB, prix) suivent l'inflation des États-Unis. Les prix des matières premières reviennent à long terme vers leur prix au jour des données, en termes réels.

- _Raison_ : les données (FMI, Banque mondiale, cours) sont en dollars ; un ancrage nominal ferait baisser les prix réels de 2 à 3 % par an.

### D51. Aléa en nombre fixe par mois (nombres aléatoires communs)

Chaque système tire le même nombre de valeurs chaque mois, quel que soit l'état (un choc par pays, un tirage de défaut par pays, un choc par prix). Deux trajectoires de même graine partagent donc leurs chocs : l'effet d'une modification se lit directement (test « un curseur modifié infléchit la trajectoire »).

### D52. Solde migratoire : moyenne sur dix ans

`demo.net_migration` = moyenne des soldes des dix dernières années (Banque mondiale, en ‰ de la population de chaque année), au lieu de la dernière année.

- _Raison_ : la dernière année reprend des projections ponctuelles (retours de réfugiés estimés par l'ONU en 2025) : l'Allemagne perdait 17 % de sa population en 20 ans. Avec la moyenne, 83,1 millions en 2046 (projection de l'ONU : ≈ 83 millions).

### D53. Taux moyen apparent de la dette : Banque mondiale (le FMI est inaccessible)

`eco.debt_avg_rate` = intérêts versés (% des recettes, WB:GC.XPN.INTP.RV.ZS) × recettes (% du PIB) / dette brute (FMI), même année. L'indicateur d'intérêts du FMI n'a pas pu être téléchargé : l'API DataMapper renvoie 403 (protection Akamai) pour les nouvelles séries depuis le conteneur, le 26/09/2026. Les pays sans donnée reçoivent la médiane régionale (confiance `low`) ; les valeurs de la Banque mondiale gardent leur confiance selon leur ancienneté.

### D54. Natures de paramètres alignées sur le moteur

`eco.potential_growth` devient un état (il converge vers la croissance de long terme), `demo.fertility` un état (il converge vers la fécondité de long terme), `demo.birth_rate` un dérivé (fécondité × poids des âges féconds). Nouveaux paramètres : croissance de long terme, écart de production, taux moyen de la dette, probabilité de défaut, défaut en cours, réserves en mois d'importations, autres dépenses (calage du solde du FMI), ajustement budgétaire, intérêts. Plages élargies aux trajectoires simulées (PIB, réserves, fonds souverains, énergie, budget militaire, aide versée).

- _Raison_ : avec la sémantique des commandes (un levier saisi est conservé, un dérivé saisi est forcé), un levier que le moteur réécrit chaque mois perdrait la saisie de l'utilisateur sans prévenir.

### D55. Crises de balance des paiements : changes administrés, fixes ou dollarisés

Une crise (dévaluation, soutien extérieur, dégradation) se déclenche quand les réserves passent sous 1,5 mois d'importations, seulement pour les régimes qui défendent une parité. Les réserves suivent le PIB nominal (le déficit courant initial est financé par les entrées de capitaux) ; seuls les écarts du solde courant à son niveau initial les font varier.

- _Raison_ : sans ces deux règles, 627 crises en 20 ans, dont les États-Unis (monnaie flottante, réserves faibles par construction).

### D56. Défaut souverain : probabilité par notation, restructuration à 24 mois

Probabilité annuelle de 0,1 % pour BBB, multipliée par e^0,43 à chaque cran perdu (≈ 2 % pour B−, 3 % pour CCC+, 11 % pour C, plafond 30 %), tirée chaque mois ; restructuration au bout de 24 mois avec une décote de 30 %, notation CCC+ et nouveaux coupons (taux moyen ramené au taux de marché). Un pays en défaut au départ (Venezuela, Liban…) paie la prime d'après restructuration. Résultat : 30 à 40 défauts en 20 ans (5 graines), soit 1,5 à 2 par an, l'ordre de grandeur des décennies récentes.

- _Écartée_ : seuil de dette fixe (défauts déterministes, aveugles à la notation et à la monnaie de réserve).

### D57. Règle budgétaire provisoire (Bohn) et fonds souverains

En attendant les décisions des pays (phase 7), le solde primaire se rapproche du solde qui stabilise la dette plus une réaction à la hausse de la dette (Bohn, 1998) ; ajustement borné à ±20 points de PIB ; austérité en défaut. Un déficit est d'abord couvert par le fonds souverain au prorata de sa taille (Norvège, pays du Golfe).

- _Raison_ : sans règle, la dette dérivait vers 400 % du PIB pour l'Irak, la Libye, le Timor-Oriental ou Bahreïn, dont le budget dépend des rentes.

### D58. Worker : boucle par tranches, images à 5 Hz, tableaux transférés

La boucle du worker avance par tranches de 20 ms (50 ms pour « avancer jusqu'à ») et publie une image à 5 Hz au plus, et aussitôt après chaque commande. Les images sont postées directement (`postMessage` avec transfert des tableaux) à côté des appels RPC de Comlink ; l'interface garde un miroir de l'état qu'elle lit de façon synchrone. Les paramètres bilatéraux ne sont renvoyés que lorsqu'ils changent ; les valeurs non numériques, par différences.

- _Écartées_ : rappels Comlink (un canal de plus, sans gain) ; requêtes de l'interface à chaque rendu (latence et complexité).

### D59. Vitesses : 1, 7, 30 et 90 jours par seconde

« 1 mois/s » = 30 jours, « 3 mois/s » = 90 jours (plage de `sim.speed`, 0–90). Le pas-à-pas « mois » avance jusqu'au premier jour du mois suivant, c'est-à-dire exactement un pas mensuel des systèmes.

### D60. `config/model.yaml` : rechargement à chaud journalisé, enregistrement ciblé

Le serveur surveille le fichier et prévient l'interface (événement HMR `geosim:model`) ; l'interface relit l'arbre et l'applique par une commande `setModel` journalisée (la relecture reste exacte), ignorée si rien ne change ; un fichier invalide est signalé et le modèle en cours conservé. L'onglet Modèle modifie les coefficients en direct (`setCoefficient`, annulable) ; « Enregistrer » édite le document YAML en place (commentaires, ordre, guillemets conservés) puis applique Prettier : seules les lignes `value:` concernées changent.

- _Écartée_ : réécrire le fichier depuis l'arbre (commentaires et mise en forme perdus).

### D61. Captures : en mémoire et dans `captures/` (hors git)

Une capture (état complet, journal, historique) se garde en mémoire dans le worker, ou s'enregistre dans `captures/<nom>.json` par l'API locale (noms filtrés, écriture atomique). Les requêtes d'écriture de l'API exigent un en-tête propre à l'interface et, si le navigateur l'indique, une origine locale : une page d'un autre site ne peut pas écrire sur le disque. La relecture d'une capture chargée depuis un fichier n'est pas vérifiable (état initial inconnu). Le format de scénario versionné viendra en phase 8.

### D62. Graphiques : uPlot

Séries temporelles avec uPlot (licence MIT, ≈ 50 ko) : rapide sur de longues séries, légende au survol, zoom. Mini-graphes de l'inspecteur en SVG, sans dépendance.

- _Écartées_ : Chart.js et ECharts (plus lourds), graphiques faits main (zoom et légende à réécrire).

### D63. Couches de la carte en direct, échelles calées sur le départ

Les couches « indicateurs », « relations », « blocs » et « sanctions » lisent les valeurs simulées. L'échelle de couleur d'un indicateur est calée sur les valeurs de départ (2ᵉ et 98ᵉ centiles) : une évolution simulée se voit comme un changement de couleur, au lieu d'être absorbée par une échelle recalculée à chaque image.

### D64. Édition : une commande par geste

Un curseur envoie sa commande au relâchement (et un champ à la validation) : un geste = une entrée du journal = une annulation. L'édition groupée envoie une seule commande pour tous les pays visés (bloc, région, tous).

### D65. Valeurs au départ gardées par le moteur

Le moteur conserve les valeurs après calage (tick 0), incluses dans les captures. L'interface distingue ainsi une valeur **simulée** (qui a bougé depuis le départ) d'une valeur **calculée** dès le départ par le moteur (budget de défense = PIB × part de la défense, différent du chiffre du SIPRI), et d'une valeur **modifiée** par l'utilisateur.
