# Calibration

Résultats des tests de plausibilité et de sensibilité (SPEC §11), produits en Monte Carlo à partir de la phase 8. Des vérifications partielles sont consignées dès la phase 3.

## Critères de plausibilité (sans intervention, sur dix ans)

| Critère                                                                                                             | Référence                          | Résultat                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Croissance mondiale proche des projections du FMI                                                                   | FMI, WEO d'avril 2026 (`WEOWORLD`) | Phase 3 : proche les trois premières années, puis en dessous (voir ci-dessous) |
| Pas de divergence du PIB, de la dette ou de l'inflation hors des pays déjà en crise                                 | —                                  | Phase 3 : respecté sur 5 × 20 ans                                              |
| Nouvelles guerres interétatiques et changements de régime du même ordre de grandeur que lors des décennies récentes | UCDP                               | Phases 4 à 7                                                                   |
| Frontières quasi stables hors conflits déjà en cours                                                                | —                                  | Phase 5                                                                        |
| Emploi nucléaire rarissime                                                                                          | —                                  | Phase 6                                                                        |

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

## Sensibilité (±50 % sur chaque coefficient majeur)

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

## Rétro-test (optionnel)

Initialisation vers 2014–2015, comparaison aux données 2024–2025.
