/**
 * buildVoteTransaction — transaction structure tests
 *
 * Unlike the mint tests, this file does NOT run CEK machine evaluation:
 * the vote transaction requires a valid Groth16 ZK proof, which cannot be
 * synthesised here without running the full ZK circuit. Structure tests
 * via TxParser/TxTester are sufficient to verify the builder wires inputs,
 * outputs, scripts, and signers correctly.
 *
 * Run with: node --experimental-wasm-modules tests/vote.test.mjs
 */

import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { TxParser }                          = require('@meshsdk/transaction');
const { CSLSerializer, serializeAddress, toPlutusData, csl } = require('@meshsdk/core-csl');
const { resolveScriptHash, resolvePlutusScriptAddress } = require('@meshsdk/core');

import {
  buildVoteTransaction,
  VALIDATORS,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
  posixMsToSlot,
  textToHex,
  createOutputReference,
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

const PAYMENT_KEY_HASH  = 'b2ee7af5a0c440cab2112c643a1b37b5a11e6bc6ef7b6edac5276b29';
const WALLET_ADDRESS    = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 0);
const WALLET_TX_HASH    = 'a'.repeat(64);
// Tx hash of the mint-sv transaction — the script UTxOs live here.
const SCRIPT_UTxO_TX_HASH = 'c'.repeat(64);
// Oref that was consumed when the SV NFTs were minted.
const SV_MINT_TX_HASH   = 'b'.repeat(64);

const makeWalletUtxo = (idx, lovelace) => ({
  input:  { txHash: WALLET_TX_HASH, outputIndex: idx },
  output: { amount: [{ unit: 'lovelace', quantity: String(lovelace) }], address: WALLET_ADDRESS },
});

const walletUtxos    = [makeWalletUtxo(0, 10_000_000), makeWalletUtxo(1, 20_000_000)];
const collateralUtxo = makeWalletUtxo(2, 5_000_000);

// ── Script addresses (same scripts as mint-sv, different oref) ────────────────

const svOref              = createOutputReference(SV_MINT_TX_HASH, 0);
const semaphoreClothed    = await applyOrefParamToScript(VALIDATORS.semaphore.mint, svOref);
const semaphorePolicyId   = resolveScriptHash(semaphoreClothed, 'V3');
const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreClothed, version: 'V3' }, 0);
const semaphoreAssetName  = textToHex('Semaphore1');

const votingClothed    = await applyOrefParamToScript(VALIDATORS.voting.mint, svOref);
const votingPolicyId   = resolveScriptHash(votingClothed, 'V3');
const votingScriptAddr = resolvePlutusScriptAddress({ code: votingClothed, version: 'V3' }, 0);
const votingAssetName  = textToHex('VotingEvent1');

// ── Script UTxOs (the previously minted Semaphore + Voting NFTs on-chain) ─────

// SemaphoreDatum = Constr 0 [group_policy_id, group_merke_root, nullifier_mpf_root, vkey_ref_input]
// The builder reads group_merke_root from this datum (the DB value can lag behind the chain).
const GROUP_POLICY_ID = 'e'.repeat(56);
const semaphoreDatumCbor = toPlutusData({
  alternative: 0,
  fields: [GROUP_POLICY_ID, 0, '0'.repeat(64), { alternative: 0, fields: [VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX] }],
}).to_hex();

const semaphoreUtxo = {
  input:  { txHash: SCRIPT_UTxO_TX_HASH, outputIndex: 0 },
  output: {
    address: semaphoreScriptAddr,
    amount:  [
      { unit: 'lovelace',                             quantity: '5000000' },
      { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1'       },
    ],
    plutusData: semaphoreDatumCbor,
  },
};

const votingUtxo = {
  input:  { txHash: SCRIPT_UTxO_TX_HASH, outputIndex: 1 },
  output: {
    address: votingScriptAddr,
    amount:  [
      { unit: 'lovelace',                         quantity: '5000000' },
      { unit: votingPolicyId + votingAssetName,   quantity: '1'       },
    ],
    // No plutusData: buildVoteTransaction falls back to voteSignal.map([idx]=>[idx,0])
  },
};

// ── Provider ──────────────────────────────────────────────────────────────────

// Preprod: genesis Unix 1655769600s, Shelley offset 86400 slots.
// currentSlot 115_000_000 → eventStart 114_316_800 (already started) → eventEnd 134_316_800 (not yet ended).
const CURRENT_SLOT = 115_000_000;

const mockProvider = {
  fetchCostModels:    async () => [],
  fetchLatestBlock:   async () => ({ slot: String(CURRENT_SLOT) }),
  fetchAddressUTxOs:  async (address) => {
    if (address === semaphoreScriptAddr) return [semaphoreUtxo];
    if (address === votingScriptAddr)    return [votingUtxo];
    return [];
  },
  fetchUTxOs: async (txHash) => {
    // Provide a stub for the VKey reference input so TxParser can resolve it.
    if (txHash === VKEY_REF_TX_HASH) return [{
      input:  { txHash: VKEY_REF_TX_HASH, outputIndex: 0 },
      output: { address: WALLET_ADDRESS, amount: [{ unit: 'lovelace', quantity: '2000000' }] },
    }];
    return [...walletUtxos, collateralUtxo, semaphoreUtxo, votingUtxo]
      .filter(u => u.input.txHash === txHash);
  },
};

// ── Vote parameters ───────────────────────────────────────────────────────────

// Dummy ZK proof — structurally correct byte lengths, not a valid Groth16 proof.
// CEK evaluation is skipped; these values satisfy the builder but would fail on-chain.
const zkProof = {
  pi_a: '00'.repeat(48),   // 96 hex chars — G1 compressed point
  pi_b: '00'.repeat(96),   // 192 hex chars — G2 compressed point
  pi_c: '00'.repeat(48),   // 96 hex chars — G1 compressed point
};

// voteSignal drives the currentOptions fallback when votingUtxo has no plutusData.
// Weight 1: exactly 1 vote for option 0.
const voteSignal = [[0, 1], [1, 0]];

// event times: eventStartSlot = 114_316_800 < CURRENT_SLOT < eventEndSlot = 134_316_800
const eventStart = 1_770_000_000_000; // POSIX ms ≈ 2026-01
const eventEnd   = 1_790_000_000_000; // POSIX ms ≈ 2026-09

const baseParams = {
  provider:             mockProvider,
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
  zkProof,
  nullifierHash:          12345678901234567890n,
  signalHash:             98765432109876543210n,
  signalMessage:          'deadbeef',
  mpfProofSteps:          [],
  mpfNewRoot:             '0'.repeat(64),
  voteSignal,
  weight:                 1,
  eventStart,
  eventEnd,
  collateralUtxo,
};

// Build once for structural assertions
const txHex    = await buildVoteTransaction(baseParams);
const allUtxos = [...walletUtxos, collateralUtxo, semaphoreUtxo, votingUtxo];

const serializer = new CSLSerializer();
const parser     = new TxParser(serializer, mockProvider);
await parseSilently(parser, txHex, allUtxos);
const tester = parser.toTester();

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nbuildVoteTransaction — transaction structure\n');

await test('transaction builds without error given valid mock inputs', () => {
  assert.ok(typeof txHex === 'string' && txHex.length > 0);
});

await test('sends the Semaphore NFT back to the Semaphore script address', () => {
  tester.outputsAt(semaphoreScriptAddr);
  assert.ok(tester.success(), tester.errors());
});

await test('sends the Voting NFT back to the Voting script address', () => {
  tester.outputsAt(votingScriptAddr);
  assert.ok(tester.success(), tester.errors());
});

await test('requires the admin payment key hash as a signer', () => {
  tester.keySigned(PAYMENT_KEY_HASH);
  assert.ok(tester.success(), tester.errors());
});

await test('throws when Semaphore UTxO is not found at the script address', async () => {
  const badProvider = {
    ...mockProvider,
    fetchAddressUTxOs: async () => [],
  };
  let threw = false;
  try {
    await buildVoteTransaction({ ...baseParams, provider: badProvider });
  } catch (e) {
    threw = true;
    assert.ok(
      e.message.includes('Semaphore UTxO not found'),
      `Expected "Semaphore UTxO not found", got: ${e.message}`,
    );
  }
  assert.ok(threw, 'Expected buildVoteTransaction to throw');
});

await test('throws when Voting UTxO is not found at the script address', async () => {
  const badProvider = {
    ...mockProvider,
    fetchAddressUTxOs: async (address) => {
      if (address === semaphoreScriptAddr) return [semaphoreUtxo];
      return [];
    },
  };
  let threw = false;
  try {
    await buildVoteTransaction({ ...baseParams, provider: badProvider });
  } catch (e) {
    threw = true;
    assert.ok(
      e.message.includes('Voting UTxO not found'),
      `Expected "Voting UTxO not found", got: ${e.message}`,
    );
  }
  assert.ok(threw, 'Expected buildVoteTransaction to throw');
});

// ── Network parameter ─────────────────────────────────────────────────────────

const txBody = (hex) => csl.Transaction.from_hex(hex).body();

await test('defaults to preprod: validity start = preprod slot of eventStart + 1, VKey ref = preprod UTxO', () => {
  const body = txBody(txHex);
  assert.strictEqual(body.validity_start_interval_bignum().to_str(), String(posixMsToSlot('preprod', eventStart) + 1));
  const refs = body.reference_inputs();
  assert.strictEqual(refs.len(), 1);
  assert.strictEqual(refs.get(0).transaction_id().to_hex(), VKEY_REF_TX_HASH);
});

await test('network "mainnet" uses the mainnet slot config and the given VKey ref', async () => {
  const MAINNET_VKEY = { txHash: 'd'.repeat(64), outputIndex: 1 };
  // Mainnet addresses for the same scripts: network tag 1.
  const semaphoreAddrMainnet = resolvePlutusScriptAddress({ code: semaphoreClothed, version: 'V3' }, 1);
  const votingAddrMainnet    = resolvePlutusScriptAddress({ code: votingClothed, version: 'V3' }, 1);
  const walletAddrMainnet    = serializeAddress({ pubKeyHash: PAYMENT_KEY_HASH }, 1);
  const sem = { ...semaphoreUtxo, output: { ...semaphoreUtxo.output, address: semaphoreAddrMainnet } };
  const vot = { ...votingUtxo,    output: { ...votingUtxo.output,    address: votingAddrMainnet } };
  const wal = walletUtxos.map(u => ({ ...u, output: { ...u.output, address: walletAddrMainnet } }));
  const col = { ...collateralUtxo, output: { ...collateralUtxo.output, address: walletAddrMainnet } };
  const currentSlotMainnet = posixMsToSlot('mainnet', eventStart) + 1000;
  const providerMainnet = {
    ...mockProvider,
    fetchLatestBlock: async () => ({ slot: String(currentSlotMainnet) }),
    fetchAddressUTxOs: async (address) => {
      if (address === semaphoreAddrMainnet) return [sem];
      if (address === votingAddrMainnet)    return [vot];
      return [];
    },
    fetchUTxOs: async (txHash) => {
      if (txHash === MAINNET_VKEY.txHash) return [{
        input: { txHash: MAINNET_VKEY.txHash, outputIndex: MAINNET_VKEY.outputIndex },
        output: { address: walletAddrMainnet, amount: [{ unit: 'lovelace', quantity: '2000000' }] },
      }];
      return [...wal, col, sem, vot].filter(u => u.input.txHash === txHash);
    },
  };
  const hex = await buildVoteTransaction({
    ...baseParams,
    network: 'mainnet',
    vkeyRef: MAINNET_VKEY,
    provider: providerMainnet,
    semaphoreScriptAddress: semaphoreAddrMainnet,
    votingScriptAddress: votingAddrMainnet,
    walletUtxos: wal,
    walletAddress: walletAddrMainnet,
    collateralUtxo: col,
  });
  const body = txBody(hex);
  assert.strictEqual(body.validity_start_interval_bignum().to_str(), String(posixMsToSlot('mainnet', eventStart) + 1));
  assert.strictEqual(body.ttl_bignum().to_str(), String(Math.min(currentSlotMainnet + 1200, posixMsToSlot('mainnet', eventEnd))));
  const refs = body.reference_inputs();
  assert.strictEqual(refs.len(), 1);
  assert.strictEqual(refs.get(0).transaction_id().to_hex(), MAINNET_VKEY.txHash);
  assert.strictEqual(Number(refs.get(0).index()), MAINNET_VKEY.outputIndex);
  // Change goes to the mainnet wallet address (network tag 1).
  const outs = body.outputs();
  const addrs = [];
  for (let i = 0; i < outs.len(); i++) addrs.push(outs.get(i).address().to_bech32());
  assert.ok(addrs.includes(walletAddrMainnet), 'change output at the mainnet wallet address');
  assert.ok(addrs.every(a => a.startsWith('addr1')), `all outputs are mainnet addresses: ${addrs}`);
});

await test('network "mainnet" without a VKey ref fails clearly (not deployed yet)', async () => {
  let threw = false;
  try {
    await buildVoteTransaction({ ...baseParams, network: 'mainnet' });
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('VKey reference UTxO for mainnet'), e.message);
  }
  assert.ok(threw);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
