/**
 * Géométrie de la vue : passage écran ↔ carte, zoom vers le curseur, cadrage d'une emprise.
 * Coordonnées écran en pixels CSS (origine en haut à gauche) ; coordonnées carte en pixels de
 * la grille (le pixel (i, j) couvre [i, i+1) × [j, j+1)).
 */

export interface View {
  /** Point de la carte au centre de l'écran. */
  cx: number;
  cy: number;
  /** Pixels CSS par pixel de carte. */
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface MapSize {
  width: number;
  height: number;
}

/** Zoom maximal : un pixel de carte (≈ 8 km à 4096 px) occupe 48 pixels d'écran. */
export const MAX_ZOOM = 48;

export function screenToMap(view: View, vp: Viewport, sx: number, sy: number): [number, number] {
  return [view.cx + (sx - vp.width / 2) / view.zoom, view.cy + (sy - vp.height / 2) / view.zoom];
}

export function mapToScreen(view: View, vp: Viewport, mx: number, my: number): [number, number] {
  return [(mx - view.cx) * view.zoom + vp.width / 2, (my - view.cy) * view.zoom + vp.height / 2];
}

/** Zoom qui montre toute la carte, avec une marge. */
export function fitZoom(map: MapSize, vp: Viewport, margin = 0.96): number {
  return Math.min(vp.width / map.width, vp.height / map.height) * margin;
}

export function minZoom(map: MapSize, vp: Viewport): number {
  return fitZoom(map, vp) * 0.8;
}

/** Garde la carte à l'écran : le centre reste dans la carte, le zoom dans ses bornes. */
export function clampView(view: View, map: MapSize, vp: Viewport): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom(map, vp), view.zoom));
  // Quand la carte est plus petite que l'écran sur un axe, elle reste centrée sur cet axe.
  const halfW = vp.width / 2 / zoom;
  const halfH = vp.height / 2 / zoom;
  const clampAxis = (c: number, size: number, half: number): number =>
    half * 2 >= size ? size / 2 : Math.min(size - half * 0.2, Math.max(half * 0.2, c));
  return {
    zoom,
    cx: clampAxis(view.cx, map.width, halfW),
    cy: clampAxis(view.cy, map.height, halfH),
  };
}

export function initialView(map: MapSize, vp: Viewport): View {
  return { cx: map.width / 2, cy: map.height / 2, zoom: fitZoom(map, vp) };
}

/** Zoom d'un facteur en gardant fixe le point de la carte sous (sx, sy). */
export function zoomAt(view: View, vp: Viewport, sx: number, sy: number, factor: number): View {
  const [mx, my] = screenToMap(view, vp, sx, sy);
  const zoom = view.zoom * factor;
  return {
    zoom,
    cx: mx - (sx - vp.width / 2) / zoom,
    cy: my - (sy - vp.height / 2) / zoom,
  };
}

export function panBy(view: View, dxScreen: number, dyScreen: number): View {
  return { ...view, cx: view.cx - dxScreen / view.zoom, cy: view.cy - dyScreen / view.zoom };
}

/** Vue qui cadre un rectangle de la carte [x0, y0, x1, y1], avec une marge relative. */
export function fitRect(
  rect: readonly [number, number, number, number],
  vp: Viewport,
  padding = 0.15,
): View {
  const [x0, y0, x1, y1] = rect;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const zoom = Math.min(vp.width / (w * (1 + 2 * padding)), vp.height / (h * (1 + 2 * padding)));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, zoom: Math.min(MAX_ZOOM, zoom) };
}

/**
 * Interpolation entre deux vues pour un déplacement animé : le zoom varie de façon
 * géométrique et le centre suit l'échelle, pour un mouvement perçu comme régulier.
 */
export function interpolateView(a: View, b: View, t: number): View {
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const zoom = a.zoom * (b.zoom / a.zoom) ** e;
  return { zoom, cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e };
}

/** Rectangle de la carte visible à l'écran [x0, y0, x1, y1]. */
export function visibleRect(view: View, vp: Viewport): [number, number, number, number] {
  const [x0, y0] = screenToMap(view, vp, 0, 0);
  const [x1, y1] = screenToMap(view, vp, vp.width, vp.height);
  return [x0, y0, x1, y1];
}
