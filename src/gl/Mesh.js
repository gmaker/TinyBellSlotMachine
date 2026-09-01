/**
 * @typedef {object} AttributeSpec
 * @property {number} location Attribute location (matches `layout(location=n)` in shaders).
 * @property {number} size Components per vertex (1..4).
 * @property {number} [stride] Byte stride for interleaved buffers (0 = tightly packed).
 * @property {number} [offset] Byte offset inside the buffer.
 * @property {boolean} [integer] Use vertexAttribIPointer.
 */

/**
 * @typedef {object} BufferSpec
 * @property {Float32Array|Int32Array} data
 * @property {AttributeSpec[]} attributes
 * @property {boolean} [dynamic]
 */

/**
 * VAO + vertex/index buffers. Attribute locations are fixed by convention so a
 * mesh can be drawn with any program that uses the same layout.
 */
export class Mesh {
  /** @type {WebGL2RenderingContext} */
  #gl;
  /** @type {WebGLVertexArrayObject} */
  #vao;
  /** @type {WebGLBuffer[]} */
  #buffers = [];
  /** @type {WebGLBuffer|null} */
  #indexBuffer = null;
  #indexType = 0;
  #count;
  #mode;

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {object} spec
   * @param {BufferSpec[]} spec.buffers
   * @param {Uint16Array|Uint32Array} [spec.indices]
   * @param {number} spec.count Vertices (or indices) to draw.
   * @param {number} [spec.mode] gl.TRIANGLES by default.
   */
  constructor(gl, { buffers, indices, count, mode = gl.TRIANGLES }) {
    this.#gl = gl;
    this.#count = count;
    this.#mode = mode;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.#vao = vao;
    gl.bindVertexArray(vao);

    for (const spec of buffers) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Failed to create buffer');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, spec.data, spec.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      for (const attr of spec.attributes) {
        gl.enableVertexAttribArray(attr.location);
        if (attr.integer) {
          gl.vertexAttribIPointer(attr.location, attr.size, gl.INT, attr.stride ?? 0, attr.offset ?? 0);
        } else {
          gl.vertexAttribPointer(attr.location, attr.size, gl.FLOAT, false, attr.stride ?? 0, attr.offset ?? 0);
        }
      }
      this.#buffers.push(buffer);
    }

    if (indices) {
      const ib = gl.createBuffer();
      if (!ib) throw new Error('Failed to create index buffer');
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.#indexBuffer = ib;
      this.#indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    }
    gl.bindVertexArray(null);
  }

  get count() {
    return this.#count;
  }

  set count(value) {
    this.#count = value;
  }

  /**
   * Re-upload a vertex buffer (dynamic geometry such as particles).
   * @param {number} bufferIndex
   * @param {ArrayBufferView} data
   */
  updateBuffer(bufferIndex, data) {
    const gl = this.#gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffers[bufferIndex]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  draw() {
    if (this.#count === 0) return;
    const gl = this.#gl;
    gl.bindVertexArray(this.#vao);
    if (this.#indexBuffer) gl.drawElements(this.#mode, this.#count, this.#indexType, 0);
    else gl.drawArrays(this.#mode, 0, this.#count);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.#gl;
    for (const b of this.#buffers) gl.deleteBuffer(b);
    if (this.#indexBuffer) gl.deleteBuffer(this.#indexBuffer);
    gl.deleteVertexArray(this.#vao);
    this.#buffers = [];
  }

  /** Attribute locations shared by all shaders. */
  static LOCATION = Object.freeze({ POSITION: 0, UV: 1, DATA: 2, SYMBOLS: 3 });

  /**
   * Unit quad centred at the origin: positions in [-0.5, 0.5], uv in [0, 1].
   * @param {WebGL2RenderingContext} gl
   */
  static unitQuad(gl) {
    // x, y, u, v
    const data = new Float32Array([
      -0.5, -0.5, 0, 0,
      0.5, -0.5, 1, 0,
      0.5, 0.5, 1, 1,
      -0.5, 0.5, 0, 1,
    ]);
    return new Mesh(gl, {
      buffers: [
        {
          data,
          attributes: [
            { location: Mesh.LOCATION.POSITION, size: 2, stride: 16, offset: 0 },
            { location: Mesh.LOCATION.UV, size: 2, stride: 16, offset: 8 },
          ],
        },
      ],
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      count: 6,
    });
  }

  /**
   * Full-screen quad in clip space ([-1, 1]).
   * @param {WebGL2RenderingContext} gl
   */
  static clipQuad(gl) {
    const data = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, 1, 1, 1, 1, -1, 1, 0, 1]);
    return new Mesh(gl, {
      buffers: [
        {
          data,
          attributes: [
            { location: Mesh.LOCATION.POSITION, size: 2, stride: 16, offset: 0 },
            { location: Mesh.LOCATION.UV, size: 2, stride: 16, offset: 8 },
          ],
        },
      ],
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      count: 6,
    });
  }
}
