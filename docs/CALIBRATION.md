# Calibration

Résultats des tests de plausibilité et de sensibilité (SPEC §11), produits en Monte Carlo à partir de la phase 8. Des vérifications partielles sont consignées dès la phase 3.

## Critères de plausibilité (sans intervention, sur dix ans)

| Critère                                                                                                             | Référence                          | Résultat                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Croissance mondiale proche des projections du FMI                                                                   | FMI, WEO d'avril 2026 (`WEOWORLD`) | Phase 3 : proche les trois premières années, puis en dessous (voir ci-dessous)              |
| Pas de divergence du PIB, de la dette ou de l'inflation hors des pays déjà en crise                                 | —                                  | Phases 3 et 4 : respecté sur 5 × 20 ans                                                     |
| Nouvelles guerres interétatiques et changements de régime du même ordre de grandeur que lors des décennies récentes | UCDP, Powell et Thyne              | Phase 4 : coups d'État du même ordre (2,0 par an contre 1,5 à 2,2) ; guerres : phases 5 à 7 |
| Frontières quasi stables hors conflits déjà en cours                                                                | —                                  | Phase 5                                                                                     |
| Emploi nucléaire rarissime                                                                                          | —                                  | Phase 6                                                                                     |

Réserve : le scénario « Monde au 26/09/2026 » démarre en pleine crise pétrolière (guerre Iran–États-Unis, détroit d'Ormuz ; Brent à 104 $). Les critères seront évalués sur ce scénario et sur le « Bac à sable » (monde en paix).

## Phase 3 : premières vérifications (2026-09-26)

Commande : `npm run sim -- --years 20 --runs 5 --seed 1 --out results/phase3` (moteur 0.3.0, coefficients par défaut de `config/model.yaml`, données du 26/09/2026). Environ 2 s par run de 20 ans.

### Stabilité

- 5 runs de 20 ans : aucune violation d'invariant (pas de NaN ni d'infini, bornes du catalogue, populations positives, parts d'âge, prix positifs) ; même graine ⇒ même empreinte.
- Événements : 30 à 40 défauts souverains par run de 20 ans (1,5 à 2 par an, restructurations comprises), 1 ou 2 crises de balance des paiements. Ordre de grandeur à confronter en phase 8 à la base de défauts souverains de la Banque du Canada et de la Banque d'Angleterre.

### Croissance mondiale (moyenne des 5 runs, pondérée par le PIB en PPA)

| Année simulée | 1   | 2   | 3   | 4   | 5   | 6–10    | 11–20   |
| ------------- | --- | --- | --- | --- | --- | ------- | ------- |
| Simulé (%)    | 3,2 | 3,1 | 2,9 | 2,6 | 2,7 | 2,2–2,4 | 1,9–2,3 |
| FMI (%)       | 3,2 | 3,2 | 3,2 | 3,1 | 3,1 | —       | —       |

Le FMI (WEO d'avril 2026, cache `data/raw/imf_ngdp_rpch.json`) prévoit 3,2 % de 2027 à 2029 puis 3,1 % en 2030–2031. La croissance simulée décroche au-delà de trois ans : la croissance potentielle converge vers la croissance de long terme (§5.1 de MODELES), plus basse que les projections du FMI pour les grands émergents.

Croissance de 2031 par pays (moyenne des 5 runs) et projection du FMI pour 2031 :

| Pays        | FMI | Simulé | Pays      | FMI | Simulé |
| ----------- | --- | ------ | --------- | --- | ------ |
| États-Unis  | 1,8 | 1,7    | Brésil    | 2,5 | 2,0    |
| Chine       | 3,3 | 2,7    | Russie    | 1,0 | 1,5    |
| Inde        | 6,5 | 5,8    | Nigeria   | 4,2 | 2,9    |
| Allemagne   | 0,6 | 1,2    | Turquie   | 4,0 | 2,3    |
| Japon       | 0,6 | 0,6    | Égypte    | 4,8 | 5,5    |
| France      | 1,1 | −0,1   | Argentine | 3,0 | 2,5    |
| Royaume-Uni | 1,4 | 1,6    | Arabie s. | 3,6 | 2,2    |

Cinq runs ne suffisent pas pour une année isolée : l'écart de production y pèse autant que la tendance (France : cycle défavorable autour de 2031 dans ces graines).

Volatilité du glissement annuel (5 runs × 20 ans, écart type en points) : États-Unis 2,0 ; France 1,8 ; Allemagne 1,5 ; Japon 1,1 ; Chine 1,6 ; Inde 2,0 ; Brésil 1,8 ; Nigeria 3,0. Ordres de grandeur comparables aux écarts types historiques hors 2020, un peu forts pour les États-Unis et faibles pour l'Allemagne et le Japon (le facteur d'instabilité suit la stabilité politique des WGI, pas la diversification de l'économie).

### Pays clés au bout de 20 ans (moyenne des 5 runs, septembre 2046)

| Pays       | Croissance | Inflation | Chômage | Dette (% PIB) | Population (M) |
| ---------- | ---------- | --------- | ------- | ------------- | -------------- |
| États-Unis | 2,3        | 2,6       | 4,2     | 129           | 374            |
| Chine      | 0,9        | 1,7       | 5,3     | 124           | 1 314          |
| Inde       | 3,5        | 4,5       | 4,6     | 84            | 1 656          |
| Allemagne  | 1,4        | 2,2       | 3,8     | 69            | 83,1           |
| Japon      | 0,3        | 2,1       | 2,6     | 193           | 108            |
| France     | 0,7        | 1,8       | 8,1     | 124           | 70,3           |
| Brésil     | 0,9        | 3,4       | 7,2     | 110           | 220            |
| Russie     | 0,4        | 4,5       | 2,7     | 26            | 135            |
| Nigeria    | 3,9        | 10,9      | 23,0    | 17            | 342            |
| Turquie    | 2,0        | 16,6      | 8,2     | 9             | 92             |
| Argentine  | 0,6        | 13,9      | 7,3     | 24            | 47,6           |

Écarts connus :

- **Croissance de long terme** trop basse pour la Chine (≈ 1–2 % en 2046) et plusieurs émergents : leviers `economy.potential.frontier_growth`, `convergence_rate`, `adjustment_years` (voir sensibilité).
- **Nigeria** : chômage de 22,6 % au départ (FMI, série de 2018 à l'ancienne méthode), conservé par le modèle : donnée à revoir.
- **Argentine** : taux apparent très bas au départ (1,7 %, dette restructurée en dollars) ; la désinflation fait baisser l'inflation anticipée, et le taux de marché touche le plancher (−1 %). La transmission de l'inflation au taux ne distingue pas encore dette en devises et en monnaie locale.
- **Turquie** : la forte inflation érode la dette (9 % du PIB en 2046).
- **Populations** : à comparer précisément aux projections de l'ONU (WPP 2024) en phase 8.

## Phase 4 : monde interconnecté (2026-09-26)

Commande : `npm run sim -- --years 20 --runs 5 --seed 1 --out results/phase4` (moteur 0.4.0, coefficients par défaut de `config/model.yaml`, données du 26/09/2026). Environ 16 s par run de 20 ans (commerce bilatéral N × N, affinités, réfugiés ; DECISIONS D84).

### Référence sans intervention

- 5 runs de 20 ans : aucune violation d'invariant, y compris ceux de la phase 4 (échanges bilatéraux positifs et finis, trafic des détroits dans [0, 100], flux d'énergie positifs, états internes finis) ; même graine ⇒ même empreinte ; une capture restaurée continue à l'identique (D83).
- Les systèmes de la phase 4 mesurent des écarts à la situation de départ (D49, D66) : sans intervention, ils ne déplacent presque pas la trajectoire de la phase 3.

| Année simulée | 1   | 2   | 3   | 4   | 5   | 6–10    | 11–20   |
| ------------- | --- | --- | --- | --- | --- | ------- | ------- |
| Phase 4 (%)   | 3,2 | 3,1 | 2,9 | 2,6 | 2,6 | 2,1–2,3 | 1,8–2,2 |
| Phase 3 (%)   | 3,2 | 3,1 | 2,9 | 2,6 | 2,7 | 2,2–2,4 | 1,9–2,3 |

- Pays clés en 2046 : croissance, inflation et chômage à 0,3 point près des valeurs de la phase 3, dette à 6 points près (États-Unis 135 % du PIB contre 129 %).
- Stabilité politique : −1,0 à −1,2 point en moyenne sur 20 ans (médiane −0,3 ; extrêmes −16 et +13) ; insurrection +0,4 point en moyenne ; 4,3 à 6,4 millions de nouveaux réfugiés ; aucune guerre civile.

### Changements de régime et événements (par run de 20 ans)

| Événement                                       | 5 runs            | Par an     | Référence                                                                           |
| ----------------------------------------------- | ----------------- | ---------- | ----------------------------------------------------------------------------------- |
| Coups d'État réussis                            | 32–54             | 2,0        | 1,5 par an de 2006 à 2025, 2,2 de 2020 à 2025 (Powell et Thyne, version 29/08/2026) |
| Transitions de juntes vers un régime civil      | 14–27             | 1,0        | durée moyenne d'environ 9 ans des régimes militaires (Geddes, 1999)                 |
| Révolutions                                     | 6–9               | 0,4        | —                                                                                   |
| Successions non planifiées                      | 60–69             | 3,2        | à confronter aux sorties de dirigeants (Archigos) en phase 8                        |
| Élections : alternances, reconductions          | 128–134, 260–276  | 6,5 ; 13,6 | alternance dans un tiers des élections                                              |
| Défauts souverains                              | 29–41             | 1,75       | phase 3 : 30 à 40                                                                   |
| Crises de balance des paiements                 | 20–21             | 1          | —                                                                                   |
| Manifestations, crises politiques, soulèvements | 16–23, 3–9, 10–22 | —          | —                                                                                   |
| Crises des réfugiés                             | 3–9               | —          | —                                                                                   |

- Sources : base des coups d'État de Powell et Thyne ([jonathanmpowell.com/coups](https://jonathanmpowell.com/coups/), fichier du 29/08/2026, consulté le 26/09/2026 : coups réussis comptés par année) ; B. Geddes, « What Do We Know about Democratization after Twenty Years? », _Annual Review of Political Science_, 1999.
- Juntes : 7 États au départ (Birmanie, Burkina Faso, Guinée-Bissau, Madagascar, Mali, Niger, Soudan), 7 à 11 au bout de 20 ans.
- Répartition des coups : un tiers dans ces juntes (contre-coups), le reste surtout dans des États fragiles (RD Congo, Pakistan, Centrafrique, Éthiopie, Afghanistan, Yémen, Syrie).
- Avant la recalibration (D86) : 2,6 coups par an, dont certains dans des pays riches (Canada, Liechtenstein, Saint-Marin, Chine, Turquie), et 24 à 38 juntes au bout de 20 ans.
- Après le reset des relations étendu aux coups et successions (D89) et la curation de l'historique des coups et de la loyauté de l'armée (D90) : toujours 2,0 à 2,5 coups par an (41 à 50 sur 20 ans, 3 graines) et une dérive de la stabilité moyenne de 1,1 à 1,2 point sur 20 ans, cohérente avec la référence ci-dessus — les garde-fous de D76 tiennent (D91).

### Coefficients calés en phase 4

- `markets.oil.price_elasticity` = 0,31 : le Brent de départ (104 $, Ormuz réduit à ≈ 15 % de son trafic) s'explique par l'offre bloquée ; détroits rouverts, le prix structurel revient à 72,5 $, le Brent d'avant la guerre (D68).
- Politique intérieure : usure du pouvoir saturante (8 points, 3 ans), seuil de fragilité de l'insurrection (30) et sensibilité de base (0,5), ancres de la légitimité et de l'approbation au départ (D76). Sans ces garde-fous, 25 petites économies divergeaient sur 20 ans (cascades instabilité–insurrection–réfugiés).
- Réfugiés : déplacement 0,15 et zone morte 0,1 de pression de départ (D74), effet de masse des pays d'accueil (élasticité 1).
- Énergie : flux établis en 3 mois, nouvelle normale en 24 mois (D77) ; facture du blé : 0,1 t par habitant (D80, au lieu d'un déficit de −50 points de PIB au Yémen).
- Coups d'État : facteur de revenu (seuil 5 000 $, élasticité 1) et transition des juntes (11 %/an) (D86).
- Sanctions : `economy.sanctions.financial_shock` = 3 et `economy.sanctions.spread` = 3 confrontés à l'épisode russe de 2022 (D87) — à l'intensité du paquet occidental (finance 0,75, technologie 0,65, énergie épargnée), l'écart de production simulé se stabilise entre −1,1 et −1,7 point sur l'année, proche du repère réel (Rosstat : −2,1 % ; FMI, estimation ultérieure : −1,2 %), loin des prévisions initiales de −8,5 % (FMI, avril 2022) à −10,4 % (Commission européenne, printemps 2022). Aucun ajustement des coefficients n'a été nécessaire (test `packages/engine/src/systems/world.test.ts`, describe `sanctions`).

### Scénarios d'acceptation (graine 1, écart maximal à la référence de même graine)

`npm run sim -- --scenario <nom> --seed 1 --out <dossier>` ; rapport complet dans `<dossier>/run/report.md`.

| Scénario                                                                                                             | Résultats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `ormuz-avant-guerre` : Ormuz fermé trois mois, à partir d'un détroit rouvert (avec la prime d'anticipation, D88) | Brent +22,45 $ (81,12 → 103,57 $, pic début avril 2028) puis retour — proche du repère réel de D68 (72,5 → 104 $). PIB : Arabie saoudite −182 Md$ (−11 %), Qatar −124 Md$ (−35 %), rattrapés à la réouverture. Écart de production : Inde −2,7, Pakistan −2,1, Corée −0,5, Japon −0,3 point. Inflation : +0,2 (Europe) à +2,1 points (Qatar). Stocks stratégiques : Japon −20 jours, Corée −28, Inde et Pakistan vidés ; pénuries d'énergie : Inde 4,8 %, Pakistan 3,5 % de la consommation. Norvège : solde courant +2,4 points. Stabilité du Qatar −7,4. |
| (a′) `ormuz` : même fermeture à partir de la situation actuelle                                                      | Brent +1,8 $, Qatar −19 Md$, Arabie saoudite −29 Md$ : l'essentiel du choc est déjà dans l'état de départ.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| (b) `sanctions-chine` : sanctions larges du G7, de l'UE et de leurs alliés                                           | Chine : écart de production −3,9 points (janvier 2027), PIB −929 Md$ au pic (−4,3 %) et −345 Md$ trois ans après, exportations −5,2 points de PIB, stabilité −2. Coût pour les émetteurs (écart de production) : Corée −1,4, Australie −0,7, Japon −0,55, Allemagne −0,44, États-Unis −0,13. Croissance mondiale −1,0 point au pic. Relations de la Chine : −14 (États-Unis) à −33 (Allemagne, Australie, Royaume-Uni), inchangées avec la Russie, l'Inde et le Brésil.                                                                                    |
| (c) `ble-x2` : prix du blé doublé pendant un an                                                                      | Tension alimentaire : +24 (Égypte), +36 (Liban), +49 points (Yémen). Inflation : +5,5 points chez les importateurs pauvres, +1,75 chez les riches. Stabilité : Égypte −5,9, Liban −8,8, Algérie −5,4. Yémen : écart de production −8, solde courant −14,5 points, 319 000 réfugiés de plus. 15 famines expliquées (Afghanistan, Comores, Gambie, Liberia, Mozambique, Yémen…), 13 vagues de manifestations, 5 soulèvements.                                                                                                                                |
| (d) `election-usa` : élection de 2028 perdue par le gouvernement sortant                                             | Alternance le 07/11/2028 (référence : reconduction). Profil : loyauté envers les alliés 45 → 75, révisionnisme 45 → 15, agressivité 60 → 30, imprévisibilité 60 → 20. Relations des États-Unis : Canada +21, Danemark +18, France +14, Allemagne +13, Royaume-Uni +10 ; Ukraine −5,7 (voir écarts connus).                                                                                                                                                                                                                                                 |

### Écarts connus (phase 4)

- **Prime d'anticipation du pétrole** (D88) : corrigée avant la phase 5 — le prix bondit désormais dès l'annonce d'un changement de statut d'un détroit (`markets.oil.anticipation_strength`, demi-vie `anticipation_half_life_months`), plutôt qu'au seul rythme de l'ajustement structurel (3 mois). Périmètre limité aux détroits (pas encore aux déclarations de guerre ni aux sanctions énergétiques annoncées à l'avance) : à élargir si la phase 5 en montre le besoin.
- **Effet de base** : la croissance en glissement annuel du Qatar affiche +47 points un an après la réouverture (rattrapage du niveau de PIB).
- **États-Unis → Ukraine après l'alternance** : −5,7, car l'alternance efface la moitié du résidu de calage (positif) et l'affinité compte l'aide pour son seul destinataire.
- **Coups d'État** : le cas de l'Inde (1,2 %/an sans tradition de coup) est corrigé en D90 (historique des coups et loyauté de l'armée curés : risque ramené à 0,56 %/an) ; couverture encore partielle (46 pays sur l'historique, 9 sur la loyauté de l'armée) — à étendre avec un accès direct à V-Dem.
- **Successions non planifiées** : 3,2 par an, surtout dans les juntes (hypothèse par défaut de `pol.succession_risk` : 8 %/an).
- **Tension alimentaire des exportateurs** : +3,8 points quand le blé double (prix à la consommation), le gain de revenu passant par le solde courant et l'activité.

## Sensibilité (±50 % sur chaque coefficient majeur)

### Phase 3

Premier passage (phase 3) : 30 coefficients × 2 variantes (×0,5 et ×1,5, bornées à la plage du coefficient), 10 ans, graine 1. Chaque variante a été lancée deux fois : coefficient modifié avant le départ, puis par commande au premier jour ; les résultats sont identiques (test `engine.test.ts`).

- **Aucune** variante ne produit de NaN ni de violation d'invariant.
- **Une dérive** : `economy.rates.spread_per_notch` ×1,5 (primes de 36 points pour CCC+, 90 pour C) : la dette de l'Ukraine atteint le plafond du catalogue (400 % du PIB) en cinq ans, avant tout défaut. Un pays en guerre avec 19 % de déficit ne se finance pas sur les marchés : il manque le relais des prêteurs officiels (aide extérieure en phase 4, perte d'accès aux marchés en phase 8).
- Coefficients les plus influents :

| Coefficient                             | ×0,5 | Référence | ×1,5        | Grandeur                            |
| --------------------------------------- | ---- | --------- | ----------- | ----------------------------------- |
| `economy.potential.frontier_growth`     | 1,79 | 2,25      | 2,71        | croissance mondiale, 10ᵉ année (%)  |
| `economy.potential.convergence_rate`    | 1,99 | 2,25      | 2,51        | idem                                |
| `economy.potential.adjustment_years`    | 1,94 | 2,25      | 2,47        | idem                                |
| `economy.cycle.persistence`             | 2,23 | 2,25      | 1,96 (0,99) | idem                                |
| `economy.default.probability_per_notch` | 3    | 18        | 62          | défauts souverains en 10 ans        |
| `economy.default.probability_bbb`       | 8    | 18        | 25          | idem                                |
| `economy.inflation.anchor_central_bank` | 12,6 | 10,6      | 9,2         | inflation, 95ᵉ centile des pays (%) |
| `markets.oil.investment_response`       | 111  | 118       | 121         | Brent en 2036 ($)                   |

Les autres coefficients testés (bruit et facteur d'instabilité du cycle, contagion commerciale, chocs énergétiques, frein de la dette et de l'instabilité, pression de la demande, monétisation, transmission de l'énergie, Okun, prime AAA, règle budgétaire, notation, seuil de crise des réserves, élasticités et volatilité des prix, pouvoir calorifique, fécondité et mortalité de long terme) déplacent ces grandeurs de moins de 0,05 point de croissance mondiale, de 2 défauts et de 1 point d'inflation médiane sur dix ans.

### Phase 4

Même méthode (×0,5 et ×1,5, bornés à la plage, coefficient modifié par commande au premier jour, graine 1) sur 31 coefficients de la phase 4 : 10 ans de référence sans intervention, puis les scénarios d'acceptation pour les coefficients qui n'agissent que sur des chocs.

- **Aucune** des 62 variantes de la référence ne produit de NaN ni de violation d'invariant.
- Coefficients les plus influents sur la référence (10 ans) :

| Coefficient                              | ×0,5 | Référence | ×1,5 | Grandeur                                              |
| ---------------------------------------- | ---- | --------- | ---- | ----------------------------------------------------- |
| `markets.oil.price_elasticity`           | 56   | 88        | 104  | Brent en 2036 ($ courants)                            |
| `politics.coups.base_hybrid`             | 18   | 23        | 29   | coups d'État en 10 ans                                |
| `politics.coups.stability_slope`         | 19   | 23        | 29   | idem                                                  |
| `politics.coups.income_reference`        | 21   | 23        | 25   | idem                                                  |
| `politics.coups.junta_transition_rate`   | 8    | 12        | 14   | transitions de juntes en 10 ans                       |
| `politics.elections.slope`               | 62   | 68        | 77   | alternances en 10 ans                                 |
| `demography.refugees.pressure_threshold` | 7,2  | 4,0       | 1,8  | nouveaux réfugiés en 10 ans (millions)                |
| `demography.refugees.displacement`       | 2,0  | 4,0       | 6,0  | idem                                                  |
| `politics.insurgency.base_sensitivity`   | 2,8  | 4,0       | 5,5  | idem (×1,5 : une guerre civile, 4 crises de réfugiés) |

- Les coefficients du commerce, des sanctions, des pénuries et de l'alimentation sont **sans effet sur la référence** : sans choc, aucun écart à la situation de départ ne se propage (D49, D66). Leur sensibilité se lit sur les scénarios (écart maximal à la référence de même graine) :

| Scénario | Coefficient                            | ×0,5                  | Référence    | ×1,5             | Grandeur                                         |
| -------- | -------------------------------------- | --------------------- | ------------ | ---------------- | ------------------------------------------------ |
| (a)      | `markets.shortage.replacement_months`  | −0,5 ; pas de pénurie | −2,7 ; 4,8 % | −3,5 ; 6,6 %     | écart de production et pénurie de l'Inde         |
| (a)      | `markets.shortage.gdp_elasticity`      | −1,5                  | −2,7         | −3,9             | écart de production de l'Inde                    |
| (a)      | `markets.shortage.stock_release_share` | −3,4                  | −0,3         | (borné à 1)      | écart de production du Japon                     |
| (a)      | `markets.oil.price_elasticity`         | +20,8                 | +14,3        | +10,5            | Brent ($)                                        |
| (a)      | `economy.growth.hydrocarbon_volume`    | −21 %                 | −35 %        | −46 %            | PIB du Qatar                                     |
| (a)      | `trade.chokepoints.recovery_months`    | +13,0                 | +14,3        | +15,6            | Brent ($)                                        |
| (b)      | `trade.effects.export_demand`          | −2,8                  | −3,9         | −5,1             | écart de production de la Chine                  |
| (b)      | `economy.sanctions.financial_shock`    | −3,3                  | −3,9         | −4,5             | idem                                             |
| (b)      | `trade.frictions.sanction_block_max`   | −3,2 ; −3,5           | −3,9 ; −5,2  | (≈ 1 : inchangé) | idem ; exportations (points de PIB)              |
| (b)      | `trade.effects.acr_elasticity`         | −4,8 %                | −4,3 %       | −4,2 %           | PIB de la Chine                                  |
| (c)      | `politics.stability.food`              | −3,2 ; 9              | −5,9 ; 13    | −8,6 ; 22        | stabilité de l'Égypte ; vagues de manifestations |
| (c)      | `markets.food.stress_base_weight`      | +20,9 ; 12            | +24,2 ; 15   | +27,6 ; 31       | tension alimentaire de l'Égypte ; famines        |
| (c)      | `demography.famine.stress_threshold`   | 34                    | 15           | 7                | famines                                          |
| (c)      | `economy.inflation.food_passthrough`   | +2,8                  | +5,5         | +8,3             | inflation de l'Égypte (points)                   |

- Sans effet notable sur ces grandeurs : `markets.oil.spare_response_months` (la capacité inutilisée ne se mobilise que si la demande dépasse l'offre de départ, qui intègre déjà la crise d'Ormuz : le Brent reste sous 104 $ dans le scénario (a)), `diplomacy.sanctions.evasion_months`, `economy.sanctions.tech_drag` (effet lent, au-delà de trois ans), `trade.redirection.importer_replace` (l'importateur, pas la Chine), `diplomacy.relations.sanction_target_shock` (relations seulement).
- À caler en priorité (phase 8) : le délai de remplacement des importations d'énergie et le partage des stocks stratégiques, qui décident de l'ampleur des pénuries ; la demande extérieure des sanctions (`trade.effects.export_demand`) ; la sensibilité de la stabilité aux prix alimentaires et le seuil de famine. Le choc financier des sanctions (`economy.sanctions.financial_shock`) a été confronté à l'épisode russe de 2022 (voir plus haut, D87) et n'a pas eu besoin d'ajustement.

## Rétro-test (optionnel)

Initialisation vers 2014–2015, comparaison aux données 2024–2025.
