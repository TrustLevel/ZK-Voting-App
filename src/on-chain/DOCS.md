# On-Chain — Smart Contracts (Aiken)

The smart contracts are written in **Aiken** and compiled to Plutus v3. They run on the Cardano Preprod Testnet and enforce all voting rules on-chain: proof verification, vote tallying, time bounds, and double-vote prevention.

---

## Setup

### Prerequisites

- [Aiken v1.1.19](https://aiken-lang.org/installation-instructions)

### Build and test

```sh
cd src/on-chain
aiken build              # compile → plutus.json
aiken check              # run all tests
aiken check -m <pattern> # run specific tests
aiken docs               # generate HTML documentation
```

The compiled output is `plutus.json`. The transaction builder (`src/tx`) reads this file to extract validator CBORs — run `npm run build:force` in `src/tx` after any contract change.

---

## Network Configuration

| Parameter | Value |
|---|---|
| Network | Cardano Preprod Testnet |
| `network_id` | `41` (in `aiken.toml`) |
| Plutus version | v3 |
| Curve | BLS12-381 |

---

## Dependencies

Declared in `aiken.toml`:

| Package | Version | Purpose |
|---|---|---|
| `aiken-lang/stdlib` | v2.2.0 | Standard library |
| `modulo-p/cardano-semaphore` | v0.9.4 | Semaphore + Group validators, ZK verifier |
| `aiken-lang/merkle-patricia-forestry` | v2.1.0 | MPF trie proof verification |
| `modulo-p/ak-381` | v0.1.1 | BLS12-381 field arithmetic |

---

## Key Types

### Group

**`GroupDatum`** — stored on the Group NFT UTxO. Anchors the participant set on-chain.

```aiken
pub type GroupDatum {
  group_merke_root: Int,   // Poseidon root of the identity commitment Merkle tree
  admin_pkh:        ByteArray,  // Payment key hash of the event organiser
}
```

**`GroupRedeemer`** — actions on the Group NFT.

```aiken
pub type GroupRedeemer {
  Create   // Mint — initialise the group at event bootstrap
  Update   // Spend — update the Merkle root when participants are added or removed
}
```

---

### Semaphore

**`SemaphoreDatum`** — stored on the Semaphore NFT UTxO. Holds the ZK verification key reference, the current group root, and the nullifier trie root.

```aiken
pub type SemaphoreDatum {
  group_token_policy: PolicyId,        // Policy ID of the Group NFT (links to GroupDatum)
  group_merke_root:   Int,             // Poseidon root of the participant Merkle tree
  nullifier_mpf_root: ByteArray,       // MPF trie root of used nullifiers
  vkey_ref_input:     OutputReference, // Reference to the permanent VKey UTxO
}
```

**`SemaphoreRedeemer`** — actions on the Semaphore NFT.

```aiken
pub type SemaphoreRedeemer {
  Create                                              // Mint — initialise at bootstrap
  Signal(groth16.Proof, mpf.Proof, Int, Int, ByteArray)  // Spend — cast a vote
  //     zk_proof       mpf_proof  nullifier  signal_hash  signal_message
}
```

The `Signal` constructor carries everything the on-chain verifier needs:

| Position | Type | Description |
|---|---|---|
| `zk_proof` | `groth16.Proof` | Groth16 proof — three compressed BLS12-381 curve points (πA ∈ G1, πB ∈ G2, πC ∈ G1) |
| `mpf_proof` | `mpf.Proof` | MPF trie insertion proof — verifies the nullifier is new |
| `nullifier` | `Int` | Nullifier hash as a BLS12-381 scalar integer |
| `signal_hash` | `Int` | `blake2b_256(signal_message) % BLS12_381_R` |
| `signal_message` | `ByteArray` | CBOR-encoded vote options `List<(Int, Int)>` |

**`groth16.Proof`** — the three elliptic curve points of a Groth16 proof (from `modulo-p/ak-381`).

```aiken
pub type Proof {
  piA: ByteArray,  // Compressed G1 point (48 bytes)
  piB: ByteArray,  // Compressed G2 point (96 bytes)
  piC: ByteArray,  // Compressed G1 point (48 bytes)
}
```

---

### Voting

**`UrnaDatum`** — stored on the Voting NFT UTxO. Holds the live vote tally and event configuration.

```aiken
pub type UrnaDatum {
  weight:        Int,             // 1 = simple voting, >1 = weighted voting
  options:       List<(Int, Int)>, // [(option_index, vote_count), ...]
  event_date:    (Int, Int),      // (start_slot, end_slot)
  semaphore_nft: PolicyId,        // Policy ID of the Semaphore NFT (links validators)
}
```

**`UrnaRedeemer`** — actions on the Voting NFT.

```aiken
pub type UrnaRedeemer {
  Mint  // Create the voting event and initialise the datum
  Vote  // Cast a vote — updates the tally in UrnaDatum.options
}
```

---

## Validators

### Group Validator (from `modulo-p/cardano-semaphore`)

Controls the **Group NFT**, which anchors the participant group on-chain. Its datum holds the current Merkle root of all registered identity commitments — the root that the ZK circuit uses as a public input when verifying voter membership.

**Mint redeemer (`Create`)**

Initialises the group at event bootstrap. Validates:
- The minting is one-shot (a specific UTxO is consumed as entropy).
- Exactly one Group NFT is minted and sent to the group validator address.
- The initial `GroupDatum` is attached as an inline datum.
- The initial Merkle root in the datum matches the root in the Semaphore NFT datum (read as a reference input), ensuring both validators start from the same group state.

**Spend redeemer (`Update`)**

Updates the group Merkle root when participants are added or removed. Validates:
- The transaction is signed by the admin payment key hash stored in `GroupDatum.admin_pkh`.
- The Group NFT is returned to the script address (value preserved).
- The new `GroupDatum` is correctly attached with the updated Merkle root.

After an `Update` transaction confirms, the organiser calls `POST /voting-event/:eventId/confirm-group-update` to sync the new root in the backend database.

### Semaphore Validator (from `modulo-p/cardano-semaphore`)

Controls the **Semaphore NFT**, which holds the verification key datum and the group Merkle root.

On every vote transaction it:
1. Verifies the Groth16 ZK proof against the embedded verification key.
2. Confirms the proof's public inputs match: the group Merkle root, the nullifier hash, and the signal hash (`blake2b_256(signal_message) % BLS12_381_R`).
3. Verifies the MPF proof that the nullifier is being inserted into the trie for the first time.
4. Updates the stored MPF root in the datum.

The VKey UTxO is included as a **read-only reference input** (never consumed). Its address is the always-false script `addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8`, permanently locking it.

### `voting.ak` — Voting Validator

Controls the lifecycle of the **Voting NFT** (Urna), which holds the vote tally and event configuration.

**Mint redeemer (`Mint`)**

Creates the voting event. Validates:
- The minting is one-shot (uses a specific UTxO as entropy).
- The initial `UrnaDatum` has zero vote counts for all options.
- The event dates are valid (start < end, minting before start).
- The Semaphore NFT policy is referenced correctly.

**Spend redeemer (`Vote`)**

Processes a vote. Validates:
- The voting window is open (current slot ≥ start, ≤ end).
- The Voting NFT is returned to the script address (value preserved).
- The `UrnaDatum` is updated correctly according to the vote signal.
- **Simple voting** (`weight ≤ 1`): `signal_message` encodes exactly one `(option_index, 1)` pair.
- **Weighted voting** (`weight > 1`): the counts in `signal_message` sum exactly to `weight` (`check_weight()` in `voting_utilities.ak`).


---


## System Workflow

### Phase 1 — Event Bootstrap (two transactions)

**Transaction 1 — Group NFT mint**

The organiser's frontend calls `buildGroupMintTransaction()`, which mints a **Group NFT** and locks it at the group validator address. The NFT policy ID becomes the group identifier and is used to parameterise the Semaphore and Voting validators in the next transaction.

**Transaction 2 — Semaphore + Voting NFT mint**

A second transaction mints:
- A **Semaphore NFT** — datum contains the Groth16 verification key and the initial group Merkle root. Locked at the Semaphore validator address.
- A **Voting NFT** (Urna) — datum contains the `UrnaDatum` (vote options, tally, event dates, weight), all tallies initialised to zero. Locked at the Voting validator address.

The `OutputReference` consumed in this transaction is applied as a parameter to both validator scripts via `applyOrefParamToScript()`, guaranteeing globally unique policy IDs per event.

After both transactions confirm, the organiser calls `POST /voting-event/:eventId/save-blockchain-data` to persist the contract addresses in the backend database.

### Phase 2 — Participant Registration

For each participant:

1. The participant derives their identity commitment client-side: `poseidon(poseidon(trapdoor, nullifier))`.
2. The commitment is submitted to the backend via `POST /voting-event/:eventId/participants`.
3. The backend inserts the commitment as a new leaf in the incremental Merkle tree, recomputes the root, and stores the updated state in the database.
4. Once all participants are enrolled, the organiser submits a group-update transaction that writes the final Merkle root on-chain into the Group NFT datum. The on-chain root must match the off-chain root used as a ZK circuit public input.

### Phase 3 — Casting a Vote

1. **Fetch Merkle proof** — the frontend calls `GET /voting-event/:eventId/merkle-proof/:userId` to retrieve the sibling path (`siblings`, `pathIndices`) from the participant's leaf to the Merkle root.
2. **Encode the signal** — `encodeVoteSignal()` CBOR-encodes the chosen vote options as `List<(Int, Int)>`. The `blake2b_256` hash of this encoding, reduced modulo the BLS12-381 scalar field prime, becomes the circuit's public input (`signal_hash`).
3. **Generate ZK proof** — `generateVoteProof()` runs the Groth16 prover in the browser (snarkjs + WASM). Inputs: the voter's secret identity, the Merkle proof, and the signal hash. Output: a compressed proof and the nullifier hash. The voter's secrets never leave the browser.
4. **Insert nullifier** — the frontend calls `POST /voting-event/:eventId/nullifier` with the nullifier hash. The backend inserts it into the MPF trie (LevelDB) and returns the CBOR-encoded proof steps and updated trie root.
5. **Build and submit** — `buildVoteTransaction()` assembles a Cardano transaction that:
   - Spends the **Semaphore NFT** with a `Signal` redeemer containing the ZK proof, MPF proof, nullifier, signal hash, and signal message.
   - Spends the **Voting NFT** with a `Vote` redeemer.
   - Includes the **VKey UTxO** as a read-only reference input (permanently locked, never consumed).
   - Outputs updated datums: new MPF root in the Semaphore NFT, incremented vote tally in the Voting NFT.
   - Signed via CIP-30 and submitted through Blockfrost.
6. **On-chain validation** — the Semaphore validator verifies the Groth16 proof against the verification key and group Merkle root, and verifies the MPF proof of fresh nullifier insertion. The Voting validator verifies the signal decodes to valid options and that the weight constraint is satisfied.

### Results

Vote tallies are stored directly in the `UrnaDatum` on the Voting UTxO. Any observer can query the UTxO from the blockchain and read the current counts without needing the backend.

---


## Deployment (Two-Transaction Bootstrap)

Each voting event is bootstrapped with two on-chain transactions. See [System Workflow → Phase 1](#system-workflow) for the full narrative.

| Step | Transaction | What is minted |
|---|---|---|
| 1 | Group NFT mint | Group NFT — locked at the group validator; its policy ID parameterises the next validators |
| 2 | Semaphore + Voting NFT mint | Semaphore NFT (VKey + Merkle root datum) and Voting NFT (zeroed `UrnaDatum`), both parameterised with the consumed `OutputReference` |

After both transactions confirm, call `POST /voting-event/:eventId/save-blockchain-data` to persist the contract addresses in the backend.

---

## Testing

Tests are in `validators/tests/` and `lib/tests/`. Run with:

```sh
aiken check
```

Coverage includes:
- Option index validation
- Initial value validation
- Time interval enforcement
- Simple voting correctness
- Weighted voting weight constraint
- Vote tally updates
