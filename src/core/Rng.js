/**
 * Random number generator contract. Implementations must return uniformly
 * distributed integers in `[0, maxExclusive)`.
 * @abstract
 */
export class Rng {
  /**
   * @param {number} maxExclusive
   * @returns {number}
   */
  // eslint-disable-next-line no-unused-vars
  nextInt(maxExclusive) {
    throw new Error('Rng.nextInt must be implemented');
  }
}

const UINT32_RANGE = 0x1_0000_0000;

/**
 * Production RNG. Uses `crypto.getRandomValues` with rejection sampling so the
 * distribution over `[0, maxExclusive)` is exactly uniform (no modulo bias).
 * Falls back to `Math.random` when Web Crypto is unavailable.
 */
export class CryptoRng extends Rng {
  #buffer = new Uint32Array(1);
  #crypto = typeof globalThis.crypto?.getRandomValues === 'function' ? globalThis.crypto : null;

  nextInt(maxExclusive) {
    assertRange(maxExclusive);
    if (!this.#crypto) return Math.floor(Math.random() * maxExclusive);
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    let value;
    do {
      this.#crypto.getRandomValues(this.#buffer);
      value = this.#buffer[0];
    } while (value >= limit);
    return value % maxExclusive;
  }
}

/**
 * Deterministic RNG (mulberry32) for tests and reproducible sessions.
 */
export class SeededRng extends Rng {
  #state;

  /** @param {number} seed */
  constructor(seed = 1) {
    super();
    this.#state = seed >>> 0;
  }

  /** @returns {number} float in [0, 1) */
  nextFloat() {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  }

  nextInt(maxExclusive) {
    assertRange(maxExclusive);
    return Math.floor(this.nextFloat() * maxExclusive);
  }
}

/**
 * Scripted RNG that replays a fixed queue of values. Useful for tests that
 * need specific reel targets.
 */
export class SequenceRng extends Rng {
  #values;
  #cursor = 0;

  /** @param {number[]} values */
  constructor(values) {
    super();
    this.#values = [...values];
  }

  nextInt(maxExclusive) {
    assertRange(maxExclusive);
    if (this.#cursor >= this.#values.length) {
      throw new Error('SequenceRng exhausted');
    }
    const value = this.#values[this.#cursor++];
    if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
      throw new RangeError(`SequenceRng value ${value} is outside [0, ${maxExclusive})`);
    }
    return value;
  }
}

function assertRange(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
}
