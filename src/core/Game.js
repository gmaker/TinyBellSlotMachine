import { AudioEngine } from '../audio/AudioEngine.js';
import { Camera } from '../gl/Camera.js';
import { WebGLRenderer } from '../gl/WebGLRenderer.js';
import { InputManager } from '../input/InputManager.js';
import { LeverController } from '../input/LeverController.js';
import { REEL_COUNT, STOPS_PER_REEL, enumerateOutcomes, verifyMath } from '../math/SlotMath.js';
import { ReelSet } from '../reels/ReelSet.js';
import { DEFAULT_TIMING, REDUCED_MOTION_TIMING } from '../reels/ReelTiming.js';
import { HudController } from '../ui/HudController.js';
import { LAYOUT } from '../view/layout.js';
import { SlotMachineView } from '../view/SlotMachineView.js';
import { GameState } from './GameState.js';
import { CryptoRng } from './Rng.js';
import { SpinController, SpinPhase } from './SpinController.js';

/** Stops shown before the first spin (7 · 7+Orange · Bell — an honest tease). */
const INITIAL_STOPS = Object.freeze([6, 3, 0]);
const MAX_FRAME_DT = 0.1;

/**
 * Composition root: builds every subsystem, wires their events and runs the
 * requestAnimationFrame loop.
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
  #lever;
  #input;
  #audio;
  #hud;
  #devMode;
  #frameHandle = 0;
  #lastFrameTime = 0;
  #running = false;
  #reducedMotionQuery;
  #cleanups = [];
  #resizeObserver;

  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas
   * @param {Document|HTMLElement} [options.root]
   * @param {import('./Rng.js').Rng} [options.rng]
   * @param {boolean} [options.devMode]
   */
  constructor({ canvas, root = document, rng = new CryptoRng(), devMode = false }) {
    this.#canvas = canvas;
    this.#rng = rng;
    this.#devMode = devMode;

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
    this.#lever = new LeverController(LAYOUT.lever);
    this.#input = new InputManager(canvas, this.#camera);
    this.#audio = new AudioEngine();
    this.#hud = new HudController(root);

    this.#wire();
    this.#hud.renderPaytable(enumerateOutcomes());
    this.#hud.update(this.#state.snapshot(), true);
    this.#hud.setMuted(this.#audio.muted);
    this.#hud.showDevPanel(devMode);
    this.#hud.announce('Потяните ручку или нажмите SPIN. Ставка 1 монета.');
  }

  get state() {
    return this.#state;
  }

  get spinController() {
    return this.#spin;
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
    this.#hud.dispose();
    this.#audio.dispose();
    this.#view.dispose();
    this.#renderer.dispose();
  }

  /* -------------------------------------------------------------------- */

  #wire() {
    const on = (emitter, event, fn) => this.#cleanups.push(emitter.on(event, fn));

    // state → HUD
    on(this.#state, 'change', (snapshot) => {
      this.#hud.update(snapshot);
      this.#hud.setSpinEnabled(this.#spin.isIdle && this.#state.canSpin());
    });

    // spin controller → presentation
    on(this.#spin, 'phase', ({ phase }) => {
      this.#hud.setSpinEnabled(phase === SpinPhase.IDLE && this.#state.canSpin());
    });
    on(this.#spin, 'spinAccepted', () => {
      this.#view.clearWin();
      this.#hud.announce('Барабаны крутятся…');
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
      this.#hud.showResult(result);
      this.#view.triggerWin(result);
      if (result.isJackpot) this.#audio.playJackpot();
      else if (result.payout > 0) this.#audio.playWin(result.payout);
    });
    on(this.#spin, 'idle', () => {
      if (this.#state.isBroke) {
        this.#hud.announce('Монеты закончились. Нажмите «Новая игра», чтобы начать заново со 100 монетами.');
        this.#hud.showGameOver(true);
        this.#audio.playGameOver();
      }
    });

    // HUD → game
    on(this.#hud, 'spin', () => this.#requestSpin('button'));
    on(this.#hud, 'mute', () => this.#toggleMute());
    on(this.#hud, 'newGame', () => {
      this.#state.reset();
      this.#view.clearWin();
      this.#hud.showGameOver(false);
      this.#hud.update(this.#state.snapshot(), true);
      this.#hud.announce('Новая игра: 100 монет.');
      this.#audio.playNewGame();
    });
    on(this.#hud, 'verify', () => {
      try {
        this.#hud.showVerifyReport(this.verifyMath());
      } catch (error) {
        this.#hud.showVerifyReport(/** @type {Error} */ (error));
      }
    });

    // input → lever / game
    on(this.#input, 'firstInteraction', () => this.#audio.unlock());
    on(this.#input, 'spin', () => this.#requestSpin('keyboard'));
    on(this.#input, 'mute', () => this.#toggleMute());
    on(this.#input, 'pointerdown', ({ world }) => {
      if (this.#lever.pointerDown(world)) {
        this.#canvas.style.cursor = 'grabbing';
        this.#audio.playLeverGrab();
      }
    });
    on(this.#input, 'pointermove', ({ world }) => this.#lever.pointerMove(world));
    on(this.#input, 'pointerup', () => {
      this.#lever.pointerUp();
      this.#canvas.style.cursor = this.#lever.isHovering ? 'grab' : 'default';
    });
    on(this.#lever, 'hover', (hovering) => {
      if (!this.#lever.isDragging) this.#canvas.style.cursor = hovering ? 'grab' : 'default';
    });
    on(this.#lever, 'pull', () => this.#requestSpin('lever'));

    // renderer context loss
    on(this.#renderer, 'contextlost', () => {
      this.stop();
      this.#hud.showContextLost(true);
    });
    on(this.#renderer, 'contextrestored', () => {
      this.#view.createResources();
      this.#hud.showContextLost(false);
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
      this.#resizeObserver.observe(this.#canvas.parentElement ?? this.#canvas);
    }
    const onWindowResize = () => this.#handleResize();
    window.addEventListener('resize', onWindowResize);
    this.#cleanups.push(() => window.removeEventListener('resize', onWindowResize));
  }

  /**
   * @param {'lever'|'button'|'keyboard'} source
   */
  #requestSpin(source) {
    const now = performance.now() / 1000;
    const accepted = this.#spin.requestSpin(now);
    if (accepted) {
      if (source !== 'lever') this.#lever.autoPull();
    } else if (this.#spin.isIdle && this.#state.isBroke) {
      this.#hud.showGameOver(true);
    }
  }

  #toggleMute() {
    const muted = this.#audio.toggleMute();
    this.#hud.setMuted(muted);
    this.#hud.announce(muted ? 'Звук выключен' : 'Звук включён');
  }

  #handleResize() {
    if (this.#renderer.resize()) {
      this.#camera.setViewport(this.#renderer.cssWidth, this.#renderer.cssHeight);
    }
    this.#hud.layoutAnchors(this.#camera);
  }

  #frame = (ms) => {
    if (!this.#running) return;
    const now = ms / 1000;
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, now - this.#lastFrameTime));
    this.#lastFrameTime = now;

    this.#spin.update(now);
    this.#lever.update(dt);
    const coinsCounted = this.#hud.tick(dt);
    if (coinsCounted > 0 && this.#spin.phase === SpinPhase.PAYING) {
      this.#audio.playCoin();
      this.#view.spawnCoins(Math.min(4, coinsCounted), 4.5);
    }
    this.#view.setLeverAngle(this.#lever.angle);
    this.#view.setDisplays(this.#hud.displayedBalance, this.#hud.displayedWin);
    this.#view.update(dt, now);
    if (!this.#renderer.isContextLost) this.#view.render();

    this.#frameHandle = requestAnimationFrame(this.#frame);
  };
}
