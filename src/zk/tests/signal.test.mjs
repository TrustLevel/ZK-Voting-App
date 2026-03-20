import assert from 'assert';
import blake2b from '../node_modules/blake2b/index.js';
import { encodeVoteSignal, decodeVoteSignal } from '../dist/signal.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log('\nsignal.ts — encode/decode tests\n');

// Known test vectors from signal_tests.ak

await test('encodeVoteSignal([(2,1)]) matches on-chain serialise_signal', async () => {
  const hex = encodeVoteSignal([[2, 1]]);
  assert.strictEqual(hex, '9f9f0201ffff');
});

await test('blake2b-256 of encodeVoteSignal([(2,1)]) matches on-chain signal_digest', async () => {
  const hex = encodeVoteSignal([[2, 1]]);
  const hash = Buffer.from(blake2b(32).update(Buffer.from(hex, 'hex')).digest()).toString('hex');
  assert.strictEqual(hash, '37623354bb4f21010e8d5e298310c6942ff168d1e4801b306edd392e20998294');
});

await test('decodeVoteSignal roundtrip: decode(encode(options)) equals original', async () => {
  const options = [[2, 1]];
  const hex = encodeVoteSignal(options);
  const decoded = decodeVoteSignal(hex);
  assert.deepStrictEqual(decoded, options);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
