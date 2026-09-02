import { STOPS_PER_REEL, SYMBOL } from '../math/SlotMath.js';

/**
 * World-space layout of the machine (units are arbitrary "machine units";
 * the camera fits `sceneBounds` into the viewport). The front plane is z = 0.
 */
const REEL_WIDTH = 1.9;
const REEL_GAP = 0.14;
const REEL_RADIUS = 3.66;
const WINDOW_CENTER_Y = 1.7;

export const LAYOUT = Object.freeze({
  body: Object.freeze({ center: [0, 0], half: [4.0, 6.0], radius: 0.45 }),
  window: Object.freeze({ center: [0, WINDOW_CENTER_Y], half: [3.1, 1.75], radius: 0.18 }),
  marquee: Object.freeze({ center: [0, 4.75], half: [3.2, 0.72], radius: 0.25 }),
  display: Object.freeze({ center: [0, -1.2], half: [2.9, 0.52], radius: 0.15 }),
  creditsDisplay: Object.freeze({ center: [-1.5, -1.2], half: [1.25, 0.36], digits: 4 }),
  winDisplay: Object.freeze({ center: [1.5, -1.2], half: [1.25, 0.36], digits: 4 }),
  tray: Object.freeze({ center: [0, -4.95], half: [1.7, 0.42], radius: 0.2 }),
  reel: Object.freeze({
    width: REEL_WIDTH,
    gap: REEL_GAP,
    radius: REEL_RADIUS,
    stopAngle: (Math.PI * 2) / STOPS_PER_REEL,
    /** Arc length of one stop on the cylinder surface. */
    stopHeight: REEL_RADIUS * ((Math.PI * 2) / STOPS_PER_REEL),
    z: -0.14,
    centerY: WINDOW_CENTER_Y,
    xPositions: Object.freeze([-(REEL_WIDTH + REEL_GAP), 0, REEL_WIDTH + REEL_GAP]),
    /** World size of a single symbol glyph inside a cell. */
    symbolSize: 1.0,
  }),
  lever: Object.freeze({
    pivot: [4.25, 1.0],
    length: 2.6,
    /** Fully pulled angle (radians from "up"). */
    maxAngle: 1.9,
    /** Quad that contains the lever in every pose. */
    quad: Object.freeze({ center: [4.5, 1.6], half: [1.1, 2.65] }),
    /** Hit radius around the knob for pointer grabbing. */
    grabRadius: 0.75,
    /** Vertical pointer travel (world units) for a full pull. */
    pullTravel: 2.4,
  }),
  /** Rectangle the camera keeps in view (centre + size). */
  sceneBounds: Object.freeze({ x: 0.45, y: 0, width: 10.3, height: 13.4 }),
});

/**
 * Cell index of every symbol inside the baked symbol atlas.
 * @type {Readonly<Record<string, number>>}
 */
export const SYMBOL_ATLAS_INDEX = Object.freeze({
  [SYMBOL.SEVEN]: 0,
  [SYMBOL.BAR]: 1,
  [SYMBOL.MELON]: 2,
  [SYMBOL.BELL]: 3,
  [SYMBOL.PLUM]: 4,
  [SYMBOL.ORANGE]: 5,
  [SYMBOL.CHERRY]: 6,
  [SYMBOL.LEMON]: 7,
});

export const ATLAS_SPEC = Object.freeze({ cols: 4, rows: 2, cellSize: 256 });
