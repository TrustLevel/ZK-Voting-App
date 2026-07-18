/**
 * buildVoteTransaction — Plutus CEK machine evaluation with a real ZK proof
 *
 * Generates a genuine Groth16 proof, inserts the nullifier into the MPF trie,
 * constructs all on-chain datums, and verifies that both the Semaphore Signal
 * spend validator and the Voting spend validator accept the transaction through
 * the local Plutus CEK machine (OfflineEvaluator / whisky-evaluator WASM).
 *
 * This test is intentionally slow (~30s for ZK proof generation).
 *
 * Run with: node --experimental-wasm-modules tests/vote-cek.test.mjs
 */

import assert from 'assert';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { CSLSerializer, serializeAddress, OfflineEvaluator, toPlutusData } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress }                   = require('@meshsdk/core');

// ZK module — Node.js versions (filesystem access, not browser fetch)
import { generateVoteProof }       from '../../zk/dist/proof.js';
import { insertNullifier }         from '../../zk/dist/mpf.js';
import { compressedG1, compressedG2 } from '../../zk/dist/conversion.js';
import { encodeVoteSignal }        from '../../zk/dist/signal.js';

// Semaphore identity + group (BLS12-381 variant)
const { Identity, Group } = require('../../../node_modules/modp-semaphore-bls12381/packages/typescript/lib/index.js');

import {
  buildVoteTransaction,
  VALIDATORS,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
  textToHex,
  createOutputReference,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_KEY_HASH    = 'b2ee7af5a0c440cab2112c643a1b37b5a11e6bc6ef7b6edac5276b29';
const WALLET_ADDRESS      = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 0);
const WALLET_TX_HASH      = 'a'.repeat(64);
const SCRIPT_UTxO_TX_HASH = 'c'.repeat(64);
const SV_MINT_TX_HASH     = 'b'.repeat(64);
const GROUP_POLICY_ID     = 'e'.repeat(56);   // matches buildVoteTransaction groupNftPolicyId param
const CURRENT_SLOT        = 115_000_000;
const EVENT_START         = 1_770_000_000_000; // POSIX ms — eventStartSlot = 114_316_800
const EVENT_END           = 1_790_000_000_000; // POSIX ms — eventEndSlot   = 134_316_800
const TEST_MPF_EVENT_ID   = 777777;            // isolated trie; cleaned up after test

const makeWalletUtxo = (idx, lovelace) => ({
  input:  { txHash: WALLET_TX_HASH, outputIndex: idx },
  output: { address: WALLET_ADDRESS, amount: [{ unit: 'lovelace', quantity: String(lovelace) }] },
});
const walletUtxos    = [makeWalletUtxo(0, 10_000_000), makeWalletUtxo(1, 20_000_000)];
const collateralUtxo = makeWalletUtxo(2, 5_000_000);

// ── Script addresses ──────────────────────────────────────────────────────────

const svOref              = createOutputReference(SV_MINT_TX_HASH, 0);
const semaphoreClothed    = await applyOrefParamToScript(VALIDATORS.semaphore.mint, svOref);
const semaphorePolicyId   = resolveScriptHash(semaphoreClothed, 'V3');
const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreClothed, version: 'V3' }, 0);
const semaphoreAssetName  = textToHex('Semaphore1');

const votingClothed    = await applyOrefParamToScript(VALIDATORS.voting.mint, svOref);
const votingPolicyId   = resolveScriptHash(votingClothed, 'V3');
const votingScriptAddr = resolvePlutusScriptAddress({ code: votingClothed, version: 'V3' }, 0);
const votingAssetName  = textToHex('VotingEvent1');

// externalNullifier = script hash of the Semaphore validator (on-chain: Script(script_hash))
const externalNullifier = BigInt('0x' + semaphorePolicyId);

// ── VKey datum ────────────────────────────────────────────────────────────────
// Load the Groth16 verification key from the ZK module and compress its points
// into the on-chain SnarkVerificationKey format.

const vkeyPath = path.resolve(__dirname, '../../zk/keys/verification_key.json');
const vkey     = JSON.parse(readFileSync(vkeyPath, 'utf8'));

const [vkAlpha, vkBeta, vkGamma, vkDelta, ...vkICParts] = await Promise.all([
  compressedG1(vkey.vk_alpha_1),
  compressedG2(vkey.vk_beta_2),
  compressedG2(vkey.vk_gamma_2),
  compressedG2(vkey.vk_delta_2),
  ...vkey.IC.map(p => compressedG1(p)),
]);
const vkIC = vkICParts;

// SnarkVerificationKey datum in toPlutusData Mesh format:
// { nPublic, vkAlpha, vkBeta, vkGamma, vkDelta, vkAlphaBeta (empty), vkIC }
const vkeyDatumCbor = toPlutusData({
  alternative: 0,
  fields: [vkey.nPublic, vkAlpha, vkBeta, vkGamma, vkDelta, [], vkIC],
}).to_hex();

// ── Identity + group ──────────────────────────────────────────────────────────

const identity    = new Identity();
const group       = new Group(20);
group.addMember(identity.commitment);
const merkleProof = group.generateMerkleProof(0);
const groupMerkleRoot = BigInt(merkleProof.root);

// ── ZK proof ──────────────────────────────────────────────────────────────────

// vote for option 0 (simple vote, weight = 1)
const signal      = encodeVoteSignal([[0, 1]]);

console.log('\nvote-cek.test.mjs — generating ZK proof (this takes ~30s)...\n');

const { zkProof, nullifierHash, publicSignals } = await generateVoteProof({
  identityNullifier: identity.nullifier,
  identityTrapdoor:  identity.trapdoor,
  merkleProof,
  externalNullifier,
  signal,
});

// publicSignals: [root, nullifierHash, signalHash, externalNullifier]
const signalHash = BigInt(publicSignals[2]);

// ── MPF proof (first vote, empty trie) ───────────────────────────────────────

const { newRoot, proofSteps } = await insertNullifier(Buffer.alloc(32), nullifierHash, TEST_MPF_EVENT_ID);
const mpfNewRoot   = newRoot.toString('hex');
const mpfProofSteps = proofSteps;

// Cleanup the LevelDB trie written to disk during the test
await rm(path.resolve(__dirname, `../nullifiers-db/${TEST_MPF_EVENT_ID}`), { recursive: true, force: true }).catch(() => {});

// ── On-chain datums ───────────────────────────────────────────────────────────

// SemaphoreDatum: { group_token_policy, group_merke_root, nullifier_mpf_root, vkey_ref_input }
// OutputReference = Constr(0, [TransactionId Constr(0, [ByteArray]), Int])
// OutputReference in Conway/Plutus V3 Aiken stdlib: transaction_id = ByteArray (no wrapper)
// Constr(0, [bytes(tx_hash), int(output_index)]) — matches createOutputReference in utils-browser.ts
const semaphoreDatumCbor = toPlutusData({
  alternative: 0,
  fields: [
    GROUP_POLICY_ID,
    groupMerkleRoot,
    '0'.repeat(64),    // null_hash — initial empty MPF root
    { alternative: 0, fields: [VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX] },
  ],
}).to_hex();

// UrnaDatum: { weight, options, event_date, semaphore_nft }
// options: [[0, 0], [1, 0]] — two options, both at 0 votes initially
const urnaDatumCbor = toPlutusData({
  alternative: 0,
  fields: [
    1,                          // weight (simple voting)
    [[0, 0], [1, 0]],           // options
    [EVENT_START, EVENT_END],   // event_date
    semaphorePolicyId,          // semaphore_nft
  ],
}).to_hex();

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

// ── Provider + evaluator ──────────────────────────────────────────────────────

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

// ── Build vote transaction ────────────────────────────────────────────────────

const txHex = await buildVoteTransaction({
  provider:               mockProvider,
  semaphoreScriptAddress: semaphoreScriptAddr,
  votingScriptAddress:    votingScriptAddr,
  semaphoreNftPolicyId:   semaphorePolicyId,
  votingNftPolicyId:      votingPolicyId,
  groupNftPolicyId:       GROUP_POLICY_ID,
  groupMerkleRoot,
  semaphoreValidatorCbor: semaphoreClothed,
  votingValidatorCbor:    votingClothed,
  walletUtxos,
  walletAddress:          WALLET_ADDRESS,
  paymentKeyHash:         PAYMENT_KEY_HASH,
  zkProof,
  nullifierHash,
  signalHash,
  signalMessage:          signal,
  mpfProofSteps,
  mpfNewRoot,
  voteSignal:             [[0, 1]],
  weight:                 1,
  eventStart:             EVENT_START,
  eventEnd:               EVENT_END,
  collateralUtxo,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('buildVoteTransaction — Plutus CEK machine evaluation (real ZK + MPF proof)\n');

await test('Semaphore Signal + Voting spend validators accept the transaction (Plutus CEK machine passes)', async () => {
  const exUnits = await offlineEvaluator.evaluateTx(txHex, allUtxos, []);
  assert.ok(Array.isArray(exUnits) && exUnits.length > 0, 'Expected evaluator to return execution units');
  // Print actual units so we can compare against static values in the builder
  console.log(`     (exUnits: ${exUnits.map(u => `${u.tag}[${u.index}] mem=${u.budget.mem} steps=${u.budget.steps}`).join(', ')})`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
