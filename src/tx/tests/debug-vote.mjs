/**
 * Debug script: build vote tx with dummy proof and inspect the evaluator error in detail.
 * Run with: node --experimental-wasm-modules tests/debug-vote.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { CSLSerializer, serializeAddress, OfflineEvaluator, toPlutusData } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress } = require('@meshsdk/core');

import { encodeVoteSignal } from '../../zk/dist/signal.js';

import {
  buildVoteTransaction,
  VALIDATORS,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
  textToHex,
  createOutputReference,
  applyOrefParamToScript,
} from '../dist/browser/index.js';

// ── Same constants as vote-cek.test.mjs ──────────────────────────────────────

const PAYMENT_KEY_HASH    = 'b2ee7af5a0c440cab2112c643a1b37b5a11e6bc6ef7b6edac5276b29';
const WALLET_ADDRESS      = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 0);
const WALLET_TX_HASH      = 'a'.repeat(64);
const SCRIPT_UTxO_TX_HASH = 'c'.repeat(64);
const SV_MINT_TX_HASH     = 'b'.repeat(64);
const GROUP_POLICY_ID     = 'e'.repeat(56);
const CURRENT_SLOT        = 115_000_000;
const EVENT_START         = 1_770_000_000_000;
const EVENT_END           = 1_790_000_000_000;

const makeWalletUtxo = (idx, lovelace) => ({
  input:  { txHash: WALLET_TX_HASH, outputIndex: idx },
  output: { address: WALLET_ADDRESS, amount: [{ unit: 'lovelace', quantity: String(lovelace) }] },
});
const walletUtxos    = [makeWalletUtxo(0, 10_000_000), makeWalletUtxo(1, 20_000_000)];
const collateralUtxo = makeWalletUtxo(2, 5_000_000);

const svOref              = createOutputReference(SV_MINT_TX_HASH, 0);
const semaphoreClothed    = await applyOrefParamToScript(VALIDATORS.semaphore.mint, svOref);
const semaphorePolicyId   = resolveScriptHash(semaphoreClothed, 'V3');
const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreClothed, version: 'V3' }, 0);
const semaphoreAssetName  = textToHex('Semaphore1');

const votingClothed    = await applyOrefParamToScript(VALIDATORS.voting.mint, svOref);
const votingPolicyId   = resolveScriptHash(votingClothed, 'V3');
const votingScriptAddr = resolvePlutusScriptAddress({ code: votingClothed, version: 'V3' }, 0);
const votingAssetName  = textToHex('VotingEvent1');

console.log('semaphorePolicyId:', semaphorePolicyId);
console.log('votingPolicyId:   ', votingPolicyId);
console.log('semaphoreScriptAddr:', semaphoreScriptAddr);
console.log('votingScriptAddr:   ', votingScriptAddr);

// ── Build datums ──────────────────────────────────────────────────────────────

// OutputReference in Conway/Plutus V3 Aiken stdlib: transaction_id = ByteArray (no wrapper)
// Constr(0, [bytes(tx_hash), int(output_index)]) — matches createOutputReference in utils-browser.ts
const semaphoreDatumCbor = toPlutusData({
  alternative: 0,
  fields: [
    GROUP_POLICY_ID,
    0n,           // groupMerkleRoot = 0 (dummy)
    '0'.repeat(64),
    { alternative: 0, fields: [VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX] },
  ],
}).to_hex();

const urnaDatumCbor = toPlutusData({
  alternative: 0,
  fields: [1, [[0, 0], [1, 0]], [EVENT_START, EVENT_END], semaphorePolicyId],
}).to_hex();

// Dummy VKey datum (minimal)
const vkeyDatumCbor = toPlutusData({
  alternative: 0,
  fields: [4, '00'.repeat(48), '00'.repeat(96), '00'.repeat(96), '00'.repeat(96), [], ['00'.repeat(48), '00'.repeat(48), '00'.repeat(48), '00'.repeat(48), '00'.repeat(48)]],
}).to_hex();

console.log('\nurnaDatumCbor:      ', urnaDatumCbor);
console.log('semaphoreDatumCbor: ', semaphoreDatumCbor);

// ── Mock UTxOs ────────────────────────────────────────────────────────────────

const semaphoreUtxo = {
  input:  { txHash: SCRIPT_UTxO_TX_HASH, outputIndex: 0 },
  output: {
    address:    semaphoreScriptAddr,
    amount:     [
      { unit: 'lovelace',                             quantity: '5000000' },
      { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1'       },
    ],
    plutusData: semaphoreDatumCbor,
  },
};

const votingUtxo = {
  input:  { txHash: SCRIPT_UTxO_TX_HASH, outputIndex: 1 },
  output: {
    address:    votingScriptAddr,
    amount:     [
      { unit: 'lovelace',                         quantity: '5000000' },
      { unit: votingPolicyId + votingAssetName,   quantity: '1'       },
    ],
    plutusData: urnaDatumCbor,
  },
};

const vkeyUtxo = {
  input:  { txHash: VKEY_REF_TX_HASH, outputIndex: VKEY_REF_OUTPUT_INDEX },
  output: {
    address:    WALLET_ADDRESS,
    amount:     [{ unit: 'lovelace', quantity: '5000000' }],
    plutusData: vkeyDatumCbor,
  },
};

const allUtxos = [...walletUtxos, collateralUtxo, semaphoreUtxo, votingUtxo, vkeyUtxo];

const mockFetcher = {
  fetchUTxOs: async (txHash) => allUtxos.filter(u => u.input.txHash === txHash),
};
const offlineEvaluator = new OfflineEvaluator(mockFetcher, 'preprod');

const mockProvider = {
  fetchCostModels:   async () => [],
  fetchLatestBlock:  async () => ({ slot: String(CURRENT_SLOT) }),
  fetchAddressUTxOs: async (address) => {
    if (address === semaphoreScriptAddr) return [semaphoreUtxo];
    if (address === votingScriptAddr)    return [votingUtxo];
    return [];
  },
  fetchUTxOs: mockFetcher.fetchUTxOs,
};

// ── Dummy proof (not valid ZK — just for structure testing) ───────────────────

const signal = encodeVoteSignal([[0, 1]]);
console.log('\nsignal:', signal);

const txHex = await buildVoteTransaction({
  provider:               mockProvider,
  semaphoreScriptAddress: semaphoreScriptAddr,
  votingScriptAddress:    votingScriptAddr,
  semaphoreNftPolicyId:   semaphorePolicyId,
  votingNftPolicyId:      votingPolicyId,
  groupNftPolicyId:       GROUP_POLICY_ID,
  groupMerkleRoot:        0n,
  semaphoreValidatorCbor: semaphoreClothed,
  votingValidatorCbor:    votingClothed,
  walletUtxos,
  walletAddress:          WALLET_ADDRESS,
  paymentKeyHash:         PAYMENT_KEY_HASH,
  zkProof: { pi_a: '00'.repeat(48), pi_b: '00'.repeat(96), pi_c: '00'.repeat(48) },
  nullifierHash:          0n,
  signalHash:             0n,
  signalMessage:          signal,
  mpfProofSteps:          [],
  mpfNewRoot:             '0'.repeat(64),
  voteSignal:             [[0, 1]],
  weight:                 1,
  eventStart:             EVENT_START,
  eventEnd:               EVENT_END,
  collateralUtxo,
});

console.log('\ntxHex (first 200 chars):', txHex.substring(0, 200));

// ── Evaluate — we expect this to FAIL (bad ZK proof) but let's see the error ─

try {
  const exUnits = await offlineEvaluator.evaluateTx(txHex, allUtxos, []);
  console.log('\nEvaluation SUCCESS:', JSON.stringify(exUnits, null, 2));
} catch (err) {
  console.log('\nEvaluation FAILED:', err.message);

  // Parse and pretty-print the failures
  try {
    const failures = JSON.parse(err.message);
    for (const f of failures) {
      console.log(`  index=${f.index} tag=${f.tag} budget=${JSON.stringify(f.budget)} error="${f.errorMessage}"`);
    }
  } catch (_) {
    // not JSON
  }
}
