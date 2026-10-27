/**
 * Raw CBOR inspection of the vote transaction to verify output datum encoding.
 * Uses the cbor package to decode transaction hex and print output datum fields.
 *
 * Conway-era transaction output format (map style):
 *   { 0: addr_bytes, 1: value, 2: datum_option, 3: script_ref }
 * datum_option:
 *   [0, datum_hash_bytes]      = hash-style (not inline)
 *   [1, plutus_data_cbor_tag3] = inline datum (encoded-cbor tag 24)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const cbor = require('cbor');
const { serializeAddress, toPlutusData } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress } = require('@meshsdk/core');

import { encodeVoteSignal } from '../../zk/dist/signal.js';
import {
  buildVoteTransaction, VALIDATORS, VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX,
  textToHex, createOutputReference, applyOrefParamToScript,
} from '../dist/browser/index.js';

const PAYMENT_KEY_HASH = 'b2ee7af5a0c440cab2112c643a1b37b5a11e6bc6ef7b6edac5276b29';
const WALLET_ADDRESS   = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 0);
const WALLET_TX_HASH   = 'a'.repeat(64);
const SCRIPT_TX_HASH   = 'c'.repeat(64);
const SV_MINT_TX_HASH  = 'b'.repeat(64);
const GROUP_POLICY_ID  = 'e'.repeat(56);
const CURRENT_SLOT     = 115_000_000;
const EVENT_START      = 1_770_000_000_000;
const EVENT_END        = 1_790_000_000_000;

const makeWalletUtxo = (idx, lv) => ({
  input:  { txHash: WALLET_TX_HASH, outputIndex: idx },
  output: { address: WALLET_ADDRESS, amount: [{ unit: 'lovelace', quantity: String(lv) }] },
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
  fields: [GROUP_POLICY_ID, 0n, '0'.repeat(64), { alternative: 0, fields: [VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX] }],
}).to_hex();
const urnaDatumCbor = toPlutusData({
  alternative: 0,
  fields: [1, [[0, 0], [1, 0]], [EVENT_START, EVENT_END], semaphorePolicyId],
}).to_hex();
const vkeyDatumCbor = toPlutusData({
  alternative: 0,
  fields: [4, '00'.repeat(48), '00'.repeat(96), '00'.repeat(96), '00'.repeat(96), [], Array(5).fill('00'.repeat(48))],
}).to_hex();

const semaphoreUtxo = { input: { txHash: SCRIPT_TX_HASH, outputIndex: 0 }, output: { address: semaphoreScriptAddr, amount: [{ unit: 'lovelace', quantity: '5000000' }, { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1' }], plutusData: semaphoreDatumCbor } };
const votingUtxo    = { input: { txHash: SCRIPT_TX_HASH, outputIndex: 1 }, output: { address: votingScriptAddr,    amount: [{ unit: 'lovelace', quantity: '5000000' }, { unit: votingPolicyId    + votingAssetName,    quantity: '1' }], plutusData: urnaDatumCbor    } };
const vkeyUtxo      = { input: { txHash: VKEY_REF_TX_HASH, outputIndex: VKEY_REF_OUTPUT_INDEX }, output: { address: WALLET_ADDRESS, amount: [{ unit: 'lovelace', quantity: '5000000' }], plutusData: vkeyDatumCbor } };
const allUtxos = [...walletUtxos, collateralUtxo, semaphoreUtxo, votingUtxo, vkeyUtxo];

const mockProvider = {
  fetchCostModels:   async () => [],
  fetchLatestBlock:  async () => ({ slot: String(CURRENT_SLOT) }),
  fetchAddressUTxOs: async (addr) => addr === semaphoreScriptAddr ? [semaphoreUtxo] : addr === votingScriptAddr ? [votingUtxo] : [],
  fetchUTxOs: async (txHash) => allUtxos.filter(u => u.input.txHash === txHash),
};

const signal = encodeVoteSignal([[0, 1]]);
const txHex = await buildVoteTransaction({
  provider: mockProvider,
  semaphoreScriptAddress: semaphoreScriptAddr, votingScriptAddress: votingScriptAddr,
  semaphoreNftPolicyId: semaphorePolicyId, votingNftPolicyId: votingPolicyId,
  groupNftPolicyId: GROUP_POLICY_ID, groupMerkleRoot: 0n,
  semaphoreValidatorCbor: semaphoreClothed, votingValidatorCbor: votingClothed,
  walletUtxos, walletAddress: WALLET_ADDRESS, paymentKeyHash: PAYMENT_KEY_HASH,
  zkProof: { pi_a: '00'.repeat(48), pi_b: '00'.repeat(96), pi_c: '00'.repeat(48) },
  nullifierHash: 0n, signalHash: 0n, signalMessage: signal,
  mpfProofSteps: [], mpfNewRoot: '0'.repeat(64),
  voteSignal: [[0, 1]], weight: 1, eventStart: EVENT_START, eventEnd: EVENT_END, collateralUtxo,
});

console.log('txHex length:', txHex.length / 2, 'bytes\n');

// ── Decode raw CBOR ───────────────────────────────────────────────────────────
const txBuf = Buffer.from(txHex, 'hex');
const decoded = cbor.decodeFirstSync(txBuf);

// decoded = [transaction_body_map, witness_set_map, is_valid, aux_data]
const txBody = decoded[0];

console.log('Transaction body keys:', [...txBody.keys()].join(', '));

// Key 1 = outputs
const outputs = txBody.get(1);
console.log(`\nOutputs (${outputs.length}):`);

for (let i = 0; i < outputs.length; i++) {
  const out = outputs[i];
  console.log(`\n  Output [${i}]:`);

  if (out instanceof Map) {
    // Conway map-style output
    const addr = out.get(0);
    const value = out.get(1);
    const datumOption = out.get(2);

    console.log(`    format: MAP (Conway era)`);
    console.log(`    addr bytes: ${Buffer.isBuffer(addr) ? addr.toString('hex').substring(0, 40) + '...' : addr}`);

    if (datumOption === undefined || datumOption === null) {
      console.log(`    datum_option: NONE (no datum!)`);
    } else if (Array.isArray(datumOption)) {
      const [tag, payload] = datumOption;
      if (tag === 0) {
        console.log(`    datum_option: [0, hash] = HASH-STYLE datum (NOT inline!)`);
        console.log(`    datum_hash: ${Buffer.isBuffer(payload) ? payload.toString('hex') : payload}`);
      } else if (tag === 1) {
        // Inline datum — payload is a CBOR tag 24 (encoded-cbor)
        console.log(`    datum_option: [1, encoded_cbor] = INLINE datum ✓`);
        if (payload && payload.tag === 24) {
          // CBOR tag 24 wraps the datum bytes
          const datumBytes = payload.value;
          console.log(`    inline datum bytes: ${datumBytes.toString('hex').substring(0, 80)}...`);
        } else {
          console.log(`    inline datum payload: ${JSON.stringify(payload)}`);
        }
      } else {
        console.log(`    datum_option: unknown tag ${tag}`);
      }
    } else {
      console.log(`    datum_option (unknown format): ${JSON.stringify(datumOption)}`);
    }
  } else if (Array.isArray(out)) {
    // Pre-Babbage array-style output
    const [addr, value, datumHash] = out;
    console.log(`    format: ARRAY (pre-Babbage)`);
    console.log(`    datum_hash: ${datumHash ? Buffer.from(datumHash).toString('hex') : 'none'}`);
  } else {
    console.log(`    format: UNKNOWN`);
    console.log(`    raw: ${JSON.stringify(out)}`);
  }
}

// Also check redeemers (witness set key 5 in Conway? or key 0/1?)
const witnessSet = decoded[1];
console.log('\nWitness set keys:', witnessSet instanceof Map ? [...witnessSet.keys()].join(', ') : 'not a map');
