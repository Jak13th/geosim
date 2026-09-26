# Sources des données curées

Chaque valeur curée (`data/curated/*.yaml`, `*.geojson`) porte `value`, `source`, `date` et `confidence` (`high` | `medium` | `low` | `assumption`). Ce fichier liste toutes les sources consultées, avec leur date de consultation.

Les sources automatisées (téléchargements du pipeline) sont tracées dans `data/manifest.json`.

## Situation au 25/09/2026 (consultée lors de la préparation)

Ces sources ont servi à vérifier l'état du monde avant de commencer ; la recherche datée, fichier par fichier, est listée plus bas (phase 1b).

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

## Phase 1b — données pays et fichiers curés (consultées le 25/09/2026)

### Sources automatisées

Téléchargées par `npm run data`, mises en cache et tracées (URL, date, empreinte) dans `data/manifest.json` : Banque mondiale (WDI, WGI, HCI), FMI (World Economic Outlook, DataMapper), Our World in Data (énergie, dépenses militaires, V-Dem, etc.), FAOSTAT (bilans alimentaires, engrais), HCR (réfugiés par pays d'asile et d'origine), CEPII BACI HS22 (commerce bilatéral), votes à l'Assemblée générale des Nations unies (Bailey, Strezhnev et Voeten, Harvard Dataverse), PNUD (Rapport sur le développement humain 2025), Natural Earth (subdivisions de premier niveau, zones disputées). Les séries utilisées pour chaque paramètre figurent dans `data/build/report.md`.

### Rapports lus (PDF et tableaux)

- SIPRI Yearbook 2026, chapitre « World nuclear forces » (janvier 2026) : `nuclear.yaml`.
- USGS Mineral Commodity Summaries 2026 ; World Nuclear Association (production d'uranium 2024) : `minerals.yaml`.
- USDA WASDE, septembre 2026 : `food.yaml`.
- IISS, The Military Balance 2026 (effectifs) : `country_military.yaml`, `military_capabilities.yaml`.
- S&P Global Ratings (notations souveraines) ; FMI AREAER 2024 ; FMI COFER (part du dollar) : `country_economy.yaml`, `world.yaml`.
- Reporters sans frontières, Classement mondial de la liberté de la presse 2026 : `country_politics.yaml`.
- Alesina et al. (2003), « Fractionalization » : `country_society.yaml`.

### Sources citées par fichier

Chaque entrée des fichiers ci-dessous cite sa ou ses sources (champ `source`) ; liste consolidée, toutes consultées le 25/09/2026.

#### `bases.yaml` — Bases militaires à l'étranger (pays hôte, utilisateur, effectifs)

- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — 45th Armoured Brigade (Bundeswehr](https://en.wikipedia.org/wiki/45th_Armoured_Brigade_(Bundeswehr)
- [en.wikipedia.org — Agaléga](https://en.wikipedia.org/wiki/Agal%C3%A9ga)
- [en.wikipedia.org — Berbera Airport](https://en.wikipedia.org/wiki/Berbera_Airport)
- [en.wikipedia.org — British Forces Overseas](https://en.wikipedia.org/wiki/British_Forces_Overseas)
- [en.wikipedia.org — Burundi–Democratic Republic of the Congo relations](https://en.wikipedia.org/wiki/Burundi%E2%80%93Democratic_Republic_of_the_Congo_relations)
- [en.wikipedia.org — China–Tajikistan relations](https://en.wikipedia.org/wiki/China%E2%80%93Tajikistan_relations)
- [en.wikipedia.org — French Armed Forces](https://en.wikipedia.org/wiki/French_Armed_Forces#Overseas_deployments)
- [en.wikipedia.org — Indian Military Training Team](https://en.wikipedia.org/wiki/Indian_Military_Training_Team)
- [en.wikipedia.org — Insurgency in Cabo Delgado](https://en.wikipedia.org/wiki/Insurgency_in_Cabo_Delgado)
- [en.wikipedia.org — Japan Self-Defense Force Base Djibouti](https://en.wikipedia.org/wiki/Japan_Self-Defense_Force_Base_Djibouti)
- [en.wikipedia.org — List of Russian military bases abroad](https://en.wikipedia.org/wiki/List_of_Russian_military_bases_abroad)
- [en.wikipedia.org — List of Turkish military bases abroad](https://en.wikipedia.org/wiki/List_of_Turkish_military_bases_abroad)
- [en.wikipedia.org — List of United States military bases](https://en.wikipedia.org/wiki/List_of_United_States_military_bases)
- [en.wikipedia.org — Naval Support Facility Diego Garcia](https://en.wikipedia.org/wiki/Naval_Support_Facility_Diego_Garcia)
- [en.wikipedia.org — Operation Shujaa](https://en.wikipedia.org/wiki/Operation_Shujaa)
- [en.wikipedia.org — Pakistan–Saudi Arabia Strategic Mutual Defense Agreement](https://en.wikipedia.org/wiki/Pakistan%E2%80%93Saudi_Arabia_Strategic_Mutual_Defense_Agreement)
- [en.wikipedia.org — People's Liberation Army Support Base in Djibouti](https://en.wikipedia.org/wiki/People%27s_Liberation_Army_Support_Base_in_Djibouti)
- [en.wikipedia.org — Pituffik Space Base](https://en.wikipedia.org/wiki/Pituffik_Space_Base)
- [en.wikipedia.org — Ream Naval Base](https://en.wikipedia.org/wiki/Ream_Naval_Base)
- [criticalthreats.org — congo-war-security-review](https://www.criticalthreats.org/briefs/congo-war-security-review)

#### `blocs.yaml` — Blocs et organisations (membres, règles)

- [amaniafrica-et.org — informal-consultation-with-member-states-in-political-transition](https://amaniafrica-et.org/informal-consultation-with-member-states-in-political-transition/)
- [asean.org — member-states](https://asean.org/member-states/)
- [en.wikipedia.org — 18th BRICS summit](https://en.wikipedia.org/wiki/18th_BRICS_summit)
- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — AUKUS](https://en.wikipedia.org/wiki/AUKUS)
- [en.wikipedia.org — Alliance of Sahel States](https://en.wikipedia.org/wiki/Alliance_of_Sahel_States)
- [en.wikipedia.org — Arab League](https://en.wikipedia.org/wiki/Arab_League)
- [en.wikipedia.org — Collective Security Treaty Organization](https://en.wikipedia.org/wiki/Collective_Security_Treaty_Organization)
- [en.wikipedia.org — Comprehensive and Progressive Agreement for Trans-Pacific Partnership](https://en.wikipedia.org/wiki/Comprehensive_and_Progressive_Agreement_for_Trans-Pacific_Partnership)
- [en.wikipedia.org — ECOWAS](https://en.wikipedia.org/wiki/ECOWAS)
- [en.wikipedia.org — Eastern Caribbean Currency Union](https://en.wikipedia.org/wiki/Eastern_Caribbean_Currency_Union)
- [en.wikipedia.org — Economic and Monetary Community of Central Africa](https://en.wikipedia.org/wiki/Economic_and_Monetary_Community_of_Central_Africa)
- [en.wikipedia.org — Eurasian Economic Union](https://en.wikipedia.org/wiki/Eurasian_Economic_Union)
- [en.wikipedia.org — Five Eyes](https://en.wikipedia.org/wiki/Five_Eyes)
- [en.wikipedia.org — G20](https://en.wikipedia.org/wiki/G20)
- [en.wikipedia.org — G7](https://en.wikipedia.org/wiki/G7)
- [en.wikipedia.org — Gulf Cooperation Council](https://en.wikipedia.org/wiki/Gulf_Cooperation_Council)
- [en.wikipedia.org — Member states of the African Union](https://en.wikipedia.org/wiki/Member_states_of_the_African_Union)
- [en.wikipedia.org — Mercosur](https://en.wikipedia.org/wiki/Mercosur)
- [en.wikipedia.org — Quadrilateral Security Dialogue](https://en.wikipedia.org/wiki/Quadrilateral_Security_Dialogue)
- [en.wikipedia.org — Regional Comprehensive Economic Partnership](https://en.wikipedia.org/wiki/Regional_Comprehensive_Economic_Partnership)
- [en.wikipedia.org — Shanghai Cooperation Organisation](https://en.wikipedia.org/wiki/Shanghai_Cooperation_Organisation)
- [en.wikipedia.org — United States–Mexico–Canada Agreement](https://en.wikipedia.org/wiki/United_States%E2%80%93Mexico%E2%80%93Canada_Agreement)
- [en.wikipedia.org — West African Economic and Monetary Union](https://en.wikipedia.org/wiki/West_African_Economic_and_Monetary_Union)
- [european-union.europa.eu — eu-countries en](https://european-union.europa.eu/principles-countries-history/eu-countries_en)
- [nato.int — topics 52044.htm](https://www.nato.int/cps/en/natohq/topics_52044.htm)
- [npr.org — uae-leaves-opec-oil](https://www.npr.org/2026/04/28/nx-s1-5802735/uae-leaves-opec-oil)
- [opec.org — 613-6-september-2026.html](https://www.opec.org/pr-detail/613-6-september-2026.html)
- [pib.gov.in — PressNoteDetails.aspx](https://www.pib.gov.in/PressNoteDetails.aspx?NoteId=159946&ModuleId=3&reg=3&lang=1)

#### `claims.geojson` — Revendications territoriales (géométries)

- [en.wikipedia.org — Abu Musa](https://en.wikipedia.org/wiki/Abu_Musa)
- [en.wikipedia.org — Abyei](https://en.wikipedia.org/wiki/Abyei)
- [en.wikipedia.org — Aksai Chin](https://en.wikipedia.org/wiki/Aksai_Chin)
- [en.wikipedia.org — Arunachal Pradesh](https://en.wikipedia.org/wiki/Arunachal_Pradesh)
- [en.wikipedia.org — Bhutan–China border](https://en.wikipedia.org/wiki/Bhutan%E2%80%93China_border)
- [en.wikipedia.org — Chagos Archipelago sovereignty dispute](https://en.wikipedia.org/wiki/Chagos_Archipelago_sovereignty_dispute)
- [en.wikipedia.org — Disputed status of Gibraltar](https://en.wikipedia.org/wiki/Disputed_status_of_Gibraltar)
- [en.wikipedia.org — Falkland Islands sovereignty dispute](https://en.wikipedia.org/wiki/Falkland_Islands_sovereignty_dispute)
- [en.wikipedia.org — Guatemalan claim to Belize](https://en.wikipedia.org/wiki/Guatemalan_claim_to_Belize)
- [en.wikipedia.org — Guayana Esequiba](https://en.wikipedia.org/wiki/Guayana_Esequiba)
- [en.wikipedia.org — Hala'ib Triangle](https://en.wikipedia.org/wiki/Hala%27ib_Triangle)
- [en.wikipedia.org — Ilemi Triangle](https://en.wikipedia.org/wiki/Ilemi_Triangle)
- [en.wikipedia.org — Kalapani territory](https://en.wikipedia.org/wiki/Kalapani_territory)
- [en.wikipedia.org — Kashmir conflict](https://en.wikipedia.org/wiki/Kashmir_conflict)
- [en.wikipedia.org — Kuril Islands dispute](https://en.wikipedia.org/wiki/Kuril_Islands_dispute)
- [en.wikipedia.org — Liancourt Rocks dispute](https://en.wikipedia.org/wiki/Liancourt_Rocks_dispute)
- [en.wikipedia.org — Mayotte](https://en.wikipedia.org/wiki/Mayotte)
- [en.wikipedia.org — Paracel Islands](https://en.wikipedia.org/wiki/Paracel_Islands)
- [en.wikipedia.org — Political status of Kosovo](https://en.wikipedia.org/wiki/Political_status_of_Kosovo)
- [en.wikipedia.org — Political status of Taiwan](https://en.wikipedia.org/wiki/Political_status_of_Taiwan)
- [en.wikipedia.org — Scarborough Shoal standoff](https://en.wikipedia.org/wiki/Scarborough_Shoal_standoff)
- [en.wikipedia.org — Senkaku Islands dispute](https://en.wikipedia.org/wiki/Senkaku_Islands_dispute)
- [en.wikipedia.org — Spratly Islands dispute](https://en.wikipedia.org/wiki/Spratly_Islands_dispute)

#### `conflicts.yaml` — Conflits en cours (camps, intensité, statut)

- [acleddata.com — ukraine-war-situation-update-29-august-4-september-2026](https://acleddata.com/update/ukraine-war-situation-update-29-august-4-september-2026)
- [en.wikipedia.org — 2025 Cambodian–Thai border conflict](https://en.wikipedia.org/wiki/2025_Cambodian%E2%80%93Thai_border_conflict)
- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — 2026 Afghanistan–Pakistan war](https://en.wikipedia.org/wiki/2026_Afghanistan%E2%80%93Pakistan_war)
- [en.wikipedia.org — 2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war)
- [en.wikipedia.org — 2026 Lebanon war](https://en.wikipedia.org/wiki/2026_Lebanon_war)
- [en.wikipedia.org — 2026 Ukrainian counteroffensive](https://en.wikipedia.org/wiki/2026_Ukrainian_counteroffensive)
- [en.wikipedia.org — 2026 United States intervention in Venezuela](https://en.wikipedia.org/wiki/2026_United_States_intervention_in_Venezuela)
- [en.wikipedia.org — Armenia–Azerbaijan peace process](https://en.wikipedia.org/wiki/Armenia%E2%80%93Azerbaijan_peace_process)
- [en.wikipedia.org — Cyprus problem](https://en.wikipedia.org/wiki/Cyprus_problem)
- [en.wikipedia.org — Israeli invasion of Syria (2024–present](https://en.wikipedia.org/wiki/Israeli_invasion_of_Syria_(2024%E2%80%93present)
- [en.wikipedia.org — Korean Armistice Agreement](https://en.wikipedia.org/wiki/Korean_Armistice_Agreement)
- [en.wikipedia.org — Libyan crisis (2011–present](https://en.wikipedia.org/wiki/Libyan_crisis_(2011%E2%80%93present)
- [en.wikipedia.org — List of ongoing armed conflicts](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts)
- [en.wikipedia.org — Russo-Georgian War](https://en.wikipedia.org/wiki/Russo-Georgian_War)
- [en.wikipedia.org — Transnistria War](https://en.wikipedia.org/wiki/Transnistria_War)
- [en.wikipedia.org — Western Sahara conflict](https://en.wikipedia.org/wiki/Western_Sahara_conflict)
- [en.wikipedia.org — Yemeni civil war (2014–present](https://en.wikipedia.org/wiki/Yemeni_civil_war_(2014%E2%80%93present)
- [israelpolicyforum.org — israeli-cabinet-approves-framework-for-gaza-stabilization-force-but…](https://israelpolicyforum.org/2026/07/29/israeli-cabinet-approves-framework-for-gaza-stabilization-force-but-what-will-actually-change)
- [news.un.org — 1168270](https://news.un.org/en/story/2026/09/1168270)
- [africanews.com — drc-m23-agree-peace-roadmap-as-doha-talks-seek-to-regain-momentum](https://www.africanews.com/2026/08/24/drc-m23-agree-peace-roadmap-as-doha-talks-seek-to-regain-momentum/)
- [aljazeera.com — red-sea-nations-watch-as-houthis-seize-bab-al-mandeb-strait](https://www.aljazeera.com/economy/2026/9/13/red-sea-nations-watch-as-houthis-seize-bab-al-mandeb-strait)
- [aljazeera.com — israeli-shelling-continues-as-lebanons-pm-demands-withdrawal-in-un-…](https://www.aljazeera.com/news/2026/9/25/israeli-shelling-continues-as-lebanons-pm-demands-withdrawal-in-un-speech)
- [cfr.org — power-struggle-sudan](https://www.cfr.org/global-conflict-tracker/conflict/power-struggle-sudan)
- [chathamhouse.org — afghanistan-and-pakistan-are-facing-open-war-de-escalation-needed](https://www.chathamhouse.org/2026/03/afghanistan-and-pakistan-are-facing-open-war-de-escalation-needed)
- [criticalthreats.org — congo-war-security-review](https://www.criticalthreats.org/briefs/congo-war-security-review)
- [globalsecurity.org — iran-war-oprep.htm](https://www.globalsecurity.org/military/ops/iran-war-oprep.htm)

#### `control_zones.geojson` — Zones de contrôle de facto et souveraineté de jure

- [deepstatemap.live](https://deepstatemap.live)
- [en.wikipedia.org — 2025 Uvira offensive](https://en.wikipedia.org/wiki/2025_Uvira_offensive)
- [en.wikipedia.org — 2026 Lebanon war](https://en.wikipedia.org/wiki/2026_Lebanon_war)
- [en.wikipedia.org — Abkhazia](https://en.wikipedia.org/wiki/Abkhazia)
- [en.wikipedia.org — Annexation of Crimea by the Russian Federation](https://en.wikipedia.org/wiki/Annexation_of_Crimea_by_the_Russian_Federation)
- [en.wikipedia.org — Arakan Army](https://en.wikipedia.org/wiki/Arakan_Army)
- [en.wikipedia.org — East Jerusalem](https://en.wikipedia.org/wiki/East_Jerusalem)
- [en.wikipedia.org — Golan Heights](https://en.wikipedia.org/wiki/Golan_Heights)
- [en.wikipedia.org — International Stabilization Force](https://en.wikipedia.org/wiki/International_Stabilization_Force)
- [en.wikipedia.org — Israeli invasion of Syria (2024–present](https://en.wikipedia.org/wiki/Israeli_invasion_of_Syria_(2024%E2%80%93present)
- [en.wikipedia.org — Libyan crisis (2011–present](https://en.wikipedia.org/wiki/Libyan_crisis_(2011%E2%80%93present)
- [en.wikipedia.org — Northern Cyprus](https://en.wikipedia.org/wiki/Northern_Cyprus)
- [en.wikipedia.org — Somaliland](https://en.wikipedia.org/wiki/Somaliland)
- [en.wikipedia.org — South Ossetia](https://en.wikipedia.org/wiki/South_Ossetia)
- [en.wikipedia.org — Transnistria](https://en.wikipedia.org/wiki/Transnistria)
- [en.wikipedia.org — Western Sahara](https://en.wikipedia.org/wiki/Western_Sahara)
- [en.wikipedia.org — Yemeni civil war (2014–present](https://en.wikipedia.org/wiki/Yemeni_civil_war_(2014%E2%80%93present)
- [israelpolicyforum.org — israeli-cabinet-approves-framework-for-gaza-stabilization-force-but…](https://israelpolicyforum.org/2026/07/29/israeli-cabinet-approves-framework-for-gaza-stabilization-force-but-what-will-actually-change)
- [moderndiplomacy.eu — how-the-houthis-control-of-bab-el-mandeb-could-reshape-red-sea-ship…](https://moderndiplomacy.eu/2026/09/19/how-the-houthis-control-of-bab-el-mandeb-could-reshape-red-sea-shipping/)
- [news.antiwar.com — israeli-dm-idf-troops-will-remain-in-syrian-buffer-zone](https://news.antiwar.com/2026/08/26/israeli-dm-idf-troops-will-remain-in-syrian-buffer-zone/)
- [aljazeera.com — red-sea-nations-watch-as-houthis-seize-bab-al-mandeb-strait](https://www.aljazeera.com/economy/2026/9/13/red-sea-nations-watch-as-houthis-seize-bab-al-mandeb-strait)
- [aljazeera.com — israeli-shelling-continues-as-lebanons-pm-demands-withdrawal-in-un-…](https://www.aljazeera.com/news/2026/9/25/israeli-shelling-continues-as-lebanons-pm-demands-withdrawal-in-un-speech)
- [cfr.org — power-struggle-sudan](https://www.cfr.org/global-conflict-tracker/conflict/power-struggle-sudan)
- [criticalthreats.org — congo-war-security-review](https://www.criticalthreats.org/briefs/congo-war-security-review)
- [sudanspost.com — territorial-control-map-sudan-conflict-as-of-june-21-2026](https://www.sudanspost.com/territorial-control-map-sudan-conflict-as-of-june-21-2026/)

#### `country_economy.yaml` — Notation souveraine, régime de change, monnaie de réserve, fonds souverains, dette détenue par l'étranger

- FMI, Annual Report on Exchange Arrangements and Exchange Restrictions 2024 (classification de fait simplifiée) ; unions monétaires : blocs.yaml
- FMI, Sovereign Debt Investor Base (Arslanalp et Tsuda), dernières données disponibles ; Trésor américain (TIC)
- [data.imf.org — imf data brief july 1](https://data.imf.org/en/news/imf%20data%20brief%20july%201)
- [en.wikipedia.org — Inflation targeting](https://en.wikipedia.org/wiki/Inflation_targeting)
- [en.wikipedia.org — List of countries by credit rating](https://en.wikipedia.org/wiki/List_of_countries_by_credit_rating)
- [en.wikipedia.org — Sovereign wealth fund](https://en.wikipedia.org/wiki/Sovereign_wealth_fund)
- [globalswf.com — ranking](https://globalswf.com/ranking)

#### `country_energy.yaml` — Réserves d'hydrocarbures, quotas OPEP+, capacités de réserve, GNL, stocks stratégiques

- AIE, Oil Stocks of IEA Countries (obligation de 90 jours d'importations nettes) ; réserves stratégiques des États-Unis (≈ 410 Mb), du Japon, de la Corée, de la Chine et de l'Inde (estimations publiques)
- Hypothèse GeoSim : capacité soutenable annoncée (ADNOC 4,85 Mb/j) moins production ; capacité saoudienne de 12 Mb/j ; production du Golfe bridée par la quasi-fermeture d'Ormuz
- IGU, World LNG Report 2025 ; GIIGNL 2025 (capacités nominales arrondies, mises à jour des mises en service 2025-2026 : Plaquemines, LNG Canada, Greater Tortue)
- [en.wikipedia.org — List of countries by natural gas proven reserves](https://en.wikipedia.org/wiki/List_of_countries_by_natural_gas_proven_reserves)
- [en.wikipedia.org — List of countries by proven oil reserves](https://en.wikipedia.org/wiki/List_of_countries_by_proven_oil_reserves)
- [tass.com — 2183335](https://tass.com/economy/2183335)
- [opec.org — 589-1-february-2026.html](https://www.opec.org/pr-detail/589-1-february-2026.html)
- [opec.org — 613-6-september-2026.html](https://www.opec.org/pr-detail/613-6-september-2026.html)

#### `country_military.yaml` — Effectifs militaires, conscription, mobilisation, hypersoniques, qualité, doctrine, budget de défense de Taïwan

- Hypothèse GeoSim fondée sur conflicts.yaml et les effectifs de l’IISS
- Hypothèse GeoSim fondée sur les doctrines publiées (livres blancs, revues stratégiques) et les engagements récents
- Hypothèse GeoSim fondée sur l’entraînement, l’expérience et la maintenance décrits par l’IISS (The Military Balance 2026) et le retour d’expérience des guerres récentes
- [en.wikipedia.org — Conscription by country](https://en.wikipedia.org/wiki/Conscription_by_country)
- [en.wikipedia.org — Hypersonic weapon](https://en.wikipedia.org/wiki/Hypersonic_weapon)
- [en.wikipedia.org — List of countries by number of military and paramilitary personnel](https://en.wikipedia.org/wiki/List_of_countries_by_number_of_military_and_paramilitary_personnel)
- [en.wikipedia.org — Military service](https://en.wikipedia.org/wiki/Military_service)
- [focustaiwan.tw — 202508210007](https://focustaiwan.tw/politics/202508210007)
- [taipeitimes.com — 2003862862](https://www.taipeitimes.com/News/front/archives/2026/08/21/2003862862)

#### `country_politics.yaml` — Type de régime, contrôle de l'information, ancienneté au pouvoir, siège au Conseil de sécurité, neutralité, médiation

- Hypothèse GeoSim fondée sur les médiations récentes : Qatar (Gaza, Afghanistan, RD Congo–M23 à Doha), Oman et Pakistan (États-Unis–Iran, pourparlers d'Islamabad 2026), Turquie (Russie–Ukraine), Suisse, Norvège, Égypte, Arabie saoudite
- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — List of current heads of state and government](https://en.wikipedia.org/wiki/List_of_current_heads_of_state_and_government)
- [en.wikipedia.org — List of members of the United Nations Security Council](https://en.wikipedia.org/wiki/List_of_members_of_the_United_Nations_Security_Council)
- [en.wikipedia.org — List of neutral countries](https://en.wikipedia.org/wiki/List_of_neutral_countries)
- [en.wikipedia.org — World Press Freedom Index](https://en.wikipedia.org/wiki/World_Press_Freedom_Index)

#### `country_society.yaml` — Fractionnement ethnique et linguistique, populations et PIB des entités absentes de la Banque mondiale

- Hypothèse GeoSim
- Infobox Wikipedia de chaque entité
- Infobox Wikipedia de chaque entité (estimations officielles ou des Nations unies)
- [en.wikipedia.org — Abkhazia](https://en.wikipedia.org/wiki/Abkhazia)
- [en.wikipedia.org — List of countries by ethnic and cultural diversity level](https://en.wikipedia.org/wiki/List_of_countries_by_ethnic_and_cultural_diversity_level)
- [en.wikipedia.org — Northern Cyprus](https://en.wikipedia.org/wiki/Northern_Cyprus)
- [en.wikipedia.org — Somaliland](https://en.wikipedia.org/wiki/Somaliland)
- [en.wikipedia.org — South Ossetia](https://en.wikipedia.org/wiki/South_Ossetia)
- [en.wikipedia.org — Transnistria](https://en.wikipedia.org/wiki/Transnistria)
- [en.wikipedia.org — Vatican City](https://en.wikipedia.org/wiki/Vatican_City)
- [en.wikipedia.org — Western Sahara](https://en.wikipedia.org/wiki/Western_Sahara)

#### `defaults.yaml` — Valeurs par défaut documentées

- Hypothèses GeoSim (voir chaque note)

#### `disputes.yaml` — Différends territoriaux

- [en.wikipedia.org — 2025 Cambodian–Thai border conflict](https://en.wikipedia.org/wiki/2025_Cambodian%E2%80%93Thai_border_conflict)
- [en.wikipedia.org — Abu Musa](https://en.wikipedia.org/wiki/Abu_Musa)
- [en.wikipedia.org — Abyei](https://en.wikipedia.org/wiki/Abyei)
- [en.wikipedia.org — Aegean dispute](https://en.wikipedia.org/wiki/Aegean_dispute)
- [en.wikipedia.org — Aksai Chin](https://en.wikipedia.org/wiki/Aksai_Chin)
- [en.wikipedia.org — Annexation of Crimea by the Russian Federation](https://en.wikipedia.org/wiki/Annexation_of_Crimea_by_the_Russian_Federation)
- [en.wikipedia.org — Arunachal Pradesh](https://en.wikipedia.org/wiki/Arunachal_Pradesh)
- [en.wikipedia.org — Bhutan–China border](https://en.wikipedia.org/wiki/Bhutan%E2%80%93China_border)
- [en.wikipedia.org — Chagos Archipelago sovereignty dispute](https://en.wikipedia.org/wiki/Chagos_Archipelago_sovereignty_dispute)
- [en.wikipedia.org — Cyprus problem](https://en.wikipedia.org/wiki/Cyprus_problem)
- [en.wikipedia.org — Disputed status of Gibraltar](https://en.wikipedia.org/wiki/Disputed_status_of_Gibraltar)
- [en.wikipedia.org — East China Sea EEZ disputes](https://en.wikipedia.org/wiki/East_China_Sea_EEZ_disputes)
- [en.wikipedia.org — Falkland Islands sovereignty dispute](https://en.wikipedia.org/wiki/Falkland_Islands_sovereignty_dispute)
- [en.wikipedia.org — Golan Heights](https://en.wikipedia.org/wiki/Golan_Heights)
- [en.wikipedia.org — Guatemalan claim to Belize](https://en.wikipedia.org/wiki/Guatemalan_claim_to_Belize)
- [en.wikipedia.org — Guayana Esequiba](https://en.wikipedia.org/wiki/Guayana_Esequiba)
- [en.wikipedia.org — Hala'ib Triangle](https://en.wikipedia.org/wiki/Hala%27ib_Triangle)
- [en.wikipedia.org — Ilemi Triangle](https://en.wikipedia.org/wiki/Ilemi_Triangle)
- [en.wikipedia.org — Israeli-occupied territories](https://en.wikipedia.org/wiki/Israeli-occupied_territories)
- [en.wikipedia.org — Kalapani territory](https://en.wikipedia.org/wiki/Kalapani_territory)
- [en.wikipedia.org — Kashmir conflict](https://en.wikipedia.org/wiki/Kashmir_conflict)
- [en.wikipedia.org — Kuril Islands dispute](https://en.wikipedia.org/wiki/Kuril_Islands_dispute)
- [en.wikipedia.org — Liancourt Rocks dispute](https://en.wikipedia.org/wiki/Liancourt_Rocks_dispute)
- [en.wikipedia.org — Mayotte](https://en.wikipedia.org/wiki/Mayotte)
- [en.wikipedia.org — Paracel Islands](https://en.wikipedia.org/wiki/Paracel_Islands)
- [en.wikipedia.org — Political status of Kosovo](https://en.wikipedia.org/wiki/Political_status_of_Kosovo)
- [en.wikipedia.org — Political status of Taiwan](https://en.wikipedia.org/wiki/Political_status_of_Taiwan)
- [en.wikipedia.org — Russian-occupied territories in Georgia](https://en.wikipedia.org/wiki/Russian-occupied_territories_in_Georgia)
- [en.wikipedia.org — Russian-occupied territories of Ukraine](https://en.wikipedia.org/wiki/Russian-occupied_territories_of_Ukraine)
- [en.wikipedia.org — Scarborough Shoal standoff](https://en.wikipedia.org/wiki/Scarborough_Shoal_standoff)
- [en.wikipedia.org — Senkaku Islands dispute](https://en.wikipedia.org/wiki/Senkaku_Islands_dispute)
- [en.wikipedia.org — Somaliland](https://en.wikipedia.org/wiki/Somaliland)
- [en.wikipedia.org — Spratly Islands dispute](https://en.wikipedia.org/wiki/Spratly_Islands_dispute)
- [en.wikipedia.org — Transnistria](https://en.wikipedia.org/wiki/Transnistria)
- [en.wikipedia.org — Western Sahara conflict](https://en.wikipedia.org/wiki/Western_Sahara_conflict)

#### `elections.yaml` — Prochaines élections nationales

- [en.wikipedia.org — 2026 national electoral calendar](https://en.wikipedia.org/wiki/2026_national_electoral_calendar)
- [en.wikipedia.org — 2027 French presidential election](https://en.wikipedia.org/wiki/2027_French_presidential_election)
- [en.wikipedia.org — 2027 national electoral calendar](https://en.wikipedia.org/wiki/2027_national_electoral_calendar)
- [en.wikipedia.org — 2028 Czech presidential election](https://en.wikipedia.org/wiki/2028_Czech_presidential_election)
- [en.wikipedia.org — 2028 Japanese House of Councillors election](https://en.wikipedia.org/wiki/2028_Japanese_House_of_Councillors_election)
- [en.wikipedia.org — 2028 Philippine presidential election](https://en.wikipedia.org/wiki/2028_Philippine_presidential_election)
- [en.wikipedia.org — 2028 South Korean legislative election](https://en.wikipedia.org/wiki/2028_South_Korean_legislative_election)
- [en.wikipedia.org — 2028 Taiwanese presidential election](https://en.wikipedia.org/wiki/2028_Taiwanese_presidential_election)
- [en.wikipedia.org — 2029 Indian general election](https://en.wikipedia.org/wiki/2029_Indian_general_election)
- [en.wikipedia.org — 2029 Indonesian general election](https://en.wikipedia.org/wiki/2029_Indonesian_general_election)
- [en.wikipedia.org — 2029 Norwegian parliamentary election](https://en.wikipedia.org/wiki/2029_Norwegian_parliamentary_election)
- [en.wikipedia.org — 2030 Russian presidential election](https://en.wikipedia.org/wiki/2030_Russian_presidential_election)
- [en.wikipedia.org — Elections in Belarus](https://en.wikipedia.org/wiki/Elections_in_Belarus)
- [en.wikipedia.org — Elections in Chile](https://en.wikipedia.org/wiki/Elections_in_Chile)
- [en.wikipedia.org — Elections in Colombia](https://en.wikipedia.org/wiki/Elections_in_Colombia)
- [en.wikipedia.org — Elections in Ethiopia](https://en.wikipedia.org/wiki/Elections_in_Ethiopia)
- [en.wikipedia.org — Elections in Hungary](https://en.wikipedia.org/wiki/Elections_in_Hungary)
- [en.wikipedia.org — Elections in Kazakhstan](https://en.wikipedia.org/wiki/Elections_in_Kazakhstan)
- [en.wikipedia.org — Elections in Peru](https://en.wikipedia.org/wiki/Elections_in_Peru)
- [en.wikipedia.org — Elections in the Democratic Republic of the Congo](https://en.wikipedia.org/wiki/Elections_in_the_Democratic_Republic_of_the_Congo)
- [en.wikipedia.org — Next Australian federal election](https://en.wikipedia.org/wiki/Next_Australian_federal_election)
- [en.wikipedia.org — Next Canadian federal election](https://en.wikipedia.org/wiki/Next_Canadian_federal_election)
- [en.wikipedia.org — Next Dutch general election](https://en.wikipedia.org/wiki/Next_Dutch_general_election)
- [en.wikipedia.org — Next Egyptian presidential election](https://en.wikipedia.org/wiki/Next_Egyptian_presidential_election)
- [en.wikipedia.org — Next German federal election](https://en.wikipedia.org/wiki/Next_German_federal_election)
- [en.wikipedia.org — Next Iranian presidential election](https://en.wikipedia.org/wiki/Next_Iranian_presidential_election)
- [en.wikipedia.org — Next Iraqi parliamentary election](https://en.wikipedia.org/wiki/Next_Iraqi_parliamentary_election)
- [en.wikipedia.org — Next Pakistani general election](https://en.wikipedia.org/wiki/Next_Pakistani_general_election)
- [en.wikipedia.org — Next Singaporean general election](https://en.wikipedia.org/wiki/Next_Singaporean_general_election)
- [en.wikipedia.org — Next South African general election](https://en.wikipedia.org/wiki/Next_South_African_general_election)
- [en.wikipedia.org — Next Swedish general election](https://en.wikipedia.org/wiki/Next_Swedish_general_election)
- [en.wikipedia.org — Next Turkish presidential election](https://en.wikipedia.org/wiki/Next_Turkish_presidential_election)
- [en.wikipedia.org — Next United Kingdom general election](https://en.wikipedia.org/wiki/Next_United_Kingdom_general_election)

#### `energy_links.yaml` — Oléoducs, gazoducs et terminaux GNL

- [en.wikipedia.org — 2022 Nord Stream pipeline sabotage](https://en.wikipedia.org/wiki/2022_Nord_Stream_pipeline_sabotage)
- [en.wikipedia.org — 2024 Red Sea submarine cable disruption](https://en.wikipedia.org/wiki/2024_Red_Sea_submarine_cable_disruption)
- [en.wikipedia.org — 2026 East–West Crude Oil Pipeline attack](https://en.wikipedia.org/wiki/2026_East%E2%80%93West_Crude_Oil_Pipeline_attack)
- [en.wikipedia.org — Arab Gas Pipeline](https://en.wikipedia.org/wiki/Arab_Gas_Pipeline)
- [en.wikipedia.org — Arctic LNG 2](https://en.wikipedia.org/wiki/Arctic_LNG_2)
- [en.wikipedia.org — Baku–Tbilisi–Ceyhan pipeline](https://en.wikipedia.org/wiki/Baku%E2%80%93Tbilisi%E2%80%93Ceyhan_pipeline)
- [en.wikipedia.org — Baltic Pipe](https://en.wikipedia.org/wiki/Baltic_Pipe)
- [en.wikipedia.org — Caspian Pipeline Consortium](https://en.wikipedia.org/wiki/Caspian_Pipeline_Consortium)
- [en.wikipedia.org — Central Asia–China gas pipeline](https://en.wikipedia.org/wiki/Central_Asia%E2%80%93China_gas_pipeline)
- [en.wikipedia.org — Dolphin Gas Project](https://en.wikipedia.org/wiki/Dolphin_Gas_Project)
- [en.wikipedia.org — Druzhba pipeline](https://en.wikipedia.org/wiki/Druzhba_pipeline)
- [en.wikipedia.org — Eastern Siberia–Pacific Ocean oil pipeline](https://en.wikipedia.org/wiki/Eastern_Siberia%E2%80%93Pacific_Ocean_oil_pipeline)
- [en.wikipedia.org — Estlink](https://en.wikipedia.org/wiki/Estlink)
- [en.wikipedia.org — Gassco](https://en.wikipedia.org/wiki/Gassco)
- [en.wikipedia.org — Goreh–Jask oil pipeline](https://en.wikipedia.org/wiki/Goreh%E2%80%93Jask_oil_pipeline)
- [en.wikipedia.org — Greenstream pipeline](https://en.wikipedia.org/wiki/Greenstream_pipeline)
- [en.wikipedia.org — Habshan–Fujairah oil pipeline](https://en.wikipedia.org/wiki/Habshan%E2%80%93Fujairah_oil_pipeline)
- [en.wikipedia.org — Kazakhstan–China oil pipeline](https://en.wikipedia.org/wiki/Kazakhstan%E2%80%93China_oil_pipeline)
- [en.wikipedia.org — Kirkuk–Ceyhan Oil Pipeline](https://en.wikipedia.org/wiki/Kirkuk%E2%80%93Ceyhan_Oil_Pipeline)
- [en.wikipedia.org — List of LNG terminals](https://en.wikipedia.org/wiki/List_of_LNG_terminals)
- [en.wikipedia.org — Medgaz](https://en.wikipedia.org/wiki/Medgaz)
- [en.wikipedia.org — Power of Siberia](https://en.wikipedia.org/wiki/Power_of_Siberia)
- [en.wikipedia.org — Power of Siberia 2](https://en.wikipedia.org/wiki/Power_of_Siberia_2)
- [en.wikipedia.org — Russia–Ukraine gas disputes](https://en.wikipedia.org/wiki/Russia%E2%80%93Ukraine_gas_disputes)
- [en.wikipedia.org — SUMED pipeline](https://en.wikipedia.org/wiki/SUMED_pipeline)
- [en.wikipedia.org — Southern Gas Corridor](https://en.wikipedia.org/wiki/Southern_Gas_Corridor)
- [en.wikipedia.org — Submarine cables of Taiwan](https://en.wikipedia.org/wiki/Submarine_cables_of_Taiwan)
- [en.wikipedia.org — Tabriz–Ankara pipeline](https://en.wikipedia.org/wiki/Tabriz%E2%80%93Ankara_pipeline)
- [en.wikipedia.org — Trans-Mediterranean Pipeline](https://en.wikipedia.org/wiki/Trans-Mediterranean_Pipeline)
- [en.wikipedia.org — TurkStream](https://en.wikipedia.org/wiki/TurkStream)
- [en.wikipedia.org — Yamal–Europe pipeline](https://en.wikipedia.org/wiki/Yamal%E2%80%93Europe_pipeline)
- [en.wikipedia.org — Yamal LNG](https://en.wikipedia.org/wiki/Yamal_LNG)
- [cnbc.com — qatarenergy-extend-force-majeure-september-italys-edison-iran-war-.…](https://www.cnbc.com/2026/07/01/qatarenergy-extend-force-majeure-september-italys-edison-iran-war-.html)
- [gie.eu — lng-database](https://www.gie.eu/transparency/databases/lng-database/)
- [thenationalnews.com — months-expected-until-qatars-ras-laffan-lng-site-resumes-full-opera…](https://www.thenationalnews.com/business/energy/2026/04/09/months-expected-until-qatars-ras-laffan-lng-site-resumes-full-operations/)

#### `entities.yaml` — Entités de facto, factions, niveau de détail, reconnaissance

- [en.wikipedia.org — Arakan Army](https://en.wikipedia.org/wiki/Arakan_Army)
- [en.wikipedia.org — Armenia–Pakistan relations](https://en.wikipedia.org/wiki/Armenia%E2%80%93Pakistan_relations)
- [en.wikipedia.org — Cyprus–Turkey relations](https://en.wikipedia.org/wiki/Cyprus%E2%80%93Turkey_relations)
- [en.wikipedia.org — Foreign relations of North Korea](https://en.wikipedia.org/wiki/Foreign_relations_of_North_Korea)
- [en.wikipedia.org — International recognition of Israel](https://en.wikipedia.org/wiki/International_recognition_of_Israel)
- [en.wikipedia.org — International recognition of Kosovo](https://en.wikipedia.org/wiki/International_recognition_of_Kosovo)
- [en.wikipedia.org — International recognition of Palestine](https://en.wikipedia.org/wiki/International_recognition_of_Palestine)
- [en.wikipedia.org — International recognition of the Sahrawi Arab Democratic Republic](https://en.wikipedia.org/wiki/International_recognition_of_the_Sahrawi_Arab_Democratic_Republic)
- [en.wikipedia.org — Libyan crisis (2011–present](https://en.wikipedia.org/wiki/Libyan_crisis_(2011%E2%80%93present)
- [en.wikipedia.org — List of states with limited recognition](https://en.wikipedia.org/wiki/List_of_states_with_limited_recognition)
- [en.wikipedia.org — Northern Cyprus](https://en.wikipedia.org/wiki/Northern_Cyprus)
- [en.wikipedia.org — Vatican City](https://en.wikipedia.org/wiki/Vatican_City)
- [population.un.org — wpp](https://population.un.org/wpp/)
- [aljazeera.com — red-sea-nations-watch-as-houthis-seize-bab-al-mandeb-strait](https://www.aljazeera.com/economy/2026/9/13/red-sea-nations-watch-as-houthis-seize-bab-al-mandeb-strait)
- [criticalthreats.org — congo-war-security-review](https://www.criticalthreats.org/briefs/congo-war-security-review)
- [sudanspost.com — territorial-control-map-sudan-conflict-as-of-june-21-2026](https://www.sudanspost.com/territorial-control-map-sudan-conflict-as-of-june-21-2026/)

#### `food.yaml` — Bilans céréaliers mondiaux

- [en.wikipedia.org — 2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war)
- [usda.gov — wasde0926.pdf](https://www.usda.gov/oce/commodity/wasde/wasde0926.pdf)

#### `fortifications.geojson` — Lignes fortifiées

- [en.wikipedia.org — East Shield](https://en.wikipedia.org/wiki/East_Shield)
- [en.wikipedia.org — Gaza–Israel barrier](https://en.wikipedia.org/wiki/Gaza%E2%80%93Israel_barrier)
- [en.wikipedia.org — Korean Demilitarized Zone](https://en.wikipedia.org/wiki/Korean_Demilitarized_Zone)
- [en.wikipedia.org — Line of Control](https://en.wikipedia.org/wiki/Line_of_Control)
- [en.wikipedia.org — Moroccan Western Sahara Wall](https://en.wikipedia.org/wiki/Moroccan_Western_Sahara_Wall)
- [en.wikipedia.org — Purple Line (ceasefire line](https://en.wikipedia.org/wiki/Purple_Line_(ceasefire_line)
- [en.wikipedia.org — Surovikin line](https://en.wikipedia.org/wiki/Surovikin_line)
- [en.wikipedia.org — United Nations Buffer Zone in Cyprus](https://en.wikipedia.org/wiki/United_Nations_Buffer_Zone_in_Cyprus)

#### `military_capabilities.yaml` — Capacités militaires par domaine (porte-avions, sous-marins, etc.)

- [en.wikipedia.org — Fifth-generation fighter](https://en.wikipedia.org/wiki/Fifth-generation_fighter)
- [en.wikipedia.org — List of aircraft carriers in service](https://en.wikipedia.org/wiki/List_of_aircraft_carriers_in_service)
- [en.wikipedia.org — List of submarine classes in service](https://en.wikipedia.org/wiki/List_of_submarine_classes_in_service)

#### `minerals.yaml` — Production et raffinage des minerais critiques

- [pubs.usgs.gov — mcs2026.pdf](https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf)
- [world-nuclear.org — world-uranium-mining-production](https://world-nuclear.org/information-library/nuclear-fuel-cycle/mining-of-uranium/world-uranium-mining-production)

#### `nuclear.yaml` — Arsenaux nucléaires, parapluies, programmes

- [en.wikipedia.org — 2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war)
- [en.wikipedia.org — Nuclear program of Saudi Arabia](https://en.wikipedia.org/wiki/Nuclear_program_of_Saudi_Arabia)
- [en.wikipedia.org — Union State](https://en.wikipedia.org/wiki/Union_State)
- [nato.int — topics 50068.htm](https://www.nato.int/cps/en/natohq/topics_50068.htm)
- [sipri.org — YB26 08 World Nuclear Forces.pdf](https://www.sipri.org/sites/default/files/YB26%2008%20World%20Nuclear%20Forces.pdf)

#### `profiles.yaml` — Profils décisionnels (hypothèses sur les gouvernements, à valider)

- Hypothèse GeoSim fondée sur les comportements observables (voir chaque justification)

#### `relations_seed.yaml` — Relations initiales entre paires clés (hypothèses, à valider)

- Hypothèse GeoSim (état des relations au 2026-09-25)

#### `sanctions.yaml` — Régimes de sanctions, droits de douane, réserves gelées, restrictions à l'export

- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — 2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war)
- [en.wikipedia.org — ASML Holding](https://en.wikipedia.org/wiki/ASML_Holding)
- [en.wikipedia.org — China–United States trade war](https://en.wikipedia.org/wiki/China%E2%80%93United_States_trade_war)
- [en.wikipedia.org — Cobalt mining in the Democratic Republic of the Congo](https://en.wikipedia.org/wiki/Cobalt_mining_in_the_Democratic_Republic_of_the_Congo)
- [en.wikipedia.org — Da Afghanistan Bank](https://en.wikipedia.org/wiki/Da_Afghanistan_Bank)
- [en.wikipedia.org — Gallium](https://en.wikipedia.org/wiki/Gallium)
- [en.wikipedia.org — Germanium](https://en.wikipedia.org/wiki/Germanium)
- [en.wikipedia.org — Graphite](https://en.wikipedia.org/wiki/Graphite)
- [en.wikipedia.org — International sanctions against Belarus](https://en.wikipedia.org/wiki/International_sanctions_against_Belarus)
- [en.wikipedia.org — International sanctions against Myanmar](https://en.wikipedia.org/wiki/International_sanctions_against_Myanmar)
- [en.wikipedia.org — International sanctions during the Russo-Ukrainian war](https://en.wikipedia.org/wiki/International_sanctions_during_the_Russo-Ukrainian_war)
- [en.wikipedia.org — Lithium mining in Zimbabwe](https://en.wikipedia.org/wiki/Lithium_mining_in_Zimbabwe)
- [en.wikipedia.org — Nicaragua–United States relations](https://en.wikipedia.org/wiki/Nicaragua%E2%80%93United_States_relations)
- [en.wikipedia.org — Nickel mining in Indonesia](https://en.wikipedia.org/wiki/Nickel_mining_in_Indonesia)
- [en.wikipedia.org — Rare-earth element](https://en.wikipedia.org/wiki/Rare-earth_element)
- [en.wikipedia.org — Rare-earth industry in China](https://en.wikipedia.org/wiki/Rare-earth_industry_in_China)
- [en.wikipedia.org — Russian foreign exchange reserves](https://en.wikipedia.org/wiki/Russian_foreign_exchange_reserves)
- [en.wikipedia.org — Russian oil export ban](https://en.wikipedia.org/wiki/Russian_oil_export_ban)
- [en.wikipedia.org — Russian sanctions against Western countries](https://en.wikipedia.org/wiki/Russian_sanctions_against_Western_countries)
- [en.wikipedia.org — Sanctions against Afghanistan](https://en.wikipedia.org/wiki/Sanctions_against_Afghanistan)
- [en.wikipedia.org — Sanctions against North Korea](https://en.wikipedia.org/wiki/Sanctions_against_North_Korea)
- [en.wikipedia.org — Sanctions during the Venezuelan crisis](https://en.wikipedia.org/wiki/Sanctions_during_the_Venezuelan_crisis)
- [en.wikipedia.org — Snapback (Iran](https://en.wikipedia.org/wiki/Snapback_(Iran)
- [en.wikipedia.org — United States New Export Controls on Advanced Computing and Semicon…](https://en.wikipedia.org/wiki/United_States_New_Export_Controls_on_Advanced_Computing_and_Semiconductors_to_China)
- [en.wikipedia.org — United States embargo against Cuba](https://en.wikipedia.org/wiki/United_States_embargo_against_Cuba)
- [en.wikipedia.org — United States sanctions against China](https://en.wikipedia.org/wiki/United_States_sanctions_against_China)
- [en.wikipedia.org — United States sanctions during the Venezuelan crisis](https://en.wikipedia.org/wiki/United_States_sanctions_during_the_Venezuelan_crisis)
- [en.wikipedia.org — Venezuelan gold at the Bank of England](https://en.wikipedia.org/wiki/Venezuelan_gold_at_the_Bank_of_England)
- [gingercontrol.com — section-122-tariffs-explained](https://gingercontrol.com/blog/section-122-tariffs-explained)
- [globalsecurity.org — iran-war-oprep.htm](https://www.globalsecurity.org/military/ops/iran-war-oprep.htm)
- [skadden.com — us-trade-court-strikes-down-section-122-tariffs](https://www.skadden.com/insights/publications/2026/05/us-trade-court-strikes-down-section-122-tariffs)

#### `semiconductors.yaml` — Parts de la production de puces avancées, autonomie

- Hypothèse GeoSim fondée sur la répartition des maillons (conception, équipements, gravure, assemblage) décrite par SIA/BCG (2024) et le CSIS
- [semiconductors.org — emerging-resilience-in-the-semiconductor-supply-chain](https://www.semiconductors.org/emerging-resilience-in-the-semiconductor-supply-chain/)

#### `separatism.geojson` — Régions à forte tension séparatiste

- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — 2026 Iran war](https://en.wikipedia.org/wiki/2026_Iran_war)
- [en.wikipedia.org — Bougainville independence referendum](https://en.wikipedia.org/wiki/Bougainville_independence_referendum)
- [en.wikipedia.org — Bougival Accord](https://en.wikipedia.org/wiki/Bougival_Accord)
- [en.wikipedia.org — Catalan independence movement](https://en.wikipedia.org/wiki/Catalan_independence_movement)
- [en.wikipedia.org — List of ongoing armed conflicts](https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts)
- [en.wikipedia.org — PKK–Turkey peace process (2025–present](https://en.wikipedia.org/wiki/PKK%E2%80%93Turkey_peace_process_(2025%E2%80%93present)
- [en.wikipedia.org — Tibetan independence movement](https://en.wikipedia.org/wiki/Tibetan_independence_movement)
- [en.wikipedia.org — Xinjiang conflict](https://en.wikipedia.org/wiki/Xinjiang_conflict)

#### `treaties.yaml` — Traités et garanties de sécurité

- [en.wikipedia.org — 2001 Sino-Russian Treaty of Friendship](https://en.wikipedia.org/wiki/2001_Sino-Russian_Treaty_of_Friendship)
- [en.wikipedia.org — 2024 North Korea–Russia Comprehensive Strategic Partnership Agreement](https://en.wikipedia.org/wiki/2024_North_Korea%E2%80%93Russia_Comprehensive_Strategic_Partnership_Agreement)
- [en.wikipedia.org — 2026](https://en.wikipedia.org/wiki/2026)
- [en.wikipedia.org — ANZUS](https://en.wikipedia.org/wiki/ANZUS)
- [en.wikipedia.org — Armenia–Russia relations](https://en.wikipedia.org/wiki/Armenia%E2%80%93Russia_relations)
- [en.wikipedia.org — Australia–Japan relations](https://en.wikipedia.org/wiki/Australia%E2%80%93Japan_relations)
- [en.wikipedia.org — China–Pakistan relations](https://en.wikipedia.org/wiki/China%E2%80%93Pakistan_relations)
- [en.wikipedia.org — Djibouti–France relations](https://en.wikipedia.org/wiki/Djibouti%E2%80%93France_relations)
- [en.wikipedia.org — Egypt–Sudan relations](https://en.wikipedia.org/wiki/Egypt%E2%80%93Sudan_relations)
- [en.wikipedia.org — France–Greece relations](https://en.wikipedia.org/wiki/France%E2%80%93Greece_relations)
- [en.wikipedia.org — France–Ukraine relations](https://en.wikipedia.org/wiki/France%E2%80%93Ukraine_relations)
- [en.wikipedia.org — France–United Arab Emirates relations](https://en.wikipedia.org/wiki/France%E2%80%93United_Arab_Emirates_relations)
- [en.wikipedia.org — Germany–Ukraine relations](https://en.wikipedia.org/wiki/Germany%E2%80%93Ukraine_relations)
- [en.wikipedia.org — India–Russia relations](https://en.wikipedia.org/wiki/India%E2%80%93Russia_relations)
- [en.wikipedia.org — India–United States relations](https://en.wikipedia.org/wiki/India%E2%80%93United_States_relations)
- [en.wikipedia.org — Iran–Russia relations](https://en.wikipedia.org/wiki/Iran%E2%80%93Russia_relations)
- [en.wikipedia.org — Israel–United States relations](https://en.wikipedia.org/wiki/Israel%E2%80%93United_States_relations)
- [en.wikipedia.org — Japan–Philippines relations](https://en.wikipedia.org/wiki/Japan%E2%80%93Philippines_relations)
- [en.wikipedia.org — Mutual Defense Treaty (United States–Philippines](https://en.wikipedia.org/wiki/Mutual_Defense_Treaty_(United_States%E2%80%93Philippines)
- [en.wikipedia.org — Mutual Defense Treaty (United States–South Korea](https://en.wikipedia.org/wiki/Mutual_Defense_Treaty_(United_States%E2%80%93South_Korea)
- [en.wikipedia.org — Pakistan–Saudi Arabia Strategic Mutual Defense Agreement](https://en.wikipedia.org/wiki/Pakistan%E2%80%93Saudi_Arabia_Strategic_Mutual_Defense_Agreement)
- [en.wikipedia.org — Qatar–United States relations](https://en.wikipedia.org/wiki/Qatar%E2%80%93United_States_relations)
- [en.wikipedia.org — Russia–Vietnam relations](https://en.wikipedia.org/wiki/Russia%E2%80%93Vietnam_relations)
- [en.wikipedia.org — Saudi Arabia–United States relations](https://en.wikipedia.org/wiki/Saudi_Arabia%E2%80%93United_States_relations)
- [en.wikipedia.org — Shusha Declaration](https://en.wikipedia.org/wiki/Shusha_Declaration)
- [en.wikipedia.org — Sino-North Korean Mutual Aid and Cooperation Friendship Treaty](https://en.wikipedia.org/wiki/Sino-North_Korean_Mutual_Aid_and_Cooperation_Friendship_Treaty)
- [en.wikipedia.org — Taiwan Relations Act](https://en.wikipedia.org/wiki/Taiwan_Relations_Act)
- [en.wikipedia.org — Treaty of Mutual Cooperation and Security between the United States…](https://en.wikipedia.org/wiki/Treaty_of_Mutual_Cooperation_and_Security_between_the_United_States_and_Japan)
- [en.wikipedia.org — Ukraine–United Kingdom relations](https://en.wikipedia.org/wiki/Ukraine%E2%80%93United_Kingdom_relations)
- [en.wikipedia.org — Union State](https://en.wikipedia.org/wiki/Union_State)

#### `world.yaml` — Prix mondiaux et paramètres monde

- [data.imf.org — imf data brief july 1](https://data.imf.org/en/news/imf%20data%20brief%20july%201)
- [lngpriceindex.com](https://lngpriceindex.com/)
- [tradingeconomics.com — commodities](https://tradingeconomics.com/commodities)
- [cnbc.com — fed-rate-decision-september-2026.html](https://www.cnbc.com/2026/09/16/fed-rate-decision-september-2026.html)

### Sources inaccessibles et replis

- Institute for the Study of War (cartes de la ligne de front) : données soumises à consentement, non utilisées ; ligne de front tirée de DeepStateMap (voir `control_zones.geojson` et `docs/DECISIONS.md`, D31).
- Fichiers PDF non lisibles par l'outil de consultation web : lus localement avec pdf.js après téléchargement.
- Identifiants de révision Wikipedia (API limitée en débit) : les pages sont citées par leur URL avec la date de consultation.
- Indice de capital humain de la Banque mondiale absent pour certains pays : repli sur la médiane régionale (voir `data/build/report.md`).
