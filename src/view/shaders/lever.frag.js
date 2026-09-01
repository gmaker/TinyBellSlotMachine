import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * Side lever: brass housing, chrome rod and red knob. The rod swings mostly
 * towards the viewer, so the knob grows and drops as the lever is pulled.
 */
export const LEVER_FRAG = `${GLSL_HEADER}
${SDF_LIB}
in vec2 vWorld;
uniform vec2 uPivot;
uniform float uAngle;    // 0 = up, positive = pulled
uniform float uLength;
uniform float uPixel;
out vec4 fragColor;

void main() {
  vec2 p = vWorld;
  float aa = uPixel;
  float s = sin(uAngle), c = cos(uAngle);
  vec2 endPt = uPivot + vec2(0.42 * s, uLength * c);
  float ballR = 0.3 * (1.0 + 0.55 * s);
  vec4 o = vec4(0.0);

  // housing bolted to the cabinet side
  float housing = sdRBox(p, uPivot + vec2(-0.22, 0.0), vec2(0.42, 0.5), 0.14);
  vec3 brass = mix(vec3(0.45, 0.3, 0.1), vec3(0.9, 0.7, 0.32), smoothstep(-0.5, 0.5, p.y - uPivot.y + 0.2));
  o = over(o, vec3(0.0), cov(housing + 0.02, aa * 3.0) * 0.4);
  o = over(o, brass, cov(housing, aa));
  o = over(o, vec3(0.2, 0.13, 0.04), cov(max(abs(housing + 0.09) - 0.02, housing), aa));
  float axle = sdCircle(p, uPivot, 0.17);
  o = over(o, vec3(0.12, 0.1, 0.08), cov(axle, aa));
  o = over(o, vec3(0.6, 0.6, 0.62), cov(axle + 0.06, aa));
  o = over(o, vec3(0.2), cov(axle + 0.12, aa));

  // rod
  float rodW = 0.085 * (1.0 + 0.3 * s);
  float rod = sdSeg(p, uPivot, endPt, rodW);
  vec2 dir = normalize(endPt - uPivot + vec2(0.0, 1e-4));
  vec2 nrm = vec2(-dir.y, dir.x);
  float t = dot(p - uPivot, nrm) / rodW;   // -1..1 across the rod
  vec3 chrome = mix(vec3(0.92, 0.94, 0.97), vec3(0.3, 0.33, 0.38), smoothstep(-0.7, 1.0, t));
  chrome = mix(chrome, vec3(0.15), smoothstep(0.6, 1.0, abs(t)));
  o = over(o, vec3(0.05), cov(rod + 0.0, aa) * 0.0 + cov(rod - 0.025, aa) * 0.9);
  o = over(o, chrome, cov(rod, aa));

  // knob
  float ball = sdCircle(p, endPt, ballR);
  vec2 q = (p - endPt) / ballR;
  float l = dot(q, normalize(vec2(-0.55, 0.75)));
  vec3 red = mix(vec3(0.42, 0.02, 0.03), vec3(0.96, 0.18, 0.16), smoothstep(-1.0, 0.7, l));
  o = over(o, vec3(0.0), cov(ball - 0.06, aa * 3.0) * 0.45);   // soft shadow
  o = over(o, vec3(0.16, 0.0, 0.0), cov(ball - 0.025, aa));
  o = over(o, red, cov(ball, aa));
  float hl = sdEllipse(rot2(q - vec2(-0.38, 0.42), 0.8), vec2(0.0), vec2(0.22, 0.13));
  o = over(o, vec3(1.0, 0.92, 0.9), (1.0 - smoothstep(-0.1, 0.12, hl)) * 0.85 * step(ball, 0.0));

  fragColor = o;
}
`;
