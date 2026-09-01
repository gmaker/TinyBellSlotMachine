import { GLSL_HEADER, SDF_LIB } from './common.js';

/** Stencil mask for the reel window (colour output is disabled when drawn). */
export const MASK_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vLocal;
uniform vec2 uHalf;
uniform float uRadius;
out vec4 fragColor;
void main() {
  if (sdRBox(vLocal, vec2(0.0), uHalf, uRadius) > 0.0) discard;
  fragColor = vec4(0.0);
}
`;

/** Dark interior behind the reels (visible in the gaps between drums). */
export const INTERIOR_FRAG = `${GLSL_HEADER}
in vec2 vUv;
out vec4 fragColor;
void main() {
  float v = 0.03 + 0.04 * (1.0 - abs(vUv.y - 0.5) * 2.0);
  fragColor = vec4(vec3(v * 0.9, v * 0.85, v * 0.8), 1.0);
}
`;

/** Room backdrop: warm spotlight behind the machine. */
export const BACKDROP_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vClip;
uniform float uAspect;
uniform float uTime;
uniform float uFlash;
out vec4 fragColor;
void main() {
  vec2 p = vec2(vClip.x * uAspect, vClip.y);
  float r = length(p * vec2(0.8, 1.0) - vec2(0.0, 0.15));
  vec3 inner = vec3(0.16, 0.1, 0.08);
  vec3 outer = vec3(0.025, 0.018, 0.02);
  vec3 col = mix(inner, outer, smoothstep(0.2, 1.5, r));
  col *= 0.95 + 0.05 * vnoise(p * 6.0 + uTime * 0.05);
  // faint wallpaper stripes
  col += 0.012 * sin(p.x * 28.0) * (1.0 - smoothstep(0.4, 1.4, r));
  col += vec3(0.55, 0.4, 0.15) * uFlash * (1.0 - smoothstep(0.0, 1.6, r));
  fragColor = vec4(col, 1.0);
}
`;

/** Final vignette + win flash overlay (premultiplied). */
export const OVERLAY_FRAG = `${GLSL_HEADER}
in vec2 vClip;
uniform float uAspect;
uniform float uFlash;
out vec4 fragColor;
void main() {
  vec2 p = vec2(vClip.x * uAspect, vClip.y);
  float v = smoothstep(0.55, 1.7, length(p));
  vec3 flash = vec3(1.0, 0.85, 0.5) * uFlash * 0.28;
  fragColor = vec4(flash, v * 0.62);
}
`;

/** Point-sprite particles (coins / sparks). */
export const PARTICLES_VERT = `${GLSL_HEADER}
layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aSize;
layout(location = 2) in vec4 aColor;
uniform mat4 uViewProj;
uniform float uPointScale;   // projection[1][1] * viewportHeight * 0.5
out vec4 vColor;
void main() {
  gl_Position = uViewProj * vec4(aPosition, 0.2, 1.0);
  gl_PointSize = aSize * uPointScale / gl_Position.w;
  vColor = aColor;
}
`;

export const PARTICLES_FRAG = `${GLSL_HEADER}
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  float a = (1.0 - smoothstep(0.55, 1.0, d)) * vColor.a;
  // coin: bright rim, slightly darker centre
  float rim = smoothstep(0.35, 0.7, d) * 0.5;
  vec3 col = vColor.rgb * (0.75 + rim) + vec3(0.35) * (1.0 - smoothstep(0.0, 0.3, d)) * vColor.a;
  fragColor = vec4(col * a, a * 0.9);
}
`;
