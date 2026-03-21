import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { BlockfrostProvider, UTxO, integer, list, conStr, byteString, MeshTxBuilder } from '@meshsdk/core';
import { createWallet, parseMnemonic, walletBaseAddress, extractPaymentKeyHash, createUrnaDatum, createOutputReference } from './utils.js';
import { encodeVoteSignal, generateVoteProof, insertNullifier } from '@src/zk';

const require = createRequire(fileURLToPath(import.meta.url));
const blake2b = require('blake2b');
import 'dotenv/config';

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
// Hardcoded from VotingEvent entity after the event is created via mint-sv.ts.
// TODO (function): these become parameters semaphoreScriptAddress and votingScriptAddress.

const semaphoreScriptAddress = ""; // VotingEvent.semaphoreAddress  → e.g. "addr_test1..."
const votingScriptAddress    = ""; // VotingEvent.votingValidatorAddress → e.g. "addr_test1..."

console.log('Semaphore script address:', semaphoreScriptAddress);
console.log('Voting script address:', votingScriptAddress);

// --- Step 3: Fetch Semaphore UTxO ---
// TODO (function): semaphoreNftPolicyId becomes a parameter.

const semaphoreNftPolicyId = ""; // VotingEvent.semaphoreNft → e.g. "a7bc807..."

const semaphoreUtxos: UTxO[] = await provider.fetchAddressUTxOs(semaphoreScriptAddress);
const semaphoreUtxo = semaphoreUtxos.find(u =>
  u.output.amount.some(a => a.unit.startsWith(semaphoreNftPolicyId))
);
if (!semaphoreUtxo) throw new Error('Semaphore UTxO not found at script address');

console.log('Semaphore UTxO:', semaphoreUtxo.input.txHash, '#', semaphoreUtxo.input.outputIndex);

// --- Step 4: Fetch Voting UTxO ---
// TODO (function): votingNftPolicyId becomes a parameter.

const votingNftPolicyId = ""; // VotingEvent.votingNft → e.g. "1779325f..."

const votingUtxos: UTxO[] = await provider.fetchAddressUTxOs(votingScriptAddress);
const votingUtxo = votingUtxos.find(u =>
  u.output.amount.some(a => a.unit.startsWith(votingNftPolicyId))
);
if (!votingUtxo) throw new Error('Voting UTxO not found at script address');

console.log('Voting UTxO:', votingUtxo.input.txHash, '#', votingUtxo.input.outputIndex);
console.log('Voting UTxO datum:', votingUtxo.output.plutusData);

// --- Step 5: Encode vote signal ---
// signal_message is the CBOR-encoded List<(Int, Int)> passed to deserialise_signal on-chain.
//
// Simple voting   (UrnaDatum.weight <= 1): exactly one pair, vote count must be 1.
//   e.g. [[2, 1]] — cast 1 vote for option 2.
//
// Weighted voting (UrnaDatum.weight  > 1): one or more pairs, vote counts must sum
//   exactly to UrnaDatum.weight (checked on-chain by check_weight).
//   e.g. [[1, 3], [2, 2]] — split 5 votes across options 1 and 2.
//
// TODO (function): voteSignal becomes a parameter of type Array<[number, number]>.

const voteSignal: Array<[number, number]> = [[1, 1]]; // simple vote example: 1 vote for option 1

const signalMessage = encodeVoteSignal(voteSignal);

console.log('Signal message (hex):', signalMessage);

// --- Step 6: Generate ZK proof ---
// NOTE: in production this step runs on the frontend (user's browser) via @src/zk,
// so that identity secrets (nullifier, trapdoor) never leave the client.
// The backend only receives the resulting compressed proof and nullifier hash.
// TODO (function): all values below become parameters.
//
// identityNullifier, identityTrapdoor — Semaphore identity secrets known only to the voter.
// merkleProof — the Merkle path proving the voter's leaf is in the group tree.
//   root: VotingEvent.groupMerkleRootHash (as bigint)
//   siblings: sibling hashes along the path (from VotingEvent.groupLeafCommitments)
//   pathIndices: 0 (left) or 1 (right) at each level
// externalNullifier — semaphore NFT policy ID as a bigint; ties the nullifier to this event.

const identityNullifier: bigint = 0n; // voter's Semaphore identity nullifier
const identityTrapdoor: bigint  = 0n; // voter's Semaphore identity trapdoor
const merkleProof = {
  root:        0n,   // VotingEvent.groupMerkleRootHash
  siblings:    [0n], // path sibling hashes
  pathIndices: [0],  // path direction at each level
};
const externalNullifier = BigInt('0x' + semaphoreNftPolicyId);

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
// NOTE: backend. LevelDB cannot run in a browser and the trie must be consistent across
// all voters. In production the frontend sends nullifierHash to a backend API endpoint
// and receives mpfProof in return. The backend also persists newRoot to VotingEvent.nullifierMerkleTree.
// insertNullifier throws if the nullifier already exists (double vote attempt).
// TODO (function): eventId becomes a parameter.

const eventId = 0;                         // VotingEvent.id
const currentMpfRoot = Buffer.alloc(32);   // VotingEvent.nullifierMerkleTree (32-byte root, zeros for empty trie)

const { newRoot: mpfNewRoot, proof: mpfProof } = await insertNullifier(currentMpfRoot, nullifierHash, eventId);

console.log('MPF proof (hex):', mpfProof.toString('hex'));

// --- Step 8: Compute updated UrnaDatum ---
// Apply the vote signal to the current options and build the new datum to send back on-chain.
// TODO (function): weight, currentOptions, eventStart, eventEnd become parameters
//   read from VotingEvent entity / decoded from votingUtxo.output.plutusData.
//
// currentOptions is List<[optionIndex, currentCount]> mirroring the on-chain UrnaDatum.options.
// For each [optionIndex, votes] in voteSignal, increment the matching option's count.

const weight     = 0;          // VotingEvent.votingPower (0 = simple voting)
const eventStart = 0;          // VotingEvent.startingDate (POSIX ms)
const eventEnd   = 0;          // VotingEvent.endingDate   (POSIX ms)
const currentOptions: Array<[number, number]> = [[0, 0], [1, 0], [2, 0]]; // from UrnaDatum

// Apply vote: add voteSignal counts to matching options
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

console.log('Updated UrnaDatum:', JSON.stringify(updatedUrnaDatum));

// --- Step 9: Construct SemaphoreRedeemer.Signal ---
// SemaphoreRedeemer has two constructors: Create (0) and Signal (1).
// Signal fields (semaphore_types.ak):
//   groth16.Proof  → conStr(0, [piA, piB, piC])  — compressed BLS12-381 points
//   mpf.Proof      → byteString (raw CBOR from insertNullifier)
//   Int nullifier  → integer(nullifierHash)
//   Int signal_hash → integer(blake2b_256(signal_message))
//   ByteArray signal_message → byteString(signalMessage)

const signalHashBuf = Buffer.from(
  blake2b(32).update(Buffer.from(signalMessage, 'hex')).digest()
);
const signalHash = BigInt('0x' + signalHashBuf.toString('hex'));

const semaphoreRedeemer = conStr(1, [
  conStr(0, [byteString(zkProof.pi_a), byteString(zkProof.pi_b), byteString(zkProof.pi_c)]),
  byteString(mpfProof.toString('hex')),
  integer(nullifierHash),
  integer(signalHash),
  byteString(signalMessage),
]);

console.log('Semaphore redeemer constructed.');

// --- Step 10: Build vote transaction ---
// NOTE: frontend. The transaction is built and signed in the user's browser via CIP-30.
// The backend is not involved after Step 7 (insertNullifier).
//
// semaphoreValidatorCbor / votingValidatorCbor are recomputed from the validator templates
// (VALIDATORS.semaphore.mint / VALIDATORS.voting.mint) and the OutputReference used at
// mint time. Both can be re-derived by the frontend from VotingEvent.mintingOref.
// TODO (function): semaphoreValidatorCbor and votingValidatorCbor become parameters.
//
// vkeyRefTxHash / vkeyRefOutputIndex identify the UTxO holding the SnarkVerificationKey
// datum. The semaphore validator fetches it from transaction inputs during Signal spending.
// NOTE: the validator reads it via find_input(inputs, ...) — so it must be a spending input,
// not a read-only reference input. The VKey UTxO must also be re-created as an output in
// the same transaction to remain available for subsequent votes.
// TODO (function): vkeyUtxo becomes a parameter, fetched from VotingEvent.vkeyRefTxHash.

const semaphoreValidatorCbor = ""; // recomputed: applyOrefParamToScript(VALIDATORS.semaphore.mint, mintingOref)
const votingValidatorCbor    = ""; // recomputed: applyOrefParamToScript(VALIDATORS.voting.mint, mintingOref)

// Fields preserved from the current SemaphoreDatum (decoded from semaphoreUtxo.output.plutusData).
// TODO (function): groupNftPolicyId, groupMerkleRoot, vkeyRefTxHash, vkeyRefOutputIndex become parameters.
const groupNftPolicyId   = ""; // VotingEvent.groupNft
const groupMerkleRoot    = 0n; // VotingEvent.groupMerkleRootHash (as bigint)
const vkeyRefTxHash      = "0000000000000000000000000000000000000000000000000000000000000000";
const vkeyRefOutputIndex = 0;

// Updated SemaphoreDatum: same as current but nullifier_mpf_root set to mpfNewRoot.
const updatedSemaphoreDatum = conStr(0, [
  byteString(groupNftPolicyId),
  integer(groupMerkleRoot),
  byteString(mpfNewRoot.toString('hex')), // new nullifier MPF root after nullifier insertion
  createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex),
]);

// Convert POSIX ms → Cardano preprod slot.
// Preprod Shelley era started at Unix time 1655769600s, slot 86400.
const SHELLEY_UNIX_TIME = 1655769600;
const SHELLEY_SLOT      = 86400;
const eventStartSlot = Math.floor(eventStart / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;
const eventEndSlot   = Math.floor(eventEnd   / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;

const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  evaluator: provider,
  verbose: false,
});

const unsignedVoteTx = await txBuilder
  .setNetwork("preprod")
  .invalidBefore(eventStartSlot)
  .invalidHereafter(eventEndSlot)

  // Spend Semaphore UTxO — sent back with updated nullifier_mpf_root
  .txIn(
    semaphoreUtxo.input.txHash,
    semaphoreUtxo.input.outputIndex,
    semaphoreUtxo.output.amount,
    semaphoreScriptAddress,
  )
  .txInScript(semaphoreValidatorCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(semaphoreRedeemer, "JSON", { mem: 14000000, steps: 10000000000 })

  // Spend Voting UTxO — sent back with updated UrnaDatum; UrnaRedeemer.Vote = conStr(1, [])
  .txIn(
    votingUtxo.input.txHash,
    votingUtxo.input.outputIndex,
    votingUtxo.output.amount,
    votingScriptAddress,
  )
  .txInScript(votingValidatorCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(conStr(1, []), "JSON", { mem: 7000000, steps: 5000000000 })

  // Collateral
  .txInCollateral(
    "a0c462bc82ee224bd8f76ec50dbf89b7b42ea831ea830000802771ba49c43d97",
    1,
    [{ unit: "lovelace", quantity: "2470930000" }],
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

console.log('Vote transaction built. Length:', unsignedVoteTx.length);
