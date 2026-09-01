import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CryptoRng, SeededRng, SequenceRng } from '../src/core/Rng.js';

test('SeededRng is deterministic for the same seed', () => {
  const a = new SeededRng(1234);
  const b = new SeededRng(1234);
  const seqA = Array.from({ length: 50 }, () => a.nextInt(20));
  const seqB = Array.from({ length: 50 }, () => b.nextInt(20));
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => Number.isInteger(v) && v >= 0 && v < 20));
});

test('SeededRng differs across seeds', () => {
  const a = Array.from({ length: 20 }, () => new SeededRng(1).nextInt(20));
  const b = new SeededRng(2);
  const seqB = Array.from({ length: 20 }, () => b.nextInt(20));
  assert.notDeepEqual(a, seqB);
});

test('SequenceRng replays scripted values and refuses out-of-range ones', () => {
  const rng = new SequenceRng([6, 3, 14]);
  assert.deepEqual([rng.nextInt(20), rng.nextInt(20), rng.nextInt(20)], [6, 3, 14]);
  assert.throws(() => rng.nextInt(20), /exhausted/);
  assert.throws(() => new SequenceRng([20]).nextInt(20), RangeError);
});

test('CryptoRng stays within range', () => {
  const rng = new CryptoRng();
  for (let i = 0; i < 2000; i++) {
    const v = rng.nextInt(20);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 20);
  }
  assert.throws(() => rng.nextInt(0), RangeError);
});
