import { Mesh } from '../gl/Mesh.js';
import { ShaderProgram } from '../gl/ShaderProgram.js';
import { TextureAtlas } from '../gl/TextureAtlas.js';
import { translation } from '../gl/mat4.js';
import { REEL_STRIPS } from '../math/SlotMath.js';
import { ParticleSystem } from './ParticleSystem.js';
import { ATLAS_SPEC, LAYOUT, SYMBOL_ATLAS_INDEX } from './layout.js';
import { CLIP_VERT, QUAD_VERT } from './shaders/common.js';
import { CABINET_FRAG } from './shaders/cabinet.frag.js';
import { DISPLAY_FRAG } from './shaders/display.frag.js';
import { GLASS_FRAG } from './shaders/glass.frag.js';
import { LEVER_FRAG } from './shaders/lever.frag.js';
import { BACKDROP_FRAG, INTERIOR_FRAG, MASK_FRAG, OVERLAY_FRAG, PARTICLES_FRAG, PARTICLES_VERT } from './shaders/misc.js';
import { SYMBOLS_FRAG } from './shaders/symbols.frag.js';
import { TAPE_FRAG, TAPE_VERT } from './shaders/tape.js';

const TAPE_SUBDIVISIONS = 6;
const COIN_COLORS = [
  [1.0, 0.86, 0.38],
  [1.0, 0.72, 0.2],
  [0.95, 0.95, 0.8],
];

/**
 * Everything that is drawn: cabinet, reels, glass, lever, LED displays,
 * particles and post effects. Holds all GL resources so they can be rebuilt
 * after a context restore.
 */
export class SlotMachineView {
  #renderer;
  #camera;
  #reelSet;
  #reducedMotion;
  /** @type {Record<string, ShaderProgram>} */
  #programs = {};
  /** @type {Mesh[]} */
  #tapeMeshes = [];
  /** @type {TextureAtlas|null} */
  #atlas = null;
  /** @type {ParticleSystem|null} */
  #particles = null;
  #leverAngle = 0;
  #credits = new Int32Array(6).fill(-1);
  #win = new Int32Array(6).fill(-1);
  #fx = { winGlow: 0, payline: 0, flash: 0, shake: 0, displayFlash: 0, highlightStops: [-1, -1, -1] };
  #time = 0;

  /**
   * @param {object} deps
   * @param {import('../gl/WebGLRenderer.js').WebGLRenderer} deps.renderer
   * @param {import('../gl/Camera.js').Camera} deps.camera
   * @param {import('../reels/ReelSet.js').ReelSet} deps.reelSet
   * @param {boolean} [deps.reducedMotion]
   */
  constructor({ renderer, camera, reelSet, reducedMotion = false }) {
    this.#renderer = renderer;
    this.#camera = camera;
    this.#reelSet = reelSet;
    this.#reducedMotion = reducedMotion;
    this.createResources();
  }

  /** @param {boolean} value */
  set reducedMotion(value) {
    this.#reducedMotion = value;
  }

  /** (Re)create every GL resource. Safe to call after a context restore. */
  createResources() {
    const gl = this.#renderer.gl;
    this.disposeResources();
    const P = (name, vs, fs) => new ShaderProgram(gl, vs, fs, name);
    this.#programs = {
      backdrop: P('backdrop', CLIP_VERT, BACKDROP_FRAG),
      overlay: P('overlay', CLIP_VERT, OVERLAY_FRAG),
      mask: P('mask', QUAD_VERT, MASK_FRAG),
      interior: P('interior', QUAD_VERT, INTERIOR_FRAG),
      cabinet: P('cabinet', QUAD_VERT, CABINET_FRAG),
      glass: P('glass', QUAD_VERT, GLASS_FRAG),
      lever: P('lever', QUAD_VERT, LEVER_FRAG),
      display: P('display', QUAD_VERT, DISPLAY_FRAG),
      tape: P('tape', TAPE_VERT, TAPE_FRAG),
      symbols: P('symbols', CLIP_VERT, SYMBOLS_FRAG),
      particles: P('particles', PARTICLES_VERT, PARTICLES_FRAG),
    };

    this.#atlas = new TextureAtlas(gl, ATLAS_SPEC);
    this.#atlas.bake(() => {
      this.#programs.symbols.use();
      this.#programs.symbols.setVec2('uAtlasGrid', ATLAS_SPEC.cols, ATLAS_SPEC.rows);
      this.#programs.symbols.setVec2('uResolution', this.#atlas.width, this.#atlas.height);
      this.#renderer.clipQuad.draw();
    });

    this.#tapeMeshes = REEL_STRIPS.map((strip) => buildTapeMesh(gl, strip));
    this.#particles = new ParticleSystem(gl, 600);
  }

  disposeResources() {
    for (const p of Object.values(this.#programs)) p.dispose();
    this.#programs = {};
    for (const m of this.#tapeMeshes) m.dispose();
    this.#tapeMeshes = [];
    this.#atlas?.dispose();
    this.#atlas = null;
    this.#particles?.dispose();
    this.#particles = null;
  }

  dispose() {
    this.disposeResources();
  }

  /** @param {number} radians */
  setLeverAngle(radians) {
    this.#leverAngle = radians;
  }

  /**
   * @param {number} credits
   * @param {number} win
   */
  setDisplays(credits, win) {
    toDigits(credits, LAYOUT.creditsDisplay.digits, this.#credits);
    toDigits(win, LAYOUT.winDisplay.digits, this.#win, win > 0);
  }

  /** Called when a spin is accepted: drop previous win visuals. */
  clearWin() {
    this.#fx.winGlow = 0;
    this.#fx.payline = 0;
    this.#fx.highlightStops = [-1, -1, -1];
  }

  /** @param {number} reelIndex */
  onReelStopped(reelIndex) {
    this.#fx.flash = Math.max(this.#fx.flash, 0.05);
    if (!this.#reducedMotion) this.#fx.shake = Math.max(this.#fx.shake, 0.012 + reelIndex * 0.002);
  }

  /**
   * @param {import('../math/SlotMath.js').SpinResult} result
   */
  triggerWin(result) {
    if (!result.rule) return;
    this.#fx.winGlow = 1;
    this.#fx.payline = 1;
    this.#fx.displayFlash = 1;
    this.#fx.highlightStops = [...result.indices];
    const big = result.payout >= 100;
    this.#fx.flash = result.isJackpot ? 1 : big ? 0.7 : 0.35;
    if (result.isJackpot && !this.#reducedMotion) this.#fx.shake = 0.16;
    const count = this.#reducedMotion ? Math.min(20, result.payout) : Math.min(160, 12 + result.payout * 0.9);
    this.spawnCoins(count, result.isJackpot ? 9 : 6.5);
  }

  /**
   * Coins flying out of the tray.
   * @param {number} count
   * @param {number} [speed]
   */
  spawnCoins(count, speed = 6) {
    const [x, y] = LAYOUT.tray.center;
    this.#particles?.burst({ x, y: y + 0.3, count: Math.round(count), speed, spread: LAYOUT.tray.half[0] * 1.6, gravity: 13, size: 0.24, life: 1.7, colors: COIN_COLORS });
  }

  /**
   * @param {number} dt
   * @param {number} time
   */
  update(dt, time) {
    this.#time = time;
    const fx = this.#fx;
    fx.flash = Math.max(0, fx.flash - dt * 1.6);
    fx.winGlow = Math.max(0, fx.winGlow - dt * 0.22);
    fx.payline = Math.max(0, fx.payline - dt * 0.3);
    fx.displayFlash = Math.max(0, fx.displayFlash - dt * 0.8);
    fx.shake = Math.max(0, fx.shake - dt * 0.14);
    if (fx.shake > 0 && !this.#reducedMotion) {
      this.#camera.setShake(Math.sin(time * 43) * fx.shake, Math.cos(time * 37) * fx.shake * 0.7);
    } else {
      this.#camera.setShake(0, 0);
    }
    this.#particles?.update(dt);
  }

  render() {
    const r = this.#renderer;
    const gl = r.gl;
    const cam = this.#camera;
    const P = this.#programs;
    const quad = r.unitQuad;
    const time = this.#time;
    const pixel = cam.worldPerPixel / r.devicePixelRatio;
    const vp = cam.viewProj;
    const fx = this.#fx;

    r.beginFrame(0.02, 0.015, 0.02);

    // 1. backdrop
    r.setDepth(false);
    r.setBlend('none');
    P.backdrop.use().setFloat('uAspect', cam.aspect).setFloat('uTime', time).setFloat('uFlash', fx.flash);
    r.clipQuad.draw();

    // 2. stencil mask of the reel window
    const W = LAYOUT.window;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.colorMask(false, false, false, false);
    P.mask.use().setMat4('uViewProj', vp).setVec4('uRect', W.center[0], W.center[1], W.half[0] * 2, W.half[1] * 2).setFloat('uZ', 0);
    P.mask.setVec2('uHalf', W.half[0], W.half[1]).setFloat('uRadius', W.radius);
    quad.draw();
    gl.colorMask(true, true, true, true);

    // 3. interior + reels, clipped by the stencil
    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    r.setDepth(true);
    P.interior.use().setMat4('uViewProj', vp).setVec4('uRect', W.center[0], W.center[1], W.half[0] * 2.2, W.half[1] * 2.6).setFloat('uZ', -8.5);
    quad.draw();

    const R = LAYOUT.reel;
    const tape = P.tape.use();
    tape.setMat4('uViewProj', vp);
    tape.setFloat('uRadius', R.radius).setFloat('uStopAngle', R.stopAngle).setFloat('uWidth', R.width);
    tape.setVec2('uAtlasGrid', ATLAS_SPEC.cols, ATLAS_SPEC.rows);
    tape.setVec2('uCellSize', R.width, R.stopHeight).setFloat('uSymbolSize', R.symbolSize);
    tape.setFloat('uTime', time);
    tape.setTexture('uAtlas', /** @type {TextureAtlas} */ (this.#atlas).texture, 0);
    this.#reelSet.reels.forEach((reel, i) => {
      tape.setMat4('uModel', translation(R.xPositions[i], R.centerY, R.z));
      tape.setFloat('uPosition', reel.position);
      tape.setFloat('uCenterStop', fx.highlightStops[i]);
      tape.setFloat('uHighlight', fx.highlightStops[i] >= 0 ? fx.winGlow : 0);
      this.#tapeMeshes[i].draw();
    });
    gl.disable(gl.STENCIL_TEST);

    // 4. cabinet (window is a hole; shadow outside the body uses alpha)
    r.setDepth(true, true);
    r.setBlend('premultiplied');
    const B = LAYOUT.body;
    const cab = P.cabinet.use();
    cab.setMat4('uViewProj', vp).setVec4('uRect', B.center[0], B.center[1], B.half[0] * 2 + 1.8, B.half[1] * 2 + 1.8).setFloat('uZ', 0);
    cab.setVec2('uBodyHalf', B.half[0], B.half[1]).setFloat('uBodyRadius', B.radius);
    cab.setVec4('uWindow', W.center[0], W.center[1], W.half[0], W.half[1]).setFloat('uWindowRadius', W.radius);
    const M = LAYOUT.marquee;
    cab.setVec4('uMarquee', M.center[0], M.center[1], M.half[0], M.half[1]).setFloat('uMarqueeRadius', M.radius);
    const D = LAYOUT.display;
    cab.setVec4('uDisplay', D.center[0], D.center[1], D.half[0], D.half[1]).setFloat('uDisplayRadius', D.radius);
    const T = LAYOUT.tray;
    cab.setVec4('uTray', T.center[0], T.center[1], T.half[0], T.half[1]).setFloat('uTrayRadius', T.radius);
    cab.setFloat('uGlow', fx.winGlow).setFloat('uTime', time).setFloat('uPixel', pixel);
    quad.draw();

    // 5. glass over the window
    r.setDepth(true, false);
    const glass = P.glass.use();
    glass.setMat4('uViewProj', vp).setVec4('uRect', W.center[0], W.center[1], W.half[0] * 2, W.half[1] * 2).setFloat('uZ', 0.01);
    glass.setVec2('uHalf', W.half[0], W.half[1]).setFloat('uRadius', W.radius);
    glass.setFloat('uPayline', fx.payline).setFloat('uWinGlow', fx.winGlow).setFloat('uTime', time).setFloat('uPixel', pixel);
    quad.draw();

    // 6. LED displays
    const disp = P.display.use();
    disp.setMat4('uViewProj', vp).setFloat('uZ', 0.01);
    this.#drawDisplay(disp, LAYOUT.creditsDisplay, this.#credits, [1.0, 0.36, 0.12], 0);
    this.#drawDisplay(disp, LAYOUT.winDisplay, this.#win, [1.0, 0.78, 0.2], fx.displayFlash);

    // 7. lever
    const L = LAYOUT.lever;
    const lever = P.lever.use();
    lever.setMat4('uViewProj', vp).setVec4('uRect', L.quad.center[0], L.quad.center[1], L.quad.half[0] * 2, L.quad.half[1] * 2).setFloat('uZ', 0.05);
    lever.setVec2('uPivot', L.pivot[0], L.pivot[1]).setFloat('uAngle', this.#leverAngle).setFloat('uLength', L.length).setFloat('uPixel', pixel);
    quad.draw();

    // 8. particles
    r.setDepth(false);
    r.setBlend('additive');
    this.#particles?.draw(P.particles, cam, r.height);

    // 9. vignette + flash
    r.setBlend('premultiplied');
    P.overlay.use().setFloat('uAspect', cam.aspect).setFloat('uFlash', fx.flash);
    r.clipQuad.draw();
  }

  /**
   * @param {ShaderProgram} program
   * @param {{center:number[],half:number[],digits:number}} spec
   * @param {Int32Array} digits
   * @param {number[]} color
   * @param {number} flash
   */
  #drawDisplay(program, spec, digits, color, flash) {
    program.setVec4('uRect', spec.center[0], spec.center[1], spec.half[0] * 2, spec.half[1] * 2);
    program.setVec2('uHalf', spec.half[0], spec.half[1]);
    program.setIntArray('uDigits', digits);
    program.setInt('uCount', spec.digits);
    program.setVec3('uColor', color[0], color[1], color[2]);
    program.setFloat('uFlash', flash);
    this.#renderer.unitQuad.draw();
  }
}

/**
 * Right-aligned digits, blank (-1) padded. Leading zero shown for 0.
 * @param {number} value
 * @param {number} count
 * @param {Int32Array} out
 * @param {boolean} [showZero]
 */
function toDigits(value, count, out, showZero = true) {
  out.fill(-1);
  const max = 10 ** count - 1;
  let v = Math.max(0, Math.min(max, Math.round(value)));
  if (v === 0 && !showZero) return;
  let i = count - 1;
  do {
    out[i--] = v % 10;
    v = Math.floor(v / 10);
  } while (v > 0 && i >= 0);
}

/**
 * Closed cylinder tape mesh for one physical strip.
 * @param {WebGL2RenderingContext} gl
 * @param {readonly (readonly string[])[]} strip
 */
function buildTapeMesh(gl, strip) {
  const data = [];
  const symbols = [];
  const indices = [];
  strip.forEach((stop, stopIndex) => {
    const id0 = SYMBOL_ATLAS_INDEX[stop[0]];
    const id1 = stop.length > 1 ? SYMBOL_ATLAS_INDEX[stop[1]] : -1;
    const base = data.length / 3;
    for (let row = 0; row <= TAPE_SUBDIVISIONS; row++) {
      const v = row / TAPE_SUBDIVISIONS;
      for (let col = 0; col < 2; col++) {
        data.push(stopIndex, v, col);
        symbols.push(id0, id1);
      }
    }
    for (let row = 0; row < TAPE_SUBDIVISIONS; row++) {
      const a = base + row * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  });
  return new Mesh(gl, {
    buffers: [
      { data: new Float32Array(data), attributes: [{ location: Mesh.LOCATION.DATA, size: 3 }] },
      { data: new Float32Array(symbols), attributes: [{ location: Mesh.LOCATION.SYMBOLS, size: 2 }] },
    ],
    indices: new Uint16Array(indices),
    count: indices.length,
  });
}
