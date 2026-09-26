/**
 * Shaders de la carte (GLSL ES 3.00). Un triangle couvre l'écran ; chaque fragment retrouve le
 * pixel de carte sous lui et le colore selon la couche. Rien n'est précalculé en image : changer
 * de couche ne change que des uniformes et la palette (DECISIONS D1).
 *
 * - Bordures : un pixel est en bordure si l'un de ses 4 voisins (à une distance d'au moins un
 *   pixel d'écran) a un autre identifiant ; elles restent donc fines à toutes les échelles.
 * - Dézoom : couleur de remplissage moyennée sur 2 × 2 échantillons quand un pixel d'écran
 *   couvre plusieurs pixels de carte (anticrénelage) ; bordures et relief une seule fois.
 * - Relief : ombrage discret calculé depuis la couche d'altitude (lumière au nord-ouest).
 */

export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const MODE_CODES = {
  entity: 0,
  density: 1,
  terrain: 2,
  infrastructure: 3,
  sea: 4,
} as const;

export const HATCH_CODES = { none: 0, other: 1, dark: 2 } as const;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp isampler2D;

uniform usampler2D u_owner;
uniform usampler2D u_sovereign;
uniform usampler2D u_phys;      // r terrain, g biome, b urbanisation, a infrastructures
uniform usampler2D u_flags;
uniform isampler2D u_elev;
uniform usampler2D u_seaZone;
uniform sampler2D u_density;    // densité de population codée (R8)
uniform sampler2D u_palette;    // couleur par entité (256 par ligne) ; alpha < 1 : estimation
uniform sampler2D u_seaPalette; // couleur par zone maritime
uniform sampler2D u_ramp;       // rampe 256 × 1 de la couche de densité (texel 0 : inhabité)
uniform sampler2D u_rowHalf;    // demi-largeur du globe par ligne (R32F, hauteur × 1)

uniform vec2 u_mapSize;
uniform vec2 u_origin;          // coordonnées carte du coin haut-gauche de l'écran
uniform float u_scale;          // pixels de carte par pixel d'écran (physique)
uniform float u_canvasH;
uniform float u_dpr;
uniform int u_mode;
uniform int u_idLayer;          // 0 contrôle de facto, 1 souveraineté de jure
uniform int u_hatch;            // 0 aucune, 1 couleur de l'autre entité, 2 sombre
uniform uint u_hover;
uniform uint u_sel1;
uniform uint u_sel2;
uniform float u_pixelKm;
uniform float u_relief;

uniform vec3 u_space;
uniform vec3 u_ocean;
uniform vec3 u_shore;
uniform vec3 u_lake;
uniform vec3 u_neutral;
uniform vec3 u_landDark;
uniform vec3 u_river;
uniform vec3 u_road;
uniform vec3 u_majorRoad;
uniform vec3 u_rail;
uniform vec3 u_port;
uniform vec3 u_airport;
uniform vec3 u_urban;
uniform vec3 u_strait;
uniform vec3 u_biome[8];
uniform vec3 u_reliefColor[6];
uniform float u_reliefWeight[6];

out vec4 outColor;

const uint FLAG_PORT = 16u;
const uint FLAG_AIRPORT = 32u;
const uint FLAG_STRAIT = 64u;
const uint FLAG_RIVER = 128u;
const uint INFRA_ROAD = 1u;
const uint INFRA_MAJOR = 2u;
const uint INFRA_RAIL = 4u;

ivec2 maxPx() { return ivec2(u_mapSize) - 1; }

bool onGlobe(ivec2 p) {
  if (p.x < 0 || p.y < 0 || p.x > maxPx().x || p.y > maxPx().y) return false;
  float halfWidth = texelFetch(u_rowHalf, ivec2(p.y, 0), 0).r;
  return abs(float(p.x) + 0.5 - u_mapSize.x * 0.5) <= halfWidth;
}

uint idAt(ivec2 p) {
  return u_idLayer == 0 ? texelFetch(u_owner, p, 0).r : texelFetch(u_sovereign, p, 0).r;
}

vec4 paletteOf(uint id) {
  return texelFetch(u_palette, ivec2(int(id & 255u), int(id >> 8u)), 0);
}

float elevAt(ivec2 p) {
  return float(texelFetch(u_elev, clamp(p, ivec2(0), maxPx()), 0).r);
}

// Ombrage : 1 sur terrain plat, plus clair sur les versants exposés au nord-ouest.
float hillshade(ivec2 p, int st) {
  if (u_relief <= 0.0) return 1.0;
  float d = 2.0 * float(st) * u_pixelKm * 1000.0;
  float dzdx = (elevAt(p + ivec2(st, 0)) - elevAt(p - ivec2(st, 0))) / d;
  float dzdy = (elevAt(p + ivec2(0, st)) - elevAt(p - ivec2(0, st))) / d;
  vec3 n = normalize(vec3(-dzdx * 12.0, -dzdy * 12.0, 1.0));
  vec3 light = normalize(vec3(-1.0, -1.0, 1.4));
  return 1.0 + u_relief * (dot(n, light) - light.z);
}

// Un voisin (sur 4, à st pixels) a-t-il un autre identifiant ? Hors du globe : ignoré.
bool isBorder(ivec2 p, uint id, int st, bool sovereignLayer) {
  ivec2 d[4] = ivec2[4](ivec2(st, 0), ivec2(-st, 0), ivec2(0, st), ivec2(0, -st));
  for (int k = 0; k < 4; k++) {
    ivec2 q = p + d[k];
    if (!onGlobe(q)) continue;
    uint other = sovereignLayer ? texelFetch(u_sovereign, q, 0).r : texelFetch(u_owner, q, 0).r;
    if (other != id) return true;
  }
  return false;
}

bool nearLand(ivec2 p, int st) {
  ivec2 d[4] = ivec2[4](ivec2(st, 0), ivec2(-st, 0), ivec2(0, st), ivec2(0, -st));
  for (int k = 0; k < 4; k++) {
    ivec2 q = clamp(p + d[k], ivec2(0), maxPx());
    if (texelFetch(u_phys, q, 0).r >= 2u) return true;
  }
  return false;
}

float stripe(vec2 screen, float period, float width) {
  return mod(screen.x + screen.y, period * u_dpr) < width * u_dpr ? 1.0 : 0.0;
}

vec3 highlight(vec3 c, uint id, bool border) {
  if (id == 0u) return c;
  bool sel = id == u_sel1 || id == u_sel2;
  if (sel && border) return vec3(1.0);
  if (sel) return mix(c, vec3(1.0), 0.16);
  if (id == u_hover) return mix(c, vec3(1.0), border ? 0.5 : 0.12);
  return c;
}

vec3 seaZoneColor(ivec2 p) {
  uint z = texelFetch(u_seaZone, p, 0).r;
  return z == 0u ? u_ocean : texelFetch(u_seaPalette, ivec2(int(z & 255u), int(z >> 8u)), 0).rgb;
}

// Couleur de remplissage d'un point : sans voisinage (bordures, relief), donc bon marché ; elle
// est moyennée sur plusieurs échantillons au dézoom.
vec3 fillColor(vec2 m, vec2 screen) {
  ivec2 p = ivec2(floor(m));
  if (!onGlobe(p)) return u_space;
  uvec4 phys = texelFetch(u_phys, p, 0);
  uint terrain = phys.r;
  if (terrain == 1u) return u_lake;
  if (terrain == 0u) return u_mode == 4 ? seaZoneColor(p) : u_ocean;
  if (u_mode == 0) {
    uint own = texelFetch(u_owner, p, 0).r;
    uint sov = texelFetch(u_sovereign, p, 0).r;
    uint id = u_idLayer == 0 ? own : sov;
    uint other = u_idLayer == 0 ? sov : own;
    vec4 pal = id == 0u ? vec4(u_neutral, 1.0) : paletteOf(id);
    vec3 c = pal.rgb;
    // Valeur estimée : motif pointillé.
    if (pal.a < 0.99 && mod(floor(screen.x / u_dpr), 4.0) < 1.0 && mod(floor(screen.y / u_dpr), 4.0) < 1.0) {
      c = mix(c, vec3(0.08), 0.55);
    }
    // Contrôle et souveraineté différents : hachures.
    if (u_hatch != 0 && other != id && other != 0u && id != 0u) {
      vec3 h = u_hatch == 1 ? paletteOf(other).rgb : mix(c, vec3(0.05), 0.55);
      c = mix(c, h, stripe(screen, 9.0, 3.0));
    }
    return c;
  }
  if (u_mode == 1) {
    float v = texelFetch(u_density, p, 0).r;
    return texelFetch(u_ramp, ivec2(int(v * 255.0 + 0.5), 0), 0).rgb;
  }
  if (u_mode == 2) {
    int t = int(min(terrain, 5u));
    vec3 c = u_biome[int(min(phys.g, 7u))];
    c = mix(c, u_reliefColor[t], u_reliefWeight[t]);
    if ((texelFetch(u_flags, p, 0).r & FLAG_RIVER) != 0u) c = mix(c, u_river, 0.85);
    return c;
  }
  if (u_mode == 3) {
    vec3 c = mix(u_landDark, u_urban, float(phys.b) / 255.0 * 0.85);
    uint flags = texelFetch(u_flags, p, 0).r;
    if ((flags & FLAG_RIVER) != 0u) c = mix(c, u_river, 0.6);
    uint infra = phys.a;
    if ((infra & INFRA_ROAD) != 0u) c = u_road;
    if ((infra & INFRA_MAJOR) != 0u) c = u_majorRoad;
    if ((infra & INFRA_RAIL) != 0u) c = u_rail;
    if ((flags & FLAG_AIRPORT) != 0u) c = u_airport;
    if ((flags & FLAG_PORT) != 0u) c = u_port;
    return c;
  }
  return u_landDark;
}

// Finition au pixel d'écran : bordures, relief, rivages, détroits et mise en évidence, évalués
// une seule fois au centre du pixel d'écran, à l'échelle st (≈ un pixel d'écran).
vec3 finish(vec3 c, vec2 m, int st) {
  ivec2 p = ivec2(floor(m));
  if (!onGlobe(p)) return c;
  uvec4 phys = texelFetch(u_phys, p, 0);
  if (phys.r == 1u) return c;
  if (phys.r == 0u) {
    if (u_mode != 4) return nearLand(p, st) ? mix(c, u_shore, 0.8) : c;
    ivec2 d[4] = ivec2[4](ivec2(st, 0), ivec2(-st, 0), ivec2(0, st), ivec2(0, -st));
    uint z = texelFetch(u_seaZone, p, 0).r;
    for (int k = 0; k < 4; k++) {
      ivec2 q = clamp(p + d[k], ivec2(0), maxPx());
      if (texelFetch(u_phys, q, 0).r == 0u && texelFetch(u_seaZone, q, 0).r != z) {
        c = mix(c, vec3(0.8, 0.9, 1.0), 0.25);
        break;
      }
    }
    if ((texelFetch(u_flags, p, 0).r & FLAG_STRAIT) != 0u) c = u_strait;
    return c;
  }
  uint own = texelFetch(u_owner, p, 0).r;
  c *= hillshade(p, st);
  if (u_mode == 0) {
    uint id = u_idLayer == 0 ? own : texelFetch(u_sovereign, p, 0).r;
    bool border = isBorder(p, id, st, u_idLayer == 1);
    if (border) c = mix(c, vec3(1.0), 0.38);
    return highlight(c, own, border);
  }
  bool border = own != 0u && isBorder(p, own, st, false);
  if (border) {
    if (u_mode == 2) c = mix(c, vec3(0.08), 0.45);
    else c = mix(c, vec3(0.8, 0.85, 0.92), u_mode == 3 ? 0.3 : 0.35);
  }
  return highlight(c, own, border);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_canvasH - gl_FragCoord.y);
  int st = max(1, int(floor(u_scale + 0.5)));
  vec2 m = u_origin + frag * u_scale;
  vec3 c;
  if (u_scale > 1.25) {
    // Dézoom : remplissage moyenné sur 2 × 2 échantillons (anticrénelage).
    c = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      for (int j = 0; j < 2; j++) {
        vec2 f = frag + (vec2(float(i), float(j)) - 0.5) * 0.5;
        c += fillColor(u_origin + f * u_scale, f);
      }
    }
    c *= 0.25;
  } else {
    c = fillColor(m, frag);
  }
  outColor = vec4(finish(c, m, st), 1.0);
}
`;
