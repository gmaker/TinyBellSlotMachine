import { AudioEngine } from '../audio/AudioEngine.js';
import { Camera } from '../gl/Camera.js';
import { WebGLRenderer } from '../gl/WebGLRenderer.js';
import { InputManager } from '../input/InputManager.js';
import { LeverController } from '../input/LeverController.js';
import { REEL_COUNT, STOPS_PER_REEL, enumerateOutcomes, verifyMath } from '../math/SlotMath.js';
import { ReelSet } from '../reels/ReelSet.js';
import { DEFAULT_TIMING, REDUCED_MOTION_TIMING } from '../reels/ReelTiming.js';
import { AnimatedCounter } from '../ui/AnimatedCounter.js';
import { FatalMessage } from '../ui/FatalMessage.js';
import { I18n } from '../ui/i18n.js';
import { UiLayer } from '../ui/UiLayer.js';
import { ATLAS_SPEC, LAYOUT } from '../view/layout.js';
import { SlotMachineView } from '../view/SlotMachineView.js';
import { TextRenderer } from '../view/text/TextRenderer.js';
import { GameState } from './GameState.js';
import { CryptoRng } from './Rng.js';
import { SpinController, SpinPhase } from './SpinController.js';

/** Stops shown before the first spin (7 · 7+Orange · Bell — an honest tease). */
const INITIAL_STOPS = Object.freeze([6, 3, 0]);
const MAX_FRAME_DT = 0.1;

/**
 * Composition root: builds every subsystem, wires their events and runs the
 * requestAnimationFrame loop. The whole UI lives inside the WebGL canvas.
 */
export class Game {
  #canvas;
  #renderer;
  #camera;
  #state;
  #rng;
  #reelSet;
  #spin;
  #view;
  #text;
  #ui;
  #i18n = new I18n();
  #lever;
  #input;
  #audio;
  #fatal = new FatalMessage();
  #balanceCounter = new AnimatedCounter(0);
  #winCounter = new AnimatedCounter(0);
  #frameHandle = 0;
  #lastFrameTime = 0;
  #running = false;
  #reducedMotionQuery;
  #cleanups = [];
  #resizeObserver;

  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas
   * @param {import('./Rng.js').Rng} [options.rng]
   * @param {boolean} [options.devMode]
   */
  constructor({ canvas, rng = new CryptoRng(), devMode = false }) {
    this.#canvas = canvas;
    this.#rng = rng;

    this.#reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    const reducedMotion = Boolean(this.#reducedMotionQuery?.matches);

    this.#renderer = new WebGLRenderer(canvas);
    this.#camera = new Camera();
    this.#camera.setBounds(LAYOUT.sceneBounds);
    this.#state = new GameState();
    this.#reelSet = new ReelSet(REEL_COUNT, STOPS_PER_REEL, INITIAL_STOPS);
    this.#spin = new SpinController({
      state: this.#state,
      rng: this.#rng,
      reelSet: this.#reelSet,
      timing: reducedMotion ? REDUCED_MOTION_TIMING : DEFAULT_TIMING,
    });
    this.#view = new SlotMachineView({ renderer: this.#renderer, camera: this.#camera, reelSet: this.#reelSet, reducedMotion });
    this.#text = new TextRenderer(this.#renderer.gl);
    this.#ui = new UiLayer({
      renderer: this.#renderer,
      camera: this.#camera,
      text: this.#text,
      i18n: this.#i18n,
      getAtlasTexture: () => this.#view.atlasTexture,
      atlasGrid: [ATLAS_SPEC.cols, ATLAS_SPEC.rows],
    });
    this.#view.setUiLayer(this.#ui);
    this.#lever = new LeverController(LAYOUT.lever);
    this.#input = new InputManager(canvas, this.#camera);
    this.#audio = new AudioEngine();

    this.#wire();
    const report = enumerateOutcomes();
    this.#ui.setPaytableReport(report);
    if (devMode) this.#ui.setDevReport(verifyMath());
    this.#syncState(true);
    this.#ui.setMuted(this.#audio.muted);
    this.#ui.setStatus('welcome');
  }

  get state() {
    return this.#state;
  }

  get spinController() {
    return this.#spin;
  }

  get ui() {
    return this.#ui;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#handleResize();
    this.#lastFrameTime = performance.now() / 1000;
    this.#frameHandle = requestAnimationFrame(this.#frame);
  }

  stop() {
    this.#running = false;
    cancelAnimationFrame(this.#frameHandle);
  }

  /** Dev helper: exhaustive verification of the math model. */
  verifyMath() {
    return verifyMath();
  }

  dispose() {
    this.stop();
    for (const off of this.#cleanups) off();
    this.#cleanups = [];
    this.#resizeObserver?.disconnect();
    this.#input.dispose();
    this.#ui.dispose();
    this.#text.dispose();
    this.#audio.dispose();
    this.#view.dispose();
    this.#renderer.dispose();
    this.#fatal.hide();
  }

  /* -------------------------------------------------------------------- */

  #wire() {
    const on = (emitter, event, fn) => this.#cleanups.push(emitter.on(event, fn));

    on(this.#state, 'change', () => this.#syncState(false));

    // spin controller → presentation
    on(this.#spin, 'phase', () => this.#syncState(false));
    on(this.#spin, 'spinAccepted', () => {
      this.#view.clearWin();
      this.#ui.setStatus('spinning');
      this.#audio.playLeverClick();
    });
    on(this.#spin, 'reelTicks', (ticks) => {
      ticks.forEach((count, i) => count > 0 && this.#audio.playTick(i));
    });
    on(this.#spin, 'reelStopped', ({ reelIndex }) => {
      this.#audio.playReelStop(reelIndex);
      this.#view.onReelStopped(reelIndex);
    });
    on(this.#spin, 'evaluated', (result) => {
      const { key, params } = describeResult(result);
      this.#ui.setStatus(key, params, result.payout > 0);
      this.#view.triggerWin(result);
      if (result.isJackpot) this.#audio.playJackpot();
      else if (result.payout > 0) this.#audio.playWin(result.payout);
    });
    on(this.#spin, 'idle', () => {
      if (this.#state.isBroke) {
        this.#ui.setStatus('outOfCoins');
        this.#ui.setGameOver(true);
        this.#audio.playGameOver();
      }
    });

    // UI → game
    on(this.#ui, 'spin', () => this.#requestSpin('button'));
    on(this.#ui, 'sound', () => this.#toggleMute());
    on(this.#ui, 'language', (code) => this.#i18n.setLanguage(code));
    on(this.#ui, 'newGame', () => this.#newGame());

    // input → UI / lever / game
    on(this.#input, 'firstInteraction', () => this.#audio.unlock());
    on(this.#input, 'spin', () => {
      if (this.#ui.gameOver) this.#newGame();
      else if (!this.#ui.panel) this.#requestSpin('keyboard');
    });
    on(this.#input, 'mute', () => this.#toggleMute());
    on(this.#input, 'paytable', () => this.#ui.togglePanel('paytable'));
    on(this.#input, 'settings', () => this.#ui.togglePanel('settings'));
    on(this.#input, 'escape', () => this.#ui.closePanel());
    on(this.#input, 'newGame', () => {
      if (this.#ui.gameOver) this.#newGame();
    });
    on(this.#input, 'pointerdown', ({ world }) => {
      if (this.#ui.pointerDown(world)) return;
      if (this.#lever.pointerDown(world)) {
        this.#canvas.style.cursor = 'grabbing';
        this.#audio.playLeverGrab();
      }
    });
    on(this.#input, 'pointermove', ({ world }) => {
      const overUi = this.#ui.pointerMove(world);
      this.#lever.pointerMove(world);
      if (this.#lever.isDragging) return;
      this.#canvas.style.cursor = overUi ? 'pointer' : this.#lever.isHovering && !this.#ui.modalOpen ? 'grab' : 'default';
    });
    on(this.#input, 'pointerup', ({ world }) => {
      this.#ui.pointerUp(world);
      this.#lever.pointerUp();
      this.#canvas.style.cursor = this.#lever.isHovering ? 'grab' : 'default';
    });
    on(this.#lever, 'pull', () => this.#requestSpin('lever'));

    // renderer context loss
    on(this.#renderer, 'contextlost', () => {
      this.stop();
      this.#fatal.show('Контекст WebGL потерян', 'Игра приостановлена и продолжится автоматически, когда браузер вернёт контекст.');
    });
    on(this.#renderer, 'contextrestored', () => {
      this.#view.createResources();
      this.#ui.createResources();
      this.#text.dispose();
      this.#text = new TextRenderer(this.#renderer.gl);
      this.#fatal.hide();
      this.start();
    });

    // document / window
    const onVisibility = () => this.#audio.setSuspended(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    this.#cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    if (this.#reducedMotionQuery) {
      const onMotion = () => {
        const reduced = this.#reducedMotionQuery.matches;
        this.#spin.setTiming(reduced ? REDUCED_MOTION_TIMING : DEFAULT_TIMING);
        this.#view.reducedMotion = reduced;
      };
      this.#reducedMotionQuery.addEventListener?.('change', onMotion);
      this.#cleanups.push(() => this.#reducedMotionQuery.removeEventListener?.('change', onMotion));
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => this.#handleResize());
      this.#resizeObserver.observe(this.#canvas);
    }
    const onWindowResize = () => this.#handleResize();
    window.addEventListener('resize', onWindowResize);
    this.#cleanups.push(() => window.removeEventListener('resize', onWindowResize));
  }

  /** @param {boolean} immediate */
  #syncState(immediate) {
    this.#balanceCounter.set(this.#state.balance, immediate);
    this.#winCounter.set(this.#state.lastWin, immediate);
    this.#ui.setBet(this.#state.bet);
    this.#ui.setSpinEnabled(this.#spin.isIdle && this.#state.canSpin());
  }

  /**
   * @param {'lever'|'button'|'keyboard'} source
   */
  #requestSpin(source) {
    if (this.#ui.modalOpen) return;
    const now = performance.now() / 1000;
    const accepted = this.#spin.requestSpin(now);
    if (accepted) {
      if (source !== 'lever') this.#lever.autoPull();
    } else if (this.#spin.isIdle && this.#state.isBroke) {
      this.#ui.setGameOver(true);
    }
  }

  #newGame() {
    this.#state.reset();
    this.#view.clearWin();
    this.#ui.setGameOver(false);
    this.#syncState(true);
    this.#ui.setStatus('newGame');
    this.#audio.playNewGame();
  }

  #toggleMute() {
    const muted = this.#audio.toggleMute();
    this.#ui.setMuted(muted);
    this.#ui.setStatus(muted ? 'soundOff' : 'soundOn');
  }

  #handleResize() {
    if (this.#renderer.resize()) {
      this.#camera.setViewport(this.#renderer.cssWidth, this.#renderer.cssHeight);
    }
  }

  #frame = (ms) => {
    if (!this.#running) return;
    const now = ms / 1000;
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, now - this.#lastFrameTime));
    this.#lastFrameTime = now;

    this.#spin.update(now);
    this.#lever.update(dt);
    const coinsCounted = this.#balanceCounter.update(dt);
    this.#winCounter.update(dt);
    if (coinsCounted > 0 && this.#spin.phase === SpinPhase.PAYING) {
      this.#audio.playCoin();
      this.#view.spawnCoins(Math.min(4, coinsCounted), 4.5);
    }
    this.#ui.setBalance(this.#balanceCounter.rounded);
    this.#view.setLeverAngle(this.#lever.angle);
    this.#view.setDisplays(this.#balanceCounter.rounded, this.#winCounter.rounded);
    this.#view.update(dt, now);
    if (!this.#renderer.isContextLost) this.#view.render();

    this.#frameHandle = requestAnimationFrame(this.#frame);
  };
}

/**
 * @param {import('../math/SlotMath.js').SpinResult} result
 * @returns {{key: string, params: Record<string, string|number>}}
 */
function describeResult(result) {
  const names = result.stops.map((s) => s.join('+')).join(' · ').toUpperCase();
  if (!result.rule) return { key: 'noWin', params: { names } };
  return { key: result.isJackpot ? 'jackpot' : 'win', params: { name: result.rule.name.toUpperCase(), payout: result.payout } };
}
