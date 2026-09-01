import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANY,
  EXPECTED_HITS,
  EXPECTED_SYMBOL_COUNTS,
  EXPECTED_TOTALS,
  PAYTABLE,
  REEL_STRIPS,
  STOPS_PER_REEL,
  SYMBOL,
  SYMBOL_LIST,
  enumerateOutcomes,
  evaluateIndices,
  findWinningRule,
  stopMatches,
  symbolFrequencies,
  verifyMath,
} from '../src/math/SlotMath.js';

test('each reel strip has exactly 20 physical stops', () => {
  assert.equal(REEL_STRIPS.length, 3);
  for (const strip of REEL_STRIPS) assert.equal(strip.length, STOPS_PER_REEL);
});

test('symbol frequencies per reel match the documented table', () => {
  REEL_STRIPS.forEach((_, reel) => {
    const counts = symbolFrequencies(reel);
    for (const symbol of SYMBOL_LIST) {
      assert.equal(counts[symbol], EXPECTED_SYMBOL_COUNTS[reel][symbol], `reel ${reel + 1} ${symbol}`);
    }
  });
});

test('double stops are single physical stops carrying two symbols', () => {
  const doubles = REEL_STRIPS.flatMap((strip) => strip.filter((s) => s.length === 2));
  // 1 on reel 1, 4 on reel 2, 3 on reel 3
  assert.equal(doubles.length, 8);
  const sevenOrange = REEL_STRIPS[1][3];
  assert.deepEqual([...sevenOrange], [SYMBOL.SEVEN, SYMBOL.ORANGE]);
  assert.ok(stopMatches(sevenOrange, SYMBOL.SEVEN));
  assert.ok(stopMatches(sevenOrange, SYMBOL.ORANGE));
  assert.ok(!stopMatches(sevenOrange, SYMBOL.BAR));
  assert.ok(stopMatches(sevenOrange, ANY));
});

test('full enumeration of 8000 outcomes yields the exact documented hit counts', () => {
  const report = enumerateOutcomes();
  assert.equal(report.outcomes, 8000);
  const hitsById = Object.fromEntries(report.rows.map((r) => [r.id, r.hits]));
  assert.deepEqual(hitsById, EXPECTED_HITS);
  assert.deepEqual(
    report.rows.map((r) => r.hits),
    [1, 6, 8, 4, 40, 5, 63, 21, 100, 25, 240, 560],
  );
});

test('totals: 1073 winning outcomes, 7556 total payout, RTP 0.9445', () => {
  const report = enumerateOutcomes();
  assert.equal(report.winningOutcomes, 1073);
  assert.equal(report.losingOutcomes, 6927);
  assert.equal(report.totalPayout, 7556);
  assert.ok(Math.abs(report.rtp - 0.9445) < 1e-12);
  assert.ok(Math.abs(report.hitRate - 0.134125) < 1e-12);
  assert.ok(Math.abs(report.expectedNetPerSpin - -0.0555) < 1e-12);
  assert.equal(report.totalPayout, report.rows.reduce((sum, r) => sum + r.contribution, 0));
});

test('verifyMath() returns a report and does not throw for the shipped model', () => {
  const report = verifyMath();
  assert.equal(report.winningOutcomes, EXPECTED_TOTALS.winningOutcomes);
  assert.equal(report.rows.length, PAYTABLE.length);
});

test('paytable priority: only the highest rule pays', () => {
  // 7, 7, 7 — reel 3 stop 15 is `7 + Bar`; it must pay the jackpot, not a Bar line.
  const jackpot = evaluateIndices([6, 3, 14]);
  assert.equal(jackpot.rule.id, 'seven-x3');
  assert.equal(jackpot.payout, 200);
  assert.ok(jackpot.isJackpot);

  // Cherry, Cherry, Cherry does not exist (reel 3 has no Cherry) but
  // Cherry, Cherry, Any must beat Cherry, Any, Any.
  const cherries = evaluateIndices([3, 0, 0]);
  assert.equal(cherries.rule.id, 'cherry-cherry-any');
  assert.equal(cherries.payout, 5);

  const singleCherry = evaluateIndices([3, 1, 0]);
  assert.equal(singleCherry.rule.id, 'cherry-any-any');
  assert.equal(singleCherry.payout, 2);
});

test('combined stops count for both symbols in the third reel Bar rules', () => {
  // Bell(reel1 stop 8 = Bell+Bar), Bell(reel2 stop 6), 7+Bar(reel3 stop 15) → Bell, Bell, Bar = 18
  const bellBar = evaluateIndices([7, 5, 14]);
  assert.equal(bellBar.rule.id, 'bell-bell-bar');
  assert.equal(bellBar.payout, 18);

  // Bar(reel1 stop 11), Bar(reel2 stop 7 = Plum+Bar), 7+Bar(reel3) → Bar, Bar, Bar = 100
  const bars = evaluateIndices([10, 6, 14]);
  assert.equal(bars.rule.id, 'bar-x3');

  // Melon(reel1 stop 2), Melon+Orange(reel2 stop 12), Melon+Orange(reel3 stop 8) → Melon x3
  const melons = evaluateIndices([1, 11, 7]);
  assert.equal(melons.rule.id, 'melon-x3');
  assert.equal(melons.payout, 100);

  // Plum+Bar on reel 2 also satisfies Plum, Plum, Plum
  const plums = evaluateIndices([2, 6, 2]);
  assert.equal(plums.rule.id, 'plum-x3');
});

test('a losing combination pays nothing', () => {
  const loss = evaluateIndices([0, 0, 0]); // Orange, Cherry, Bell
  assert.equal(loss.rule, null);
  assert.equal(loss.payout, 0);
  assert.equal(findWinningRule(loss.stops), null);
});

test('bet multiplies the payout', () => {
  assert.equal(evaluateIndices([6, 3, 14], 2).payout, 400);
});

test('invalid indices are rejected', () => {
  assert.throws(() => evaluateIndices([20, 0, 0]), RangeError);
  assert.throws(() => evaluateIndices([0, -1, 0]), RangeError);
  assert.throws(() => evaluateIndices([0, 0]), RangeError);
  assert.throws(() => evaluateIndices([0.5, 0, 0]), RangeError);
});
