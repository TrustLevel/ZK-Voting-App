# Vote Integration Guide

Assumes the Group NFT, Semaphore NFT, and Voting NFT are already minted and the
voting event exists in the backend DB.

---

## Flow

### 1. Fetch event data — `GET /voting-event/:id`
Returns addresses, policy IDs, mintingOref, options, and dates for the voting event.
Call `applyOrefParamToScript(VALIDATORS.*.mint, mintingOref)` client-side to derive
`semaphoreValidatorCbor` and `votingValidatorCbor`.

### 2. Fetch Merkle proof — `GET /voting-event/:id/merkle-proof/:userId`
Returns `{ root, leaf, siblings, pathIndices }` — the voter's inclusion proof in the
group Merkle tree. Passed directly to the ZK circuit as the witness in step 4.

### 3. Encode vote signal — `encodeVoteSignal(voteSignal)` _(browser, @src/zk)_
CBOR-encodes the voter's choice as `List<(Int, Int)>`, e.g. `[[2, 1]]` for "1 vote for
option 2". The resulting hex string is both the on-chain `signal_message` and the
pre-image of `signal_hash` fed to the ZK circuit.

### 4. Generate ZK proof — `generateVoteProof(...)` _(browser, @src/zk)_
```
inputs:  identityNullifier, identityTrapdoor   ← never leave the client
         merkleProof                            ← from step 2
         externalNullifier                      ← BigInt('0x' + semaphoreNftPolicyId)
         signal: signalMessage                  ← from step 3
output:  { zkProof, nullifierHash, publicSignals }
```
Runs the Groth16 Semaphore circuit in the browser. Produces a compressed ZK proof,
the nullifier hash (used to prevent double-voting), and public signals
(`publicSignals[2]` = `signal_hash` as a BLS12-381 scalar).

### 5. Insert nullifier — `POST /voting-event/:id/nullifier`
```
body:    { nullifier: nullifierHash }
returns: { mpfProofSteps, mpfNewRoot }
```
Backend inserts the nullifier into the MPF trie. Fails if already present (double-vote).
The returned proof steps and new root are included in the on-chain redeemer.

### 6. Fetch current slot — `GET /current-slot`
Returns `{ currentSlot }` to compute the tx validity window
(`invalidHereafter = currentSlot + 1200`, a 20-minute window).

### 7. Build transaction — `buildVoteTransaction(params)` _(browser, @src/tx)_
Assembles the unsigned transaction CBOR. Fetches the Semaphore and Voting UTxOs from
chain, constructs `SemaphoreRedeemer.Signal` and the updated `UrnaDatum`, and attaches
the VKey UTxO as a read-only reference input.

### 8. Sign — `walletApi.signTx(unsignedTx, true)` _(CIP-30)_
Voter signs with their browser wallet (Eternl, Lace, Yoroi). The `true` flag enables
partial signing, required because `requiredSignerHash` is set on the transaction.

### 9. Submit — `POST /voting-event/:id/vote`
```
body:    { signedTx }
returns: { txHash }
```
Backend forwards the signed tx CBOR to Blockfrost for submission.

---

## `buildVoteTransaction` params

```typescript
{
  provider,                  // BlockfrostProvider (see known limitation below)

  // From GET /voting-event/:id
  semaphoreScriptAddress,    // VotingEvent.semaphoreAddress
  votingScriptAddress,       // VotingEvent.votingValidatorAddress
  semaphoreNftPolicyId,      // VotingEvent.semaphoreNft
  votingNftPolicyId,         // VotingEvent.votingNft
  groupNftPolicyId,          // VotingEvent.groupNft
  groupMerkleRoot,           // BigInt(VotingEvent.groupMerkleRootHash)
  weight,                    // VotingEvent.votingPower
  eventStart,                // VotingEvent.startingDate (POSIX ms)
  eventEnd,                  // VotingEvent.endingDate   (POSIX ms)
  currentOptions,            // parsed from VotingEvent.options → [[index, votes], ...]

  // Derived from VotingEvent.mintingOrefTxHash / mintingOrefIndex
  semaphoreValidatorCbor,    // applyOrefParamToScript(VALIDATORS.semaphore.mint, mintingOref)
  votingValidatorCbor,       // applyOrefParamToScript(VALIDATORS.voting.mint,    mintingOref)

  // From CIP-30 wallet
  walletUtxos, walletAddress, paymentKeyHash,

  // From step 4 (generateVoteProof)
  zkProof,
  nullifierHash,
  signalHash,                // BigInt(publicSignals[2])
  signalMessage,             // from step 3

  // From step 5 (POST /nullifier)
  mpfProofSteps,
  mpfNewRoot,

  voteSignal,                // e.g. [[2, 1]] — cast 1 vote for option 2

  // Note: vkeyRef is NOT a parameter — hardcoded as VKEY_REF_TX_HASH / VKEY_REF_OUTPUT_INDEX
  // in vote.ts and included as a read-only reference input automatically.
}
```

---

## Known Limitation

`buildVoteTransaction` uses `provider` internally to fetch the Semaphore and Voting UTxOs
from script addresses. This requires a Blockfrost API key on the frontend.
(The VKey UTxO is a hardcoded reference input — not fetched via the provider.)

**Planned fix:** add `GET /voting-event/:id/script-utxos` so the backend fetches those UTxOs
and the frontend can pass them directly, removing the Blockfrost dependency entirely.
