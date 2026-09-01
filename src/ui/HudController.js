import { EventEmitter } from '../core/EventEmitter.js';

const COUNT_SPEED = 3.5; // exponential approach rate for animated numbers

/**
 * DOM HUD: balance, bet, last win, status line, SPIN / mute / new game
 * buttons, paytable and dev panel. Also positions DOM labels anchored to
 * world-space points on the machine (`data-anchor="x,y"`).
 *
 * Events: `spin`, `mute`, `newGame`, `verify`.
 */
export class HudController extends EventEmitter {
  #el;
  #displayedBalance = 0;
  #displayedWin = 0;
  #targetBalance = 0;
  #targetWin = 0;
  #handlers = [];
  #anchors;
  #stage;

  /**
   * @param {Document|HTMLElement} root
   */
  constructor(root) {
    super();
    const q = (id) => {
      const node = root.querySelector(`#${id}`);
      if (!node) throw new Error(`HUD element #${id} is missing`);
      return /** @type {HTMLElement} */ (node);
    };
    this.#el = {
      balance: q('hud-balance'),
      bet: q('hud-bet'),
      lastWin: q('hud-last-win'),
      status: q('hud-status'),
      spin: /** @type {HTMLButtonElement} */ (q('spin-button')),
      mute: /** @type {HTMLButtonElement} */ (q('mute-button')),
      paytableBody: q('paytable-body'),
      paytableSummary: q('paytable-summary'),
      gameOver: q('game-over'),
      newGame: /** @type {HTMLButtonElement} */ (q('new-game-button')),
      contextLost: q('context-lost'),
      devPanel: q('dev-panel'),
      verify: /** @type {HTMLButtonElement} */ (q('verify-button')),
      verifyOutput: q('verify-output'),
    };
    this.#stage = q('stage');
    this.#anchors = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-anchor]')]);

    this.#listen(this.#el.spin, 'click', () => this.emit('spin'));
    this.#listen(this.#el.mute, 'click', () => this.emit('mute'));
    this.#listen(this.#el.newGame, 'click', () => this.emit('newGame'));
    this.#listen(this.#el.verify, 'click', () => this.emit('verify'));
  }

  /** Animated value shown on the WebGL credit display. */
  get displayedBalance() {
    return Math.round(this.#displayedBalance);
  }

  get displayedWin() {
    return Math.round(this.#displayedWin);
  }

  /**
   * @param {import('../core/GameState.js').GameState['snapshot'] extends () => infer R ? R : never} snapshot
   * @param {boolean} [immediate] snap the animated numbers
   */
  update(snapshot, immediate = false) {
    this.#targetBalance = snapshot.balance;
    this.#targetWin = snapshot.lastWin;
    if (immediate) {
      this.#displayedBalance = snapshot.balance;
      this.#displayedWin = snapshot.lastWin;
    }
    this.#el.bet.textContent = String(snapshot.bet);
    this.#render();
  }

  /**
   * Advance the animated counters.
   * @param {number} dt
   * @returns {number} whole coins added to the displayed balance this frame
   */
  tick(dt) {
    const before = Math.round(this.#displayedBalance);
    this.#displayedBalance = approach(this.#displayedBalance, this.#targetBalance, dt);
    this.#displayedWin = approach(this.#displayedWin, this.#targetWin, dt);
    this.#render();
    return Math.max(0, Math.round(this.#displayedBalance) - before);
  }

  /** @param {boolean} enabled */
  setSpinEnabled(enabled) {
    this.#el.spin.disabled = !enabled;
  }

  /** @param {string} text */
  announce(text) {
    this.#el.status.textContent = text;
  }

  /**
   * @param {import('../math/SlotMath.js').SpinResult} result
   */
  showResult(result) {
    const names = result.stops.map((s) => s.join('+')).join(' · ');
    if (result.rule) {
      const prefix = result.isJackpot ? 'ДЖЕКПОТ! ' : 'Выигрыш: ';
      this.announce(`${prefix}${result.rule.name} — +${result.payout} монет (${names})`);
      this.#el.lastWin.classList.add('is-win');
    } else {
      this.announce(`Без выигрыша (${names})`);
      this.#el.lastWin.classList.remove('is-win');
    }
  }

  /** @param {boolean} visible */
  showGameOver(visible) {
    this.#el.gameOver.hidden = !visible;
    if (visible) this.#el.newGame.focus({ preventScroll: true });
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    this.#el.mute.setAttribute('aria-pressed', String(muted));
    this.#el.mute.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    this.#el.mute.textContent = muted ? '🔇' : '🔊';
  }

  /** @param {boolean} visible */
  showContextLost(visible) {
    this.#el.contextLost.hidden = !visible;
  }

  /** @param {boolean} visible */
  showDevPanel(visible) {
    this.#el.devPanel.hidden = !visible;
  }

  /**
   * @param {import('../math/SlotMath.js').MathReport|Error} reportOrError
   */
  showVerifyReport(reportOrError) {
    if (reportOrError instanceof Error) {
      this.#el.verifyOutput.textContent = `❌ ${reportOrError.message}`;
      this.#el.verifyOutput.classList.add('is-error');
      return;
    }
    const r = reportOrError;
    const lines = [
      `✅ verifyMath(): ${r.outcomes} исходов перебрано`,
      `выигрышных: ${r.winningOutcomes} (${(r.hitRate * 100).toFixed(4)}%)`,
      `сумма выплат: ${r.totalPayout}  RTP: ${(r.rtp * 100).toFixed(2)}%`,
      `EV за спин: ${r.expectedNetPerSpin.toFixed(4)} монеты`,
      '',
      ...r.rows.map((row) => `${row.name.padEnd(24)} ×${String(row.payout).padStart(3)}  ${String(row.hits).padStart(3)}/8000  ${(row.probability * 100).toFixed(4)}%`),
    ];
    this.#el.verifyOutput.textContent = lines.join('\n');
    this.#el.verifyOutput.classList.remove('is-error');
  }

  /**
   * Fill the paytable from the enumerated model (single source of truth).
   * @param {import('../math/SlotMath.js').MathReport} report
   */
  renderPaytable(report) {
    const rows = report.rows
      .map(
        (row) => `<tr><td>${escapeHtml(row.name)}</td><td class="num">${row.payout}</td><td class="num">${(row.probability * 100).toFixed(3)}%</td></tr>`,
      )
      .join('');
    this.#el.paytableBody.innerHTML = rows;
    this.#el.paytableSummary.textContent = `Таблица выплат · шанс выигрыша ${(report.hitRate * 100).toFixed(2)}% · RTP ${(report.rtp * 100).toFixed(2)}%`;
  }

  /**
   * Position DOM labels that follow world-space anchor points.
   * @param {import('../gl/Camera.js').Camera} camera
   */
  layoutAnchors(camera) {
    const scale = 1 / camera.worldPerPixel; // px per world unit
    this.#stage.style.setProperty('--world-px', `${scale}px`);
    for (const el of this.#anchors) {
      const [x, y] = (el.dataset.anchor ?? '0,0').split(',').map(Number);
      const p = camera.project(x, y, 0);
      el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
    }
  }

  dispose() {
    for (const off of this.#handlers) off();
    this.#handlers = [];
    this.removeAllListeners();
  }

  #render() {
    this.#el.balance.textContent = String(Math.round(this.#displayedBalance));
    this.#el.lastWin.textContent = String(Math.round(this.#displayedWin));
  }

  #listen(target, type, handler) {
    target.addEventListener(type, handler);
    this.#handlers.push(() => target.removeEventListener(type, handler));
  }
}

function approach(current, target, dt) {
  const diff = target - current;
  if (Math.abs(diff) < 0.02) return target;
  // exponential approach with a minimum speed so small changes still move
  const step = diff * Math.min(1, COUNT_SPEED * dt) + Math.sign(diff) * Math.min(Math.abs(diff), 2 * dt);
  return Math.abs(step) >= Math.abs(diff) ? target : current + step;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
