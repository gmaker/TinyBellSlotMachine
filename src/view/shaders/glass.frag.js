import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * Glass overlay on the reel window: inner shadow, reflections, pay line.
 * Premultiplied output, blended over the reels.
 */
export const GLASS_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vLocal;
uniform vec2 uHalf;
uniform float uRadius;
uniform float uPayline;   // 0..1 pulse on win
uniform float uWinGlow;
uniform float uTime;
uniform float uPixel;
out vec4 fragColor;

void main() {
  vec2 p = vLocal;
  float aa = uPixel;
  float d = sdRBox(p, vec2(0.0), uHalf, uRadius);
  if (d > 0.0) discard;
  vec4 o = vec4(0.0);

  // inner shadow of the bezel + darker top (light comes from above)
  float inner = -d;
  float shadow = (1.0 - smoothstep(0.0, 0.42, inner)) * 0.6;
  float top = (1.0 - smoothstep(0.0, 1.1, uHalf.y - p.y)) * 0.4;
  float bottom = (1.0 - smoothstep(0.0, 0.5, p.y + uHalf.y)) * 0.25;
  o = over(o, vec3(0.0), max(shadow, max(top, bottom)));

  // pay line with brass end markers
  float pl = abs(p.y) - 0.028;
  vec3 plCol = mix(vec3(0.85, 0.08, 0.08), vec3(1.0, 0.86, 0.35), uPayline);
  float plA = cov(pl, aa) * (0.7 + 0.3 * uPayline);
  o = over(o, plCol, plA);
  float markers = min(sdBox(p, vec2(-uHalf.x + 0.12, 0.0), vec2(0.13, 0.11)), sdBox(p, vec2(uHalf.x - 0.12, 0.0), vec2(0.13, 0.11)));
  float tri = max(markers, abs(p.y) - (0.12 - abs(abs(p.x) - (uHalf.x - 0.25)) * 0.0));
  o = over(o, vec3(0.9, 0.7, 0.28), cov(tri, aa));
  o.rgb += plCol * uPayline * 0.35 * exp(-max(pl, 0.0) * 12.0);

  // reflections: two diagonal streaks
  float s1 = exp(-pow((p.x * 0.85 + p.y * 0.5 + 1.4) / 0.32, 2.0)) * 0.11;
  float s2 = exp(-pow((p.x * 0.85 + p.y * 0.5 - 0.5) / 0.2, 2.0)) * 0.07;
  o = over(o, vec3(1.0, 0.98, 0.95), (s1 + s2) * (1.0 - smoothstep(0.0, 0.25, inner) * 0.0));

  // warm tint when winning
  o = over(o, vec3(1.0, 0.85, 0.4), uWinGlow * 0.08 * (0.75 + 0.25 * sin(uTime * 8.0)));

  fragColor = o;
}
`;
