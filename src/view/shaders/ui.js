import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * Rounded panel / button. Circle when uRadius >= min(uHalf).
 * uState: x = hover, y = pressed, z = disabled, w = glow.
 */
export const UI_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vLocal;
in vec2 vUv;
uniform vec2 uHalf;
uniform float uRadius;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uBorder;
uniform float uBorderWidth;
uniform float uAlpha;
uniform vec4 uState;
uniform float uPixel;
out vec4 fragColor;
float band(float d, float width, float aa) { return cov(d, aa) * (1.0 - cov(d + width, aa)); }
void main() {
  vec2 p = vLocal;
  float aa = uPixel;
  float d = sdRBox(p, vec2(0.0), uHalf, min(uRadius, min(uHalf.x, uHalf.y)));
  float shape = cov(d, aa);
  if (shape <= 0.0) discard;
  float t = clamp(vUv.y, 0.0, 1.0);
  vec3 col = mix(uColorBottom, uColorTop, t);
  // bevel: light rim at the top, shadow at the bottom
  float inner = -d;
  float rimTop = (1.0 - smoothstep(0.0, 0.09, inner)) * smoothstep(0.4, 0.95, t);
  float rimBottom = (1.0 - smoothstep(0.0, 0.14, inner)) * (1.0 - smoothstep(0.05, 0.6, t));
  col += vec3(0.25) * rimTop;
  col *= 1.0 - 0.35 * rimBottom;
  // glossy highlight
  col += vec3(0.08) * smoothstep(0.55, 1.0, t) * (1.0 - smoothstep(0.0, 0.4, abs(p.x) / max(uHalf.x, 1e-3) - 0.5));
  // states
  col *= 1.0 + 0.18 * uState.x;
  col *= 1.0 - 0.28 * uState.y;
  col = mix(col, vec3(dot(col, vec3(0.33))) * 0.7, uState.z);
  col += uColorTop * 0.35 * uState.w * (0.6 + 0.4 * sin(uState.w * 3.0));
  // border
  float border = band(d, uBorderWidth, aa);
  col = mix(col, uBorder, border);
  float alpha = shape * uAlpha * (1.0 - 0.45 * uState.z);
  fragColor = vec4(col * alpha, alpha);
}
`;

/** Textured icon from the symbol atlas (premultiplied). */
export const ICON_FRAG = `${GLSL_HEADER}
in vec2 vUv;
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uCell;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  float col = mod(uCell, uAtlasGrid.x);
  float row = floor(uCell / uAtlasGrid.x);
  vec2 uv = (vec2(col, row) + vUv) / uAtlasGrid;
  fragColor = texture(uAtlas, uv) * uAlpha;
}
`;
