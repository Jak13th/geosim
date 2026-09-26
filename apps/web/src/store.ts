/**
 * État de l'interface (Zustand) : données chargées, couche affichée, survol, sélection,
 * panneaux ouverts, filtres et favoris. L'état de la simulation vit dans le moteur (worker) et
 * son miroir (`sim/store.ts`), pas ici.
 */
import type { CategoryId } from '@geosim/shared';
import { create } from 'zustand';
import type { Dataset } from './data/dataset.ts';
import type { LoadProgress } from './data/load.ts';
import type { DataStatus } from './data/status.ts';
import { DEFAULT_BLOC, DEFAULT_INDICATOR, type LayerId } from './map/layers.ts';

export type LoadState =
  | { state: 'loading'; progress: LoadProgress | null }
  | { state: 'ready' }
  | { state: 'missing'; status: DataStatus }
  | { state: 'error'; message: string };

/**
 * Filtre des paramètres de l'inspecteur : tous, modifiés (surcharge, verrou ou effet
 * temporaire), favoris, estimés, anciens (plus de trois ans).
 */
export type ParamFilter = 'all' | 'modified' | 'favorites' | 'estimated' | 'stale';

export type LeftTab = 'world' | 'model' | 'sim';
export type BottomTab = 'journal' | 'charts';

export interface JournalFilter {
  author: 'all' | 'user' | 'event';
  /** Gravité minimale (0 : toutes). */
  severity: 0 | 1 | 2 | 3;
  /** Seulement les entrées du pays sélectionné. */
  selectedOnly: boolean;
}

const FAVORITES_KEY = 'geosim.favorites';

function loadFavorites(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Stockage indisponible (navigation privée) : favoris gardés pour la session.
  }
}

/** Demande de cadrage de la carte sur une entité (le compteur distingue deux demandes identiques). */
export interface FocusRequest {
  index: number;
  nonce: number;
}

export interface AppState {
  load: LoadState;
  data: Dataset | null;
  layer: LayerId;
  /** Paramètre pays affiché par la couche « indicateur ». */
  indicator: string;
  /** Bloc affiché par la couche « blocs » (`military` : vue d'ensemble des alliances). */
  bloc: string;
  /** Entité survolée (index de carte, 0 = aucune). */
  hovered: number;
  /** Pixel de carte survolé (−1 = aucun). */
  hoverPixel: number;
  /** Entité sélectionnée et second pays (panneau bilatéral), 0 = aucune. */
  selected: number;
  second: number;
  inspectorTab: CategoryId | 'apercu';
  /** Recherche et filtre de l'inspecteur (conservés d'un pays à l'autre). */
  paramQuery: string;
  paramFilter: ParamFilter;
  searchOpen: boolean;
  worldOpen: boolean;
  leftTab: LeftTab;
  bottomOpen: boolean;
  bottomTab: BottomTab;
  legendOpen: boolean;
  focus: FocusRequest | null;
  /** Paramètres favoris (identifiants du catalogue), conservés dans le navigateur. */
  favorites: string[];
  journalFilter: JournalFilter;
  /** Graphiques : paramètre pays, entités comparées, séries mondiales. */
  chartParam: string;
  chartEntities: string[];
  chartWorld: string[];

  setLoad(load: LoadState): void;
  setData(data: Dataset): void;
  setLayer(layer: LayerId): void;
  setIndicator(id: string): void;
  setBloc(id: string): void;
  setHovered(index: number): void;
  setHoverPixel(pixel: number): void;
  /** Clic : sélectionne ; Maj+clic : second pays. 0 efface. */
  select(index: number, second?: boolean): void;
  clearSelection(): void;
  swapPair(): void;
  setInspectorTab(tab: CategoryId | 'apercu'): void;
  setParamQuery(query: string): void;
  setParamFilter(filter: ParamFilter): void;
  setSearchOpen(open: boolean): void;
  setWorldOpen(open: boolean): void;
  /** Ouvre le panneau gauche sur un onglet (le ferme s'il y est déjà). */
  toggleLeft(tab: LeftTab): void;
  setBottom(open: boolean, tab?: BottomTab): void;
  setLegendOpen(open: boolean): void;
  focusOn(index: number): void;
  toggleFavorite(id: string): void;
  setJournalFilter(filter: Partial<JournalFilter>): void;
  setChartParam(id: string): void;
  setChartEntities(ids: string[]): void;
  setChartWorld(keys: string[]): void;
}

export const useApp = create<AppState>()((set, get) => ({
  load: { state: 'loading', progress: null },
  data: null,
  layer: 'political',
  indicator: DEFAULT_INDICATOR,
  bloc: DEFAULT_BLOC,
  hovered: 0,
  hoverPixel: -1,
  selected: 0,
  second: 0,
  inspectorTab: 'apercu',
  paramQuery: '',
  paramFilter: 'all',
  searchOpen: false,
  worldOpen: false,
  leftTab: 'world',
  bottomOpen: false,
  bottomTab: 'journal',
  legendOpen: true,
  focus: null,
  favorites: loadFavorites(),
  journalFilter: { author: 'all', severity: 0, selectedOnly: false },
  chartParam: 'eco.growth',
  chartEntities: [],
  chartWorld: ['world.oil_price', 'world.growth'],

  setLoad: (load) => set({ load }),
  setData: (data) => set({ data, load: { state: 'ready' } }),
  setLayer: (layer) => set({ layer }),
  setIndicator: (indicator) => set({ indicator, layer: 'indicator' }),
  setBloc: (bloc) => set({ bloc, layer: 'blocs' }),
  setHovered: (hovered) => {
    if (get().hovered !== hovered) set({ hovered });
  },
  setHoverPixel: (hoverPixel) => {
    if (get().hoverPixel !== hoverPixel) set({ hoverPixel });
  },
  select: (index, second = false) => {
    const { selected } = get();
    if (second && selected !== 0 && index !== selected) set({ second: index });
    else set({ selected: index, second: 0 });
  },
  clearSelection: () => set({ selected: 0, second: 0 }),
  swapPair: () => {
    const { selected, second } = get();
    if (selected !== 0 && second !== 0) set({ selected: second, second: selected });
  },
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setParamQuery: (paramQuery) => set({ paramQuery }),
  setParamFilter: (paramFilter) => set({ paramFilter }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setWorldOpen: (worldOpen) => set({ worldOpen }),
  toggleLeft: (tab) => {
    const { worldOpen, leftTab } = get();
    set(worldOpen && leftTab === tab ? { worldOpen: false } : { worldOpen: true, leftTab: tab });
  },
  setBottom: (bottomOpen, tab) => set(tab ? { bottomOpen, bottomTab: tab } : { bottomOpen }),
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  focusOn: (index) => set({ focus: { index, nonce: (get().focus?.nonce ?? 0) + 1 } }),
  toggleFavorite: (id) => {
    const current = get().favorites;
    const favorites = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    saveFavorites(favorites);
    set({ favorites });
  },
  setJournalFilter: (filter) => set({ journalFilter: { ...get().journalFilter, ...filter } }),
  setChartParam: (chartParam) => set({ chartParam }),
  setChartEntities: (chartEntities) => set({ chartEntities }),
  setChartWorld: (chartWorld) => set({ chartWorld }),
}));
