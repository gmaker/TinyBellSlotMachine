import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BET_OPTIONS, GameState, INITIAL_BALANCE } from '../src/core/GameState.js';
import { evaluateIndices } from '../src/math/SlotMath.js';

test('starts with 100 coins and bet 1', () => {
  const state = new GameState();
  assert.equal(state.balance, INITIAL_BALANCE);
  assert.equal(state.balance, 100);
  assert.equal(state.bet, 1);
  assert.ok(state.canSpin());
});

test('a spin debits exactly one coin and locks input', () => {
  const state = new GameState();
  state.beginSpin();
  assert.equal(state.balance, 99);
  assert.ok(state.locked);
  assert.ok(!state.canSpin());
  assert.throws(() => state.beginSpin(), /already in progress/);
});

test('payout is credited exactly once', () => {
  const state = new GameState();
  state.beginSpin();
  const result = evaluateIndices([6, 3, 14]); // 7,7,7 = 200
  state.settleSpin(result);
  assert.equal(state.balance, 99 + 200);
  assert.equal(state.lastWin, 200);
  assert.throws(() => state.settleSpin(result), /already settled/);
  state.endSpin();
  assert.ok(state.canSpin());
  assert.equal(state.balance, 299);
});

test('a loss leaves the balance debited', () => {
  const state = new GameState();
  state.beginSpin();
  state.settleSpin(evaluateIndices([0, 0, 0]));
  state.endSpin();
  assert.equal(state.balance, 99);
  assert.equal(state.lastWin, 0);
});

test('spinning is impossible at zero balance and reset restores 100', () => {
  const state = new GameState();
  for (let i = 0; i < 100; i++) {
    state.beginSpin();
    state.settleSpin(evaluateIndices([0, 0, 0]));
    state.endSpin();
  }
  assert.equal(state.balance, 0);
  assert.ok(state.isBroke);
  assert.ok(!state.canSpin());
  assert.throws(() => state.beginSpin(), /Insufficient/);
  state.reset();
  assert.equal(state.balance, 100);
  assert.ok(state.canSpin());
});

test('emits change events', () => {
  const state = new GameState();
  const balances = [];
  state.on('change', (s) => balances.push(s.balance));
  state.beginSpin();
  state.settleSpin(evaluateIndices([3, 1, 0])); // cherry any any = 2
  state.endSpin();
  assert.deepEqual(balances, [99, 101, 101]);
});

test('bet multipliers: 1, 5 and 10 coins are debited and multiply the payout', () => {
  const state = new GameState();
  assert.deepEqual([...BET_OPTIONS], [1, 5, 10]);
  assert.equal(state.bet, 1);
  state.setBet(10);
  state.beginSpin();
  assert.equal(state.balance, 90);
  assert.throws(() => state.setBet(5), /during a spin/);
  state.settleSpin(evaluateIndices([6, 3, 14], state.bet)); // 7,7,7 × 10
  state.endSpin();
  assert.equal(state.lastWin, 2000);
  assert.equal(state.balance, 2090);
  assert.throws(() => state.setBet(3), RangeError);
});

test('a bet larger than the balance blocks spinning but is not game over', () => {
  const state = new GameState();
  for (let i = 0; i < 97; i++) {
    state.beginSpin();
    state.settleSpin(evaluateIndices([0, 0, 0]));
    state.endSpin();
  }
  assert.equal(state.balance, 3);
  state.setBet(5);
  assert.ok(!state.canSpin());
  assert.ok(state.cannotAffordBet);
  assert.ok(!state.isBroke);
  state.setBet(1);
  assert.ok(state.canSpin());
  state.reset();
  assert.equal(state.bet, 1);
});
