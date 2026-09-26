/**
 * Carte interactive : glisser pour déplacer, molette pour zoomer vers le curseur, survol,
 * clic (sélection), Maj+clic (second pays), double-clic (zoom). Rendu à la demande, une image
 * au plus par rafraîchissement d'écran.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { loadRoutes } from '../data/load.ts';
import { useApp } from '../store.ts';
import { DENSITY } from './colors.ts';
import { buildDensityGrid, type LayerView } from './layers.ts';
import { OverlayModel, drawOverlay } from './overlay.ts';
import { makeProjector } from './projection.ts';
import { MapRenderer } from './renderer.ts';
import {
  clampView,
  fitRect,
  initialView,
  interpolateView,
  panBy,
  screenToMap,
  zoomAt,
  type View,
  type Viewport,
} from './view.ts';

interface Props {
  data: Dataset;
  layerView: LayerView;
  /** Position de l'infobulle, mise à jour sans rendu React. */
  onPointer(x: number, y: number, inside: boolean): void;
}

/** Déplacement (en pixels) au-delà duquel un appui devient un glisser, pas un clic. */
const DRAG_THRESHOLD = 4;
const FLY_MS = 550;
/** Largeur de carte masquée par l'inspecteur (panneau et marges), en pixels CSS. */
const INSPECTOR_INSET = 464;

interface Runtime {
  renderer: MapRenderer;
  overlay: OverlayModel;
  overlayCtx: CanvasRenderingContext2D;
  view: View;
  vp: Viewport;
  dpr: number;
  anim: { from: View; to: View; start: number } | null;
  frame: number;
  layerView: LayerView;
  routesRequested: boolean;
  /** Intervalles récents entre images consécutives (mode `?debug`). */
  frameTimes: number[];
  lastFrame: number;
  /** Demande une image au prochain rafraîchissement. */
  request(): void;
}

export function MapView({ data, layerView, onPointer }: Props) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rt = useRef<Runtime | null>(null);
  const perfRef = useRef<HTMLDivElement>(null);
  const onPointerRef = useRef(onPointer);
  useLayoutEffect(() => {
    onPointerRef.current = onPointer;
  });

  // Création du rendu et des interactions (une fois par jeu de données).
  useEffect(() => {
    const canvas = glRef.current;
    const overlayCanvas = overlayRef.current;
    const host = hostRef.current;
    if (!canvas || !overlayCanvas || !host) return;
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!overlayCtx) return;
    const projector = makeProjector(data.raw.grid.header);
    let renderer: MapRenderer;
    try {
      renderer = new MapRenderer(canvas, data.raw.grid, projector.rowHalfWidth);
    } catch (e) {
      useApp
        .getState()
        .setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    const map = { width: data.width, height: data.height };
    const vp: Viewport = { width: host.clientWidth || 1, height: host.clientHeight || 1 };
    const state: Runtime = {
      renderer,
      overlay: new OverlayModel(data, projector),
      overlayCtx,
      view: initialView(map, vp),
      vp,
      dpr: window.devicePixelRatio || 1,
      anim: null,
      frame: 0,
      layerView,
      routesRequested: false,
      frameTimes: [],
      lastFrame: 0,
      request: () => undefined,
    };
    rt.current = state;
    const debug = new URLSearchParams(window.location.search).has('debug');
    const gpuTiming = debug && renderer.enableTiming();

    // Dernière position du curseur sur la carte (null s'il en est sorti).
    let pointer: [number, number] | null = null;
    let drawnView = state.view;
    const draw = (now: number): void => {
      state.frame = 0;
      if (state.anim) {
        const t = Math.min(1, (now - state.anim.start) / FLY_MS);
        state.view = clampView(interpolateView(state.anim.from, state.anim.to, t), map, state.vp);
        if (t >= 1) state.anim = null;
        else request();
      }
      // La carte a bougé sous un curseur immobile (cadrage animé, clavier) : survol à jour.
      if (state.view !== drawnView && pointer !== null && !press?.dragging) hover(...pointer);
      drawnView = state.view;
      const { hovered, selected, second } = useApp.getState();
      const lv = state.layerView;
      const scale = 1 / (state.view.zoom * state.dpr);
      const originX = state.view.cx - state.vp.width / 2 / state.view.zoom;
      const originY = state.view.cy - state.vp.height / 2 / state.view.zoom;
      renderer.render({
        mode: lv.mode,
        idLayer: lv.idLayer,
        hatch: lv.hatch,
        hover: hovered,
        sel1: selected,
        sel2: second,
        originX,
        originY,
        scale,
        dpr: state.dpr,
      });
      drawOverlay(overlayCtx, state.overlay, data, {
        view: state.view,
        vp: state.vp,
        dpr: state.dpr,
        layer: useApp.getState().layer,
        hovered,
        selected,
        second,
      });
      if (host.dataset.rendered !== 'true') host.dataset.rendered = 'true';
      if (debug && perfRef.current) {
        // Intervalle entre images successives d'une interaction continue (glisser, zoom animé).
        if (state.lastFrame > 0 && now - state.lastFrame < 250) {
          state.frameTimes.push(now - state.lastFrame);
          if (state.frameTimes.length > 60) state.frameTimes.shift();
        }
        state.lastFrame = now;
        const avg = state.frameTimes.length
          ? state.frameTimes.reduce((a, b) => a + b, 0) / state.frameTimes.length
          : 0;
        const gpu = renderer.gpuMs;
        perfRef.current.textContent = [
          gpuTiming ? `GPU ${gpu === null ? '…' : gpu.toFixed(2)} ms` : 'GPU : mesure indisponible',
          avg > 0 ? `${(1000 / avg).toFixed(0)} images/s` : null,
          `zoom ${state.view.zoom.toFixed(2)}`,
        ]
          .filter(Boolean)
          .join(' · ');
      }
    };
    const request = (): void => {
      if (state.frame === 0) state.frame = requestAnimationFrame(draw);
    };

    const resize = (): void => {
      state.vp = { width: host.clientWidth || 1, height: host.clientHeight || 1 };
      state.dpr = window.devicePixelRatio || 1;
      renderer.resize(state.vp.width, state.vp.height, state.dpr);
      overlayCanvas.width = Math.round(state.vp.width * state.dpr);
      overlayCanvas.height = Math.round(state.vp.height * state.dpr);
      state.view = clampView(state.view, map, state.vp);
      request();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const setView = (v: View): void => {
      state.anim = null;
      state.view = clampView(v, map, state.vp);
      request();
    };
    const flyTo = (target: View): void => {
      state.anim = {
        from: state.view,
        to: clampView(target, map, state.vp),
        start: performance.now(),
      };
      request();
    };

    // Survol : entité et pixel sous le curseur.
    const pick = (sx: number, sy: number): { pixel: number; entity: number } => {
      const [mx, my] = screenToMap(state.view, state.vp, sx, sy);
      const x = Math.floor(mx);
      const y = Math.floor(my);
      if (x < 0 || y < 0 || x >= data.width || y >= data.height || !projector.onGlobe(mx, my)) {
        return { pixel: -1, entity: 0 };
      }
      const pixel = y * data.width + x;
      return { pixel, entity: data.raw.grid.layers.owner[pixel] ?? 0 };
    };

    let press: { x: number; y: number; id: number; dragging: boolean } | null = null;
    const local = (e: PointerEvent | WheelEvent | MouseEvent): [number, number] => {
      const r = host.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const hover = (sx: number, sy: number): void => {
      pointer = [sx, sy];
      const { pixel, entity } = pick(sx, sy);
      const app = useApp.getState();
      if (app.hoverPixel !== pixel) app.setHoverPixel(pixel);
      if (app.hovered !== entity) {
        app.setHovered(entity);
        request();
      }
      onPointerRef.current(sx, sy, pixel >= 0);
    };
    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      const [x, y] = local(e);
      press = { x, y, id: e.pointerId, dragging: false };
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      const [x, y] = local(e);
      if (press && press.id === e.pointerId) {
        if (!press.dragging && Math.hypot(x - press.x, y - press.y) > DRAG_THRESHOLD) {
          press.dragging = true;
          host.classList.add('dragging');
        }
        if (press.dragging) {
          setView(panBy(state.view, e.movementX, e.movementY));
          onPointerRef.current(x, y, false);
          return;
        }
      }
      hover(x, y);
    };
    const onUp = (e: PointerEvent): void => {
      if (!press || press.id !== e.pointerId) return;
      const [x, y] = local(e);
      const wasDrag = press.dragging;
      press = null;
      host.classList.remove('dragging');
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
      if (wasDrag) {
        hover(x, y);
        return;
      }
      const { entity } = pick(x, y);
      useApp.getState().select(entity, e.shiftKey);
    };
    const onLeave = (): void => {
      pointer = null;
      const app = useApp.getState();
      app.setHovered(0);
      app.setHoverPixel(-1);
      onPointerRef.current(0, 0, false);
      request();
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const [x, y] = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * unit * 0.0016);
      setView(zoomAt(state.view, state.vp, x, y, factor));
      hover(x, y);
    };
    const onDblClick = (e: MouseEvent): void => {
      const [x, y] = local(e);
      flyTo(zoomAt(state.view, state.vp, x, y, 2.5));
    };
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }
      const step = 120;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const move = moves[e.key];
      if (move) {
        e.preventDefault();
        setView(panBy(state.view, move[0], move[1]));
      } else if (e.key === 'Home') {
        flyTo(initialView(map, state.vp));
      } else if (e.key === '+' || e.key === '=') {
        flyTo(zoomAt(state.view, state.vp, state.vp.width / 2, state.vp.height / 2, 1.8));
      } else if (e.key === '-') {
        flyTo(zoomAt(state.view, state.vp, state.vp.width / 2, state.vp.height / 2, 1 / 1.8));
      }
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);

    // Redessine quand la sélection, le survol ou la couche changent ; cadre sur demande.
    const unsubscribe = useApp.subscribe((s, prev) => {
      if (s.selected !== prev.selected || s.second !== prev.second || s.layer !== prev.layer)
        request();
      if (s.focus !== prev.focus && s.focus !== null) {
        const extent = data.byIndex[s.focus.index]?.extent;
        if (extent) {
          // Cadre dans la partie de la carte que l'inspecteur (à droite) ne couvre pas.
          const inset = s.selected !== 0 ? Math.min(INSPECTOR_INSET, state.vp.width * 0.45) : 0;
          const visible = { width: state.vp.width - inset, height: state.vp.height };
          const target = fitRect(extent, visible);
          flyTo({ ...target, cx: target.cx + inset / 2 / target.zoom });
        }
      }
    });
    const onContextLost = (e: Event): void => {
      e.preventDefault();
      useApp.getState().setLoad({
        state: 'error',
        message: 'Le contexte WebGL a été perdu (pilote graphique) : recharge la page.',
      });
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    state.request = request;

    return () => {
      observer.disconnect();
      unsubscribe();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (state.frame) cancelAnimationFrame(state.frame);
      renderer.dispose();
      rt.current = null;
    };
    // La couche initiale est appliquée par l'effet suivant ; le rendu ne dépend que des données.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Changement de couche : palette et textures à la demande.
  useEffect(() => {
    const state = rt.current;
    if (!state) return;
    state.layerView = layerView;
    state.renderer.setPalette(layerView.palette);
    if (layerView.mode === 'sea') {
      state.renderer.ensureSeaZones(
        data.raw.meta.seaZones.reduce((m, z) => Math.max(m, z.index), 0),
      );
      if (!state.routesRequested) {
        state.routesRequested = true;
        loadRoutes(data.raw.grid.header.width)
          .then((routes) => {
            state.overlay.setRoutes(routes);
            state.request();
          })
          .catch(() => {
            state.routesRequested = false;
          });
      }
    }
    if (layerView.mode === 'density')
      state.renderer.ensureDensity(() => buildDensityGrid(data), DENSITY);
    state.request();
  }, [layerView, data]);

  return (
    <div className="map-host" ref={hostRef} data-map-canvas="">
      <canvas className="map-gl" ref={glRef} />
      <canvas className="map-overlay" ref={overlayRef} />
      <div className="map-perf" ref={perfRef} />
    </div>
  );
}
