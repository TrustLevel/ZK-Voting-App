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

## Validators

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

### Semaphore Validator (from `modulo-p/cardano-semaphore`)

Controls the **Semaphore NFT**, which holds the verification key datum and the group Merkle root.

On every vote transaction it:
1. Verifies the Groth16 ZK proof against the embedded verification key.
2. Confirms the proof's public inputs match: the group Merkle root, the nullifier hash, and the signal hash (`blake2b_256(signal_message) % BLS12_381_R`).
3. Verifies the MPF proof that the nullifier is being inserted into the trie for the first time.
4. Updates the stored MPF root in the datum.

The VKey UTxO is included as a **read-only reference input** (never consumed). Its address is the always-false script `addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8`, permanently locking it.

### Group Validator (from `modulo-p/cardano-semaphore`)

Controls the **Group NFT**, which anchors the group's identity on-chain. Updated when the organiser adds or removes participants and submits a group-update transaction.

---

## Key Types

### `UrnaDatum`

Stored on the Voting NFT UTxO:

```aiken
pub type UrnaDatum {
  weight: Int,                  // 1 = simple, >1 = weighted
  options: List<(Int, Int)>,    // [(option_index, vote_count), ...]
  event_date: (Int, Int),       // (start_slot, end_slot)
  semaphore_nft: PolicyId,      // Links to the Semaphore validator
}
```

### `SemaphoreRedeemer.Signal`

The redeemer submitted with every vote transaction:

```aiken
Signal {
  zk_proof:       CompressedProof,   // Groth16 proof (G1/G2 compressed points)
  mpf_proof:      MpfProof,          // MPF trie insertion proof steps
  nullifier:      ByteArray,         // Nullifier hash (prevents double voting)
  signal_hash:    Int,               // blake2b_256(signal_message) % r
  signal_message: ByteArray,         // CBOR-encoded vote options
}
```

---

## Deployment (Two-Transaction Bootstrap)

### Transaction 1 — Group NFT

Mints the Group NFT and locks it at the group validator address. The policy ID derived from this step is used to parameterise the Semaphore and Voting validators.

### Transaction 2 — Semaphore + Voting NFTs

Mints both NFTs in a single transaction:
- **Semaphore NFT**: datum contains the Groth16 verification key and the initial group Merkle root.
- **Voting NFT**: datum contains the `UrnaDatum` with zero vote counts.

The `OutputReference` consumed in this transaction is applied as a parameter to both validator scripts (`applyOrefParamToScript()`), guaranteeing globally unique policy IDs per event.

After deployment, the organiser calls `POST /voting-event/:eventId/save-blockchain-data` to persist the contract addresses in the backend database.

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
