/**
 * Last-resort messages for situations where WebGL itself cannot draw
 * (no WebGL2 support, lost context). The element is created on demand and
 * removed afterwards, so the page markup stays canvas-only.
 */
export class FatalMessage {
  /** @type {HTMLElement|null} */
  #element = null;

  /**
   * @param {string} title
   * @param {string} body
   */
  show(title, body) {
    if (!this.#element) {
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.style.cssText = [
        'position:fixed', 'inset:0', 'display:grid', 'place-items:center', 'padding:16px',
        'background:rgba(8,5,4,0.82)', 'color:#f3e9d8', 'font:16px/1.4 system-ui,sans-serif',
        'text-align:center', 'z-index:10',
      ].join(';');
      document.body.appendChild(el);
      this.#element = el;
    }
    this.#element.replaceChildren();
    const h = document.createElement('strong');
    h.style.cssText = 'display:block;font-size:22px;color:#ffd97a;margin-bottom:8px';
    h.textContent = title;
    const p = document.createElement('span');
    p.textContent = body;
    const card = document.createElement('div');
    card.style.cssText = 'max-width:420px;padding:22px;border-radius:14px;background:#1d1411;border:1px solid #6a4b2b';
    card.append(h, p);
    this.#element.append(card);
  }

  hide() {
    this.#element?.remove();
    this.#element = null;
  }
}
