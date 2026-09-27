/**
 * Surcouche 2D de la carte (canevas au-dessus du WebGL) : noms des pays au centre de leur
 * territoire (taille selon la surface), capitales et villes selon le zoom, détroits et routes
 * maritimes dans la couche « mer ». Placement glouton sans chevauchement, plus grands d'abord.
 */
import { isLand, type MapRoute, type MapRoutes } from '@geosim/shared';
import type { Dataset } from '../data/dataset.ts';
import { toCss } from './colors.ts';
import { unitLabelPixels } from './labels.ts';
import type { LayerId } from './layers.ts';
import { splitAtAntimeridian, type MapProjector } from './projection.ts';
import { CHOKEPOINT_COLORS, STYLE } from './style.ts';
import { mapToScreen, visibleRect, type View, type Viewport } from './view.ts';

interface Label {
  index: number;
  text: string;
  x: number;
  y: number;
  /** Côté équivalent du territoire, en pixels de carte (racine du nombre de pixels). */
  extent: number;
  /** Territoire dépendant (Groenland…) : nom en italique. */
  dependency: boolean;
}

/** Surface minimale (pixels) d'un territoire dépendant pour recevoir son propre nom. */
const DEPENDENCY_LABEL_PIXELS = 100;

interface Place {
  x: number;
  y: number;
  name: string;
  population: number;
  capital: boolean;
  entity: number;
}

interface Marker {
  x: number;
  y: number;
  name: string;
  status: 'open' | 'contested' | 'closed';
}

interface InfraPoint {
  x: number;
  y: number;
  name: string;
  kind: 'port' | 'airport';
  scalerank: number;
}

type Rect = [number, number, number, number];

function overlaps(a: Rect, list: readonly Rect[]): boolean {
  for (const b of list) {
    if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) return true;
  }
  return false;
}

/** Taille de police d'un nom de pays : la plus grande qui tient dans le territoire, bornée. */
export function labelFontSize(extentPx: number, chars: number): number {
  return Math.min(22, extentPx / (0.62 * Math.max(3, chars)));
}

export const MIN_LABEL_SIZE = 10;

export class OverlayModel {
  readonly labels: Label[];
  readonly places: Place[];
  readonly chokepoints: Marker[];
  readonly infra: InfraPoint[];
  readonly seaLabels: { x: number; y: number; name: string }[];
  private routes: Map<string, MapRoute> | null = null;
  private readonly routeCache = new Map<string, [number, number][][]>();

  constructor(
    private readonly data: Dataset,
    private readonly projector: MapProjector,
  ) {
    const w = data.width;
    this.labels = this.buildLabels();
    this.labels.sort((a, b) => b.extent - a.extent);

    this.places = [];
    for (const c of data.raw.meta.cities) {
      this.places.push({
        x: (c.pixel % w) + 0.5,
        y: Math.floor(c.pixel / w) + 0.5,
        name: c.nameFr || c.name,
        population: c.population,
        capital: c.capital,
        entity: c.entity,
      });
    }
    this.places.sort(
      (a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population,
    );

    this.chokepoints = [];
    for (const c of data.raw.world.chokepoints) {
      const p = c.lonLat ? projector.project(c.lonLat[0], c.lonLat[1]) : null;
      if (p) this.chokepoints.push({ x: p[0], y: p[1], name: c.nameFr, status: c.status.value });
    }

    this.infra = [];
    for (const p of data.raw.meta.ports) {
      this.infra.push({
        x: (p.pixel % w) + 0.5,
        y: Math.floor(p.pixel / w) + 0.5,
        name: p.name,
        kind: 'port',
        scalerank: p.scalerank,
      });
    }
    for (const a of data.raw.meta.airports) {
      this.infra.push({
        x: (a.pixel % w) + 0.5,
        y: Math.floor(a.pixel / w) + 0.5,
        name: a.name,
        kind: 'airport',
        scalerank: a.scalerank,
      });
    }

    this.seaLabels = [];
    for (const z of data.raw.meta.seaZones) {
      if (z.labelLonLat === null) continue;
      const p = projector.project(z.labelLonLat[0], z.labelLonLat[1]);
      if (p) this.seaLabels.push({ x: p[0], y: p[1], name: z.nameFr });
    }
  }

  /**
   * Noms des entités à leur point d'étiquette, sauf quand ce point tombe dans un de leurs
   * territoires dépendants (Danemark → Groenland) : le nom va alors sur le territoire principal,
   * et les grands territoires dépendants reçoivent leur propre nom.
   */
  private buildLabels(): Label[] {
    const data = this.data;
    const w = data.width;
    const L = data.raw.grid.layers;
    const units = data.raw.meta.units;
    const maxUnit = units.reduce((m, u) => Math.max(m, u.index), 0);
    const byIndex = new Map(units.map((u) => [u.index, u]));
    const wanted = new Set<number>();
    const moved = new Map<number, number>();
    for (const e of data.list) {
      const at = e.map.label?.pixel;
      const u = at === undefined ? undefined : byIndex.get(L.unit[at] ?? 0);
      if (u && u.role !== 'main' && u.owner === e.index) {
        const main = units
          .filter((x) => x.owner === e.index && x.role === 'main')
          .sort((a, b) => b.pixels - a.pixels)[0];
        if (main) {
          wanted.add(main.index);
          moved.set(e.index, main.index);
        }
      }
    }
    for (const u of units)
      if (u.role !== 'main' && u.pixels >= DEPENDENCY_LABEL_PIXELS) wanted.add(u.index);
    // Pixels des unités retenues encore tenus par leur entité (hors zones occupées).
    const region = new Uint16Array(L.unit.length);
    for (let p = 0; p < region.length; p++) {
      const u = L.unit[p] as number;
      if (wanted.has(u) && L.owner[p] === byIndex.get(u)?.owner) region[p] = u;
    }
    const unitPixel = unitLabelPixels(
      region,
      (p) => isLand(L.terrain[p] as number),
      w,
      data.height,
      maxUnit,
    );
    const at = (pixel: number): { x: number; y: number } => ({
      x: (pixel % w) + 0.5,
      y: Math.floor(pixel / w) + 0.5,
    });
    const labels: Label[] = [];
    for (const e of data.list) {
      const mainUnit = moved.get(e.index);
      const pixel =
        mainUnit !== undefined ? (unitPixel[mainUnit] ?? -1) : (e.map.label?.pixel ?? -1);
      if (pixel < 0) continue;
      const pixels =
        mainUnit !== undefined ? (byIndex.get(mainUnit)?.pixels ?? 0) : e.map.stats.pixels;
      labels.push({
        index: e.index,
        text: e.nameFr,
        ...at(pixel),
        extent: Math.sqrt(pixels),
        dependency: false,
      });
    }
    for (const u of units) {
      if (u.role === 'main' || u.pixels < DEPENDENCY_LABEL_PIXELS) continue;
      const pixel = unitPixel[u.index] ?? -1;
      if (pixel < 0) continue;
      labels.push({
        index: u.owner,
        text: u.nameFr,
        ...at(pixel),
        extent: Math.sqrt(u.pixels),
        dependency: true,
      });
    }
    return labels;
  }

  setRoutes(routes: MapRoutes): void {
    this.routes = new Map(
      routes.routes.map((r) => [r.a < r.b ? `${r.a}>${r.b}` : `${r.b}>${r.a}`, r]),
    );
    this.routeCache.clear();
  }

  get hasRoutes(): boolean {
    return this.routes !== null;
  }

  /** Tracé projeté de la route principale entre deux entités (dans un sens ou dans l'autre). */
  routePath(a: string, b: string): [number, number][][] | null {
    const key = a < b ? `${a}>${b}` : `${b}>${a}`;
    const cached = this.routeCache.get(key);
    if (cached) return cached;
    const route = this.routes?.get(key);
    if (route === undefined) return null;
    const parts = splitAtAntimeridian(route.primary.path)
      .map((part) =>
        part
          .map(([lon, lat]) => this.projector.project(lon, lat))
          .filter((p): p is [number, number] => p !== null),
      )
      .filter((part) => part.length > 1);
    this.routeCache.set(key, parts);
    return parts;
  }

  /** Flux à tracer : les plus gros échanges bilatéraux, ou ceux du pays sélectionné. */
  tradeFlows(selectedId: string | null, count: number): { a: string; b: string; value: number }[] {
    const totals = new Map<string, { a: string; b: string; value: number }>();
    for (const [i, j, v] of this.data.pairEntries('pair.trade')) {
      if (typeof v !== 'number') continue;
      if (selectedId !== null && i !== selectedId && j !== selectedId) continue;
      const [a, b] = i < j ? [i, j] : [j, i];
      const key = `${a}>${b}`;
      const t = totals.get(key) ?? { a, b, value: 0 };
      t.value += v;
      totals.set(key, t);
    }
    return [...totals.values()].sort((x, y) => y.value - x.value).slice(0, count);
  }
}

export interface OverlayState {
  view: View;
  vp: Viewport;
  dpr: number;
  layer: LayerId;
  hovered: number;
  selected: number;
  second: number;
}

const TEXT_FILL = 'rgba(255, 255, 255, 0.94)';
const TEXT_HALO = 'rgba(6, 10, 16, 0.78)';

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  weight: number,
  align: CanvasTextAlign = 'center',
  fill = TEXT_FILL,
  italic = false,
): void {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 5);
  ctx.strokeStyle = TEXT_HALO;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  model: OverlayModel,
  data: Dataset,
  s: OverlayState,
): void {
  const { view, vp, dpr } = s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vp.width, vp.height);
  const [vx0, vy0, vx1, vy1] = visibleRect(view, vp);
  const visible = (x: number, y: number, margin = 0): boolean =>
    x >= vx0 - margin && x <= vx1 + margin && y >= vy0 - margin && y <= vy1 + margin;
  const placed: Rect[] = [];

  // Routes et détroits (couche « mer »), sous les noms.
  if (s.layer === 'sea') {
    const selectedId = s.selected ? (data.byIndex[s.selected]?.id ?? null) : null;
    const flows = model.tradeFlows(selectedId, selectedId ? 12 : 40);
    const max = flows[0]?.value ?? 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const f of flows) {
      const parts = model.routePath(f.a, f.b);
      if (parts === null) continue;
      ctx.strokeStyle = 'rgba(159, 211, 255, 0.55)';
      ctx.lineWidth = 0.8 + 3.2 * Math.sqrt(f.value / max);
      for (const part of parts) {
        ctx.beginPath();
        part.forEach(([x, y], k) => {
          const [sx, sy] = mapToScreen(view, vp, x, y);
          if (k === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    }
    if (view.zoom >= 1.2) {
      for (const z of model.seaLabels) {
        if (!visible(z.x, z.y)) continue;
        const [sx, sy] = mapToScreen(view, vp, z.x, z.y);
        drawText(ctx, z.name, sx, sy, 10, 400, 'center', 'rgba(170, 205, 235, 0.8)');
      }
    }
    for (const c of model.chokepoints) {
      if (!visible(c.x, c.y, 20)) continue;
      const [sx, sy] = mapToScreen(view, vp, c.x, c.y);
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r, sy);
      ctx.lineTo(sx, sy + r);
      ctx.lineTo(sx - r, sy);
      ctx.closePath();
      ctx.fillStyle = toCss(CHOKEPOINT_COLORS[c.status]);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.stroke();
      placed.push([sx - r, sy - r, sx + r, sy + r]);
      const labelRect: Rect = [sx + r + 2, sy - 7, sx + r + 8 + c.name.length * 6.6, sy + 7];
      if (!overlaps(labelRect, placed)) {
        placed.push(labelRect);
        drawText(ctx, c.name, sx + r + 4, sy, 11, 600, 'left');
      }
    }
  }

  // Ports et aéroports (couche « infrastructures »), sous forme de marqueurs fixes à l'écran.
  if (s.layer === 'infrastructure') {
    const minScale = view.zoom >= 6 ? Infinity : view.zoom >= 2 ? 6 : 2;
    for (const p of model.infra) {
      if (p.scalerank > minScale) continue;
      if (!visible(p.x, p.y, 8)) continue;
      const [sx, sy] = mapToScreen(view, vp, p.x, p.y);
      const r = 3;
      const rect: Rect = [sx - r, sy - r, sx + r, sy + r];
      if (overlaps(rect, placed)) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = toCss(p.kind === 'port' ? STYLE.port : STYLE.airport);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.stroke();
      placed.push(rect);
    }
  }

  // Noms des pays : sélection et survol d'abord, puis par taille décroissante.
  const priority = new Set([s.selected, s.second, s.hovered].filter((i) => i !== 0));
  const ordered = [
    ...model.labels.filter((l) => priority.has(l.index) && !l.dependency),
    ...model.labels.filter((l) => !priority.has(l.index) || l.dependency),
  ];
  for (const l of ordered) {
    const important = priority.has(l.index) && !l.dependency;
    let size = labelFontSize(l.extent * view.zoom, l.text.length);
    if (size < MIN_LABEL_SIZE) {
      if (!important) continue;
      size = MIN_LABEL_SIZE + 1;
    }
    if (!visible(l.x, l.y, l.extent)) continue;
    const [sx, sy] = mapToScreen(view, vp, l.x, l.y);
    // Largeur estimée (chasse moyenne d'une police grasse) et marge de séparation.
    const w = l.text.length * size * 0.64 + 8;
    const rect: Rect = [sx - w / 2, sy - size * 0.65, sx + w / 2, sy + size * 0.65];
    if (!important && overlaps(rect, placed)) continue;
    placed.push(rect);
    if (l.dependency)
      drawText(ctx, l.text, sx, sy, size * 0.85, 500, 'center', 'rgba(235, 240, 245, 0.85)', true);
    else drawText(ctx, l.text, sx, sy, size, important ? 700 : 600);
  }

  // Capitales et villes, selon le zoom.
  const minPopulation =
    view.zoom >= 12 ? 0 : view.zoom >= 6 ? 250_000 : view.zoom >= 3 ? 1_000_000 : Infinity;
  const showCapitals = view.zoom >= 0.9;
  if (!showCapitals) return;
  const showNames = view.zoom >= 2.2;
  for (const p of model.places) {
    if (!p.capital && p.population < minPopulation) continue;
    if (!visible(p.x, p.y, 10)) continue;
    const [sx, sy] = mapToScreen(view, vp, p.x, p.y);
    const r = p.capital ? 3 : 2;
    const labelSize = p.capital ? 11 : 10;
    const labelRect: Rect = [
      sx + r + 2,
      sy - labelSize * 0.6,
      sx + r + 4 + p.name.length * labelSize * 0.56,
      sy + labelSize * 0.6,
    ];
    const dotRect: Rect = [sx - r, sy - r, sx + r, sy + r];
    if (!p.capital && overlaps(dotRect, placed)) continue;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = p.capital ? '#ffffff' : 'rgba(235, 235, 235, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.stroke();
    if (p.capital) {
      ctx.beginPath();
      ctx.arc(sx, sy, r + 2.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    placed.push(dotRect);
    if (showNames && !overlaps(labelRect, placed)) {
      placed.push(labelRect);
      drawText(
        ctx,
        p.name,
        sx + r + 4,
        sy,
        labelSize,
        p.capital ? 600 : 500,
        'left',
        'rgba(240, 244, 248, 0.92)',
      );
    }
  }
}
