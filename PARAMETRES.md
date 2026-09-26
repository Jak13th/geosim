# GeoSim — Catalogue des paramètres

> Source de vérité initiale du schéma des paramètres (`packages/shared/src/params/catalog.ts`).
> **Chaque ligne est modifiable en direct dans l'interface**, pendant que la simulation tourne.
> Les plages sont indicatives : ajuste-les si les données réelles l'exigent, en le notant dans `docs/DECISIONS.md`.

## Conventions

**Type**
- `I` — *input* : levier ou hypothèse ; la simulation ne le change qu'à travers les décisions du pays.
- `S` — *state* : état qui évolue au fil de la simulation ; ma modification remplace l'état courant.
- `D` — *derived* : calculé ; affiché, et verrouillable pour forcer une valeur.

**Source initiale**
- `WB:` Banque mondiale, code WDI · `WGI:` indicateurs de gouvernance de la Banque mondiale · `IMF:` FMI, code WEO (API DataMapper)
- `OWID` Our World in Data · `FAO` FAOSTAT · `USGS` Mineral Commodity Summaries · `UNGA` points idéaux des votes à l'Assemblée générale de l'ONU
- `CUR` donnée curée par recherche web **datée et sourcée** · `HYP` hypothèse à calibrer (valeur par défaut raisonnable, marquée `assumption`)
- `DER` dérivé du modèle · `MAP` calculé depuis la carte

Les codes d'indicateurs sont indicatifs : vérifie-les (certains sont discontinués ou peu couverts) et documente les remplacements. Les indices « 0–100 » sont normalisés.

---

## 1. Démographie et société — `demo.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `demo.population` | Population | habitants · échelle log | S | WB:SP.POP.TOTL |
| `demo.birth_rate` | Natalité | ‰/an · 0–60 | I | WB:SP.DYN.CBRT.IN |
| `demo.death_rate` | Mortalité | ‰/an · 0–40 | S | WB:SP.DYN.CDRT.IN |
| `demo.fertility` | Fécondité | enfants/femme · 0,5–8 | I | WB:SP.DYN.TFRT.IN |
| `demo.life_expectancy` | Espérance de vie | ans · 30–95 | S | WB:SP.DYN.LE00.IN |
| `demo.share_0_14` | Part des 0–14 ans | % · 0–60 | S | WB:SP.POP.0014.TO.ZS |
| `demo.share_15_64` | Part des 15–64 ans | % · 30–85 | S | WB:SP.POP.1564.TO.ZS |
| `demo.share_65plus` | Part des 65 ans et plus | % · 0–45 | S | WB:SP.POP.65UP.TO.ZS |
| `demo.urbanization` | Urbanisation | % · 0–100 | S | WB:SP.URB.TOTL.IN.ZS |
| `demo.net_migration` | Solde migratoire | ‰/an · −50–50 | I | WB:SM.POP.NETM (÷ population) |
| `demo.migration_openness` | Ouverture migratoire | 0–100 | I | HYP |
| `demo.refugees_hosted` | Réfugiés accueillis | personnes | S | UNHCR (API Refugee Data Finder ; `WB:SM.POP.REFG` supprimé, D9) |
| `demo.refugees_abroad` | Réfugiés originaires du pays | personnes | S | UNHCR (API Refugee Data Finder ; `WB:SM.POP.REFG.OR` supprimé, D9) |
| `demo.labor_force` | Population active | personnes | S | WB:SL.TLF.TOTL.IN |
| `demo.manpower` | Réservoir mobilisable (18–49 ans aptes) | personnes | D | DER (structure par âge × aptitude) |
| `demo.human_capital` | Capital humain | indice 0–1 | S | WB:HD.HCI.OVRL (repli : WB:SE.TER.ENRR) |
| `demo.ethnic_fractionalization` | Fragmentation ethnolinguistique | 0–1 | I | CUR (indices académiques publiés) |
| `demo.religious_fractionalization` | Fragmentation religieuse | 0–1 | I | CUR |
| `demo.social_cohesion` | Cohésion sociale | 0–100 | S | DER + HYP |
| `demo.diaspora_weight` | Poids et influence de la diaspora | 0–100 | I | HYP |
| `demo.hdi` | Indice de développement humain | 0–1 | D | DER (initialisation : PNUD, CUR) |

## 2. Économie et finances — `eco.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `eco.gdp_nominal` | PIB nominal | Md$ · échelle log | S | WB:NY.GDP.MKTP.CD / IMF:NGDPD |
| `eco.gdp_ppp` | PIB en parité de pouvoir d'achat | Md$ internationaux · log | S | WB:NY.GDP.MKTP.PP.CD |
| `eco.gdp_per_capita` | PIB par habitant | $ | D | DER |
| `eco.potential_growth` | Croissance potentielle | %/an · −10–20 | S | IMF:NGDP_RPCH (projections à moyen terme) ; repli : moyenne 10 ans de WB:NY.GDP.MKTP.KD.ZG ; converge ensuite vers `eco.long_run_growth` |
| `eco.long_run_growth` | Croissance de long terme | %/an · −10–20 | D | DER (population en âge de travailler, rattrapage, institutions) |
| `eco.growth` | Croissance réelle | %/an | D | DER |
| `eco.output_gap` | Écart de production | % du PIB potentiel · −50–50 | D | DER |
| `eco.inflation` | Inflation | %/an · −10–1000 (log) | S | IMF:PCPIPCH / WB:FP.CPI.TOTL.ZG |
| `eco.inflation_target` | Cible d'inflation | % · 0–10 | I | CUR (défaut 2–4 %) |
| `eco.cb_independence` | Indépendance de la banque centrale | 0–1 | I | CUR (indices publiés) |
| `eco.unemployment` | Chômage | % · 0–70 | S | IMF:LUR / WB:SL.UEM.TOTL.ZS |
| `eco.public_debt` | Dette publique brute | % PIB · 0–400 | S | IMF:GGXWDG_NGDP (repli : WB:GC.DOD.TOTL.GD.ZS) |
| `eco.debt_maturity` | Maturité moyenne de la dette | ans · 0,5–20 | I | HYP (défaut 6) |
| `eco.debt_avg_rate` | Taux moyen apparent de la dette | % · 0–100 | S | WB:GC.XPN.INTP.RV.ZS (intérêts en % des recettes × recettes / dette) |
| `eco.foreign_held_debt` | Part de la dette détenue par l'étranger | % · 0–100 | I | CUR / HYP |
| `eco.sovereign_rate` | Taux d'emprunt souverain | % | D | DER |
| `eco.credit_rating` | Notation souveraine | 0 (défaut) – 20 (AAA) | S | CUR |
| `eco.default_probability` | Probabilité de défaut souverain | %/an · 0–100 | D | DER (notation) |
| `eco.in_default` | Défaut de paiement en cours | oui / non | S | DER (notation initiale) |
| `eco.reserves` | Réserves de change (or inclus) | Md$ | S | WB:FI.RES.TOTL.CD |
| `eco.reserves_frozen` | Part des réserves gelées | % · 0–100 | S | CUR |
| `eco.reserves_months` | Réserves en mois d'importations | mois · 0–240 | D | DER |
| `eco.current_account` | Solde courant | % PIB · −50–50 | S | IMF:BCA_NGDPD / WB:BN.CAB.XOKA.GD.ZS |
| `eco.reserve_currency` | Statut de monnaie de réserve | 0–1 | I | CUR (parts COFER du FMI) |
| `eco.exchange_regime` | Régime de change | flottant / géré / fixe / union monétaire / dollarisé | I | CUR |
| `eco.manufacturing_share` | Industrie manufacturière | % PIB · 0–50 | S | WB:NV.IND.MANF.ZS |
| `eco.agriculture_share` | Agriculture | % PIB · 0–60 | S | WB:NV.AGR.TOTL.ZS |
| `eco.resource_rents` | Rentes des ressources naturelles | % PIB · 0–80 | S | WB:NY.GDP.TOTL.RT.ZS |
| `eco.oil_rents` | Rentes pétrolières | % PIB · 0–60 | S | WB:NY.GDP.PETR.RT.ZS |
| `eco.gas_rents` | Rentes gazières | % PIB · 0–40 | S | WB:NY.GDP.NGAS.RT.ZS |
| `eco.gini` | Inégalités (indice de Gini) | 20–70 | I | WB:SI.POV.GINI |
| `eco.fdi_inflows` | Investissements directs étrangers entrants | % PIB · −100–200 | S | WB:BX.KLT.DINV.WD.GD.ZS |
| `eco.remittances` | Transferts des émigrés reçus | % PIB · 0–70 | S | WB:BX.TRF.PWKR.DT.GD.ZS |
| `eco.aid_received` | Aide publique au développement reçue | % RNB · −5–120 | S | WB:DT.ODA.ODAT.GN.ZS |
| `eco.financial_integration` | Intégration financière (dollar, SWIFT, marchés) | 0–1 | I | HYP |
| `eco.sovereign_fund` | Fonds souverain | Md$ | S | CUR |
| `eco.industrial_capacity` | Capacité industrielle mobilisable | indice | D | DER (WB:NV.IND.MANF.CD × facteurs) |
| `eco.misery_index` | Indice de misère | inflation + chômage | D | DER |

## 3. Budget de l'État (leviers) — `bud.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `bud.revenue` | Recettes publiques | % PIB · 0–120 | I | IMF:rev (administrations publiques ; repli : WB:GC.REV.XGRT.GD.ZS) |
| `bud.tax_efficiency` | Efficacité de collecte | 0–1 | I | DER (corruption, efficacité gouvernementale) |
| `bud.defense` | Défense | % PIB · 0–40 | I | WB:MS.MIL.XPND.GD.ZS |
| `bud.defense_procurement` | Part de l'équipement et des munitions dans la défense | % · 5–70 | I | HYP (défaut 25–35 %) |
| `bud.defense_domains` | Répartition terre / air / mer / frappes / défense aérienne / drones / cyber / espace | % par domaine | I | HYP |
| `bud.social` | Protection sociale | % PIB · 0–35 | I | CUR (OCDE, OIT) / HYP |
| `bud.health` | Santé publique | % PIB · 0–25 | I | WB:SH.XPD.GHED.GD.ZS |
| `bud.education` | Éducation | % PIB · 0–20 | I | WB:SE.XPD.TOTL.GD.ZS |
| `bud.rnd` | R&D publique | % PIB · 0–5 | I | HYP (part publique de WB:GB.XPD.RSDV.GD.ZS) |
| `bud.infrastructure` | Infrastructures | % PIB · 0–10 | I | HYP |
| `bud.subsidies` | Subventions à l'énergie et à l'alimentation | % PIB · 0–15 | I | CUR (FMI) / HYP |
| `bud.security` | Sécurité intérieure et renseignement | % PIB · 0–5 | I | HYP |
| `bud.foreign_aid` | Aide extérieure versée (dont militaire) | % RNB · 0–3 | I | CUR (OCDE-CAD, suivis de l'aide) |
| `bud.monetization` | Part du déficit monétisée | % · 0–100 | I | HYP (défaut 0) |
| `bud.other_spending` | Autres dépenses et écart de calage | % PIB · −60–60 | I | DER (calage sur le solde initial du FMI) |
| `bud.fiscal_adjustment` | Ajustement budgétaire automatique | % PIB · −20–20 | S | DER (règle de réaction à la dette) |
| `bud.interest` | Charge d'intérêts | % PIB · 0–60 | D | DER |
| `bud.balance` | Solde budgétaire | % PIB · −60–60 | D | DER (initialisation : IMF:GGXCNL_NGDP) |

## 4. Commerce et dépendances — `trade.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `trade.exports` | Exportations | % PIB · 0–200 | S | WB:NE.EXP.GNFS.ZS |
| `trade.imports` | Importations | % PIB · 0–200 | S | WB:NE.IMP.GNFS.ZS |
| `trade.composition` | Structure des échanges (énergie, alimentation, minerais, puces, manufacturés, services) | % par poste | S | BACI (biens, HS 2022) + WB:BX.GSR.NFSV.CD (services) |
| `trade.hightech_exports` | Exportations de haute technologie | % des exportations manufacturières | S | WB:TX.VAL.TECH.MF.ZS |
| `trade.tariff_level` | Droits de douane moyens | % · 0–100 | I | WB:TM.TAX.MRCH.WM.AR.ZS |
| `trade.maritime_share` | Part du commerce par voie maritime | % | D | MAP (routes) |
| `trade.sanction_evasion` | Capacité de contournement des sanctions | 0–1 | I | HYP |
| `trade.oil_stocks` | Stocks stratégiques de pétrole | jours de consommation · 0–365 | S | CUR (AIE) |
| `trade.grain_stocks` | Stocks stratégiques de céréales | jours de consommation · 0–365 | S | HYP |
| `trade.logistics` | Performance logistique | 1–5 | I | WB:LP.LPI.OVRL.XQ |

## 5. Énergie — `energy.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `energy.primary_consumption` | Consommation d'énergie primaire | TWh/an | S | OWID (energy dataset) |
| `energy.oil_production` | Production de pétrole | TWh/an | S | OWID |
| `energy.oil_consumption` | Consommation de pétrole | TWh/an | S | OWID |
| `energy.gas_production` | Production de gaz | TWh/an | S | OWID |
| `energy.gas_consumption` | Consommation de gaz | TWh/an | S | OWID |
| `energy.coal_production` | Production de charbon | TWh/an | S | OWID |
| `energy.coal_consumption` | Consommation de charbon | TWh/an | S | OWID |
| `energy.nuclear_share_elec` | Part du nucléaire dans l'électricité | % | S | OWID |
| `energy.renewables_share` | Part des renouvelables dans l'énergie | % | S | OWID |
| `energy.oil_reserves` | Réserves prouvées de pétrole | milliards de barils | I | CUR (Energy Institute, EIA) |
| `energy.gas_reserves` | Réserves prouvées de gaz | Tm³ | I | CUR |
| `energy.import_dependence` | Dépendance énergétique nette | % | D | DER |
| `energy.intensity` | Intensité énergétique | kWh/$ | D | DER |
| `energy.opec_quota` | Quota OPEP+ | Mb/j | I | CUR |
| `energy.spare_capacity` | Capacité de production inutilisée | Mb/j | I | CUR / HYP |
| `energy.lng_capacity` | Capacités GNL (liquéfaction, regazéification) | Mt/an | I | CUR |
| `energy.grid_resilience` | Résilience du réseau électrique | 0–100 | I | HYP |
| `energy.electricity_access` | Accès à l'électricité | % | S | WB:EG.ELC.ACCS.ZS |

## 6. Alimentation, eau et ressources — `res.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `res.arable_land` | Terres arables | % de la surface | I | WB:AG.LND.ARBL.ZS |
| `res.grain_self_sufficiency` | Autosuffisance céréalière | % | S | FAO |
| `res.grain_export_share` | Part des exportations mondiales de céréales | % | S | FAO |
| `res.fertilizer_export_share` | Part des exportations mondiales d'engrais | % | S | FAO / CUR |
| `res.food_spending_share` | Part de l'alimentation dans la consommation des ménages | % | I | CUR / HYP |
| `res.water_stress` | Stress hydrique | % des ressources prélevées | I | WB:ER.H2O.FWST.ZS |
| `res.upstream_dependence` | Dépendance aux eaux venant de l'étranger | 0–1 | I | CUR (FAO AQUASTAT) |
| `res.critical_minerals` | Parts de production et de raffinage (terres rares, lithium, cobalt, nickel, cuivre, gallium, germanium, graphite, uranium) | % par minerai | I | USGS |
| `res.chip_fab_share` | Part de la fabrication mondiale de puces avancées | % | I | CUR |
| `res.export_restrictions` | Restrictions d'exportation actives (minerais, céréales, énergie) | liste + intensité | S | CUR |

## 7. Forces armées — `mil.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `mil.budget` | Budget de défense | Md$ | D | DER (initialisation : WB:MS.MIL.XPND.CD) |
| `mil.active` | Militaires d'active | personnes | S | WB:MS.MIL.TOTL.P1 + CUR |
| `mil.reserves` | Réservistes | personnes | S | CUR |
| `mil.paramilitary` | Paramilitaires | personnes | S | CUR |
| `mil.conscription` | Conscription | aucune / sélective / universelle | I | CUR |
| `mil.mobilization` | Niveau de mobilisation | % · 0–100 | S | CUR (0 hors conflits) |
| `mil.capital_land` | Capital terrestre (blindés, artillerie, génie) | unités-équivalent | S | DER (inventaire permanent) + CUR |
| `mil.capital_air` | Capital aérien (chasse, bombardement, transport, ravitaillement, détection aéroportée) | unités-équivalent | S | DER + CUR |
| `mil.capital_naval` | Capital naval (surface, sous-marins, amphibie) | tonnage-équivalent | S | DER + CUR |
| `mil.strike_stock` | Frappes longue portée conventionnelles (missiles de croisière et balistiques) | stock | S | CUR / HYP |
| `mil.air_defense` | Défense aérienne et antimissile | indice + stock d'intercepteurs | S | CUR / HYP |
| `mil.drones` | Drones (reconnaissance, attaque, munitions rôdeuses) | indice + production/mois | S | CUR / HYP |
| `mil.carriers` | Porte-avions et porte-aéronefs | nombre | S | CUR |
| `mil.attack_submarines` | Sous-marins d'attaque | nombre | S | CUR |
| `mil.fighters_5gen` | Chasseurs de 5e génération | nombre | S | CUR |
| `mil.amphibious_lift` | Capacité amphibie | brigades transportables | I | CUR / HYP |
| `mil.strategic_lift` | Transport stratégique (air, mer) | indice | I | CUR / HYP |
| `mil.munitions_stock` | Stocks de munitions | jours de combat intense | S | HYP |
| `mil.defense_industry` | Capacité de l'industrie de défense (obus, missiles, drones, blindés) | unités/mois par type | I | CUR / HYP |
| `mil.ramp_up_time` | Délai de montée en cadence industrielle | mois · 1–36 | I | HYP |
| `mil.arms_self_sufficiency` | Autonomie d'armement | 0–1 | I | DER (WB:MS.MIL.MPRT.KD / WB:MS.MIL.XPRT.KD) |
| `mil.quality` | Qualité (entraînement, commandement, maintenance) | multiplicateur 0,3–1,5 | I | HYP |
| `mil.combat_experience` | Expérience de combat récente | 0–1 | S | CUR |
| `mil.morale` | Moral | 0–100 | S | DER |
| `mil.logistics` | Logistique et projection | 0–100 | I | CUR / HYP |
| `mil.doctrine` | Doctrine | défensive / offensive / asymétrique / expéditionnaire | I | HYP |
| `mil.overseas_bases` | Bases à l'étranger | liste des pays hôtes | I | CUR |
| `mil.allocation` | Répartition des forces (fronts, garnisons, défense, missions) | % par théâtre | S | IA / joueur |
| `mil.power_index` | Indice de puissance militaire | indice | D | DER (affichage et IA uniquement) |

## 8. Nucléaire, missiles, cyber et espace — `strat.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `strat.warheads_total` | Ogives nucléaires (stock militaire) | nombre | S | CUR (SIPRI Yearbook, FAS ; séries OWID) |
| `strat.warheads_deployed` | Ogives déployées | nombre | S | CUR |
| `strat.delivery` | Vecteurs (sol fixe, sol mobile, sous-marins, bombardiers) | nombre par type | S | CUR |
| `strat.second_strike` | Capacité de seconde frappe | 0–1 | D | DER (sous-marins, mobilité, dispersion) |
| `strat.doctrine` | Doctrine nucléaire déclarée | non-emploi en premier / ambiguë / emploi en premier possible | I | CUR |
| `strat.alert_level` | Niveau d'alerte | 1 (normal) – 5 (imminent) | S | DER |
| `strat.umbrella_from` | Protégé par le parapluie nucléaire de | liste | I | CUR |
| `strat.program_progress` | Avancement d'un programme nucléaire | % · 0–100 | S | CUR / HYP |
| `strat.missile_defense` | Défense antimissile balistique | 0–100 | I | CUR / HYP |
| `strat.hypersonic` | Capacité hypersonique | 0–1 | I | CUR |
| `strat.cyber_offense` | Cyber offensif | 0–100 | I | CUR (indices publics) / HYP |
| `strat.cyber_defense` | Cyber défensif | 0–100 | I | CUR / HYP |
| `strat.space` | Capacité spatiale (satellites, lanceurs, armes antisatellites) | 0–100 | I | CUR / HYP |
| `strat.intelligence` | Qualité du renseignement | 0–100 | I | HYP |

## 9. Politique intérieure — `pol.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `pol.electoral_democracy` | Démocratie électorale | 0–1 | I | OWID (V-Dem) |
| `pol.liberal_democracy` | Démocratie libérale | 0–1 | I | OWID (V-Dem) |
| `pol.regime_type` | Type de régime | démocratie / démocratie imparfaite / régime hybride / autocratie / junte / théocratie / monarchie absolue | I | DER (V-Dem) + CUR |
| `pol.stability` | Stabilité politique | 0–100 | S | WGI:GOV_WGI_PV.EST (rééchelonné, D9) |
| `pol.gov_effectiveness` | Efficacité gouvernementale | 0–100 | I | WGI:GOV_WGI_GE.EST |
| `pol.rule_of_law` | État de droit | 0–100 | I | WGI:GOV_WGI_RL.EST |
| `pol.corruption_control` | Contrôle de la corruption | 0–100 | I | WGI:GOV_WGI_CC.EST |
| `pol.voice_accountability` | Libertés et responsabilité | 0–100 | I | WGI:GOV_WGI_VA.EST |
| `pol.approval` | Soutien au gouvernement | % · 0–100 | S | CUR (sondages, grands pays) / HYP |
| `pol.legitimacy` | Légitimité du régime | 0–100 | S | DER |
| `pol.repression_capacity` | Capacité répressive | 0–100 | I | DER + HYP |
| `pol.information_control` | Contrôle de l'information et propagande | 0–100 | I | CUR (classements de liberté de la presse, inversés) |
| `pol.polarization` | Polarisation | 0–100 | I | OWID (V-Dem) / HYP |
| `pol.military_loyalty` | Loyauté de l'armée envers le pouvoir | 0–100 | I | HYP |
| `pol.nationalism` | Nationalisme | 0–100 | I | HYP |
| `pol.casualty_tolerance` | Tolérance aux pertes | 0–100 | I | DER (régime, nationalisme) + HYP |
| `pol.war_support` | Soutien à chaque guerre en cours | % | S | DER |
| `pol.next_election` | Prochaine élection nationale | date | I | CUR |
| `pol.leader_tenure` | Ancienneté du pouvoir en place | années | S | CUR |
| `pol.succession_risk` | Risque de succession non planifiée | %/an | I | HYP |
| `pol.coup_risk` | Risque de coup d'État | %/an | D | DER |
| `pol.insurgency` | Insurrections et conflits internes | intensité 0–100 | S | CUR (UCDP, ACLED) |
| `pol.interference_vulnerability` | Vulnérabilité à l'ingérence étrangère | 0–100 | I | HYP |

## 10. Diplomatie et positionnement — `dip.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `dip.alignment` | Position sur l'axe d'alignement international | −100 – +100 | S | UNGA (points idéaux) |
| `dip.memberships` | Appartenances (blocs, organisations) | liste | S | CUR |
| `dip.unsc_seat` | Siège au Conseil de sécurité | permanent (veto) / élu / aucun | S | CUR |
| `dip.recognition` | Reconnaissance internationale (entités de facto) | liste des États qui reconnaissent | S | CUR |
| `dip.neutrality` | Tradition de neutralité | 0–1 | I | CUR / HYP |
| `dip.soft_power` | Soft power | 0–100 | I | HYP (indices publics) |
| `dip.commitment_credibility` | Crédibilité de ses engagements | 0–1 | S | HYP, puis DER (historique des actes) |
| `dip.mediation_capacity` | Capacité de médiation | 0–100 | I | HYP |
| `dip.aid_given` | Aide versée | Md$/an | D | DER (`bud.foreign_aid`) |
| `dip.debt_leverage` | Créances sur d'autres États (levier) | Md$ par débiteur | S | CUR / HYP |

## 11. Technologie et information — `tech.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `tech.level` | Niveau technologique général | 0–100 | S | DER (R&D, capital humain, haute technologie) |
| `tech.ai_compute` | IA et capacité de calcul | 0–100 | S | CUR / HYP |
| `tech.semiconductors` | Autonomie en semi-conducteurs | 0–100 | S | CUR |
| `tech.rnd_total` | R&D totale | % PIB · 0–8 | I | WB:GB.XPD.RSDV.GD.ZS |
| `tech.internet_users` | Internautes | % | S | WB:IT.NET.USER.ZS |
| `tech.export_control_exposure` | Exposition aux contrôles à l'export | 0–1 | S | CUR |
| `tech.info_warfare` | Capacité de guerre informationnelle | 0–100 | I | HYP |

## 12. Géographie et infrastructures — `geo.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `geo.area_controlled` | Superficie contrôlée (de facto) | km² | D | MAP |
| `geo.area_sovereign` | Superficie souveraine (de jure) | km² | D | MAP |
| `geo.coastline` | Façade maritime | km | D | MAP |
| `geo.landlocked` | Enclavé | oui / non | D | MAP |
| `geo.terrain_mix` | Répartition des terrains et biomes | % | D | MAP |
| `geo.strategic_depth` | Profondeur stratégique | km (capitale → frontière hostile la plus proche) | D | MAP |
| `geo.capital` | Capitale et capitale de repli | pixel | I | Natural Earth |
| `geo.infrastructure` | Qualité des infrastructures | 0–100 | I | DER (routes et rail Natural Earth + WB:LP.LPI.OVRL.XQ) |
| `geo.chokepoints` | Détroits contrôlés ou riverains | liste | D | MAP + CUR |

## 13. Santé, climat et risques — `risk.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `risk.health_spending` | Dépenses de santé | % PIB · 0–30 | S | WB:SH.XPD.CHEX.GD.ZS |
| `risk.hospital_beds` | Lits d'hôpital | pour 1 000 habitants · 0–25 | S | WB:SH.MED.BEDS.ZS |
| `risk.pandemic_preparedness` | Préparation aux pandémies | 0–100 | I | HYP (indices publics) |
| `risk.seismic_exposure` | Exposition sismique | 0–1 | I | CUR / HYP |
| `risk.climate_vulnerability` | Vulnérabilité climatique | 0–100 | I | CUR (ND-GAIN) |
| `risk.low_coast_population` | Population en zone côtière basse | % | I | CUR / HYP |
| `risk.disaster_resilience` | Résilience aux catastrophes | 0–100 | I | HYP |

## 14. Profil décisionnel (IA) — `ai.*`

Toutes ces valeurs sont des **hypothèses** : Claude Code les propose, avec une justification d'une ligne fondée sur des comportements observables (doctrines publiées, historique récent), et je les valide. Elles décrivent des gouvernements, jamais des personnes.

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `ai.aggressiveness` | Agressivité | 0–100 | I | HYP |
| `ai.risk_aversion` | Aversion au risque | 0–100 | I | HYP |
| `ai.time_horizon` | Horizon temporel | mois · 1–120 | I | HYP |
| `ai.revisionism` | Révisionnisme (volonté de changer le statu quo) | 0–100 | I | HYP |
| `ai.expansionism` | Appétit territorial | 0–100 | I | HYP |
| `ai.ideology_weight` | Poids de l'idéologie face au pragmatisme | 0–100 | I | HYP |
| `ai.regime_survival_weight` | Priorité à la survie du régime | 0–100 | I | HYP |
| `ai.economy_weight` | Priorité à l'économie | 0–100 | I | HYP |
| `ai.prestige_weight` | Recherche de statut et de prestige | 0–100 | I | HYP |
| `ai.alliance_loyalty` | Loyauté envers les alliés | 0–100 | I | HYP |
| `ai.sanction_tolerance` | Tolérance aux sanctions | 0–100 | I | HYP |
| `ai.nuclear_threshold` | Seuil d'emploi nucléaire | 0 (jamais) – 100 (bas) | I | HYP |
| `ai.misperception` | Biais de perception (sur- ou sous-estimation de sa propre force) | −50 – +50 % | I | HYP |
| `ai.unpredictability` | Imprévisibilité | 0–100 | I | HYP |
| `ai.strategic_goals` | Buts stratégiques (zones revendiquées, sphère d'influence, statut) | liste | I | CUR / HYP |
| `ai.opposition_profile` | Profil appliqué en cas d'alternance | jeu de valeurs `ai.*` | I | HYP |
| `ai.controller` | Contrôleur | IA / joueur / modèle de langage | I | — |

## 15. Paramètres bilatéraux (de i vers j) — `pair.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `pair.relation` | Relation | −100 – +100 | S | CUR (paires clés) + modèle d'affinité |
| `pair.affinity` | Affinité structurelle, décomposée en facteurs | −100 – +100 | D | DER |
| `pair.trade` | Exportations de i vers j | Md$/an | S | données bilatérales ouvertes ou modèle de gravité |
| `pair.energy_dependence` | Part des importations énergétiques de i venant de j | % | S | CUR |
| `pair.critical_dependence` | Dépendances critiques (puces, terres rares, céréales, armement) | % par produit | S | BACI (parts des importations) |
| `pair.financial_exposure` | Exposition financière (dette détenue, investissements, réserves déposées) | Md$ | S | CUR / HYP |
| `pair.treaty` | Traité | aucun / non-agression / partenariat / défense mutuelle | S | CUR |
| `pair.treaty_credibility` | Crédibilité perçue de l'engagement | 0–1 | S | HYP, puis DER |
| `pair.sanctions` | Sanctions de i contre j, par volet (commerce, finance, technologie, énergie, élites, transport) | 0–1 par volet | S | CUR |
| `pair.tariffs` | Droits de douane spécifiques | % | I | CUR |
| `pair.historical_grievance` | Griefs historiques | 0–100 | I | HYP |
| `pair.cultural_proximity` | Proximité culturelle et linguistique | 0–100 | I | CUR / HYP |
| `pair.kin_minority` | Minorité apparentée à i vivant chez j | % de la population de j | I | CUR |
| `pair.territorial_claim` | Revendication de i sur j | zones + intensité | I | CUR |
| `pair.military_presence` | Troupes de i stationnées chez j | personnes | S | CUR |
| `pair.arms_transfers` | Transferts d'armes de i vers j | Md$/an | S | CUR (SIPRI) + DER |
| `pair.aid` | Aide de i vers j (humanitaire, économique, militaire) | Md$/an | S | DER |
| `pair.border_length` | Frontière commune | km | D | MAP |
| `pair.distance` | Distance (terre, mer) | km | D | MAP |
| `pair.war_state` | État de la relation | paix / tension / crise / blocus / guerre / cessez-le-feu | S | CUR |
| `pair.recognizes` | i reconnaît j | oui / non | S | CUR |
| `pair.perceived_power` | Puissance de j telle que perçue par i | indice | D | DER (brouillard) |

## 16. Paramètres de zone — `zone.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `zone.control` | Contrôle de facto (occupation, factions) | zones GeoJSON | S | CUR |
| `zone.claim` | Revendications terrestres et maritimes | zones + revendiquants | I | CUR |
| `zone.separatism` | Séparatismes et insurrections | zones + intensité | S | CUR |
| `zone.fortification` | Lignes fortifiées, zones démilitarisées, champs de mines | zones + niveau | S | CUR / DER |
| `zone.chokepoint_status` | Statut des détroits | ouvert / contesté / fermé + trafic en % | S | CUR |
| `zone.sea_control` | Contrôle naval par zone maritime | pays + degré | S | DER |
| `zone.fallout` | Contamination radioactive | niveau | S | DER |

## 17. Paramètres mondiaux — `world.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `world.oil_price` | Pétrole (Brent) | $/baril | S | CUR (marché au jour du build) |
| `world.gas_price` | Gaz (Europe, Asie, Amériques) | $/MMBtu par zone | S | CUR |
| `world.coal_price` | Charbon | $/t | S | CUR |
| `world.wheat_price` | Blé | $/t | S | CUR |
| `world.fertilizer_price` | Engrais | indice | S | CUR |
| `world.metals_prices` | Cuivre, lithium, terres rares, uranium | $/t (uranium : $/lb) | S | CUR |
| `world.chip_supply` | Offre mondiale de puces avancées | indice 100 | S | DER |
| `world.policy_rate` | Taux directeur de référence mondial | % | I | CUR |
| `world.dollar_dominance` | Domination du dollar | 0–100 | I | CUR (COFER) |
| `world.trade_fragmentation` | Fragmentation commerciale | 0–100 | I | HYP |
| `world.growth` | Croissance mondiale | % | D | DER |
| `world.nuclear_taboo` | Force du tabou nucléaire | 0–100 | S | HYP (élevé) |
| `world.escalation` | Niveau d'escalade mondial | 0–100 | S | DER |
| `world.un_effectiveness` | Efficacité de l'ONU et des institutions | 0–100 | I | HYP |
| `world.alliance_credibility` | Multiplicateur de crédibilité des alliances | 0–2 | I | HYP (1) |
| `world.climate_scenario` | Scénario climatique | SSP1-2.6 / SSP2-4.5 / SSP3-7.0 / SSP5-8.5 | I | HYP (SSP2-4.5) |
| `world.pandemic_rate` | Probabilité annuelle d'une pandémie majeure | %/an | I | HYP |
| `world.tech_pace` | Rythme du progrès technologique (IA) | multiplicateur | I | HYP (1) |
| `world.event_frequency` | Fréquence des événements aléatoires | multiplicateur 0–5 | I | HYP (1) |

## 18. Simulation — `sim.*`

| ID | Paramètre | Unité · plage | Type | Source initiale |
|---|---|---|---|---|
| `sim.seed` | Graine aléatoire | entier | I | — |
| `sim.start_date` | Date de départ | date | I | date du build |
| `sim.speed` | Vitesse | jours simulés par seconde | I | — |
| `sim.realism` | Réalisme ↔ arcade (règle plusieurs multiplicateurs à la fois) | 0 (arcade, rythme OpenFront) – 100 (réaliste) | I | 100 |
| `sim.conquest_speed` | Vitesse de conquête | multiplicateur 0,1–20 | I | 1 |
| `sim.ai_aggression` | Agressivité globale des IA | multiplicateur 0–5 | I | 1 |
| `sim.fog_of_war` | Brouillard de guerre (perception des IA) | 0–100 | I | 50 |
| `sim.map_resolution` | Résolution de la carte (au build) | 2048 / 4096 / 8192 | I | 4096 |
| `sim.pov` | Point de vue cartographique | de facto / point de vue d'un pays | I | de facto |

## 19. Coefficients des modèles — `config/model.yaml`

Chaque coefficient a une valeur, une plage, une unité et une description ; tous sont éditables dans l'onglet « Modèle ». Familles attendues :

- `demography.*` : vieillissement ; effets de la guerre, de la famine et des pandémies sur la mortalité ; attractivité migratoire ; capacité d'absorption des réfugiés.
- `economy.*` : élasticités (commerce, énergie, sanctions, guerre, stabilité, dette, investissement, technologie) ; loi d'Okun ; ancrage et transmission de l'inflation ; seuils de dette selon le statut de monnaie de réserve ; primes de risque ; bruit.
- `trade.*` : exposants du modèle de gravité ; bonus de bloc, de langue et de frontière ; pénalité de reroutage ; efficacité du contournement.
- `markets.*` : prix de référence ; élasticités de l'offre et de la demande ; lissage ; arbitrage GNL ; stocks stratégiques.
- `politics.*` : poids des facteurs de stabilité (`a1`…`a12`) ; inertie ; seuils (manifestations, crise, coup, guerre civile) ; ralliement au drapeau (amplitude, demi-vie) ; modèle électoral.
- `diplomacy.*` : poids de l'affinité (`w1`…`w10`) ; vitesse de convergence `κ` ; demi-vie de la mémoire des chocs ; règles de réaction aux agressions.
- `military.*` : dépréciation par domaine ; coûts unitaires ; ajustement de parité de pouvoir d'achat ; délais de formation ; portée logistique.
- `combat.*` : multiplicateurs de terrain et de biome ; bonus urbain ; franchissement de fleuve ; croissance et plafond des fortifications ; seuil de percée ; exposants et coefficients de pertes ; ravitaillement ; saisons ; supériorité aérienne ; contrôle naval ; débarquements.
- `nuclear.*` : coefficients `β` de la décision d'emploi ; rayons par type ; pertes ; décroissance des retombées ; seuil d'« hiver nucléaire ».
- `ai.*` : cadence ; seuil d'action ; inertie ; délais de réutilisation ; profondeur d'anticipation.
- `geo.*` : seuils de relief et de biomes utilisés par le pipeline.
- Probabilités de base des événements : dans `config/events.yaml`.

---

## Ajouter un paramètre

1. Ajouter une ligne dans ce fichier et dans `catalog.ts`.
2. Le lire dans le ou les systèmes concernés, avec un test.
3. Renseigner sa source dans le pipeline ou dans `data/curated/`.
4. L'interface l'affiche automatiquement dans le bon onglet.
