import { EventEmitter } from './EventEmitter.js';

export const INITIAL_BALANCE = 100;
export const BET_PER_SPIN = 1;

/**
 * Player-facing state: balance, bet, last result and the input lock.
 * Emits `change` whenever a public value changes.
 *
 * The state is the only place that mutates the balance. Debit happens exactly
 * once when a spin is accepted, credit exactly once when it is settled.
 */
export class GameState extends EventEmitter {
  #balance = INITIAL_BALANCE;
  #lastWin = 0;
  /** @type {import('../math/SlotMath.js').SpinResult|null} */
  #lastResult = null;
  #locked = false;
  #spinCount = 0;

  get balance() {
    return this.#balance;
  }

  get bet() {
    return BET_PER_SPIN;
  }

  get lastWin() {
    return this.#lastWin;
  }

  get lastResult() {
    return this.#lastResult;
  }

  /** True while a spin is in progress (input is blocked). */
  get locked() {
    return this.#locked;
  }

  get spinCount() {
    return this.#spinCount;
  }

  get isBroke() {
    return this.#balance < BET_PER_SPIN;
  }

  /** @returns {boolean} whether a new spin may start right now */
  canSpin() {
    return !this.#locked && this.#balance >= BET_PER_SPIN;
  }

  /**
   * Accept a spin: debit the bet and lock input.
   * @throws {Error} when a spin is not allowed.
   */
  beginSpin() {
    if (!this.canSpin()) {
      throw new Error(this.#locked ? 'Spin already in progress' : 'Insufficient balance');
    }
    this.#balance -= BET_PER_SPIN;
    this.#locked = true;
    this.#lastWin = 0;
    this.#lastResult = null;
    this.#spinCount += 1;
    this.emit('change', this.snapshot());
  }

  /**
   * Credit the result of the current spin (exactly once per spin).
   * @param {import('../math/SlotMath.js').SpinResult} result
   * @throws {Error} when no spin is in progress or it was already settled.
   */
  settleSpin(result) {
    if (!this.#locked) throw new Error('No spin in progress');
    if (this.#lastResult) throw new Error('Spin already settled');
    this.#lastResult = result;
    this.#lastWin = result.payout;
    this.#balance += result.payout;
    this.emit('change', this.snapshot());
  }

  /** Release the input lock after the payout presentation finished. */
  endSpin() {
    if (!this.#locked) return;
    this.#locked = false;
    this.emit('change', this.snapshot());
  }

  /** Explicit "New game": reset balance to 100 coins. */
  reset() {
    this.#balance = INITIAL_BALANCE;
    this.#lastWin = 0;
    this.#lastResult = null;
    this.#locked = false;
    this.#spinCount = 0;
    this.emit('change', this.snapshot());
    this.emit('reset');
  }

  snapshot() {
    return Object.freeze({
      balance: this.#balance,
      bet: BET_PER_SPIN,
      lastWin: this.#lastWin,
      lastResult: this.#lastResult,
      locked: this.#locked,
      spinCount: this.#spinCount,
    });
  }
}
