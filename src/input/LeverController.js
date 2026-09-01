import { EventEmitter } from '../core/EventEmitter.js';

const PULL_THRESHOLD = 0.82;
const SPRING_STIFFNESS = 140;
const SPRING_DAMPING = 14;
const AUTO_PULL_SPEED = 7.5; // pull units per second

/**
 * Drag / auto-pull behaviour and spring animation of the side lever.
 * `pull` is 0 (rest) .. 1 (fully pulled); `angle` is what the view renders.
 *
 * Events: `grab`, `release`, `pull` (threshold crossed, once per gesture),
 * `bottom` (reached full travel).
 */
export class LeverController extends EventEmitter {
  #layout;
  #pull = 0;
  #velocity = 0;
  #dragging = false;
  #dragStartY = 0;
  #dragStartPull = 0;
  #triggered = false;
  #autoPulling = false;
  #hover = false;

  /**
   * @param {typeof import('../view/layout.js').LAYOUT.lever} layout
   */
  constructor(layout) {
    super();
    this.#layout = layout;
  }

  /** 0..1 */
  get pull() {
    return this.#pull;
  }

  /** Radians from the rest position, for rendering. */
  get angle() {
    return this.#pull * this.#layout.maxAngle;
  }

  get isDragging() {
    return this.#dragging;
  }

  get isHovering() {
    return this.#hover;
  }

  /** Knob position in world coordinates for the current pull. */
  knobPosition() {
    const [px, py] = this.#layout.pivot;
    const a = this.angle;
    return { x: px + 0.42 * Math.sin(a), y: py + this.#layout.length * Math.cos(a) };
  }

  /**
   * @param {number} x world
   * @param {number} y world
   */
  hitTest(x, y) {
    const knob = this.knobPosition();
    const dx = x - knob.x;
    const dy = y - knob.y;
    if (Math.hypot(dx, dy) <= this.#layout.grabRadius) return true;
    // also accept the rod
    const [px, py] = this.#layout.pivot;
    const rodDx = x - px;
    if (Math.abs(rodDx) < 0.45 && y > py - 0.2 && y < knob.y + 0.2 && this.#pull < 0.15) return true;
    return false;
  }

  /**
   * @param {{x:number,y:number}} world
   * @returns {boolean} true when the lever grabbed the pointer
   */
  pointerDown(world) {
    if (!this.hitTest(world.x, world.y)) return false;
    this.#dragging = true;
    this.#autoPulling = false;
    this.#triggered = false;
    this.#dragStartY = world.y;
    this.#dragStartPull = this.#pull;
    this.#velocity = 0;
    this.emit('grab');
    return true;
  }

  /** @param {{x:number,y:number}} world */
  pointerMove(world) {
    if (!this.#dragging) {
      const hovering = this.hitTest(world.x, world.y);
      if (hovering !== this.#hover) {
        this.#hover = hovering;
        this.emit('hover', hovering);
      }
      return;
    }
    const delta = (this.#dragStartY - world.y) / this.#layout.pullTravel;
    const next = Math.min(1, Math.max(0, this.#dragStartPull + delta));
    this.#setPull(next);
  }

  pointerUp() {
    if (!this.#dragging) return;
    this.#dragging = false;
    this.emit('release');
  }

  /** Animate a full pull (button / keyboard spin) and let the spring return. */
  autoPull() {
    if (this.#dragging) return;
    this.#autoPulling = true;
    this.#triggered = true; // spin already requested by the caller
  }

  /** @param {number} dt seconds */
  update(dt) {
    if (this.#dragging) return;
    if (this.#autoPulling) {
      this.#pull = Math.min(1, this.#pull + AUTO_PULL_SPEED * dt);
      if (this.#pull >= 1) {
        this.#autoPulling = false;
        this.#velocity = 0;
        this.emit('bottom');
      }
      return;
    }
    if (this.#pull <= 0 && Math.abs(this.#velocity) < 1e-3) {
      this.#pull = 0;
      this.#velocity = 0;
      this.#triggered = false;
      return;
    }
    // damped spring back to rest
    const accel = -SPRING_STIFFNESS * this.#pull - SPRING_DAMPING * this.#velocity;
    this.#velocity += accel * dt;
    this.#pull += this.#velocity * dt;
    if (this.#pull < 0) {
      this.#pull = 0;
      this.#velocity *= -0.25; // small bounce against the stop
      if (Math.abs(this.#velocity) < 0.3) this.#velocity = 0;
    }
  }

  /** @param {number} value */
  #setPull(value) {
    const previous = this.#pull;
    this.#pull = value;
    if (!this.#triggered && previous < PULL_THRESHOLD && value >= PULL_THRESHOLD) {
      this.#triggered = true;
      this.emit('pull');
    }
    if (previous < 1 && value >= 1) this.emit('bottom');
  }
}
