import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * Procedural SDF symbols, rendered once into the texture atlas (premultiplied
 * alpha). Cell ids: 0 Seven, 1 Bar, 2 Melon, 3 Bell, 4 Plum, 5 Orange,
 * 6 Cherry, 7 Lemon. Each symbol is drawn in a [-1, 1] local space.
 */
export const SYMBOLS_FRAG = `${GLSL_HEADER}
${SDF_LIB}
uniform vec2 uAtlasGrid;   // cols, rows
uniform vec2 uResolution;  // atlas pixels
out vec4 fragColor;

const float AA = 0.014;
vec4 paint(vec4 base, vec3 col, float d) { return over(base, col, cov(d, AA)); }
vec4 paintSoft(vec4 base, vec3 col, float d, float soft, float strength) {
  return over(base, col, (1.0 - smoothstep(-soft, soft, d)) * strength);
}
// Highlight blob clipped to a shape (d < 0 inside shape).
vec4 gloss(vec4 base, vec2 p, vec2 c, vec2 r, float ang, float shapeD, float strength) {
  float hl = sdEllipse(rot2(p - c, ang), vec2(0.0), r);
  return paintSoft(base, vec3(1.0, 0.98, 0.94), max(hl, shapeD + 0.02), 0.08, strength);
}

vec4 symSeven(vec2 p) {
  vec4 o = vec4(0.0);
  float bar = sdBox(p, vec2(0.0, 0.58), vec2(0.56, 0.13));
  float diag = sdSeg(p, vec2(0.42, 0.58), vec2(-0.18, -0.72), 0.16);
  float d = min(bar, diag);
  o = paint(o, vec3(0.42, 0.02, 0.03), d - 0.07);
  vec3 red = mix(vec3(0.95, 0.16, 0.14), vec3(0.72, 0.05, 0.07), smoothstep(-0.7, 0.7, -p.y));
  o = paint(o, red, d);
  float shine = sdSeg(p, vec2(0.34, 0.5), vec2(-0.14, -0.55), 0.035);
  o = paintSoft(o, vec3(1.0, 0.62, 0.55), max(shine, d + 0.05), 0.03, 0.85);
  return o;
}

vec4 symBar(vec2 p) {
  vec4 o = vec4(0.0);
  float box = sdRBox(p, vec2(0.0), vec2(0.86, 0.42), 0.14);
  o = paint(o, vec3(0.05, 0.05, 0.06), box);
  float frame = max(abs(box + 0.09) - 0.035, box);
  o = paint(o, vec3(0.88, 0.68, 0.22), frame);
  float w = 0.062;
  // B
  vec2 b0 = vec2(-0.6, 0.0);
  float B = sdSeg(p, b0 + vec2(0.0, -0.24), b0 + vec2(0.0, 0.24), w);
  float ring1 = abs(length(p - (b0 + vec2(0.02, 0.12))) - 0.12) - w; ring1 = max(ring1, b0.x - p.x);
  float ring2 = abs(length(p - (b0 + vec2(0.02, -0.12))) - 0.12) - w; ring2 = max(ring2, b0.x - p.x);
  B = min(B, min(ring1, ring2));
  // A
  float A = min(sdSeg(p, vec2(-0.2, -0.24), vec2(0.0, 0.26), w), sdSeg(p, vec2(0.2, -0.24), vec2(0.0, 0.26), w));
  A = min(A, sdSeg(p, vec2(-0.1, -0.04), vec2(0.1, -0.04), w));
  // R
  vec2 r0 = vec2(0.4, 0.0);
  float R = sdSeg(p, r0 + vec2(0.0, -0.24), r0 + vec2(0.0, 0.24), w);
  float ring3 = abs(length(p - (r0 + vec2(0.02, 0.12))) - 0.12) - w; ring3 = max(ring3, r0.x - p.x);
  R = min(R, ring3);
  R = min(R, sdSeg(p, r0 + vec2(0.08, 0.0), r0 + vec2(0.26, -0.24), w));
  float letters = min(B, min(A, R));
  o = paint(o, vec3(0.97, 0.96, 0.92), letters);
  return o;
}

vec4 symMelon(vec2 p) {
  vec4 o = vec4(0.0);
  vec2 c = vec2(0.0, 0.32);
  float disc = sdCircle(p, c, 0.9);
  float cut = p.y - c.y;                 // keep the lower half (bowl-shaped slice)
  float slice = max(disc, cut);
  o = paint(o, vec3(0.05, 0.34, 0.12), slice);
  o = paint(o, vec3(0.62, 0.86, 0.5), max(disc + 0.1, cut));
  vec3 flesh = mix(vec3(0.98, 0.32, 0.32), vec3(0.85, 0.12, 0.2), smoothstep(-0.2, 0.8, -p.y));
  o = paint(o, flesh, max(disc + 0.17, cut));
  float seeds = 1e9;
  seeds = min(seeds, sdEllipse(rot2(p - vec2(-0.32, -0.05), 0.5), vec2(0.0), vec2(0.05, 0.1)));
  seeds = min(seeds, sdEllipse(rot2(p - vec2(0.0, -0.22), 0.0), vec2(0.0), vec2(0.05, 0.1)));
  seeds = min(seeds, sdEllipse(rot2(p - vec2(0.32, -0.05), -0.5), vec2(0.0), vec2(0.05, 0.1)));
  seeds = min(seeds, sdEllipse(rot2(p - vec2(-0.14, 0.12), 0.3), vec2(0.0), vec2(0.045, 0.09)));
  seeds = min(seeds, sdEllipse(rot2(p - vec2(0.16, 0.12), -0.3), vec2(0.0), vec2(0.045, 0.09)));
  o = paint(o, vec3(0.08, 0.05, 0.05), seeds);
  return o;
}

vec4 symBell(vec2 p) {
  vec4 o = vec4(0.0);
  float dome = sdCircle(p, vec2(0.0, 0.24), 0.42);
  float body = sdRBox(p, vec2(0.0, -0.1), vec2(0.42, 0.36), 0.2);
  float flare = sdRBox(p, vec2(0.0, -0.38), vec2(0.6, 0.12), 0.1);
  float d = smin(dome, body, 0.15);
  d = smin(d, flare, 0.12);
  float rim = sdRBox(p, vec2(0.0, -0.5), vec2(0.68, 0.08), 0.06);
  float knob = sdCircle(p, vec2(0.0, 0.7), 0.11);
  float clapper = sdCircle(p, vec2(0.0, -0.66), 0.12);
  float bell = min(min(d, rim), knob);
  o = paint(o, vec3(0.35, 0.2, 0.02), clapper - 0.04);
  o = paint(o, vec3(0.7, 0.48, 0.1), clapper);
  o = paint(o, vec3(0.42, 0.26, 0.02), bell - 0.05);
  vec3 gold = mix(vec3(1.0, 0.86, 0.32), vec3(0.78, 0.52, 0.08), smoothstep(-0.3, 0.6, p.x - p.y * 0.3));
  o = paint(o, gold, bell);
  o = paint(o, vec3(0.62, 0.4, 0.05), max(abs(p.y + 0.42) - 0.015, bell));
  o = gloss(o, p, vec2(-0.18, 0.2), vec2(0.07, 0.24), -0.15, bell, 0.75);
  return o;
}

vec4 symPlum(vec2 p) {
  vec4 o = vec4(0.0);
  float body = sdEllipse(p, vec2(0.0, -0.08), vec2(0.6, 0.64));
  vec3 col = mix(vec3(0.66, 0.3, 0.8), vec3(0.3, 0.08, 0.45), smoothstep(-0.6, 0.6, p.x - p.y * 0.5));
  o = paint(o, vec3(0.18, 0.03, 0.28), body - 0.045);
  o = paint(o, col, body);
  float cleft = sdSeg(p, vec2(0.06, 0.5), vec2(0.16, -0.45), 0.02);
  o = paintSoft(o, vec3(0.28, 0.07, 0.38), max(cleft, body + 0.03), 0.03, 0.8);
  o = gloss(o, p, vec2(-0.26, 0.2), vec2(0.09, 0.22), -0.6, body, 0.7);
  float stem = sdSeg(p, vec2(0.0, 0.5), vec2(0.12, 0.84), 0.04);
  o = paint(o, vec3(0.38, 0.22, 0.08), stem);
  float leaf = sdEllipse(rot2(p - vec2(0.34, 0.74), 0.7), vec2(0.0), vec2(0.24, 0.09));
  o = paint(o, vec3(0.16, 0.5, 0.18), leaf);
  o = paint(o, vec3(0.3, 0.72, 0.3), max(leaf + 0.05, -(p.y - 0.74) - 0.0));
  return o;
}

vec4 symOrange(vec2 p) {
  vec4 o = vec4(0.0);
  float body = sdCircle(p, vec2(0.0, -0.06), 0.64);
  vec3 col = mix(vec3(1.0, 0.64, 0.12), vec3(0.86, 0.38, 0.04), smoothstep(-0.7, 0.7, p.x - p.y));
  col *= 0.94 + 0.06 * vnoise(p * 14.0);
  o = paint(o, vec3(0.5, 0.2, 0.02), body - 0.045);
  o = paint(o, col, body);
  float navel = sdCircle(p, vec2(0.06, -0.6), 0.05);
  o = paint(o, vec3(0.62, 0.3, 0.05), max(navel, body + 0.02));
  o = gloss(o, p, vec2(-0.24, 0.2), vec2(0.1, 0.2), -0.7, body, 0.65);
  float stem = sdSeg(p, vec2(0.0, 0.52), vec2(0.06, 0.7), 0.04);
  o = paint(o, vec3(0.4, 0.24, 0.08), stem);
  float leaf = sdEllipse(rot2(p - vec2(0.28, 0.66), 0.5), vec2(0.0), vec2(0.24, 0.09));
  o = paint(o, vec3(0.18, 0.52, 0.2), leaf);
  return o;
}

vec4 symCherry(vec2 p) {
  vec4 o = vec4(0.0);
  vec2 c1 = vec2(-0.36, -0.38), c2 = vec2(0.34, -0.28);
  float r = 0.3;
  float stem1 = sdSeg(p, c1 + vec2(0.06, 0.22), vec2(0.06, 0.66), 0.045);
  float stem2 = sdSeg(p, c2 + vec2(-0.06, 0.22), vec2(0.06, 0.66), 0.045);
  o = paint(o, vec3(0.42, 0.26, 0.1), min(stem1, stem2));
  float leaf = sdEllipse(rot2(p - vec2(0.36, 0.66), 0.55), vec2(0.0), vec2(0.28, 0.1));
  o = paint(o, vec3(0.16, 0.5, 0.18), leaf);
  float rib = sdSeg(p, vec2(0.12, 0.54), vec2(0.6, 0.78), 0.012);
  o = paint(o, vec3(0.1, 0.36, 0.12), max(rib, leaf + 0.03));
  float d1 = sdCircle(p, c1, r), d2 = sdCircle(p, c2, r);
  vec3 col1 = mix(vec3(0.98, 0.2, 0.22), vec3(0.6, 0.02, 0.08), smoothstep(-0.3, 0.3, (p.x - c1.x) - (p.y - c1.y)));
  vec3 col2 = mix(vec3(0.98, 0.2, 0.22), vec3(0.6, 0.02, 0.08), smoothstep(-0.3, 0.3, (p.x - c2.x) - (p.y - c2.y)));
  o = paint(o, vec3(0.35, 0.0, 0.05), min(d1, d2) - 0.04);
  o = paint(o, col1, d1);
  o = paint(o, col2, d2);
  o = gloss(o, p, c1 + vec2(-0.1, 0.1), vec2(0.05, 0.1), -0.6, d1, 0.7);
  o = gloss(o, p, c2 + vec2(-0.1, 0.1), vec2(0.05, 0.1), -0.6, d2, 0.7);
  return o;
}

vec4 symLemon(vec2 p) {
  vec4 o = vec4(0.0);
  float body = sdEllipse(p, vec2(0.0, 0.0), vec2(0.74, 0.5));
  float tip1 = sdCircle(p, vec2(0.76, 0.03), 0.11);
  float tip2 = sdCircle(p, vec2(-0.76, -0.03), 0.11);
  float d = smin(body, min(tip1, tip2), 0.08);
  vec3 col = mix(vec3(1.0, 0.93, 0.28), vec3(0.86, 0.7, 0.06), smoothstep(-0.6, 0.6, p.x - p.y * 0.7));
  col *= 0.95 + 0.05 * vnoise(p * 16.0);
  o = paint(o, vec3(0.5, 0.4, 0.02), d - 0.045);
  o = paint(o, col, d);
  o = gloss(o, p, vec2(-0.3, 0.2), vec2(0.16, 0.08), 0.35, d, 0.65);
  float leaf = sdEllipse(rot2(p - vec2(-0.56, 0.42), 0.9), vec2(0.0), vec2(0.2, 0.07));
  o = paint(o, vec3(0.2, 0.55, 0.22), leaf);
  return o;
}

void main() {
  vec2 cellSize = uResolution / uAtlasGrid;
  vec2 cell = floor(gl_FragCoord.xy / cellSize);
  vec2 local = fract(gl_FragCoord.xy / cellSize);
  int id = int(cell.y) * int(uAtlasGrid.x) + int(cell.x);
  vec2 p = (local - 0.5) * 2.2;   // ~9% transparent padding around every glyph
  vec4 o;
  if (id == 0) o = symSeven(p);
  else if (id == 1) o = symBar(p);
  else if (id == 2) o = symMelon(p);
  else if (id == 3) o = symBell(p);
  else if (id == 4) o = symPlum(p);
  else if (id == 5) o = symOrange(p);
  else if (id == 6) o = symCherry(p);
  else o = symLemon(p);
  fragColor = o;
}
`;
