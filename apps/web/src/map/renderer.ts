/**
 * Rendu WebGL2 de la carte (DECISIONS D1) : couches de la grille en textures entières, palette
 * par entité, un seul triangle plein écran. Le rendu n'a lieu que sur demande (vue, survol,
 * sélection ou couche modifiés).
 */
import type { MapGrid } from '@geosim/shared';
import { oklch, type PaletteBuffer, type Rgb } from './colors.ts';
import type { HatchMode, RenderMode } from './layers.ts';
import { FRAGMENT_SHADER, HATCH_CODES, MODE_CODES, VERTEX_SHADER } from './shaders.ts';
import { BIOME_COLORS, RELIEF_BLEND, STYLE } from './style.ts';

export interface RenderState {
  mode: RenderMode;
  idLayer: 'owner' | 'sovereign';
  hatch: HatchMode;
  hover: number;
  sel1: number;
  sel2: number;
  /** Coordonnées carte du coin haut-gauche du canevas. */
  originX: number;
  originY: number;
  /** Pixels de carte par pixel physique d'écran. */
  scale: number;
  dpr: number;
}

const UNIT = {
  owner: 0,
  sovereign: 1,
  phys: 2,
  flags: 3,
  elev: 4,
  seaZone: 5,
  density: 6,
  palette: 7,
  seaPalette: 8,
  ramp: 9,
  rowHalf: 10,
} as const;

type TextureName = keyof typeof UNIT;

/** Intensité de l'ombrage du relief selon le mode. */
const RELIEF: Record<RenderMode, number> = {
  entity: 0.35,
  density: 0,
  terrain: 1.1,
  infrastructure: 0,
  sea: 0,
};

/** Extension de minuterie GPU (mesure du temps de rendu, mode `?debug`). */
interface TimerQueryExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface TexFormat {
  internal: number;
  format: number;
  type: number;
  filter: number;
}

export class MapRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly textures = new Map<TextureName, WebGLTexture>();
  private readonly width: number;
  private readonly height: number;
  private seaZoneReady = false;
  private densityReady = false;
  private timer: { ext: TimerQueryExt; pending: WebGLQuery[] } | null = null;
  /** Dernier temps GPU mesuré (ms), ou null. */
  gpuMs: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly grid: MapGrid,
    rowHalfWidth: Float32Array,
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (gl === null) throw new Error('WebGL2 indisponible : la carte ne peut pas être affichée.');
    this.gl = gl;
    this.width = grid.header.width;
    this.height = grid.header.height;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (this.width > maxSize || this.height > maxSize) {
      throw new Error(
        `Carte de ${this.width} px trop grande pour ce processeur graphique (${maxSize} px au plus) : construis-la en 4096 px.`,
      );
    }
    this.program = this.compile();
    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('WebGL2 : création du VAO impossible');
    this.vao = vao;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const L = grid.layers;
    const n = this.width * this.height;
    const phys = new Uint8Array(n * 4);
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      phys[o] = L.terrain[i] as number;
      phys[o + 1] = L.biome[i] as number;
      phys[o + 2] = L.urban[i] as number;
      phys[o + 3] = L.infrastructure[i] as number;
    }
    const U16 = {
      internal: gl.R16UI,
      format: gl.RED_INTEGER,
      type: gl.UNSIGNED_SHORT,
      filter: gl.NEAREST,
    };
    this.upload('owner', U16, this.width, this.height, L.owner);
    this.upload('sovereign', U16, this.width, this.height, L.sovereign);
    this.upload('flags', U16, this.width, this.height, L.flags);
    this.upload(
      'phys',
      { internal: gl.RGBA8UI, format: gl.RGBA_INTEGER, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST },
      this.width,
      this.height,
      phys,
    );
    this.upload(
      'elev',
      { internal: gl.R16I, format: gl.RED_INTEGER, type: gl.SHORT, filter: gl.NEAREST },
      this.width,
      this.height,
      L.elevation,
    );
    this.upload(
      'rowHalf',
      { internal: gl.R32F, format: gl.RED, type: gl.FLOAT, filter: gl.NEAREST },
      this.height,
      1,
      rowHalfWidth,
    );
    // Textures chargées à la demande : un texel en attendant (les échantillonneurs doivent
    // toujours pointer vers une texture complète du bon type).
    this.upload('seaZone', U16, 1, 1, new Uint16Array(1));
    this.upload('density', this.r8(), 1, 1, new Uint8Array(1));
    this.upload('ramp', this.rgba8(gl.LINEAR), 1, 1, new Uint8Array(4));
    this.upload('palette', this.rgba8(gl.NEAREST), 1, 1, new Uint8Array(4));
    this.upload('seaPalette', this.rgba8(gl.NEAREST), 1, 1, new Uint8Array(4));
    this.setStyle();
  }

  private r8(): TexFormat {
    const gl = this.gl;
    return { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, filter: gl.NEAREST };
  }

  private rgba8(filter: number): TexFormat {
    const gl = this.gl;
    return { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, filter };
  }

  private compile(): WebGLProgram {
    const gl = this.gl;
    const shader = (type: number, source: string): WebGLShader => {
      const s = gl.createShader(type);
      if (s === null) throw new Error('WebGL2 : création du shader impossible');
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`Shader : ${gl.getShaderInfoLog(s) ?? 'erreur de compilation'}`);
      }
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `Programme : ${gl.getProgramInfoLog(program) ?? 'erreur d’édition des liens'}`,
      );
    }
    gl.useProgram(program);
    for (const [name, unit] of Object.entries(UNIT)) {
      gl.uniform1i(gl.getUniformLocation(program, `u_${name}`), unit);
    }
    return program;
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name) ?? null;
  }

  private upload(
    name: TextureName,
    f: TexFormat,
    width: number,
    height: number,
    data: ArrayBufferView,
  ): void {
    const gl = this.gl;
    const old = this.textures.get(name);
    if (old) gl.deleteTexture(old);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + UNIT[name]);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, f.internal, width, height);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, f.format, f.type, data);
    this.textures.set(name, tex);
  }

  private setStyle(): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    const v3 = (name: string, [r, g, b]: Rgb): void =>
      gl.uniform3f(this.loc(name), r / 255, g / 255, b / 255);
    for (const [key, color] of Object.entries(STYLE)) v3(`u_${key}`, color);
    const biomes = new Float32Array(8 * 3);
    for (let k = 0; k < 8; k++) {
      const c = BIOME_COLORS[k] ?? STYLE.ocean;
      biomes.set([c[0] / 255, c[1] / 255, c[2] / 255], k * 3);
    }
    gl.uniform3fv(this.loc('u_biome'), biomes);
    const reliefColors = new Float32Array(6 * 3);
    const reliefWeights = new Float32Array(6);
    for (let k = 0; k < 6; k++) {
      const r = RELIEF_BLEND[k];
      if (r) {
        reliefColors.set([r.color[0] / 255, r.color[1] / 255, r.color[2] / 255], k * 3);
        reliefWeights[k] = r.weight;
      }
    }
    gl.uniform3fv(this.loc('u_reliefColor'), reliefColors);
    gl.uniform1fv(this.loc('u_reliefWeight'), reliefWeights);
    gl.uniform2f(this.loc('u_mapSize'), this.width, this.height);
    gl.uniform1f(this.loc('u_pixelKm'), this.grid.header.pixelSideKm);
  }

  /** Active la mesure du temps GPU si le navigateur l'autorise ; renvoie false sinon. */
  enableTiming(): boolean {
    const ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null;
    if (ext === null) return false;
    this.timer = { ext, pending: [] };
    return true;
  }

  private pollTiming(): void {
    const t = this.timer;
    if (t === null) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(t.ext.GPU_DISJOINT_EXT) as boolean;
    while (t.pending.length > 0) {
      const q = t.pending[0] as WebGLQuery;
      if (!(gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) as boolean)) break;
      if (!disjoint) this.gpuMs = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(q);
      t.pending.shift();
    }
  }

  setPalette(palette: PaletteBuffer): void {
    this.upload('palette', this.rgba8(this.gl.NEAREST), 256, palette.rows, palette.data);
  }

  /** Couleurs des zones maritimes (à la première utilisation de la couche « mer »). */
  ensureSeaZones(zoneCount: number): void {
    if (this.seaZoneReady) return;
    const L = this.grid.layers;
    const rows = Math.max(1, Math.ceil((zoneCount + 1) / 256));
    const pal = new Uint8Array(rows * 256 * 4);
    for (let z = 1; z <= zoneCount; z++) {
      // Bleus sombres et peu saturés, teintes réparties par l'angle d'or : les routes restent lisibles.
      const [r, g, b] = oklch(0.27 + 0.035 * (z % 3), 0.028, 230 + ((z * 137.508) % 120) - 60);
      pal.set([r, g, b, 255], z * 4);
    }
    this.upload('seaPalette', this.rgba8(this.gl.NEAREST), 256, rows, pal);
    this.upload(
      'seaZone',
      {
        internal: this.gl.R16UI,
        format: this.gl.RED_INTEGER,
        type: this.gl.UNSIGNED_SHORT,
        filter: this.gl.NEAREST,
      },
      this.width,
      this.height,
      L.seaZone,
    );
    this.seaZoneReady = true;
  }

  /** Densité codée par pixel et rampe de couleurs (à la première utilisation de la couche). */
  ensureDensity(build: () => Uint8Array, rampColor: (t: number) => Rgb): void {
    if (this.densityReady) return;
    this.upload('density', this.r8(), this.width, this.height, build());
    const ramp = new Uint8Array(256 * 4);
    ramp.set([10, 10, 15, 255], 0);
    for (let i = 1; i < 256; i++) ramp.set([...rampColor((i - 1) / 254), 255], i * 4);
    this.upload('ramp', this.rgba8(this.gl.NEAREST), 256, 1, ramp);
    this.densityReady = true;
  }

  /** Ajuste la taille du tampon de dessin à celle du canevas affiché. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(s: RenderState): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.loc('u_origin'), s.originX, s.originY);
    gl.uniform1f(this.loc('u_scale'), s.scale);
    gl.uniform1f(this.loc('u_canvasH'), this.canvas.height);
    gl.uniform1f(this.loc('u_dpr'), s.dpr);
    gl.uniform1i(this.loc('u_mode'), MODE_CODES[s.mode]);
    gl.uniform1i(this.loc('u_idLayer'), s.idLayer === 'owner' ? 0 : 1);
    gl.uniform1i(this.loc('u_hatch'), HATCH_CODES[s.hatch]);
    gl.uniform1ui(this.loc('u_hover'), s.hover);
    gl.uniform1ui(this.loc('u_sel1'), s.sel1);
    gl.uniform1ui(this.loc('u_sel2'), s.sel2);
    gl.uniform1f(this.loc('u_relief'), RELIEF[s.mode]);
    const t = this.timer;
    const query = t && t.pending.length < 4 ? gl.createQuery() : null;
    if (t && query) gl.beginQuery(t.ext.TIME_ELAPSED_EXT, query);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (t && query) {
      gl.endQuery(t.ext.TIME_ELAPSED_EXT);
      t.pending.push(query);
    }
    this.pollTiming();
  }

  dispose(): void {
    const gl = this.gl;
    for (const q of this.timer?.pending ?? []) gl.deleteQuery(q);
    for (const t of this.textures.values()) gl.deleteTexture(t);
    this.textures.clear();
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
