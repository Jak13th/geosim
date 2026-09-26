/**
 * Catalogue des paramètres (SPEC §6.2) : chaque paramètre est déclaré une seule fois ici,
 * dans l'ordre et avec les identifiants, libellés et types de PARAMETRES.md (vérifié par un test).
 * L'interface est générée à partir de ces déclarations ; le pipeline de données s'en sert pour
 * savoir quoi renseigner et avec quelle source.
 *
 * Source initiale (`source`) : `WB:` Banque mondiale (WDI), `WGI:` gouvernance (Banque mondiale),
 * `IMF:` FMI (WEO, API DataMapper), `OWID:` Our World in Data, `FAO`, `UNHCR`, `UNDP`, `USGS`,
 * `UNGA`, `BACI`, `CUR` donnée curée datée, `HYP` hypothèse, `DER` dérivé, `MAP` carte.
 */
import { categoryByPrefix } from './categories.ts';
import type { ParamDef, ParamKind, ParamValueType, SystemId } from './types.ts';

type Extra = Partial<
  Pick<ParamDef, 'min' | 'max' | 'step' | 'scale' | 'enumValues' | 'components' | 'valueType'>
>;

const KINDS: Record<'I' | 'S' | 'D', ParamKind> = { I: 'input', S: 'state', D: 'derived' };

/**
 * Déclare un paramètre. `range` = [min, max] pour les nombres ; la catégorie et la portée
 * viennent du préfixe de l'identifiant.
 */
function p(
  id: string,
  label: string,
  kind: 'I' | 'S' | 'D',
  unit: string,
  range: readonly [number, number] | null,
  source: string,
  usedBy: readonly SystemId[],
  description: string,
  extra: Extra = {},
): ParamDef {
  const prefix = id.split('.')[0] ?? '';
  const category = categoryByPrefix(prefix);
  if (category === undefined) throw new Error(`Catalogue : préfixe inconnu (${id})`);
  const valueType: ParamValueType = extra.valueType ?? 'number';
  const def: ParamDef = {
    id,
    label,
    category: category.id,
    scope: category.scope,
    kind: KINDS[kind],
    valueType,
    unit,
    source,
    description,
    usedBy,
  };
  if (range !== null) {
    def.min = range[0];
    def.max = range[1];
  }
  if (extra.step !== undefined) def.step = extra.step;
  if (extra.scale !== undefined) def.scale = extra.scale;
  if (extra.enumValues !== undefined) def.enumValues = extra.enumValues;
  if (extra.components !== undefined) def.components = extra.components;
  return def;
}

const LOG = { scale: 'log' } as const;
const enumOf = (...values: string[]): Extra => ({ valueType: 'enum', enumValues: values });
const vectorOf = (...components: string[]): Extra => ({ valueType: 'vector', components });
const LIST: Extra = { valueType: 'list' };
const DATE: Extra = { valueType: 'date' };
const BOOL: Extra = { valueType: 'bool' };
const PCT = [0, 100] as const;
const UNIT = [0, 1] as const;

/** Domaines militaires (SPEC §8.7). */
export const DEFENSE_DOMAINS = [
  'land',
  'air',
  'sea',
  'strike',
  'air_defense',
  'drones',
  'cyber',
  'space',
] as const;
/** Postes de la structure des échanges (SPEC §8.3). */
export const TRADE_SECTORS = [
  'energy',
  'food',
  'minerals',
  'chips',
  'manufactured',
  'services',
] as const;
/** Minerais critiques suivis (PARAMETRES.md, `res.critical_minerals`). */
export const CRITICAL_MINERALS = [
  'rare_earths',
  'lithium',
  'cobalt',
  'nickel',
  'copper',
  'gallium',
  'germanium',
  'graphite',
  'uranium',
] as const;
export const SANCTION_TRACKS = [
  'trade',
  'finance',
  'technology',
  'energy',
  'elites',
  'transport',
] as const;
export const REGIME_TYPES = [
  'democracy',
  'flawed_democracy',
  'hybrid',
  'autocracy',
  'junta',
  'theocracy',
  'absolute_monarchy',
] as const;

// Une ligne par paramètre, dans l'ordre de PARAMETRES.md.
// prettier-ignore
export const CATALOG: readonly ParamDef[] = [
  // 1. Démographie et société
  p('demo.population', 'Population', 'S', 'habitants', [0, 2e9], 'WB:SP.POP.TOTL', ['demography', 'economy', 'military'], 'Population résidente totale (estimation des Nations unies reprise par la Banque mondiale).', LOG),
  p('demo.birth_rate', 'Natalité', 'I', '‰/an', [0, 60], 'WB:SP.DYN.CBRT.IN', ['demography'], 'Naissances vivantes par an pour 1 000 habitants.'),
  p('demo.death_rate', 'Mortalité', 'S', '‰/an', [0, 40], 'WB:SP.DYN.CDRT.IN', ['demography'], 'Décès par an pour 1 000 habitants, hors guerre et catastrophes simulées.'),
  p('demo.fertility', 'Fécondité', 'I', 'enfants/femme', [0.5, 8], 'WB:SP.DYN.TFRT.IN', ['demography'], 'Indicateur conjoncturel de fécondité.', { step: 0.01 }),
  p('demo.life_expectancy', 'Espérance de vie', 'S', 'ans', [30, 95], 'WB:SP.DYN.LE00.IN', ['demography', 'health'], 'Espérance de vie à la naissance.'),
  p('demo.share_0_14', 'Part des 0–14 ans', 'S', '%', [0, 60], 'WB:SP.POP.0014.TO.ZS', ['demography'], 'Part de la population âgée de 0 à 14 ans.'),
  p('demo.share_15_64', 'Part des 15–64 ans', 'S', '%', [30, 85], 'WB:SP.POP.1564.TO.ZS', ['demography', 'economy'], 'Part de la population en âge de travailler.'),
  p('demo.share_65plus', 'Part des 65 ans et plus', 'S', '%', [0, 45], 'WB:SP.POP.65UP.TO.ZS', ['demography', 'budget'], 'Part de la population âgée de 65 ans ou plus.'),
  p('demo.urbanization', 'Urbanisation', 'S', '%', PCT, 'WB:SP.URB.TOTL.IN.ZS', ['demography', 'map'], 'Part de la population vivant en zone urbaine ; sert aussi à répartir la population sur la carte.'),
  p('demo.net_migration', 'Solde migratoire', 'I', '‰/an', [-50, 50], 'WB:SM.POP.NETM', ['demography'], 'Entrées moins sorties de migrants par an, pour 1 000 habitants.'),
  p('demo.migration_openness', 'Ouverture migratoire', 'I', 'indice', PCT, 'HYP', ['demography'], 'Disposition à accueillir des migrants et des réfugiés (politique d’asile, de visas).'),
  p('demo.refugees_hosted', 'Réfugiés accueillis', 'S', 'personnes', [0, 1e8], 'UNHCR', ['demography', 'budget', 'politics'], 'Réfugiés et autres personnes ayant besoin d’une protection internationale présents dans le pays (mandat du HCR ; hors réfugiés palestiniens relevant de l’UNRWA).', LOG),
  p('demo.refugees_abroad', 'Réfugiés originaires du pays', 'S', 'personnes', [0, 1e8], 'UNHCR', ['demography', 'diplomacy'], 'Réfugiés et autres personnes ayant besoin d’une protection internationale originaires du pays, dans le monde.', LOG),
  p('demo.labor_force', 'Population active', 'S', 'personnes', [0, 1e9], 'WB:SL.TLF.TOTL.IN', ['economy', 'military'], 'Personnes en emploi ou en recherche d’emploi (estimation modélisée de l’OIT).', LOG),
  p('demo.manpower', 'Réservoir mobilisable (18–49 ans aptes)', 'D', 'personnes', [0, 1e9], 'DER', ['military'], 'Personnes de 18 à 49 ans aptes au service, calculées depuis la structure par âge.', LOG),
  p('demo.human_capital', 'Capital humain', 'S', 'indice', UNIT, 'WB:HD.HCI.OVRL', ['economy', 'technology'], 'Indice de capital humain de la Banque mondiale : productivité attendue d’un enfant né aujourd’hui, rapportée à une santé et une éducation complètes.', { step: 0.01 }),
  p('demo.ethnic_fractionalization', 'Fragmentation ethnolinguistique', 'I', 'indice', UNIT, 'CUR', ['politics'], 'Probabilité que deux habitants tirés au hasard appartiennent à des groupes ethniques différents (Alesina et al., 2003).', { step: 0.01 }),
  p('demo.religious_fractionalization', 'Fragmentation religieuse', 'I', 'indice', UNIT, 'CUR', ['politics'], 'Probabilité que deux habitants tirés au hasard aient des religions différentes (Alesina et al., 2003).', { step: 0.01 }),
  p('demo.social_cohesion', 'Cohésion sociale', 'S', 'indice', PCT, 'DER', ['politics'], 'Solidité du lien social face aux chocs ; calculée depuis les fragmentations, les inégalités et la polarisation.'),
  p('demo.diaspora_weight', 'Poids et influence de la diaspora', 'I', 'indice', PCT, 'HYP', ['demography', 'diplomacy'], 'Taille et influence politique de la diaspora (attire les réfugiés, pèse sur les relations).'),
  p('demo.hdi', 'Indice de développement humain', 'D', 'indice', UNIT, 'UNDP', ['demography', 'politics'], 'Indice du PNUD (santé, éducation, revenu), initialisé par le rapport sur le développement humain puis recalculé.', { step: 0.001 }),

  // 2. Économie et finances
  p('eco.gdp_nominal', 'PIB nominal', 'S', 'Md$', [0, 1e5], 'IMF:NGDPD', ['economy', 'trade', 'military'], 'Produit intérieur brut en dollars courants (FMI, année en cours ; repli Banque mondiale).', LOG),
  p('eco.gdp_ppp', "PIB en parité de pouvoir d'achat", 'S', 'Md$ internationaux', [0, 1e5], 'WB:NY.GDP.MKTP.PP.CD', ['economy', 'military'], 'PIB en dollars internationaux (parité de pouvoir d’achat) ; sert à corriger le coût des équipements militaires.', LOG),
  p('eco.gdp_per_capita', 'PIB par habitant', 'D', '$', [0, 3e5], 'DER', ['economy', 'politics'], 'PIB nominal divisé par la population.', LOG),
  p('eco.potential_growth', 'Croissance potentielle', 'I', '%/an', [-10, 20], 'IMF:NGDP_RPCH', ['economy'], 'Croissance tendancielle hors chocs : moyenne des projections du FMI à 1–5 ans (repli : moyenne sur 10 ans de la croissance observée).', { step: 0.1 }),
  p('eco.growth', 'Croissance réelle', 'D', '%/an', [-50, 50], 'DER', ['economy', 'politics'], 'Croissance du PIB en volume, calculée chaque mois par le modèle économique.', { step: 0.1 }),
  p('eco.inflation', 'Inflation', 'S', '%/an', [-10, 1000], 'IMF:PCPIPCH', ['economy', 'politics'], 'Hausse annuelle moyenne des prix à la consommation.', { scale: 'log', step: 0.1 }),
  p('eco.inflation_target', "Cible d'inflation", 'I', '%', [0, 10], 'CUR', ['economy'], 'Cible ou fourchette médiane de la banque centrale ; sert d’ancrage aux anticipations.', { step: 0.1 }),
  p('eco.cb_independence', 'Indépendance de la banque centrale', 'I', 'indice', UNIT, 'CUR', ['economy'], 'Indépendance de jure de la banque centrale (0 = aucune, 1 = totale) ; pondère l’ancrage de l’inflation.', { step: 0.01 }),
  p('eco.unemployment', 'Chômage', 'S', '%', [0, 70], 'IMF:LUR', ['economy', 'politics'], 'Part de la population active sans emploi et en recherche d’emploi.', { step: 0.1 }),
  p('eco.public_debt', 'Dette publique brute', 'S', '% PIB', [0, 400], 'IMF:GGXWDG_NGDP', ['economy', 'budget'], 'Dette brute des administrations publiques.', { step: 0.1 }),
  p('eco.debt_maturity', 'Maturité moyenne de la dette', 'I', 'ans', [0.5, 20], 'HYP', ['economy'], 'Durée moyenne de la dette ; règle la vitesse à laquelle le taux moyen suit le taux de marché.', { step: 0.1 }),
  p('eco.foreign_held_debt', "Part de la dette détenue par l'étranger", 'I', '%', PCT, 'HYP', ['economy'], 'Part de la dette publique détenue par des non-résidents : exposition aux sanctions financières et aux fuites de capitaux.'),
  p('eco.sovereign_rate', "Taux d'emprunt souverain", 'D', '%', [-2, 100], 'DER', ['economy', 'budget'], 'Taux de marché de la dette publique : taux directeur mondial + prime de risque − privilège de monnaie de réserve.', { step: 0.01 }),
  p('eco.credit_rating', 'Notation souveraine', 'S', 'cran', [0, 20], 'CUR', ['economy'], 'Notation à long terme en devises (0 = défaut, 20 = AAA), convertie depuis l’échelle de S&P.', { step: 1 }),
  p('eco.reserves', 'Réserves de change (or inclus)', 'S', 'Md$', [0, 5000], 'WB:FI.RES.TOTL.CD', ['economy'], 'Réserves officielles, or compris.', LOG),
  p('eco.reserves_frozen', 'Part des réserves gelées', 'S', '%', PCT, 'CUR', ['economy', 'diplomacy'], 'Part des réserves immobilisées par des sanctions.'),
  p('eco.current_account', 'Solde courant', 'S', '% PIB', [-50, 50], 'IMF:BCA_NGDPD', ['economy', 'trade'], 'Solde des transactions courantes avec le reste du monde.', { step: 0.1 }),
  p('eco.reserve_currency', 'Statut de monnaie de réserve', 'I', 'part', UNIT, 'CUR', ['economy'], 'Part de la monnaie du pays dans les réserves mondiales allouées (COFER du FMI) ; commune à tous les membres d’une union monétaire.', { step: 0.001 }),
  p('eco.exchange_regime', 'Régime de change', 'I', '', null, 'CUR', ['economy'], 'Régime de change de fait (classification du FMI simplifiée).', enumOf('floating', 'managed', 'fixed', 'monetary_union', 'dollarized')),
  p('eco.manufacturing_share', 'Industrie manufacturière', 'S', '% PIB', [0, 50], 'WB:NV.IND.MANF.ZS', ['economy', 'military'], 'Valeur ajoutée manufacturière.', { step: 0.1 }),
  p('eco.agriculture_share', 'Agriculture', 'S', '% PIB', [0, 60], 'WB:NV.AGR.TOTL.ZS', ['economy', 'resources'], 'Valeur ajoutée de l’agriculture, de la sylviculture et de la pêche.', { step: 0.1 }),
  p('eco.resource_rents', 'Rentes des ressources naturelles', 'S', '% PIB', [0, 80], 'WB:NY.GDP.TOTL.RT.ZS', ['economy', 'budget'], 'Rentes totales (pétrole, gaz, charbon, minerais, forêts).', { step: 0.1 }),
  p('eco.oil_rents', 'Rentes pétrolières', 'S', '% PIB', [0, 60], 'WB:NY.GDP.PETR.RT.ZS', ['economy', 'budget', 'markets'], 'Rentes pétrolières (production × (prix − coût)).', { step: 0.1 }),
  p('eco.gas_rents', 'Rentes gazières', 'S', '% PIB', [0, 40], 'WB:NY.GDP.NGAS.RT.ZS', ['economy', 'budget', 'markets'], 'Rentes gazières.', { step: 0.1 }),
  p('eco.gini', 'Inégalités (indice de Gini)', 'I', 'indice', [20, 70], 'WB:SI.POV.GINI', ['politics'], 'Indice de Gini du revenu ou de la consommation (enquêtes auprès des ménages).', { step: 0.1 }),
  p('eco.fdi_inflows', 'Investissements directs étrangers entrants', 'S', '% PIB', [-100, 200], 'WB:BX.KLT.DINV.WD.GD.ZS', ['economy'], 'Entrées nettes d’investissements directs étrangers.', { step: 0.1 }),
  p('eco.remittances', 'Transferts des émigrés reçus', 'S', '% PIB', [0, 70], 'WB:BX.TRF.PWKR.DT.GD.ZS', ['economy'], 'Envois de fonds des travailleurs émigrés.', { step: 0.1 }),
  p('eco.aid_received', 'Aide publique au développement reçue', 'S', '% RNB', [-5, 120], 'WB:DT.ODA.ODAT.GN.ZS', ['economy', 'diplomacy'], 'Aide publique au développement nette reçue.', { step: 0.1 }),
  p('eco.financial_integration', 'Intégration financière (dollar, SWIFT, marchés)', 'I', 'indice', UNIT, 'HYP', ['economy', 'diplomacy'], 'Dépendance au système financier occidental ; amplifie l’effet des sanctions financières.', { step: 0.01 }),
  p('eco.sovereign_fund', 'Fonds souverain', 'S', 'Md$', [0, 3000], 'CUR', ['economy'], 'Actifs des fonds souverains, mobilisables en cas de choc.', LOG),
  p('eco.industrial_capacity', 'Capacité industrielle mobilisable', 'D', 'indice', [0, 1000], 'DER', ['military', 'economy'], 'Capacité industrielle convertible en effort de guerre (valeur ajoutée manufacturière × facteurs).'),
  p('eco.misery_index', 'Indice de misère', 'D', 'points', [0, 1000], 'DER', ['politics'], 'Inflation + chômage.'),

  // 3. Budget de l'État
  p('bud.revenue', 'Recettes publiques', 'I', '% PIB', [0, 120], 'WB:GC.REV.XGRT.GD.ZS', ['budget'], 'Recettes des administrations publiques hors dons (repli : recettes fiscales).', { step: 0.1 }),
  p('bud.tax_efficiency', 'Efficacité de collecte', 'I', 'indice', UNIT, 'DER', ['budget'], 'Part des prélèvements théoriques effectivement collectée ; calculée depuis la corruption et l’efficacité gouvernementale.', { step: 0.01 }),
  p('bud.defense', 'Défense', 'I', '% PIB', [0, 40], 'WB:MS.MIL.XPND.GD.ZS', ['budget', 'military'], 'Dépenses militaires (définition du SIPRI).', { step: 0.1 }),
  p('bud.defense_procurement', "Part de l'équipement et des munitions dans la défense", 'I', '%', [5, 70], 'HYP', ['military'], 'Part du budget de défense consacrée aux équipements et munitions (le reste : personnel, fonctionnement).'),
  p('bud.defense_domains', 'Répartition terre / air / mer / frappes / défense aérienne / drones / cyber / espace', 'I', '% par domaine', PCT, 'HYP', ['military'], 'Répartition des investissements militaires par domaine.', vectorOf(...DEFENSE_DOMAINS)),
  p('bud.social', 'Protection sociale', 'I', '% PIB', [0, 35], 'HYP', ['budget', 'politics'], 'Dépenses publiques de protection sociale (retraites, chômage, famille, assistance).', { step: 0.1 }),
  p('bud.health', 'Santé publique', 'I', '% PIB', [0, 25], 'WB:SH.XPD.GHED.GD.ZS', ['budget', 'health'], 'Dépenses publiques de santé.', { step: 0.1 }),
  p('bud.education', 'Éducation', 'I', '% PIB', [0, 20], 'WB:SE.XPD.TOTL.GD.ZS', ['budget', 'technology'], 'Dépenses publiques d’éducation.', { step: 0.1 }),
  p('bud.rnd', 'R&D publique', 'I', '% PIB', [0, 5], 'HYP', ['budget', 'technology'], 'Dépenses publiques de recherche et développement (part publique de la R&D totale).', { step: 0.01 }),
  p('bud.infrastructure', 'Infrastructures', 'I', '% PIB', [0, 10], 'HYP', ['budget', 'economy'], 'Investissement public dans les infrastructures.', { step: 0.1 }),
  p('bud.subsidies', "Subventions à l'énergie et à l'alimentation", 'I', '% PIB', [0, 15], 'HYP', ['budget', 'politics'], 'Subventions explicites aux prix de l’énergie et de l’alimentation.', { step: 0.1 }),
  p('bud.security', 'Sécurité intérieure et renseignement', 'I', '% PIB', [0, 5], 'HYP', ['budget', 'politics'], 'Police, sécurité intérieure et renseignement.', { step: 0.1 }),
  p('bud.foreign_aid', 'Aide extérieure versée (dont militaire)', 'I', '% RNB', [0, 3], 'CUR', ['budget', 'diplomacy'], 'Aide publique au développement et aide militaire versées.', { step: 0.01 }),
  p('bud.monetization', 'Part du déficit monétisée', 'I', '%', PCT, 'HYP', ['budget', 'economy'], 'Part du déficit financée par création monétaire (source d’inflation).'),
  p('bud.balance', 'Solde budgétaire', 'D', '% PIB', [-60, 60], 'IMF:GGXCNL_NGDP', ['budget', 'economy'], 'Capacité (+) ou besoin (−) de financement des administrations publiques ; initialisé par le FMI puis calculé.', { step: 0.1 }),

  // 4. Commerce et dépendances
  p('trade.exports', 'Exportations', 'S', '% PIB', [0, 200], 'WB:NE.EXP.GNFS.ZS', ['trade', 'economy'], 'Exportations de biens et services.', { step: 0.1 }),
  p('trade.imports', 'Importations', 'S', '% PIB', [0, 200], 'WB:NE.IMP.GNFS.ZS', ['trade', 'economy'], 'Importations de biens et services.', { step: 0.1 }),
  p('trade.composition', 'Structure des échanges (énergie, alimentation, minerais, puces, manufacturés, services)', 'S', '% par poste', PCT, 'BACI', ['trade', 'markets'], 'Répartition des exportations par poste (biens : BACI ; services : Banque mondiale).', vectorOf(...TRADE_SECTORS)),
  p('trade.hightech_exports', 'Exportations de haute technologie', 'S', '% des exportations manufacturières', PCT, 'WB:TX.VAL.TECH.MF.ZS', ['trade', 'technology'], 'Produits à forte intensité de R&D (aéronautique, informatique, pharmacie…).', { step: 0.1 }),
  p('trade.tariff_level', 'Droits de douane moyens', 'I', '%', PCT, 'WB:TM.TAX.MRCH.WM.AR.ZS', ['trade'], 'Droit de douane moyen appliqué, pondéré par les échanges.', { step: 0.1 }),
  p('trade.maritime_share', 'Part du commerce par voie maritime', 'D', '%', PCT, 'MAP', ['trade'], 'Part des échanges qui empruntent une route maritime.'),
  p('trade.sanction_evasion', 'Capacité de contournement des sanctions', 'I', 'indice', UNIT, 'HYP', ['trade', 'diplomacy'], 'Aptitude à réorienter les échanges vers des pays tiers (flottes fantômes, intermédiaires).', { step: 0.01 }),
  p('trade.oil_stocks', 'Stocks stratégiques de pétrole', 'S', 'jours de consommation', [0, 365], 'CUR', ['energy', 'markets'], 'Stocks d’urgence (publics et obligatoires), en jours de consommation ou d’importations nettes.'),
  p('trade.grain_stocks', 'Stocks stratégiques de céréales', 'S', 'jours de consommation', [0, 365], 'HYP', ['resources', 'markets'], 'Réserves de céréales mobilisables.'),
  p('trade.logistics', 'Performance logistique', 'I', 'score', [1, 5], 'WB:LP.LPI.OVRL.XQ', ['trade', 'military'], 'Indice de performance logistique de la Banque mondiale.', { step: 0.01 }),

  // 5. Énergie
  p('energy.primary_consumption', "Consommation d'énergie primaire", 'S', 'TWh/an', [0, 5e4], 'OWID:primary_energy_consumption', ['energy', 'markets'], 'Consommation d’énergie primaire (méthode de substitution).', LOG),
  p('energy.oil_production', 'Production de pétrole', 'S', 'TWh/an', [0, 2e4], 'OWID:oil_production', ['energy', 'markets'], 'Production de pétrole brut et de liquides.', LOG),
  p('energy.oil_consumption', 'Consommation de pétrole', 'S', 'TWh/an', [0, 2e4], 'OWID:oil_consumption', ['energy', 'markets'], 'Consommation de pétrole.', LOG),
  p('energy.gas_production', 'Production de gaz', 'S', 'TWh/an', [0, 2e4], 'OWID:gas_production', ['energy', 'markets'], 'Production de gaz naturel.', LOG),
  p('energy.gas_consumption', 'Consommation de gaz', 'S', 'TWh/an', [0, 2e4], 'OWID:gas_consumption', ['energy', 'markets'], 'Consommation de gaz naturel.', LOG),
  p('energy.coal_production', 'Production de charbon', 'S', 'TWh/an', [0, 3e4], 'OWID:coal_production', ['energy', 'markets'], 'Production de charbon.', LOG),
  p('energy.coal_consumption', 'Consommation de charbon', 'S', 'TWh/an', [0, 3e4], 'OWID:coal_consumption', ['energy', 'markets'], 'Consommation de charbon.', LOG),
  p('energy.nuclear_share_elec', "Part du nucléaire dans l'électricité", 'S', '%', PCT, 'OWID:nuclear_share_elec', ['energy'], 'Part du nucléaire dans la production d’électricité.', { step: 0.1 }),
  p('energy.renewables_share', "Part des renouvelables dans l'énergie", 'S', '%', PCT, 'OWID:renewables_share_energy', ['energy', 'climate'], 'Part des renouvelables dans l’énergie primaire.', { step: 0.1 }),
  p('energy.oil_reserves', 'Réserves prouvées de pétrole', 'I', 'milliards de barils', [0, 400], 'CUR', ['energy', 'markets'], 'Réserves prouvées de pétrole brut.', { step: 0.1 }),
  p('energy.gas_reserves', 'Réserves prouvées de gaz', 'I', 'Tm³', [0, 60], 'CUR', ['energy', 'markets'], 'Réserves prouvées de gaz naturel (milliers de milliards de m³).', { step: 0.01 }),
  p('energy.import_dependence', 'Dépendance énergétique nette', 'D', '%', [-1000, 100], 'DER', ['energy', 'economy'], 'Importations nettes d’énergie / consommation (négatif : exportateur net).'),
  p('energy.intensity', 'Intensité énergétique', 'D', 'kWh/$', [0, 20], 'DER', ['energy'], 'Consommation d’énergie primaire par dollar de PIB.', { step: 0.01 }),
  p('energy.opec_quota', 'Quota OPEP+', 'I', 'Mb/j', [0, 15], 'CUR', ['markets'], 'Production requise par l’accord OPEP+ (pays soumis à quota).', { step: 0.01 }),
  p('energy.spare_capacity', 'Capacité de production inutilisée', 'I', 'Mb/j', [0, 5], 'CUR', ['markets'], 'Capacité de production de pétrole mobilisable en 90 jours.', { step: 0.01 }),
  p('energy.lng_capacity', 'Capacités GNL (liquéfaction, regazéification)', 'I', 'Mt/an', [0, 300], 'CUR', ['energy', 'markets'], 'Capacités nominales de liquéfaction (exportation) et de regazéification (importation).', vectorOf('liquefaction', 'regasification')),
  p('energy.grid_resilience', 'Résilience du réseau électrique', 'I', 'indice', PCT, 'HYP', ['energy', 'combat'], 'Aptitude du réseau à encaisser frappes et sabotages.'),
  p('energy.electricity_access', "Accès à l'électricité", 'S', '%', PCT, 'WB:EG.ELC.ACCS.ZS', ['energy'], 'Part de la population ayant accès à l’électricité.', { step: 0.1 }),

  // 6. Alimentation, eau et ressources
  p('res.arable_land', 'Terres arables', 'I', '% de la surface', PCT, 'WB:AG.LND.ARBL.ZS', ['resources'], 'Terres arables en part de la surface terrestre.', { step: 0.1 }),
  p('res.grain_self_sufficiency', 'Autosuffisance céréalière', 'S', '%', [0, 500], 'FAO:FBS', ['resources', 'markets'], 'Production de céréales / utilisation intérieure (bilans alimentaires de la FAO).'),
  p('res.grain_export_share', 'Part des exportations mondiales de céréales', 'S', '%', PCT, 'FAO:FBS', ['resources', 'markets'], 'Part des exportations mondiales de céréales, en quantité.', { step: 0.01 }),
  p('res.fertilizer_export_share', "Part des exportations mondiales d'engrais", 'S', '%', PCT, 'FAO:RFN', ['resources', 'markets'], 'Part des exportations mondiales d’engrais (azote, phosphate, potasse, en éléments nutritifs).', { step: 0.01 }),
  p('res.food_spending_share', "Part de l'alimentation dans la consommation des ménages", 'I', '%', [0, 80], 'HYP', ['resources', 'politics'], 'Part de l’alimentation dans les dépenses des ménages : sensibilité aux prix alimentaires.'),
  p('res.water_stress', 'Stress hydrique', 'I', '% des ressources prélevées', [0, 5000], 'WB:ER.H2O.FWST.ZS', ['resources', 'climate'], 'Prélèvements d’eau douce en part des ressources disponibles.', LOG),
  p('res.upstream_dependence', "Dépendance aux eaux venant de l'étranger", 'I', 'part', UNIT, 'CUR', ['resources', 'diplomacy'], 'Part des ressources en eau renouvelables venant de l’amont (ratio de dépendance d’AQUASTAT).', { step: 0.01 }),
  p('res.critical_minerals', 'Parts de production et de raffinage (terres rares, lithium, cobalt, nickel, cuivre, gallium, germanium, graphite, uranium)', 'I', '% par minerai', PCT, 'USGS', ['resources', 'markets'], 'Part de la production minière mondiale de chaque minerai critique.', vectorOf(...CRITICAL_MINERALS)),
  p('res.chip_fab_share', 'Part de la fabrication mondiale de puces avancées', 'I', '%', PCT, 'CUR', ['markets', 'technology'], 'Part des capacités mondiales de fabrication de puces avancées (gravure ≤ 10 nm).', { step: 0.1 }),
  p('res.export_restrictions', "Restrictions d'exportation actives (minerais, céréales, énergie)", 'S', 'liste + intensité', null, 'CUR', ['markets', 'trade'], 'Produits soumis à restriction d’exportation, avec leur intensité (0–1).', LIST),

  // 7. Forces armées
  p('mil.budget', 'Budget de défense', 'D', 'Md$', [0, 2000], 'WB:MS.MIL.XPND.CD', ['military'], 'Dépenses militaires en dollars courants ; initialisées par le SIPRI puis calculées (PIB × part défense).', LOG),
  p('mil.active', "Militaires d'active", 'S', 'personnes', [0, 5e6], 'CUR', ['military', 'combat'], 'Effectifs d’active (IISS, The Military Balance).', LOG),
  p('mil.reserves', 'Réservistes', 'S', 'personnes', [0, 2e7], 'CUR', ['military'], 'Réserves militaires.', LOG),
  p('mil.paramilitary', 'Paramilitaires', 'S', 'personnes', [0, 1e7], 'CUR', ['military', 'politics'], 'Forces paramilitaires (gendarmeries, gardes nationales, garde-frontières).', LOG),
  p('mil.conscription', 'Conscription', 'I', '', null, 'CUR', ['military'], 'Régime de service militaire.', enumOf('none', 'selective', 'universal')),
  p('mil.mobilization', 'Niveau de mobilisation', 'S', '%', PCT, 'CUR', ['military', 'economy'], 'Part du réservoir mobilisable effectivement mobilisée (0 hors conflit).'),
  p('mil.capital_land', 'Capital terrestre (blindés, artillerie, génie)', 'S', 'unités-équivalent', [0, 1e6], 'DER', ['military', 'combat'], 'Stock d’équipements terrestres, par inventaire permanent des dépenses d’équipement.', LOG),
  p('mil.capital_air', 'Capital aérien (chasse, bombardement, transport, ravitaillement, détection aéroportée)', 'S', 'unités-équivalent', [0, 1e6], 'DER', ['military', 'combat'], 'Stock d’équipements aériens, par inventaire permanent.', LOG),
  p('mil.capital_naval', 'Capital naval (surface, sous-marins, amphibie)', 'S', 'tonnage-équivalent', [0, 1e7], 'DER', ['military', 'combat'], 'Stock d’équipements navals, par inventaire permanent.', LOG),
  p('mil.strike_stock', 'Frappes longue portée conventionnelles (missiles de croisière et balistiques)', 'S', 'missiles', [0, 1e5], 'HYP', ['military', 'combat'], 'Stock de missiles conventionnels à longue portée.', LOG),
  p('mil.air_defense', 'Défense aérienne et antimissile', 'S', 'indice + intercepteurs', null, 'HYP', ['military', 'combat'], 'Qualité de la défense aérienne (0–100) et stock d’intercepteurs.', vectorOf('index', 'interceptors')),
  p('mil.drones', 'Drones (reconnaissance, attaque, munitions rôdeuses)', 'S', 'indice + production/mois', null, 'HYP', ['military', 'combat'], 'Capacité en drones (0–100) et production mensuelle.', vectorOf('index', 'monthly_production')),
  p('mil.carriers', 'Porte-avions et porte-aéronefs', 'S', 'nombre', [0, 20], 'CUR', ['military', 'combat'], 'Porte-avions et porte-aéronefs en service.', { step: 1 }),
  p('mil.attack_submarines', "Sous-marins d'attaque", 'S', 'nombre', [0, 100], 'CUR', ['military', 'combat'], 'Sous-marins d’attaque (nucléaires et classiques) en service.', { step: 1 }),
  p('mil.fighters_5gen', 'Chasseurs de 5e génération', 'S', 'nombre', [0, 2000], 'CUR', ['military', 'combat'], 'Chasseurs furtifs de cinquième génération en service.', { step: 1 }),
  p('mil.amphibious_lift', 'Capacité amphibie', 'I', 'brigades transportables', [0, 20], 'CUR', ['military', 'combat'], 'Brigades débarquables simultanément.', { step: 0.1 }),
  p('mil.strategic_lift', 'Transport stratégique (air, mer)', 'I', 'indice', PCT, 'HYP', ['military'], 'Aptitude à projeter des forces à distance.'),
  p('mil.munitions_stock', 'Stocks de munitions', 'S', 'jours de combat intense', [0, 365], 'HYP', ['military', 'combat'], 'Stocks de munitions en jours de combat de haute intensité.'),
  p('mil.defense_industry', "Capacité de l'industrie de défense (obus, missiles, drones, blindés)", 'I', 'unités/mois par type', null, 'HYP', ['military'], 'Production mensuelle de l’industrie de défense.', vectorOf('shells', 'missiles', 'drones', 'armored')),
  p('mil.ramp_up_time', 'Délai de montée en cadence industrielle', 'I', 'mois', [1, 36], 'HYP', ['military'], 'Délai pour doubler la production de défense.'),
  p('mil.arms_self_sufficiency', "Autonomie d'armement", 'I', 'indice', UNIT, 'DER', ['military'], 'Aptitude à produire ses propres armements : exportations / (importations + exportations) d’armes (indicateurs TIV du SIPRI).', { step: 0.01 }),
  p('mil.quality', 'Qualité (entraînement, commandement, maintenance)', 'I', 'multiplicateur', [0.3, 1.5], 'HYP', ['military', 'combat'], 'Multiplicateur d’efficacité des forces.', { step: 0.01 }),
  p('mil.combat_experience', 'Expérience de combat récente', 'S', 'indice', UNIT, 'CUR', ['military', 'combat'], 'Expérience acquise dans des combats récents (0 = aucune).', { step: 0.01 }),
  p('mil.morale', 'Moral', 'S', 'indice', PCT, 'DER', ['military', 'combat'], 'Moral des troupes, calculé depuis les pertes, les succès et le soutien à la guerre.'),
  p('mil.logistics', 'Logistique et projection', 'I', 'indice', PCT, 'HYP', ['military', 'combat'], 'Qualité de la logistique militaire (ravitaillement, maintenance, transport).'),
  p('mil.doctrine', 'Doctrine', 'I', '', null, 'HYP', ['military', 'ai'], 'Doctrine militaire dominante.', enumOf('defensive', 'offensive', 'asymmetric', 'expeditionary')),
  p('mil.overseas_bases', "Bases à l'étranger", 'I', 'liste des pays hôtes', null, 'CUR', ['military', 'diplomacy'], 'Pays hôtes de bases ou de déploiements permanents.', LIST),
  p('mil.allocation', 'Répartition des forces (fronts, garnisons, défense, missions)', 'S', '% par théâtre', PCT, 'DER', ['military', 'combat', 'ai'], 'Répartition des forces entre théâtres, décidée par l’IA ou le joueur.', vectorOf('fronts', 'garrisons', 'home_defense', 'missions')),
  p('mil.power_index', 'Indice de puissance militaire', 'D', 'indice', [0, 1000], 'DER', ['ai'], 'Indice synthétique, utilisé pour l’affichage et l’IA, jamais pour résoudre un combat.'),

  // 8. Nucléaire, missiles, cyber et espace
  p('strat.warheads_total', 'Ogives nucléaires (stock militaire)', 'S', 'ogives', [0, 10000], 'CUR', ['nuclear'], 'Stock militaire d’ogives nucléaires (déployées et en réserve, hors ogives en attente de démantèlement).', { step: 1 }),
  p('strat.warheads_deployed', 'Ogives déployées', 'S', 'ogives', [0, 5000], 'CUR', ['nuclear'], 'Ogives déployées sur des vecteurs ou dans des bases opérationnelles.', { step: 1 }),
  p('strat.delivery', 'Vecteurs (sol fixe, sol mobile, sous-marins, bombardiers)', 'S', 'nombre par type', null, 'CUR', ['nuclear'], 'Vecteurs nucléaires par type.', vectorOf('silo', 'mobile', 'submarine', 'bomber')),
  p('strat.second_strike', 'Capacité de seconde frappe', 'D', 'indice', UNIT, 'DER', ['nuclear'], 'Probabilité qu’une riposte survive à une première frappe (sous-marins, mobilité, dispersion).', { step: 0.01 }),
  p('strat.doctrine', 'Doctrine nucléaire déclarée', 'I', '', null, 'CUR', ['nuclear', 'ai'], 'Doctrine d’emploi déclarée.', enumOf('no_first_use', 'ambiguous', 'first_use_possible')),
  p('strat.alert_level', "Niveau d'alerte", 'S', 'niveau', [1, 5], 'DER', ['nuclear'], 'Niveau d’alerte des forces nucléaires (1 normal – 5 imminent).', { step: 1 }),
  p('strat.umbrella_from', 'Protégé par le parapluie nucléaire de', 'I', 'liste', null, 'CUR', ['nuclear', 'diplomacy'], 'Puissances nucléaires dont la dissuasion couvre le pays.', LIST),
  p('strat.program_progress', "Avancement d'un programme nucléaire", 'S', '%', PCT, 'CUR', ['nuclear'], 'Avancement vers une arme nucléaire (100 = arme opérationnelle).'),
  p('strat.missile_defense', 'Défense antimissile balistique', 'I', 'indice', PCT, 'HYP', ['nuclear', 'combat'], 'Capacité d’interception des missiles balistiques.'),
  p('strat.hypersonic', 'Capacité hypersonique', 'I', 'indice', UNIT, 'CUR', ['nuclear', 'combat'], 'Maîtrise opérationnelle d’armes hypersoniques (0 = aucune, 1 = en service).', { step: 0.1 }),
  p('strat.cyber_offense', 'Cyber offensif', 'I', 'indice', PCT, 'HYP', ['cyber'], 'Capacités cyber offensives.'),
  p('strat.cyber_defense', 'Cyber défensif', 'I', 'indice', PCT, 'HYP', ['cyber'], 'Capacités cyber défensives.'),
  p('strat.space', 'Capacité spatiale (satellites, lanceurs, armes antisatellites)', 'I', 'indice', PCT, 'HYP', ['space'], 'Capacités spatiales militaires et civiles.'),
  p('strat.intelligence', 'Qualité du renseignement', 'I', 'indice', PCT, 'HYP', ['ai', 'combat'], 'Qualité du renseignement ; réduit le brouillard de perception de l’IA.'),

  // 9. Politique intérieure
  p('pol.electoral_democracy', 'Démocratie électorale', 'I', 'indice', UNIT, 'OWID:vdem_electdem', ['politics'], 'Indice de démocratie électorale de V-Dem.', { step: 0.001 }),
  p('pol.liberal_democracy', 'Démocratie libérale', 'I', 'indice', UNIT, 'OWID:vdem_libdem', ['politics'], 'Indice de démocratie libérale de V-Dem.', { step: 0.001 }),
  p('pol.regime_type', 'Type de régime', 'I', '', null, 'OWID:vdem_row', ['politics', 'diplomacy', 'ai'], 'Type de régime : Regimes of the World (V-Dem) complété par les cas curés (juntes, théocraties, monarchies absolues).', enumOf(...REGIME_TYPES)),
  p('pol.stability', 'Stabilité politique', 'S', 'indice', PCT, 'WGI:GOV_WGI_PV.EST', ['politics'], 'Stabilité politique et absence de violence (WGI, rééchelonné de [−2,5 ; 2,5] vers [0 ; 100]).'),
  p('pol.gov_effectiveness', 'Efficacité gouvernementale', 'I', 'indice', PCT, 'WGI:GOV_WGI_GE.EST', ['politics', 'budget'], 'Qualité des services publics et de l’administration (WGI, rééchelonné).'),
  p('pol.rule_of_law', 'État de droit', 'I', 'indice', PCT, 'WGI:GOV_WGI_RL.EST', ['politics', 'economy'], 'Respect des règles, des contrats et des droits de propriété (WGI, rééchelonné).'),
  p('pol.corruption_control', 'Contrôle de la corruption', 'I', 'indice', PCT, 'WGI:GOV_WGI_CC.EST', ['politics', 'budget', 'military'], 'Contrôle de la corruption (WGI, rééchelonné).'),
  p('pol.voice_accountability', 'Libertés et responsabilité', 'I', 'indice', PCT, 'WGI:GOV_WGI_VA.EST', ['politics'], 'Libertés d’expression, d’association et élections libres (WGI, rééchelonné).'),
  p('pol.approval', 'Soutien au gouvernement', 'S', '%', PCT, 'HYP', ['politics'], 'Approbation du gouvernement en place.'),
  p('pol.legitimacy', 'Légitimité du régime', 'S', 'indice', PCT, 'DER', ['politics'], 'Légitimité perçue du régime (démocratique, économique, nationaliste).'),
  p('pol.repression_capacity', 'Capacité répressive', 'I', 'indice', PCT, 'HYP', ['politics'], 'Capacité à réprimer une contestation (forces de sécurité, surveillance).'),
  p('pol.information_control', "Contrôle de l'information et propagande", 'I', 'indice', PCT, 'CUR', ['politics'], 'Contrôle des médias et de l’information (classement mondial de la liberté de la presse, inversé).'),
  p('pol.polarization', 'Polarisation', 'I', 'indice', PCT, 'OWID:vdem_polarization', ['politics'], 'Polarisation de la société en camps antagonistes (V-Dem, rééchelonné de [0 ; 4] vers [0 ; 100]).'),
  p('pol.military_loyalty', "Loyauté de l'armée envers le pouvoir", 'I', 'indice', PCT, 'HYP', ['politics'], 'Loyauté de l’armée ; faible, elle augmente le risque de coup d’État.'),
  p('pol.nationalism', 'Nationalisme', 'I', 'indice', PCT, 'HYP', ['politics', 'ai'], 'Intensité du sentiment nationaliste.'),
  p('pol.casualty_tolerance', 'Tolérance aux pertes', 'I', 'indice', PCT, 'HYP', ['politics', 'combat'], 'Pertes militaires acceptées avant que le soutien à la guerre ne chute.'),
  p('pol.war_support', 'Soutien à chaque guerre en cours', 'S', '%', PCT, 'DER', ['politics'], 'Soutien de l’opinion à chaque guerre en cours.', { valueType: 'vector' }),
  p('pol.next_election', 'Prochaine élection nationale', 'I', 'date', null, 'CUR', ['politics'], 'Date de la prochaine élection nationale décisive (exécutif ou législatif).', DATE),
  p('pol.leader_tenure', 'Ancienneté du pouvoir en place', 'S', 'années', [0, 80], 'CUR', ['politics'], 'Années écoulées depuis l’arrivée au pouvoir du gouvernement ou du régime en place.', { step: 0.1 }),
  p('pol.succession_risk', 'Risque de succession non planifiée', 'I', '%/an', PCT, 'HYP', ['politics', 'events'], 'Probabilité annuelle d’une succession non planifiée.', { step: 0.1 }),
  p('pol.coup_risk', "Risque de coup d'État", 'D', '%/an', PCT, 'DER', ['politics'], 'Probabilité annuelle de coup d’État, calculée.', { step: 0.1 }),
  p('pol.insurgency', 'Insurrections et conflits internes', 'S', 'intensité', PCT, 'CUR', ['politics', 'economy'], 'Intensité des insurrections et conflits internes.'),
  p('pol.interference_vulnerability', "Vulnérabilité à l'ingérence étrangère", 'I', 'indice', PCT, 'HYP', ['politics', 'cyber'], 'Exposition à l’ingérence étrangère (désinformation, financement, corruption).'),

  // 10. Diplomatie et positionnement
  p('dip.alignment', "Position sur l'axe d'alignement international", 'S', 'indice', [-100, 100], 'UNGA', ['diplomacy'], 'Point idéal des votes à l’Assemblée générale de l’ONU (Bailey, Strezhnev et Voeten), rééchelonné (+ : proche des positions occidentales).'),
  p('dip.memberships', 'Appartenances (blocs, organisations)', 'S', 'liste', null, 'CUR', ['diplomacy', 'trade'], 'Blocs et organisations dont le pays est membre (blocs.yaml).', LIST),
  p('dip.unsc_seat', 'Siège au Conseil de sécurité', 'S', '', null, 'CUR', ['diplomacy'], 'Siège au Conseil de sécurité des Nations unies.', enumOf('permanent', 'elected', 'none')),
  p('dip.recognition', 'Reconnaissance internationale (entités de facto)', 'S', 'liste des États qui reconnaissent', null, 'CUR', ['diplomacy'], 'États membres de l’ONU qui reconnaissent l’entité (entités de facto).', LIST),
  p('dip.neutrality', 'Tradition de neutralité', 'I', 'indice', UNIT, 'CUR', ['diplomacy', 'ai'], 'Neutralité constitutionnelle ou traditionnelle (0 = aucune).', { step: 0.1 }),
  p('dip.soft_power', 'Soft power', 'I', 'indice', PCT, 'HYP', ['diplomacy'], 'Influence culturelle et diplomatique.'),
  p('dip.commitment_credibility', 'Crédibilité de ses engagements', 'S', 'indice', UNIT, 'HYP', ['diplomacy'], 'Crédibilité des engagements, mise à jour par l’historique des actes.', { step: 0.01 }),
  p('dip.mediation_capacity', 'Capacité de médiation', 'I', 'indice', PCT, 'HYP', ['diplomacy'], 'Aptitude à servir de médiateur.'),
  p('dip.aid_given', 'Aide versée', 'D', 'Md$/an', [0, 200], 'DER', ['diplomacy'], 'Aide versée (bud.foreign_aid × RNB).', { step: 0.01 }),
  p('dip.debt_leverage', "Créances sur d'autres États (levier)", 'S', 'Md$ par débiteur', null, 'HYP', ['diplomacy', 'economy'], 'Prêts bilatéraux aux autres États, source de levier.', { valueType: 'vector' }),

  // 11. Technologie et information
  p('tech.level', 'Niveau technologique général', 'S', 'indice', PCT, 'DER', ['technology', 'economy', 'military'], 'Niveau technologique, calculé depuis la R&D, le capital humain et la haute technologie.'),
  p('tech.ai_compute', 'IA et capacité de calcul', 'S', 'indice', PCT, 'HYP', ['technology'], 'Capacités en intelligence artificielle et en calcul.'),
  p('tech.semiconductors', 'Autonomie en semi-conducteurs', 'S', 'indice', PCT, 'CUR', ['technology', 'markets'], 'Aptitude à produire les puces dont le pays a besoin.'),
  p('tech.rnd_total', 'R&D totale', 'I', '% PIB', [0, 8], 'WB:GB.XPD.RSDV.GD.ZS', ['technology'], 'Dépense intérieure de recherche et développement.', { step: 0.01 }),
  p('tech.internet_users', 'Internautes', 'S', '%', PCT, 'WB:IT.NET.USER.ZS', ['technology', 'cyber'], 'Part de la population utilisant internet.', { step: 0.1 }),
  p('tech.export_control_exposure', "Exposition aux contrôles à l'export", 'S', 'indice', UNIT, 'CUR', ['technology'], 'Exposition aux contrôles à l’exportation de technologies (0 = aucune).', { step: 0.01 }),
  p('tech.info_warfare', 'Capacité de guerre informationnelle', 'I', 'indice', PCT, 'HYP', ['politics', 'cyber'], 'Capacité d’influence et de désinformation à l’étranger.'),

  // 12. Géographie et infrastructures
  p('geo.area_controlled', 'Superficie contrôlée (de facto)', 'D', 'km²', [0, 2e7], 'MAP', ['map', 'combat'], 'Surface des pixels contrôlés.', LOG),
  p('geo.area_sovereign', 'Superficie souveraine (de jure)', 'D', 'km²', [0, 2e7], 'MAP', ['map', 'diplomacy'], 'Surface des pixels sous souveraineté de jure.', LOG),
  p('geo.coastline', 'Façade maritime', 'D', 'km', [0, 3e5], 'MAP', ['map', 'combat'], 'Longueur de la côte à l’échelle de la carte.', LOG),
  p('geo.landlocked', 'Enclavé', 'D', '', null, 'MAP', ['map', 'trade'], 'Sans façade sur l’océan mondial.', BOOL),
  p('geo.terrain_mix', 'Répartition des terrains et biomes', 'D', '%', PCT, 'MAP', ['map', 'combat'], 'Répartition des pixels contrôlés par terrain et par biome.', { valueType: 'vector' }),
  p('geo.strategic_depth', 'Profondeur stratégique', 'D', 'km', [0, 1e4], 'MAP', ['combat', 'ai'], 'Distance de la capitale à la frontière hostile la plus proche.'),
  p('geo.capital', 'Capitale et capitale de repli', 'I', 'pixel', null, 'MAP', ['map', 'combat'], 'Pixels de la capitale et de la capitale de repli.', vectorOf('capital', 'fallback')),
  p('geo.infrastructure', 'Qualité des infrastructures', 'I', 'indice', PCT, 'DER', ['combat', 'economy'], 'Qualité des infrastructures de transport (densité de routes et de rail, performance logistique).'),
  p('geo.chokepoints', 'Détroits contrôlés ou riverains', 'D', 'liste', null, 'MAP', ['trade', 'combat'], 'Détroits et passages dont le pays est riverain.', LIST),

  // 13. Santé, climat et risques
  p('risk.health_spending', 'Dépenses de santé', 'S', '% PIB', [0, 30], 'WB:SH.XPD.CHEX.GD.ZS', ['health'], 'Dépense courante de santé (publique et privée).', { step: 0.1 }),
  p('risk.hospital_beds', "Lits d'hôpital", 'S', 'pour 1 000 habitants', [0, 25], 'WB:SH.MED.BEDS.ZS', ['health'], 'Lits d’hôpital pour 1 000 habitants.', { step: 0.1 }),
  p('risk.pandemic_preparedness', 'Préparation aux pandémies', 'I', 'indice', PCT, 'HYP', ['health'], 'Préparation aux épidémies (surveillance, capacités, réponse).'),
  p('risk.seismic_exposure', 'Exposition sismique', 'I', 'indice', UNIT, 'HYP', ['events'], 'Exposition du territoire aux séismes.', { step: 0.01 }),
  p('risk.climate_vulnerability', 'Vulnérabilité climatique', 'I', 'indice', PCT, 'HYP', ['climate', 'events'], 'Vulnérabilité au changement climatique.'),
  p('risk.low_coast_population', 'Population en zone côtière basse', 'I', '%', PCT, 'WB:EN.POP.EL5M.ZS', ['climate'], 'Population vivant à moins de 5 m d’altitude.', { step: 0.1 }),
  p('risk.disaster_resilience', 'Résilience aux catastrophes', 'I', 'indice', PCT, 'HYP', ['events'], 'Aptitude à limiter et réparer les dégâts des catastrophes.'),

  // 14. Profil décisionnel (IA) — hypothèses sur des gouvernements, validées par l'utilisateur.
  p('ai.aggressiveness', 'Agressivité', 'I', 'indice', PCT, 'HYP', ['ai'], 'Propension à recourir à la force ou à la menace.'),
  p('ai.risk_aversion', 'Aversion au risque', 'I', 'indice', PCT, 'HYP', ['ai'], 'Poids donné aux risques des actions.'),
  p('ai.time_horizon', 'Horizon temporel', 'I', 'mois', [1, 120], 'HYP', ['ai'], 'Horizon sur lequel le gouvernement évalue ses décisions.'),
  p('ai.revisionism', 'Révisionnisme (volonté de changer le statu quo)', 'I', 'indice', PCT, 'HYP', ['ai'], 'Volonté de changer l’ordre régional ou mondial.'),
  p('ai.expansionism', 'Appétit territorial', 'I', 'indice', PCT, 'HYP', ['ai'], 'Désir d’acquérir des territoires.'),
  p('ai.ideology_weight', "Poids de l'idéologie face au pragmatisme", 'I', 'indice', PCT, 'HYP', ['ai'], 'Poids de l’idéologie dans les choix.'),
  p('ai.regime_survival_weight', 'Priorité à la survie du régime', 'I', 'indice', PCT, 'HYP', ['ai'], 'Poids donné au maintien au pouvoir.'),
  p('ai.economy_weight', "Priorité à l'économie", 'I', 'indice', PCT, 'HYP', ['ai'], 'Poids donné à la prospérité économique.'),
  p('ai.prestige_weight', 'Recherche de statut et de prestige', 'I', 'indice', PCT, 'HYP', ['ai'], 'Poids donné au rang international.'),
  p('ai.alliance_loyalty', 'Loyauté envers les alliés', 'I', 'indice', PCT, 'HYP', ['ai', 'diplomacy'], 'Disposition à honorer ses engagements envers ses alliés.'),
  p('ai.sanction_tolerance', 'Tolérance aux sanctions', 'I', 'indice', PCT, 'HYP', ['ai'], 'Coût économique accepté avant de céder à des sanctions.'),
  p('ai.nuclear_threshold', "Seuil d'emploi nucléaire", 'I', 'indice', PCT, 'HYP', ['ai', 'nuclear'], 'Propension à l’emploi nucléaire (0 = jamais, 100 = seuil bas).'),
  p('ai.misperception', 'Biais de perception (sur- ou sous-estimation de sa propre force)', 'I', '%', [-50, 50], 'HYP', ['ai'], 'Biais d’estimation de sa propre force (+ : surestimation).'),
  p('ai.unpredictability', 'Imprévisibilité', 'I', 'indice', PCT, 'HYP', ['ai'], 'Part d’aléa dans les décisions.'),
  p('ai.strategic_goals', "Buts stratégiques (zones revendiquées, sphère d'influence, statut)", 'I', 'liste', null, 'HYP', ['ai'], 'Buts stratégiques déclarés ou observés.', LIST),
  p('ai.opposition_profile', "Profil appliqué en cas d'alternance", 'I', 'jeu de valeurs ai.*', null, 'HYP', ['ai', 'politics'], 'Profil qui remplace le profil actuel si l’opposition prend le pouvoir.', { valueType: 'vector' }),
  p('ai.controller', 'Contrôleur', 'I', '', null, 'DER', ['ai'], 'Qui décide pour le pays.', enumOf('ai', 'player', 'llm')),

  // 15. Paramètres bilatéraux (de i vers j)
  p('pair.relation', 'Relation', 'S', 'indice', [-100, 100], 'CUR', ['diplomacy', 'ai'], 'Qualité de la relation de i envers j.'),
  p('pair.affinity', 'Affinité structurelle, décomposée en facteurs', 'D', 'indice', [-100, 100], 'DER', ['diplomacy'], 'Relation d’équilibre vers laquelle converge la relation (régimes, blocs, commerce, votes…).'),
  p('pair.trade', 'Exportations de i vers j', 'S', 'Md$/an', [0, 1000], 'BACI', ['trade', 'economy'], 'Exportations de biens (BACI, CEPII).', LOG),
  p('pair.energy_dependence', 'Part des importations énergétiques de i venant de j', 'S', '%', PCT, 'BACI', ['energy', 'trade'], 'Part des importations d’énergie (chapitre 27 du SH) de i en provenance de j.'),
  p('pair.critical_dependence', 'Dépendances critiques (puces, terres rares, céréales, armement)', 'S', '% par produit', PCT, 'BACI', ['trade', 'technology'], 'Part des importations de i venant de j pour les produits critiques.', vectorOf('chips', 'rare_earths', 'grain', 'arms')),
  p('pair.financial_exposure', 'Exposition financière (dette détenue, investissements, réserves déposées)', 'S', 'Md$', [0, 5000], 'HYP', ['economy', 'diplomacy'], 'Actifs de i détenus chez j.', LOG),
  p('pair.treaty', 'Traité', 'S', '', null, 'CUR', ['diplomacy', 'ai'], 'Engagement le plus fort qui lie i à j.', enumOf('none', 'non_aggression', 'partnership', 'mutual_defense')),
  p('pair.treaty_credibility', "Crédibilité perçue de l'engagement", 'S', 'indice', UNIT, 'HYP', ['diplomacy', 'ai'], 'Probabilité perçue que l’engagement soit honoré.', { step: 0.01 }),
  p('pair.sanctions', 'Sanctions de i contre j, par volet (commerce, finance, technologie, énergie, élites, transport)', 'S', '0–1 par volet', UNIT, 'CUR', ['trade', 'economy', 'diplomacy'], 'Intensité des sanctions de i contre j, par volet.', vectorOf(...SANCTION_TRACKS)),
  p('pair.tariffs', 'Droits de douane spécifiques', 'I', '%', [0, 200], 'CUR', ['trade'], 'Droits de douane additionnels de i sur les produits de j.'),
  p('pair.historical_grievance', 'Griefs historiques', 'I', 'indice', PCT, 'HYP', ['diplomacy'], 'Griefs historiques de i envers j.'),
  p('pair.cultural_proximity', 'Proximité culturelle et linguistique', 'I', 'indice', PCT, 'HYP', ['diplomacy', 'trade'], 'Proximité culturelle, linguistique et religieuse.'),
  p('pair.kin_minority', 'Minorité apparentée à i vivant chez j', 'I', '% de la population de j', PCT, 'CUR', ['diplomacy', 'ai'], 'Minorité ethnique apparentée à i vivant dans j.', { step: 0.1 }),
  p('pair.territorial_claim', 'Revendication de i sur j', 'I', 'zones + intensité', null, 'CUR', ['diplomacy', 'ai'], 'Zones de j revendiquées par i, avec l’intensité de la revendication.', LIST),
  p('pair.military_presence', 'Troupes de i stationnées chez j', 'S', 'personnes', [0, 1e6], 'CUR', ['military', 'diplomacy'], 'Militaires de i stationnés dans j.', LOG),
  p('pair.arms_transfers', "Transferts d'armes de i vers j", 'S', 'Md$/an', [0, 100], 'CUR', ['military', 'diplomacy'], 'Transferts d’armes de i vers j.', LOG),
  p('pair.aid', 'Aide de i vers j (humanitaire, économique, militaire)', 'S', 'Md$/an', [0, 100], 'DER', ['diplomacy'], 'Aide de i vers j.', vectorOf('humanitarian', 'economic', 'military')),
  p('pair.border_length', 'Frontière commune', 'D', 'km', [0, 1e4], 'MAP', ['combat', 'diplomacy'], 'Longueur de la frontière terrestre commune.'),
  p('pair.distance', 'Distance (terre, mer)', 'D', 'km', [0, 4e4], 'MAP', ['trade', 'military'], 'Distances entre capitales : orthodromie, voie de terre et route maritime.', vectorOf('great_circle', 'land', 'sea')),
  p('pair.war_state', 'État de la relation', 'S', '', null, 'CUR', ['diplomacy', 'combat', 'ai'], 'État de la relation bilatérale.', enumOf('peace', 'tension', 'crisis', 'blockade', 'war', 'ceasefire')),
  p('pair.recognizes', 'i reconnaît j', 'S', '', null, 'CUR', ['diplomacy'], 'i reconnaît j comme État.', BOOL),
  p('pair.perceived_power', 'Puissance de j telle que perçue par i', 'D', 'indice', [0, 1000], 'DER', ['ai'], 'Puissance de j vue par i à travers le brouillard.'),

  // 16. Paramètres de zone
  p('zone.control', 'Contrôle de facto (occupation, factions)', 'S', 'zones GeoJSON', null, 'CUR', ['map', 'combat'], 'Zones dont le contrôle de facto diffère de la carte de base (control_zones.geojson).', LIST),
  p('zone.claim', 'Revendications terrestres et maritimes', 'I', 'zones + revendiquants', null, 'CUR', ['diplomacy', 'ai'], 'Revendications (claims.geojson, disputes.yaml).', LIST),
  p('zone.separatism', 'Séparatismes et insurrections', 'S', 'zones + intensité', null, 'CUR', ['politics', 'combat'], 'Zones de séparatisme ou d’insurrection et leur intensité (separatism.geojson).', LIST),
  p('zone.fortification', 'Lignes fortifiées, zones démilitarisées, champs de mines', 'S', 'zones + niveau', null, 'CUR', ['combat'], 'Lignes fortifiées et zones démilitarisées (fortifications.geojson).', LIST),
  p('zone.chokepoint_status', 'Statut des détroits', 'S', '', null, 'CUR', ['trade', 'markets', 'combat'], 'Statut de chaque détroit et trafic en % de la normale.', enumOf('open', 'contested', 'closed')),
  p('zone.sea_control', 'Contrôle naval par zone maritime', 'S', 'pays + degré', null, 'DER', ['combat', 'trade'], 'Pays qui contrôle chaque zone maritime, et à quel degré.', LIST),
  p('zone.fallout', 'Contamination radioactive', 'S', 'niveau', [0, 255], 'DER', ['nuclear', 'demography'], 'Niveau de contamination par pixel.'),

  // 17. Paramètres mondiaux
  p('world.oil_price', 'Pétrole (Brent)', 'S', '$/baril', [5, 500], 'CUR', ['markets', 'economy'], 'Prix du Brent.', { step: 0.01 }),
  p('world.gas_price', 'Gaz (Europe, Asie, Amériques)', 'S', '$/MMBtu par zone', [0, 200], 'CUR', ['markets', 'energy'], 'Prix du gaz par zone : TTF (Europe), JKM (Asie), Henry Hub (Amériques).', vectorOf('europe', 'asia', 'americas')),
  p('world.coal_price', 'Charbon', 'S', '$/t', [10, 1000], 'CUR', ['markets'], 'Prix du charbon thermique (Newcastle).', { step: 0.1 }),
  p('world.wheat_price', 'Blé', 'S', '$/t', [50, 1500], 'CUR', ['markets', 'resources'], 'Prix du blé à l’exportation.', { step: 0.1 }),
  p('world.fertilizer_price', 'Engrais', 'S', 'indice', [0, 500], 'CUR', ['markets', 'resources'], 'Indice des prix des engrais de la Banque mondiale (2010 = 100).', { step: 0.1 }),
  p('world.metals_prices', 'Cuivre, lithium, terres rares, uranium', 'S', '$/t (uranium : $/lb)', null, 'CUR', ['markets'], 'Prix des métaux critiques : cuivre, carbonate de lithium, néodyme (terres rares), uranium (U3O8).', vectorOf('copper', 'lithium', 'rare_earths', 'uranium')),
  p('world.chip_supply', 'Offre mondiale de puces avancées', 'S', 'indice', [0, 200], 'DER', ['markets', 'technology'], 'Offre de puces avancées (100 = normale).'),
  p('world.policy_rate', 'Taux directeur de référence mondial', 'I', '%', [-1, 25], 'CUR', ['economy'], 'Taux directeur de la Réserve fédérale (milieu de la fourchette), référence du coût mondial du capital.', { step: 0.01 }),
  p('world.dollar_dominance', 'Domination du dollar', 'I', 'indice', PCT, 'CUR', ['economy', 'diplomacy'], 'Part du dollar dans les réserves de change mondiales allouées (COFER).', { step: 0.1 }),
  p('world.trade_fragmentation', 'Fragmentation commerciale', 'I', 'indice', PCT, 'HYP', ['trade'], 'Degré de fragmentation du commerce mondial en blocs.'),
  p('world.growth', 'Croissance mondiale', 'D', '%', [-20, 20], 'DER', ['economy'], 'Croissance du PIB mondial.', { step: 0.1 }),
  p('world.nuclear_taboo', 'Force du tabou nucléaire', 'S', 'indice', PCT, 'HYP', ['nuclear'], 'Force de la norme de non-emploi.'),
  p('world.escalation', "Niveau d'escalade mondial", 'S', 'indice', PCT, 'DER', ['nuclear', 'ai'], 'Horloge d’escalade mondiale.'),
  p('world.un_effectiveness', "Efficacité de l'ONU et des institutions", 'I', 'indice', PCT, 'HYP', ['diplomacy'], 'Efficacité des institutions multilatérales.'),
  p('world.alliance_credibility', 'Multiplicateur de crédibilité des alliances', 'I', 'multiplicateur', [0, 2], 'HYP', ['diplomacy', 'ai'], 'Multiplicateur global de la crédibilité des traités.', { step: 0.01 }),
  p('world.climate_scenario', 'Scénario climatique', 'I', '', null, 'HYP', ['climate'], 'Trajectoire climatique (GIEC).', enumOf('SSP1-2.6', 'SSP2-4.5', 'SSP3-7.0', 'SSP5-8.5')),
  p('world.pandemic_rate', "Probabilité annuelle d'une pandémie majeure", 'I', '%/an', [0, 50], 'HYP', ['health', 'events'], 'Probabilité annuelle d’une pandémie majeure.', { step: 0.1 }),
  p('world.tech_pace', 'Rythme du progrès technologique (IA)', 'I', 'multiplicateur', [0, 5], 'HYP', ['technology'], 'Multiplicateur du rythme du progrès technologique.', { step: 0.1 }),
  p('world.event_frequency', 'Fréquence des événements aléatoires', 'I', 'multiplicateur', [0, 5], 'HYP', ['events'], 'Multiplicateur global de la fréquence des événements.', { step: 0.1 }),

  // 18. Simulation
  p('sim.seed', 'Graine aléatoire', 'I', 'entier', [0, 4294967295], 'DER', [], 'Graine du générateur aléatoire.', { step: 1 }),
  p('sim.start_date', 'Date de départ', 'I', 'date', null, 'DER', [], 'Date de départ de la simulation (date du build des données).', DATE),
  p('sim.speed', 'Vitesse', 'I', 'jours simulés par seconde', [0, 90], 'DER', [], 'Vitesse de la simulation.'),
  p('sim.realism', 'Réalisme ↔ arcade (règle plusieurs multiplicateurs à la fois)', 'I', 'indice', PCT, 'DER', ['combat', 'ai'], '0 = arcade (rythme OpenFront), 100 = réaliste.'),
  p('sim.conquest_speed', 'Vitesse de conquête', 'I', 'multiplicateur', [0.1, 20], 'DER', ['combat'], 'Multiplicateur de la vitesse de conquête des pixels.', { step: 0.1 }),
  p('sim.ai_aggression', 'Agressivité globale des IA', 'I', 'multiplicateur', [0, 5], 'DER', ['ai'], 'Multiplicateur global de l’agressivité des IA.', { step: 0.1 }),
  p('sim.fog_of_war', 'Brouillard de guerre (perception des IA)', 'I', 'indice', PCT, 'DER', ['ai'], 'Intensité du brouillard de perception des IA.'),
  p('sim.map_resolution', 'Résolution de la carte (au build)', 'I', 'px', null, 'DER', ['map'], 'Largeur de la carte, fixée au build.', enumOf('2048', '4096', '8192')),
  p('sim.pov', 'Point de vue cartographique', 'I', '', null, 'DER', ['map'], 'Frontières de facto (défaut) ; les points de vue par pays viendront avec les variantes Natural Earth.', enumOf('de_facto')),
];

const BY_ID = new Map(CATALOG.map((def) => [def.id, def]));

export function paramById(id: string): ParamDef | undefined {
  return BY_ID.get(id);
}
