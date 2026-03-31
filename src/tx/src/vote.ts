import {
  BlockfrostProvider,
  UTxO,
  integer,
  list,
  conStr,
  byteString,
  MeshTxBuilder,
} from '@meshsdk/core';
import { createUrnaDatum, createOutputReference } from './utils.js';

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

export interface BuildVoteTransactionParams {
  provider: BlockfrostProvider;

  // On-chain addresses and policy IDs from VotingEvent entity
  semaphoreScriptAddress: string;  // VotingEvent.semaphoreAddress
  votingScriptAddress: string;     // VotingEvent.votingValidatorAddress
  semaphoreNftPolicyId: string;    // VotingEvent.semaphoreNft
  votingNftPolicyId: string;       // VotingEvent.votingNft

  // Validator CBORs re-derived via applyOrefParamToScript(VALIDATORS.*.mint, mintingOref)
  // The mintingOref comes from VotingEvent.mintingOrefTxHash / mintingOrefIndex
  semaphoreValidatorCbor: string;
  votingValidatorCbor: string;

  // Fields preserved in SemaphoreDatum (from VotingEvent)
  groupNftPolicyId: string;    // VotingEvent.groupNft
  groupMerkleRoot: bigint;     // VotingEvent.groupMerkleRootHash as bigint
  vkeyRefTxHash: string;       // VotingEvent.vkeyRefTxHash
  vkeyRefOutputIndex: number;  // VotingEvent.vkeyRefIndex

  // From CIP-30 wallet
  walletUtxos: UTxO[];
  walletAddress: string;
  paymentKeyHash: string;

  // Pre-computed ZK proof — from generateVoteProof() in @src/zk
  zkProof: { pi_a: string; pi_b: string; pi_c: string };
  nullifierHash: bigint;
  // publicSignals[2] from snarkjs — blake2b_256(signal_message) already reduced mod BLS12-381 r
  signalHash: bigint;
  // encodeVoteSignal(voteSignal) — CBOR hex of List<(Int, Int)>
  signalMessage: string;

  // Pre-computed MPF nullifier insertion proof — from POST /voting-event/:id/nullifier
  mpfProofSteps: Array<object>;
  mpfNewRoot: string;  // hex string (32 bytes), new nullifier MPF root after insertion

  // Current on-chain UrnaDatum fields (read from VotingEvent or decoded from votingUtxo)
  voteSignal: Array<[number, number]>;           // voter's choice, e.g. [[2, 1]]
  currentOptions: Array<[number, number]>;       // current vote tallies from UrnaDatum
  weight: number;      // VotingEvent.votingPower (0 = simple voting)
  eventStart: number;  // VotingEvent.startingDate (POSIX ms)
  eventEnd: number;    // VotingEvent.endingDate   (POSIX ms)
}

/**
 * Build an unsigned vote transaction.
 *
 * Fetches the Semaphore and Voting UTxOs from the chain, assembles the
 * SemaphoreRedeemer.Signal and updated datums, and returns the unsigned
 * transaction CBOR.
 *
 * All ZK and MPF proof data must be pre-computed and passed in — this function
 * only handles transaction construction, not proof generation or nullifier insertion.
 *
 * The caller (frontend) signs and submits the returned TX via CIP-30:
 *   const signed = await walletApi.signTx(unsignedTx, true);
 *   await walletApi.submitTx(signed);
 */
export async function buildVoteTransaction(
  params: BuildVoteTransactionParams,
): Promise<string> {
  const {
    provider,
    semaphoreScriptAddress, votingScriptAddress,
    semaphoreNftPolicyId, votingNftPolicyId,
    semaphoreValidatorCbor, votingValidatorCbor,
    groupNftPolicyId, groupMerkleRoot,
    vkeyRefTxHash, vkeyRefOutputIndex,
    walletUtxos, walletAddress, paymentKeyHash,
    zkProof, nullifierHash, signalHash, signalMessage,
    mpfProofSteps, mpfNewRoot,
    voteSignal, currentOptions, weight, eventStart, eventEnd,
  } = params;

  // ── Step 3: Fetch Semaphore UTxO ─────────────────────────────────────────
  const semaphoreUtxos: UTxO[] = await provider.fetchAddressUTxOs(semaphoreScriptAddress);
  const semaphoreUtxo = semaphoreUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(semaphoreNftPolicyId))
  );
  if (!semaphoreUtxo) throw new Error('Semaphore UTxO not found at ' + semaphoreScriptAddress);

  // ── Step 4: Fetch Voting UTxO ─────────────────────────────────────────────
  const votingUtxos: UTxO[] = await provider.fetchAddressUTxOs(votingScriptAddress);
  const votingUtxo = votingUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(votingNftPolicyId))
  );
  if (!votingUtxo) throw new Error('Voting UTxO not found at ' + votingScriptAddress);

  // Find VKey UTxO in the wallet's UTxO set.
  // The semaphore validator reads the vkey datum via find_input(inputs, dat.vkey_ref_input),
  // so this must be a spending input (not a reference input). It is re-created as an output
  // so it remains available for subsequent votes.
  const vkeyUtxo = walletUtxos.find(u =>
    u.input.txHash === vkeyRefTxHash && u.input.outputIndex === vkeyRefOutputIndex
  );
  if (!vkeyUtxo) throw new Error(`VKey UTxO not found: ${vkeyRefTxHash}#${vkeyRefOutputIndex}`);

  // Exclude VKey UTxO from fee selection and collateral — it must appear at a specific index.
  const selectableUtxos = walletUtxos.filter(u =>
    !(u.input.txHash === vkeyRefTxHash && u.input.outputIndex === vkeyRefOutputIndex)
  );
  const collateralUtxo = selectableUtxos[0];
  if (!collateralUtxo) throw new Error('No collateral UTxO available');

  // ── Step 8: Compute updated UrnaDatum ────────────────────────────────────
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

  // ── Step 9: Construct SemaphoreRedeemer.Signal ───────────────────────────
  // Constr 1 [zk_proof, mpf_proof, nullifier, signal_hash, signal_message]
  const semaphoreRedeemer = conStr(1, [
    conStr(0, [byteString(zkProof.pi_a), byteString(zkProof.pi_b), byteString(zkProof.pi_c)]),
    mpfStepsToPlutusData(mpfProofSteps),
    integer(nullifierHash),
    integer(signalHash),
    byteString(signalMessage),
  ]);

  // Updated SemaphoreDatum — only nullifier_mpf_root changes; all other fields preserved.
  const updatedSemaphoreDatum = conStr(0, [
    byteString(groupNftPolicyId),
    integer(groupMerkleRoot),
    byteString(mpfNewRoot),
    createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex),
  ]);

  // ── Step 10: Build transaction ───────────────────────────────────────────
  // Convert POSIX ms → Cardano preprod slot.
  // Preprod Shelley era started at Unix time 1655769600s, slot 86400.
  const SHELLEY_UNIX_TIME = 1655769600;
  const SHELLEY_SLOT = 86400;
  const eventStartSlot = Math.floor(eventStart / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;

  // Use a near-future slot for invalidHereafter rather than the full event end date.
  // The on-chain validity check only requires invalidBefore(eventStartSlot).
  const currentSlot = await provider.fetchLatestBlock().then(b => parseInt(b.slot));
  const txValidityEndSlot = currentSlot + 1200; // 20-minute window

  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  let unsignedVoteTx: string;

  try {
    unsignedVoteTx = await txBuilder
      .setNetwork("preprod")
      // is_entirely_after requires lower_bound > event_start; +1 slot = +1000ms
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

      // Include VKey UTxO as a spending input (semaphore validator reads vkey datum from it)
      .txIn(
        vkeyUtxo.input.txHash,
        vkeyUtxo.input.outputIndex,
        vkeyUtxo.output.amount,
        walletAddress,
      )

      // Collateral
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
      )

      // Output 0: Semaphore back to script with updated nullifier_mpf_root
      .txOut(semaphoreScriptAddress, semaphoreUtxo.output.amount)
      .txOutInlineDatumValue(updatedSemaphoreDatum, "JSON")

      // Output 1: Voting back to script with updated vote tally
      .txOut(votingScriptAddress, votingUtxo.output.amount)
      .txOutInlineDatumValue(updatedUrnaDatum, "JSON")

      // Output 2: VKey UTxO re-created at wallet address (datum preserved for next vote)
      .txOut(walletAddress, vkeyUtxo.output.amount)
      .txOutInlineDatumValue(vkeyUtxo.output.plutusData!, "CBOR")

      .selectUtxosFrom(selectableUtxos)
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();
  } catch (evalError: any) {
    // Ogmios evaluation may fail while still producing a valid TX hex in the error message.
    const match = evalError.message.match(/For txHex: ([0-9a-f]+)/);
    if (match) {
      unsignedVoteTx = match[1];
    } else {
      throw evalError;
    }
  }

  return unsignedVoteTx;
}
