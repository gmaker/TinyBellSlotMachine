import { EventEmitter } from '../core/EventEmitter.js';
import { ShaderProgram } from '../gl/ShaderProgram.js';
import { ANY, PAYTABLE } from '../math/SlotMath.js';
import { LAYOUT, SYMBOL_ATLAS_INDEX } from '../view/layout.js';
import { QUAD_VERT } from '../view/shaders/common.js';
import { ICON_FRAG, UI_FRAG } from '../view/shaders/ui.js';

/** Colours */
const C = {
  cream: [0.97, 0.9, 0.76, 1],
  gold: [1.0, 0.85, 0.42, 1],
  goldDeep: [0.85, 0.62, 0.22, 1],
  muted: [0.76, 0.66, 0.5, 1],
  dark: [0.16, 0.09, 0.03, 1],
  white: [1, 1, 1, 1],
  green: [0.55, 0.9, 0.55, 1],
  red: [1, 0.45, 0.4, 1],
};

const STYLES = {
  wood: { top: [0.4, 0.25, 0.14], bottom: [0.2, 0.12, 0.07], border: [0.8, 0.6, 0.24], text: C.cream },
  red: { top: [0.92, 0.32, 0.27], bottom: [0.55, 0.1, 0.08], border: [0.42, 0.08, 0.06], text: C.white },
  gold: { top: [0.97, 0.8, 0.38], bottom: [0.72, 0.5, 0.13], border: [0.55, 0.36, 0.1], text: C.dark },
  panel: { top: [0.18, 0.12, 0.09], bottom: [0.1, 0.065, 0.05], border: [0.8, 0.6, 0.24], text: C.cream },
  dim: { top: [0, 0, 0], bottom: [0, 0, 0], border: [0, 0, 0], text: C.cream },
};

const BORDER = 0.05;
const STATUS_MAX_WIDTH = 7.0;

/**
 * @typedef {object} UiButton
 * @property {string} id
 * @property {'rect'|'circle'} kind
 * @property {number} x
 * @property {number} y
 * @property {number} w half width (or radius)
 * @property {number} h half height (or radius)
 * @property {string} [label]
 * @property {'speaker'} [icon]
 * @property {number} [textSize]
 * @property {keyof typeof STYLES} style
 * @property {'base'|'paytable'|'gameOver'} layer
 * @property {() => boolean} [enabled]
 */

/**
 * Entire game UI drawn in WebGL on top of the cabinet: title, labels, status
 * line, buttons (SPIN / mute / paytable), the paytable and game-over panels.
 * Emits `spin`, `mute`, `newGame`, `paytable`.
 */
export class UiLayer extends EventEmitter {
  #renderer;
  #camera;
  #text;
  #getAtlas;
  #atlasGrid;
  /** @type {ShaderProgram|null} */
  #uiProgram = null;
  /** @type {ShaderProgram|null} */
  #iconProgram = null;
  /** @type {UiButton[]} */
  #buttons;
  #hover = null;
  #pressed = null;

  #status = '';
  #statusIsWin = false;
  #balance = 0;
  #bet = 1;
  #spinEnabled = true;
  #muted = false;
  #gameOver = false;
  #paytableOpen = false;
  /** @type {import('../math/SlotMath.js').MathReport|null} */
  #report = null;
  /** @type {import('../math/SlotMath.js').MathReport|null} */
  #devReport = null;
  #time = 0;

  /**
   * @param {object} deps
   * @param {import('../gl/WebGLRenderer.js').WebGLRenderer} deps.renderer
   * @param {import('../gl/Camera.js').Camera} deps.camera
   * @param {import('../view/text/TextRenderer.js').TextRenderer} deps.text
   * @param {() => WebGLTexture} deps.getAtlasTexture
   * @param {[number, number]} deps.atlasGrid
   */
  constructor({ renderer, camera, text, getAtlasTexture, atlasGrid }) {
    super();
    this.#renderer = renderer;
    this.#camera = camera;
    this.#text = text;
    this.#getAtlas = getAtlasTexture;
    this.#atlasGrid = atlasGrid;
    this.#buttons = [
      { id: 'paytable', kind: 'rect', x: -2.45, y: -3.05, w: 0.98, h: 0.4, label: 'ТАБЛИЦА', textSize: 0.25, style: 'wood', layer: 'base' },
      { id: 'spin', kind: 'circle', x: 0, y: -3.05, w: 0.8, h: 0.8, label: 'SPIN', textSize: 0.36, style: 'red', layer: 'base', enabled: () => this.#spinEnabled },
      { id: 'mute', kind: 'circle', x: 2.45, y: -3.05, w: 0.42, h: 0.42, icon: 'speaker', style: 'wood', layer: 'base' },
      { id: 'close', kind: 'rect', x: 0, y: -3.85, w: 1.3, h: 0.35, label: 'ЗАКРЫТЬ', textSize: 0.24, style: 'wood', layer: 'paytable' },
      { id: 'newGame', kind: 'rect', x: 0, y: 0.0, w: 1.7, h: 0.41, label: 'НОВАЯ ИГРА', textSize: 0.3, style: 'gold', layer: 'gameOver' },
    ];
    this.createResources();
  }

  createResources() {
    this.disposeResources();
    const gl = this.#renderer.gl;
    this.#uiProgram = new ShaderProgram(gl, QUAD_VERT, UI_FRAG, 'ui');
    this.#iconProgram = new ShaderProgram(gl, QUAD_VERT, ICON_FRAG, 'icon');
  }

  disposeResources() {
    this.#uiProgram?.dispose();
    this.#iconProgram?.dispose();
    this.#uiProgram = null;
    this.#iconProgram = null;
  }

  dispose() {
    this.disposeResources();
    this.removeAllListeners();
  }

  /* ------------------------------- state ------------------------------ */

  /**
   * @param {string} text
   * @param {boolean} [isWin]
   */
  setStatus(text, isWin = false) {
    this.#status = text;
    this.#statusIsWin = isWin;
  }

  /** @param {number} value */
  setBalance(value) {
    this.#balance = value;
  }

  /** @param {number} value */
  setBet(value) {
    this.#bet = value;
  }

  /** @param {boolean} enabled */
  setSpinEnabled(enabled) {
    this.#spinEnabled = enabled;
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    this.#muted = muted;
  }

  /** @param {boolean} visible */
  setGameOver(visible) {
    this.#gameOver = visible;
    if (visible) this.#paytableOpen = false;
    this.#hover = null;
    this.#pressed = null;
  }

  /** @param {boolean} open */
  setPaytable(open) {
    if (this.#gameOver) return;
    this.#paytableOpen = open;
    this.#hover = null;
    this.#pressed = null;
    this.emit('paytable', open);
  }

  togglePaytable() {
    this.setPaytable(!this.#paytableOpen);
  }

  /** @param {import('../math/SlotMath.js').MathReport} report */
  setPaytableReport(report) {
    this.#report = report;
  }

  /** @param {import('../math/SlotMath.js').MathReport|null} report */
  setDevReport(report) {
    this.#devReport = report;
  }

  get paytableOpen() {
    return this.#paytableOpen;
  }

  get gameOver() {
    return this.#gameOver;
  }

  get modalOpen() {
    return this.#gameOver || this.#paytableOpen;
  }

  /* ------------------------------- input ------------------------------ */

  get #activeLayer() {
    return this.#gameOver ? 'gameOver' : this.#paytableOpen ? 'paytable' : 'base';
  }

  /** @param {{x:number,y:number}} world */
  #hitButton(world) {
    const layer = this.#activeLayer;
    for (const b of this.#buttons) {
      if (b.layer !== layer) continue;
      if (b.enabled && !b.enabled()) continue;
      const dx = world.x - b.x;
      const dy = world.y - b.y;
      const hit = b.kind === 'circle' ? Math.hypot(dx, dy) <= b.w : Math.abs(dx) <= b.w && Math.abs(dy) <= b.h;
      if (hit) return b;
    }
    return null;
  }

  /**
   * @param {{x:number,y:number}} world
   * @returns {boolean} true when the UI consumed the pointer
   */
  pointerDown(world) {
    const button = this.#hitButton(world);
    if (button) {
      this.#pressed = button.id;
      return true;
    }
    // a modal swallows every pointer event; clicking outside the paytable closes it
    if (this.#paytableOpen) {
      this.setPaytable(false);
      return true;
    }
    return this.#gameOver;
  }

  /**
   * @param {{x:number,y:number}} world
   * @returns {boolean} true when hovering an interactive element
   */
  pointerMove(world) {
    const button = this.#hitButton(world);
    this.#hover = button?.id ?? null;
    return button !== null;
  }

  /** @param {{x:number,y:number}} world */
  pointerUp(world) {
    const pressed = this.#pressed;
    this.#pressed = null;
    if (!pressed) return;
    const button = this.#hitButton(world);
    if (button && button.id === pressed) this.#activate(button.id);
  }

  /** @param {string} id */
  #activate(id) {
    switch (id) {
      case 'spin':
        this.emit('spin');
        break;
      case 'mute':
        this.emit('mute');
        break;
      case 'paytable':
        this.togglePaytable();
        break;
      case 'close':
        this.setPaytable(false);
        break;
      case 'newGame':
        this.emit('newGame');
        break;
      default:
        break;
    }
  }

  /* ------------------------------ rendering --------------------------- */

  get #pixel() {
    return this.#camera.worldPerPixel / this.#renderer.devicePixelRatio;
  }

  /**
   * Cabinet-level UI: title, labels, status, buttons.
   * @param {number} time
   */
  renderBase(time) {
    this.#time = time;
    const text = this.#text;
    text.pixelWorld = this.#pixel;
    this.#renderer.setDepth(false);
    this.#renderer.setBlend('premultiplied');

    // buttons first, text on top
    for (const b of this.#buttons) if (b.layer === 'base') this.#drawButton(b, 'base');

    // marquee title with glow + drop shadow
    const [mx, my] = LAYOUT.marquee.center;
    const titleSize = 0.95;
    const baseline = my - titleSize * 0.5;
    text.text('21 BELL', mx, baseline, titleSize, { color: [1, 0.72, 0.25, 0.35], align: 'center', weight: 0.2 });
    text.text('21 BELL', mx + 0.035, baseline - 0.045, titleSize, { color: [0.35, 0.18, 0.02, 0.9], align: 'center', weight: 0.095 });
    text.text('21 BELL', mx, baseline, titleSize, { color: [1, 0.96, 0.82, 1], align: 'center', weight: 0.09 });

    // display labels
    const labelSize = 0.23;
    text.text('МОНЕТЫ', LAYOUT.creditsDisplay.center[0], -0.5 - labelSize * 0.5, labelSize, { color: [0.91, 0.78, 0.54, 1], align: 'center', tracking: 0.32 });
    text.text('ВЫИГРЫШ', LAYOUT.winDisplay.center[0], -0.5 - labelSize * 0.5, labelSize, { color: [0.91, 0.78, 0.54, 1], align: 'center', tracking: 0.32 });

    // status line
    if (this.#status) {
      const size = text.fitSize(this.#status, 0.27, STATUS_MAX_WIDTH);
      const color = this.#statusIsWin ? [1, 0.9, 0.5, 1] : C.cream;
      text.text(this.#status, 0, -2.12 - size * 0.5, size, { color, align: 'center' });
    }

    // bet / balance line
    const bet = `СТАВКА ${this.#bet} · БАЛАНС ${this.#balance}`;
    text.text(bet, 0, -3.98 - 0.11, 0.22, { color: C.muted, align: 'center' });

    // dev badge
    if (this.#devReport) {
      const r = this.#devReport;
      const badge = `MATH OK · ${r.winningOutcomes}/${r.outcomes} · HIT ${(r.hitRate * 100).toFixed(4)}% · RTP ${(r.rtp * 100).toFixed(2)}%`;
      text.text(badge, 0, -5.62, 0.17, { color: C.green, align: 'center' });
    }

    // button labels / icons
    for (const b of this.#buttons) if (b.layer === 'base') this.#drawButtonLabel(b);
    text.flush(this.#camera, 0.07);
  }

  /**
   * Modal panels drawn above everything else.
   * @param {number} time
   */
  renderOverlays(time) {
    this.#time = time;
    if (!this.modalOpen) return;
    this.#renderer.setDepth(false);
    this.#renderer.setBlend('premultiplied');
    const [bx, by] = LAYOUT.body.center;
    const [bw, bh] = LAYOUT.body.half;
    this.#drawRect({ x: bx, y: by, w: bw + 0.02, h: bh + 0.02, radius: LAYOUT.body.radius, style: 'dim', alpha: 0.66, border: 0 });

    if (this.#gameOver) this.#renderGameOver();
    else if (this.#paytableOpen) this.#renderPaytable();
    this.#text.flush(this.#camera, 0.08);
  }

  #renderGameOver() {
    const text = this.#text;
    this.#drawRect({ x: 0, y: 0.9, w: 3.35, h: 1.72, radius: 0.28, style: 'panel', alpha: 0.97, border: BORDER });
    for (const b of this.#buttons) if (b.layer === 'gameOver') this.#drawButton(b, 'gameOver');
    text.text('МОНЕТЫ ЗАКОНЧИЛИСЬ', 0, 1.78, 0.4, { color: C.gold, align: 'center', weight: 0.085 });
    text.text('ИГРА НА ВИРТУАЛЬНЫЕ МОНЕТЫ', 0, 1.18, 0.21, { color: C.cream, align: 'center' });
    text.text('НОВАЯ ИГРА — СНОВА 100 МОНЕТ', 0, 0.8, 0.21, { color: C.muted, align: 'center' });
    for (const b of this.#buttons) if (b.layer === 'gameOver') this.#drawButtonLabel(b);
  }

  #renderPaytable() {
    const text = this.#text;
    const report = this.#report;
    this.#drawRect({ x: 0, y: 0.45, w: 3.6, h: 4.8, radius: 0.3, style: 'panel', alpha: 0.97, border: BORDER });
    for (const b of this.#buttons) if (b.layer === 'paytable') this.#drawButton(b, 'paytable');

    text.text('ТАБЛИЦА ВЫПЛАТ', 0, 4.55, 0.38, { color: C.gold, align: 'center', weight: 0.085 });
    if (report) {
      const sub = `ШАНС ВЫИГРЫША ${(report.hitRate * 100).toFixed(2)}% · RTP ${(report.rtp * 100).toFixed(2)}%`;
      text.text(sub, 0, 4.05, 0.2, { color: C.muted, align: 'center' });
    }
    const headY = 3.55;
    text.text('КОМБИНАЦИЯ', -3.15, headY, 0.16, { color: C.muted });
    text.text('ВЫПЛАТА', 0.75, headY, 0.16, { color: C.muted, align: 'right' });
    text.text('ИСХОДОВ', 2.0, headY, 0.16, { color: C.muted, align: 'right' });
    text.text('ШАНС', 3.25, headY, 0.16, { color: C.muted, align: 'right' });
    text.polyline([-3.25, headY - 0.14, 3.25, headY - 0.14], 0.008, [0.8, 0.6, 0.24, 0.6]);

    const iconSize = 0.5;
    const iconXs = [-2.9, -2.3, -1.7];
    let y = 3.0;
    const rowStep = 0.535;
    PAYTABLE.forEach((rule, i) => {
      const row = report?.rows[i];
      rule.pattern.forEach((symbol, reel) => {
        const cx = iconXs[reel];
        if (symbol === ANY) {
          text.text('ANY', cx, y - 0.08, 0.16, { color: C.muted, align: 'center' });
        } else {
          this.#drawIcon(cx, y, iconSize, SYMBOL_ATLAS_INDEX[symbol]);
        }
      });
      text.text(`×${rule.payout}`, 0.75, y - 0.1, 0.22, { color: rule.payout >= 100 ? C.gold : C.cream, align: 'right' });
      if (row) {
        text.text(String(row.hits), 2.0, y - 0.1, 0.2, { color: C.cream, align: 'right' });
        text.text(`${(row.probability * 100).toFixed(4)}%`, 3.25, y - 0.1, 0.2, { color: C.cream, align: 'right' });
      }
      if (i < PAYTABLE.length - 1) text.polyline([-3.25, y - 0.275, 3.25, y - 0.275], 0.006, [1, 1, 1, 0.07]);
      y -= rowStep;
    });
    text.text('ДВОЙНОЙ СТОП (7+ORANGE) — ОДИН СТОП, СЧИТАЕТСЯ ЗА ОБА СИМВОЛА', 0, -3.32, 0.13, { color: C.muted, align: 'center' });
    for (const b of this.#buttons) if (b.layer === 'paytable') this.#drawButtonLabel(b);
  }

  /**
   * @param {UiButton} b
   * @param {string} activeLayer
   */
  #drawButton(b, activeLayer) {
    const active = this.#activeLayer === activeLayer;
    const enabled = active && (!b.enabled || b.enabled());
    const hover = active && this.#hover === b.id ? 1 : 0;
    const pressed = active && this.#pressed === b.id ? 1 : 0;
    const glow = b.id === 'spin' && enabled && !this.modalOpen ? 0.5 + 0.5 * Math.sin(this.#time * 2.5) : 0;
    this.#drawRect({
      x: b.x, y: b.y, w: b.w, h: b.h,
      radius: b.kind === 'circle' ? b.w : 0.2,
      style: b.style,
      alpha: 1,
      border: BORDER,
      state: [hover, pressed, enabled ? 0 : 1, glow * 0.35],
    });
  }

  /** @param {UiButton} b */
  #drawButtonLabel(b) {
    const style = STYLES[b.style];
    const enabled = !b.enabled || b.enabled();
    const color = enabled ? style.text : [style.text[0], style.text[1], style.text[2], 0.45];
    const press = this.#pressed === b.id ? -0.02 : 0;
    if (b.label) {
      const size = b.textSize ?? 0.26;
      this.#text.text(b.label, b.x, b.y - size * 0.5 + press, size, { color, align: 'center', weight: 0.09, tracking: 0.26 });
    }
    if (b.icon === 'speaker') this.#drawSpeaker(b.x, b.y + press, b.w * 0.95, color);
  }

  /**
   * Speaker icon as polylines; crossed out when muted.
   * @param {number} cx
   * @param {number} cy
   * @param {number} s scale
   * @param {number[]} color
   */
  #drawSpeaker(cx, cy, s, color) {
    const t = this.#text;
    const w = 0.045 * s;
    const body = [-0.42, -0.16, -0.2, -0.16, 0.1, -0.4, 0.1, 0.4, -0.2, 0.16, -0.42, 0.16].map((v, i) => (i % 2 === 0 ? cx + v * s : cy + v * s));
    t.polyline(body, w, color, true);
    if (this.#muted) {
      t.polyline([cx + 0.24 * s, cy - 0.2 * s, cx + 0.56 * s, cy + 0.2 * s], w, C.red);
      t.polyline([cx + 0.24 * s, cy + 0.2 * s, cx + 0.56 * s, cy - 0.2 * s], w, C.red);
    } else {
      for (const r of [0.22, 0.4]) {
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const a = ((-40 + (80 * i) / 6) * Math.PI) / 180;
          pts.push(cx + 0.14 * s + Math.cos(a) * r * s, cy + Math.sin(a) * r * s);
        }
        t.polyline(pts, w, color);
      }
    }
  }

  /**
   * @param {{x:number,y:number,w:number,h:number,radius:number,style:keyof typeof STYLES,alpha:number,border:number,state?:number[]}} spec
   */
  #drawRect({ x, y, w, h, radius, style, alpha, border, state = [0, 0, 0, 0] }) {
    const p = /** @type {ShaderProgram} */ (this.#uiProgram).use();
    const s = STYLES[style];
    p.setMat4('uViewProj', this.#camera.viewProj).setVec4('uRect', x, y, w * 2, h * 2).setFloat('uZ', 0.06);
    p.setVec2('uHalf', w, h).setFloat('uRadius', radius);
    p.setVec3('uColorTop', s.top[0], s.top[1], s.top[2]);
    p.setVec3('uColorBottom', s.bottom[0], s.bottom[1], s.bottom[2]);
    p.setVec3('uBorder', s.border[0], s.border[1], s.border[2]);
    p.setFloat('uBorderWidth', border).setFloat('uAlpha', alpha).setFloat('uPixel', this.#pixel);
    p.setVec4('uState', state[0], state[1], state[2], state[3]);
    this.#renderer.unitQuad.draw();
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @param {number} cell atlas cell index
   */
  #drawIcon(x, y, size, cell) {
    const p = /** @type {ShaderProgram} */ (this.#iconProgram).use();
    p.setMat4('uViewProj', this.#camera.viewProj).setVec4('uRect', x, y, size, size).setFloat('uZ', 0.06);
    p.setVec2('uAtlasGrid', this.#atlasGrid[0], this.#atlasGrid[1]).setFloat('uCell', cell).setFloat('uAlpha', 1);
    p.setTexture('uAtlas', this.#getAtlas(), 1);
    this.#renderer.unitQuad.draw();
  }
}
