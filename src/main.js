import { Game } from './core/Game.js';
import { enumerateOutcomes, verifyMath } from './math/SlotMath.js';

const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('scene'));
const unsupported = document.getElementById('webgl-unsupported');
const devMode = new URLSearchParams(window.location.search).has('dev');

try {
  if (!canvas) throw new Error('Canvas #scene not found');
  const game = new Game({ canvas, devMode });
  game.start();
  // Dev console helpers: `slot.verifyMath()` enumerates all 8000 outcomes.
  window.slot = Object.freeze({ game, verifyMath, enumerateOutcomes });
  if (devMode) {
    // eslint-disable-next-line no-console
    console.table(verifyMath().rows);
  }
} catch (error) {
  console.error(error);
  if (unsupported) {
    unsupported.hidden = false;
    const detail = unsupported.querySelector('[data-detail]');
    if (detail) detail.textContent = error instanceof Error ? error.message : String(error);
  }
}
