/**
 * Minimal synchronous event emitter used for loose coupling between subsystems.
 */
export class EventEmitter {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * @param {string} event
   * @param {(payload?: any) => void} listener
   * @returns {() => void} unsubscribe function
   */
  on(event, listener) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }

  /**
   * @param {string} event
   * @param {Function} listener
   */
  off(event, listener) {
    this.#listeners.get(event)?.delete(listener);
  }

  /**
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) listener(payload);
  }

  removeAllListeners() {
    this.#listeners.clear();
  }
}
