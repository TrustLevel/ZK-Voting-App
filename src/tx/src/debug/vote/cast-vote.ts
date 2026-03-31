import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { BlockfrostProvider, UTxO, integer, list, conStr, byteString, MeshTxBuilder } from '@meshsdk/core';
import {
  createWallet, parseMnemonic, walletBaseAddress, extractPaymentKeyHash,
  createUrnaDatum, createOutputReference, applyOrefParamToScript,
} from '../../utils.js';
import { VALIDATORS } from '../../validators.js';
import { encodeVoteSignal, generateVoteProof, insertNullifier } from '@src/zk';
import { Group } from 'modp-semaphore-bls12381/packages/typescript/lib/group/index.js';
import { poseidon1, poseidon2 } from 'poseidon-bls12381';

import 'dotenv/config';

// Reset nullifier trie on every run of this debug script so failed runs don't leave stale state.
// In production, the trie is managed by the backend and never reset.
const nullifiersDbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../nullifiers-db');
if (fs.existsSync(nullifiersDbPath)) {
  fs.rmSync(nullifiersDbPath, { recursive: true });
  console.log('Nullifier trie reset (debug only).');
}

// Steps to build a vote transaction:
//
// Step 1 — Set up provider and wallet (same pattern as mint-group.ts)
//
// Step 2 — Resolve the semaphore script address and voting script address
//           from VALIDATORS.semaphore.mint and VALIDATORS.voting.mint.
//           Both validators are parameterised with their minting OutputReference,
//           so their script address must be retrieved from the backend/database
//           (the policy IDs and addresses are stored in VotingEvent entity).
//
// Step 3 — Fetch the Semaphore UTxO from the semaphore script address.
//           This is the UTxO that holds the Semaphore NFT and will be
//           spent and sent back in the same transaction.
//
// Step 4 — Fetch the Voting UTxO from the voting script address.
//           This holds the Voting NFT and the current UrnaDatum
//           (weight, options, event_date, semaphore_nft).
//
// Step 5 — Encode the voter's choice as signal_message.
//           signal_message = encodeVoteSignal(options) where options is
//           List<(Int, Int)> — e.g. [[2, 1]] for "cast 1 vote for option 2".
//
// Step 6 — Generate the ZK proof using generateVoteProof().
//           Inputs: identityNullifier, identityTrapdoor, merkleProof
//           (path from current group Merkle root to the voter's leaf),
//           externalNullifier (the semaphore NFT policy ID as bigint),
//           and signal (hex string from Step 5).
//           Output: { zkProof: { pi_a, pi_b, pi_c }, nullifierHash, publicSignals }
//
// Step 7 — Insert nullifier into MPF trie using insertNullifier().
//           Inputs: current nullifier MPF root (from backend), nullifierHash
//           (from Step 6), eventId.
//           Output: { newRoot, proof } — proof is the CBOR MPF insertion proof
//           sent as mpf_proof in the redeemer; newRoot must be saved to backend.
//
// Step 8 — Compute the updated UrnaDatum options.
//           Apply the vote to the current options list read from the UrnaDatum
//           fetched in Step 4 (increment the count for the chosen option index).
//           Then call createUrnaDatum() with the updated options and the
//           remaining fields preserved (weight, event_date, semaphore_nft).
//
// Step 9 — Construct the SemaphoreRedeemer.Signal.
//           Signal is constructor index 1 of SemaphoreRedeemer:
//             conStr(1, [zk_proof, mpf_proof, nullifier, signal_hash, signal_message])
//           where:
//             - zk_proof  = conStr(0, [byteString(pi_a), byteString(pi_b), byteString(pi_c)])
//             - mpf_proof = byteString(mpf_proof CBOR hex)
//             - nullifier = integer(nullifierHash)
//             - signal_hash = integer(blake2b_256(signal_message) as BLS12-381 scalar)
//               NOTE: signal_hash is already embedded in publicSignals[0] from snarkjs
//             - signal_message = byteString(hex from Step 5)
//
// Step 10 — Build the transaction using MeshTxBuilder:
//             - .txIn(semaphore UTxO) with semaphore script + SemaphoreRedeemer.Signal
//             - .txIn(voting UTxO)    with voting script   + UrnaRedeemer.Vote (conStr(1,[]))
//             - .readOnlyTxInReference(vkeyRefTxHash, vkeyRefOutputIndex)  ← VKey as reference input
//             - .txOut(semaphore script address, semaphore UTxO value)  ← sent back unchanged
//             - .txOut(voting script address, voting UTxO value)
//               .txOutInlineDatumValue(updatedUrnaDatum)                ← updated options
//             - .invalidBefore(event_start) / .invalidHereafter(event_end)
//               to set the validity range inside the voting window
//             - .txInCollateral(...)
//             - .changeAddress(walletAddress)
//             - .requiredSignerHash(paymentKeyHash)
//             - .complete()

// --- Step 1: Provider and wallet ---
// NOTE: frontend. In production the voter connects a CIP-30 browser wallet (Eternl, Lace,
// Yoroi) instead of a mnemonic. createWallet + mnemonic is used here for testing only.

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

// --- Step 2: Script addresses ---
// Hardcoded from Phase 2 bootstrap-vote.ts output (VotingEvent entity fields).

const semaphoreScriptAddress = "addr_test1wr0r03cellu3nvtgr87uk2wcdcwgsh92dh56g53cx9m4uegl0cz26";
const votingScriptAddress    = "addr_test1wp3veftrvs4x44hde9pu6jgqu9z8tcmhrq67ul44qc5mfms9902tf";

console.log('Semaphore script address:', semaphoreScriptAddress);
console.log('Voting script address:', votingScriptAddress);

// --- Step 3: Fetch Semaphore UTxO ---

const semaphoreNftPolicyId = "de37c719fff919b16819fdcb29d86e1c885caa6de9a4523831775e65";

const semaphoreUtxos: UTxO[] = await provider.fetchAddressUTxOs(semaphoreScriptAddress);
const semaphoreUtxo = semaphoreUtxos.find(u =>
  u.output.amount.some(a => a.unit.startsWith(semaphoreNftPolicyId))
);
if (!semaphoreUtxo) throw new Error('Semaphore UTxO not found at script address');

console.log('Semaphore UTxO:', semaphoreUtxo.input.txHash, '#', semaphoreUtxo.input.outputIndex);

// --- Step 4: Fetch Voting UTxO ---

const votingNftPolicyId = "62cca563642a6ad6edc943cd4900e14475e3771835ee7eb50629b4ee";

const votingUtxos: UTxO[] = await provider.fetchAddressUTxOs(votingScriptAddress);
const votingUtxo = votingUtxos.find(u =>
  u.output.amount.some(a => a.unit.startsWith(votingNftPolicyId))
);
if (!votingUtxo) throw new Error('Voting UTxO not found at script address');

console.log('Voting UTxO:', votingUtxo.input.txHash, '#', votingUtxo.input.outputIndex);
console.log('Voting UTxO datum:', votingUtxo.output.plutusData);

// VKey UTxO — permanently locked at the always-false script address.
// Included as a read-only reference input (semaphore validator v0.9.4 uses
// find_input(reference_inputs, dat.vkey_ref_input) — never consumed, never re-created).
const vkeyRefTxHash      = "3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083";
const vkeyRefOutputIndex = 0;

const collateralUtxo = walletUtxos[0];
if (!collateralUtxo) throw new Error('No collateral UTxO available');

// --- Step 5: Encode vote signal ---
// Simple voting (weight=0): exactly one pair, vote count must be 1.
// [[0, 1]] — cast 1 vote for option 0.
// NOTE: option 1 (encoding 9f9f0101ffff) has blake2b_256 >= BLS12-381 prime r,
// which causes semaphore.ak condition 5 (scalar.from_bytearray_big_endian) to return None.
// Options 0 and 2 produce hashes < r and work correctly.

const voteSignal: Array<[number, number]> = [[2, 1]];

const signalMessage = encodeVoteSignal(voteSignal);

console.log('Signal message (hex):', signalMessage);

// --- Step 6: Generate ZK proof ---
// Reconstruct the group from bootstrap-vote.ts to generate the Merkle proof.
// The group has one member (the first voter's commitment) at index 0.

const firstVoterNullifier: bigint = 271653438206717094079157764291425104066922764057659219249202025845162325949n;
const firstVoterTrapdoor: bigint  = 212609804379629008118457786121284867653490527247131597814771018142901697993n;

const firstVoterSecret     = poseidon2([firstVoterNullifier, firstVoterTrapdoor]);
const firstVoterCommitment = poseidon1([firstVoterSecret]);

const eventId = 1;
const group = new Group(BigInt(eventId), 20);
group.addMember(firstVoterCommitment);

const merkleProof = group.generateMerkleProof(0);

const identityNullifier: bigint = firstVoterNullifier;
const identityTrapdoor: bigint  = firstVoterTrapdoor;
const externalNullifier = BigInt('0x' + semaphoreNftPolicyId);

console.log('Merkle root:', merkleProof.root.toString());
console.log('Generating ZK proof...');

const { zkProof, nullifierHash, publicSignals } = await generateVoteProof({
  identityNullifier,
  identityTrapdoor,
  merkleProof,
  externalNullifier,
  signal: signalMessage,
});

console.log('pi_a:', zkProof.pi_a);
console.log('pi_b:', zkProof.pi_b);
console.log('pi_c:', zkProof.pi_c);
console.log('Nullifier hash:', nullifierHash);

// --- Step 7: Insert nullifier into MPF trie ---
// Empty trie (all zeros) — first vote on this event.

const currentMpfRoot = Buffer.alloc(32);

const { newRoot: mpfNewRoot, proofSteps: mpfProofSteps } = await insertNullifier(currentMpfRoot, nullifierHash, eventId);

console.log('MPF new root (hex):', mpfNewRoot.toString('hex'));
console.log('MPF proof steps:', JSON.stringify(mpfProofSteps));

// --- Step 8: Compute updated UrnaDatum ---

const weight     = 0;
const eventStart = 1774890746725;
const eventEnd   = 1834890746725;
const currentOptions: Array<[number, number]> = [[0, 0], [1, 0], [2, 0]];

const updatedOptions = currentOptions.map(([idx, count]) => {
  const voted = voteSignal.find(([vi]) => vi === idx);
  return list([integer(idx), integer(count + (voted ? voted[1] : 0))]);
});

const updatedUrnaDatum = createUrnaDatum({
  weight,
  options: updatedOptions,
  eventStart,
  eventEnd,
  semaphoreNftPolicyId,
});

console.log('Updated UrnaDatum constructed (option 2 now has 1 vote).');

// --- Step 9: Construct SemaphoreRedeemer.Signal ---

// Use publicSignals[2] from the ZK proof output — this is the signal_hash as the circuit
// computed it (already a valid BLS12-381 scalar, circuit index: [merkle_root, nullifier, signal_hash, ext_nullifier]).
// Must equal blake2b_256(signal_message) interpreted as a big-endian scalar on-chain (semaphore.ak cond 5).
// IMPORTANT: signal_message must be chosen so blake2b_256(msg) < field_prime r; otherwise
// scalar.from_bytearray_big_endian returns None and the tx fails. Options 0 and 2 satisfy this.
const signalHash = BigInt(publicSignals[2]);
console.log('Signal hash (from publicSignals[2]):', signalHash.toString());

// Convert MPF proof steps (from proof.toJSON()) to on-chain List<ProofStep> Plutus data.
// Matches the ProofStep type in aiken-lang/merkle-patricia-forestry:
//   Branch { skip, neighbors }  → Constr 0 [Int, ByteArray]
//   Fork   { skip, neighbor }   → Constr 1 [Int, Constr 0 [Int, ByteArray, ByteArray]]
//   Leaf   { skip, neighbor }   → Constr 2 [Int, ByteArray, ByteArray]
function mpfStepsToPlutusData(steps: Array<any>): ReturnType<typeof list> {
  return list(steps.map(step => {
    switch (step.type) {
      case 'branch':
        return conStr(0, [integer(step.skip), byteString(step.neighbors)]);
      case 'fork':
        return conStr(1, [
          integer(step.skip),
          conStr(0, [integer(step.neighbor.nibble), byteString(step.neighbor.prefix), byteString(step.neighbor.root)]),
        ]);
      case 'leaf':
        return conStr(2, [integer(step.skip), byteString(step.neighbor.key), byteString(step.neighbor.value)]);
      default:
        throw new Error(`Unknown MPF proof step type: ${step.type}`);
    }
  }));
}

const semaphoreRedeemer = conStr(1, [
  conStr(0, [byteString(zkProof.pi_a), byteString(zkProof.pi_b), byteString(zkProof.pi_c)]),
  mpfStepsToPlutusData(mpfProofSteps),
  integer(nullifierHash),
  integer(signalHash),
  byteString(signalMessage),
]);

console.log('Semaphore redeemer constructed.');

// --- Step 10: Build vote transaction ---

// Re-derive validator CBORs from the minting oref used in Phase 2 of bootstrap-vote.ts.
// Phase 2 tx: 63b8e161... consumed walletUtxos[1] at the time, which was 6a99bb1d...#2.
const mintingOref = createOutputReference(
  "63b8e16110d53c56776067efc67ed23869f83a7645dd9acbdda696625dac1a03",
  2
);
const semaphoreValidatorCbor = applyOrefParamToScript(VALIDATORS.semaphore.mint, mintingOref);
const votingValidatorCbor    = applyOrefParamToScript(VALIDATORS.voting.mint, mintingOref);

// Fields preserved from current SemaphoreDatum (only nullifier_mpf_root changes).
const groupNftPolicyId = "3ee8455dedfe6407dd152c8aa4295edf4f5be119495cb4f2890a89a8";
const groupMerkleRoot  = 23030474717815918442389680005443364297749425152559009643391469983686590934097n;

const updatedSemaphoreDatum = conStr(0, [
  byteString(groupNftPolicyId),
  integer(groupMerkleRoot),
  byteString(mpfNewRoot.toString('hex')),
  createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex),
]);

// Convert POSIX ms → Cardano preprod slot.
// Preprod Shelley era started at Unix time 1655769600s, slot 86400.
const SHELLEY_UNIX_TIME = 1655769600;
const SHELLEY_SLOT      = 86400;
const eventStartSlot = Math.floor(eventStart / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;
const eventEndSlot   = Math.floor(eventEnd   / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;

// Fetch current slot to set a near-future tx validity window.
// invalidHereafter must stay within the preprod era horizon (~slot 118886400).
// The voting window check only requires invalidBefore(eventStartSlot) to prove
// the tx is submitted after voting starts; the upper bound just needs to be
// a reasonable near-future slot, not the full event end date.
const currentSlot = await provider.fetchLatestBlock().then(b => parseInt(b.slot));
const txValidityEndSlot = currentSlot + 1200; // 20 minutes

console.log('Event start slot:', eventStartSlot);
console.log('Current slot:', currentSlot);
console.log('TX validity end slot:', txValidityEndSlot, '(20 min from now)');

const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  evaluator: provider,
  verbose: false,
});

console.log('\nBuilding vote transaction...');

let unsignedVoteTx: string;

try {
  unsignedVoteTx = await txBuilder
    .setNetwork("preprod")
    // eventStartSlot maps to POSIX 1774109005000ms, but event_start = 1774109005840ms.
    // is_entirely_after requires lower_bound > event_start, so use slot+1 (→ 1774109006000ms).
    .invalidBefore(eventStartSlot + 1)
    .invalidHereafter(txValidityEndSlot)

    // Spend Semaphore UTxO — returned with updated nullifier_mpf_root
    .spendingPlutusScriptV3()
    .txIn(
      semaphoreUtxo.input.txHash,
      semaphoreUtxo.input.outputIndex,
      semaphoreUtxo.output.amount,
      semaphoreScriptAddress,
    )
    .txInScript(semaphoreValidatorCbor)
    .txInInlineDatumPresent()
    .txInRedeemerValue(semaphoreRedeemer, "JSON", { mem: 12000000, steps: 7000000000 })

    // Spend Voting UTxO — returned with updated vote tally; UrnaRedeemer.Vote = conStr(1, [])
    .spendingPlutusScriptV3()
    .txIn(
      votingUtxo.input.txHash,
      votingUtxo.input.outputIndex,
      votingUtxo.output.amount,
      votingScriptAddress,
    )
    .txInScript(votingValidatorCbor)
    .txInInlineDatumPresent()
    .txInRedeemerValue(conStr(1, []), "JSON", { mem: 4000000, steps: 2500000000 })

    // VKey UTxO as read-only reference input — semaphore validator reads vkey datum from it
    .readOnlyTxInReference(vkeyRefTxHash, vkeyRefOutputIndex)

    // Collateral
    .txInCollateral(
      collateralUtxo.input.txHash,
      collateralUtxo.input.outputIndex,
      collateralUtxo.output.amount,
    )

    // Output 0: Semaphore back to script address with updated nullifier_mpf_root
    .txOut(semaphoreScriptAddress, semaphoreUtxo.output.amount)
    .txOutInlineDatumValue(updatedSemaphoreDatum, "JSON")

    // Output 1: Voting back to script address with updated vote tally
    .txOut(votingScriptAddress, votingUtxo.output.amount)
    .txOutInlineDatumValue(updatedUrnaDatum, "JSON")

    .selectUtxosFrom(walletUtxos)
    .changeAddress(walletAddress!)
    .requiredSignerHash(paymentKeyHash!)
    .complete();

  console.log('Transaction built successfully (length:', unsignedVoteTx.length, ')');
} catch (evalError: any) {
  console.log('Evaluation error:', evalError.message.slice(0, 500));
  const match = evalError.message.match(/For txHex: ([0-9a-f]+)/);
  if (match) {
    unsignedVoteTx = match[1];
    console.log('Ogmios evaluation failed, extracted TX hex (length:', unsignedVoteTx.length, ')');
  } else {
    console.error('Build failed:', evalError.message);
    throw evalError;
  }
}

console.log('\nSigning transaction...');
const signedVoteTx = await wallet.signTx(unsignedVoteTx, true);
console.log('Signed tx (length:', signedVoteTx.length, ')');

console.log('\nSubmitting via Blockfrost...');
const response = await fetch('https://cardano-preprod.blockfrost.io/api/v0/tx/submit', {
  method: 'POST',
  headers: { 'project_id': apiKey, 'Content-Type': 'application/cbor' },
  body: Buffer.from(signedVoteTx, 'hex'),
});
const voteTxHash = await response.text();

if (response.ok) {
  console.log('\n=== VOTE CAST SUCCESSFULLY ===');
  console.log('Vote tx hash:', voteTxHash);
  console.log('Explorer: https://preprod.cardanoscan.io/transaction/' + voteTxHash.replace(/"/g, ''));
  console.log('Voted: option 2, count 1');
} else {
  console.error('Submission failed. Status:', response.status);
  console.error('Response:', voteTxHash);
}
