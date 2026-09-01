/**
 * @typedef {object} ReelPlan Fully deterministic timeline of one spin.
 * @property {number} startTime When the reel starts accelerating.
 * @property {number} cruiseTime When cruise speed is reached.
 * @property {number} brakeTime When braking starts.
 * @property {number} stopTime When the reel is fully stopped.
 * @property {number} startPosition
 * @property {number} cruiseStartPosition
 * @property {number} finalPosition Congruent to the target index (mod strip length).
 * @property {number} stopDistance
 * @property {number} cruiseSpeed
 * @property {(x: number) => number} ease
 * @property {number} target
 */

/**
 * Logical state of a single reel: a continuous `position` measured in stops.
 * `position` decreases while spinning — the tape scrolls downwards — and the
 * stop displayed at the pay line is `round(position) mod stripLength`.
 * Neighbouring stops follow the physical strip: index-1 above, index+1 below.
 *
 * The reel knows nothing about WebGL; it only evaluates its plan over time.
 */
export class Reel {
  #index;
  #stripLength;
  #position = 0;
  /** @type {ReelPlan|null} */
  #plan = null;
  #stopped = true;

  /**
   * @param {number} index Reel index (0-based).
   * @param {number} stripLength Physical stops on the strip (20).
   * @param {number} [initialStop=0]
   */
  constructor(index, stripLength, initialStop = 0) {
    this.#index = index;
    this.#stripLength = stripLength;
    this.#position = initialStop;
  }

  get index() {
    return this.#index;
  }

  get stripLength() {
    return this.#stripLength;
  }

  /** Continuous position in stops (may be any real number while spinning). */
  get position() {
    return this.#position;
  }

  /** Physical stop index currently closest to the pay line. */
  get centerStopIndex() {
    return this.#wrap(Math.round(this.#position));
  }

  get isSpinning() {
    return !this.#stopped;
  }

  get isBraking() {
    return this.#plan !== null && !this.#stopped && this.#plan.brakeTime <= this.#lastTime;
  }

  /** Target stop of the active/last plan, or null. */
  get target() {
    return this.#plan?.target ?? null;
  }

  get plan() {
    return this.#plan;
  }

  #lastTime = -Infinity;

  /**
   * Snap the reel to a physical stop immediately (initial layout, reset).
   * @param {number} stopIndex
   */
  setStop(stopIndex) {
    this.#position = this.#wrap(stopIndex);
    this.#plan = null;
    this.#stopped = true;
  }

  /**
   * Install a plan produced by {@link ReelSet}. Position is normalised to
   * `[0, stripLength)` beforehand so it never grows unbounded.
   * @param {ReelPlan} plan
   * @param {number} now
   */
  startPlan(plan, now) {
    this.#plan = plan;
    this.#stopped = false;
    this.#lastTime = now;
    this.#position = plan.startPosition;
  }

  /**
   * Evaluate the plan at an absolute time.
   * @param {number} t
   * @returns {number} position in stops
   */
  positionAt(t) {
    const p = this.#plan;
    if (!p) return this.#position;
    if (t <= p.startTime) return p.startPosition;
    if (t < p.cruiseTime) {
      const tau = t - p.startTime;
      const accelDuration = p.cruiseTime - p.startTime;
      return p.startPosition - (p.cruiseSpeed * tau * tau) / (2 * accelDuration);
    }
    if (t < p.brakeTime) {
      return p.cruiseStartPosition - p.cruiseSpeed * (t - p.cruiseTime);
    }
    if (t < p.stopTime) {
      const x = (t - p.brakeTime) / (p.stopTime - p.brakeTime);
      return p.finalPosition + p.stopDistance * (1 - p.ease(x));
    }
    return p.finalPosition;
  }

  /**
   * Advance to time `now`.
   * @param {number} now
   * @returns {{ ticks: number, justStopped: boolean }} number of stop boundaries
   * crossed since the previous update and whether the reel came to rest.
   */
  update(now) {
    if (this.#stopped || !this.#plan) return { ticks: 0, justStopped: false };
    const previous = this.#position;
    const next = this.positionAt(now);
    this.#lastTime = now;
    this.#position = next;
    const ticks = Math.abs(Math.floor(next) - Math.floor(previous));

    let justStopped = false;
    if (now >= this.#plan.stopTime) {
      this.#stopped = true;
      justStopped = true;
      // Land exactly on the physical target, normalised to the strip range.
      this.#position = this.#wrap(this.#plan.finalPosition);
      if (this.#position !== this.#plan.target) {
        throw new Error(`Reel ${this.#index} stopped at ${this.#position}, expected ${this.#plan.target}`);
      }
    }
    return { ticks, justStopped };
  }

  /** @param {number} value */
  #wrap(value) {
    const n = this.#stripLength;
    return ((Math.round(value) % n) + n) % n;
  }
}
