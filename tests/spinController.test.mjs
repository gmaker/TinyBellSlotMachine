import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../src/core/GameState.js';
import { SequenceRng, SeededRng } from '../src/core/Rng.js';
import { SpinController, SpinPhase } from '../src/core/SpinController.js';
import { ReelSet } from '../src/reels/ReelSet.js';
import { REDUCED_MOTION_TIMING } from '../src/reels/ReelTiming.js';

function makeController(rng) {
  const state = new GameState();
  const reelSet = new ReelSet(3, 20);
  const controller = new SpinController({ state, rng, reelSet, timing: REDUCED_MOTION_TIMING });
  return { state, reelSet, controller };
}

function runUntilIdle(controller, start, step = 1 / 120) {
  let t = start;
  for (let guard = 0; guard < 20000 && !controller.isIdle; guard++) {
    t += step;
    controller.update(t);
  }
  assert.ok(controller.isIdle, 'controller returned to IDLE');
  return t;
}

test('scripted RNG produces predictable targets and the jackpot payout', () => {
  const { state, controller } = makeController(new SequenceRng([6, 3, 14]));
  const phases = [];
  controller.on('phase', ({ phase }) => phases.push(phase));

  assert.ok(controller.requestSpin(0));
  assert.deepEqual(controller.targets, [6, 3, 14]);
  assert.equal(state.balance, 99, 'debited immediately on acceptance');
  assert.equal(controller.phase, SpinPhase.PULLING);

  runUntilIdle(controller, 0);
  assert.equal(controller.result.rule.id, 'seven-x3');
  assert.equal(state.balance, 299);
  assert.equal(state.lastWin, 200);
  assert.deepEqual(phases, [
    SpinPhase.PULLING,
    SpinPhase.SPINNING,
    SpinPhase.STOPPING,
    SpinPhase.EVALUATING,
    SpinPhase.PAYING,
    SpinPhase.IDLE,
  ]);
});

test('spin is rejected while a spin is in progress', () => {
  const { controller } = makeController(new SeededRng(7));
  assert.ok(controller.requestSpin(0));
  controller.update(0.05);
  assert.equal(controller.requestSpin(0.05), false);
});

test('reel stop events arrive left to right and match the targets', () => {
  const { controller } = makeController(new SequenceRng([1, 11, 7]));
  const stops = [];
  controller.on('reelStopped', (e) => stops.push(e));
  controller.requestSpin(1);
  runUntilIdle(controller, 1);
  assert.deepEqual(stops.map((s) => s.reelIndex), [0, 1, 2]);
  assert.deepEqual(stops.map((s) => s.stopIndex), [1, 11, 7]);
  assert.equal(controller.result.rule.id, 'melon-x3');
});

test('balance is debited once per spin and never goes below zero', () => {
  const rng = new SeededRng(42);
  const { state, controller } = makeController(rng);
  let t = 0;
  let spins = 0;
  while (state.canSpin() && spins < 500) {
    const before = state.balance;
    assert.ok(controller.requestSpin(t));
    spins += 1;
    assert.equal(state.balance, before - 1);
    t = runUntilIdle(controller, t);
    assert.equal(state.balance, before - 1 + state.lastWin);
  }
  assert.ok(state.balance >= 0);
  if (state.balance === 0) {
    assert.equal(controller.requestSpin(t), false, 'no spin at zero balance');
  }
});

test('seeded RNG gives reproducible sessions', () => {
  const play = (seed) => {
    const { state, controller } = makeController(new SeededRng(seed));
    let t = 0;
    const results = [];
    for (let i = 0; i < 10; i++) {
      controller.requestSpin(t);
      t = runUntilIdle(controller, t);
      results.push([...controller.targets, state.lastWin]);
    }
    return results;
  };
  assert.deepEqual(play(99), play(99));
});
