/**
 * État de l'interface (Zustand) : données chargées, couche affichée, survol, sélection,
 * panneaux ouverts. L'état de la simulation vivra dans le moteur (phase 3), pas ici.
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

/** Filtre des paramètres de l'inspecteur : tous, estimés, anciens (plus de trois ans). */
export type ParamFilter = 'all' | 'estimated' | 'stale';

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
  legendOpen: boolean;
  focus: FocusRequest | null;

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
  setLegendOpen(open: boolean): void;
  focusOn(index: number): void;
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
  legendOpen: true,
  focus: null,

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
  setLegendOpen: (legendOpen) => set({ legendOpen }),
  focusOn: (index) => set({ focus: { index, nonce: (get().focus?.nonce ?? 0) + 1 } }),
}));
