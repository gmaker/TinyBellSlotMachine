import { EventEmitter } from '../core/EventEmitter.js';
import { Mesh } from './Mesh.js';

const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * Owns the WebGL2 context, the drawing-buffer size and common GL state.
 * Emits `contextlost` / `contextrestored`.
 */
export class WebGLRenderer extends EventEmitter {
  /** @type {HTMLCanvasElement} */
  #canvas;
  /** @type {WebGL2RenderingContext} */
  #gl;
  #width = 0;
  #height = 0;
  #cssWidth = 0;
  #cssHeight = 0;
  #dpr = 1;
  /** @type {Mesh|null} */
  #unitQuad = null;
  /** @type {Mesh|null} */
  #clipQuad = null;
  #onLost;
  #onRestored;

  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    super();
    this.#canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not supported by this browser');
    this.#gl = gl;

    this.#onLost = (event) => {
      event.preventDefault();
      this.emit('contextlost');
    };
    this.#onRestored = () => {
      this.#unitQuad = null;
      this.#clipQuad = null;
      this.emit('contextrestored');
    };
    canvas.addEventListener('webglcontextlost', this.#onLost);
    canvas.addEventListener('webglcontextrestored', this.#onRestored);
  }

  get gl() {
    return this.#gl;
  }

  get canvas() {
    return this.#canvas;
  }

  /** Drawing buffer width in device pixels. */
  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  get cssWidth() {
    return this.#cssWidth;
  }

  get cssHeight() {
    return this.#cssHeight;
  }

  get devicePixelRatio() {
    return this.#dpr;
  }

  get isContextLost() {
    return this.#gl.isContextLost();
  }

  /** Shared unit quad (created lazily, recreated after context restore). */
  get unitQuad() {
    if (!this.#unitQuad) this.#unitQuad = Mesh.unitQuad(this.#gl);
    return this.#unitQuad;
  }

  get clipQuad() {
    if (!this.#clipQuad) this.#clipQuad = Mesh.clipQuad(this.#gl);
    return this.#clipQuad;
  }

  /**
   * Match the drawing buffer to the canvas CSS size × devicePixelRatio.
   * @returns {boolean} true when the size changed
   */
  resize() {
    const rect = this.#canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    if (width === this.#width && height === this.#height && cssWidth === this.#cssWidth) return false;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#width = width;
    this.#height = height;
    this.#cssWidth = cssWidth;
    this.#cssHeight = cssHeight;
    this.#dpr = dpr;
    return true;
  }

  /**
   * @param {number} r
   * @param {number} g
   * @param {number} b
   */
  beginFrame(r = 0, g = 0, b = 0) {
    const gl = this.#gl;
    gl.viewport(0, 0, this.#width, this.#height);
    gl.clearColor(r, g, b, 1);
    gl.clearDepth(1);
    gl.clearStencil(0);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }

  /**
   * @param {'none'|'premultiplied'|'additive'} mode
   */
  setBlend(mode) {
    const gl = this.#gl;
    if (mode === 'none') {
      gl.disable(gl.BLEND);
      return;
    }
    gl.enable(gl.BLEND);
    if (mode === 'additive') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /**
   * @param {boolean} test
   * @param {boolean} [write]
   */
  setDepth(test, write = test) {
    const gl = this.#gl;
    if (test) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(write);
  }

  dispose() {
    this.#canvas.removeEventListener('webglcontextlost', this.#onLost);
    this.#canvas.removeEventListener('webglcontextrestored', this.#onRestored);
    this.#unitQuad?.dispose();
    this.#clipQuad?.dispose();
    this.#unitQuad = null;
    this.#clipQuad = null;
    const ext = this.#gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
    this.removeAllListeners();
  }
}
