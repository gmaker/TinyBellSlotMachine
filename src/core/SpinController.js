import { EventEmitter } from './EventEmitter.js';
import { REEL_COUNT, STOPS_PER_REEL, evaluateIndices } from '../math/SlotMath.js';
import { DEFAULT_TIMING } from '../reels/ReelTiming.js';

/** @enum {string} */
export const SpinPhase = Object.freeze({
  IDLE: 'IDLE',
  PULLING: 'PULLING',
  SPINNING: 'SPINNING',
  STOPPING: 'STOPPING',
  EVALUATING: 'EVALUATING',
  PAYING: 'PAYING',
});

/** Lever travel before the reels start (s). */
export const DEFAULT_PULL_DURATION = 0.18;
const LOSS_PAUSE = 0.25;
const PAY_BASE = 0.6;
const PAY_PER_COIN = 0.012;
const PAY_MAX = 2.6;

/**
 * Presentation time for a payout (the balance "counts up" during this window).
 * @param {number} payout
 */
export function defaultPayDuration(payout) {
  if (payout <= 0) return LOSS_PAUSE;
  return Math.min(PAY_MAX, PAY_BASE + payout * PAY_PER_COIN);
}

/**
 * Finite state machine that drives a spin:
 * `IDLE -> PULLING -> SPINNING -> STOPPING -> EVALUATING -> PAYING -> IDLE`.
 *
 * Events: `phase`, `spinAccepted`, `spinStarted`, `reelTicks`, `reelStopped`,
 * `evaluated`, `idle`, `rejected`.
 *
 * The outcome is decided by the injected RNG at acceptance time, *before* any
 * animation. The reels merely animate towards those physical indices.
 */
export class SpinController extends EventEmitter {
  #state;
  #rng;
  #reelSet;
  #timing;
  #pullDuration;
  #payDuration;
  #phase = SpinPhase.IDLE;
  #phaseStartedAt = 0;
  /** @type {readonly number[]|null} */
  #targets = null;
  /** @type {import('../math/SlotMath.js').SpinResult|null} */
  #result = null;
  #payEndsAt = 0;

  /**
   * @param {object} deps
   * @param {import('./GameState.js').GameState} deps.state
   * @param {import('./Rng.js').Rng} deps.rng
   * @param {import('../reels/ReelSet.js').ReelSet} deps.reelSet
   * @param {import('../reels/ReelTiming.js').ReelTimingProfile} [deps.timing]
   * @param {number} [deps.pullDuration]
   * @param {(payout: number) => number} [deps.payDuration]
   */
  constructor({ state, rng, reelSet, timing = DEFAULT_TIMING, pullDuration = DEFAULT_PULL_DURATION, payDuration = defaultPayDuration }) {
    super();
    this.#state = state;
    this.#rng = rng;
    this.#reelSet = reelSet;
    this.#timing = timing;
    this.#pullDuration = pullDuration;
    this.#payDuration = payDuration;
  }

  get phase() {
    return this.#phase;
  }

  get targets() {
    return this.#targets;
  }

  get result() {
    return this.#result;
  }

  get isIdle() {
    return this.#phase === SpinPhase.IDLE;
  }

  /** @param {import('../reels/ReelTiming.js').ReelTimingProfile} timing */
  setTiming(timing) {
    this.#timing = timing;
  }

  /**
   * Try to start a spin. Debits the bet immediately and pre-selects the
   * physical stop of every reel.
   * @param {number} now Current time (s).
   * @returns {boolean} true when the spin was accepted.
   */
  requestSpin(now) {
    if (this.#phase !== SpinPhase.IDLE || !this.#state.canSpin()) {
      this.emit('rejected', { phase: this.#phase, balance: this.#state.balance });
      return false;
    }
    this.#state.beginSpin();
    this.#targets = Object.freeze(
      Array.from({ length: REEL_COUNT }, () => this.#rng.nextInt(STOPS_PER_REEL)),
    );
    this.#result = null;
    this.#setPhase(SpinPhase.PULLING, now);
    this.emit('spinAccepted', { targets: this.#targets });
    return true;
  }

  /**
   * Advance the state machine.
   * @param {number} now Current time (s).
   */
  update(now) {
    switch (this.#phase) {
      case SpinPhase.IDLE:
        return;
      case SpinPhase.PULLING:
        if (now - this.#phaseStartedAt >= this.#pullDuration) {
          const plans = this.#reelSet.startSpin(this.#targets, now, this.#timing);
          this.#setPhase(SpinPhase.SPINNING, now);
          this.emit('spinStarted', { targets: this.#targets, plans });
        }
        return;
      case SpinPhase.SPINNING:
      case SpinPhase.STOPPING:
        this.#advanceReels(now);
        return;
      case SpinPhase.EVALUATING:
        this.#evaluate(now);
        return;
      case SpinPhase.PAYING:
        if (now >= this.#payEndsAt) {
          this.#state.endSpin();
          this.#setPhase(SpinPhase.IDLE, now);
          this.emit('idle', { result: this.#result });
        }
        return;
      default:
        throw new Error(`Unknown phase ${this.#phase}`);
    }
  }

  /** @param {number} now */
  #advanceReels(now) {
    const { ticks, stopped } = this.#reelSet.update(now);
    if (ticks.some((t) => t > 0)) this.emit('reelTicks', ticks);
    if (this.#phase === SpinPhase.SPINNING && this.#reelSet.anyBraking) {
      this.#setPhase(SpinPhase.STOPPING, now);
    }
    for (const reelIndex of stopped) {
      this.emit('reelStopped', { reelIndex, stopIndex: this.#reelSet.reels[reelIndex].centerStopIndex });
    }
    if (this.#reelSet.allStopped) {
      this.#setPhase(SpinPhase.EVALUATING, now);
      this.#evaluate(now);
    }
  }

  /** @param {number} now */
  #evaluate(now) {
    const landed = this.#reelSet.stopIndices;
    if (landed.some((index, i) => index !== this.#targets[i])) {
      throw new Error(`Reels landed on ${landed} but ${this.#targets} was drawn`);
    }
    this.#result = evaluateIndices(landed, this.#state.bet);
    this.#state.settleSpin(this.#result);
    this.#payEndsAt = now + this.#payDuration(this.#result.payout);
    this.#setPhase(SpinPhase.PAYING, now);
    this.emit('evaluated', this.#result);
  }

  /**
   * @param {string} phase
   * @param {number} now
   */
  #setPhase(phase, now) {
    const previous = this.#phase;
    this.#phase = phase;
    this.#phaseStartedAt = now;
    this.emit('phase', { phase, previous });
  }
}
