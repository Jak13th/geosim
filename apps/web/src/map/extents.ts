/**
 * Emprise de chaque entité sur la carte, pour la recherche (« aller à ») et le bouton de cadrage.
 *
 * On cadre le cœur du territoire : la composante connexe de la capitale (ou la plus grande), plus
 * les composantes proches et assez grandes (îles d'un archipel, Alaska…). Les territoires lointains
 * (Guyane et outre-mer pour la France, Groenland pour le Danemark, Tchoukotka de l'autre côté de
 * l'antiméridien) n'étirent donc pas le cadrage.
 */

export type Extent = [number, number, number, number];

/** Taille minimale d'un cadrage, en pixels de carte (micro-États). */
const MIN_EXTENT = 40;
/** Part minimale du territoire pour qu'une composante secondaire compte. */
const MIN_SHARE = 0.01;
/** Distance maximale d'une composante secondaire, en diagonales de la composante principale. */
const NEAR_FACTOR = 0.6;
/** Distance maximale minimale, en pixels (petits archipels). */
const NEAR_MIN = 24;

interface Component {
  owner: number;
  area: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Composantes connexes (8-voisinage) des pixels de même propriétaire. */
function components(
  owner: Uint16Array,
  width: number,
  height: number,
): { list: Component[]; label: Int32Array } {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const list: Component[] = [];
  for (let start = 0; start < n; start++) {
    const id = owner[start] as number;
    if (id === 0 || (label[start] as number) >= 0) continue;
    const c: Component = { owner: id, area: 0, x0: width, y0: height, x1: 0, y1: 0 };
    const k = list.length;
    list.push(c);
    let top = 0;
    stack[top++] = start;
    label[start] = k;
    while (top > 0) {
      const p = stack[--top] as number;
      const x = p % width;
      const y = (p - x) / width;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (y < c.y0) c.y0 = y;
      if (x + 1 > c.x1) c.x1 = x + 1;
      if (y + 1 > c.y1) c.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) continue;
          const q = yy * width + xx;
          if (owner[q] === id && (label[q] as number) < 0) {
            label[q] = k;
            stack[top++] = q;
          }
        }
      }
    }
  }
  return { list, label };
}

function gap(a: Component, b: Component): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Emprises par index d'entité (null si l'entité n'a aucun pixel). `anchorPixel` : pixel de la
 * capitale (ou null), qui désigne la composante principale.
 */
export function computeExtents(
  owner: Uint16Array,
  width: number,
  height: number,
  entityCount: number,
  anchorPixel: (index: number) => number | null,
): (Extent | null)[] {
  const n = entityCount + 1;
  const { list, label } = components(owner, width, height);
  const byEntity: Component[][] = Array.from({ length: n }, () => []);
  for (const c of list) if (c.owner < n) byEntity[c.owner]?.push(c);

  const out: (Extent | null)[] = new Array<Extent | null>(n).fill(null);
  const grow = (a: number, b: number): [number, number] => {
    const missing = MIN_EXTENT - (b - a);
    return missing > 0 ? [a - missing / 2, b + missing / 2] : [a, b];
  };
  for (let id = 1; id < n; id++) {
    const comps = byEntity[id] ?? [];
    if (comps.length === 0) continue;
    const total = comps.reduce((s, c) => s + c.area, 0);
    const anchor = anchorPixel(id);
    const anchored = anchor === null ? undefined : list[label[anchor] ?? -1];
    const main =
      anchored?.owner === id ? anchored : comps.reduce((a, b) => (b.area > a.area ? b : a));
    const reach = Math.max(
      NEAR_MIN,
      NEAR_FACTOR * Math.hypot(main.x1 - main.x0, main.y1 - main.y0),
    );
    let { x0, y0, x1, y1 } = main;
    for (const c of comps) {
      if (c === main || c.area < MIN_SHARE * total || gap(c, main) > reach) continue;
      x0 = Math.min(x0, c.x0);
      y0 = Math.min(y0, c.y0);
      x1 = Math.max(x1, c.x1);
      y1 = Math.max(y1, c.y1);
    }
    const [ax, bx] = grow(x0, x1);
    const [ay, by] = grow(y0, y1);
    out[id] = [ax, ay, bx, by];
  }
  return out;
}
