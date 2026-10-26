# On-Chain — Smart Contracts (Aiken)

The smart contracts are written in **Aiken** and compiled to Plutus v3. They run on the Cardano Preprod Testnet and enforce all voting rules on-chain: ZK proof verification, vote tallying, time bounds, and double-vote prevention via nullifiers.

Three validators work together on every vote transaction:

| Validator | Source | Controls |
|---|---|---|
| `voting` | `validators/voting.ak` | Voting NFT (Urna) — vote tally and event config |
| `semaphore` | `modulo-p/cardano-semaphore` | Semaphore NFT — ZK verifier, nullifier trie root |
| `group` | `modulo-p/cardano-semaphore` | Group NFT — participant Merkle root |

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

The compiled output is `plutus.json`, which contains the CBOR for the `voting` validator. However, the Semaphore and Group validators live in the `modulo-p/cardano-semaphore` dependency and are not included in this file — Aiken only writes each project's own validators to its `plutus.json`.

The transaction builder (`src/tx`) needs the compiled CBOR of **all three validators** at runtime to construct transactions. These CBORs are extracted from each project's `plutus.json` and written into `src/tx/src/validators.ts` by the extraction script. After any contract change, this extraction must be re-run:

```sh
# 1. Build the semaphore dependency as a standalone project so it produces its own plutus.json
cd src/on-chain/build/packages/modulo-p-cardano-semaphore
aiken build

# 2. Read both plutus.json files and write all validator CBORs into src/tx/src/validators.ts
cd src/tx
npm run build:force
```

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `aiken-lang/stdlib` | v2.2.0 | Standard library |
| `modulo-p/cardano-semaphore` | v0.9.4 | Semaphore + Group validators, ZK verifier |
| `aiken-lang/merkle-patricia-forestry` | v2.1.0 | MPF trie proof verification |
| `modulo-p/ak-381` | v0.1.1 | BLS12-381 field arithmetic and Groth16 verifier |


## Voting Validator (`validators/voting.ak`)

Controls the **Voting NFT** (Urna), which is the on-chain record of the voting event. It stores the vote tally, voting options, event dates, and the weight configuration.

The validator is parameterised by an `OutputReference` consumed at mint time, guaranteeing a globally unique policy ID per event.

### Types

```aiken
pub type UrnaDatum {
  weight: Int,             -- 1 = simple voting, >1 = weighted voting
  options: Options,        -- List<(option_index, vote_count)>, sorted ascending by index
  event_date: (Int, Int),  -- (start_slot, end_slot)
  semaphore_nft: PolicyId, -- Policy ID of the Semaphore NFT for this event
}

pub type UrnaRedeemer {
  Mint  -- Create the voting event
  Vote  -- Cast a vote
}
```

### Mint — Creating a Voting Event

Called once to initialise the voting event. Checks:

| # | Condition | Detail |
|---|---|---|
| 0 | One-shot minting | The `OutputReference` passed as a validator parameter must be present in `tx.inputs`. This makes the policy ID unique to this exact UTxO. |
| 1 | Single token minted | Exactly one token with this policy ID is minted (`amount == 1`). |
| 2 | NFT sent to script | The minted NFT must be locked at the validator's own script address. |
| 3 | Valid `UrnaDatum` attached | An inline datum of type `UrnaDatum` must be present on the script output. |
| 4 | Valid event dates | `event_start < event_end` and the transaction validity range ends before `event_start` (cannot mint after the event has started). |
| 5 | All vote counts zero | `check_initial_options_value()` confirms every `(index, count)` pair has `count == 0`. |
| 6 | Options indexes ascending | `check_options_index()` confirms indexes are `[0, 1, 2, ...]` with no gaps or duplicates. |

### Spend — Casting a Vote

Called on every vote transaction alongside the Semaphore validator. Checks:

| # | Condition | Detail |
|---|---|---|
| 1 | Semaphore NFT is spent | The transaction must include an input holding the Semaphore NFT (`dat.semaphore_nft` policy). This ties the vote to the correct Semaphore validator execution. |
| 2 | Voting NFT returned to script | The Voting NFT must be sent back to the same script address (value preservation). |
| 3 | Signal extracted from Semaphore redeemer | The `signal_message` is read directly from the Semaphore validator's `Signal` redeemer in `tx.redeemers`. The voting validator does not re-verify the ZK proof — it trusts the Semaphore validator to do so. |
| 4 | Within voting window | `is_interval_within(validity_range, dat.event_date)` ensures the transaction is entirely within `[event_start, event_end]`. |
| 5 | Datum immutability | `weight`, `event_date`, and `semaphore_nft` must be identical in the output datum. Only `options` (vote counts) may change. |

**Vote tally update — Simple voting (`weight <= 1`):**

```aiken
expect [vote_target] = vote         -- exactly one (option_index, 1) pair
simple_vote(dat.options, vote_target.1st) == out_dat.options
```

`simple_vote()` calls `update_option()` to increment the count at `option_index` by 1. Any signal encoding more than one option, or a count other than 1, is rejected.

**Vote tally update — Weighted voting (`weight > 1`):**

```aiken
weighted_vote(dat.options, vote) == out_dat.options  -- counts applied correctly
check_weight(vote, dat.weight)                        -- total counts == weight
```

`weighted_vote()` iterates the signal options and applies each `(index, count)` increment. `check_weight()` folds the counts and requires their sum to equal exactly `dat.weight`. A voter cannot distribute more or fewer points than the allowed weight.


## Semaphore Validator (`modulo-p/cardano-semaphore`)

Controls the **Semaphore NFT**, which holds the Groth16 verification key reference, the group Merkle root, and the MPF nullifier trie root. It is the validator responsible for all zero-knowledge cryptography.

### Types

```aiken
pub type SemaphoreDatum {
  group_token_policy:  PolicyId,        -- Policy ID of the Group NFT
  group_merke_root:    Int,             -- Current Semaphore group Merkle root
  nullifier_mpf_root:  ByteArray,       -- Current MPF nullifier trie root
  vkey_ref_input:      OutputReference, -- UTxO holding the Groth16 verification key
}

pub type SemaphoreRedeemer {
  Create
  Signal(groth16.Proof, mpf.Proof, Int, Int, ByteArray)
  --     zk_proof        mpf_proof  nullifier signal_hash signal_message
}
```

### Mint — Create

Called once to initialise the Semaphore NFT. Checks:

| # | Condition | Detail |
|---|---|---|
| 0 | One-shot minting | The `OutputReference` parameter must be consumed. |
| 1 | Single token minted | Exactly one Semaphore NFT is minted. |
| 2 | NFT sent to script | The minted NFT is locked at the validator's own address. |
| 3 | Valid `SemaphoreDatum` | Inline datum of correct type must be present. |
| 4 | Group Merkle root matches | The `group_merke_root` in the datum must equal the root stored in the Group NFT datum (read as a reference input). |
| 5 | MPF root is empty | `nullifier_mpf_root` must be the 32-byte zero hash — no nullifiers have been used yet. |

### Spend — Signal (Vote)

Called on every vote transaction. This is where all ZK cryptography is verified on-chain.

| # | Condition | Detail |
|---|---|---|
| 0 | NFT value returned | The Semaphore NFT must be sent back to the same script address. |
| 1 | Datum immutability | `group_merke_root`, `group_token_policy`, and `vkey_ref_input` must be unchanged. Only `nullifier_mpf_root` is updated. |
| 2 | VKey reference input | The UTxO at `dat.vkey_ref_input` (permanent, always-false script address) is included as a read-only reference input and contains the `SnarkVerificationKey` as its inline datum. |
| 3 | Groth16 proof valid | `groth_verify(snark_vkey, zk_proof, public_values)` where public values are `[group_merkle_root, nullifier, signal_hash, external_nullifier]`. The `external_nullifier` is derived from the script's own policy ID (as a BLS12-381 scalar), binding the proof to this specific voting event. |
| 4 | Nullifier inserted into MPF trie | The nullifier is converted to a little-endian byte array and its `blake2b_256` hash is used as the MPF key. `mpf.insert()` applies the proof steps and produces a new trie. The resulting root must match `out_datum.nullifier_mpf_root`. If the nullifier was already in the trie, `mpf.insert()` fails — double voting is cryptographically impossible. |
| 5 | Signal not tampered | `blake2b_256(signal_message) % BLS12_381_R == signal_hash`. The modular reduction aligns with the circom circuit's implicit field reduction, ensuring the on-chain recomputation matches the off-chain proof input. |

#### Why the external nullifier is the script hash

The external nullifier is the Semaphore validator's own policy ID interpreted as a BLS12-381 scalar. Since the policy ID is determined by the `OutputReference` consumed at mint time, it is unique per voting event. This means the same Semaphore identity produces a different `nullifierHash` in every voting event, preserving cross-event anonymity.

#### The VKey UTxO

The Groth16 verification key is large and would be expensive to include in every transaction. Instead it is locked once at the always-false script address:

```
addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8
TX: 3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083#0
```

This UTxO is permanently unspendable and is included as a **read-only reference input** on every vote transaction — zero ADA cost at vote time.


## Group Validator (`modulo-p/cardano-semaphore`)

Controls the **Group NFT**, which anchors the participant group Merkle root on-chain. It is updated whenever the organiser adds or removes participants.

### Types

```aiken
pub type GroupDatum {
  group_merke_root: Int,      -- Poseidon Merkle root of all identity commitments
  admin_pkh:        ByteArray -- Payment key hash of the event organiser
}

pub type GroupRedeemer {
  Create  -- Mint the Group NFT
  Update  -- Update the Merkle root (add/remove participants)
}
```

### Mint — Create

| # | Condition |
|---|---|
| 0 | One-shot minting — `OutputReference` parameter consumed |
| 1 | Exactly one Group NFT minted |
| 2 | Group NFT locked at the validator's own script address |

No Merkle root validation at mint time — the initial root is set by the organiser and the Semaphore validator checks it matches when the Semaphore NFT is created.

### Spend — Update

Called when the organiser submits a group-update transaction (after adding or removing participants):

| # | Condition |
|---|---|
| 0 | Transaction signed by `dat.admin_pkh` |
| 1 | Group NFT value returned to the same script address |

The new `GroupDatum` with the updated `group_merke_root` is written to the output. The Semaphore NFT datum is not automatically updated here — the Semaphore root and the Group root can temporarily diverge between participant changes and the next event start. The frontend is responsible for ensuring they match before voting begins.


## Utility Library (`lib/voting_utilities.ak`)

Key functions used by the Voting validator:

| Function | Description |
|---|---|
| `check_options_index(options)` | Verifies option indexes are `[0, 1, 2, ...]` — ascending, no gaps |
| `check_initial_options_value(options)` | Verifies all vote counts are zero |
| `update_option(options, index, quantity)` | Increments vote count at `index` by `quantity` |
| `simple_vote(options, index)` | Adds 1 to the option at `index`; fails on empty options, negative index, or out-of-range |
| `weighted_vote(options, target_options)` | Applies multiple `(index, count)` increments from the signal |
| `check_weight(target_options, allowed_weight)` | Sums all counts in `target_options`; must equal `allowed_weight` |
| `deserialise_signal(message)` | CBOR-decodes the `signal_message` byte array into `Options` |
| `is_interval_within(iv, time_pair)` | Checks the validity interval is entirely within `[start, end]` |
| `is_policy_on_value(value, policy_id)` | Checks a policy ID is present in a UTxO value |


## Vote Transaction Structure

A complete vote transaction spends two script inputs and produces two script outputs:

```
Inputs:
  ├─ Semaphore UTxO  (redeemer: Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message))
  └─ Voting UTxO     (redeemer: Vote)

Reference Inputs:
  └─ VKey UTxO       (read-only — contains SnarkVerificationKey datum)

Outputs:
  ├─ Semaphore UTxO  (same value, updated nullifier_mpf_root in datum)
  └─ Voting UTxO     (same value, updated options vote counts in UrnaDatum)
```

The Semaphore validator runs first and verifies the ZK proof. The Voting validator reads the `signal_message` from the Semaphore redeemer via `tx.redeemers` and applies the tally update — it does not re-run any ZK verification.


## Deployment (Two-Transaction Bootstrap)

### Transaction 1 — Group NFT

Mints the Group NFT using `buildGroupMintTransaction()`:
- Consumes an `OutputReference` that becomes the Group validator parameter.
- Locks the Group NFT at the Group script address with an initial `GroupDatum` (zero Merkle root, admin payment key hash).

### Transaction 2 — Semaphore + Voting NFTs

Mints both NFTs in a single transaction using `buildSemaphoreVotingMintTransaction()`:
- Consumes a second `OutputReference` — this becomes the parameter for both the Semaphore and Voting validators, guaranteeing their policy IDs are unique to this event.
- The Group NFT from Transaction 1 is included as a **reference input** so the Semaphore validator can verify the initial Merkle root matches.
- Locks the Semaphore NFT at the Semaphore script address with `SemaphoreDatum` (group root, zero MPF root, VKey UTxO reference).
- Locks the Voting NFT at the Voting script address with `UrnaDatum` (zero vote counts, event dates, weight).

The `OutputReference` consumed in Transaction 2 (`mintingOrefTxHash` / `mintingOrefIndex`) is stored in the backend database and used by the frontend to re-derive the parameterised validator CBORs at vote time via `applyOrefParamToScript()`.


## Testing

Tests are in `validators/tests/` (minting and spending logic) and `lib/tests/`. Run with:

```sh
aiken check
```

Coverage:
- `minting_logic_test.ak` — voting event creation, date validation, initial option values, option index ordering
- `spending_logic_test.ak` — simple vote tallying, weighted vote tallying, weight constraint enforcement, time bound enforcement, datum immutability
