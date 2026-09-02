import { MusicScheduler } from './MusicScheduler.js';

const LEGACY_STORAGE_KEY = 'tinybell.muted';
const MUSIC_STORAGE_KEY = 'tinybell.music.muted';
const SFX_STORAGE_KEY = 'tinybell.sfx.muted';
const MASTER_GAIN = 0.85;
const MUSIC_GAIN = 0.5;
const SFX_GAIN = 0.9;
const TICK_MIN_INTERVAL = 0.028;
const COIN_MIN_INTERVAL = 0.045;

const A4 = 440;
const hz = (semis) => A4 * Math.pow(2, semis / 12);
const C5 = 3;

/**
 * Web Audio graph: sfx bus + music bus → master gain → limiter → destination.
 * The AudioContext is created lazily on the first user gesture (`unlock`).
 * Every sound is synthesized; nothing is loaded from disk.
 * Music and sound effects can be muted independently; both choices persist.
 */
export class AudioEngine {
  /** @type {AudioContext|null} */
  #ctx = null;
  /** @type {GainNode|null} */
  #master = null;
  /** @type {GainNode|null} */
  #music = null;
  /** @type {GainNode|null} */
  #sfx = null;
  /** @type {AudioBuffer|null} */
  #noise = null;
  /** @type {MusicScheduler|null} */
  #scheduler = null;
  #musicMuted = false;
  #sfxMuted = false;
  #suspended = false;
  #unlocked = false;
  #lastTick = new Map();
  #lastCoin = 0;
  #storage;

  /** @param {Storage|null} [storage] */
  constructor(storage = safeStorage()) {
    this.#storage = storage;
    const legacyMuted = this.#storage?.getItem(LEGACY_STORAGE_KEY) === '1';
    this.#musicMuted = (this.#storage?.getItem(MUSIC_STORAGE_KEY) ?? (legacyMuted ? '1' : '0')) === '1';
    this.#sfxMuted = (this.#storage?.getItem(SFX_STORAGE_KEY) ?? (legacyMuted ? '1' : '0')) === '1';
  }

  /** True when both music and effects are muted. */
  get muted() {
    return this.#musicMuted && this.#sfxMuted;
  }

  get musicMuted() {
    return this.#musicMuted;
  }

  get sfxMuted() {
    return this.#sfxMuted;
  }

  get isUnlocked() {
    return this.#unlocked;
  }

  /**
   * Create / resume the context. Must be called from a user gesture.
   */
  async unlock() {
    if (!this.#ctx) this.#build();
    const ctx = /** @type {AudioContext} */ (this.#ctx);
    if (ctx.state === 'suspended' && !this.#suspended) {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    this.#unlocked = true;
    if (!this.#musicMuted) this.#scheduler?.start();
  }

  /** @param {boolean} muted */
  setMusicMuted(muted) {
    this.#musicMuted = muted;
    this.#storage?.setItem(MUSIC_STORAGE_KEY, muted ? '1' : '0');
    this.#rampBus(this.#music, muted ? 0 : MUSIC_GAIN);
    if (muted) this.#scheduler?.stop();
    else if (this.#unlocked && !this.#suspended) this.#scheduler?.start();
  }

  /** @param {boolean} muted */
  setSfxMuted(muted) {
    this.#sfxMuted = muted;
    this.#storage?.setItem(SFX_STORAGE_KEY, muted ? '1' : '0');
    this.#rampBus(this.#sfx, muted ? 0 : SFX_GAIN);
  }

  toggleMusic() {
    this.setMusicMuted(!this.#musicMuted);
    return this.#musicMuted;
  }

  toggleSfx() {
    this.setSfxMuted(!this.#sfxMuted);
    return this.#sfxMuted;
  }

  /**
   * Mute everything, or unmute everything when both buses are silent.
   * @returns {boolean} new "all muted" state
   */
  toggleMute() {
    const mute = !this.muted;
    this.setMusicMuted(mute);
    this.setSfxMuted(mute);
    return this.muted;
  }

  /**
   * @param {GainNode|null} bus
   * @param {number} target
   */
  #rampBus(bus, target) {
    if (!bus || !this.#ctx) return;
    const t = this.#ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(target, t, 0.03);
  }

  /**
   * Pause the music scheduler + context when the tab is hidden.
   * @param {boolean} suspended
   */
  setSuspended(suspended) {
    this.#suspended = suspended;
    if (!this.#ctx || !this.#unlocked) return;
    if (suspended) {
      this.#scheduler?.stop();
      this.#ctx.suspend().catch(() => {});
    } else {
      this.#ctx
        .resume()
        .then(() => {
          if (!this.#musicMuted) this.#scheduler?.start();
        })
        .catch(() => {});
    }
  }

  /* ----------------------------- SFX --------------------------------- */

  /** Lever grabbed: creak from filtered noise with a pitch envelope. */
  playLeverGrab() {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.#noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(1300, t);
    bp.frequency.exponentialRampToValueAtTime(380, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(bp).connect(g).connect(this.#sfx);
    src.start(t);
    src.stop(t + 0.3);
  }

  /** Lever engaged the mechanism: a ratchet click. */
  playLeverClick() {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#blip({ t, hzStart: 1400, hzEnd: 700, type: 'square', gain: 0.18, decay: 0.05 });
    this.#burst({ t, gain: 0.25, hp: 1800, lp: 6000, decay: 0.04 });
    this.#blip({ t: t + 0.06, hzStart: 240, hzEnd: 180, type: 'triangle', gain: 0.25, decay: 0.12 });
  }

  /**
   * Mechanical tick as a stop passes the pay line; rate-limited per reel.
   * @param {number} reelIndex
   */
  playTick(reelIndex) {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const last = this.#lastTick.get(reelIndex) ?? -1;
    if (t - last < TICK_MIN_INTERVAL) return;
    this.#lastTick.set(reelIndex, t);
    this.#burst({ t, gain: 0.09, hp: 2500, lp: 9000, decay: 0.018 });
    this.#blip({ t, hzStart: 2100 + reelIndex * 160 + Math.random() * 120, hzEnd: 1500, type: 'triangle', gain: 0.045, decay: 0.03 });
  }

  /**
   * Metallic clunk when a reel locks into place.
   * @param {number} reelIndex
   */
  playReelStop(reelIndex) {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = 150 * Math.pow(1.07, reelIndex);
    this.#blip({ t, hzStart: base * 1.5, hzEnd: base, type: 'sine', gain: 0.55, decay: 0.24 });
    this.#blip({ t, hzStart: 2300 * Math.pow(1.05, reelIndex), hzEnd: 1900, type: 'triangle', gain: 0.12, decay: 0.14 });
    this.#burst({ t, gain: 0.32, hp: 200, lp: 1100, decay: 0.07 });
  }

  /**
   * Short ascending arpeggio, longer for bigger wins.
   * @param {number} payout
   */
  playWin(payout) {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const scale = [C5, C5 + 4, C5 + 7, C5 + 12, C5 + 16, C5 + 19, C5 + 24];
    const notes = Math.min(scale.length, 3 + Math.floor(payout / 6));
    for (let i = 0; i < notes; i++) {
      const at = t + i * 0.085;
      this.#blip({ t: at, hzStart: hz(scale[i]), hzEnd: hz(scale[i]), type: 'triangle', gain: 0.22, decay: 0.34 });
      this.#blip({ t: at, hzStart: hz(scale[i]) * 2.003, hzEnd: hz(scale[i]) * 2, type: 'sine', gain: 0.07, decay: 0.3 });
    }
  }

  /** Richer fanfare for 7-7-7 (~1.8 s). */
  playJackpot() {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const chords = [
      [C5, C5 + 4, C5 + 7],
      [C5 + 5, C5 + 9, C5 + 12],
      [C5 + 7, C5 + 11, C5 + 14],
      [C5 + 12, C5 + 16, C5 + 19, C5 + 24],
    ];
    const durations = [0.2, 0.2, 0.2, 1.0];
    let at = t;
    chords.forEach((chord, i) => {
      for (const n of chord) {
        this.#blip({ t: at, hzStart: hz(n), hzEnd: hz(n), type: 'square', gain: 0.08, decay: durations[i] + 0.1, filter: 2600 });
        this.#blip({ t: at, hzStart: hz(n) * 1.004, hzEnd: hz(n), type: 'triangle', gain: 0.14, decay: durations[i] + 0.15 });
      }
      at += durations[i];
    });
    // shimmering noise tail
    this.#burst({ t: t + 0.6, gain: 0.08, hp: 5000, lp: 12000, decay: 1.1 });
    // bell strikes
    for (let i = 0; i < 6; i++) {
      this.#blip({ t: t + 0.65 + i * 0.12, hzStart: hz(C5 + 24 + (i % 2) * 7), hzEnd: hz(C5 + 24), type: 'sine', gain: 0.12, decay: 0.4 });
    }
  }

  /** Coin ping used while the balance counts up. */
  playCoin() {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.#lastCoin < COIN_MIN_INTERVAL) return;
    this.#lastCoin = t;
    const f = 2400 + Math.random() * 900;
    this.#blip({ t, hzStart: f, hzEnd: f * 0.97, type: 'sine', gain: 0.13, decay: 0.09 });
    this.#blip({ t, hzStart: f * 2.7, hzEnd: f * 2.6, type: 'sine', gain: 0.04, decay: 0.05 });
  }

  playGameOver() {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#blip({ t, hzStart: hz(C5), hzEnd: hz(C5), type: 'triangle', gain: 0.2, decay: 0.4 });
    this.#blip({ t: t + 0.3, hzStart: hz(C5 - 5), hzEnd: hz(C5 - 5), type: 'triangle', gain: 0.2, decay: 0.6 });
  }

  playNewGame() {
    const ctx = this.#ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.#blip({ t, hzStart: hz(C5), hzEnd: hz(C5), type: 'triangle', gain: 0.18, decay: 0.2 });
    this.#blip({ t: t + 0.12, hzStart: hz(C5 + 7), hzEnd: hz(C5 + 7), type: 'triangle', gain: 0.18, decay: 0.35 });
  }

  dispose() {
    this.#scheduler?.stop();
    this.#ctx?.close().catch(() => {});
    this.#ctx = null;
    this.#scheduler = null;
  }

  /* --------------------------- internals ------------------------------ */

  #build() {
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.#ctx = ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);

    this.#master = ctx.createGain();
    this.#master.gain.value = MASTER_GAIN;
    this.#master.connect(limiter);

    this.#music = ctx.createGain();
    this.#music.gain.value = this.#musicMuted ? 0 : MUSIC_GAIN;
    this.#music.connect(this.#master);

    this.#sfx = ctx.createGain();
    this.#sfx.gain.value = this.#sfxMuted ? 0 : SFX_GAIN;
    this.#sfx.connect(this.#master);

    const seconds = 2;
    const noise = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.#noise = noise;

    this.#scheduler = new MusicScheduler(ctx, this.#music, noise);
  }

  /** @returns {AudioContext|null} context if an effect can be played right now */
  #ready() {
    if (this.#sfxMuted) return null;
    if (!this.#ctx || !this.#unlocked || this.#suspended || this.#ctx.state !== 'running') return null;
    return this.#ctx;
  }

  #noiseSource() {
    const ctx = /** @type {AudioContext} */ (this.#ctx);
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = this.#noise.duration;
    return src;
  }

  /**
   * Oscillator with pitch + gain envelope.
   * @param {{t:number,hzStart:number,hzEnd:number,type:OscillatorType,gain:number,decay:number,filter?:number}} p
   */
  #blip({ t, hzStart, hzEnd, type, gain, decay, filter }) {
    const ctx = /** @type {AudioContext} */ (this.#ctx);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hzStart, t);
    if (hzEnd !== hzStart) osc.frequency.exponentialRampToValueAtTime(Math.max(20, hzEnd), t + decay * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    let node = osc;
    if (filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filter;
      osc.connect(lp);
      node = /** @type {any} */ (lp);
    }
    node.connect(g).connect(/** @type {GainNode} */ (this.#sfx));
    osc.start(t);
    osc.stop(t + decay + 0.03);
  }

  /**
   * Band-limited noise burst.
   * @param {{t:number,gain:number,hp:number,lp:number,decay:number}} p
   */
  #burst({ t, gain, hp, lp, decay }) {
    const ctx = /** @type {AudioContext} */ (this.#ctx);
    const src = this.#noiseSource();
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = hp;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(high).connect(low).connect(g).connect(/** @type {GainNode} */ (this.#sfx));
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.02);
  }
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
