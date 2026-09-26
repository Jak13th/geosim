/**
 * Scénarios d'expérience (SPEC §12, critères de fin de la phase 4) : une suite de commandes datées
 * appliquées au monde de départ, comparée à une référence (même graine, mêmes données : les écarts
 * ne viennent que des commandes). Utilisés par la CLI (`npm run sim -- --scenario ormuz`) et par
 * les tests d'acceptation ; purs (sans API de Node), ils tourneraient aussi dans le worker.
 */
import type { ParamValue } from '@geosim/shared';
import { Engine, type EngineOptions } from './engine.ts';
import type { EngineData } from './state.ts';
import type { Command, JournalEntry } from './types.ts';

export interface ScenarioStep {
  /** Date d'application (ISO) ; la commande s'applique au début de ce jour. */
  date: string;
  /** Libellé affiché dans le rapport. */
  label: string;
  command: Command;
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  /** Fin de l'expérience (ISO). */
  until: string;
  /** Mise en situation commune au scénario et à la référence. */
  setup?: (data: EngineData) => ScenarioStep[];
  /** Commandes du scénario. */
  steps: (data: EngineData) => ScenarioStep[];
  /** Contrefactuel explicite (commandes propres à la référence) ; défaut : aucune commande. */
  reference?: (data: EngineData) => ScenarioStep[];
  /** Indicateurs mis en avant dans le rapport. */
  focus: { countries: string[]; params: string[]; world: string[] };
}

const zone = (param: string, target: string) => ({ scope: 'zone' as const, param, target });
const country = (param: string, entity: string) => ({ scope: 'country' as const, param, entity });

/** Membres d'un bloc dans les données (liste vide si le bloc est absent). */
function blocMembers(data: EngineData, id: string): string[] {
  return data.world.blocs.find((b) => b.id === id)?.members ?? [];
}

const OIL_FOCUS = {
  countries: ['JPN', 'KOR', 'IND', 'CHN', 'DEU', 'FRA', 'USA', 'SAU', 'QAT', 'NOR', 'PAK', 'EGY'],
  params: [
    'eco.gdp_nominal',
    'eco.growth',
    'eco.output_gap',
    'eco.inflation',
    'energy.supply_gap',
    'trade.oil_stocks',
    'eco.current_account',
    'eco.oil_rents',
    'pol.stability',
  ],
  world: ['world.oil_price', 'world.gas_price.asia', 'world.gas_price.europe', 'world.growth'],
};

/** Fermeture d'Ormuz pendant trois mois, puis retour au statut de départ. */
function hormuzClosure(
  from: string,
  to: string,
  after: ParamValue,
): (data: EngineData) => ScenarioStep[] {
  return () => [
    {
      date: from,
      label: 'Fermeture du détroit d’Ormuz',
      command: { type: 'set', slots: [zone('zone.chokepoint_status', 'hormuz')], value: 'closed' },
    },
    {
      date: to,
      label: 'Réouverture (retour au statut précédent)',
      command: { type: 'set', slots: [zone('zone.chokepoint_status', 'hormuz')], value: after },
    },
  ];
}

/** Coalition occidentale : G7, Union européenne et alliés alignés sur leurs sanctions. */
function westernCoalition(data: EngineData): string[] {
  const allies = ['AUS', 'NZL', 'KOR', 'CHE', 'NOR', 'GBR', 'CAN', 'JPN', 'USA'];
  return [...new Set([...blocMembers(data, 'g7'), ...blocMembers(data, 'eu'), ...allies])].filter(
    (id) => data.countries.entities.some((e) => e.id === id),
  );
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'ormuz',
    label: 'Ormuz fermé trois mois (situation actuelle)',
    description:
      'Le détroit d’Ormuz, déjà réduit à ≈ 15 % de son trafic par la guerre de 2026, est entièrement fermé du 1er novembre 2026 au 1er février 2027, puis revient à son statut contesté.',
    until: '2028-01-01',
    steps: hormuzClosure('2026-11-01', '2027-02-01', 'contested'),
    focus: OIL_FOCUS,
  },
  {
    id: 'ormuz-avant-guerre',
    label: 'Ormuz fermé trois mois (à partir d’un détroit rouvert)',
    description:
      'Mise en situation commune : le détroit d’Ormuz rouvre au départ (le trafic se rétablit en quelques mois). Scénario : fermeture totale du 1er janvier au 1er avril 2028, puis réouverture. Référence : le détroit reste ouvert.',
    until: '2029-07-01',
    setup: () => [
      {
        date: '2026-10-01',
        label: 'Réouverture du détroit d’Ormuz (mise en situation)',
        command: { type: 'set', slots: [zone('zone.chokepoint_status', 'hormuz')], value: 'open' },
      },
    ],
    steps: hormuzClosure('2028-01-01', '2028-04-01', 'open'),
    focus: OIL_FOCUS,
  },
  {
    id: 'sanctions-chine',
    label: 'Sanctions financières et commerciales larges contre la Chine',
    description:
      'Le G7, l’Union européenne et leurs alliés (Australie, Nouvelle-Zélande, Corée du Sud, Suisse, Norvège) imposent le 1er novembre 2026 des sanctions larges à la Chine : finance 0,8 (banques coupées des paiements en dollars et en euros), commerce 0,5, technologie 0,9, transport 0,3, élites 0,5.',
    until: '2029-11-01',
    steps: (data) => [
      {
        date: '2026-11-01',
        label: 'Sanctions de la coalition occidentale contre la Chine',
        command: {
          type: 'set',
          slots: westernCoalition(data).map((from) => ({
            scope: 'pair' as const,
            param: 'pair.sanctions',
            from,
            to: 'CHN',
          })),
          value: {
            trade: 0.5,
            finance: 0.8,
            technology: 0.9,
            energy: 0,
            elites: 0.5,
            transport: 0.3,
          },
        },
      },
    ],
    focus: {
      countries: [
        'CHN',
        'USA',
        'DEU',
        'JPN',
        'KOR',
        'AUS',
        'VNM',
        'IND',
        'MEX',
        'RUS',
        'BRA',
        'TWN',
      ],
      params: [
        'eco.growth',
        'eco.gdp_nominal',
        'eco.output_gap',
        'eco.inflation',
        'trade.exports',
        'trade.imports',
        'eco.current_account',
        'pol.stability',
      ],
      world: ['world.growth', 'world.oil_price', 'world.chip_supply'],
    },
  },
  {
    id: 'ble-x2',
    label: 'Doublement du prix du blé pendant un an',
    description:
      'Le prix mondial du blé double du 1er novembre 2026 au 1er novembre 2027 (choc exogène : mauvaises récoltes simultanées, restrictions à l’exportation), puis revient à sa valeur de marché.',
    until: '2028-11-01',
    steps: () => [
      {
        date: '2026-11-01',
        label: 'Prix du blé × 2 pendant 365 jours',
        command: {
          type: 'addModifier',
          slots: [{ scope: 'world', param: 'world.wheat_price' }],
          modifier: {
            op: 'mul',
            amount: 2,
            durationDays: 365,
            decay: 'none',
            label: 'Doublement du prix du blé',
          },
        },
      },
    ],
    focus: {
      countries: [
        'EGY',
        'YEM',
        'SDN',
        'LBN',
        'NGA',
        'BGD',
        'PAK',
        'DZA',
        'RUS',
        'USA',
        'CAN',
        'AUS',
      ],
      params: [
        'res.food_stress',
        'eco.inflation',
        'eco.output_gap',
        'eco.current_account',
        'pol.stability',
        'pol.approval',
        'demo.refugees_abroad',
      ],
      world: ['world.wheat_price', 'world.growth'],
    },
  },
  {
    id: 'election-usa',
    label: 'Alternance aux États-Unis en 2028',
    description:
      'Une crise de confiance (−25 points d’approbation pendant trois mois à partir du 1er septembre 2028) fait basculer l’élection présidentielle du 7 novembre 2028 : le profil d’opposition (administration démocrate, profiles.yaml) remplace le profil décisionnel. Référence : un regain de confiance (+25 points) reconduit le gouvernement sortant.',
    until: '2031-01-01',
    steps: () => [
      {
        date: '2028-09-01',
        label: 'Crise de confiance : approbation −25 points (3 mois)',
        command: {
          type: 'addModifier',
          slots: [country('pol.approval', 'USA')],
          modifier: {
            op: 'add',
            amount: -25,
            durationDays: 90,
            decay: 'none',
            label: 'Crise de confiance',
          },
        },
      },
    ],
    reference: () => [
      {
        date: '2028-09-01',
        label: 'Regain de confiance : approbation +25 points (3 mois)',
        command: {
          type: 'addModifier',
          slots: [country('pol.approval', 'USA')],
          modifier: {
            op: 'add',
            amount: 25,
            durationDays: 90,
            decay: 'none',
            label: 'Regain de confiance',
          },
        },
      },
    ],
    focus: {
      countries: ['USA'],
      params: [
        'pol.approval',
        'pol.stability',
        'ai.alliance_loyalty',
        'ai.revisionism',
        'ai.aggressiveness',
      ],
      world: ['world.growth'],
    },
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export interface ScenarioRun {
  scenario: Engine;
  reference: Engine;
  /** Commandes appliquées au scénario (mise en situation comprise). */
  steps: ScenarioStep[];
  /** Commandes appliquées à la référence. */
  referenceSteps: ScenarioStep[];
}

/** Déroule une suite de commandes datées jusqu'à la fin de l'expérience. */
function play(
  data: EngineData,
  options: EngineOptions,
  steps: ScenarioStep[],
  until: string,
): Engine {
  const e = Engine.create(data, options);
  const ordered = [...steps].sort((a, b) => a.date.localeCompare(b.date));
  for (const s of ordered) {
    const tick = e.calendar.tickOf(s.date);
    if (tick > e.tick) e.runUntil(tick);
    e.apply(s.command);
  }
  e.runUntil(e.calendar.tickOf(until));
  return e;
}

/** Scénario et référence avec la même graine (tirages communs : seuls les choix diffèrent). */
export function runScenario(
  data: EngineData,
  options: EngineOptions,
  scenario: Scenario,
): ScenarioRun {
  const setup = scenario.setup?.(data) ?? [];
  const steps = [...setup, ...scenario.steps(data)];
  const referenceSteps = [...setup, ...(scenario.reference?.(data) ?? [])];
  return {
    scenario: play(data, options, steps, scenario.until),
    reference: play(data, options, referenceSteps, scenario.until),
    steps,
    referenceSteps,
  };
}

export interface SeriesComparison {
  key: string;
  label: string;
  /** Valeurs mensuelles (scénario, référence). */
  scenario: number[];
  reference: number[];
  /** Écart le plus marqué (scénario − référence) et sa date. */
  peak: { diff: number; date: string; scenario: number; reference: number };
  /** Écart à la fin de l'expérience. */
  end: { diff: number; scenario: number; reference: number };
}

function compareSeries(
  key: string,
  label: string,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  dates: string[],
): SeriesComparison {
  const scenario = Array.from(a);
  const reference = Array.from(b);
  let best = 0;
  let at = 0;
  for (let t = 0; t < Math.min(scenario.length, reference.length); t++) {
    const d = (scenario[t] as number) - (reference[t] as number);
    if (Number.isFinite(d) && Math.abs(d) > Math.abs(best)) {
      best = d;
      at = t;
    }
  }
  const last = Math.min(scenario.length, reference.length) - 1;
  return {
    key,
    label,
    scenario,
    reference,
    peak: {
      diff: best,
      date: dates[at] ?? '',
      scenario: scenario[at] as number,
      reference: reference[at] as number,
    },
    end: {
      diff: (scenario[last] as number) - (reference[last] as number),
      scenario: scenario[last] as number,
      reference: reference[last] as number,
    },
  };
}

/** Comparaison mensuelle d'un indicateur pays (scénario − référence). */
export function compareCountry(
  run: ScenarioRun,
  param: string,
  entity: string,
): SeriesComparison | null {
  const i = run.scenario.state.byId.get(entity);
  if (i === undefined) return null;
  const a = run.scenario.history.series(param, i);
  const b = run.reference.history.series(param, i);
  if (a === null || b === null) return null;
  const dates = run.scenario.history.ticks.map((t) => run.scenario.calendar.isoAt(t));
  return compareSeries(`${param}|${entity}`, `${entity} ${param}`, a, b, dates);
}

/** Comparaison mensuelle d'une série mondiale. */
export function compareWorld(run: ScenarioRun, key: string): SeriesComparison | null {
  const a = run.scenario.history.worldSeries(key);
  const b = run.reference.history.worldSeries(key);
  if (a === null || b === null) return null;
  const dates = run.scenario.history.ticks.map((t) => run.scenario.calendar.isoAt(t));
  return compareSeries(key, key, a, b, dates);
}

/** Événements du scénario absents de la référence (même nature, mêmes entités, même date). */
export function scenarioEvents(run: ScenarioRun): JournalEntry[] {
  const key = (e: JournalEntry): string => `${e.kind}|${e.date}|${e.entities.join(',')}`;
  const reference = new Set(run.reference.journal.filter((e) => e.author === 'event').map(key));
  return run.scenario.journal.filter((e) => e.author === 'event' && !reference.has(key(e)));
}
