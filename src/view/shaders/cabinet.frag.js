import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * The machine cabinet, drawn procedurally on a single quad at z = 0:
 * wood body, brass edging, backlit marquee, display bezel, coin tray.
 * The reel window is a hole (discard) so the reels behind show through.
 * Pixels outside the body render a soft drop shadow (premultiplied alpha).
 */
export const CABINET_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vLocal;
uniform vec2 uBodyHalf;
uniform float uBodyRadius;
uniform vec4 uWindow;      // centre.xy, half.xy
uniform float uWindowRadius;
uniform vec4 uMarquee;
uniform float uMarqueeRadius;
uniform vec4 uDisplay;
uniform float uDisplayRadius;
uniform vec4 uTray;
uniform float uTrayRadius;
uniform float uGlow;       // 0..1 win glow
uniform float uTime;
uniform float uPixel;      // world units per pixel (for AA)
out vec4 fragColor;

vec3 brass(vec2 p, float inner, float width) {
  // Bevelled brass: bright ridge in the middle of the band.
  float ridge = 1.0 - abs((inner / width) * 2.0 - 1.0);
  vec3 base = vec3(0.78, 0.58, 0.22);
  vec3 hi = vec3(1.0, 0.88, 0.5);
  vec3 lo = vec3(0.42, 0.28, 0.08);
  float sheen = 0.5 + 0.5 * sin((p.x + p.y) * 3.0 + 1.0);
  return mix(mix(lo, base, ridge), hi, ridge * ridge * (0.55 + 0.35 * sheen));
}

// Ring band: cov(d < 0) minus cov(d < -width)
float band(float d, float width, float aa) { return cov(d, aa) * (1.0 - cov(d + width, aa)); }

void main() {
  vec2 p = vLocal;
  float aa = uPixel * 0.9;
  float body = sdRBox(p, vec2(0.0), uBodyHalf, uBodyRadius);

  if (body > 0.0) {
    float shadow = exp(-body * 2.2) * 0.6 * (1.0 - smoothstep(-6.5, 6.5, p.y) * 0.4);
    fragColor = vec4(0.0, 0.0, 0.0, shadow);
    return;
  }

  float win = sdRBox(p, uWindow.xy, uWindow.zw, uWindowRadius);
  if (win < 0.0) discard;

  // --- wood body -----------------------------------------------------------
  float grain = vnoise(vec2(p.x * 1.6 + vnoise(p * 0.7) * 2.0, p.y * 22.0));
  float rings = 0.5 + 0.5 * sin(grain * 9.0 + p.y * 0.8);
  vec3 wood = mix(vec3(0.24, 0.12, 0.06), vec3(0.4, 0.21, 0.1), rings * 0.7 + 0.3 * vnoise(p * 5.0));
  wood *= 0.78 + 0.3 * smoothstep(-6.0, 6.0, p.y);
  float inner = -body;
  wood *= 0.82 + 0.18 * smoothstep(0.0, 1.6, inner);
  // soft light from top-left
  wood += vec3(0.05, 0.03, 0.01) * smoothstep(0.0, 8.0, -p.x + p.y);
  vec3 col = wood;

  // dark inlay groove following the body edge
  col *= 1.0 - 0.45 * band(body + 0.36, 0.05, aa);

  // --- reel window bezel ---------------------------------------------------
  float bezelW = 0.24;
  col *= 1.0 - 0.5 * exp(-max(win - bezelW, 0.0) * 4.0);
  float bezel = band(win - bezelW, bezelW, aa);
  col = mix(col, brass(p, win, bezelW) * (0.85 + 0.35 * (1.0 - smoothstep(0.0, 0.1, win))), bezel);

  // --- marquee panel ------------------------------------------------------
  float mq = sdRBox(p, uMarquee.xy, uMarquee.zw, uMarqueeRadius);
  vec2 mqUv = (p - uMarquee.xy) / uMarquee.zw;
  float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
  vec3 backlit = mix(vec3(0.9, 0.55, 0.16), vec3(1.0, 0.9, 0.55), 1.0 - length(mqUv * vec2(0.8, 1.0)) * 0.6);
  backlit *= 0.72 + 0.12 * pulse + 0.45 * uGlow;
  // brushed vertical light rays inside the marquee
  backlit += 0.05 * sin(mqUv.x * 40.0 + uTime * 1.5) * (1.0 - abs(mqUv.y));
  col = mix(col, backlit, cov(mq + 0.08, aa));
  col = mix(col, brass(p, mq + 0.2, 0.2), band(mq, 0.2, aa));
  // bulbs along the marquee top and bottom
  float bulbs = 1e9;
  for (int i = 0; i < 9; i++) {
    float x = uMarquee.x - uMarquee.z + (float(i) + 0.5) * (2.0 * uMarquee.z / 9.0);
    bulbs = min(bulbs, sdCircle(p, vec2(x, uMarquee.y + uMarquee.w + 0.24), 0.1));
    bulbs = min(bulbs, sdCircle(p, vec2(x, uMarquee.y - uMarquee.w - 0.24), 0.1));
  }
  float blink = 0.55 + 0.45 * sin(uTime * 6.0 + floor((p.x + 10.0) * 1.4) * 2.1);
  blink = mix(blink, 1.0, uGlow);
  vec3 bulbCol = mix(vec3(0.45, 0.2, 0.05), vec3(1.0, 0.85, 0.45), blink);
  col = mix(col, vec3(0.3, 0.18, 0.06), cov(bulbs - 0.04, aa));
  col = mix(col, bulbCol, cov(bulbs, aa));
  col += bulbCol * 0.25 * blink * exp(-max(bulbs, 0.0) * 9.0);

  // --- credit display panel -----------------------------------------------
  float dp = sdRBox(p, uDisplay.xy, uDisplay.zw, uDisplayRadius);
  col = mix(col, vec3(0.02, 0.022, 0.026), cov(dp, aa));
  col = mix(col, brass(p, dp + 0.14, 0.14), band(dp, 0.14, aa));

  // --- coin tray ----------------------------------------------------------
  float tray = sdRBox(p, uTray.xy, uTray.zw, uTrayRadius);
  vec3 trayCol = vec3(0.05, 0.045, 0.045) * (0.6 + 0.4 * smoothstep(-0.4, 0.3, p.y - uTray.y));
  col = mix(col, trayCol, cov(tray, aa));
  col = mix(col, brass(p, tray + 0.12, 0.12), band(tray, 0.12, aa));

  // --- rivets -------------------------------------------------------------
  float rivets = 1e9;
  for (int i = 0; i < 4; i++) {
    vec2 s = vec2(float(i % 2) * 2.0 - 1.0, float(i / 2) * 2.0 - 1.0);
    rivets = min(rivets, sdCircle(p, s * (uBodyHalf - 0.62), 0.11));
  }
  col = mix(col, brass(p, rivets + 0.11, 0.11) * (0.7 + 0.5 * smoothstep(0.1, -0.1, rivets + 0.06)), cov(rivets, aa));

  // --- outer brass edge ---------------------------------------------------
  float edgeW = 0.2;
  col = mix(col, brass(p, inner, edgeW), band(body, edgeW, aa));

  fragColor = vec4(col, 1.0);
}
`;
