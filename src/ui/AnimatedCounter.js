const APPROACH_RATE = 3.5;
const MIN_SPEED = 2; // units per second so tiny changes still move

/**
 * Number that eases towards its target (used for the coin displays).
 */
export class AnimatedCounter {
  #value;
  #target;

  /** @param {number} initial */
  constructor(initial = 0) {
    this.#value = initial;
    this.#target = initial;
  }

  get value() {
    return this.#value;
  }

  get rounded() {
    return Math.round(this.#value);
  }

  get target() {
    return this.#target;
  }

  get settled() {
    return this.#value === this.#target;
  }

  /**
   * @param {number} target
   * @param {boolean} [immediate]
   */
  set(target, immediate = false) {
    this.#target = target;
    if (immediate) this.#value = target;
  }

  /**
   * @param {number} dt seconds
   * @returns {number} whole units the rounded value moved (absolute)
   */
  update(dt) {
    const before = Math.round(this.#value);
    const diff = this.#target - this.#value;
    if (Math.abs(diff) < 0.02) {
      this.#value = this.#target;
    } else {
      const step = diff * Math.min(1, APPROACH_RATE * dt) + Math.sign(diff) * Math.min(Math.abs(diff), MIN_SPEED * dt);
      this.#value = Math.abs(step) >= Math.abs(diff) ? this.#target : this.#value + step;
    }
    return Math.abs(Math.round(this.#value) - before);
  }
}
