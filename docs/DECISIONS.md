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
