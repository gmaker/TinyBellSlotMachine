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
const STATUS_MAX_WIDTH = 6.4;

/** @typedef {'base'|'paytable'|'settings'|'gameOver'} UiLayerName */

/**
 * @typedef {object} UiButton
 * @property {string} id
 * @property {'rect'|'circle'} kind
 * @property {number} x
 * @property {number} y
 * @property {number} w half width (or radius)
 * @property {number} h half height (or radius)
 * @property {string|(() => string)} [label] i18n key or resolver
 * @property {'gear'} [icon]
 * @property {number} [textSize]
 * @property {keyof typeof STYLES|(() => keyof typeof STYLES)} style
 * @property {UiLayerName} layer
 * @property {() => boolean} [enabled]
 * @property {number} [maxTextWidth]
 */

/**
 * Entire game UI drawn in WebGL on top of the cabinet: title, labels, status
 * line, buttons (SPIN / paytable / settings), the paytable, settings and
 * game-over panels. Emits `spin`, `sound` (toggle), `language` (code),
 * `newGame`, `panel` (name|null).
 */
export class UiLayer extends EventEmitter {
  #renderer;
  #camera;
  #text;
  #i18n;
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

  /** @type {{key: string, params: Record<string, string|number>, isWin: boolean}} */
  #status = { key: '', params: {}, isWin: false };
  #balance = 0;
  #bet = 1;
  #spinEnabled = true;
  #muted = false;
  #gameOver = false;
  /** @type {'paytable'|'settings'|null} */
  #panel = null;
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
   * @param {import('./i18n.js').I18n} deps.i18n
   * @param {() => WebGLTexture} deps.getAtlasTexture
   * @param {[number, number]} deps.atlasGrid
   */
  constructor({ renderer, camera, text, i18n, getAtlasTexture, atlasGrid }) {
    super();
    this.#renderer = renderer;
    this.#camera = camera;
    this.#text = text;
    this.#i18n = i18n;
    this.#getAtlas = getAtlasTexture;
    this.#atlasGrid = atlasGrid;
    this.#buttons = [
      { id: 'paytable', kind: 'rect', x: -2.45, y: -3.05, w: 0.98, h: 0.4, label: 'btnPaytable', textSize: 0.19, maxTextWidth: 1.6, style: 'wood', layer: 'base' },
      { id: 'spin', kind: 'circle', x: 0, y: -3.05, w: 0.8, h: 0.8, label: 'btnSpin', textSize: 0.3, style: 'red', layer: 'base', enabled: () => this.#spinEnabled },
      { id: 'settings', kind: 'circle', x: 2.45, y: -3.05, w: 0.42, h: 0.42, icon: 'gear', style: 'wood', layer: 'base' },
      { id: 'close', kind: 'rect', x: 0, y: -3.85, w: 1.3, h: 0.35, label: 'btnClose', textSize: 0.2, style: 'wood', layer: 'paytable' },
      { id: 'sound', kind: 'rect', x: 1.55, y: 1.45, w: 0.95, h: 0.33, label: () => this.#i18n.t(this.#muted ? 'off' : 'on'), textSize: 0.18, style: () => (this.#muted ? 'wood' : 'gold'), layer: 'settings' },
      { id: 'lang-en', kind: 'rect', x: 0.6, y: 0.45, w: 0.85, h: 0.33, label: () => this.#i18n.t('name', {}, 'en'), textSize: 0.17, style: () => (this.#i18n.language === 'en' ? 'gold' : 'wood'), layer: 'settings' },
      { id: 'lang-ru', kind: 'rect', x: 2.4, y: 0.45, w: 0.85, h: 0.33, label: () => this.#i18n.t('name', {}, 'ru'), textSize: 0.17, style: () => (this.#i18n.language === 'ru' ? 'gold' : 'wood'), layer: 'settings' },
      { id: 'close-settings', kind: 'rect', x: 0, y: -0.55, w: 1.3, h: 0.35, label: 'btnClose', textSize: 0.2, style: 'wood', layer: 'settings' },
      { id: 'newGame', kind: 'rect', x: 0, y: 0.0, w: 1.7, h: 0.41, label: 'btnNewGame', textSize: 0.24, maxTextWidth: 2.9, style: 'gold', layer: 'gameOver' },
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
   * Status line as an i18n key so it re-translates when the language changes.
   * @param {string} key
   * @param {Record<string, string|number>} [params]
   * @param {boolean} [isWin]
   */
  setStatus(key, params = {}, isWin = false) {
    this.#status = { key, params, isWin };
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
    if (visible) this.#panel = null;
    this.#hover = null;
    this.#pressed = null;
  }

  /**
   * Open a panel (or close all with null). Ignored while game over is shown.
   * @param {'paytable'|'settings'|null} name
   */
  openPanel(name) {
    if (this.#gameOver && name !== null) return;
    if (this.#panel === name) return;
    this.#panel = name;
    this.#hover = null;
    this.#pressed = null;
    this.emit('panel', name);
  }

  /** @param {'paytable'|'settings'} name */
  togglePanel(name) {
    this.openPanel(this.#panel === name ? null : name);
  }

  /** Close whatever panel is open (Escape). */
  closePanel() {
    this.openPanel(null);
  }

  /** @param {import('../math/SlotMath.js').MathReport} report */
  setPaytableReport(report) {
    this.#report = report;
  }

  /** @param {import('../math/SlotMath.js').MathReport|null} report */
  setDevReport(report) {
    this.#devReport = report;
  }

  get panel() {
    return this.#panel;
  }

  get gameOver() {
    return this.#gameOver;
  }

  get modalOpen() {
    return this.#gameOver || this.#panel !== null;
  }

  /* ------------------------------- input ------------------------------ */

  /** @returns {UiLayerName} */
  get #activeLayer() {
    return this.#gameOver ? 'gameOver' : this.#panel ?? 'base';
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
    // a modal swallows every pointer event; clicking outside a panel closes it
    if (this.#panel) {
      this.closePanel();
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
      case 'paytable':
        this.togglePanel('paytable');
        break;
      case 'settings':
        this.togglePanel('settings');
        break;
      case 'close':
      case 'close-settings':
        this.closePanel();
        break;
      case 'sound':
        this.emit('sound');
        break;
      case 'lang-en':
        this.emit('language', 'en');
        break;
      case 'lang-ru':
        this.emit('language', 'ru');
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
    const t = (key, params) => this.#i18n.t(key, params);
    text.pixelWorld = this.#pixel;
    this.#renderer.setDepth(false);
    this.#renderer.setBlend('premultiplied');

    for (const b of this.#buttons) if (b.layer === 'base') this.#drawButton(b);

    // marquee title with glow + drop shadow
    const [mx, my] = LAYOUT.marquee.center;
    const titleSize = 0.95;
    const baseline = my - titleSize * 0.5;
    text.text('21 BELL', mx, baseline, titleSize, { color: [1, 0.72, 0.25, 0.35], align: 'center', weight: 0.2 });
    text.text('21 BELL', mx + 0.035, baseline - 0.045, titleSize, { color: [0.35, 0.18, 0.02, 0.9], align: 'center', weight: 0.095 });
    text.text('21 BELL', mx, baseline, titleSize, { color: [1, 0.96, 0.82, 1], align: 'center', weight: 0.09 });

    // display labels
    const labelSize = 0.2;
    const labelColor = [0.91, 0.78, 0.54, 1];
    text.text(t('credits'), LAYOUT.creditsDisplay.center[0], -0.5 - labelSize * 0.5, labelSize, { color: labelColor, align: 'center', tracking: 0.32 });
    text.text(t('winLabel'), LAYOUT.winDisplay.center[0], -0.5 - labelSize * 0.5, labelSize, { color: labelColor, align: 'center', tracking: 0.32 });

    // status line
    if (this.#status.key) {
      const status = t(this.#status.key, this.#status.params);
      const size = text.fitSize(status, 0.21, STATUS_MAX_WIDTH);
      const color = this.#status.isWin ? [1, 0.9, 0.5, 1] : C.cream;
      text.text(status, 0, -2.12 - size * 0.5, size, { color, align: 'center' });
    }

    // bet / balance line
    text.text(t('betLine', { bet: this.#bet, balance: this.#balance }), 0, -3.98 - 0.09, 0.18, { color: C.muted, align: 'center' });

    // dev badge
    if (this.#devReport) {
      const r = this.#devReport;
      const badge = `MATH OK · ${r.winningOutcomes}/${r.outcomes} · HIT ${(r.hitRate * 100).toFixed(4)}% · RTP ${(r.rtp * 100).toFixed(2)}%`;
      text.text(badge, 0, -5.62, 0.17, { color: C.green, align: 'center' });
    }

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
    else if (this.#panel === 'paytable') this.#renderPaytable();
    else if (this.#panel === 'settings') this.#renderSettings();
    this.#text.flush(this.#camera, 0.08);
  }

  #renderGameOver() {
    const text = this.#text;
    const t = (key) => this.#i18n.t(key);
    this.#drawRect({ x: 0, y: 0.9, w: 3.35, h: 1.72, radius: 0.28, style: 'panel', alpha: 0.97, border: BORDER });
    this.#drawLayerButtons('gameOver');
    const title = t('gameOverTitle');
    text.text(title, 0, 1.78, text.fitSize(title, 0.4, 6.0), { color: C.gold, align: 'center', weight: 0.085 });
    text.text(t('gameOverLine1'), 0, 1.18, text.fitSize(t('gameOverLine1'), 0.21, 6.0), { color: C.cream, align: 'center' });
    text.text(t('gameOverLine2'), 0, 0.8, text.fitSize(t('gameOverLine2'), 0.21, 6.0), { color: C.muted, align: 'center' });
    this.#drawLayerLabels('gameOver');
  }

  #renderSettings() {
    const text = this.#text;
    const t = (key) => this.#i18n.t(key);
    this.#drawRect({ x: 0, y: 0.9, w: 3.1, h: 2.05, radius: 0.28, style: 'panel', alpha: 0.97, border: BORDER });
    this.#drawLayerButtons('settings');
    text.text(t('settingsTitle'), 0, 2.4, 0.38, { color: C.gold, align: 'center', weight: 0.085 });
    text.text(t('settingsSound'), -2.75, 1.45 - 0.1, 0.2, { color: C.cream });
    text.text(t('settingsLanguage'), -2.75, 0.45 - 0.1, 0.2, { color: C.cream });
    text.polyline([-2.75, 0.98, 2.75, 0.98], 0.006, [1, 1, 1, 0.08]);
    this.#drawLayerLabels('settings');
  }

  #renderPaytable() {
    const text = this.#text;
    const t = (key, params) => this.#i18n.t(key, params);
    const report = this.#report;
    this.#drawRect({ x: 0, y: 0.45, w: 3.6, h: 4.8, radius: 0.3, style: 'panel', alpha: 0.97, border: BORDER });
    this.#drawLayerButtons('paytable');

    text.text(t('paytableTitle'), 0, 4.55, 0.38, { color: C.gold, align: 'center', weight: 0.085 });
    if (report) {
      const sub = t('paytableSub', { hit: (report.hitRate * 100).toFixed(2), rtp: (report.rtp * 100).toFixed(2) });
      text.text(sub, 0, 4.05, 0.2, { color: C.muted, align: 'center' });
    }
    const headY = 3.55;
    text.text(t('colCombo'), -3.15, headY, 0.16, { color: C.muted });
    text.text(t('colPayout'), 0.75, headY, 0.16, { color: C.muted, align: 'right' });
    text.text(t('colHits'), 2.0, headY, 0.16, { color: C.muted, align: 'right' });
    text.text(t('colChance'), 3.25, headY, 0.16, { color: C.muted, align: 'right' });
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
          text.text(t('any'), cx, y - 0.08, 0.16, { color: C.muted, align: 'center' });
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
    const note = t('paytableNote');
    text.text(note, 0, -3.32, text.fitSize(note, 0.13, 6.6), { color: C.muted, align: 'center' });
    this.#drawLayerLabels('paytable');
  }

  /** @param {UiLayerName} layer */
  #drawLayerButtons(layer) {
    for (const b of this.#buttons) if (b.layer === layer) this.#drawButton(b);
  }

  /** @param {UiLayerName} layer */
  #drawLayerLabels(layer) {
    for (const b of this.#buttons) if (b.layer === layer) this.#drawButtonLabel(b);
  }

  /** @param {UiButton} b */
  #styleOf(b) {
    return STYLES[typeof b.style === 'function' ? b.style() : b.style];
  }

  /** @param {UiButton} b */
  #labelOf(b) {
    if (!b.label) return '';
    return typeof b.label === 'function' ? b.label() : this.#i18n.t(b.label);
  }

  /** @param {UiButton} b */
  #drawButton(b) {
    const active = this.#activeLayer === b.layer;
    const enabled = active && (!b.enabled || b.enabled());
    const hover = active && this.#hover === b.id ? 1 : 0;
    const pressed = active && this.#pressed === b.id ? 1 : 0;
    const glow = b.id === 'spin' && enabled && !this.modalOpen ? 0.5 + 0.5 * Math.sin(this.#time * 2.5) : 0;
    const styleName = typeof b.style === 'function' ? b.style() : b.style;
    this.#drawRect({
      x: b.x, y: b.y, w: b.w, h: b.h,
      radius: b.kind === 'circle' ? b.w : 0.2,
      style: styleName,
      alpha: 1,
      border: BORDER,
      state: [hover, pressed, enabled ? 0 : 1, glow * 0.35],
    });
  }

  /** @param {UiButton} b */
  #drawButtonLabel(b) {
    const style = this.#styleOf(b);
    const enabled = !b.enabled || b.enabled();
    const color = enabled ? style.text : [style.text[0], style.text[1], style.text[2], 0.45];
    const press = this.#pressed === b.id ? -0.02 : 0;
    const label = this.#labelOf(b);
    if (label) {
      const maxWidth = b.maxTextWidth ?? b.w * 2 - 0.4;
      const size = this.#text.fitSize(label, b.textSize ?? 0.26, maxWidth);
      this.#text.text(label, b.x, b.y - size * 0.5 + press, size, { color, align: 'center', weight: 0.09, tracking: 0.22 });
    }
    if (b.icon === 'gear') this.#drawGear(b.x, b.y + press, b.w * 0.95, color);
  }

  /**
   * Gear icon as polylines (settings). A red slash marks muted sound.
   * @param {number} cx
   * @param {number} cy
   * @param {number} s scale
   * @param {number[]} color
   */
  #drawGear(cx, cy, s, color) {
    const t = this.#text;
    const w = 0.045 * s;
    const teeth = 8;
    const pts = [];
    for (let i = 0; i < teeth * 2; i++) {
      const a = (Math.PI * 2 * i) / (teeth * 2) - Math.PI / (teeth * 2);
      const r = i % 2 === 0 ? 0.52 : 0.36;
      pts.push(cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s);
      const a2 = (Math.PI * 2 * (i + 1)) / (teeth * 2) - Math.PI / (teeth * 2);
      pts.push(cx + Math.cos(a2 - 0.02) * r * s, cy + Math.sin(a2 - 0.02) * r * s);
    }
    t.polyline(pts, w, color, true);
    const hub = [];
    for (let i = 0; i <= 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      hub.push(cx + Math.cos(a) * 0.16 * s, cy + Math.sin(a) * 0.16 * s);
    }
    t.polyline(hub, w, color);
    if (this.#muted) {
      t.polyline([cx + 0.3 * s, cy - 0.62 * s, cx + 0.62 * s, cy - 0.3 * s], w * 1.2, C.red);
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
