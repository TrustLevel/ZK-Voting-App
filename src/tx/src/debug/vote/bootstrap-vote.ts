// Bootstrap script for a new voting event.
//
// PHASE 1 — Mint Group NFT
//   Run this first. Copy the printed tx hash into PHASE 2 below, then wait
//   for the transaction to confirm on-chain (~20-60s on preprod).
//
// PHASE 2 — Mint Semaphore + Voting NFTs
//   Uncomment and fill in groupNftTxHash + groupNftOutputIndex from Phase 1,
//   then run again. The semaphore validator uses the Group NFT as a
//   read-only reference input, so it must be on-chain before Phase 2.

import {
  BlockfrostProvider,
  PlutusScript,
  Asset,
  conStr,
  integer,
  byteString,
  resolveScriptHash,
  resolvePlutusScriptAddress,
} from '@meshsdk/core';
import { Identity } from 'modp-semaphore-bls12381/packages/typescript/lib/identity/index.js';
import { Group } from 'modp-semaphore-bls12381/packages/typescript/lib/group/index.js';
import { poseidon1, poseidon2 } from 'poseidon-bls12381';
import {
  createWallet,
  parseMnemonic,
  walletBaseAddress,
  extractPaymentKeyHash,
  selectUtxoAndCreateOutputReference,
  applyOrefParamToScript,
  textToHex,
  createUrnaDatum,
  generateInitialOptions,
  generateEventTiming,
  createOutputReference,
} from '../../utils.js';
import { buildGroupMintTransaction } from '../../mint-group.js';
import { buildSemaphoreVotingMintTransaction } from '../../mint-sv.js';
import { VALIDATORS } from '../../validators.js';
import 'dotenv/config';

// ═══════════════════════════════════════════════════════════════════════════
// Provider and wallet
// ═══════════════════════════════════════════════════════════════════════════

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);

const apiKey: string = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const paymentKeyHash = extractPaymentKeyHash(walletAddress!);
const walletUtxos = await wallet.getUtxos();

console.log('Wallet address:', walletAddress);
console.log('Payment key hash:', paymentKeyHash);
console.log('Available UTxOs:', walletUtxos.length);

// ═══════════════════════════════════════════════════════════════════════════
// Admin identity commitment
// commitment = poseidon1([poseidon2([nullifier, trapdoor])]) — two-step BLS12-381 Poseidon.
// The commitment (not the raw nullifier/trapdoor) is added to the group Merkle tree.
// TODO: replace with the admin's real identity values before running on preprod.
// The eventId must match the VotingEvent.id assigned by the backend DB.
// ═══════════════════════════════════════════════════════════════════════════

// Identity generated once and hardcoded for stability.
// To generate new values: uncomment the block below, run, copy the output, then re-hardcode.
// const generatedIdentity = new Identity();
// console.log('firstVoterNullifier:', generatedIdentity.nullifier.toString());
// console.log('firstVoterTrapdoor: ', generatedIdentity.trapdoor.toString());

const firstVoterNullifier: bigint = 271653438206717094079157764291425104066922764057659219249202025845162325949n;
const firstVoterTrapdoor: bigint  = 212609804379629008118457786121284867653490527247131597814771018142901697993n;

const firstVoterSecret     = poseidon2([firstVoterNullifier, firstVoterTrapdoor]);
const firstVoterCommitment = poseidon1([firstVoterSecret]);

const eventId = 1; // TODO: must match VotingEvent.id in backend DB
const group = new Group(BigInt(eventId), 20);
group.addMember(firstVoterCommitment);

console.log('\nFirst voter commitment:', firstVoterCommitment.toString());
console.log('Group Merkle root (with first voter):', group.root.toString());
console.log('→ Save commitment to VotingEvent.groupLeafCommitments in backend.');

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — Mint Group NFT  (already ran — tx: f63cdf994eb9d7519b25f5e270aa987471924ece22447c731a365f022e593b70)
// ═══════════════════════════════════════════════════════════════════════════

// const { selectedUtxo: groupUtxo, outputReference: groupOref } =
//   selectUtxoAndCreateOutputReference(walletUtxos, 0);
// const collateralUtxo = walletUtxos[1] ?? walletUtxos[0];
// const groupValidatorCbor = applyOrefParamToScript(VALIDATORS.group.mint, groupOref);
// const groupScriptAddr = resolvePlutusScriptAddress(
//   { code: groupValidatorCbor, version: "V3" } as PlutusScript, 0
// );
// const groupPolicyId = resolveScriptHash(groupValidatorCbor, "V3");
// const groupAssetName = textToHex("zkvapp-group");
// const groupDatum = conStr(0, [integer(BigInt(group.root.toString())), byteString(paymentKeyHash!)]);
// const groupMintValue: Asset[] = [
//   { unit: "lovelace", quantity: "5000000" },
//   { unit: groupPolicyId + groupAssetName, quantity: "1" },
// ];
// console.log('\n=== PHASE 1: Minting Group NFT ===');
// console.log('Group policy ID:', groupPolicyId);
// console.log('Group script address:', groupScriptAddr);
// const unsignedGroupTx = await buildGroupMintTransaction({
//   provider,
//   policyId: groupPolicyId,
//   assetName: groupAssetName,
//   clothedCbor: groupValidatorCbor,
//   createRedeemer: conStr(0, []),
//   selectedUtxo: groupUtxo,
//   walletUtxos,
//   walletAddress: walletAddress!,
//   scriptAddr: groupScriptAddr,
//   mintValue: groupMintValue,
//   groupDatum,
//   paymentKeyHash: paymentKeyHash!,
//   collateralUtxo,
// });
// const signedGroupTx = await wallet.signTx(unsignedGroupTx, true);
// const groupTxHash = await wallet.submitTx(signedGroupTx);
// console.log('\nGroup NFT tx hash:', groupTxHash);
// console.log('Explorer: https://preprod.cardanoscan.io/transaction/' + groupTxHash);
// console.log('\n→ Wait for confirmation, then fill in PHASE 2 below and run again.');

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — Mint Semaphore + Voting NFTs
// 1. Comment out the PHASE 1 block above (it has already run).
// 2. Paste the Phase 1 tx hash and output index below.
// 3. Run the script again.
// ═══════════════════════════════════════════════════════════════════════════

const groupNftTxHash = "f63cdf994eb9d7519b25f5e270aa987471924ece22447c731a365f022e593b70";
const groupNftOutputIndex = 0;

// Phase 1 outputs — hardcoded from the Phase 1 run output.
// Re-deriving from walletUtxos[0] would be wrong: that UTxO was spent in Phase 1,
// so the wallet UTxO list changes and index 0 is now a different UTxO.
const groupPolicyId = "3ee8455dedfe6407dd152c8aa4295edf4f5be119495cb4f2890a89a8";
const groupScriptAddr = "addr_test1wqlws32aahlxgp7az5kg4fpftm057klpr9y4ed8j3y9gn2qd56d98";

// Collateral for Phase 2 — use a different UTxO from the minting one (index 1 → index 2).
const collateralUtxo = walletUtxos[2] ?? walletUtxos[1];

const { selectedUtxo: svUtxo, outputReference: svOref } =
  selectUtxoAndCreateOutputReference(walletUtxos, 1); // use a different UTxO than Phase 1

const semaphoreValidatorCbor = applyOrefParamToScript(VALIDATORS.semaphore.mint, svOref);
const semaphoreScriptAddr = resolvePlutusScriptAddress(
  { code: semaphoreValidatorCbor, version: "V3" } as PlutusScript, 0
);
const semaphorePolicyId = resolveScriptHash(semaphoreValidatorCbor, "V3");

const votingValidatorCbor = applyOrefParamToScript(VALIDATORS.voting.mint, svOref);
const votingScriptAddr = resolvePlutusScriptAddress(
  { code: votingValidatorCbor, version: "V3" } as PlutusScript, 0
);
const votingPolicyId = resolveScriptHash(votingValidatorCbor, "V3");

// SemaphoreDatum: { group_token_policy, group_merke_root, nullifier_mpf_root, vkey_ref_input }
// group_merke_root matches the Group NFT datum minted in Phase 1 (same group.root).
// vkeyRefTxHash is a placeholder — replace with the real VKey UTxO tx hash before going live.
const nullHash    = "0000000000000000000000000000000000000000000000000000000000000000";
const vkeyRefTxHash = "10b5b3ca7cfad3da6d344138ff4361a5398acc19b41cc0382fcfc82e427581ae";
const vkeyRefOutputIndex = 2;
const semaphoreDatum = conStr(0, [
  byteString(groupPolicyId),
  integer(BigInt(group.root.toString())), // must match the Merkle root stored in the Group NFT datum
  byteString(nullHash),
  createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex),
]);

const options = generateInitialOptions(3);
const { eventStart, eventEnd, txValiditySlots, description } = generateEventTiming({
  startsInMinutes: 2,
  durationMinutes: 1000000,
  txValidityMinutes: 1, // must be less than startsInMinutes so validity ends before event starts
});
const urnaDatum = createUrnaDatum({
  weight: 0,
  options,
  eventStart,
  eventEnd,
  semaphoreNftPolicyId: semaphorePolicyId,
});

const semaphoreAssetName = textToHex("Semaphore1");
const votingAssetName    = textToHex("VotingEvent1");
const semaphoreMintValue: Asset[] = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: semaphorePolicyId + semaphoreAssetName, quantity: "1" },
];
const votingMintValue: Asset[] = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: votingPolicyId + votingAssetName, quantity: "1" },
];

const currentSlot = await provider.fetchLatestBlock().then(b => parseInt(b.slot));
const txValidityEndSlot = currentSlot + txValiditySlots;

console.log('\n=== PHASE 2: Minting Semaphore + Voting NFTs ===');
console.log('Semaphore policy ID:', semaphorePolicyId);
console.log('Voting policy ID:', votingPolicyId);
console.log('Timing:', description);

const unsignedSvTx = await buildSemaphoreVotingMintTransaction({
  provider,
  txValidityEndSlot,
  groupNftTxHash,
  groupNftOutputIndex,
  semaphorePolicyId,
  semaphoreAssetName,
  semaphoreValidatorCbor,
  votingPolicyId,
  votingAssetName,
  votingValidatorCbor,
  selectedUtxo: svUtxo,
  walletUtxos,
  walletAddress: walletAddress!,
  semaphoreScriptAddr,
  semaphoreMintValue,
  semaphoreDatum,
  votingScriptAddr,
  votingMintValue,
  urnaDatum,
  paymentKeyHash: paymentKeyHash!,
  collateralUtxo,
});

const signedSvTx = await wallet.signTx(unsignedSvTx, true);
const response = await fetch('https://cardano-preprod.blockfrost.io/api/v0/tx/submit', {
  method: 'POST',
  headers: { 'project_id': apiKey, 'Content-Type': 'application/cbor' },
  body: Buffer.from(signedSvTx, 'hex'),
});
const svTxHash = await response.text();

console.log('\nSemaphore + Voting NFTs tx hash:', svTxHash);
console.log('Explorer: https://preprod.cardanoscan.io/transaction/' + svTxHash);
console.log('\nVotingEvent fields to save in backend:');
console.log('  groupNft:               ', groupPolicyId);
console.log('  groupValidatorAddress:  ', groupScriptAddr);
console.log('  semaphoreNft:           ', semaphorePolicyId);
console.log('  semaphoreAddress:       ', semaphoreScriptAddr);
console.log('  votingNft:              ', votingPolicyId);
console.log('  votingValidatorAddress: ', votingScriptAddr);
console.log('  startingDate:           ', eventStart);
console.log('  endingDate:             ', eventEnd);
