import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * Seven-segment LED display (credits / win). Digits arrive as an int array,
 * -1 = blank. Off segments stay faintly visible like a real LED module.
 */
export const DISPLAY_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vLocal;
in vec2 vUv;
uniform vec2 uHalf;
uniform int uDigits[6];
uniform int uCount;
uniform vec3 uColor;
uniform float uFlash;   // extra brightness pulse
out vec4 fragColor;

int segMask(int d) {
  if (d == 0) return 0x3F;
  if (d == 1) return 0x06;
  if (d == 2) return 0x5B;
  if (d == 3) return 0x4F;
  if (d == 4) return 0x66;
  if (d == 5) return 0x6D;
  if (d == 6) return 0x7D;
  if (d == 7) return 0x07;
  if (d == 8) return 0x7F;
  if (d == 9) return 0x6F;
  return 0;
}

void main() {
  vec2 p = vLocal;
  float panel = sdRBox(p, vec2(0.0), uHalf, 0.08);
  if (panel > 0.0) discard;
  vec3 col = vec3(0.018, 0.02, 0.024);

  float cellW = (uHalf.x * 2.0) / float(uCount);
  float x = p.x + uHalf.x;
  int idx = clamp(int(floor(x / cellW)), 0, uCount - 1);
  vec2 q = vec2(mod(x, cellW) / cellW, vUv.y);
  q = (q - 0.5) * vec2(2.5, 2.25);
  q.x -= q.y * 0.08;   // slight italic
  float aa = fwidth(q.x) * 1.2;

  int digit = uDigits[idx];
  int mask = digit < 0 ? 0 : segMask(digit);
  vec2 hz = vec2(0.34, 0.075);
  vec2 vt = vec2(0.075, 0.33);
  vec2 centers[7];
  vec2 halves[7];
  centers[0] = vec2(0.0, 0.76);  halves[0] = hz;   // a
  centers[1] = vec2(0.42, 0.38); halves[1] = vt;   // b
  centers[2] = vec2(0.42, -0.38); halves[2] = vt;  // c
  centers[3] = vec2(0.0, -0.76); halves[3] = hz;   // d
  centers[4] = vec2(-0.42, -0.38); halves[4] = vt; // e
  centers[5] = vec2(-0.42, 0.38); halves[5] = vt;  // f
  centers[6] = vec2(0.0, 0.0);   halves[6] = hz;   // g
  vec3 lit = uColor * (1.0 + uFlash * 0.6);
  for (int i = 0; i < 7; i++) {
    float d = sdRBox(q, centers[i], halves[i], 0.05);
    float on = float((mask >> i) & 1);
    vec3 segCol = mix(uColor * 0.07, lit, on);
    col = mix(col, segCol, cov(d, aa));
    col += lit * 0.22 * on * exp(-max(d, 0.0) * 7.0);
  }
  // glass gloss on the display
  col += vec3(0.05, 0.055, 0.06) * smoothstep(0.25, 0.95, vUv.y);
  fragColor = vec4(col, 1.0);
}
`;
