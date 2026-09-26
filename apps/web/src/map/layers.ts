/**
 * Couches de la carte (SPEC §9.2) : mode de rendu, couleur de chaque entité et légende.
 *
 * Les couches « par entité » ne changent que la palette (une couleur par entité) : changer de
 * couche ou d'indicateur ne réécrit aucun pixel (DECISIONS D1). Les couches physiques
 * (population, terrain, infrastructures, mer) lisent les couches par pixel dans le shader.
 */
import {
  BIOME_LABELS,
  CATALOG,
  Terrain,
  enumLabel,
  paramById,
  type BiomeId,
  type ParamDef,
  type ParamValue,
} from '@geosim/shared';
import type { Dataset, EntityView } from '../data/dataset.ts';
import type { LiveSim } from '../sim/mirror.ts';
import { formatDataDate, formatQuantity, formatShort } from '../format.ts';
import {
  CATEGORICAL,
  DENSITY,
  DIVERGING,
  NO_DATA,
  PaletteBuffer,
  SEQUENTIAL,
  hex,
  ramp,
  type Rgb,
} from './colors.ts';
import { makeScale, normalize, scaleTicks } from './scales.ts';
import { BIOME_COLORS, CHOKEPOINT_COLORS, RELIEF_BLEND, STYLE } from './style.ts';

export type LayerId =
  | 'political'
  | 'sovereign'
  | 'relations'
  | 'blocs'
  | 'indicator'
  | 'sanctions'
  | 'population'
  | 'terrain'
  | 'infrastructure'
  | 'sea';

export type RenderMode = 'entity' | 'density' | 'terrain' | 'infrastructure' | 'sea';

export interface LayerDef {
  id: LayerId;
  label: string;
  /** Raccourci clavier (SPEC §9.10). */
  key: string;
  description: string;
  mode: RenderMode;
}

export const LAYERS: readonly LayerDef[] = [
  {
    id: 'political',
    key: '1',
    label: 'Politique',
    mode: 'entity',
    description: 'Contrôle de facto de chaque territoire.',
  },
  {
    id: 'sovereign',
    key: '2',
    label: 'Souveraineté de jure',
    mode: 'entity',
    description: 'Souveraineté reconnue, indépendamment du contrôle effectif.',
  },
  {
    id: 'relations',
    key: '3',
    label: 'Relations',
    mode: 'entity',
    description: 'Relations du pays sélectionné avec chaque autre pays.',
  },
  {
    id: 'blocs',
    key: '4',
    label: 'Blocs et alliances',
    mode: 'entity',
    description: 'Alliances militaires, unions et organisations.',
  },
  {
    id: 'indicator',
    key: '5',
    label: 'Indicateurs',
    mode: 'entity',
    description: 'Tout paramètre pays du catalogue, en aplats de couleur.',
  },
  {
    id: 'sanctions',
    key: '6',
    label: 'Sanctions',
    mode: 'entity',
    description: 'Régimes de sanctions en vigueur.',
  },
  {
    id: 'population',
    key: '7',
    label: 'Population',
    mode: 'density',
    description: 'Densité de population par pixel.',
  },
  {
    id: 'terrain',
    key: '8',
    label: 'Terrain et biomes',
    mode: 'terrain',
    description: 'Relief, biomes, lacs et fleuves.',
  },
  {
    id: 'infrastructure',
    key: '9',
    label: 'Infrastructures',
    mode: 'infrastructure',
    description: 'Routes, voies ferrées, ports, aéroports et zones urbaines.',
  },
  {
    id: 'sea',
    key: '0',
    label: 'Mer, routes et détroits',
    mode: 'sea',
    description: 'Zones maritimes, principales routes commerciales et statut des détroits.',
  },
];

export function layerDef(id: LayerId): LayerDef {
  return LAYERS.find((l) => l.id === id) ?? (LAYERS[0] as LayerDef);
}

export const DEFAULT_INDICATOR = 'pol.stability';
/** Vue d'ensemble des alliances militaires dans la couche « blocs ». */
export const DEFAULT_BLOC = 'military';

/**
 * Indicateurs proposés en tête de liste (SPEC §9.2). La puissance militaire arrive avec les
 * forces armées (phase 5) ; en attendant, le budget de défense est proposé.
 */
export const INDICATOR_PRESETS = [
  'pol.stability',
  'eco.gdp_per_capita',
  'eco.growth',
  'eco.inflation',
  'eco.unemployment',
  'eco.public_debt',
  'bud.balance',
  'eco.sovereign_rate',
  'mil.budget',
  'energy.import_dependence',
  'demo.hdi',
  'demo.population',
  'pol.regime_type',
] as const;

/**
 * Valeurs lues par les couches : données de départ (moteur pas encore prêt) ou état simulé
 * (miroir du moteur). Les échelles de couleur restent calées sur les valeurs de départ : une
 * évolution simulée se voit comme un changement de couleur.
 */
export interface ValueSource {
  number(e: EntityView, id: string): number | null;
  value(e: EntityView, id: string): ParamValue;
  /** Valeurs de départ de toutes les entités (bornes de l'échelle de couleur). */
  scaleValues(id: string): number[];
  pair(id: string, from: string, to: string): ParamValue;
  pairEntries(id: string): readonly (readonly [string, string, ParamValue])[];
  /** Date de la donnée affichée, ou null pour une valeur simulée. */
  dateOf(e: EntityView, id: string): string | null;
}

export function datasetSource(data: Dataset): ValueSource {
  return {
    number: (e, id) => data.numeric(e, id),
    value: (e, id) => {
      const r = data.param(e, id);
      return r.state === 'value' ? r.value.value : null;
    },
    scaleValues: (id) =>
      data.list.map((e) => data.numeric(e, id)).filter((v): v is number => v !== null),
    pair: (id, from, to) => data.pair(id, from, to)?.value ?? null,
    pairEntries: (id) => data.pairEntries(id).map(([a, b, v]) => [a, b, v] as const),
    dateOf: (e, id) => {
      const r = data.param(e, id);
      return r.state === 'value' ? r.value.date : null;
    },
  };
}

export function liveSource(data: Dataset, live: LiveSim): ValueSource {
  const fallback = datasetSource(data);
  return {
    number: (e, id) => (live.hasNumeric(id) ? live.number(e.id, id) : fallback.number(e, id)),
    value: (e, id) => live.countryValue(e.id, id),
    scaleValues: (id) => {
      const column = live.baseColumn(id);
      if (column === null) return fallback.scaleValues(id);
      return Array.from(column).filter((v) => Number.isFinite(v));
    },
    pair: (id, from, to) => live.pairValue(id, from, to),
    pairEntries: (id) => live.pairEntries(id),
    dateOf: (e, id) => {
      const slot = { scope: 'country', param: id, entity: e.id } as const;
      const base = live.baseValue(slot);
      if (live.changed(slot, base) || live.computedAtStart(slot, base)) return null;
      return fallback.dateOf(e, id);
    },
  };
}

export type LegendItem =
  | {
      kind: 'swatch';
      color: Rgb;
      label: string;
      pattern?: 'hatch' | 'dots' | 'line' | 'marker';
      count?: number;
    }
  | { kind: 'gradient'; colors: Rgb[]; ticks: { at: number; label: string }[]; caption: string }
  | { kind: 'note'; text: string };

export interface Legend {
  title: string;
  items: LegendItem[];
}

export type HatchMode = 'none' | 'other' | 'dark';

/** Résultat d'une couche : ce que le rendu et l'interface en lisent. */
export interface LayerView {
  mode: RenderMode;
  /** Couche d'identifiants colorée : contrôle de facto ou souveraineté de jure. */
  idLayer: 'owner' | 'sovereign';
  /** Hachures là où contrôle et souveraineté diffèrent. */
  hatch: HatchMode;
  palette: PaletteBuffer;
  legend: Legend;
  /** Valeur de l'entité dans cette couche, pour l'infobulle (null : rien à dire). */
  describe(entity: EntityView): string | null;
}

export interface LayerContext {
  layer: LayerId;
  indicator: string;
  bloc: string;
  selected: number;
  /** Valeurs affichées (défaut : données de départ). */
  values?: ValueSource;
}

/** Alpha de palette qui signale une valeur estimée (motif pointillé dans le shader). */
export const ESTIMATED_ALPHA = 128;

function sampleRamp(f: (t: number) => Rgb, n = 9): Rgb[] {
  return Array.from({ length: n }, (_, i) => f(i / (n - 1)));
}

function isEstimated(data: Dataset, e: EntityView, id: string): boolean {
  const r = data.param(e, id);
  return (
    r.state === 'value' && (r.value.confidence === 'low' || r.value.confidence === 'assumption')
  );
}

function politicalPalette(data: Dataset): PaletteBuffer {
  const p = new PaletteBuffer(data.maxIndex + 1);
  p.fill(STYLE.neutral);
  for (const e of data.list) p.set(e.index, e.color);
  return p;
}

function politicalLayer(data: Dataset, sovereign: boolean): LayerView {
  return {
    mode: 'entity',
    idLayer: sovereign ? 'sovereign' : 'owner',
    hatch: 'other',
    palette: politicalPalette(data),
    legend: {
      title: sovereign ? 'Souveraineté de jure' : 'Contrôle de facto',
      items: [
        {
          kind: 'swatch',
          color: STYLE.neutral,
          pattern: 'hatch',
          label: sovereign
            ? 'Hachures : territoire contrôlé par une autre entité (couleur du contrôleur)'
            : 'Hachures : contrôle sans souveraineté de jure (couleur du souverain)',
        },
        {
          kind: 'swatch',
          color: STYLE.neutral,
          label: 'Terre sans contrôle (Antarctique, Bir Tawil…)',
        },
        {
          kind: 'note',
          text: 'Zones de contrôle datées (Crimée, territoires occupés, factions…) : data/curated/control_zones.geojson.',
        },
      ],
    },
    describe: () => null,
  };
}

const WAR_COLOR = hex('#6a0f1d');
const CEASEFIRE_COLOR = hex('#8a63b8');

function relationsLayer(
  data: Dataset,
  src: ValueSource,
  selected: EntityView | undefined,
): LayerView {
  const palette = new PaletteBuffer(data.maxIndex + 1);
  palette.fill(NO_DATA);
  const legendItems: LegendItem[] = [];
  if (selected === undefined) {
    return {
      mode: 'entity',
      idLayer: 'owner',
      hatch: 'dark',
      palette,
      legend: {
        title: 'Relations',
        items: [{ kind: 'note', text: 'Sélectionne un pays (clic) pour afficher ses relations.' }],
      },
      describe: () => null,
    };
  }
  const texts = new Map<number, string>();
  let known = 0;
  for (const e of data.list) {
    if (e.index === selected.index) {
      palette.set(e.index, STYLE.selection);
      continue;
    }
    const war = src.pair('pair.war_state', selected.id, e.id);
    const rel = src.pair('pair.relation', selected.id, e.id);
    // Relations simulées : réelles, arrondies pour l'affichage.
    const value = typeof rel === 'number' && Number.isFinite(rel) ? Math.round(rel) : null;
    const relText =
      value === null ? 'relation non renseignée' : `relation ${value > 0 ? '+' : ''}${value}`;
    if (war === 'war') {
      palette.set(e.index, WAR_COLOR);
      texts.set(e.index, `En guerre avec ${selected.nameFr} · ${relText}`);
    } else if (war === 'ceasefire') {
      palette.set(e.index, CEASEFIRE_COLOR);
      texts.set(e.index, `Cessez-le-feu avec ${selected.nameFr} · ${relText}`);
    } else if (value !== null) {
      palette.set(e.index, DIVERGING((value + 100) / 200));
      texts.set(e.index, `Relation avec ${selected.nameFr} : ${value > 0 ? '+' : ''}${value}`);
      known++;
    } else {
      texts.set(e.index, `Relation avec ${selected.nameFr} : non renseignée`);
    }
  }
  legendItems.push(
    {
      kind: 'gradient',
      colors: sampleRamp(DIVERGING),
      ticks: [-100, -50, 0, 50, 100].map((v) => ({ at: (v + 100) / 200, label: String(v) })),
      caption: `Relation vue par ${selected.nameFr} (−100 hostile, +100 alliée)`,
    },
    { kind: 'swatch', color: WAR_COLOR, label: 'En guerre' },
    { kind: 'swatch', color: CEASEFIRE_COLOR, label: 'Cessez-le-feu' },
    { kind: 'swatch', color: STYLE.selection, label: selected.nameFr },
    { kind: 'swatch', color: NO_DATA, label: 'Non renseignée' },
    {
      kind: 'note',
      text: `${known} relation${known > 1 ? 's' : ''} connue${known > 1 ? 's' : ''} : données de départ (relations_seed.yaml, hypothèses à valider) ; en simulation, les autres paires partent de leur affinité structurelle.`,
    },
  );
  return {
    mode: 'entity',
    idLayer: 'owner',
    hatch: 'dark',
    palette,
    legend: { title: `Relations de ${selected.nameFr}`, items: legendItems },
    describe: (e) => texts.get(e.index) ?? null,
  };
}

const MUTUAL_DEFENSE_TREATY = hex('#a58fd0');

/** Membres courants d'un bloc (appartenances simulées : adhésions, retraits, suspensions). */
function liveMembers(data: Dataset, src: ValueSource, blocId: string): string[] {
  const out: string[] = [];
  for (const e of data.list) {
    const list = src.value(e, 'dip.memberships');
    if (Array.isArray(list) && list.includes(blocId)) out.push(e.id);
  }
  return out;
}

function blocsLayer(data: Dataset, src: ValueSource, blocId: string): LayerView {
  const palette = new PaletteBuffer(data.maxIndex + 1);
  palette.fill(NO_DATA);
  const texts = new Map<number, string>();
  const blocs = data.raw.world.blocs;
  const items: LegendItem[] = [];
  if (blocId === DEFAULT_BLOC) {
    const military = blocs.filter((b) => b.rules.mutual_defense);
    military.forEach((b, k) => {
      const color = CATEGORICAL[k % CATEGORICAL.length] as Rgb;
      let count = 0;
      for (const code of liveMembers(data, src, b.id)) {
        const e = data.byId.get(code);
        if (e === undefined || texts.has(e.index)) continue;
        palette.set(e.index, color);
        texts.set(e.index, `Membre : ${b.nameFr}`);
        count++;
      }
      items.push({ kind: 'swatch', color, label: b.nameFr, count });
    });
    // Traités bilatéraux de défense mutuelle hors des blocs (ex. Japon–États-Unis).
    const partners = new Map<string, Set<string>>();
    for (const [a, b, v] of src.pairEntries('pair.treaty')) {
      if (v !== 'mutual_defense') continue;
      if (!partners.has(a)) partners.set(a, new Set());
      partners.get(a)?.add(b);
    }
    let bilateral = 0;
    for (const [code, set] of partners) {
      const e = data.byId.get(code);
      if (e === undefined || texts.has(e.index)) continue;
      palette.set(e.index, MUTUAL_DEFENSE_TREATY);
      const names = [...set].map((c) => data.byId.get(c)?.nameFr ?? c);
      texts.set(e.index, `Défense mutuelle avec ${names.join(', ')}`);
      bilateral++;
    }
    items.push(
      {
        kind: 'swatch',
        color: MUTUAL_DEFENSE_TREATY,
        label: 'Traité bilatéral de défense mutuelle (hors bloc)',
        count: bilateral,
      },
      { kind: 'swatch', color: NO_DATA, label: 'Aucune alliance de défense mutuelle' },
      {
        kind: 'note',
        text: 'Sources : blocs.yaml et treaties.yaml (dates et sources par bloc et par traité).',
      },
    );
    return {
      mode: 'entity',
      idLayer: 'owner',
      hatch: 'dark',
      palette,
      legend: { title: 'Alliances militaires', items },
      describe: (e) => texts.get(e.index) ?? 'Aucune alliance de défense mutuelle',
    };
  }
  const bloc = blocs.find((b) => b.id === blocId);
  if (bloc === undefined) return blocsLayer(data, src, DEFAULT_BLOC);
  const roles: [string, readonly string[] | undefined, Rgb][] = [
    ['Membre', liveMembers(data, src, bloc.id), CATEGORICAL[0] as Rgb],
    ['Partenaire', bloc.partners, hex('#6fb3a8')],
    ['Observateur', bloc.observers, hex('#a3a86f')],
    ['Suspendu', bloc.suspended, hex('#c9774d')],
  ];
  // Les suspensions priment : un membre suspendu figure aussi dans la liste des membres.
  for (const [role, codes, color] of [...roles].reverse()) {
    let count = 0;
    for (const code of codes ?? []) {
      const e = data.byId.get(code);
      if (e === undefined || texts.has(e.index)) continue;
      palette.set(e.index, color);
      texts.set(e.index, `${role} : ${bloc.nameFr}`);
      count++;
    }
    if (count > 0) items.unshift({ kind: 'swatch', color, label: `${role}s`, count });
  }
  items.push({
    kind: 'note',
    text: `Source : ${bloc.source} (${formatDataDate(bloc.date)}, confiance ${bloc.confidence}).`,
  });
  return {
    mode: 'entity',
    idLayer: 'owner',
    hatch: 'dark',
    palette,
    legend: { title: bloc.nameFr, items },
    describe: (e) => texts.get(e.index) ?? `Non membre : ${bloc.nameFr}`,
  };
}

/**
 * Paramètres pays affichables en choroplèthe (nombre, catégorie, booléen) ayant des valeurs :
 * dans les données de départ, ou calculées par le moteur (croissance, solde budgétaire…).
 */
export function indicatorOptions(
  data: Dataset,
  src: ValueSource = datasetSource(data),
): ParamDef[] {
  return CATALOG.filter(
    (d) =>
      d.scope === 'country' &&
      (d.valueType === 'number' || d.valueType === 'enum' || d.valueType === 'bool') &&
      data.list.some((e) => src.value(e, d.id) !== null),
  );
}

function indicatorLayer(data: Dataset, src: ValueSource, id: string): LayerView {
  const def = paramById(id);
  const palette = new PaletteBuffer(data.maxIndex + 1);
  palette.fill(NO_DATA);
  if (def === undefined) return indicatorLayer(data, src, DEFAULT_INDICATOR);
  const items: LegendItem[] = [];
  const texts = new Map<number, string>();
  const describeValue = (e: EntityView, text: string): void => {
    const date = src.dateOf(e, id);
    texts.set(
      e.index,
      `${def.label} : ${text}${date ? ` (${formatDataDate(date)})` : ' (simulé)'}`,
    );
  };
  let estimated = 0;
  let missing = 0;

  if (def.valueType === 'number') {
    // Échelle calée sur les valeurs de départ : une évolution simulée change la couleur.
    const scale = makeScale(src.scaleValues(id), def.scale === 'log');
    for (const e of data.list) {
      const v = src.number(e, id);
      if (v === null) {
        missing++;
        texts.set(e.index, `${def.label} : pas de valeur`);
        continue;
      }
      const est = isEstimated(data, e, id);
      if (est) estimated++;
      palette.set(e.index, SEQUENTIAL(normalize(scale, v)), est ? ESTIMATED_ALPHA : 255);
      describeValue(e, formatQuantity(v, def.unit) + (est ? ' — estimation' : ''));
    }
    const at = (v: number): number => normalize(scale, v);
    items.push({
      kind: 'gradient',
      colors: sampleRamp(SEQUENTIAL),
      ticks: scaleTicks(scale).map((v) => ({ at: at(v), label: formatShort(v) })),
      caption: `${def.unit || 'indice'}${scale.kind === 'log' ? ' · échelle logarithmique' : ''} · bornes : 2ᵉ et 98ᵉ centiles des valeurs de départ`,
    });
  } else {
    const categories = def.valueType === 'bool' ? ['true', 'false'] : [...(def.enumValues ?? [])];
    const counts = new Map<string, number>();
    for (const e of data.list) {
      const v = src.value(e, id);
      if (v === null || (typeof v !== 'string' && typeof v !== 'boolean')) {
        missing++;
        texts.set(e.index, `${def.label} : pas de valeur`);
        continue;
      }
      const key = String(v);
      const k = categories.indexOf(key);
      const est = isEstimated(data, e, id);
      if (est) estimated++;
      palette.set(
        e.index,
        CATEGORICAL[(k < 0 ? categories.length : k) % CATEGORICAL.length] as Rgb,
        est ? ESTIMATED_ALPHA : 255,
      );
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const label = def.valueType === 'bool' ? (v === true ? 'oui' : 'non') : enumLabel(id, key);
      describeValue(e, label + (est ? ' — estimation' : ''));
    }
    categories.forEach((c, k) => {
      if (!counts.has(c)) return;
      items.push({
        kind: 'swatch',
        color: CATEGORICAL[k % CATEGORICAL.length] as Rgb,
        label: def.valueType === 'bool' ? (c === 'true' ? 'Oui' : 'Non') : enumLabel(id, c),
        count: counts.get(c) ?? 0,
      });
    });
  }
  if (estimated > 0) {
    items.push({
      kind: 'swatch',
      color: hex('#9aa3ad'),
      pattern: 'dots',
      label: 'Valeur estimée (confiance faible ou hypothèse)',
      count: estimated,
    });
  }
  if (missing > 0)
    items.push({ kind: 'swatch', color: NO_DATA, label: 'Pas de valeur', count: missing });
  items.push({ kind: 'note', text: def.description });
  return {
    mode: 'entity',
    idLayer: 'owner',
    hatch: 'dark',
    palette,
    legend: { title: def.label, items },
    describe: (e) => texts.get(e.index) ?? null,
  };
}

const SANCTIONS_RAMP = ramp(['#fcbba1', '#fb6a4a', '#cb181d', '#67000d']);
const SANCTIONED_BY = hex('#e0454f');
const SANCTIONS_ON = hex('#f0a030');
const BOTH_WAYS = hex('#b05cc9');

function sanctionTracks(v: unknown): string[] {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, number>)
    .filter(([, x]) => x > 0)
    .map(([k]) => k);
}

function sanctionsLayer(
  data: Dataset,
  src: ValueSource,
  selected: EntityView | undefined,
): LayerView {
  const palette = new PaletteBuffer(data.maxIndex + 1);
  palette.fill(NO_DATA);
  const texts = new Map<number, string>();
  const entries = src
    .pairEntries('pair.sanctions')
    .filter(([, , v]) => sanctionTracks(v).length > 0);
  if (selected === undefined) {
    const senders = new Map<string, Set<string>>();
    for (const [a, b] of entries) {
      if (!senders.has(b)) senders.set(b, new Set());
      senders.get(b)?.add(a);
    }
    const max = Math.max(1, ...[...senders.values()].map((s) => s.size));
    for (const [code, set] of senders) {
      const e = data.byId.get(code);
      if (e === undefined) continue;
      palette.set(e.index, SANCTIONS_RAMP(Math.log(set.size) / Math.log(Math.max(2, max))));
      texts.set(
        e.index,
        `Sanctionné par ${set.size} État${set.size > 1 ? 's' : ''} ou entité${set.size > 1 ? 's' : ''}`,
      );
    }
    return {
      mode: 'entity',
      idLayer: 'owner',
      hatch: 'dark',
      palette,
      legend: {
        title: 'Sanctions reçues',
        items: [
          {
            kind: 'gradient',
            colors: sampleRamp(SANCTIONS_RAMP),
            ticks: [1, 5, 10, 20, 40]
              .filter((v) => v <= max)
              .map((v) => ({ at: Math.log(v) / Math.log(Math.max(2, max)), label: String(v) })),
            caption: 'Nombre d’États qui sanctionnent le pays (échelle logarithmique)',
          },
          { kind: 'swatch', color: NO_DATA, label: 'Aucune sanction recensée' },
          {
            kind: 'note',
            text: 'Sélectionne un pays pour voir qui il sanctionne et qui le sanctionne. Source : sanctions.yaml.',
          },
        ],
      },
      describe: (e) => texts.get(e.index) ?? 'Aucune sanction recensée',
    };
  }
  const by = new Map<string, string[]>();
  const on = new Map<string, string[]>();
  for (const [a, b, v] of entries) {
    if (a === selected.id) on.set(b, sanctionTracks(v));
    if (b === selected.id) by.set(a, sanctionTracks(v));
  }
  const counts = { by: 0, on: 0, both: 0 };
  for (const e of data.list) {
    if (e.index === selected.index) {
      palette.set(e.index, STYLE.selection);
      continue;
    }
    const x = on.get(e.id);
    const y = by.get(e.id);
    if (x && y) {
      palette.set(e.index, BOTH_WAYS);
      counts.both++;
      texts.set(e.index, `Sanctions réciproques avec ${selected.nameFr}`);
    } else if (x) {
      palette.set(e.index, SANCTIONED_BY);
      counts.on++;
      texts.set(
        e.index,
        `Sanctionné par ${selected.nameFr} (${x.length} volet${x.length > 1 ? 's' : ''})`,
      );
    } else if (y) {
      palette.set(e.index, SANCTIONS_ON);
      counts.by++;
      texts.set(
        e.index,
        `Sanctionne ${selected.nameFr} (${y.length} volet${y.length > 1 ? 's' : ''})`,
      );
    }
  }
  return {
    mode: 'entity',
    idLayer: 'owner',
    hatch: 'dark',
    palette,
    legend: {
      title: `Sanctions et ${selected.nameFr}`,
      items: [
        {
          kind: 'swatch',
          color: SANCTIONED_BY,
          label: `Sanctionné par ${selected.nameFr}`,
          count: counts.on,
        },
        {
          kind: 'swatch',
          color: SANCTIONS_ON,
          label: `Sanctionne ${selected.nameFr}`,
          count: counts.by,
        },
        { kind: 'swatch', color: BOTH_WAYS, label: 'Sanctions réciproques', count: counts.both },
        { kind: 'swatch', color: STYLE.selection, label: selected.nameFr },
        {
          kind: 'note',
          text: 'Volets : commerce, finance, technologie, énergie, élites, transport (sanctions.yaml).',
        },
      ],
    },
    describe: (e) => texts.get(e.index) ?? null,
  };
}

/** Densité codée sur un octet : 0 = inhabité, 1–255 = log10 de 0,1 à 10⁴ hab./km². */
export const DENSITY_LOG_MIN = -1;
export const DENSITY_LOG_MAX = 4;

export function densityByte(inhabitantsPerKm2: number): number {
  if (!(inhabitantsPerKm2 > 0)) return 0;
  const t = (Math.log10(inhabitantsPerKm2) - DENSITY_LOG_MIN) / (DENSITY_LOG_MAX - DENSITY_LOG_MIN);
  return 1 + Math.round(Math.min(1, Math.max(0, t)) * 254);
}

/** Grille de densité codée (un octet par pixel) depuis la population des pixels terrestres. */
export function buildDensityGrid(data: Dataset): Uint8Array {
  const out = new Uint8Array(data.width * data.height);
  const { index, layers } = data.raw.land;
  const area = data.raw.grid.header.pixelAreaKm2;
  for (let k = 0; k < index.length; k++) {
    out[index[k] as number] = densityByte((layers.population[k] as number) / area);
  }
  return out;
}

function physicalLayer(data: Dataset, mode: Exclude<RenderMode, 'entity'>): LayerView {
  const palette = politicalPalette(data);
  const base = {
    mode,
    idLayer: 'owner' as const,
    hatch: 'none' as const,
    palette,
    describe: () => null,
  };
  switch (mode) {
    case 'density':
      return {
        ...base,
        legend: {
          title: 'Densité de population',
          items: [
            {
              kind: 'gradient',
              colors: sampleRamp(DENSITY),
              ticks: [0.1, 1, 10, 100, 1000, 10000].map((v) => ({
                at: (Math.log10(v) - DENSITY_LOG_MIN) / (DENSITY_LOG_MAX - DENSITY_LOG_MIN),
                label: formatShort(v),
              })),
              caption: 'habitants par km² (échelle logarithmique)',
            },
            {
              kind: 'note',
              text: 'Répartition modélisée : noyaux urbains et habitabilité rurale, totaux nationaux conservés (MODELES §1.10).',
            },
          ],
        },
      };
    case 'terrain': {
      const items: LegendItem[] = [];
      for (const [code, color] of Object.entries(BIOME_COLORS)) {
        if (Number(code) === 0) continue;
        items.push({ kind: 'swatch', color, label: BIOME_LABELS[Number(code) as BiomeId] });
      }
      items.push(
        {
          kind: 'swatch',
          color: (RELIEF_BLEND[Terrain.Mountain] ?? { color: STYLE.mountain }).color,
          label: 'Montagne',
        },
        { kind: 'swatch', color: STYLE.highMountain, label: 'Haute montagne' },
        { kind: 'swatch', color: STYLE.lake, label: 'Lac' },
        { kind: 'swatch', color: STYLE.river, pattern: 'line', label: 'Fleuve majeur' },
        {
          kind: 'note',
          text: 'Biomes climatiques potentiels (WorldClim), relief ombré (altitude WorldClim).',
        },
      );
      return { ...base, legend: { title: 'Terrain et biomes', items } };
    }
    case 'infrastructure':
      return {
        ...base,
        legend: {
          title: 'Infrastructures',
          items: [
            { kind: 'swatch', color: STYLE.road, pattern: 'line', label: 'Route' },
            { kind: 'swatch', color: STYLE.majorRoad, pattern: 'line', label: 'Route majeure' },
            { kind: 'swatch', color: STYLE.rail, pattern: 'line', label: 'Voie ferrée' },
            { kind: 'swatch', color: STYLE.port, pattern: 'marker', label: 'Port' },
            { kind: 'swatch', color: STYLE.airport, pattern: 'marker', label: 'Aéroport' },
            { kind: 'swatch', color: STYLE.urban, label: 'Zone urbaine' },
            { kind: 'swatch', color: STYLE.river, pattern: 'line', label: 'Fleuve majeur' },
            {
              kind: 'note',
              text: 'Natural Earth (routes, voies ferrées, ports, aéroports, zones urbaines).',
            },
          ],
        },
      };
    case 'sea':
      return {
        ...base,
        legend: {
          title: 'Mer, routes et détroits',
          items: [
            {
              kind: 'swatch',
              color: CHOKEPOINT_COLORS.open,
              pattern: 'marker',
              label: 'Détroit ouvert',
            },
            {
              kind: 'swatch',
              color: CHOKEPOINT_COLORS.contested,
              pattern: 'marker',
              label: 'Détroit contesté',
            },
            {
              kind: 'swatch',
              color: CHOKEPOINT_COLORS.closed,
              pattern: 'marker',
              label: 'Détroit fermé',
            },
            { kind: 'swatch', color: STYLE.strait, label: 'Porte de détroit (pixels)' },
            {
              kind: 'swatch',
              color: hex('#9fd3ff'),
              pattern: 'line',
              label: 'Routes des principaux flux commerciaux',
            },
            {
              kind: 'note',
              text: 'Zones maritimes : couleurs distinctes. Routes : trajets principaux des plus gros flux (BACI), ou du pays sélectionné vers ses principaux partenaires.',
            },
          ],
        },
      };
  }
}

/** Construit la couche demandée. */
export function buildLayer(data: Dataset, ctx: LayerContext): LayerView {
  const selected = ctx.selected ? data.byIndex[ctx.selected] : undefined;
  const src = ctx.values ?? datasetSource(data);
  switch (ctx.layer) {
    case 'political':
      return politicalLayer(data, false);
    case 'sovereign':
      return politicalLayer(data, true);
    case 'relations':
      return relationsLayer(data, src, selected);
    case 'blocs':
      return blocsLayer(data, src, ctx.bloc);
    case 'indicator':
      return indicatorLayer(data, src, ctx.indicator);
    case 'sanctions':
      return sanctionsLayer(data, src, selected);
    default:
      return physicalLayer(data, layerDef(ctx.layer).mode as Exclude<RenderMode, 'entity'>);
  }
}
