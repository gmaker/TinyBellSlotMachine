import { Mesh } from '../../gl/Mesh.js';
import { ShaderProgram } from '../../gl/ShaderProgram.js';
import { GLSL_HEADER } from '../shaders/common.js';
import { StrokeFont } from './StrokeFont.js';

const FLOATS_PER_VERTEX = 11; // px, py, ax, ay, bx, by, halfWidth, r, g, b, a
const VERTS_PER_SEGMENT = 4;

const TEXT_VERT = `${GLSL_HEADER}
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec4 aSegment;   // a.xy, b.xy (world)
layout(location = 2) in float aWidth;    // half stroke width (world)
layout(location = 3) in vec4 aColor;     // straight alpha
uniform mat4 uViewProj;
uniform float uZ;
out vec2 vPos;
flat out vec4 vSegment;
flat out float vWidth;
out vec4 vColor;
void main() {
  vPos = aPosition;
  vSegment = aSegment;
  vWidth = aWidth;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPosition, uZ, 1.0);
}
`;

const TEXT_FRAG = `${GLSL_HEADER}
in vec2 vPos;
flat in vec4 vSegment;
flat in float vWidth;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec2 pa = vPos - vSegment.xy, ba = vSegment.zw - vSegment.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float d = length(pa - ba * h) - vWidth;
  float aa = max(fwidth(d), 1e-4);
  float a = (1.0 - smoothstep(-aa, aa, d)) * vColor.a;
  fragColor = vec4(vColor.rgb * a, a);
}
`;

/**
 * Immediate-mode vector text/polyline renderer. Every stroke segment becomes a
 * quad whose fragment shader evaluates a capsule SDF, so text stays crisp at
 * any zoom and needs no font textures. Call `text()/polyline()` freely during a
 * frame, then `flush()` once per layer.
 */
export class TextRenderer {
  /** @type {WebGL2RenderingContext} */
  #gl;
  #program;
  #mesh;
  #maxSegments;
  #data;
  #segments = 0;
  #pixelWorld = 0.01;

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} [maxSegments]
   */
  constructor(gl, maxSegments = 8000) {
    this.#gl = gl;
    this.#maxSegments = maxSegments;
    this.#data = new Float32Array(maxSegments * VERTS_PER_SEGMENT * FLOATS_PER_VERTEX);
    this.#program = new ShaderProgram(gl, TEXT_VERT, TEXT_FRAG, 'text');
    const indices = new Uint32Array(maxSegments * 6);
    for (let i = 0; i < maxSegments; i++) {
      const v = i * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    }
    const stride = FLOATS_PER_VERTEX * 4;
    this.#mesh = new Mesh(gl, {
      buffers: [
        {
          data: this.#data,
          dynamic: true,
          attributes: [
            { location: 0, size: 2, stride, offset: 0 },
            { location: 1, size: 4, stride, offset: 8 },
            { location: 2, size: 1, stride, offset: 24 },
            { location: 3, size: 4, stride, offset: 28 },
          ],
        },
      ],
      indices,
      count: 0,
    });
  }

  /** World units per device pixel — used to pad quads for anti-aliasing. */
  set pixelWorld(value) {
    this.#pixelWorld = value;
  }

  /**
   * Width of a string in world units.
   * @param {string} text
   * @param {number} size cap height in world units
   * @param {{tracking?: number}} [opts]
   */
  measure(text, size, { tracking = StrokeFont.tracking } = {}) {
    let width = 0;
    for (const char of text) {
      width += this.#advanceOf(char, size, tracking);
    }
    return Math.max(0, width - tracking * size);
  }

  /**
   * Largest size (≤ `size`) at which `text` fits into `maxWidth`.
   * @param {string} text
   * @param {number} size
   * @param {number} maxWidth
   */
  fitSize(text, size, maxWidth) {
    const w = this.measure(text, size);
    return w <= maxWidth ? size : (size * maxWidth) / w;
  }

  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y baseline
   * @param {number} size cap height
   * @param {object} [opts]
   * @param {number[]} [opts.color] [r, g, b, a]
   * @param {'left'|'center'|'right'} [opts.align]
   * @param {number} [opts.weight] stroke half-width relative to size
   * @param {number} [opts.tracking]
   * @returns {number} rendered width
   */
  text(text, x, y, size, { color = [1, 1, 1, 1], align = 'left', weight = StrokeFont.strokeWidth, tracking = StrokeFont.tracking } = {}) {
    const width = this.measure(text, size, { tracking });
    let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const halfWidth = weight * size;
    const glyphWidth = StrokeFont.aspect * size;
    for (const char of text) {
      const glyph = StrokeFont.glyph(char);
      const advance = this.#advanceOf(char, size, tracking);
      if (glyph) {
        const scaleX = glyphWidth * StrokeFont.advance(char);
        for (const poly of glyph) {
          for (let i = 0; i + 3 < poly.length; i += 2) {
            this.#segment(
              cursor + poly[i] * scaleX,
              y + poly[i + 1] * size,
              cursor + poly[i + 2] * scaleX,
              y + poly[i + 3] * size,
              halfWidth,
              color,
            );
          }
          if (poly.length === 2) {
            this.#segment(cursor + poly[0] * scaleX, y + poly[1] * size, cursor + poly[0] * scaleX, y + poly[1] * size, halfWidth, color);
          }
        }
      }
      cursor += advance;
    }
    return width;
  }

  /**
   * Arbitrary polyline in world units (icons, underlines, frames).
   * @param {number[]} points flat [x0, y0, x1, y1, ...]
   * @param {number} halfWidth
   * @param {number[]} color
   * @param {boolean} [closed]
   */
  polyline(points, halfWidth, color, closed = false) {
    for (let i = 0; i + 3 < points.length; i += 2) {
      this.#segment(points[i], points[i + 1], points[i + 2], points[i + 3], halfWidth, color);
    }
    if (closed && points.length >= 4) {
      const n = points.length;
      this.#segment(points[n - 2], points[n - 1], points[0], points[1], halfWidth, color);
    }
  }

  /**
   * Upload and draw everything queued since the last flush.
   * @param {import('../../gl/Camera.js').Camera} camera
   * @param {number} [z]
   */
  flush(camera, z = 0.06) {
    if (this.#segments === 0) return;
    this.#mesh.updateBuffer(0, this.#data.subarray(0, this.#segments * VERTS_PER_SEGMENT * FLOATS_PER_VERTEX));
    this.#mesh.count = this.#segments * 6;
    this.#program.use().setMat4('uViewProj', camera.viewProj).setFloat('uZ', z);
    this.#mesh.draw();
    this.#segments = 0;
  }

  dispose() {
    this.#mesh.dispose();
    this.#program.dispose();
  }

  #advanceOf(char, size, tracking) {
    if (char === ' ' || char === ' ') return StrokeFont.space * size;
    return StrokeFont.aspect * size * StrokeFont.advance(char) + tracking * size;
  }

  #segment(ax, ay, bx, by, halfWidth, color) {
    if (this.#segments >= this.#maxSegments) return;
    let dx = bx - ax;
    let dy = by - ay;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = 1;
      dy = 0;
      len = 1;
    } else {
      dx /= len;
      dy /= len;
    }
    const pad = halfWidth + this.#pixelWorld * 1.5;
    const nx = -dy * pad;
    const ny = dx * pad;
    const ex = dx * pad;
    const ey = dy * pad;
    const corners = [
      ax - ex + nx, ay - ey + ny,
      bx + ex + nx, by + ey + ny,
      bx + ex - nx, by + ey - ny,
      ax - ex - nx, ay - ey - ny,
    ];
    let o = this.#segments * VERTS_PER_SEGMENT * FLOATS_PER_VERTEX;
    const d = this.#data;
    for (let v = 0; v < 4; v++) {
      d[o++] = corners[v * 2];
      d[o++] = corners[v * 2 + 1];
      d[o++] = ax;
      d[o++] = ay;
      d[o++] = bx;
      d[o++] = by;
      d[o++] = halfWidth;
      d[o++] = color[0];
      d[o++] = color[1];
      d[o++] = color[2];
      d[o++] = color[3] ?? 1;
    }
    this.#segments += 1;
  }
}
