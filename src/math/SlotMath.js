/**
 * SlotMath — the single source of truth for the 21 Bell mathematical model.
 *
 * Model source: Wizard of Odds, "The 21 Bell slot machine"
 * (https://wizardofodds.com/games/slots/appendix/5/).
 *
 * Three physical reel strips with exactly 20 equally likely stops each.
 * Some physical stops carry two symbols (e.g. `7 + Orange`): that is ONE stop
 * that simultaneously counts as a match for both symbols. It must never be
 * split into two separate stops — doing so would change the probabilities.
 *
 * Nothing in this module depends on rendering, DOM or audio.
 */

/** @typedef {'7'|'Bar'|'Melon'|'Bell'|'Plum'|'Orange'|'Cherry'|'Lemon'} SymbolName */
/** @typedef {readonly SymbolName[]} Stop A physical stop: one or two symbols. */

export const SYMBOL = Object.freeze({
  SEVEN: '7',
  BAR: 'Bar',
  MELON: 'Melon',
  BELL: 'Bell',
  PLUM: 'Plum',
  ORANGE: 'Orange',
  CHERRY: 'Cherry',
  LEMON: 'Lemon',
});

/** @type {readonly SymbolName[]} */
export const SYMBOL_LIST = Object.freeze(Object.values(SYMBOL));

/** Wildcard used in paytable patterns: any physical stop matches. */
export const ANY = 'Any';

export const REEL_COUNT = 3;
export const STOPS_PER_REEL = 20;
export const TOTAL_OUTCOMES = STOPS_PER_REEL ** REEL_COUNT; // 8000

const S = SYMBOL;
/** @returns {Stop} */
const stop = (...symbols) => Object.freeze(symbols);

/**
 * Original stop order of the three physical strips (index 0 = stop #1).
 * The order matters: it drives both probabilities and the visually continuous
 * tape rendering (neighbours above/below, cyclic wrap 20 -> 1).
 * @type {readonly (readonly Stop[])[]}
 */
export const REEL_STRIPS = Object.freeze([
  Object.freeze([
    stop(S.ORANGE), // 1
    stop(S.MELON), // 2
    stop(S.PLUM), // 3
    stop(S.CHERRY), // 4
    stop(S.PLUM), // 5
    stop(S.ORANGE), // 6
    stop(S.SEVEN), // 7
    stop(S.BELL, S.BAR), // 8
    stop(S.ORANGE), // 9
    stop(S.CHERRY), // 10
    stop(S.BAR), // 11
    stop(S.PLUM), // 12
    stop(S.ORANGE), // 13
    stop(S.PLUM), // 14
    stop(S.MELON), // 15
    stop(S.PLUM), // 16
    stop(S.ORANGE), // 17
    stop(S.PLUM), // 18
    stop(S.BAR), // 19
    stop(S.PLUM), // 20
  ]),
  Object.freeze([
    stop(S.CHERRY), // 1
    stop(S.PLUM), // 2
    stop(S.CHERRY), // 3
    stop(S.SEVEN, S.ORANGE), // 4
    stop(S.CHERRY), // 5
    stop(S.BELL), // 6
    stop(S.PLUM, S.BAR), // 7
    stop(S.BELL), // 8
    stop(S.CHERRY), // 9
    stop(S.ORANGE), // 10
    stop(S.BELL), // 11
    stop(S.MELON, S.ORANGE), // 12
    stop(S.PLUM), // 13
    stop(S.BELL), // 14
    stop(S.CHERRY), // 15
    stop(S.BAR), // 16
    stop(S.ORANGE), // 17
    stop(S.CHERRY), // 18
    stop(S.BELL), // 19
    stop(S.MELON, S.ORANGE), // 20
  ]),
  Object.freeze([
    stop(S.BELL), // 1
    stop(S.ORANGE), // 2
    stop(S.PLUM), // 3
    stop(S.BELL), // 4
    stop(S.ORANGE), // 5
    stop(S.LEMON), // 6
    stop(S.BELL), // 7
    stop(S.MELON, S.ORANGE), // 8
    stop(S.BELL), // 9
    stop(S.PLUM), // 10
    stop(S.LEMON), // 11
    stop(S.BELL), // 12
    stop(S.PLUM), // 13
    stop(S.BELL), // 14
    stop(S.SEVEN, S.BAR), // 15
    stop(S.LEMON), // 16
    stop(S.BELL), // 17
    stop(S.MELON, S.ORANGE), // 18
    stop(S.BELL), // 19
    stop(S.LEMON), // 20
  ]),
]);

/**
 * @typedef {object} PayRule
 * @property {string} id
 * @property {string} name Human readable combination, e.g. "Bell, Bell, Bar".
 * @property {number} payout Coins paid for a bet of 1.
 * @property {readonly (SymbolName|'Any')[]} pattern One requirement per reel.
 */

/** @returns {PayRule} */
const rule = (id, name, payout, pattern) =>
  Object.freeze({ id, name, payout, pattern: Object.freeze(pattern) });

/**
 * Paytable in priority order (top to bottom). Only the first matching rule pays.
 * `X, X, Bar` fires when the third stop *contains* Bar — so the combined
 * `7 + Bar` stop also satisfies it.
 * @type {readonly PayRule[]}
 */
export const PAYTABLE = Object.freeze([
  rule('seven-x3', '7, 7, 7', 200, [S.SEVEN, S.SEVEN, S.SEVEN]),
  rule('bar-x3', 'Bar, Bar, Bar', 100, [S.BAR, S.BAR, S.BAR]),
  rule('melon-x3', 'Melon, Melon, Melon', 100, [S.MELON, S.MELON, S.MELON]),
  rule('melon-melon-bar', 'Melon, Melon, Bar', 100, [S.MELON, S.MELON, S.BAR]),
  rule('bell-x3', 'Bell, Bell, Bell', 18, [S.BELL, S.BELL, S.BELL]),
  rule('bell-bell-bar', 'Bell, Bell, Bar', 18, [S.BELL, S.BELL, S.BAR]),
  rule('plum-x3', 'Plum, Plum, Plum', 14, [S.PLUM, S.PLUM, S.PLUM]),
  rule('plum-plum-bar', 'Plum, Plum, Bar', 14, [S.PLUM, S.PLUM, S.BAR]),
  rule('orange-x3', 'Orange, Orange, Orange', 10, [S.ORANGE, S.ORANGE, S.ORANGE]),
  rule('orange-orange-bar', 'Orange, Orange, Bar', 10, [S.ORANGE, S.ORANGE, S.BAR]),
  rule('cherry-cherry-any', 'Cherry, Cherry, Any', 5, [S.CHERRY, S.CHERRY, ANY]),
  rule('cherry-any-any', 'Cherry, Any, Any', 2, [S.CHERRY, ANY, ANY]),
]);

export const JACKPOT_RULE_ID = 'seven-x3';

/* ------------------------------------------------------------------------ */
/* Documented control values. These are NOT used to compute anything; they    */
/* exist only so `verifyMath()` and the unit tests can detect a drift between  */
/* the strips/paytable above and the published model.                         */
/* ------------------------------------------------------------------------ */

/** Expected winning outcomes per rule out of 8000. */
export const EXPECTED_HITS = Object.freeze({
  'seven-x3': 1,
  'bar-x3': 6,
  'melon-x3': 8,
  'melon-melon-bar': 4,
  'bell-x3': 40,
  'bell-bell-bar': 5,
  'plum-x3': 63,
  'plum-plum-bar': 21,
  'orange-x3': 100,
  'orange-orange-bar': 25,
  'cherry-cherry-any': 240,
  'cherry-any-any': 560,
});

export const EXPECTED_TOTALS = Object.freeze({
  outcomes: 8000,
  winningOutcomes: 1073,
  losingOutcomes: 6927,
  totalPayout: 7556,
  rtp: 0.9445,
  hitRate: 0.134125,
  expectedNetPerSpin: -0.0555,
});

/** Expected symbol counts (out of 20) per reel. */
export const EXPECTED_SYMBOL_COUNTS = Object.freeze([
  Object.freeze({ 7: 1, Bar: 3, Melon: 2, Bell: 1, Plum: 7, Orange: 5, Cherry: 2, Lemon: 0 }),
  Object.freeze({ 7: 1, Bar: 2, Melon: 2, Bell: 5, Plum: 3, Orange: 5, Cherry: 6, Lemon: 0 }),
  Object.freeze({ 7: 1, Bar: 1, Melon: 2, Bell: 8, Plum: 3, Orange: 4, Cherry: 0, Lemon: 4 }),
]);

/* ------------------------------------------------------------------------ */
/* Evaluation                                                                */
/* ------------------------------------------------------------------------ */

/**
 * @param {Stop} physicalStop
 * @param {SymbolName|'Any'} requirement
 */
export function stopMatches(physicalStop, requirement) {
  return requirement === ANY || physicalStop.includes(requirement);
}

/**
 * @param {readonly number[]} indices Stop index (0..19) for each reel.
 * @returns {Stop[]}
 */
export function getStops(indices) {
  assertIndices(indices);
  return indices.map((index, reel) => REEL_STRIPS[reel][index]);
}

/**
 * @typedef {object} SpinResult
 * @property {readonly number[]} indices
 * @property {Stop[]} stops
 * @property {PayRule|null} rule Highest-priority matching rule, or null on a loss.
 * @property {number} payout Coins won (already multiplied by bet).
 * @property {boolean} isJackpot
 */

/**
 * Find the highest-priority paying rule for a set of physical stops.
 * @param {readonly Stop[]} stops
 * @returns {PayRule|null}
 */
export function findWinningRule(stops) {
  for (const candidate of PAYTABLE) {
    if (candidate.pattern.every((requirement, reel) => stopMatches(stops[reel], requirement))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Evaluate a spin from reel indices.
 * @param {readonly number[]} indices
 * @param {number} [bet=1]
 * @returns {SpinResult}
 */
export function evaluateIndices(indices, bet = 1) {
  const stops = getStops(indices);
  const winningRule = findWinningRule(stops);
  return {
    indices: Object.freeze([...indices]),
    stops,
    rule: winningRule,
    payout: winningRule ? winningRule.payout * bet : 0,
    isJackpot: winningRule?.id === JACKPOT_RULE_ID,
  };
}

/**
 * Count how many times each symbol appears on a reel strip.
 * @param {number} reelIndex
 * @returns {Record<SymbolName, number>}
 */
export function symbolFrequencies(reelIndex) {
  const counts = /** @type {Record<SymbolName, number>} */ (
    Object.fromEntries(SYMBOL_LIST.map((s) => [s, 0]))
  );
  for (const physicalStop of REEL_STRIPS[reelIndex]) {
    for (const symbol of physicalStop) counts[symbol] += 1;
  }
  return counts;
}

/**
 * @typedef {object} PaytableRow
 * @property {string} id
 * @property {string} name
 * @property {number} payout
 * @property {number} hits Winning outcomes out of 8000.
 * @property {number} probability hits / 8000
 * @property {number} contribution payout * hits (coins over the full cycle)
 */

/**
 * @typedef {object} MathReport
 * @property {number} outcomes
 * @property {PaytableRow[]} rows
 * @property {number} winningOutcomes
 * @property {number} losingOutcomes
 * @property {number} totalPayout
 * @property {number} rtp
 * @property {number} hitRate
 * @property {number} expectedNetPerSpin
 * @property {Record<SymbolName, number>[]} symbolCounts
 */

/**
 * Exhaustively enumerate all 20^3 = 8000 equally likely outcomes.
 * No sampling — this is the exact distribution.
 * @returns {MathReport}
 */
export function enumerateOutcomes() {
  const hits = Object.fromEntries(PAYTABLE.map((r) => [r.id, 0]));
  let totalPayout = 0;
  let winningOutcomes = 0;

  for (let a = 0; a < STOPS_PER_REEL; a++) {
    for (let b = 0; b < STOPS_PER_REEL; b++) {
      for (let c = 0; c < STOPS_PER_REEL; c++) {
        const winningRule = findWinningRule([REEL_STRIPS[0][a], REEL_STRIPS[1][b], REEL_STRIPS[2][c]]);
        if (winningRule) {
          hits[winningRule.id] += 1;
          totalPayout += winningRule.payout;
          winningOutcomes += 1;
        }
      }
    }
  }

  const rows = PAYTABLE.map((r) => ({
    id: r.id,
    name: r.name,
    payout: r.payout,
    hits: hits[r.id],
    probability: hits[r.id] / TOTAL_OUTCOMES,
    contribution: hits[r.id] * r.payout,
  }));

  const rtp = totalPayout / TOTAL_OUTCOMES;
  return {
    outcomes: TOTAL_OUTCOMES,
    rows,
    winningOutcomes,
    losingOutcomes: TOTAL_OUTCOMES - winningOutcomes,
    totalPayout,
    rtp,
    hitRate: winningOutcomes / TOTAL_OUTCOMES,
    expectedNetPerSpin: rtp - 1,
    symbolCounts: REEL_STRIPS.map((_, reel) => symbolFrequencies(reel)),
  };
}

export class SlotMathVerificationError extends Error {
  /**
   * @param {string[]} problems
   * @param {MathReport} report
   */
  constructor(problems, report) {
    super(`21 Bell math verification failed:\n - ${problems.join('\n - ')}`);
    this.name = 'SlotMathVerificationError';
    this.problems = problems;
    this.report = report;
  }
}

const EPSILON = 1e-9;

/**
 * Dev-only self check: enumerates the full outcome space and compares it with
 * the documented control values. Returns the structured report on success and
 * throws a descriptive {@link SlotMathVerificationError} on any discrepancy.
 * @returns {MathReport}
 */
export function verifyMath() {
  const problems = [];
  const report = enumerateOutcomes();

  REEL_STRIPS.forEach((strip, reel) => {
    if (strip.length !== STOPS_PER_REEL) {
      problems.push(`Reel ${reel + 1} has ${strip.length} stops, expected ${STOPS_PER_REEL}`);
    }
    for (const symbol of SYMBOL_LIST) {
      const expected = EXPECTED_SYMBOL_COUNTS[reel][symbol];
      const actual = report.symbolCounts[reel][symbol];
      if (actual !== expected) {
        problems.push(`Reel ${reel + 1}: ${symbol} appears ${actual} times, expected ${expected}`);
      }
    }
  });

  for (const row of report.rows) {
    const expected = EXPECTED_HITS[row.id];
    if (row.hits !== expected) {
      problems.push(`${row.name}: ${row.hits} winning outcomes, expected ${expected}`);
    }
  }

  const checks = [
    ['outcomes', report.outcomes, EXPECTED_TOTALS.outcomes],
    ['winningOutcomes', report.winningOutcomes, EXPECTED_TOTALS.winningOutcomes],
    ['losingOutcomes', report.losingOutcomes, EXPECTED_TOTALS.losingOutcomes],
    ['totalPayout', report.totalPayout, EXPECTED_TOTALS.totalPayout],
    ['rtp', report.rtp, EXPECTED_TOTALS.rtp],
    ['hitRate', report.hitRate, EXPECTED_TOTALS.hitRate],
    ['expectedNetPerSpin', report.expectedNetPerSpin, EXPECTED_TOTALS.expectedNetPerSpin],
  ];
  for (const [label, actual, expected] of checks) {
    if (Math.abs(actual - expected) > EPSILON) {
      problems.push(`${label}: got ${actual}, expected ${expected}`);
    }
  }

  if (problems.length > 0) throw new SlotMathVerificationError(problems, report);
  return report;
}

/**
 * @param {readonly number[]} indices
 */
function assertIndices(indices) {
  if (!indices || indices.length !== REEL_COUNT) {
    throw new RangeError(`Expected ${REEL_COUNT} reel indices`);
  }
  indices.forEach((index, reel) => {
    if (!Number.isInteger(index) || index < 0 || index >= STOPS_PER_REEL) {
      throw new RangeError(`Reel ${reel + 1} index ${index} is outside 0..${STOPS_PER_REEL - 1}`);
    }
  });
}
