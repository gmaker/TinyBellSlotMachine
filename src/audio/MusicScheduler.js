/**
 * Endless procedural saloon/mechanical loop: look-ahead note scheduler over a
 * 64-step (4 bar) pattern. Everything is synthesized from oscillators and a
 * shared noise buffer — no audio files.
 */
const BPM = 100;
const STEPS_PER_BEAT = 4;
const STEP_DURATION = 60 / BPM / STEPS_PER_BEAT;
const PATTERN_STEPS = 64;
const LOOKAHEAD_S = 0.16;
const TICK_MS = 30;

/** Note name → frequency (A4 = 440). */
export function noteHz(semitonesFromA4) {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

// Semitone offsets from A4: C4 = -9.
const C4 = -9;
const BASS_ROOTS = [C4 - 12, C4 - 12 + 5, C4 - 12 + 7, C4 - 12]; // C F G C (one bar each)
const CHORDS = [
  [C4, C4 + 4, C4 + 7],
  [C4 + 5, C4 + 9, C4 + 12],
  [C4 + 7, C4 + 11, C4 + 14],
  [C4, C4 + 4, C4 + 7],
];
// 4-bar pentatonic melody, 16th grid; null = rest. Repeated with variation.
const MELODY = [
  12, null, 14, null, 16, null, 19, null, 16, null, 14, null, 12, null, null, null,
  9, null, 12, null, 14, null, 12, null, 9, null, 7, null, null, null, 7, null,
  7, null, 11, null, 14, null, 16, null, 14, null, 11, null, 7, null, 9, null,
  12, null, null, 12, 14, null, 12, null, 9, null, 7, null, 4, null, null, null,
].map((v) => (v === null ? null : C4 + v));

export class MusicScheduler {
  /** @type {AudioContext} */
  #ctx;
  /** @type {AudioNode} */
  #out;
  /** @type {AudioBuffer} */
  #noise;
  #step = 0;
  #nextTime = 0;
  /** @type {ReturnType<typeof setInterval>|null} */
  #timer = null;

  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {AudioBuffer} noiseBuffer
   */
  constructor(ctx, destination, noiseBuffer) {
    this.#ctx = ctx;
    this.#out = destination;
    this.#noise = noiseBuffer;
  }

  get running() {
    return this.#timer !== null;
  }

  start() {
    if (this.#timer) return;
    this.#nextTime = this.#ctx.currentTime + 0.08;
    this.#timer = setInterval(() => this.#tick(), TICK_MS);
  }

  stop() {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  #tick() {
    const horizon = this.#ctx.currentTime + LOOKAHEAD_S;
    while (this.#nextTime < horizon) {
      this.#scheduleStep(this.#step, this.#nextTime);
      this.#step = (this.#step + 1) % PATTERN_STEPS;
      this.#nextTime += STEP_DURATION;
    }
  }

  /**
   * @param {number} step
   * @param {number} t
   */
  #scheduleStep(step, t) {
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const beat = Math.floor(inBar / 4);
    const sub = inBar % 4;

    // Bass "boom" on beats 1 & 3 (root / fifth)
    if (sub === 0 && (beat === 0 || beat === 2)) {
      const root = BASS_ROOTS[bar] + (beat === 2 ? 7 : 0);
      this.#tone({ t, hz: noteHz(root), type: 'triangle', gain: 0.32, attack: 0.005, decay: 0.32, filter: 520 });
    }
    // Chord "chick" on beats 2 & 4 — honky-tonk style with slight detune
    if (sub === 0 && (beat === 1 || beat === 3)) {
      for (const n of CHORDS[bar]) {
        this.#tone({ t, hz: noteHz(n) * 1.002, type: 'square', gain: 0.045, attack: 0.002, decay: 0.16, filter: 1500 });
        this.#tone({ t: t + 0.004, hz: noteHz(n) * 0.997, type: 'square', gain: 0.03, attack: 0.002, decay: 0.14, filter: 1300 });
      }
    }
    // Melody
    const note = MELODY[step];
    if (note !== null) {
      const hz = noteHz(note + 12);
      this.#tone({ t, hz, type: 'triangle', gain: 0.11, attack: 0.008, decay: 0.28, filter: 3200 });
      this.#tone({ t, hz: hz * 1.004, type: 'sine', gain: 0.05, attack: 0.008, decay: 0.26, filter: 3200 });
    }
    // Mechanical percussion: soft hi-hat ticks on 8ths, wood block on 2 & 4
    if (sub === 0 || sub === 2) {
      this.#noiseHit({ t, gain: sub === 0 ? 0.05 : 0.035, hp: 6000, decay: 0.035 });
    }
    if (sub === 0 && (beat === 1 || beat === 3)) {
      this.#tone({ t, hz: 820, type: 'sine', gain: 0.06, attack: 0.001, decay: 0.05, filter: 3000 });
    }
  }

  /**
   * @param {{t:number,hz:number,type:OscillatorType,gain:number,attack:number,decay:number,filter:number}} p
   */
  #tone({ t, hz, type, gain, attack, decay, filter }) {
    const ctx = this.#ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(filter, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(lp).connect(g).connect(this.#out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.02);
  }

  /**
   * @param {{t:number,gain:number,hp:number,decay:number}} p
   */
  #noiseHit({ t, gain, hp, decay }) {
    const ctx = this.#ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(hp, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.#out);
    src.start(t, Math.random() * (this.#noise.duration - 0.1));
    src.stop(t + decay + 0.01);
  }
}
