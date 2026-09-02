import { EventEmitter } from './EventEmitter.js';

export const INITIAL_BALANCE = 100;
/** Allowed bet multipliers (coins per spin). */
export const BET_OPTIONS = Object.freeze([1, 5, 10]);
export const MIN_BET = BET_OPTIONS[0];
/** @deprecated the bet is variable now; kept for older call sites. */
export const BET_PER_SPIN = MIN_BET;

/**
 * Player-facing state: balance, bet, last result and the input lock.
 * Emits `change` whenever a public value changes.
 *
 * The state is the only place that mutates the balance. Debit happens exactly
 * once when a spin is accepted, credit exactly once when it is settled.
 * The bet (1, 5 or 10 coins) can only change while no spin is in progress.
 */
export class GameState extends EventEmitter {
  #balance = INITIAL_BALANCE;
  #bet = MIN_BET;
  #lastWin = 0;
  /** @type {import('../math/SlotMath.js').SpinResult|null} */
  #lastResult = null;
  #locked = false;
  #spinCount = 0;

  get balance() {
    return this.#balance;
  }

  /** Coins wagered per spin. */
  get bet() {
    return this.#bet;
  }

  /**
   * @param {number} bet one of {@link BET_OPTIONS}
   * @throws {RangeError|Error} on an unknown value or while a spin is running
   */
  setBet(bet) {
    if (!BET_OPTIONS.includes(bet)) throw new RangeError(`Bet ${bet} is not one of ${BET_OPTIONS.join(', ')}`);
    if (this.#locked) throw new Error('Cannot change the bet during a spin');
    if (bet === this.#bet) return;
    this.#bet = bet;
    this.emit('change', this.snapshot());
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

  /** True when even the minimum bet is unaffordable. */
  get isBroke() {
    return this.#balance < MIN_BET;
  }

  /** True when the current bet exceeds the balance (a smaller bet might not). */
  get cannotAffordBet() {
    return this.#balance < this.#bet;
  }

  /** @returns {boolean} whether a new spin may start right now */
  canSpin() {
    return !this.#locked && this.#balance >= this.#bet;
  }

  /**
   * Accept a spin: debit the current bet and lock input.
   * @throws {Error} when a spin is not allowed.
   */
  beginSpin() {
    if (!this.canSpin()) {
      throw new Error(this.#locked ? 'Spin already in progress' : 'Insufficient balance');
    }
    this.#balance -= this.#bet;
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

  /** Explicit "New game": reset balance to 100 coins and the bet to the minimum. */
  reset() {
    this.#balance = INITIAL_BALANCE;
    this.#bet = MIN_BET;
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
      bet: this.#bet,
      lastWin: this.#lastWin,
      lastResult: this.#lastResult,
      locked: this.#locked,
      spinCount: this.#spinCount,
    });
  }
}
