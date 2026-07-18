/**
 * buildGroupMintTransaction — transaction structure + Plutus script evaluation tests
 *
 * Uses OfflineEvaluator (MeshSDK) to run the Group validator through the local
 * Plutus CEK machine without submitting to the network.  If the script rejects
 * the transaction, buildGroupMintTransaction throws before we even reach the
 * TxTester assertions.
 *
 * Run with: node --experimental-wasm-modules tests/mint-group.test.mjs
 * (--experimental-wasm-modules is required because @meshsdk/core-csl loads WASM)
 */

import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// CJS require avoids the ESM WASM extension error from @meshsdk/transaction
const { TxParser }                                       = require('@meshsdk/transaction');
const { CSLSerializer, serializeAddress, OfflineEvaluator } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress, conStr } = require('@meshsdk/core');

// Our browser transaction builder and utilities
import {
  buildGroupMintTransaction,
  VALIDATORS,
  textToHex,
  createOutputReference,
  createGroupDatum,
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

// TxParser emits hardcoded console.log during parse — suppress it
async function parseSilently(parser, txHex, utxos) {
  const orig = console.log;
  console.log = () => {};
  try {
    await parser.parse(txHex, utxos);
  } finally {
    console.log = orig;
  }
}

// ── Fixed test fixtures ────────────────────────────────────────────────────────

const PAYMENT_KEY_HASH = 'b2ee7af5a0c440cab2112c643a1b37b5a11e6bc6ef7b6edac5276b29';
const WALLET_ADDRESS   = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 0);
const MOCK_TX_HASH     = 'a'.repeat(64);

const makeUtxo = (idx, lovelace) => ({
  input:  { txHash: MOCK_TX_HASH, outputIndex: idx },
  output: { amount: [{ unit: 'lovelace', quantity: String(lovelace) }], address: WALLET_ADDRESS },
});

const selectedUtxo   = makeUtxo(0, 10_000_000);
const collateralUtxo = makeUtxo(1,  5_000_000);
const walletUtxos    = [selectedUtxo, collateralUtxo, makeUtxo(2, 20_000_000)];

// OfflineEvaluator runs the Plutus scripts locally through the CEK machine.
// If the Group validator rejects the transaction, buildGroupMintTransaction throws.
const mockFetcher = {
  fetchUTxOs: async (txHash) => walletUtxos.filter(u => u.input.txHash === txHash),
};
const offlineEvaluator = new OfflineEvaluator(mockFetcher, 'preprod');

const mockProvider = {
  fetchCostModels: async () => [],
  fetchUTxOs:      mockFetcher.fetchUTxOs,
  evaluateTx:      offlineEvaluator.evaluateTx.bind(offlineEvaluator),
};

// Derive expected policy ID and script address from the parameterised validator
const oref        = createOutputReference(MOCK_TX_HASH, 0);
const clothedCbor = await applyOrefParamToScript(VALIDATORS.group.mint, oref);
const policyId    = resolveScriptHash(clothedCbor, 'V3');
const scriptAddr  = resolvePlutusScriptAddress({ code: clothedCbor, version: 'V3' }, 0);
const assetName   = textToHex('zkvapp-group');

const mintValue = [
  { unit: 'lovelace',           quantity: '5000000' },
  { unit: policyId + assetName, quantity: '1'       },
];

// Build base params — reused across tests
const baseParams = {
  provider:       mockProvider,
  policyId,
  assetName,
  clothedCbor,
  createRedeemer: conStr(0, []),
  selectedUtxo,
  walletUtxos,
  walletAddress:  WALLET_ADDRESS,
  scriptAddr,
  mintValue,
  groupDatum:     createGroupDatum(0n, PAYMENT_KEY_HASH),
  paymentKeyHash: PAYMENT_KEY_HASH,
  collateralUtxo,
};

// Build once for the happy-path assertions
const txHex = await buildGroupMintTransaction(baseParams);

const serializer = new CSLSerializer();
const parser     = new TxParser(serializer, null);
await parseSilently(parser, txHex, walletUtxos);
const tester = parser.toTester();

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nbuildGroupMintTransaction — Plutus evaluation + transaction structure\n');

await test('Group validator accepts the transaction (Plutus CEK machine passes)', async () => {
  const exUnits = await offlineEvaluator.evaluateTx(txHex, walletUtxos, []);
  assert.ok(Array.isArray(exUnits) && exUnits.length > 0, 'Expected evaluator to return execution units');
});

await test('mints exactly 1 Group NFT under the parameterised policy', () => {
  tester.tokenMinted(policyId, assetName, 1);
  assert.ok(tester.success(), tester.errors());
});

await test('sends the Group NFT output to the group script address', () => {
  tester.outputsAt(scriptAddr);
  assert.ok(tester.success(), tester.errors());
});

await test('requires the admin payment key hash as a signer', () => {
  tester.keySigned(PAYMENT_KEY_HASH);
  assert.ok(tester.success(), tester.errors());
});

await test('Group validator rejects a transaction that sends the NFT to the wrong address', async () => {
  // buildGroupMintTransaction has a catch block that extracts tx hex from evaluation
  // errors (browser safety net) — so it won't throw even when the script rejects.
  // Instead we build the invalid tx and then directly evaluate it to confirm the
  // CEK machine does reject it.
  const wrongAddr = serializeAddress({ pubKeyHash: '0'.repeat(56) }, 0);
  const invalidTxHex = await buildGroupMintTransaction({ ...baseParams, scriptAddr: wrongAddr });

  let threw = false;
  try {
    await offlineEvaluator.evaluateTx(invalidTxHex, walletUtxos, []);
  } catch {
    threw = true;
  }
  assert.ok(threw, 'Expected OfflineEvaluator to reject the wrong-address transaction');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
