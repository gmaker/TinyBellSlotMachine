import { GLSL_HEADER, SDF_LIB } from './common.js';

/**
 * Reel tape: a closed cylinder of 20 stops around the X axis. Every vertex
 * carries (stopIndex, v within stop, u across) and the stop's two symbol ids.
 * `uPosition` (in stops) rotates the cylinder; the stop at the pay line is the
 * one whose index equals `uPosition`, index-1 sits above, index+1 below.
 */
export const TAPE_VERT = `${GLSL_HEADER}
layout(location = 2) in vec3 aData;     // stopIndex, localV (0 = top edge), u
layout(location = 3) in vec2 aSymbols;  // atlas ids, y < 0 when single symbol
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform float uPosition;   // reel position in stops
uniform float uRadius;
uniform float uStopAngle;
uniform float uWidth;
flat out vec2 vSymbols;
flat out float vStop;
out vec2 vUv;
out float vAngle;
void main() {
  float stopOffset = uPosition - (aData.x + aData.y - 0.5); // > 0 above the pay line
  float ang = stopOffset * uStopAngle;
  vec3 p = vec3((aData.z - 0.5) * uWidth, uRadius * sin(ang), uRadius * cos(ang) - uRadius);
  // wrap to [-PI, PI) so shading stays correct while the position runs far beyond one turn
  vAngle = mod(ang + 3.14159265, 6.28318531) - 3.14159265;
  vUv = vec2(aData.z, aData.y);
  vSymbols = aSymbols;
  vStop = aData.x;
  gl_Position = uViewProj * uModel * vec4(p, 1.0);
}
`;

export const TAPE_FRAG = `${GLSL_HEADER}
${SDF_LIB}
flat in vec2 vSymbols;
flat in float vStop;
in vec2 vUv;
in float vAngle;
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform vec2 uCellSize;     // world size of a stop cell (w, h)
uniform float uSymbolSize;  // world size of a glyph
uniform float uHighlight;   // 0..1 glow on the centre stop
uniform float uCenterStop;  // stop index at the pay line (for highlight)
uniform float uTime;
out vec4 fragColor;

vec4 sampleSymbol(float id, vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  float col = mod(id, uAtlasGrid.x);
  float row = floor(id / uAtlasGrid.x);
  return texture(uAtlas, (vec2(col, row) + uv) / uAtlasGrid);
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);   // glyph space is y-up
  vec3 paper = vec3(0.95, 0.92, 0.84);
  paper *= 0.97 + 0.03 * vnoise(uv * vec2(60.0, 30.0) + vStop * 7.0);
  // stop separators
  float edge = min(vUv.y, 1.0 - vUv.y);
  vec3 col = mix(vec3(0.55, 0.5, 0.42), paper, smoothstep(0.0, 0.03, edge));
  // subtle stripe band behind glyphs
  col = mix(col, vec3(0.9, 0.86, 0.76), 0.25 * (1.0 - smoothstep(0.42, 0.48, abs(uv.y - 0.5))));

  vec4 sym;
  if (vSymbols.y < 0.0) {
    vec2 g = (uv - 0.5) * (uCellSize / uSymbolSize) + 0.5;
    sym = sampleSymbol(vSymbols.x, g);
  } else {
    float side = step(0.5, uv.x);
    vec2 halfUv = vec2((uv.x - 0.5 * side) * 2.0, uv.y);
    float glyph = uSymbolSize * 0.82;
    vec2 g = (halfUv - 0.5) * (vec2(uCellSize.x * 0.5, uCellSize.y) / glyph) + 0.5;
    sym = sampleSymbol(mix(vSymbols.x, vSymbols.y, side), g);
    // thin "+" between the two symbols
    float plus = min(sdBox(uv, vec2(0.5, 0.5), vec2(0.028, 0.008)), sdBox(uv, vec2(0.5, 0.5), vec2(0.008, 0.045)));
    col = mix(col, vec3(0.35, 0.3, 0.25), cov(plus, 0.004));
  }
  col = col * (1.0 - sym.a) + sym.rgb;

  // cylinder shading: darker towards the top/bottom of the drum
  // exaggerated curvature so the drum reads as a cylinder inside the narrow window
  float c = max(cos(clamp(vAngle * 2.3, -1.55, 1.55)), 0.0);
  col *= 0.22 + 0.78 * pow(c, 1.1);
  // specular streak slightly above the pay line
  col += 0.14 * exp(-pow((vAngle - 0.3) / 0.16, 2.0));
  // win highlight on the centre stop
  float isCenter = step(abs(vStop - uCenterStop), 0.5);
  float pulse = 0.75 + 0.25 * sin(uTime * 9.0);
  col += uHighlight * isCenter * pulse * vec3(0.42, 0.32, 0.06) * pow(c, 4.0);

  fragColor = vec4(col, 1.0);
}
`;
