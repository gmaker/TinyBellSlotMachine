import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLES, DEFAULT_LANGUAGE, I18n, LANGUAGES } from '../src/ui/i18n.js';
import { StrokeFont } from '../src/view/text/StrokeFont.js';

class MemoryStorage {
  #map = new Map();
  getItem(k) {
    return this.#map.has(k) ? this.#map.get(k) : null;
  }
  setItem(k, v) {
    this.#map.set(k, String(v));
  }
}

test('default language is English', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en');
  const i18n = new I18n(new MemoryStorage());
  assert.equal(i18n.language, 'en');
  assert.equal(i18n.t('btnPaytable'), 'PAYTABLE');
});

test('language switch is persisted and emits change', () => {
  const storage = new MemoryStorage();
  const i18n = new I18n(storage);
  const changes = [];
  i18n.on('change', (code) => changes.push(code));
  i18n.setLanguage('ru');
  assert.equal(i18n.t('btnPaytable'), 'ТАБЛИЦА');
  assert.deepEqual(changes, ['ru']);
  assert.equal(new I18n(storage).language, 'ru', 'restored from storage');
  i18n.setLanguage('xx');
  assert.equal(i18n.language, 'ru', 'unknown languages are ignored');
});

test('placeholders are interpolated and every bundle has every key', () => {
  const i18n = new I18n(new MemoryStorage());
  assert.equal(i18n.t('betLine', { bet: 1, balance: 100 }), 'BET 1 · BALANCE 100');
  assert.equal(i18n.t('win', { name: 'BELL, BELL, BAR', payout: 18 }, 'ru'), 'ВЫИГРЫШ: BELL, BELL, BAR +18');
  const keys = Object.keys(BUNDLES.en).sort();
  for (const lang of LANGUAGES) {
    assert.deepEqual(Object.keys(BUNDLES[lang]).sort(), keys, `bundle ${lang} has the same keys`);
  }
});

test('every character used in the bundles has a glyph in the stroke font', () => {
  const fallback = JSON.stringify(StrokeFont.glyph(''));
  const missing = new Set();
  for (const lang of LANGUAGES) {
    for (const value of Object.values(BUNDLES[lang])) {
      for (const ch of value.replace(/\{\w+\}/g, '')) {
        if (ch === ' ') continue;
        if (JSON.stringify(StrokeFont.glyph(ch)) === fallback) missing.add(ch);
      }
    }
  }
  assert.deepEqual([...missing], [], `missing glyphs: ${[...missing].join(' ')}`);
});
