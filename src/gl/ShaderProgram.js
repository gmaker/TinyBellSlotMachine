/**
 * Compiles, links and wraps a WebGL2 program with cached uniform locations.
 */
export class ShaderProgram {
  /** @type {WebGL2RenderingContext} */
  #gl;
  /** @type {WebGLProgram} */
  #program;
  /** @type {Map<string, WebGLUniformLocation|null>} */
  #uniforms = new Map();
  #name;

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {string} vertexSource
   * @param {string} fragmentSource
   * @param {string} [name] used in error messages
   */
  constructor(gl, vertexSource, fragmentSource, name = 'program') {
    this.#gl = gl;
    this.#name = name;
    const vs = ShaderProgram.#compile(gl, gl.VERTEX_SHADER, vertexSource, `${name}.vert`);
    const fs = ShaderProgram.#compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${name}.frag`);
    const program = gl.createProgram();
    if (!program) throw new Error(`Failed to create program ${name}`);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Link error in ${name}: ${log}`);
    }
    this.#program = program;
  }

  get name() {
    return this.#name;
  }

  get handle() {
    return this.#program;
  }

  use() {
    this.#gl.useProgram(this.#program);
    return this;
  }

  /**
   * @param {string} name
   * @returns {WebGLUniformLocation|null}
   */
  uniform(name) {
    if (!this.#uniforms.has(name)) {
      this.#uniforms.set(name, this.#gl.getUniformLocation(this.#program, name));
    }
    return this.#uniforms.get(name) ?? null;
  }

  /** @param {string} name @param {number} v */
  setFloat(name, v) {
    this.#gl.uniform1f(this.uniform(name), v);
    return this;
  }

  /** @param {string} name @param {number} v */
  setInt(name, v) {
    this.#gl.uniform1i(this.uniform(name), v);
    return this;
  }

  /** @param {string} name @param {Int32Array|number[]} values */
  setIntArray(name, values) {
    this.#gl.uniform1iv(this.uniform(name), values);
    return this;
  }

  /** @param {string} name @param {number} x @param {number} y */
  setVec2(name, x, y) {
    this.#gl.uniform2f(this.uniform(name), x, y);
    return this;
  }

  /** @param {string} name @param {number} x @param {number} y @param {number} z */
  setVec3(name, x, y, z) {
    this.#gl.uniform3f(this.uniform(name), x, y, z);
    return this;
  }

  /** @param {string} name @param {number} x @param {number} y @param {number} z @param {number} w */
  setVec4(name, x, y, z, w) {
    this.#gl.uniform4f(this.uniform(name), x, y, z, w);
    return this;
  }

  /** @param {string} name @param {Float32Array} m */
  setMat4(name, m) {
    this.#gl.uniformMatrix4fv(this.uniform(name), false, m);
    return this;
  }

  /**
   * @param {string} name
   * @param {WebGLTexture} texture
   * @param {number} unit
   */
  setTexture(name, texture, unit = 0) {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uniform(name), unit);
    return this;
  }

  dispose() {
    this.#gl.deleteProgram(this.#program);
    this.#uniforms.clear();
  }

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} type
   * @param {string} source
   * @param {string} label
   */
  static #compile(gl, type, source, label) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`Failed to create shader ${label}`);
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Compile error in ${label}:\n${log}\n${numberLines(source)}`);
    }
    return shader;
  }
}

function numberLines(source) {
  return source
    .trim()
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3)}: ${line}`)
    .join('\n');
}
