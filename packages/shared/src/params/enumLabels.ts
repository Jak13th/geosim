/**
 * Libellés français des valeurs des paramètres catégoriels du catalogue (affichage, légendes).
 * Un test vérifie que chaque valeur de chaque paramètre `enum` a son libellé.
 */
export const ENUM_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'eco.exchange_regime': {
    floating: 'Flottant',
    managed: 'Géré',
    fixed: 'Fixe (ancrage, caisse d’émission)',
    monetary_union: 'Union monétaire',
    dollarized: 'Monnaie étrangère',
  },
  'mil.conscription': { none: 'Aucune', selective: 'Sélective', universal: 'Universelle' },
  'mil.doctrine': {
    defensive: 'Défensive',
    offensive: 'Offensive',
    asymmetric: 'Asymétrique',
    expeditionary: 'Expéditionnaire',
  },
  'strat.doctrine': {
    no_first_use: 'Pas d’emploi en premier',
    ambiguous: 'Ambiguë',
    first_use_possible: 'Emploi en premier possible',
  },
  'pol.regime_type': {
    democracy: 'Démocratie libérale',
    flawed_democracy: 'Démocratie électorale',
    hybrid: 'Autocratie électorale',
    autocracy: 'Autocratie fermée',
    junta: 'Junte militaire',
    theocracy: 'Théocratie',
    absolute_monarchy: 'Monarchie absolue',
  },
  'pol.unrest': {
    calm: 'Calme',
    protests: 'Manifestations',
    crisis: 'Crise politique',
    uprising: 'Soulèvement',
  },
  'dip.unsc_seat': { permanent: 'Membre permanent', elected: 'Membre élu', none: 'Aucun' },
  'ai.controller': { ai: 'IA', player: 'Joueur', llm: 'Modèle de langage' },
  'pair.treaty': {
    none: 'Aucun',
    non_aggression: 'Non-agression',
    partnership: 'Partenariat',
    mutual_defense: 'Défense mutuelle',
  },
  'pair.war_state': {
    peace: 'Paix',
    tension: 'Tension',
    crisis: 'Crise',
    blockade: 'Blocus',
    war: 'Guerre',
    ceasefire: 'Cessez-le-feu',
  },
  'zone.chokepoint_status': { open: 'Ouvert', contested: 'Contesté', closed: 'Fermé' },
  'world.climate_scenario': {
    'SSP1-2.6': 'SSP1-2.6 (développement durable)',
    'SSP2-4.5': 'SSP2-4.5 (voie intermédiaire)',
    'SSP3-7.0': 'SSP3-7.0 (rivalités régionales)',
    'SSP5-8.5': 'SSP5-8.5 (développement fossile)',
  },
  'sim.map_resolution': { '2048': '2048 px', '4096': '4096 px', '8192': '8192 px' },
  'sim.pov': { de_facto: 'Contrôle de facto' },
};

/** Libellé d'une valeur catégorielle (la valeur brute si elle n'a pas de libellé). */
export function enumLabel(paramId: string, value: string): string {
  return ENUM_LABELS[paramId]?.[value] ?? value;
}

/** Libellés des composantes des paramètres vectoriels (domaines, postes, minerais, volets…). */
const COMPONENT_LABELS: Readonly<Record<string, string>> = {
  land: 'Terre',
  air: 'Air',
  sea: 'Mer',
  strike: 'Frappes longue portée',
  air_defense: 'Défense aérienne',
  drones: 'Drones',
  cyber: 'Cyber',
  space: 'Espace',
  energy: 'Énergie',
  food: 'Alimentation',
  minerals: 'Minerais',
  chips: 'Puces',
  manufactured: 'Produits manufacturés',
  services: 'Services',
  liquefaction: 'Liquéfaction',
  regasification: 'Regazéification',
  rare_earths: 'Terres rares',
  lithium: 'Lithium',
  cobalt: 'Cobalt',
  nickel: 'Nickel',
  copper: 'Cuivre',
  gallium: 'Gallium',
  germanium: 'Germanium',
  graphite: 'Graphite',
  uranium: 'Uranium',
  index: 'Indice',
  interceptors: 'Intercepteurs',
  monthly_production: 'Production mensuelle',
  shells: 'Obus',
  missiles: 'Missiles',
  armored: 'Blindés',
  fronts: 'Fronts',
  garrisons: 'Garnisons',
  home_defense: 'Défense du territoire',
  missions: 'Missions extérieures',
  silo: 'Silos',
  mobile: 'Lanceurs mobiles',
  submarine: 'Sous-marins',
  bomber: 'Bombardiers',
  capital: 'Capitale (pixel)',
  fallback: 'Capitale de repli (pixel)',
  europe: 'Europe',
  asia: 'Asie',
  americas: 'Amériques',
  trade: 'Commerce',
  finance: 'Finance',
  technology: 'Technologie',
  elites: 'Élites',
  transport: 'Transport',
  grain: 'Céréales',
  arms: 'Armement',
};

const COMPONENT_LABELS_BY_PARAM: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'pair.distance': { great_circle: 'Orthodromie', land: 'Par voie de terre', sea: 'Par mer' },
};

/** Libellé d'une composante de paramètre vectoriel (la clé brute à défaut). */
export function componentLabel(paramId: string, key: string): string {
  const own = COMPONENT_LABELS_BY_PARAM[paramId]?.[key];
  if (own !== undefined) return own;
  if (key.startsWith('biome:')) return `Biome : ${key.slice('biome:'.length)}`;
  return COMPONENT_LABELS[key] ?? key;
}
