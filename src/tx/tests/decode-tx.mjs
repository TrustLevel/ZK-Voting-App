/**
 * Decode the vote transaction CBOR and print its structure.
 * Run with: node --experimental-wasm-modules tests/decode-tx.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { csl, serializeAddress, toPlutusData } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress } = require('@meshsdk/core');

import { encodeVoteSignal } from '../../zk/dist/signal.js';
import {
  buildVoteTransaction, VALIDATORS, VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX,
  textToHex, createOutputReference, applyOrefParamToScript,
} from '../dist/browser/index.js';

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

const semaphoreDatumCbor = toPlutusData({
  alternative: 0,
  fields: [GROUP_POLICY_ID, 0n, '0'.repeat(64), { alternative: 0, fields: [{ alternative: 0, fields: [VKEY_REF_TX_HASH] }, VKEY_REF_OUTPUT_INDEX] }],
}).to_hex();

const urnaDatumCbor = toPlutusData({
  alternative: 0,
  fields: [1, [[0, 0], [1, 0]], [EVENT_START, EVENT_END], semaphorePolicyId],
}).to_hex();

const vkeyDatumCbor = toPlutusData({
  alternative: 0,
  fields: [4, '00'.repeat(48), '00'.repeat(96), '00'.repeat(96), '00'.repeat(96), [], Array(5).fill('00'.repeat(48))],
}).to_hex();

const semaphoreUtxo = {
  input:  { txHash: SCRIPT_UTxO_TX_HASH, outputIndex: 0 },
  output: { address: semaphoreScriptAddr, amount: [{ unit: 'lovelace', quantity: '5000000' }, { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1' }], plutusData: semaphoreDatumCbor },
};
const votingUtxo = {
  input:  { txHash: SCRIPT_UTxO_TX_HASH, outputIndex: 1 },
  output: { address: votingScriptAddr, amount: [{ unit: 'lovelace', quantity: '5000000' }, { unit: votingPolicyId + votingAssetName, quantity: '1' }], plutusData: urnaDatumCbor },
};
const vkeyUtxo = {
  input:  { txHash: VKEY_REF_TX_HASH, outputIndex: VKEY_REF_OUTPUT_INDEX },
  output: { address: WALLET_ADDRESS, amount: [{ unit: 'lovelace', quantity: '5000000' }], plutusData: vkeyDatumCbor },
};

const allUtxos = [...walletUtxos, collateralUtxo, semaphoreUtxo, votingUtxo, vkeyUtxo];

const mockProvider = {
  fetchCostModels:   async () => [],
  fetchLatestBlock:  async () => ({ slot: String(CURRENT_SLOT) }),
  fetchAddressUTxOs: async (address) => {
    if (address === semaphoreScriptAddr) return [semaphoreUtxo];
    if (address === votingScriptAddr)    return [votingUtxo];
    return [];
  },
  fetchUTxOs: async (txHash) => allUtxos.filter(u => u.input.txHash === txHash),
};

const signal = encodeVoteSignal([[0, 1]]);

const txHex = await buildVoteTransaction({
  provider: mockProvider,
  semaphoreScriptAddress: semaphoreScriptAddr,
  votingScriptAddress: votingScriptAddr,
  semaphoreNftPolicyId: semaphorePolicyId,
  votingNftPolicyId: votingPolicyId,
  groupNftPolicyId: GROUP_POLICY_ID,
  groupMerkleRoot: 0n,
  semaphoreValidatorCbor: semaphoreClothed,
  votingValidatorCbor: votingClothed,
  walletUtxos, walletAddress: WALLET_ADDRESS, paymentKeyHash: PAYMENT_KEY_HASH,
  zkProof: { pi_a: '00'.repeat(48), pi_b: '00'.repeat(96), pi_c: '00'.repeat(48) },
  nullifierHash: 0n, signalHash: 0n, signalMessage: signal,
  mpfProofSteps: [], mpfNewRoot: '0'.repeat(64),
  voteSignal: [[0, 1]], weight: 1, eventStart: EVENT_START, eventEnd: EVENT_END,
  collateralUtxo,
});

// Decode with CSL
const tx = csl.Transaction.from_hex(txHex);
const body = tx.body();

// Inputs
const inputs = body.inputs();
console.log(`\n=== INPUTS (${inputs.len()}) ===`);
for (let i = 0; i < inputs.len(); i++) {
  const inp = inputs.get(i);
  console.log(`  [${i}] ${inp.transaction_id().to_hex()}#${inp.index()}`);
}

// Outputs
const outputs = body.outputs();
console.log(`\n=== OUTPUTS (${outputs.len()}) ===`);
for (let i = 0; i < outputs.len(); i++) {
  try {
    const out = outputs.get(i);
    const addr = out.address().to_bech32(undefined);
    console.log(`  [${i}] ${addr}`);
    try {
      const datum = out.datum();
      if (datum) {
        try {
          const inlineDatum = datum.as_inline_data();
          if (inlineDatum) console.log(`       inline_datum=${inlineDatum.to_hex().substring(0, 80)}...`);
        } catch (e) { console.log(`       datum error: ${e.message}`); }
      }
    } catch (e) { console.log(`       datum access error: ${e.message}`); }
  } catch (e) { console.log(`  [${i}] ERROR: ${e.message}`); }
}

// Redeemers
const witnesses = tx.witness_set();
const redeemers = witnesses.redeemers();
if (redeemers) {
  console.log(`\n=== REDEEMERS (${redeemers.len()}) ===`);
  for (let i = 0; i < redeemers.len(); i++) {
    const r = redeemers.get(i);
    // tag().kind(): 0=spend, 1=mint, 2=cert, 3=reward
    const tagKindNames = ['spend', 'mint', 'cert', 'reward'];
    const tagKind = r.tag().kind();
    console.log(`  [${i}] tag=${tagKindNames[tagKind]} index=${r.index().to_str()} data=${r.data().to_hex().substring(0, 40)}... exunits=(${r.ex_units()?.mem().to_str()},${r.ex_units()?.steps().to_str()})`);
  }
}

// Reference inputs
const refInputs = body.reference_inputs();
if (refInputs) {
  console.log(`\n=== REFERENCE INPUTS (${refInputs.len()}) ===`);
  for (let i = 0; i < refInputs.len(); i++) {
    const ri = refInputs.get(i);
    console.log(`  [${i}] ${ri.transaction_id().to_hex()}#${ri.index()}`);
  }
}

// Validity range
const validityStart = body.validity_start_interval();
const ttl = body.ttl();
console.log(`\n=== VALIDITY ===`);
console.log(`  invalidBefore (start slot): ${validityStart?.to_str()}`);
console.log(`  invalidHereafter (end slot): ${ttl?.to_str()}`);

// Plutus scripts in witness set
const plutusV3Scripts = witnesses.plutus_v3_scripts?.();
if (plutusV3Scripts) {
  console.log(`\n=== PLUTUS V3 SCRIPTS (${plutusV3Scripts.len()}) ===`);
  for (let i = 0; i < plutusV3Scripts.len(); i++) {
    const s = plutusV3Scripts.get(i);
    console.log(`  [${i}] hash=${s.hash().to_hex()}`);
  }
}

console.log(`\nNOTES:`);
console.log(`  semaphorePolicyId: ${semaphorePolicyId}`);
console.log(`  votingPolicyId:    ${votingPolicyId}`);
console.log(`  semaphoreScriptAddr: ${semaphoreScriptAddr}`);
console.log(`  votingScriptAddr:    ${votingScriptAddr}`);
console.log(`  VKEY_REF_TX_HASH:    ${VKEY_REF_TX_HASH}`);
