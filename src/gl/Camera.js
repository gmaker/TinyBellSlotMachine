import { multiply, perspective, transformPoint, translation } from './mat4.js';

/**
 * Light perspective camera looking down -Z at the machine's front plane (z = 0).
 * Fits a world-space rectangle into the viewport ("contain" behaviour).
 */
export class Camera {
  #fovY;
  #near;
  #far;
  #aspect = 1;
  #cssWidth = 1;
  #cssHeight = 1;
  #target = { x: 0, y: 0 };
  #distance = 30;
  #shake = { x: 0, y: 0 };
  #viewProj = new Float32Array(16);
  #proj = new Float32Array(16);
  #dirty = true;
  #bounds = { x: 0, y: 0, width: 10, height: 10 };

  /**
   * @param {object} [options]
   * @param {number} [options.fovY] radians
   * @param {number} [options.near]
   * @param {number} [options.far]
   */
  constructor({ fovY = (22 * Math.PI) / 180, near = 0.5, far = 200 } = {}) {
    this.#fovY = fovY;
    this.#near = near;
    this.#far = far;
  }

  /**
   * @param {number} cssWidth
   * @param {number} cssHeight
   */
  setViewport(cssWidth, cssHeight) {
    this.#cssWidth = Math.max(1, cssWidth);
    this.#cssHeight = Math.max(1, cssHeight);
    this.#aspect = this.#cssWidth / this.#cssHeight;
    this.#fit();
  }

  /**
   * World rectangle (on z = 0) that must stay fully visible.
   * @param {{x:number,y:number,width:number,height:number}} bounds centre + size
   */
  setBounds(bounds) {
    this.#bounds = { ...bounds };
    this.#fit();
  }

  /**
   * Camera shake offset in world units (applied to the view translation).
   * @param {number} x
   * @param {number} y
   */
  setShake(x, y) {
    if (x === this.#shake.x && y === this.#shake.y) return;
    this.#shake.x = x;
    this.#shake.y = y;
    this.#dirty = true;
  }

  get distance() {
    return this.#distance;
  }

  get aspect() {
    return this.#aspect;
  }

  /** Projection matrix [1][1] element — used to size point sprites. */
  get projectionScaleY() {
    this.#update();
    return this.#proj[5];
  }

  get viewProj() {
    this.#update();
    return this.#viewProj;
  }

  /**
   * Project a world point to CSS pixels relative to the canvas top-left.
   * @param {number} x
   * @param {number} y
   * @param {number} [z]
   */
  project(x, y, z = 0) {
    const ndc = transformPoint(this.viewProj, x, y, z);
    return {
      x: (ndc.x * 0.5 + 0.5) * this.#cssWidth,
      y: (0.5 - ndc.y * 0.5) * this.#cssHeight,
    };
  }

  /**
   * Inverse of {@link project} for points on the z = 0 plane (analytic; the
   * camera looks straight at that plane so the mapping is affine).
   * @param {number} px CSS pixels from the canvas left edge
   * @param {number} py CSS pixels from the canvas top edge
   */
  unprojectToPlane(px, py) {
    const ndcX = (px / this.#cssWidth) * 2 - 1;
    const ndcY = 1 - (py / this.#cssHeight) * 2;
    const halfH = Math.tan(this.#fovY / 2) * this.#distance;
    const halfW = halfH * this.#aspect;
    return {
      x: this.#target.x + this.#shake.x + ndcX * halfW,
      y: this.#target.y + this.#shake.y + ndcY * halfH,
    };
  }

  /** World units per CSS pixel on the z = 0 plane. */
  get worldPerPixel() {
    return (2 * Math.tan(this.#fovY / 2) * this.#distance) / this.#cssHeight;
  }

  #fit() {
    const halfTan = Math.tan(this.#fovY / 2);
    const byHeight = this.#bounds.height / 2 / halfTan;
    const byWidth = this.#bounds.width / 2 / (halfTan * this.#aspect);
    this.#distance = Math.max(byHeight, byWidth);
    this.#target = { x: this.#bounds.x, y: this.#bounds.y };
    this.#dirty = true;
  }

  #update() {
    if (!this.#dirty) return;
    this.#proj = perspective(this.#fovY, this.#aspect, this.#near, this.#far);
    const view = translation(-(this.#target.x + this.#shake.x), -(this.#target.y + this.#shake.y), -this.#distance);
    multiply(this.#proj, view, this.#viewProj);
    this.#dirty = false;
  }
}
