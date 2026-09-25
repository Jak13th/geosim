# Sources des données curées

Chaque valeur curée (`data/curated/*.yaml`, `*.geojson`) porte `value`, `source`, `date` et `confidence` (`high` | `medium` | `low` | `assumption`). Ce fichier liste toutes les sources consultées, avec leur date de consultation.

Les sources automatisées (téléchargements du pipeline) sont tracées dans `data/manifest.json`.

## Situation au 25/09/2026 (consultée lors de la préparation, à exploiter en phase 1b)

Ces sources ont servi à vérifier l'état du monde avant de commencer. Elles ne remplacent pas la recherche datée, fichier par fichier, prévue en phase 1b.

| Sujet                                                   | Source                                                                                                                                                                          | Consultée le |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Guerre Russie–Ukraine, ligne de front                   | [ACLED — Ukraine war situation update, 29 août – 4 sept. 2026](https://acleddata.com/update/ukraine-war-situation-update-29-august-4-september-2026)                            | 2026-09-25   |
| Guerre Russie–Ukraine, ligne de front                   | [ISW / Critical Threats — Russian Offensive Campaign Assessment, 6 sept. 2026](https://www.criticalthreats.org/analysis/russian-offensive-campaign-assessment-september-6-2026) | 2026-09-25   |
| Guerre Russie–Ukraine, bilan                            | [Russia Matters — War Report Card, 23 sept. 2026](https://www.russiamatters.org/news/russia-ukraine-war-report-card/russia-ukraine-war-report-card-sept-23-2026)                | 2026-09-25   |
| Prix du Brent (106,39 $/baril le 24/09/2026)            | [Trading Economics — Brent](https://tradingeconomics.com/commodity/brent-crude-oil)                                                                                             | 2026-09-25   |
| Crise d'Ormuz (guerre Iran–États-Unis 2026)             | [Wikipedia — 2026 Strait of Hormuz crisis](https://en.wikipedia.org/wiki/2026_Strait_of_Hormuz_crisis)                                                                          | 2026-09-25   |
| Attaque de l'oléoduc saoudien Est-Ouest (10-11/09/2026) | [Wikipedia — 2026 East–West Crude Oil Pipeline attack](https://en.wikipedia.org/wiki/2026_East%E2%80%93West_Crude_Oil_Pipeline_attack)                                          | 2026-09-25   |
| Navire frappé dans le détroit d'Ormuz (13/09/2026)      | [CNBC, 13 sept. 2026](https://www.cnbc.com/2026/09/13/vessel-struck-strait-of-hormuz-ukmto.html)                                                                                | 2026-09-25   |
| Échanges de frappes États-Unis–Iran dans le détroit     | [USNI News, 4 sept. 2026](https://news.usni.org/2026/09/04/u-s-iran-trade-strikes-in-strait-of-hormuz-as-both-battle-on-social-media)                                           | 2026-09-25   |

## Phase 1a — géographie (consultées le 25/09/2026)

### `ne_units.yaml` : rattachement des unités Natural Earth et capitales

| Sujet                                                                                              | Source                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entités à reconnaissance limitée (Taïwan, Kosovo, Chypre du Nord, Somaliland, RASD) et Palestine   | [Wikipedia — List of states with limited recognition](https://en.wikipedia.org/wiki/List_of_states_with_limited_recognition)                                                                                                                                                  |
| Code du Kosovo (`XKX`)                                                                             | [Banque mondiale — Country and lending groups](https://datahelpdesk.worldbank.org/knowledgebase/articles/906519-world-bank-country-and-lending-groups)                                                                                                                        |
| Chagos : traité du 22/05/2025 signé, non entré en vigueur                                          | [Wikipedia — Chagos Archipelago sovereignty dispute](https://en.wikipedia.org/wiki/Chagos_Archipelago_sovereignty_dispute) ; [Chatham House, janvier 2026](https://www.chathamhouse.org/2026/01/uk-ratification-chagos-archipelago-treaty-will-not-violate-international-law) |
| Glacier de Siachen, île Brésilienne, champ de glace de Patagonie, Bir Tawil, zone tampon de Chypre | Articles Wikipedia correspondants (liens dans `ne_units.yaml`)                                                                                                                                                                                                                |
| Capitales (Pretoria, La Paz, Abidjan, Ramallah, North Nicosia, Tifariti, Yaren)                    | Articles Wikipedia correspondants (liens dans `ne_units.yaml`)                                                                                                                                                                                                                |
| Bases louées (Guantánamo, Baïkonour), Spratleys et récifs disputés                                 | Notes de Natural Earth 5.1.1 (champ `NOTE_BRK`)                                                                                                                                                                                                                               |

### `chokepoints.yaml` : géométrie des détroits et passages

Portes et chenaux tracés pour GeoSim sur le trait de côte Natural Earth 10m, à l'aide des articles Wikipedia de chaque passage (liens dans le fichier). Leur cohérence (extrémités à terre, franchissement du passage) est vérifiée à chaque construction de la carte ; les longueurs des routes de test figurent dans `data/build/map/report-<résolution>.md`.
