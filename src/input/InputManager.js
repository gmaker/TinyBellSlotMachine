import { EventEmitter } from '../core/EventEmitter.js';

/**
 * Pointer Events + keyboard on the single canvas. Converts pointer positions
 * to world coordinates on the machine's front plane and emits:
 * `pointerdown` / `pointermove` / `pointerup` ({x, y, world, pointerId}),
 * `spin` (Space/Enter), `mute` (M), `paytable` (T or P), `escape`,
 * `newGame` (N), `settings` (S), `firstInteraction` (once).
 */
export class InputManager extends EventEmitter {
  #canvas;
  #camera;
  #interacted = false;
  #handlers = [];

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../gl/Camera.js').Camera} camera
   */
  constructor(canvas, camera) {
    super();
    this.#canvas = canvas;
    this.#camera = camera;
    canvas.style.touchAction = 'none';
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;

    this.#listen(canvas, 'pointerdown', (e) => {
      this.#markInteraction();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture?.(e.pointerId);
      this.emit('pointerdown', this.#toEvent(e));
    });
    this.#listen(canvas, 'pointermove', (e) => this.emit('pointermove', this.#toEvent(e)));
    const up = (e) => {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      this.emit('pointerup', this.#toEvent(e));
    };
    this.#listen(canvas, 'pointerup', up);
    this.#listen(canvas, 'pointercancel', up);

    this.#listen(window, 'keydown', (e) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const byCode = {
        Space: 'spin',
        Enter: 'spin',
        NumpadEnter: 'spin',
        KeyM: 'mute',
        KeyT: 'paytable',
        KeyP: 'paytable',
        Escape: 'escape',
        KeyN: 'newGame',
        KeyS: 'settings',
      };
      const byKey = { ' ': 'spin', Enter: 'spin', m: 'mute', ь: 'mute', t: 'paytable', е: 'paytable', p: 'paytable', з: 'paytable', Escape: 'escape', Esc: 'escape', n: 'newGame', т: 'newGame', s: 'settings', ы: 'settings' };
      const event = byCode[e.code] ?? byKey[e.key?.toLowerCase?.() ?? ''] ?? byKey[e.key];
      if (!event) return;
      e.preventDefault();
      this.#markInteraction();
      this.emit(event);
    });
    this.#listen(window, 'pointerdown', () => this.#markInteraction(), { capture: true });
  }

  get hasInteracted() {
    return this.#interacted;
  }

  /** @param {PointerEvent} e */
  #toEvent(e) {
    const rect = this.#canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y, world: this.#camera.unprojectToPlane(x, y), pointerId: e.pointerId, buttons: e.buttons };
  }

  #markInteraction() {
    if (this.#interacted) return;
    this.#interacted = true;
    this.emit('firstInteraction');
  }

  #listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.#handlers.push(() => target.removeEventListener(type, handler, options));
  }

  dispose() {
    for (const off of this.#handlers) off();
    this.#handlers = [];
    this.removeAllListeners();
  }
}
