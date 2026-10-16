# Smart Contract Audit — ZK-Voting-App

---

## Metadata

| Field | Value |
|-------|-------|
| **Project** | ZK-Voting-App |
| **Date** | 2026-09-29 |
| **Auditors** | AgustinBadi |
| **Commit** | |
| **Scope** | `src/on-chain/validators/voting.ak`, `src/on-chain/lib/voting_utilities.ak`, critical path of `modulo-p/cardano-semaphore` (ZK proof verification, nullifier uniqueness, signal hash validation) |
| **Out of scope** | Groth16 verifier implementation, BLS12-381 arithmetic (`ak-381`), Poseidon hash, MPF trie internals (`merkle-patricia-forestry`) |


---

## Executive Summary

> TODO: Short paragraph on the overall verdict. Finding counts by severity.

---

## Methodology and criterias

1. **Read and understand** — walk through `voting.ak` and `voting_utilities.ak` line by line.
2. **Map invariants** — identify every security property the contract must uphold, and locate exactly where (or whether) each one is enforced.
3. **Deep dives** — certain categories of code are prone to subtle errors and receive a dedicated closer look:
   - **Standard library functions are correctly applied** — especially interval and time conditions, where boundary semantics (open vs. closed) are a common source of off-by-one errors.
   - **Custom functions are correct** — each custom function is verified independently; no assumption is made that a function does what its name suggests.
4. **Write findings** — document confirmed bugs, potential issues, and observations with severity labels.

---

## Technology Overview

### `group.ak` — Group Validator

The contract is a **multi-validator**: a single Aiken validator (`group.ak`) that contains both a minting policy and a spending validator. The minting policy creates the Group NFT; the spending validator updates the group membership Merkle root.

The validator is **parameterised by an `OutputReference` (`oref`)**, making it a one-shot minting policy — the oref can only be consumed once, guaranteeing each voting event has a unique Group NFT that can never be minted twice.

The Group NFT is the **on-chain carrier of the voter group's Merkle root** — a hash that summarises all registered voter identity commitments. When a new voter registers, their Semaphore identity commitment is added to the Merkle tree off-chain, and the Group NFT's datum is updated with the new root. The Semaphore ZK proof takes this root as a public input: the voter proves they are a leaf in the tree identified by that root without revealing which leaf.

The Group NFT follows the **State Thread Token (STT)** pattern: each registration transaction spends the Group UTxO and returns it to the same script address with an updated `GroupDatum` carrying the new Merkle root, threading the group state forward as voters register.

**Group updates are admin-gated**: only the address recorded in `GroupDatum.admin_pkh` can submit an Update transaction. The contract does not verify the correctness of the new Merkle root — that computation is trusted to the backend. The contract only enforces that the admin authorised the change and that the Group NFT was returned intact.

---

### `semaphore.ak` — Semaphore Validator

The contract is a **multi-validator** that contains both a minting policy and a spending validator. The minting policy creates the Semaphore NFT; the spending validator processes votes (ZK signals) against it.

The validator is **parameterised by an `OutputReference` (`oref`)** — the same one-shot minting pattern as `group.ak` and `voting.ak`, guaranteeing a unique Semaphore NFT per event.

The Semaphore NFT follows the **State Thread Token (STT)** pattern. Its datum (`SemaphoreDatum`) carries: the Merkle root of the voter group, the Group NFT policy, the VKey reference UTxO, and the current nullifier MPF root. Each vote transaction spends the Semaphore UTxO and returns it with an updated `nullifier_mpf_root`, threading the nullifier state forward.

The spending validator is the **cryptographic core** of the system. It verifies:
1. A Groth16 ZK proof that the voter is a member of the group, without revealing which member.
2. A Merkle Patricia Forestry (MPF) nullifier insertion, preventing the same identity from voting twice.
3. A signal hash integrity check, ensuring the vote bytes were not swapped after proof generation.

The `SemaphoreDatum.vkey_ref_input` points to a permanently locked UTxO holding the Groth16 verification key. Including it as a reference input on every vote transaction allows the on-chain verifier to access the key without consuming it.

---

### `voting.ak` — Voting Validator

The contract is a **multi-validator**: a single Aiken validator (`voting.ak`) that contains both a minting policy and a spending validator. The minting policy creates the voting event NFT; the spending validator processes votes against it.

The validator is **parameterised by an `OutputReference` (`oref`)**, making it a one-shot minting policy — the oref can only be consumed once, which guarantees each voting event has a globally unique policy ID and that the NFT can never be minted twice.

The system leverages the **Semaphore protocol** (adapted for Cardano over BLS12-381, using Groth16 ZK-SNARKs) to provide two guarantees: proof of group membership (only enrolled participants can vote) and double-vote prevention (via a nullifier inserted into a Merkle Patricia Forestry trie on each vote). Critically, the voting validator does not verify the ZK proof itself — it delegates that responsibility to the Semaphore validator by checking that the Semaphore NFT was spent in the same transaction. The entire voting security rests on that single delegation check.

**Voter anonymity** is guaranteed by the ZK proof: a voter proves they belong to the group without revealing which member they are. The vote is recorded on-chain but cannot be linked to a specific identity.

Once a valid proof passes, the vote is recorded as an **option counter increment** in the `UrnaDatum` stored on the Urna NFT. Each option is an `(index, count)` pair; votes increment the relevant count. Two voting modes are supported: simple (one vote for one option) and weighted (vote weight distributed across multiple options).

The Urna NFT follows the **State Thread Token (STT)** pattern: it is the on-chain carrier of the current vote tally. Each vote transaction spends the Urna UTxO and returns it to the same script address with an updated `UrnaDatum`, threading state forward across the entire voting period. This is why the value preservation check in the spending validator (Cond. 2) is structurally critical — breaking it would sever the thread and allow the tally to be lost or corrupted.

Finally, the contract enforces a **voting window** defined by `(start, end)` timestamps set at mint time. This window is immutable — it cannot be altered by anyone, including the event administrator, once the NFT has been minted.

---


## Properties

### `group.ak` — Group validator

#### `mint` — Create a group

- **Condition 0:** The parameterised `oref` is consumed (one-shot uniqueness)
- **Condition 1:** Exactly one token minted under this policy
- **Condition 2:** Token sent to script address AND is the only non-lovelace asset there

These conditions establish two properties:

1. **NFT uniqueness** — Conditions 0 and 1 guarantee exactly one Group NFT can ever exist: the oref can only be consumed once, and exactly one token is minted.
2. **STT correctly initialised** — Condition 2 locks the token at the script address and ensures no other tokens are co-located at that output.

#### `spend` — Update a group

- **Condition 0:** Transaction signed by `dat.admin_pkh`
- **Condition 1:** Group NFT returned to same script address with equal non-lovelace value

These conditions establish two properties:

1. **Administrator proof of ownership** — Condition 0 gates all group updates behind the admin's signature. No other party can modify the group.
2. **STT continuity** — Condition 1 ensures the Group NFT is returned to the same script address with equal non-lovelace value, keeping the state thread alive.

> **Note:** Neither `mint` nor `spend` validates the `GroupDatum` structure. Datum correctness is trusted to the off-chain layer at creation time and to the admin at update time. → **[F-7]**

---

### `semaphore.ak` — Semaphore validator

#### `mint` — Create a semaphore state

- **Condition 0:** The parameterised `oref` is consumed (one-shot uniqueness)
- **Condition 1:** Exactly one token minted under this policy
- **Condition 2:** Token sent to script address; policy confirmed present in output value
- **Condition 3:** Valid `SemaphoreDatum` attached; Merkle root copied from the Group reference input
- **Condition 4:** Initial `SemaphoreDatum` nullifier MPF root is the null hash (empty trie)

These conditions establish two properties:

1. **NFT uniqueness** — Conditions 0 and 1: one-shot oref + exactly one token minted.
2. **STT correctly initialised** — Conditions 2–4: token locked at script with a well-formed datum and an empty nullifier trie.

#### `spend` — Cast a signal (vote)

- **Condition 0:** Semaphore NFT returned to same script address with equal non-lovelace value
- **Condition 1:** `SemaphoreDatum` fields `group_merke_root`, `group_token_policy`, `vkey_ref_input` preserved; only `nullifier_mpf_root` changes
- **Condition 2:** VKey reference input found at `dat.vkey_ref_input`; datum parsed as `SnarkVerificationKey`
- **Condition 3:** Groth16 ZK proof verified against the VKey with public inputs `[group_merke_root, nullifier, signal_hash, external_nullifier]`
- **Condition 4:** Nullifier inserted into MPF trie; new root must match `out_datum.nullifier_mpf_root` — prevents double voting
- **Condition 5:** Signal hash integrity: `blake2b_256(signal_message) % field_prime == signal_hash`

These conditions establish four properties:

1. **STT continuity** — Condition 0 returns the Semaphore NFT to the same script address unchanged.
2. **Datum preservation** — Condition 1 locks the three immutable state fields; only the nullifier root is updated.
3. **ZK proof validity** — Conditions 2 and 3 verify the voter's Groth16 proof against the published VKey using on-chain BLS12-381 arithmetic.
4. **Nullifier uniqueness and signal integrity** — Conditions 4 and 5 prevent double voting and guarantee the on-chain signal was not tampered after proof generation.

---

### `voting.ak` — Voting validator

The voting validator has two entry points and a catch-all:

### `mint` — Create a voting event

The `mint` handler correctly initialises a unique, well-formed voting event on-chain because it enforces the following conditions:

- **Condition 0:** The parameterised `oref` is consumed (one-shot uniqueness)
- **Condition 1:** Exactly one token is minted under this policy
- **Condition 2:** That token is sent to the script address; policy confirmed present in output value
- **Condition 3:** The output carries a valid `UrnaDatum` inline datum
- **Condition 4:** Event time is coherent: `start < end` and minting happens before `start`
- **Condition 5:** All option vote counts are initialised to 0
- **Condition 6:** Option indexes are consecutive starting at 0

These conditions establish four properties:

1. **NFT uniqueness** — Conditions 0 and 1 together guarantee that exactly one token can ever exist under this policy: Condition 0 makes the policy one-shot (the oref can never be consumed twice), and Condition 1 restricts the minted quantity to exactly 1.

2. **STT correctly initialised** — Conditions 2 and 3 set up the State Thread Token: Condition 2 locks the token at the script address, and Condition 3 attaches a well-typed `UrnaDatum` to it. Without both, the thread cannot begin.

3. **Valid voting window** — Condition 4 ensures the time configuration is coherent: the window is non-empty (`start < end`) and minting happens before voting opens, preventing backdated events.

4. **Clean initial state** — Conditions 5 and 6 guarantee the datum's options field is well-formed and unpolluted: Condition 5 prevents pre-stuffed vote counts, and Condition 6 enforces sequential indexing from 0.

### `spend` — Cast a vote

The `spend` handler correctly processes a single anonymous vote and updates the tally because it enforces the following conditions:

- **Condition 1:** Exactly one input holds the Semaphore NFT (proves Semaphore validator ran)
- **Condition 2:** The Urna NFT is returned to the same script address with equal non-lovelace value
- **Condition 3:** The Semaphore redeemer for that input is a `Signal(...)` — extracts `signal_message`
- **Condition 4:** The transaction validity range is entirely within the event time window
- **Condition 5:** `UrnaDatum` fields `weight`, `event_date`, `semaphore_nft` are preserved in output
- **Condition 6:** Vote tallies updated correctly:
  - **Simple** (`weight <= 1`): signal must carry exactly one option; that option incremented by 1
  - **Weighted** (`weight > 1`): signal may carry multiple options; total weight must equal `dat.weight`

These conditions establish four properties:

1. **Semaphore delegation** — Condition 1 proves the Semaphore validator ran and verified the ZK proof, nullifier, and signal hash. All ZK security properties — group membership, double-vote prevention, signal integrity — are delegated through this single check.

2. **STT continuity** — Condition 2 returns the Urna NFT to the same script address with equal non-lovelace value, keeping the state thread alive across the vote transaction.

3. **Valid vote action** — Conditions 3, 4, and 6 together define what a valid vote is: Condition 3 extracts the vote from the Semaphore signal, Condition 4 enforces the voting window, and Condition 6 applies the tally correctly in either simple or weighted mode.

4. **Datum preservation** — Condition 5 ensures the immutable parameters (`weight`, `event_date`, `semaphore_nft`) are unchanged across the transaction. Only the `options` tally is allowed to change.

### `else` — Catch-all

Any other purpose fails unconditionally.

---

### Invariants

| # | Invariant | Enforced at | Notes |
|---|-----------|-------------|-------|
| I1 | Each voting event has a unique policy ID | `mint` cond. 0 | |
| I2 | Exactly one Urna NFT exists per event | `mint` cond. 1 | |
| I3 | Urna NFT stays under script control | `mint` cond. 2, `spend` cond. 2 | |
| I4 | Vote counts start at zero | `mint` cond. 5 | |
| I5 | Option indexes are well-formed | `mint` cond. 6 | |
| I6 | Voting only within the event window | `spend` cond. 4 | |
| I7 | Only group members can vote | Semaphore validator (out of scope) | Trusted via I8 |
| I8 | Semaphore proof was verified before tallying | `spend` cond. 1 | |
| I9 | No double voting | Semaphore nullifier (out of scope) | Trusted via I8 |
| I10 | Vote data not tampered after proof | Semaphore signal hash (out of scope) | Trusted via I8 |
| I11 | Event parameters cannot change during voting | `spend` cond. 5 | `options` field intentionally mutable |
| I12 | Simple vote: exactly one option, count +1 | `spend` cond. 6a | |
| I13 | Weighted vote: total weight == `dat.weight` | `spend` cond. 6b | |

---

## Analysis

### `semaphore.ak` — `mint` Property 1: NFT uniqueness

```aiken
// Condition 0: Is expected UTxO spent?
expect Some(_nft_utxo) = find_input(inputs, oref)

// Condition 1: Is only one Semaphore NFT minted?
expect [Pair(_asset_name, amount)] =
  mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
let is_one_token_minted: Bool = amount == 1
```

Identical pattern to `group.ak` and `voting.ak` mint Property 1 — all three validators use the same one-shot uniqueness mechanism. The stdlib citations (`find_input`, `assets.tokens`, `dict.to_pairs`, `expect`) carry over from those earlier analyses.

`expect Some(...)` on `find_input` fails hard if the oref is absent; the oref can only be consumed once on Cardano, making the policy one-shot. `expect [Pair(_, amount)]` fails hard if zero or more than one asset name is minted; `amount == 1` checks the quantity.

*Confirmed by tests:* `mint_wrong_value` *(fail — quantity 2 → rejected).*

**Test gap:** No test for minting two tokens with different asset names under the same policy (each with quantity 1). Same structural gap as F-1 (voting.ak) and F-8 (group.ak) — `expect [Pair(_, amount)]` handles it, but not empirically confirmed. → **[F-11]**

---

### `semaphore.ak` — `mint` Property 2: STT correctly initialised

```aiken
// Condition 2: Is Semaphore NFT sent to script?
let own_script_credential = Script(policy_id)
expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address.payment_credential == own_script_credential })
let is_nft_sent_to_script: Bool =
  is_policy_on_value(output_to_script.value, policy_id)

// Condition 3: Is there a Semaphore Datum attached?
expect InlineDatum(out_datum) = output_to_script.datum
expect out_semaphore_dat: SemaphoreDatum = out_datum

// Condition 4: Is group merkle root correctly set?
expect [group_reference_input] =
  list.filter(reference_inputs, fn(i) {
    is_policy_on_value(i.output.value, out_semaphore_dat.group_token_policy)
  })
expect InlineDatum(group_datum) = group_reference_input.output.datum
expect group_datum_data: GroupDatum = group_datum
let is_merkle_root_correct: Bool =
  group_datum_data.group_merke_root == out_semaphore_dat.group_merke_root

// Condition 5: Is initial MPF root empty?
let is_nullifier_root_empty: Bool =
  out_semaphore_dat.nullifier_mpf_root == null_hash
```

Five sub-checks initialise the Semaphore state:

- **Condition 2**: same filter+`expect [...]`+`is_policy_on_value` pattern as `voting.ak` mint — exactly one output to the script address, carrying the policy. *Confirmed by test:* `mint_wrong_address` *(fail — output sent to wrong address → filter returns empty → `expect` rejects).*

- **Condition 3**: `expect InlineDatum(...)` and `expect out_semaphore_dat: SemaphoreDatum` — only an inline datum with the correct shape passes. *Confirmed by test:* `mint_no_datum` *(fail — `NoDatum` → `expect InlineDatum` rejects).*

- **Condition 4**: reads the Group NFT as a reference input and asserts that the Semaphore datum's `group_merke_root` matches the one in `GroupDatum`. This seeds the Semaphore state from the live on-chain group state at mint time, preventing a tampered root from being used.

  > *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

  *Confirmed by test:* `mint_group_root_tamper` *(fail — `semaphore_datum.group_merke_root` differs from `group_datum.group_merke_root` → `is_merkle_root_correct` is false → rejected).*

- **Condition 5**: asserts `nullifier_mpf_root == null_hash` (the all-zero 32-byte constant defined at the top of the validator). The nullifier trie must start empty — no pre-inserted nullifiers. *Confirmed by test:* `mint_mpf_root_wrong_setup` *(fail — `nullifier_mpf_root` is a non-zero hash → rejected).*

---

### `semaphore.ak` — `spend` Property 1: STT continuity

```aiken
// Find script input
expect Some(this_script_input) = find_input(inputs, utxo)
let this_script_address = this_script_input.output.address
expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address == this_script_address })
// Condition 0: Is script value sent back?
let is_value_returned: Bool =
  assets.without_lovelace(output_to_script.value) == assets.without_lovelace(
    this_script_input.output.value,
  )
```

Identical pattern to `voting.ak` spend Property 2 (STT continuity) and `group.ak` spend Property 2. The Semaphore NFT must be returned to the same address with equal non-lovelace value. All stdlib citations carry over from those analyses.

*Confirmed by test:* `spend_value_not_sent_back` *(fail — output sent to a different address → filter returns empty → `expect` rejects).*

---

### `semaphore.ak` — `spend` Property 2: Datum preservation

```aiken
// Condition 1: Is Datum preserved?
expect InlineDatum(out_data) = output_to_script.datum
expect out_datum: SemaphoreDatum = out_data
let is_datum_preserved: Bool = and {
    dat.group_merke_root == out_datum.group_merke_root,
    dat.group_token_policy == out_datum.group_token_policy,
    dat.vkey_ref_input == out_datum.vkey_ref_input,
  }
```

Three fields are checked for equality: `group_merke_root`, `group_token_policy`, and `vkey_ref_input`. The `nullifier_mpf_root` is intentionally absent — it is the only field permitted to change, updated by Condition 4.

This is the same design as `voting.ak` spend Property 4 (Datum preservation): immutable parameters are locked in place, and only the mutable state field is allowed to change across a transaction.

*Confirmed by tests:* `spend_datum_not_preserved_1` *(fail — `group_merke_root` changed in output)* and `spend_datum_not_preserved_2` *(fail — `group_token_policy` changed in output).*

---

### `semaphore.ak` — `spend` Property 3: ZK proof validity

```aiken
// Condition 2: Is Snark Verification Keys reference input correct?
expect Some(snark_vkey_ref_input) =
  find_input(reference_inputs, dat.vkey_ref_input)
expect InlineDatum(snark_vkey_input) = snark_vkey_ref_input.output.datum
expect snark_vkey: SnarkVerificationKey = snark_vkey_input

// Cond 3: Verify ZK proof
let public_values: List<Int> =
  [dat.group_merke_root, nullifier, signal_hash, scalar.to_int(external_nullifier)]
let is_snark_correct: Bool =
  groth_verify(snark_vkey, zk_proof, public_values)
```

- **Condition 2**: `find_input(reference_inputs, dat.vkey_ref_input)` locates the VKey UTxO from the transaction's reference inputs. The `vkey_ref_input` field is immutable (protected by Condition 1), so it cannot be redirected. `expect snark_vkey: SnarkVerificationKey` parses the datum — any other datum type fails hard. *Confirmed by test:* `spend_vkey_field_with_incorrect_value` *(fail — VKey datum contains integer `1` instead of `SnarkVerificationKey` → `expect` rejects).*

- **Condition 3**: `groth_verify` performs on-chain Groth16 verification (BLS12-381, out of scope). The public inputs are `[group_merke_root, nullifier, signal_hash, external_nullifier]`, where `external_nullifier` is derived from the validator's own script hash — binding the proof to this specific contract instance and preventing cross-contract proof replay. *Confirmed by test:* `spend_incorrect_zk_proof` *(fail — wrong piA/piB/piC → `groth_verify` returns false)*. Standalone ZK test: `snark_1` *(pass — valid proof and public values verify correctly).*

**Test gap:** The passing test `spend_signal_semaphore_1` puts `vkey_input` in `inputs` rather than `reference_inputs`, but the validator reads from `reference_inputs` (`find_input(reference_inputs, ...)`). With the current code, `find_input(reference_inputs, ...)` would return `None` and the `expect Some(...)` would fail — meaning the test is broken (it would fail at `aiken check`). → **[F-12]**

---

### `semaphore.ak` — `spend` Property 4: Nullifier uniqueness and signal integrity

```aiken
// Cond 4: Nullifier insertion (double-vote prevention)
let nullifier_mpf: MerklePatriciaForestry = mpf.from_root(dat.nullifier_mpf_root)
expect Some(n_value) = scalar.new(nullifier)
let nullifier_value: ByteArray = scalar.to_bytearray_little_endian(n_value, 0)
let nullifier_key: ByteArray = crypto.blake2b_256(nullifier_value)
let new_mpf_nullifier: MerklePatriciaForestry =
  mpf.insert(nullifier_mpf, nullifier_key, nullifier_value, mpf_proof)
let is_new_nullifier_root: Bool =
  mpf.from_root(out_datum.nullifier_mpf_root) == new_mpf_nullifier

// Condition 5: Is message tampered?
let message_digest_int =
  builtin.bytearray_to_integer(True, crypto.blake2b_256(signal_message)) % scalar.field_prime
let is_signal_message_tampered: Bool = message_digest_int == signal_hash
```

- **Condition 4**: `mpf.insert` inserts the nullifier into the MPF trie. If the nullifier is already present (double-vote attempt), `mpf.insert` raises a Merkle proof mismatch — the provided `mpf_proof` was computed against a trie where the nullifier is absent, so it cannot prove the nullifier's absence again. The output datum's `nullifier_mpf_root` must equal the new trie root after insertion, completing the state transition. *Confirmed by test:* `spend_nullifier_already_inserted` *(fail — input datum already has the post-insertion root → `mpf.insert` called on a trie that already contains the nullifier → MPF proof mismatch).*

- **Condition 5**: `blake2b_256(signal_message) % scalar.field_prime` recomputes the signal hash on-chain and asserts it equals the `signal_hash` in the redeemer — which is also a public input to the ZK proof (Condition 3). This two-point pin — hash in the proof public inputs + hash recomputed on-chain — ensures the `signal_message` bytes were not swapped after the proof was generated. The `% scalar.field_prime` reduction handles the ~55% of messages whose blake2b hash exceeds the BLS12-381 scalar field prime (see CLAUDE.md, Known Improvements). *Confirmed by test:* `spend_tampered_message` *(fail — `signal_message` replaced with `#"aabbccdd"` → hash mismatch → rejected).*

---

### `group.ak` — `mint` Property 1: NFT uniqueness

```aiken
// Condition 0: Is expected UTxO spent?
expect Some(_nft_utxo) = find_input(inputs, oref)

// Condition 1: Is only one Group NFT minted?
expect [Pair(_asset_name, amount)] =
  mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
let is_one_token_minted: Bool = amount == 1
```

Both conditions are enforced via `expect`:

> *"Keyword for non-exhaustive pattern matching that halts (fails) if the pattern doesn't match."*
> — [Aiken Glossary — expect](https://aiken-lang.org/glossary#expect)

- **Condition 0** uses `find_input` (stdlib `cardano/transaction`):

  > *"Find an input by its OutputReference."* `find_input(inputs: List<Input>, output_reference: OutputReference) -> Option<Input>`
  > — [stdlib cardano/transaction](https://aiken-lang.github.io/stdlib/cardano/transaction.html#find_input)

  `expect Some(...)` fails hard if the oref is absent. Since a UTxO can only be consumed once on Cardano, the policy can only mint in one transaction ever.

- **Condition 1** uses `assets.tokens` (stdlib `cardano/assets`):

  > *"Get all tokens associated with a given policy."* `tokens(self: Assets, policy_id: PolicyId) -> Dict<AssetName, Int>`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#tokens)

  `dict.to_pairs()` converts the result to a list. `expect [Pair(_, amount)]` matches exactly one element — fails hard if zero or more than one asset name is present. `amount == 1` checks the quantity. *Confirmed by test:* `mint_wrong_minted_value` *(fail — quantity 2 → rejected).*

**Test gap:** No test for minting two tokens with different asset names under the same policy (each with quantity 1). Same gap as `voting.ak` F-1 — the `expect [Pair(_, amount)]` pattern structurally handles it but it is not empirically confirmed. → **[F-8]**

---

### `group.ak` — `mint` Property 2: STT correctly initialised

```aiken
// Condition 2: Is Group NFT sent to script?
let own_script_credential = Script(policy_id)
expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address.payment_credential == own_script_credential })
let out_value: List<PolicyId> = without_lovelace(output_to_script.value) |> policies()
let is_nft_sent_to_script: Bool = out_value == [policy_id]
```

Three sub-steps lock the Group NFT at the script address:

- `list.filter` finds all outputs whose `payment_credential` matches `Script(policy_id)`:

  > *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

  `expect [output_to_script]` fails hard if zero or more than one such output exists — exactly one is required.

- `without_lovelace` strips ADA from the output value:

  > *"Get Assets excluding Ada."* `without_lovelace(self: Assets) -> Assets`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#without_lovelace)

- `policies` then returns all policy IDs present in the remaining value:

  > *"A list of all token policies in that Assets with non-zero tokens."* `policies(self: Assets) -> List<PolicyId>`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#policies)

  The equality `out_value == [policy_id]` asserts that the Group NFT is the *only* non-lovelace asset at that output — no other tokens can be co-locked. This is stricter than `voting.ak`'s Condition 2, which only checks presence (see **[F-9]**).

*Confirmed by test:* `mint_sent_to_wrong_address` *(fail — NFT sent to wrong script address → filter returns empty → `expect` rejects).*

**Test gap:** No test attempts to mint the Group NFT alongside an extra token in the same output. The `out_value == [policy_id]` equality structurally rejects it, but it is not empirically confirmed. → **[F-10]**

---

### `group.ak` — `spend` Property 1: Administrator proof of ownership

```aiken
// Condition 0: Is Tx signed by admin?
let is_signed_by_admin: Bool = list.has(extra_signatories, dat.admin_pkh)
```

`list.has` checks whether the admin's public key hash is in the transaction's `extra_signatories` list:

> *"Figures out whether a list contains the given element."* `has(self: List<a>, elem: a) -> Bool`
> — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#has)

`extra_signatories` is the list of required signers declared on the transaction. The Cardano ledger enforces that every key in this list has actually signed the transaction — the validator only needs to check that `dat.admin_pkh` is among them. Together, ledger + validator guarantee: only the admin's key can authorise a group update.

*Confirmed by test:* `spend_malicious_pkh` *(fail — `extra_signatories: [#"0abc"]` while `admin_pkh = #"0001"` → `list.has` returns false).*

---

### `group.ak` — `spend` Property 2: STT continuity

```aiken
// Condition 1: Is NFT value returned?
expect Some(this_script_input) = find_input(inputs, utxo)
let this_script_address = this_script_input.output.address
let this_script_value = this_script_input.output.value |> assets.without_lovelace()
expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address == this_script_address })
let is_value_returned: Bool =
  assets.without_lovelace(output_to_script.value) == this_script_value
```

Three sub-checks keep the state thread alive across each group update:

- `find_input(inputs, utxo)` locates the script's own input — already verified in `group.ak` mint Property 1. `expect Some(...)` fails hard if absent.

- `list.filter(outputs, fn(o) { o.address == this_script_address })` finds the output returning to the same address. The comparison uses full address equality — both payment credential and staking credential must match. `expect [output_to_script]` fails hard if zero or more than one such output exists:

  > *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

- `assets.without_lovelace` strips ADA from both sides before comparing — already cited in `voting.ak` spend Property 2. The equality asserts all native tokens (including the Group NFT) are returned intact. The Group NFT is always present on the input side (locked there at mint time), so this comparison is never trivially `empty == empty`.

*Confirmed by tests:* `spend_wrong_address` *(fail — output sent to a different address → filter returns empty → `expect` rejects)* and `spend_value_not_conserved` *(fail — output value missing the Group NFT → equality fails).*

---

### `voting.ak` — `mint` Property 1: NFT uniqueness

```aiken
// Condition 0: Is expected UTxO spent?
expect Some(_nft_utxo) = find_input(inputs, oref)

// Condition 1: Is only one Voting NFT minted?
expect [Pair(_asset_name, amount)] =
  mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
let is_one_token_minted: Bool = amount == 1
```

Both conditions are enforced via `expect`. The Aiken glossary defines it as:

> *"Keyword for non-exhaustive pattern matching that halts (fails) if the pattern doesn't match."*
> — [Aiken Glossary — expect](https://aiken-lang.org/glossary#expect)

If the pattern does not match, the transaction is immediately rejected with no fallback path.

- **Condition 0** uses `find_input` (stdlib `cardano/transaction`). The stdlib documents it as:

  > *"Find an input by its OutputReference."* `find_input(inputs: List<Input>, output_reference: OutputReference) -> Option<Input>`
  > — [stdlib cardano/transaction](https://aiken-lang.github.io/stdlib/cardano/transaction.html#find_input)

  The `expect Some(...)` wrapper fails hard if the oref is absent from the inputs. Since a UTxO can only be consumed once on Cardano, this guarantees the policy can only mint in one transaction ever. *Confirmed by test:* `wrong_parameter_utxo` *(fail — wrong oref → tx rejected).*

- **Condition 1** uses `assets.tokens` (stdlib `cardano/assets`). The stdlib documents it as:

  > *"Get all tokens associated with a given policy."* `tokens(self: Assets, policy_id: PolicyId) -> Dict<AssetName, Int>`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#tokens)

  `dict.to_pairs()` converts the result to a list. `expect [Pair(_, amount)]` matches exactly one element — fails hard if zero or more than one asset name is present. `amount == 1` then checks the quantity. *Confirmed by tests:* `tx_doesnt_mint_group_nft` *(zero minted → fail)* and `tx_mints_more_than_two_tokens` *(quantity 2 → fail).*

**Test gap:** The existing tests cover quantity > 1 for a single asset name, but there is no test for minting two tokens with *different* asset names under the same policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this case, but it is not empirically confirmed. → **[F-1]**

### `mint` — Property 2: STT correctly initialised

```aiken
// Condition 2: Is Voting NFT sent to script?
let own_script_credential = Script(policy_id)
expect [output_to_script] =
  list.filter(
    outputs,
    fn(o) { o.address.payment_credential == own_script_credential },
  )
let is_nft_sent_to_script: Bool =
  is_policy_on_value(output_to_script.value, policy_id)

// Condition 3: Is there a Urna Datum attached?
expect InlineDatum(out_datum) = output_to_script.datum
expect urna_datum: UrnaDatum = out_datum
```

Both conditions are enforced via `expect` (see Property 1 for the glossary definition).

- **Condition 2** (lines 45–52): builds a `Script(policy_id)` credential and filters all transaction outputs for those whose `payment_credential` matches. `expect [output_to_script]` fails hard if zero or more than one output reaches the script address — there must be exactly one. `is_policy_on_value` then confirms the policy is present in that output's value, using:

  > *"A list of all token policies in that Assets with non-zero tokens."* `policies(self: Assets) -> List<PolicyId>`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#policies)

  Soundness of `is_policy_on_value` was established in the Property 1 analysis: it is sound because Condition 0 guarantees no pre-existing tokens under `policy_id`. *Confirmed by test:* `wrong_address_output` *(fail — NFT sent to wrong address → filter returns empty → `expect` rejects).*

- **Condition 3** (lines 55–56): `Datum` is a 3-variant stdlib type (`NoDatum`, `DatumHash(DataHash)`, `InlineDatum(Data)`), defined in:

  > `cardano/transaction` — [stdlib cardano/transaction](https://aiken-lang.github.io/stdlib/cardano/transaction.html)

  `expect InlineDatum(out_datum)` rejects both `NoDatum` and `DatumHash` — only a fully inlined datum passes. `expect urna_datum: UrnaDatum = out_datum` then fails hard if the data does not match the `UrnaDatum` shape.

**Test gap:** No test attempts to mint with a missing datum, a datum-hash datum, or a datum of the wrong type. → **[F-2]**

---

### `mint` — Property 3: Valid voting window

```aiken
// Condition 4: Is voting event correctly set?
let (event_start, event_end) = urna_datum.event_date
let is_event_time_set: Bool =
  event_start < event_end && is_entirely_before(validity_range, event_start)
```

Two sub-checks combined with `&&`:

- `event_start < event_end` — ensures the event window has positive length: a degenerate or inverted interval is rejected.

- `is_entirely_before(validity_range, event_start)` ensures the minting window (the tx validity range) closes before the event opens. By the time voting starts, minting is already in the past. This is the correct Cardano pattern for time-ordering: since the ledger enforces that the tx is submitted within its validity range, asserting the validity range lies entirely before `event_start` guarantees the temporal ordering — mint first, then vote.

  > *"Check whether the interval is entirely before a given point."* `is_entirely_before(self: Interval, point: Int) -> Bool`
  > — [stdlib aiken/interval](https://aiken-lang.github.io/stdlib/aiken/interval.html#is_entirely_before)

  The source implementation checks the interval's `upper_bound`: if inclusive, requires `hi < point`; if exclusive, requires `hi <= point`.

  Both cases reduce to the same semantic — every value inside the interval is strictly less than `point` — but the operator flips depending on whether the endpoint is inside or outside the interval. This ensures the check is correct regardless of how the validity range was constructed.

  *Confirmed by test:* `wrong_event_date` *(fail — validity range starts at 0, equal to `event_start` → `is_entirely_before` returns false).*

**Test gap:** No test exercises the case where `event_start >= event_end` (inverted or zero-length window). The `event_start < event_end` check handles it, but it is not empirically confirmed. → **[F-3]**

### `mint` — Property 4: Clean initial state

```aiken
// Condition 5: Are all options set at 0?
let are_options_values_correct: Bool =
  check_initial_options_value(urna_datum.options)

// Condition 6: Are the options indexes in ascending order?
let are_options_indexes_correct: Bool =
  check_options_index(urna_datum.options)
```

Both conditions verify the `options` field of the datum is well-formed before the vote begins.

- **Condition 5** delegates to `check_initial_options_value`, which uses `list.all` (stdlib):

  > *"Determine if all elements of the list satisfy the given predicate."* `all(self: List<a>, predicate: fn(a) -> Bool) -> Bool`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#all)

  The predicate is `fn(e) { e.2nd == 0 }` — every option's count must be zero. This prevents a pre-stuffed tally at mint time. *Confirmed by test:* `wrong_option_values` *(fail — options `[(0,1),(1,5),(2,6)]` → `list.all` returns false).*

- **Condition 6** delegates to `check_options_index`, a custom recursive function. It rejects an empty options list with `error "Empty options"` — a voting event must have at least one option. It then calls `check_options_index_rec(options, 0)`, which walks the list asserting `o.1st == state` at each step and recurses with `state + 1`. By induction: base case `[]` → `True`; inductive step accepts only if the current index matches the expected position. *Confirmed by test:* `incorrect_options_index` *(fail — options `[(0,0),(3,0),(2,0)]` skip index 1 → rejected at position 1).*

**Improvement:** `check_options_index` rejects an empty list but does not enforce a minimum of 2 options. A single-option voting event passes all checks. Since the purpose is to offer voters a choice — at minimum two options, or three when abstain is included — a minimum count should be enforced. → **[F-4]**

### `spend` — Property 4: Datum preservation

```aiken
// Condition 5: Is UrnaDatum preserved?
expect InlineDatum(out_datum) = output_to_script.datum
expect out_dat: UrnaDatum = out_datum
let is_datum_preserved: Bool = and {
    dat.weight == out_dat.weight,
    dat.event_date == out_dat.event_date,
    dat.semaphore_nft == out_dat.semaphore_nft,
  }
```

The output datum is first extracted via `expect InlineDatum(...)` and `expect out_dat: UrnaDatum` — the same pattern verified in `mint` Property 2 and `spend` Property 2. Then three fields are checked for equality: `weight`, `event_date`, and `semaphore_nft`. The `options` field is intentionally absent from this check — it is the only field permitted to change, updated by Condition 6.

This separation is the key design decision: the immutable event parameters are locked in place for the lifetime of the event, while the mutable vote tally is the only thing the spending validator is allowed to modify.

*Confirmed by tests:* `datum_not_preserved` and `datum_not_preserved_2` *(fail — immutable fields altered or tally inconsistent).*

---

### `spend` — Property 3: Valid vote action

```aiken
// Condition 3
expect [Pair(Spend(_input), semaphore_redeemer)] =
  list.filter(redeemers, fn(r) { r.1st == Spend(semaphore_input.output_reference) })
expect semaphore_redeemer: SemaphoreRedeemer = semaphore_redeemer
expect Signal(_zk_proof, _mpf_proof, _nullifier, _signal_hash, signal_message) = semaphore_redeemer
let vote: Options = deserialise_signal(signal_message)

// Condition 4
let is_within_time_event: Bool =
  is_interval_within(validity_range, dat.event_date)

// Condition 6 — simple
expect [vote_target] = vote
let is_vote_correct: Bool = simple_vote(dat.options, vote_target.1st) == out_dat.options

// Condition 6 — weighted
let is_vote_correct: Bool = weighted_vote(dat.options, vote) == out_dat.options
let is_weight_correct: Bool = check_weight(vote, dat.weight)
```

- **Condition 3** filters the transaction redeemers for the one associated with the Semaphore input's `Spend` purpose. `expect [Pair(...)]` fails hard if not exactly one. `expect Signal(...)` then pattern-matches the redeemer type, extracting `signal_message`. `deserialise_signal` CBOR-decodes it into `Options` — the vote choices committed to in the ZK proof.

- **Condition 4** uses the custom `is_interval_within`:

  ```aiken
  pub fn is_interval_within(iv1: Interval<Int>, time_pair: (Int,Int)) -> Bool {
    interval.is_entirely_after(iv1, time_pair.1st) && interval.is_entirely_before(iv1, time_pair.2nd)
  }
  ```

  This is tighter than the mint check — both bounds are enforced. The validity range must lie entirely after `event_start` and entirely before `event_end`:

  > *"Check whether the interval is entirely after a given point."* `is_entirely_after(self: Interval, point: Int) -> Bool`
  > — [stdlib aiken/interval](https://aiken-lang.github.io/stdlib/aiken/interval.html#is_entirely_after)

  `is_entirely_before` was already verified in `mint` Property 3. Together they enforce the vote is cast strictly within the event window.

- **Condition 6 — simple** (`weight <= 1`): `expect [vote_target] = vote` enforces exactly one option in the signal. `simple_vote` checks the index is in range (errors on out-of-bounds) and increments that option by 1. The comparison with `out_dat.options` enforces the output tally is exactly what `simple_vote` produces. Sound — invalid indices fail hard.

- **Condition 6 — weighted** (`weight > 1`): `weighted_vote` applies all `(index, count)` pairs from the signal to the options. `check_weight` verifies the total weight sums to `dat.weight`. The comparison with `out_dat.options` enforces the output tally matches. However, `update_option` (used internally by `weighted_vote`) silently ignores an index that does not exist in the options list — weight assigned to a non-existent option is discarded without failing. `check_weight` does not detect this, as it only sums the counts in the signal, not in the updated tally. A voter could silently lose part of their weight. → **[F-6]**

*Confirmed by tests:* `wrong_option_format`, `wrong_option_format_2` *(fail — incorrect tally)*, `vote_out_of_time`, `vote_out_of_time_2`, `vote_out_of_time_3` *(fail — validity range outside event window).*

---

### `spend` — Property 2: STT continuity

```aiken
// Condition 2: Is Vote NFT sent back to script?
expect Some(this_script_input) = find_input(inputs, utxo)

let this_script_address = this_script_input.output.address
expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address == this_script_address })

let is_value_returned: Bool =
  assets.without_lovelace(output_to_script.value) == assets.without_lovelace(
    this_script_input.output.value,
  )
```

Three sub-checks keep the state thread alive:

- `find_input(inputs, utxo)` locates the script's own input (the Urna UTxO currently being spent). Already verified in `mint` Property 1 analysis.

- `list.filter(outputs, fn(o) { o.address == this_script_address })` finds the output returning to the same address. The comparison uses full address equality — both payment credential and staking credential must match. `expect [output_to_script]` fails hard if zero or more than one such output exists.

- `assets.without_lovelace` strips ADA from both sides before comparing:

  > *"Get Assets excluding Ada."* `without_lovelace(self: Assets) -> Assets`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#without_lovelace)

  The source implementation deletes the ADA policy key from the value's inner dictionary. The equality check then asserts that all native tokens — including the Urna NFT — are preserved in the output.

  The code carries a TODO comment questioning whether `empty_value == empty_value` could trivially pass. This cannot happen: `this_script_input` is the Urna UTxO, which always holds the Urna NFT (locked there at mint time). `without_lovelace` on the input side always returns a non-empty value. The TODO should be removed. → **[F-5]**

*Confirmed by test:* `group_token_has_not_been_returned` *(fail — output carries only lovelace, no NFT → `without_lovelace` comparison fails).*

---

### `spend` — Property 1: Semaphore delegation

```aiken
// Condition 1: Does spent the Semaphore token.
expect [semaphore_input] =
  list.filter(
    inputs,
    fn(i) { is_policy_on_value(i.output.value, dat.semaphore_nft) },
  )
```

This is the most load-bearing line in the contract. The voting validator does not verify the ZK proof itself — it delegates that responsibility entirely to the Semaphore validator. The delegation is enforced by requiring the Semaphore NFT to be spent in the same transaction: if the Semaphore NFT is present as an input, the Semaphore validator necessarily ran and accepted the transaction. All ZK security properties — group membership, double-vote prevention via nullifier, and signal hash integrity — are trusted through this single check.

`list.filter` is used to find the Semaphore input:

> *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
> — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

`expect [semaphore_input]` fails hard if zero or more than one input carries the Semaphore policy — exactly one is required. The predicate uses `is_policy_on_value`, which checks policy presence only (already verified sound in the `mint` Property 1 analysis). This is sufficient here because the Semaphore NFT is itself a one-shot token — unique by the same guarantee as the Urna NFT — so there can be at most one input carrying that policy.

*Confirmed by test:* `has_not_semaphore_input` *(fail — semaphore input carries only lovelace, no NFT policy → filter returns empty → `expect` rejects).*

---

## Findings

Findings are classified into four tiers:

- **Critical** — a bug that can break or exploit the contract's security guarantees.
- **Improvement** — the logic is correct but there is a simpler, cleaner, or more robust way to do it.
- **Good** — solid and correct implementation, explicitly verified.
- **Note** — an observation worth documenting that does not fit the above (misleading comments, dead code, etc.).

Each finding follows this structure:

> **[F-N] Title**
> - **Type:** Critical / Improvement / Good / Note
> - **Location:** `file:line`
> - **Description:**
> - **Impact:**
> - **Recommendation:**
> - **Status:** Open / Acknowledged / Fixed

---

### Improvements

**[F-4] No minimum options count enforced**
- **Type:** Improvement
- **Location:** `src/on-chain/lib/voting_utilities.ak:24`
- **Description:** `check_options_index` rejects an empty options list but does not enforce a minimum of 2. A single-option voting event passes all mint checks. A meaningful vote requires at least two options; with an abstain option, at least three.
- **Recommendation:** Add a `list.length(options) >= 2` (or `>= 3`) guard in `check_options_index` before the recursive check.
- **Status:** Open

**[F-5] Unresolved TODO comment on value preservation check**
- **Type:** Improvement
- **Location:** `src/on-chain/validators/voting.ak:106`
- **Description:** A TODO comment questions whether `assets.without_lovelace(output) == assets.without_lovelace(input)` could trivially pass if both sides are empty. This cannot happen — `this_script_input` is the Urna UTxO, which always holds the Urna NFT from mint time, so the input side is never empty. The comment should be resolved and removed.
- **Recommendation:** Remove the TODO comment.
- **Status:** Open

**[F-9] `voting.ak` Condition 2: weaker NFT destination check than `group.ak`**
- **Type:** Improvement
- **Location:** `src/on-chain/lib/voting_utilities.ak:111`, `src/on-chain/validators/voting.ak:52`
- **Description:** `voting.ak` Condition 2 uses `is_policy_on_value` to confirm the Urna NFT reached the script address. This only checks that the policy is *present* in the output value — other tokens can coexist in the same output. `group.ak` uses the stricter `policies(without_lovelace(value)) == [policy_id]`, which asserts the NFT is the *only* non-lovelace asset at that output. Both serve the same purpose, but `group.ak`'s approach is more defensive.
- **Recommendation:** Replace `is_policy_on_value(output_to_script.value, policy_id)` with `assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]` to align with `group.ak` and prevent unintended tokens from being co-locked at the Urna UTxO.
- **Status:** Open

### Notes

**[F-1] `voting.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** The existing test `tx_mints_more_than_two_tokens` covers quantity > 1 for a single asset name. There is no test for the case where two tokens with *different* asset names (each with quantity 1) are minted under the same policy. The `expect [Pair(_, amount)]` pattern structurally handles this, but it is not empirically confirmed.
- **Recommendation:** Add a test that attempts to mint two tokens with distinct asset names under the voting policy and asserts failure.
- **Status:** Open

**[F-2] `voting.ak`: no test for missing or non-inline datum on mint output**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint while sending the output with `NoDatum`, `DatumHash`, or a datum of the wrong type. Condition 3 uses `expect InlineDatum(...)` and `expect urna_datum: UrnaDatum`, which structurally reject all three cases, but none are empirically confirmed.
- **Recommendation:** Add failure tests for `NoDatum` output, `DatumHash` output, and a datum that does not match `UrnaDatum`.
- **Status:** Open

**[F-3] `voting.ak`: no test for inverted or zero-length voting window**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint with `event_start >= event_end`. The `event_start < event_end` check in Condition 4 handles it, but it is not empirically confirmed.
- **Recommendation:** Add a failure test with `event_start == event_end` and another with `event_start > event_end`.
- **Status:** Open

**[F-6] `voting.ak`: weighted vote — invalid option index silently discards weight**
- **Type:** Note
- **Location:** `src/on-chain/lib/voting_utilities.ak:40`
- **Description:** `update_option` returns the options unchanged if the given index is not found, rather than failing. `weighted_vote` calls `update_option` for each `(index, count)` pair in the signal. `check_weight` only verifies the total weight in the signal sums to `dat.weight` — it does not verify all indices are valid. A voter can include weight on a non-existent option index: `check_weight` passes, but that weight is silently lost from the tally. The voter's nullifier is consumed. This is asymmetric with simple mode, where `simple_vote` fails hard on an invalid index.
- **Recommendation:** Add an index validation step in `weighted_vote` or `check_weight` to verify all option indices in the signal exist in `dat.options`. Alternatively, make `update_option` fail on a missing index.
- **Status:** Open

**[F-7] `group.ak` does not validate `GroupDatum` structure**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/group.ak`
- **Description:** Neither `mint` nor `spend` validate the `GroupDatum` inline datum. At mint time no datum check exists at all; at update time the admin is trusted to write a correct datum. A malformed datum at mint time would not be caught by `group.ak` — errors would surface later in `semaphore.ak` mint (which reads the Group reference input). This is a deliberate trade-off for cheaper execution, but the assumption is implicit.
- **Recommendation:** Document the off-chain invariant explicitly. Optionally add a minimal datum shape check at mint time.
- **Status:** Open

**[F-8] `group.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** Same gap as F-1 in `voting.ak`. No test attempts to mint two tokens with distinct asset names under the Group policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this but it is not empirically confirmed.
- **Recommendation:** Add a failure test minting two tokens with distinct asset names under the group policy.
- **Status:** Open

**[F-10] `group.ak`: no test for minting Group NFT alongside an extra token**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** No test attempts to mint the Group NFT while sending an extra token (under a different policy) to the same script output. The `policies(without_lovelace(value)) == [policy_id]` check structurally rejects it, but it is not empirically confirmed.
- **Recommendation:** Add a failure test that includes an extra token in the minted output alongside the Group NFT.
- **Status:** Open

**[F-11] `semaphore.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** Same gap as F-1 (voting.ak) and F-8 (group.ak). No test attempts to mint two tokens with distinct asset names under the Semaphore policy (each with quantity 1). `expect [Pair(_, amount)]` structurally handles it, but not empirically confirmed.
- **Recommendation:** Add a failure test minting two tokens with distinct asset names under the Semaphore policy.
- **Status:** Open

**[F-12] `semaphore.ak`: passing spend test has VKey UTxO in wrong field**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak:655`
- **Description:** `spend_signal_semaphore_1` (the only passing spend test) puts `vkey_input` in `inputs`, but `semaphore.ak` Condition 2 uses `find_input(reference_inputs, dat.vkey_ref_input)`. With the current validator code, the VKey UTxO is not in `reference_inputs`, so `expect Some(...)` would fail and the test itself would fail at `aiken check`. The test was likely written before the v0.9.4 fix that changed `inputs` to `reference_inputs`.
- **Recommendation:** Move `vkey_input` to `reference_inputs` in `spend_signal_semaphore_1` (and all other spend tests). Verify `aiken check` passes.
- **Status:** Open

---

## Changes Made

> What was fixed or acknowledged in response to findings. Documents the response to each finding and closes the loop.

---

## Conclusions

> Overall security posture, known residual risks, and what is trusted to the upstream dependency.


---

## Tasks

- [ ] Read `voting.ak` mint logic together
- [ ] Read `voting.ak` spend logic together
- [ ] Read `voting_utilities.ak` together
- [ ] Map invariants to enforcement
- [ ] Deep dive: `is_policy_on_value` (custom function)
- [ ] Deep dive: `is_entirely_before` / `is_interval_within` (interval conditions)
- [ ] Adversarial path analysis (mint)
- [ ] Adversarial path analysis (spend)
- [ ] Test coverage gap analysis
- [ ] Write findings and summary
- [ ] **Before applying any finding fix: verify the change does not break the current running application (vote.trustlevel.io). Re-run on-chain tests (`aiken check`) and end-to-end vote flow after each change.**

<!-- STRUCTURE NOTES
- Technology Overview: high-level, no code — what the system is, what problem it solves,
  key concepts (ZK proofs, Semaphore, one-shot NFT pattern). Written for a reader unfamiliar
  with the project.

- Observations: where the audit work lives. Uses a claim + evidence format per validator:
  "This validator intends to [X]. It achieves this because condition A enforces Y,
  condition B enforces Z..." A missing or weak condition is where a finding falls out naturally.
  The invariants table lives here as a reference anchor — defined once, then each validator
  analysis points back to them. Observations IS the invariant verification; it does not need
  a separate invariants section.
-->
