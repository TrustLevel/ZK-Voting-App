/**
 * buildSemaphoreVotingMintTransaction — transaction structure + Plutus script evaluation tests
 *
 * Builds a Semaphore + Voting NFT mint tx using a mocked Group NFT reference input,
 * then evaluates both minting scripts through the local Plutus CEK machine via
 * OfflineEvaluator.  The builder itself uses static execution units (no inline
 * evaluator), so CEK evaluation is called explicitly after building.
 *
 * Run with: node --experimental-wasm-modules tests/mint-sv.test.mjs
 */

import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { TxParser }                                                    = require('@meshsdk/transaction');
const { CSLSerializer, serializeAddress, OfflineEvaluator, toPlutusData } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress, conStr, byteString, integer } = require('@meshsdk/core');

import {
  buildSemaphoreVotingMintTransaction,
  VALIDATORS,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
  textToHex,
  createOutputReference,
  createGroupDatum,
  generateInitialOptions,
  createUrnaDatum,
  applyOrefParamToScript,
} from '../dist/browser/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function parseSilently(parser, txHex, utxos) {
  const orig = console.log;
  console.log = () => {};
  try {
    await parser.parse(txHex, utxos);
  } finally {
    console.log = orig;
  }
}

// ── Wallet fixtures ───────────────────────────────────────────────────────────

const PAYMENT_KEY_HASH = 'b2ee7af5a0c440cab2112c643a1b37b5a11e6bc6ef7b6edac5276b29';
const WALLET_ADDRESS   = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 0);
const MOCK_TX_HASH     = 'a'.repeat(64);
const GROUP_TX_HASH    = 'b'.repeat(64);
const NULL_HASH        = '0'.repeat(64);

const makeWalletUtxo = (idx, lovelace) => ({
  input:  { txHash: MOCK_TX_HASH, outputIndex: idx },
  output: { amount: [{ unit: 'lovelace', quantity: String(lovelace) }], address: WALLET_ADDRESS },
});

const selectedUtxo   = makeWalletUtxo(0, 10_000_000);
const collateralUtxo = makeWalletUtxo(1,  5_000_000);
const walletUtxos    = [selectedUtxo, collateralUtxo, makeWalletUtxo(2, 20_000_000)];

// ── Group NFT reference input (minted in a prior tx, now on-chain) ─────────────

const groupOref       = createOutputReference(GROUP_TX_HASH, 0);
const groupClothed    = await applyOrefParamToScript(VALIDATORS.group.mint, groupOref);
const groupPolicyId   = resolveScriptHash(groupClothed, 'V3');
const groupScriptAddr = resolvePlutusScriptAddress({ code: groupClothed, version: 'V3' }, 0);
const groupAssetName  = textToHex('zkvapp-group');

// GroupDatum in toPlutusData's "Mesh" format: plain number for Int, hex string for ByteArray.
// Field order matches Aiken: { group_merke_root: Int, admin_pkh: ByteArray }.
const groupDatumCbor = toPlutusData({ alternative: 0, fields: [0, PAYMENT_KEY_HASH] }).to_hex();

const groupNftUtxo = {
  input:  { txHash: GROUP_TX_HASH, outputIndex: 0 },
  output: {
    address:    groupScriptAddr,
    amount:     [
      { unit: 'lovelace',                      quantity: '5000000' },
      { unit: groupPolicyId + groupAssetName,  quantity: '1'       },
    ],
    plutusData: groupDatumCbor,
  },
};

// ── Semaphore + Voting scripts (both parameterised with selectedUtxo oref) ────

const oref = createOutputReference(MOCK_TX_HASH, 0);

const semaphoreClothed    = await applyOrefParamToScript(VALIDATORS.semaphore.mint, oref);
const semaphorePolicyId   = resolveScriptHash(semaphoreClothed, 'V3');
const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreClothed, version: 'V3' }, 0);
const semaphoreAssetName  = textToHex('Semaphore1');

const votingClothed    = await applyOrefParamToScript(VALIDATORS.voting.mint, oref);
const votingPolicyId   = resolveScriptHash(votingClothed, 'V3');
const votingScriptAddr = resolvePlutusScriptAddress({ code: votingClothed, version: 'V3' }, 0);
const votingAssetName  = textToHex('VotingEvent1');

// SemaphoreDatum: group_token_policy, group_merke_root, nullifier_mpf_root, vkey_ref_input
const semaphoreDatum = conStr(0, [
  byteString(groupPolicyId),
  integer(0),
  byteString(NULL_HASH),
  createOutputReference(VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX),
]);

// UrnaDatum: event times far in the future (POSIX ms).
// Voting validator checks: validity_range is entirely before event_start.
// Preprod genesis = Unix 1679285568s; slot 115_000_000 ≈ 1794285568s ≈ 2026-11.
// eventStart = 9_999_999_999_000 ms (year 2286) >> slot 115M POSIX ms.
const options        = generateInitialOptions(3);
const eventStart     = 9_999_999_999_000;
const eventEnd       = eventStart + 3_600_000;
const txValidityEndSlot = 115_000_000;

const urnaDatum = createUrnaDatum({
  weight: 1,
  options,
  eventStart,
  eventEnd,
  semaphoreNftPolicyId: semaphorePolicyId,
});

const semaphoreMintValue = [
  { unit: 'lovelace',                             quantity: '5000000' },
  { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1'       },
];
const votingMintValue = [
  { unit: 'lovelace',                         quantity: '5000000' },
  { unit: votingPolicyId + votingAssetName,   quantity: '1'       },
];

// ── Provider + evaluator ──────────────────────────────────────────────────────

const mockFetcher = {
  fetchUTxOs: async (txHash) => {
    if (txHash === GROUP_TX_HASH) return [groupNftUtxo];
    return walletUtxos.filter(u => u.input.txHash === txHash);
  },
};

// No evaluator in the builder — static exec units avoid Ogmios lag on the Group
// NFT reference input. We call offlineEvaluator directly after building.
const mockProvider = {
  fetchCostModels: async () => [],
  fetchUTxOs:      mockFetcher.fetchUTxOs,
};
const offlineEvaluator = new OfflineEvaluator(mockFetcher, 'preprod');

const baseParams = {
  provider:              mockProvider,
  txValidityEndSlot,
  groupNftTxHash:        GROUP_TX_HASH,
  groupNftOutputIndex:   0,
  semaphorePolicyId,
  semaphoreAssetName,
  semaphoreValidatorCbor: semaphoreClothed,
  votingPolicyId,
  votingAssetName,
  votingValidatorCbor:    votingClothed,
  selectedUtxo,
  walletUtxos,
  walletAddress:         WALLET_ADDRESS,
  semaphoreScriptAddr,
  semaphoreMintValue,
  semaphoreDatum,
  votingScriptAddr,
  votingMintValue,
  urnaDatum,
  paymentKeyHash:        PAYMENT_KEY_HASH,
  collateralUtxo,
};

// Build once for structural assertions
const txHex    = await buildSemaphoreVotingMintTransaction(baseParams);
const allUtxos = [...walletUtxos, groupNftUtxo];

const serializer = new CSLSerializer();
const parser     = new TxParser(serializer, null);
await parseSilently(parser, txHex, allUtxos);
const tester = parser.toTester();

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nbuildSemaphoreVotingMintTransaction — Plutus evaluation + transaction structure\n');

await test('Semaphore + Voting validators accept the transaction (Plutus CEK machine passes)', async () => {
  const exUnits = await offlineEvaluator.evaluateTx(txHex, allUtxos, []);
  assert.ok(Array.isArray(exUnits) && exUnits.length > 0, 'Expected evaluator to return execution units');
});

await test('mints exactly 1 Semaphore NFT under the parameterised policy', () => {
  tester.tokenMinted(semaphorePolicyId, semaphoreAssetName, 1);
  assert.ok(tester.success(), tester.errors());
});

await test('mints exactly 1 Voting NFT under the parameterised policy', () => {
  tester.tokenMinted(votingPolicyId, votingAssetName, 1);
  assert.ok(tester.success(), tester.errors());
});

await test('sends the Semaphore NFT output to the Semaphore script address', () => {
  tester.outputsAt(semaphoreScriptAddr);
  assert.ok(tester.success(), tester.errors());
});

await test('sends the Voting NFT output to the Voting script address', () => {
  tester.outputsAt(votingScriptAddr);
  assert.ok(tester.success(), tester.errors());
});

await test('requires the admin payment key hash as a signer', () => {
  tester.keySigned(PAYMENT_KEY_HASH);
  assert.ok(tester.success(), tester.errors());
});

await test('Semaphore validator rejects when nullifier root is not the empty hash', async () => {
  const badDatum = conStr(0, [
    byteString(groupPolicyId),
    integer(0),
    byteString('1'.repeat(64)),
    createOutputReference(VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX),
  ]);
  const badTxHex = await buildSemaphoreVotingMintTransaction({ ...baseParams, semaphoreDatum: badDatum });

  let threw = false;
  try {
    await offlineEvaluator.evaluateTx(badTxHex, allUtxos, []);
  } catch {
    threw = true;
  }
  assert.ok(threw, 'Expected OfflineEvaluator to reject a non-empty initial nullifier root');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
