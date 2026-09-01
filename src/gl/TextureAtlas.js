/**
 * A grid texture atlas that is rendered *into* on the GPU (framebuffer pass).
 * No 2D canvas is involved: cells are produced by a fragment shader.
 */
export class TextureAtlas {
  /** @type {WebGL2RenderingContext} */
  #gl;
  /** @type {WebGLTexture} */
  #texture;
  #cols;
  #rows;
  #cellSize;

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {object} spec
   * @param {number} spec.cols
   * @param {number} spec.rows
   * @param {number} spec.cellSize Pixels per cell edge.
   */
  constructor(gl, { cols, rows, cellSize }) {
    this.#gl = gl;
    this.#cols = cols;
    this.#rows = rows;
    this.#cellSize = cellSize;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create atlas texture');
    this.#texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  get texture() {
    return this.#texture;
  }

  get cols() {
    return this.#cols;
  }

  get rows() {
    return this.#rows;
  }

  get width() {
    return this.#cols * this.#cellSize;
  }

  get height() {
    return this.#rows * this.#cellSize;
  }

  /**
   * Render into the atlas. `draw` receives the gl context with the atlas bound
   * as the current framebuffer and the viewport set to the atlas size.
   * @param {(gl: WebGL2RenderingContext, atlas: TextureAtlas) => void} draw
   */
  bake(draw) {
    const gl = this.#gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Failed to create framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.#texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      throw new Error(`Atlas framebuffer incomplete: 0x${status.toString(16)}`);
    }
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    draw(gl, this);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * UV rectangle of a cell.
   * @param {number} index
   * @returns {{u0:number,v0:number,u1:number,v1:number}}
   */
  uvRect(index) {
    const col = index % this.#cols;
    const row = Math.floor(index / this.#cols);
    return {
      u0: col / this.#cols,
      v0: row / this.#rows,
      u1: (col + 1) / this.#cols,
      v1: (row + 1) / this.#rows,
    };
  }

  dispose() {
    this.#gl.deleteTexture(this.#texture);
  }
}
