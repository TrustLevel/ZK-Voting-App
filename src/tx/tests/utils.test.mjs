import assert from 'assert';
import {
  textToHex,
  createOutputReference,
  createGroupDatum,
  generateInitialOptions,
  createUrnaDatum,
  selectUtxoForCollateral,
} from '../dist/browser/utils-browser.js';

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

function assertThrows(fn, messageSubstring) {
  try {
    fn();
    throw new Error(`Expected error containing "${messageSubstring}" but no error was thrown`);
  } catch (err) {
    if (err.message.includes(messageSubstring)) return;
    throw err;
  }
}

const VALID_TX_HASH = 'a'.repeat(64);
const VALID_PKH    = 'b'.repeat(56);
const VALID_POLICY = 'c'.repeat(56);

console.log('\nutils-browser.ts — utility function tests\n');

// ── textToHex ─────────────────────────────────────────────────────────────────

await test('textToHex encodes ASCII correctly', () => {
  assert.strictEqual(textToHex('abc'), '616263');
});

await test('textToHex returns empty string for empty input', () => {
  assert.strictEqual(textToHex(''), '');
});

await test('textToHex pads single-digit hex values', () => {
  // '\x01' should be '01', not '1'
  assert.strictEqual(textToHex('\x01\x0a'), '010a');
});

// ── createOutputReference ─────────────────────────────────────────────────────

await test('createOutputReference returns correct structure', () => {
  const oref = createOutputReference(VALID_TX_HASH, 0);
  assert.strictEqual(oref.constructor, 0);
  assert.strictEqual(oref.fields[0].bytes, VALID_TX_HASH);
  assert.strictEqual(oref.fields[1].int, 0);
});

await test('createOutputReference throws on short tx hash', () => {
  assertThrows(() => createOutputReference('abc', 0), 'Transaction hash must be a 64-character hex string');
});

await test('createOutputReference throws on negative output index', () => {
  assertThrows(() => createOutputReference(VALID_TX_HASH, -1), 'Output index must be non-negative');
});

// ── createGroupDatum ──────────────────────────────────────────────────────────

await test('createGroupDatum returns a non-null datum for valid inputs', () => {
  const datum = createGroupDatum(0n, VALID_PKH);
  assert.ok(datum !== null && datum !== undefined);
});

await test('createGroupDatum throws on negative merkle root', () => {
  assertThrows(() => createGroupDatum(-1n, VALID_PKH), 'Merkle root must be non-negative');
});

await test('createGroupDatum throws when admin PKH is not 56 chars', () => {
  assertThrows(() => createGroupDatum(0n, 'tooshort'), 'Admin PKH must be a 56-character hex string');
});

// ── generateInitialOptions ────────────────────────────────────────────────────

await test('generateInitialOptions returns array of requested length', () => {
  const opts = generateInitialOptions(4);
  assert.strictEqual(opts.length, 4);
});

await test('generateInitialOptions throws when fewer than 2 options requested', () => {
  assertThrows(() => generateInitialOptions(1), 'Minimum 2 options required');
});

// ── createUrnaDatum ───────────────────────────────────────────────────────────

await test('createUrnaDatum returns a non-null datum for valid inputs', () => {
  const options = generateInitialOptions(3);
  const datum = createUrnaDatum({
    weight: 1,
    options,
    eventStart: 1000,
    eventEnd: 2000,
    semaphoreNftPolicyId: VALID_POLICY,
  });
  assert.ok(datum !== null && datum !== undefined);
});

await test('createUrnaDatum throws when eventEnd is not after eventStart', () => {
  const options = generateInitialOptions(2);
  assertThrows(
    () => createUrnaDatum({ weight: 1, options, eventStart: 2000, eventEnd: 1000, semaphoreNftPolicyId: VALID_POLICY }),
    'Event end must be after start',
  );
});

await test('createUrnaDatum throws when fewer than 2 options provided', () => {
  assertThrows(
    () => createUrnaDatum({ weight: 1, options: ['single'], eventStart: 1000, eventEnd: 2000, semaphoreNftPolicyId: VALID_POLICY }),
    'Must have at least 2 options',
  );
});

await test('createUrnaDatum throws when semaphore policy ID is wrong length', () => {
  const options = generateInitialOptions(2);
  assertThrows(
    () => createUrnaDatum({ weight: 1, options, eventStart: 1000, eventEnd: 2000, semaphoreNftPolicyId: 'tooshort' }),
    'Semaphore NFT policy ID must be 56 hex chars',
  );
});

// ── selectUtxoForCollateral ───────────────────────────────────────────────────

const makeUtxo = (unit, quantity) => ({
  input: { txHash: VALID_TX_HASH, outputIndex: 0 },
  output: { amount: [{ unit, quantity: String(quantity) }] },
});

await test('selectUtxoForCollateral returns a lovelace-only UTxO above the minimum', () => {
  const utxos = [makeUtxo('lovelace', 6_000_000)];
  const result = selectUtxoForCollateral(utxos, 5_000_000);
  assert.ok(result !== undefined);
});

await test('selectUtxoForCollateral returns undefined when no UTxO meets the minimum', () => {
  const utxos = [makeUtxo('lovelace', 2_000_000)];
  const result = selectUtxoForCollateral(utxos, 5_000_000);
  assert.strictEqual(result, undefined);
});

await test('selectUtxoForCollateral skips UTxOs that hold non-lovelace tokens', () => {
  const mixed = {
    input: { txHash: VALID_TX_HASH, outputIndex: 0 },
    output: { amount: [{ unit: 'lovelace', quantity: '10000000' }, { unit: 'somepolicyid', quantity: '1' }] },
  };
  const result = selectUtxoForCollateral([mixed], 5_000_000);
  assert.strictEqual(result, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
