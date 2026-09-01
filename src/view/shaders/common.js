/**
 * Shared GLSL chunks. All shaders are GLSL ES 3.00 and use fixed attribute
 * locations (see Mesh.LOCATION): 0 = position, 1 = uv, 2 = data, 3 = symbols.
 */

export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

/** 2D signed-distance primitives and premultiplied compositing helpers. */
export const SDF_LIB = `
float sdCircle(vec2 p, vec2 c, float r) { return length(p - c) - r; }
float sdBox(vec2 p, vec2 c, vec2 b) {
  vec2 d = abs(p - c) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdRBox(vec2 p, vec2 c, vec2 b, float r) { return sdBox(p, c, b - r) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - w;
}
float sdEllipse(vec2 p, vec2 c, vec2 r) {
  vec2 q = (p - c) / r;
  return (length(q) - 1.0) * min(r.x, r.y);
}
vec2 rot2(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// Anti-aliased coverage of a signed distance with softness aa.
float cov(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
// Premultiplied "over" compositing.
vec4 over(vec4 base, vec3 col, float a) {
  return vec4(base.rgb * (1.0 - a) + col * a, base.a * (1.0 - a) + a);
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
`;

/**
 * World-space quad: the unit quad is scaled/positioned by `uRect` (centre, size)
 * and placed at depth `uZ`.
 */
export const QUAD_VERT = `${GLSL_HEADER}
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;
uniform mat4 uViewProj;
uniform vec4 uRect;   // centre.xy, size.xy (world units)
uniform float uZ;
out vec2 vUv;
out vec2 vLocal;      // world offset from the quad centre
out vec2 vWorld;
void main() {
  vLocal = aPosition * uRect.zw;
  vWorld = uRect.xy + vLocal;
  vUv = aUv;
  gl_Position = uViewProj * vec4(vWorld, uZ, 1.0);
}
`;

/** Full-screen clip-space quad. */
export const CLIP_VERT = `${GLSL_HEADER}
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
out vec2 vClip;
void main() {
  vUv = aUv;
  vClip = aPosition;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
