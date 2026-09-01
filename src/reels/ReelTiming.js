/**
 * Timing profiles for the reel animation. Everything is expressed in seconds
 * and "stops" (one stop = one symbol cell of the tape).
 *
 * The stop phase eases over a fixed distance; the cruise speed is derived so
 * that the speed is continuous when braking starts:
 *   cruiseSpeed = stopDistance * ease'(0) / stopDuration
 */

/** Ease-out with a mechanical overshoot (the reel passes the stop and snaps back). */
export function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
/** Initial slope of {@link easeOutBack}: 3*c3 - 2*c1 */
const EASE_OUT_BACK_SLOPE = 3 * (1.70158 + 1) - 2 * 1.70158;

/** Plain ease-out without overshoot (used for reduced motion). */
export function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}
const EASE_OUT_CUBIC_SLOPE = 3;

/**
 * @typedef {object} ReelTimingProfile
 * @property {number} startDelay Delay between consecutive reels starting (s).
 * @property {number} accelDuration Time to reach cruise speed (s).
 * @property {number} firstStopDelay Earliest braking time of reel 1 after spin start (s).
 * @property {number} stopGap Minimum time between consecutive reels braking (s).
 * @property {number} stopDuration Duration of the braking ease (s).
 * @property {number} stopDistance Distance covered while braking (stops).
 * @property {(x: number) => number} ease Braking ease, ease(0)=0, ease(1)=1.
 * @property {number} cruiseSpeed Constant spin speed (stops per second), derived.
 */

/**
 * @param {Omit<ReelTimingProfile, 'cruiseSpeed'> & { easeSlope: number }} params
 * @returns {ReelTimingProfile}
 */
function makeProfile({ easeSlope, ...params }) {
  const cruiseSpeed = (params.stopDistance * easeSlope) / params.stopDuration;
  return Object.freeze({ ...params, cruiseSpeed });
}

export const DEFAULT_TIMING = makeProfile({
  startDelay: 0.12,
  accelDuration: 0.35,
  firstStopDelay: 0.8,
  stopGap: 0.28,
  stopDuration: 0.55,
  stopDistance: 3.5,
  ease: easeOutBack,
  easeSlope: EASE_OUT_BACK_SLOPE,
});

export const REDUCED_MOTION_TIMING = makeProfile({
  startDelay: 0.05,
  accelDuration: 0.12,
  firstStopDelay: 0.3,
  stopGap: 0.15,
  stopDuration: 0.3,
  stopDistance: 3.0,
  ease: easeOutCubic,
  easeSlope: EASE_OUT_CUBIC_SLOPE,
});
