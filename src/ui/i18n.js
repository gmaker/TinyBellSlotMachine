import { EventEmitter } from '../core/EventEmitter.js';

const STORAGE_KEY = 'tinybell.lang';
export const DEFAULT_LANGUAGE = 'en';

/** Language bundles. Keys are stable ids; `{param}` placeholders are substituted. */
export const BUNDLES = Object.freeze({
  en: Object.freeze({
    name: 'ENGLISH',
    welcome: 'PULL THE LEVER OR PRESS SPIN',
    spinning: 'REELS ARE SPINNING…',
    noWin: 'NO WIN · {names}',
    win: 'WIN: {name} +{payout}',
    jackpot: 'JACKPOT! {name} +{payout}',
    outOfCoins: 'OUT OF COINS',
    newGame: 'NEW GAME: 100 COINS',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF',
    musicOn: 'MUSIC ON',
    musicOff: 'MUSIC OFF',
    sfxOn: 'SOUND EFFECTS ON',
    sfxOff: 'SOUND EFFECTS OFF',
    credits: 'CREDITS',
    winLabel: 'WIN',
    bet: 'BET',
    balanceLine: 'BALANCE {balance}',
    insufficient: 'NOT ENOUGH COINS FOR A {bet} COIN BET',
    btnPaytable: 'PAYTABLE',
    btnSpin: 'SPIN',
    btnSettings: 'SETTINGS',
    btnClose: 'CLOSE',
    btnNewGame: 'NEW GAME',
    paytableTitle: 'PAYTABLE',
    paytableSub: 'HIT CHANCE {hit}% · RTP {rtp}%',
    colCombo: 'COMBINATION',
    colPayout: 'PAYOUT',
    colHits: 'OUTCOMES',
    colChance: 'CHANCE',
    paytableNote: 'A DOUBLE STOP (7+ORANGE) IS ONE STOP THAT COUNTS FOR BOTH SYMBOLS',
    gameOverTitle: 'OUT OF COINS',
    gameOverLine1: 'THIS GAME USES VIRTUAL COINS ONLY',
    gameOverLine2: 'NEW GAME — BACK TO 100 COINS',
    settingsTitle: 'SETTINGS',
    settingsMusic: 'MUSIC',
    settingsSound: 'EFFECTS',
    settingsLanguage: 'LANGUAGE',
    on: 'ON',
    off: 'OFF',
    any: 'ANY',
  }),
  ru: Object.freeze({
    name: 'РУССКИЙ',
    welcome: 'ПОТЯНИТЕ РУЧКУ ИЛИ НАЖМИТЕ SPIN',
    spinning: 'БАРАБАНЫ КРУТЯТСЯ…',
    noWin: 'БЕЗ ВЫИГРЫША · {names}',
    win: 'ВЫИГРЫШ: {name} +{payout}',
    jackpot: 'ДЖЕКПОТ! {name} +{payout}',
    outOfCoins: 'МОНЕТЫ ЗАКОНЧИЛИСЬ',
    newGame: 'НОВАЯ ИГРА: 100 МОНЕТ',
    soundOn: 'ЗВУК ВКЛЮЧЁН',
    soundOff: 'ЗВУК ВЫКЛЮЧЕН',
    musicOn: 'МУЗЫКА ВКЛЮЧЕНА',
    musicOff: 'МУЗЫКА ВЫКЛЮЧЕНА',
    sfxOn: 'ЗВУКИ ВКЛЮЧЕНЫ',
    sfxOff: 'ЗВУКИ ВЫКЛЮЧЕНЫ',
    credits: 'МОНЕТЫ',
    winLabel: 'ВЫИГРЫШ',
    bet: 'СТАВКА',
    balanceLine: 'БАЛАНС {balance}',
    insufficient: 'НЕ ХВАТАЕТ МОНЕТ НА СТАВКУ {bet}',
    btnPaytable: 'ТАБЛИЦА',
    btnSpin: 'SPIN',
    btnSettings: 'НАСТРОЙКИ',
    btnClose: 'ЗАКРЫТЬ',
    btnNewGame: 'НОВАЯ ИГРА',
    paytableTitle: 'ТАБЛИЦА ВЫПЛАТ',
    paytableSub: 'ШАНС ВЫИГРЫША {hit}% · RTP {rtp}%',
    colCombo: 'КОМБИНАЦИЯ',
    colPayout: 'ВЫПЛАТА',
    colHits: 'ИСХОДОВ',
    colChance: 'ШАНС',
    paytableNote: 'ДВОЙНОЙ СТОП (7+ORANGE) — ОДИН СТОП, СЧИТАЕТСЯ ЗА ОБА СИМВОЛА',
    gameOverTitle: 'МОНЕТЫ ЗАКОНЧИЛИСЬ',
    gameOverLine1: 'ИГРА НА ВИРТУАЛЬНЫЕ МОНЕТЫ',
    gameOverLine2: 'НОВАЯ ИГРА — СНОВА 100 МОНЕТ',
    settingsTitle: 'НАСТРОЙКИ',
    settingsMusic: 'МУЗЫКА',
    settingsSound: 'ЗВУКИ',
    settingsLanguage: 'ЯЗЫК',
    on: 'ВКЛ',
    off: 'ВЫКЛ',
    any: 'ANY',
  }),
});

/** @type {readonly string[]} */
export const LANGUAGES = Object.freeze(Object.keys(BUNDLES));

/**
 * Tiny i18n service: current language bundle + `{param}` interpolation.
 * Emits `change` with the new language code. The choice is persisted.
 */
export class I18n extends EventEmitter {
  #language = DEFAULT_LANGUAGE;
  #storage;

  /**
   * @param {Storage|null} [storage]
   * @param {string} [initial] overrides the stored language
   */
  constructor(storage = safeStorage(), initial) {
    super();
    this.#storage = storage;
    const stored = initial ?? storage?.getItem(STORAGE_KEY) ?? DEFAULT_LANGUAGE;
    this.#language = LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
  }

  get language() {
    return this.#language;
  }

  get languages() {
    return LANGUAGES;
  }

  /** @param {string} code */
  setLanguage(code) {
    if (!LANGUAGES.includes(code) || code === this.#language) return;
    this.#language = code;
    this.#storage?.setItem(STORAGE_KEY, code);
    this.emit('change', code);
  }

  /**
   * @param {string} key
   * @param {Record<string, string|number>} [params]
   * @param {string} [language]
   */
  t(key, params = {}, language = this.#language) {
    const template = BUNDLES[language]?.[key] ?? BUNDLES[DEFAULT_LANGUAGE][key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
  }
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
