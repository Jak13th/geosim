/**
 * Sources automatisées des données pays (SPEC §5.1), vérifiées le 2026-09-25 (DECISIONS D9, D28).
 * Chaque réponse d'API est mise en cache comme un fichier (data/raw) et tracée dans le manifeste ;
 * la version (date de mise à jour, édition) est relue à l'analyse.
 */
import type { SourceDef } from '../sources.ts';

const WB = {
  provider: 'Banque mondiale — World Development Indicators',
  license: 'CC BY 4.0',
  licenseUrl: 'https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets',
  version: 'API v2',
  ext: 'json',
};

/** Indicateurs WDI utilisés (code → description). */
export const WB_INDICATORS = {
  'SP.POP.TOTL': 'Population totale',
  'SP.DYN.CBRT.IN': 'Natalité (‰)',
  'SP.DYN.CDRT.IN': 'Mortalité (‰)',
  'SP.DYN.TFRT.IN': 'Fécondité',
  'SP.DYN.LE00.IN': 'Espérance de vie',
  'SP.POP.0014.TO.ZS': 'Part des 0–14 ans',
  'SP.POP.1564.TO.ZS': 'Part des 15–64 ans',
  'SP.POP.65UP.TO.ZS': 'Part des 65 ans et plus',
  'SP.URB.TOTL.IN.ZS': 'Urbanisation',
  'SM.POP.NETM': 'Solde migratoire',
  'SL.TLF.TOTL.IN': 'Population active',
  'HD.HCI.OVRL': 'Indice de capital humain',
  'NY.GDP.MKTP.CD': 'PIB ($ courants)',
  'NY.GDP.MKTP.PP.CD': 'PIB (PPA)',
  'NY.GDP.MKTP.KD.ZG': 'Croissance du PIB',
  'NY.GNP.MKTP.CD': 'RNB ($ courants)',
  'FP.CPI.TOTL.ZG': 'Inflation',
  'SL.UEM.TOTL.ZS': 'Chômage (OIT, modélisé)',
  'GC.DOD.TOTL.GD.ZS': 'Dette de l’administration centrale',
  'FI.RES.TOTL.CD': 'Réserves totales, or compris',
  'BN.CAB.XOKA.GD.ZS': 'Solde courant',
  'NV.IND.MANF.ZS': 'Industrie manufacturière',
  'NV.AGR.TOTL.ZS': 'Agriculture',
  'NY.GDP.TOTL.RT.ZS': 'Rentes des ressources naturelles',
  'NY.GDP.PETR.RT.ZS': 'Rentes pétrolières',
  'NY.GDP.NGAS.RT.ZS': 'Rentes gazières',
  'SI.POV.GINI': 'Indice de Gini',
  'BX.KLT.DINV.WD.GD.ZS': 'IDE entrants',
  'BX.TRF.PWKR.DT.GD.ZS': 'Transferts des émigrés',
  'DT.ODA.ODAT.GN.ZS': 'APD reçue',
  'GC.REV.XGRT.GD.ZS': 'Recettes publiques hors dons',
  'GC.XPN.INTP.RV.ZS': 'Intérêts versés (% des recettes)',
  'MS.MIL.XPND.GD.ZS': 'Dépenses militaires (% PIB)',
  'MS.MIL.XPND.CD': 'Dépenses militaires ($ courants)',
  'SH.XPD.GHED.GD.ZS': 'Dépenses publiques de santé',
  'SE.XPD.TOTL.GD.ZS': 'Dépenses publiques d’éducation',
  'GB.XPD.RSDV.GD.ZS': 'R&D',
  'NE.EXP.GNFS.ZS': 'Exportations (% PIB)',
  'NE.IMP.GNFS.ZS': 'Importations (% PIB)',
  'BX.GSR.NFSV.CD': 'Exportations de services (balance des paiements)',
  'BX.GSR.GNFS.CD': 'Exportations de biens et services (balance des paiements)',
  'TX.VAL.TECH.MF.ZS': 'Exportations de haute technologie',
  'TM.TAX.MRCH.WM.AR.ZS': 'Droits de douane moyens pondérés',
  'LP.LPI.OVRL.XQ': 'Indice de performance logistique',
  'EG.ELC.ACCS.ZS': 'Accès à l’électricité',
  'AG.LND.ARBL.ZS': 'Terres arables',
  'ER.H2O.FWST.ZS': 'Stress hydrique',
  'MS.MIL.TOTL.P1': 'Personnel des forces armées',
  'MS.MIL.MPRT.KD': 'Importations d’armes (TIV du SIPRI)',
  'MS.MIL.XPRT.KD': 'Exportations d’armes (TIV du SIPRI)',
  'IT.NET.USER.ZS': 'Internautes',
  'SH.XPD.CHEX.GD.ZS': 'Dépense courante de santé',
  'SH.MED.BEDS.ZS': 'Lits d’hôpital',
  'EN.POP.EL5M.ZS': 'Population sous 5 m d’altitude',
} as const;
export type WbCode = keyof typeof WB_INDICATORS;

/** Indicateurs de gouvernance (WGI, source 3 de l'API ; codes renommés, D9). */
export const WGI_INDICATORS = {
  'GOV_WGI_PV.EST': 'Stabilité politique et absence de violence',
  'GOV_WGI_GE.EST': 'Efficacité gouvernementale',
  'GOV_WGI_RL.EST': 'État de droit',
  'GOV_WGI_CC.EST': 'Contrôle de la corruption',
  'GOV_WGI_VA.EST': 'Voix et responsabilité',
} as const;
export type WgiCode = keyof typeof WGI_INDICATORS;

/** Séries longues (inventaire permanent du capital militaire, phase 5). */
const LONG_SERIES: readonly string[] = ['MS.MIL.XPND.CD', 'MS.MIL.MPRT.KD', 'MS.MIL.XPRT.KD'];

function wbId(code: string): string {
  return `wb_${code.toLowerCase().replace(/\./g, '_')}`;
}

function wbSource(code: string, description: string, wgi: boolean): SourceDef {
  const from = LONG_SERIES.includes(code) ? 2000 : 2010;
  return {
    id: wbId(code),
    url: `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=${from}:2030${wgi ? '&source=3' : ''}`,
    description: `${description} (${code})`,
    ...WB,
    ...(wgi
      ? {
          provider: 'Banque mondiale — Worldwide Governance Indicators',
          licenseUrl: 'https://www.worldbank.org/en/publication/worldwide-governance-indicators',
        }
      : {}),
  };
}

const IMF = {
  provider: 'FMI — World Economic Outlook (API DataMapper)',
  license: 'Conditions d’utilisation du FMI (réutilisation autorisée avec citation)',
  licenseUrl: 'https://www.imf.org/en/About/copyright-and-terms',
  version: 'WEO',
  ext: 'json',
};

export const IMF_INDICATORS = {
  NGDPD: 'PIB ($ courants)',
  NGDP_RPCH: 'Croissance réelle du PIB (observée et projetée)',
  PPPGDP: 'PIB (PPA)',
  PCPIPCH: 'Inflation moyenne',
  LUR: 'Chômage',
  GGXWDG_NGDP: 'Dette publique brute',
  BCA_NGDPD: 'Solde courant',
  GGXCNL_NGDP: 'Solde des administrations publiques',
  LP: 'Population (millions)',
  rev: 'Recettes publiques (Public Finances in Modern History)',
} as const;
export type ImfCode = keyof typeof IMF_INDICATORS;

const OWID = {
  provider: 'Our World in Data',
  license: 'CC BY 4.0 (données tierces : voir chaque série)',
  licenseUrl: 'https://ourworldindata.org/faqs#can-i-use-or-reproduce-your-data',
  version: 'courante',
  ext: 'csv',
};

/** Graphiques OWID (ajouter `.csv` à l'URL du graphique). */
export const OWID_CHARTS = {
  'electoral-democracy-index': 'Indice de démocratie électorale (V-Dem)',
  'liberal-democracy-index': 'Indice de démocratie libérale (V-Dem)',
  'political-regime': 'Regimes of the World (V-Dem)',
  'political-polarization-score': 'Polarisation politique (V-Dem, v2cacamps)',
} as const;
export type OwidChart = keyof typeof OWID_CHARTS;

const FAO = {
  provider: 'FAO — FAOSTAT',
  license: 'CC BY 4.0',
  licenseUrl: 'https://www.fao.org/contact-us/terms/db-terms-of-use/en/',
  version: 'courante',
};

const UNHCR = {
  provider: 'HCR — Refugee Data Finder (API)',
  license: 'CC BY 4.0',
  licenseUrl: 'https://www.unhcr.org/refugee-statistics/methodology/data-licence/',
  version: 'API v1',
  ext: 'json',
};

/** Année des statistiques du HCR (dernière publiée au 2026-09-25 : fin 2025). */
export const UNHCR_YEAR = 2025;

export const COUNTRY_SOURCES: Record<string, SourceDef> = {
  wbCountries: {
    id: 'wb_countries',
    url: 'https://api.worldbank.org/v2/country?format=json&per_page=400',
    description: 'Pays de la Banque mondiale : région, groupe de revenu',
    ...WB,
  },
  wgiCountries: {
    id: 'wb_wgi_countries',
    url: 'https://api.worldbank.org/v2/sources/3/country?format=json&per_page=400',
    description: 'Codes pays de la base WGI (certaines lignes de l’API n’ont pas de code)',
    ...WB,
    provider: 'Banque mondiale — Worldwide Governance Indicators',
  },
  ...Object.fromEntries(
    Object.entries(WB_INDICATORS).map(([code, d]) => [wbId(code), wbSource(code, d, false)]),
  ),
  ...Object.fromEntries(
    Object.entries(WGI_INDICATORS).map(([code, d]) => [wbId(code), wbSource(code, d, true)]),
  ),
  imfIndicators: {
    id: 'imf_indicators',
    url: 'https://www.imf.org/external/datamapper/api/v1/indicators',
    description: 'Liste des indicateurs du FMI, avec l’édition (ex. WEO avril 2026)',
    ...IMF,
  },
  ...Object.fromEntries(
    Object.entries(IMF_INDICATORS).map(([code, d]) => [
      `imf_${code.toLowerCase()}`,
      {
        id: `imf_${code.toLowerCase()}`,
        url: `https://www.imf.org/external/datamapper/api/v1/${code}`,
        description: `${d} (${code})`,
        ...IMF,
      },
    ]),
  ),
  owidEnergy: {
    id: 'owid_energy',
    url: 'https://owid-public.owid.io/data/energy/owid-energy-data.csv',
    description:
      'Énergie : production, consommation, mix (Energy Institute, EIA, Ember), par Our World in Data',
    ...OWID,
  },
  ...Object.fromEntries(
    Object.entries(OWID_CHARTS).map(([slug, d]) => [
      `owid_${slug}`,
      {
        id: `owid_${slug.replace(/-/g, '_')}`,
        url: `https://ourworldindata.org/grapher/${slug}.csv?v=1&csvType=full&useColumnShortNames=true`,
        description: d,
        ...OWID,
        provider: 'V-Dem, par Our World in Data',
      },
    ]),
  ),
  faoFbs: {
    id: 'fao_food_balance_sheets',
    url: 'https://bulks-faostat.fao.org/production/FoodBalanceSheets_E_All_Data_(Normalized).zip',
    description: 'Bilans alimentaires (production, commerce et utilisation des céréales)',
    ...FAO,
  },
  faoFertilizers: {
    id: 'fao_fertilizers_nutrient',
    url: 'https://bulks-faostat.fao.org/production/Inputs_FertilizersNutrient_E_All_Data_(Normalized).zip',
    description: 'Engrais par élément nutritif (production, commerce)',
    ...FAO,
  },
  unhcrAsylum: {
    id: 'unhcr_by_asylum',
    url: `https://api.unhcr.org/population/v1/population/?limit=1000&year=${UNHCR_YEAR}&coa_all=true`,
    description: `Réfugiés et personnes à protéger, par pays d’accueil (${UNHCR_YEAR})`,
    ...UNHCR,
  },
  unhcrOrigin: {
    id: 'unhcr_by_origin',
    url: `https://api.unhcr.org/population/v1/population/?limit=1000&year=${UNHCR_YEAR}&coo_all=true`,
    description: `Réfugiés et personnes à protéger, par pays d’origine (${UNHCR_YEAR})`,
    ...UNHCR,
  },
  baci: {
    id: 'baci_hs22',
    url: 'https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS22_V202601.zip',
    description: 'Commerce bilatéral par produit (SH 2022, 6 chiffres), CEPII',
    provider: 'CEPII — BACI (Gaulier et Zignago, 2010)',
    license: 'Licence ouverte Etalab 2.0',
    licenseUrl: 'https://www.cepii.fr/CEPII/fr/bdd_modele/bdd_modele_item.asp?id=37',
    version: 'V202601',
  },
  unga: {
    id: 'unga_ideal_points',
    url: 'https://dataverse.harvard.edu/api/access/datafile/14098429',
    description:
      'Points idéaux des votes à l’Assemblée générale de l’ONU, 1946-2025 (fichier IdealpointestimatesFP_2026FP.csv)',
    provider: 'Bailey, Strezhnev et Voeten — Harvard Dataverse (doi:10.7910/DVN/LEJUQZ)',
    license: 'CC0 1.0',
    licenseUrl: 'https://doi.org/10.7910/DVN/LEJUQZ',
    version: 'version 39 (2026-07-30)',
    ext: 'csv',
  },
  undpHdi: {
    id: 'undp_hdr25',
    url: 'https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv',
    description: 'Indices composites du Rapport sur le développement humain 2025 (IDH 1990-2023)',
    provider: 'PNUD — Human Development Report Office',
    license: 'CC BY 3.0 IGO',
    licenseUrl: 'https://hdr.undp.org/data-center/documentation-and-downloads',
    version: 'HDR 2025',
  },
};

export function wbSourceId(code: string): string {
  return wbId(code);
}
