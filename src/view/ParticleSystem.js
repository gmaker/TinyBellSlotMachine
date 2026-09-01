import { Mesh } from '../gl/Mesh.js';

const FLOATS_PER_PARTICLE = 7; // x, y, size, r, g, b, a

/**
 * CPU-simulated coin/spark particles rendered as GL point sprites.
 */
export class ParticleSystem {
  /** @type {WebGL2RenderingContext} */
  #gl;
  #max;
  /** @type {Float32Array} */
  #data;
  /** @type {Array<{x:number,y:number,vx:number,vy:number,size:number,r:number,g:number,b:number,life:number,maxLife:number,gravity:number}>} */
  #particles = [];
  /** @type {Mesh} */
  #mesh;

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} [max]
   */
  constructor(gl, max = 500) {
    this.#gl = gl;
    this.#max = max;
    this.#data = new Float32Array(max * FLOATS_PER_PARTICLE);
    const stride = FLOATS_PER_PARTICLE * 4;
    this.#mesh = new Mesh(gl, {
      buffers: [
        {
          data: this.#data,
          dynamic: true,
          attributes: [
            { location: 0, size: 2, stride, offset: 0 },
            { location: 1, size: 1, stride, offset: 8 },
            { location: 2, size: 4, stride, offset: 12 },
          ],
        },
      ],
      count: 0,
      mode: gl.POINTS,
    });
  }

  get count() {
    return this.#particles.length;
  }

  /**
   * @param {object} spec
   * @param {number} spec.x
   * @param {number} spec.y
   * @param {number} spec.count
   * @param {number} [spec.speed]
   * @param {number} [spec.spread] horizontal spread (world units)
   * @param {number} [spec.gravity]
   * @param {number} [spec.size]
   * @param {number} [spec.life]
   * @param {number[][]} [spec.colors] list of [r, g, b]
   */
  burst({ x, y, count, speed = 6, spread = 1.5, gravity = 14, size = 0.22, life = 1.6, colors = [[1, 0.85, 0.35]] }) {
    for (let i = 0; i < count; i++) {
      if (this.#particles.length >= this.#max) this.#particles.shift();
      const angle = Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const v = speed * (0.55 + Math.random() * 0.75);
      const color = colors[Math.floor(Math.random() * colors.length)];
      const maxLife = life * (0.7 + Math.random() * 0.6);
      this.#particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        size: size * (0.7 + Math.random() * 0.7),
        r: color[0],
        g: color[1],
        b: color[2],
        life: maxLife,
        maxLife,
        gravity,
      });
    }
  }

  /** @param {number} dt seconds */
  update(dt) {
    const alive = [];
    for (const p of this.#particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      alive.push(p);
    }
    this.#particles = alive;
    let o = 0;
    for (const p of alive) {
      const t = p.life / p.maxLife;
      const fade = Math.min(1, t * 3);
      this.#data[o++] = p.x;
      this.#data[o++] = p.y;
      this.#data[o++] = p.size * (0.8 + 0.2 * Math.sin(p.life * 20));
      this.#data[o++] = p.r;
      this.#data[o++] = p.g;
      this.#data[o++] = p.b;
      this.#data[o++] = fade;
    }
    this.#mesh.count = alive.length;
    if (alive.length > 0) {
      this.#mesh.updateBuffer(0, this.#data.subarray(0, alive.length * FLOATS_PER_PARTICLE));
    }
  }

  clear() {
    this.#particles = [];
    this.#mesh.count = 0;
  }

  /**
   * @param {import('../gl/ShaderProgram.js').ShaderProgram} program
   * @param {import('../gl/Camera.js').Camera} camera
   * @param {number} viewportHeightPx device pixels
   */
  draw(program, camera, viewportHeightPx) {
    if (this.#particles.length === 0) return;
    program.use();
    program.setMat4('uViewProj', camera.viewProj);
    program.setFloat('uPointScale', camera.projectionScaleY * viewportHeightPx * 0.5);
    this.#mesh.draw();
  }

  dispose() {
    this.#mesh.dispose();
    this.#particles = [];
  }
}
