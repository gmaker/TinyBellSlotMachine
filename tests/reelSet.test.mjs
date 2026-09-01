import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReelSet } from '../src/reels/ReelSet.js';
import { DEFAULT_TIMING, REDUCED_MOTION_TIMING } from '../src/reels/ReelTiming.js';

function runToCompletion(reelSet, start, step = 1 / 120) {
  const stoppedOrder = [];
  let t = start;
  let totalTicks = [0, 0, 0];
  for (let guard = 0; guard < 20000 && !reelSet.allStopped; guard++) {
    t += step;
    const { ticks, stopped } = reelSet.update(t);
    totalTicks = totalTicks.map((v, i) => v + ticks[i]);
    stoppedOrder.push(...stopped);
  }
  return { stoppedOrder, totalTicks, finishedAt: t };
}

test('reels land exactly on the drawn targets for every timing profile', () => {
  for (const timing of [DEFAULT_TIMING, REDUCED_MOTION_TIMING]) {
    const reelSet = new ReelSet(3, 20, [4, 9, 17]);
    const targets = [6, 3, 14];
    reelSet.startSpin(targets, 10, timing);
    runToCompletion(reelSet, 10);
    assert.deepEqual(reelSet.stopIndices, targets);
    assert.ok(reelSet.allStopped);
  }
});

test('reels stop strictly left to right with the configured gap', () => {
  const reelSet = new ReelSet(3, 20);
  const plans = reelSet.startSpin([0, 0, 0], 0);
  assert.ok(plans[0].brakeTime <= plans[1].brakeTime - DEFAULT_TIMING.stopGap + 1e-9);
  assert.ok(plans[1].brakeTime <= plans[2].brakeTime - DEFAULT_TIMING.stopGap + 1e-9);
  const { stoppedOrder } = runToCompletion(reelSet, 0);
  assert.deepEqual(stoppedOrder, [0, 1, 2]);
});

test('positions are continuous at the brake point and every reel completes several turns', () => {
  const reelSet = new ReelSet(3, 20);
  const plans = reelSet.startSpin([19, 7, 2], 0);
  plans.forEach((plan, i) => {
    const reel = reelSet.reels[i];
    const before = reel.positionAt(plan.brakeTime - 1e-6);
    const after = reel.positionAt(plan.brakeTime + 1e-6);
    assert.ok(Math.abs(before - after) < 1e-3, `reel ${i} continuous at brake`);
    assert.ok(plan.startPosition - plan.finalPosition >= 20, `reel ${i} spins at least one full turn`);
    assert.equal(((plan.finalPosition % 20) + 20) % 20, plan.target);
  });
});

test('every target is reachable from every start (exhaustive over one reel)', () => {
  for (let start = 0; start < 20; start++) {
    for (let target = 0; target < 20; target++) {
      const reelSet = new ReelSet(1, 20, [start]);
      reelSet.startSpin([target], 5);
      runToCompletion(reelSet, 5, 1 / 60);
      assert.equal(reelSet.stopIndices[0], target, `start ${start} → target ${target}`);
    }
  }
});

test('starting a spin while spinning or with a bad target is rejected', () => {
  const reelSet = new ReelSet(3, 20);
  reelSet.startSpin([1, 2, 3], 0);
  assert.throws(() => reelSet.startSpin([1, 2, 3], 0.1), /already spinning/);
  const fresh = new ReelSet(3, 20);
  assert.throws(() => fresh.startSpin([1, 2, 20], 0), RangeError);
  assert.throws(() => fresh.startSpin([1, 2], 0), RangeError);
});
