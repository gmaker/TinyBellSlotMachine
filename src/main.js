import { Game } from './core/Game.js';
import { enumerateOutcomes, verifyMath } from './math/SlotMath.js';
import { FatalMessage } from './ui/FatalMessage.js';

const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('scene'));
const devMode = new URLSearchParams(window.location.search).has('dev');

try {
  if (!canvas) throw new Error('Canvas #scene not found');
  const game = new Game({ canvas, devMode });
  game.start();
  // Console helpers: `slot.verifyMath()` enumerates all 8000 outcomes.
  window.slot = Object.freeze({ game, verifyMath, enumerateOutcomes });
  if (devMode) {
    // eslint-disable-next-line no-console
    console.table(verifyMath().rows);
  }
} catch (error) {
  console.error(error);
  new FatalMessage().show(
    'WebGL2 недоступен',
    `Для игры нужен браузер с поддержкой WebGL2 (актуальные Chrome, Firefox, Edge, Safari). ${error instanceof Error ? error.message : ''}`,
  );
}
