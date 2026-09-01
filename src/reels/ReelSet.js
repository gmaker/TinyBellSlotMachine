import { Reel } from './Reel.js';
import { DEFAULT_TIMING } from './ReelTiming.js';

/**
 * Owns the three logical reels and builds their deterministic spin plans.
 *
 * Plans are computed at spin start from the pre-selected target indices; the
 * animation therefore *cannot* land anywhere but the chosen physical stops.
 * Reels brake left to right with a guaranteed minimum gap between them.
 */
export class ReelSet {
  /** @type {Reel[]} */
  #reels;
  #stripLength;

  /**
   * @param {number} reelCount
   * @param {number} stripLength
   * @param {readonly number[]} [initialStops]
   */
  constructor(reelCount, stripLength, initialStops = []) {
    this.#stripLength = stripLength;
    this.#reels = Array.from(
      { length: reelCount },
      (_, i) => new Reel(i, stripLength, initialStops[i] ?? 0),
    );
  }

  /** @returns {readonly Reel[]} */
  get reels() {
    return this.#reels;
  }

  get stripLength() {
    return this.#stripLength;
  }

  get allStopped() {
    return this.#reels.every((r) => !r.isSpinning);
  }

  get anyBraking() {
    return this.#reels.some((r) => r.isBraking);
  }

  /** Physical stop indices at the pay line. */
  get stopIndices() {
    return this.#reels.map((r) => r.centerStopIndex);
  }

  /** Time at which the last reel comes to rest for the active spin. */
  get finishTime() {
    return Math.max(...this.#reels.map((r) => r.plan?.stopTime ?? -Infinity));
  }

  /**
   * @param {readonly number[]} stops
   */
  setStops(stops) {
    this.#reels.forEach((reel, i) => reel.setStop(stops[i] ?? 0));
  }

  /**
   * Build and start plans for every reel.
   * @param {readonly number[]} targets Target stop index per reel (0..19).
   * @param {number} now Current time (s).
   * @param {import('./ReelTiming.js').ReelTimingProfile} [timing]
   * @returns {import('./Reel.js').ReelPlan[]}
   */
  startSpin(targets, now, timing = DEFAULT_TIMING) {
    if (targets.length !== this.#reels.length) {
      throw new RangeError(`Expected ${this.#reels.length} targets`);
    }
    if (!this.allStopped) throw new Error('Reels are already spinning');

    const n = this.#stripLength;
    let previousBrake = -Infinity;
    return this.#reels.map((reel, i) => {
      const target = targets[i];
      if (!Number.isInteger(target) || target < 0 || target >= n) {
        throw new RangeError(`Target ${target} for reel ${i} is outside 0..${n - 1}`);
      }

      const startTime = now + timing.startDelay * i;
      const cruiseTime = startTime + timing.accelDuration;
      const startPosition = reel.centerStopIndex; // normalised, in [0, n)
      const speed = timing.cruiseSpeed;
      const cruiseStartPosition = startPosition - (speed * timing.accelDuration) / 2;

      // Earliest moment this reel may start braking (keeps left-to-right order).
      const desiredBrake = Math.max(
        cruiseTime,
        i === 0 ? now + timing.firstStopDelay : previousBrake + timing.stopGap,
      );
      const positionAtDesired = cruiseStartPosition - speed * (desiredBrake - cruiseTime);
      // Largest value <= positionAtDesired - stopDistance that is congruent to
      // the target: the reel keeps cruising until it is exactly `stopDistance`
      // away from a physical stop equal to the target.
      const finalPosition =
        target + n * Math.floor((positionAtDesired - timing.stopDistance - target) / n);
      const brakeTime =
        cruiseTime + (cruiseStartPosition - (finalPosition + timing.stopDistance)) / speed;
      const stopTime = brakeTime + timing.stopDuration;
      previousBrake = brakeTime;

      /** @type {import('./Reel.js').ReelPlan} */
      const plan = Object.freeze({
        startTime,
        cruiseTime,
        brakeTime,
        stopTime,
        startPosition,
        cruiseStartPosition,
        finalPosition,
        stopDistance: timing.stopDistance,
        cruiseSpeed: speed,
        ease: timing.ease,
        target,
      });
      reel.startPlan(plan, now);
      return plan;
    });
  }

  /**
   * Advance all reels.
   * @param {number} now
   * @returns {{ ticks: number[], stopped: number[] }} ticks per reel and the
   * indices of reels that came to rest during this update.
   */
  update(now) {
    const ticks = new Array(this.#reels.length).fill(0);
    const stopped = [];
    this.#reels.forEach((reel, i) => {
      const result = reel.update(now);
      ticks[i] = result.ticks;
      if (result.justStopped) stopped.push(i);
    });
    return { ticks, stopped };
  }
}
