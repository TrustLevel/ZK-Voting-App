import assert from 'assert';
import { generateVoteProof, verifyVoteProof } from '../dist/proof.js';
import { Identity, Group } from '../../../node_modules/modp-semaphore-bls12381/packages/typescript/lib/index.js';

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

console.log('\nproof.ts — generate and verify tests\n');

// Shared proof generated once and reused across tests
const identity = new Identity();
const group = new Group(20);
group.addMember(identity.commitment);
const merkleProof = group.generateMerkleProof(0);

const signal = Buffer.from('testvote').toString('hex');
const externalNullifier = BigInt(1);

console.log('  (generating proof, this may take ~30s...)\n');
const result = await generateVoteProof({
  identityNullifier: identity.nullifier,
  identityTrapdoor: identity.trapdoor,
  merkleProof,
  externalNullifier,
  signal,
});

await test('generateVoteProof returns compressed pi_a of 96 hex chars (48 bytes)', async () => {
  assert.strictEqual(result.zkProof.pi_a.length, 96, `expected 96, got ${result.zkProof.pi_a.length}`);
});

await test('generateVoteProof returns compressed pi_b of 192 hex chars (96 bytes)', async () => {
  assert.strictEqual(result.zkProof.pi_b.length, 192, `expected 192, got ${result.zkProof.pi_b.length}`);
});

await test('verifyVoteProof returns true for a valid proof', async () => {
  const valid = await verifyVoteProof(result.zkProof, result.publicSignals);
  assert.strictEqual(valid, true, 'proof verification failed');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
