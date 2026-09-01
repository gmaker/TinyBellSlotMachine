import { EventEmitter } from '../core/EventEmitter.js';

const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'A', 'DETAILS']);

/**
 * Pointer Events + keyboard. Converts pointer positions to world coordinates
 * on the machine's front plane and emits high-level events:
 * `pointerdown`, `pointermove`, `pointerup` ({x, y, world, pointerId}),
 * `spin` (Space/Enter), `mute` (M), `firstInteraction` (once).
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

    this.#listen(canvas, 'pointerdown', (e) => {
      this.#markInteraction();
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
    this.#listen(canvas, 'lostpointercapture', (e) => this.emit('pointerup', this.#toEvent(e)));

    this.#listen(window, 'keydown', (e) => {
      const target = /** @type {HTMLElement|null} */ (e.target);
      if (target && INTERACTIVE_TAGS.has(target.tagName)) return; // native button handling
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.#markInteraction();
        this.emit('spin');
      } else if (e.code === 'KeyM') {
        this.#markInteraction();
        this.emit('mute');
      }
    });
    this.#listen(window, 'pointerdown', () => this.#markInteraction(), { capture: true });
    this.#listen(window, 'keydown', () => this.#markInteraction(), { capture: true });
  }

  get hasInteracted() {
    return this.#interacted;
  }

  /**
   * @param {PointerEvent} e
   */
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
