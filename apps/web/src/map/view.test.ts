import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clampView,
  fitRect,
  initialView,
  interpolateView,
  mapToScreen,
  panBy,
  screenToMap,
  zoomAt,
  type View,
} from './view.ts';

const map = { width: 4096, height: 1994 };
const vp = { width: 1600, height: 900 };

describe('vue de la carte', () => {
  it('passe de l’écran à la carte et retour', () => {
    const view: View = { cx: 1000, cy: 500, zoom: 2.5 };
    const [mx, my] = screenToMap(view, vp, 123, 456);
    const [sx, sy] = mapToScreen(view, vp, mx, my);
    expect(sx).toBeCloseTo(123);
    expect(sy).toBeCloseTo(456);
    expect(screenToMap(view, vp, 800, 450)).toEqual([1000, 500]);
  });

  it('zoome en gardant fixe le point sous le curseur', () => {
    const view = initialView(map, vp);
    const before = screenToMap(view, vp, 300, 200);
    const after = screenToMap(zoomAt(view, vp, 300, 200, 3), vp, 300, 200);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('montre toute la carte au départ', () => {
    const view = initialView(map, vp);
    expect(map.width * view.zoom).toBeLessThanOrEqual(vp.width);
    expect(map.height * view.zoom).toBeLessThanOrEqual(vp.height);
  });

  it('borne le zoom et garde la carte à l’écran', () => {
    const far = clampView({ cx: -5000, cy: 99999, zoom: 1000 }, map, vp);
    expect(far.zoom).toBe(MAX_ZOOM);
    expect(far.cx).toBeGreaterThan(0);
    expect(far.cy).toBeLessThan(map.height);
    const tiny = clampView({ cx: 0, cy: 0, zoom: 1e-6 }, map, vp);
    expect(tiny.cx).toBe(map.width / 2);
    expect(tiny.cy).toBe(map.height / 2);
  });

  it('déplace la carte avec la souris', () => {
    const view: View = { cx: 1000, cy: 500, zoom: 2 };
    expect(panBy(view, 100, -50)).toEqual({ cx: 950, cy: 525, zoom: 2 });
  });

  it('cadre un rectangle', () => {
    const view = fitRect([100, 200, 300, 300], vp, 0);
    expect(view.cx).toBe(200);
    expect(view.cy).toBe(250);
    expect(view.zoom).toBe(8);
    expect(fitRect([10, 10, 10.5, 10.5], vp).zoom).toBe(MAX_ZOOM);
  });

  it('interpole entre deux vues', () => {
    const a: View = { cx: 0, cy: 0, zoom: 1 };
    const b: View = { cx: 100, cy: 50, zoom: 16 };
    expect(interpolateView(a, b, 0)).toEqual(a);
    const end = interpolateView(a, b, 1);
    expect(end.cx).toBeCloseTo(100);
    expect(end.zoom).toBeCloseTo(16);
    expect(interpolateView(a, b, 0.5).zoom).toBeCloseTo(4);
  });
});
