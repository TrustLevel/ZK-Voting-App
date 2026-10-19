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

### `voting.ak` — Voting Validator

The contract is a **multi-validator**: a single Aiken validator (`voting.ak`) that contains both a minting policy and a spending validator. The minting policy creates the voting event NFT; the spending validator processes votes against it.

The validator is **parameterised by an `OutputReference` (`oref`)**, making it a one-shot minting policy — the oref can only be consumed once, which guarantees each voting event has a globally unique policy ID and that the NFT can never be minted twice.

The system leverages the **Semaphore protocol** (adapted for Cardano over BLS12-381, using Groth16 ZK-SNARKs) to provide two guarantees: proof of group membership (only enrolled participants can vote) and double-vote prevention (via a nullifier inserted into a Merkle Patricia Forestry trie on each vote). Critically, the voting validator does not verify the ZK proof itself — it delegates that responsibility to the Semaphore validator by checking that the Semaphore NFT was spent in the same transaction. The entire voting security rests on that single delegation check.

**Voter anonymity** is guaranteed by the ZK proof: a voter proves they belong to the group without revealing which member they are. The vote is recorded on-chain but cannot be linked to a specific identity.

Once a valid proof passes, the vote is recorded as an **option counter increment** in the `UrnaDatum` stored on the Urna NFT. Each option is an `(index, count)` pair; votes increment the relevant count. Two voting modes are supported: simple (one vote for one option) and weighted (vote weight distributed across multiple options).

The Urna NFT follows the **State Thread Token (STT)** pattern: it is the on-chain carrier of the current vote tally. Each vote transaction spends the Urna UTxO and returns it to the same script address with an updated `UrnaDatum`, threading state forward across the entire voting period. This is why the value preservation check in the spending validator (Cond. 2) is structurally critical — breaking it would sever the thread and allow the tally to be lost or corrupted.

Finally, the contract enforces a **voting window** defined by `(start, end)` timestamps set at mint time. This window is immutable — it cannot be altered by anyone, including the event administrator, once the NFT has been minted.

---

### `semaphore.ak` — Semaphore Validator

The contract is a **multi-validator**: a single Aiken validator (`semaphore.ak`) that contains both a minting policy and a spending validator. The minting policy creates the Semaphore NFT; the spending validator processes each vote, verifying the ZK proof and advancing the nullifier state.

The validator is **parameterised by an `OutputReference` (`oref`)**, making it a one-shot minting policy — the same one-shot guarantee that applies to `group.ak` and `voting.ak`.

The Semaphore NFT is the **on-chain carrier of the ZK verification state**. Its `SemaphoreDatum` holds four fields: the group Merkle root (which voter group this Semaphore is bound to), the group token policy (used to locate the Group NFT), the VKey reference input (the `OutputReference` of the permanently locked `SnarkVerificationKey` UTxO), and the nullifier MPF root (the current root of the used-nullifier trie). Like the Group and Urna NFTs, the Semaphore NFT follows the **State Thread Token (STT)** pattern — every vote transaction spends and returns it with an updated `nullifier_mpf_root`, threading the nullifier set forward vote by vote.

The **Groth16 ZK proof** is the only place in the entire system where group membership is checked on-chain. The public inputs to the proof are: the group Merkle root (from the datum), the nullifier (from the redeemer), the signal hash (from the redeemer), and an **external nullifier** — the Semaphore script's own policy ID (`script_hash`) converted to a BLS12-381 scalar via `scalar.from_bytearray_big_endian`. The external nullifier binds each proof to a specific contract instance: proofs generated for one voting event cannot be replayed in another.

**Double-vote prevention** is enforced by the MPF trie: each vote inserts the nullifier into the trie, and `mpf.insert` fails hard if the key already exists. The output datum's `nullifier_mpf_root` must equal the root after the insertion — proving both that the insert succeeded and that the new root was committed to on-chain.

**Signal integrity** is enforced by recomputing `blake2b_256(signal_message) % scalar.field_prime` on-chain and asserting it equals `signal_hash`. The ZK circuit takes `signal_hash` as a public input, so the proof commits to the signal content. This two-step linkage — proof commits to hash, validator checks hash against message — ensures the vote content cannot be substituted after proof generation.

The **VKey UTxO** (`dat.vkey_ref_input`) is fetched from `reference_inputs` as a read-only input. It holds the `SnarkVerificationKey` in its inline datum and is permanently locked at an always-false script address. It can never be spent or altered; every vote transaction reads it without consuming it.

**`mint` (redeemer: `Create`)** initialises a Semaphore NFT for a voting event. It enforces: one-shot oref consumption; exactly one token minted; token locked at script address; valid `SemaphoreDatum` attached; Merkle root in the datum matches the Group NFT reference input; nullifier root initialised to `null_hash`.

**`spend` (redeemer: `Signal(...)`)** processes a single anonymous vote. It enforces: STT continuity (Semaphore NFT returned with equal value); immutable datum fields preserved; VKey loaded from the reference input and Groth16 proof verified; nullifier inserted and new MPF root committed; signal hash matches the signal message.

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

> **Note:** Neither `mint` nor `spend` validates the `GroupDatum` structure. Datum correctness is trusted to the off-chain layer at creation time and to the admin at update time. → **[F-GROUP-1]**

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

### `semaphore.ak` — Semaphore validator

#### `mint` — Create a Semaphore NFT

- **Condition 0:** The parameterised `oref` is consumed (one-shot uniqueness)
- **Condition 1:** Exactly one token minted under this policy
- **Condition 2:** Token sent to script address; policy confirmed present in output value
- **Condition 3:** The output carries a valid `SemaphoreDatum` inline datum (enforced via `expect`, not in final `and {}`)
- **Condition 4:** `SemaphoreDatum.group_merke_root` equals the current root in the Group NFT reference input
- **Condition 5:** `SemaphoreDatum.nullifier_mpf_root` initialised to `null_hash` (empty trie)

These conditions establish four properties:

1. **NFT uniqueness** — Conditions 0 and 1 guarantee exactly one Semaphore NFT can ever exist under this policy.
2. **STT correctly initialised** — Conditions 2 and 3 lock the token at the script address with a well-typed datum.
3. **Group binding** — Condition 4 ties the Semaphore datum's Merkle root to the Group NFT's current state at creation time, ensuring the ZK circuit will use the same root the group was initialised with.
4. **Clean nullifier state** — Condition 5 ensures no nullifiers are pre-loaded at creation time.

#### `spend` — Process a vote (Signal)

- **Condition 0:** Semaphore NFT returned to same script address with equal non-lovelace value (STT continuity)
- **Condition 1:** Immutable datum fields preserved: `group_merke_root`, `group_token_policy`, `vkey_ref_input`
- **Condition 2:** VKey UTxO fetched from `reference_inputs` via `dat.vkey_ref_input`; inline datum decoded as `SnarkVerificationKey`
- **Condition 3:** Groth16 ZK proof verified against public values `[group_merke_root, nullifier, signal_hash, external_nullifier]`
- **Condition 4:** Nullifier inserted into MPF trie from current `nullifier_mpf_root`; resulting root matches `out_datum.nullifier_mpf_root`
- **Condition 5:** Signal integrity: `blake2b_256(signal_message) % scalar.field_prime == signal_hash`

These conditions establish five properties:

1. **STT continuity** — Condition 0 returns the Semaphore NFT to the same script address with equal non-lovelace value, keeping the state thread alive.
2. **Datum preservation** — Condition 1 locks the immutable parameters in place. Only `nullifier_mpf_root` is allowed to change.
3. **ZK proof verification** — Conditions 2 and 3 load the trusted VKey from the permanent reference input and verify the Groth16 proof, proving the voter is a group member.
4. **Double-vote prevention** — Condition 4 inserts the nullifier into the MPF trie (hard-failing if already present) and commits the new root to the output datum, permanently consuming the voter's nullifier.
5. **Signal integrity** — Condition 5 recomputes `blake2b_256(signal_message) % field_prime` on-chain and asserts it equals `signal_hash`. Since the ZK circuit takes `signal_hash` as a public input, this proves the signal message was not substituted after proof generation.

#### `else` — Catch-all

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

**Test gap:** No test for minting two tokens with different asset names under the same policy (each with quantity 1). Same gap as `voting.ak` F-VOTING-4 — the `expect [Pair(_, amount)]` pattern structurally handles it but it is not empirically confirmed. → **[F-GROUP-2]**

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

  The equality `out_value == [policy_id]` asserts that the Group NFT is the *only* non-lovelace asset at that output — no other tokens can be co-locked. This is stricter than `voting.ak`'s Condition 2, which only checks presence (see **[F-VOTING-3]**).

*Confirmed by test:* `mint_sent_to_wrong_address` *(fail — NFT sent to wrong script address → filter returns empty → `expect` rejects).*

**Test gap:** No test attempts to mint the Group NFT alongside an extra token in the same output. The `out_value == [policy_id]` equality structurally rejects it, but it is not empirically confirmed. → **[F-GROUP-3]**

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

- `find_input(inputs, utxo)` locates the script's own input — already cited in `group.ak` mint Property 1. `expect Some(...)` fails hard if absent.

- `list.filter` finds all outputs returning to the same address. Full address equality is used — both payment credential and staking credential must match. `expect [output_to_script]` fails hard if zero or more than one such output exists:

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

**Test gap:** The existing tests cover quantity > 1 for a single asset name, but there is no test for minting two tokens with *different* asset names under the same policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this case, but it is not empirically confirmed. → **[F-VOTING-4]**

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

  Soundness of `is_policy_on_value` was established in the Property 1 analysis: it is sound because Condition 0 guarantees no pre-existing tokens under `policy_id`. *Confirmed by test:* `wrong_address_output` *(fail — NFT sent to wrong address → filter returns empty → `expect` rejects).* This check is weaker than `group.ak`'s Condition 2, which asserts the NFT is the *only* non-lovelace asset at the output. → **[F-VOTING-3]**

- **Condition 3** (lines 55–56): `Datum` is a 3-variant stdlib type (`NoDatum`, `DatumHash(DataHash)`, `InlineDatum(Data)`), defined in:

  > `cardano/transaction` — [stdlib cardano/transaction](https://aiken-lang.github.io/stdlib/cardano/transaction.html)

  `expect InlineDatum(out_datum)` rejects both `NoDatum` and `DatumHash` — only a fully inlined datum passes. `expect urna_datum: UrnaDatum = out_datum` then fails hard if the data does not match the `UrnaDatum` shape.

**Test gap:** No test attempts to mint with a missing datum, a datum-hash datum, or a datum of the wrong type. → **[F-VOTING-5]**

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

**Test gap:** No test exercises the case where `event_start >= event_end` (inverted or zero-length window). The `event_start < event_end` check handles it, but it is not empirically confirmed. → **[F-VOTING-6]**

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

**Improvement:** `check_options_index` rejects an empty list but does not enforce a minimum of 2 options. A single-option voting event passes all checks. Since the purpose is to offer voters a choice — at minimum two options, or three when abstain is included — a minimum count should be enforced. → **[F-VOTING-1]**

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

- **Condition 6 — weighted** (`weight > 1`): `weighted_vote` applies all `(index, count)` pairs from the signal to the options. `check_weight` verifies the total weight sums to `dat.weight`. The comparison with `out_dat.options` enforces the output tally matches. However, `update_option` (used internally by `weighted_vote`) silently ignores an index that does not exist in the options list — weight assigned to a non-existent option is discarded without failing. `check_weight` does not detect this, as it only sums the counts in the signal, not in the updated tally. A voter could silently lose part of their weight. → **[F-VOTING-7]**

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

  The code carries a TODO comment questioning whether `empty_value == empty_value` could trivially pass. This cannot happen: `this_script_input` is the Urna UTxO, which always holds the Urna NFT (locked there at mint time). `without_lovelace` on the input side always returns a non-empty value. The TODO should be removed. → **[F-VOTING-2]**

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

Both conditions are enforced via `expect`:

> *"Keyword for non-exhaustive pattern matching that halts (fails) if the pattern doesn't match."*
> — [Aiken Glossary — expect](https://aiken-lang.org/glossary#expect)

- **Condition 0** uses `find_input` (stdlib `cardano/transaction`):

  > *"Find an input by its OutputReference."* `find_input(inputs: List<Input>, output_reference: OutputReference) -> Option<Input>`
  > — [stdlib cardano/transaction](https://aiken-lang.github.io/stdlib/cardano/transaction.html#find_input)

  `expect Some(...)` fails hard if the oref is absent. Since a UTxO can only be consumed once on Cardano, the policy can only mint in one transaction ever. *Confirmed by test:* `mint_create_semaphore_token_1` *(pass — oref present → succeeds).*

- **Condition 1** uses `assets.tokens` (stdlib `cardano/assets`):

  > *"Get all tokens associated with a given policy."* `tokens(self: Assets, policy_id: PolicyId) -> Dict<AssetName, Int>`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#tokens)

  `dict.to_pairs()` converts the result to a list. `expect [Pair(_, amount)]` matches exactly one element — fails hard if zero or more than one asset name is present. `amount == 1` checks the quantity. *Confirmed by test:* `mint_wrong_value` *(fail — quantity 2 → rejected).*

**Test gap:** No test for minting two tokens with different asset names under the same policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles it, but it is not empirically confirmed. Same gap as F-GROUP-2 and F-VOTING-4. → **[F-SEM-2]**

---

### `semaphore.ak` — `mint` Property 2: STT correctly initialised

```aiken
// Condition 2: Is Semaphore NFT sent to script?
let own_script_credential = Script(policy_id)
expect [output_to_script] =
  list.filter(
    outputs,
    fn(o) { o.address.payment_credential == own_script_credential },
  )
let is_nft_sent_to_script: Bool =
  is_policy_on_value(output_to_script.value, policy_id)

// Condition 3: Is there a Semaphore Datum attached?
expect InlineDatum(out_datum) = output_to_script.datum
expect out_semaphore_dat: SemaphoreDatum = out_datum
```

Both conditions are enforced via `expect` (see Property 1 for the glossary definition).

- **Condition 2** builds a `Script(policy_id)` credential and filters all transaction outputs for those whose `payment_credential` matches. `expect [output_to_script]` fails hard if zero or more than one output reaches the script address — there must be exactly one:

  > *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

  `is_policy_on_value` then confirms the Semaphore NFT is present in that output's value, using `policies` (stdlib `cardano/assets`) — already verified sound in `voting.ak` mint Property 2. This check is weaker than `group.ak`'s Condition 2, which asserts the NFT is the *only* non-lovelace asset at the output. → **[F-SEM-3]**

  *Confirmed by test:* `mint_wrong_address` *(fail — NFT sent to wrong script address → filter returns empty → `expect` rejects).*

- **Condition 3** uses `expect InlineDatum(out_datum)` and `expect out_semaphore_dat: SemaphoreDatum` — the same datum extraction pattern verified in `voting.ak` mint Property 2. Only a fully inlined, correctly typed `SemaphoreDatum` passes; `NoDatum`, `DatumHash`, and wrong-typed data all fail hard. As established in the discussion of `expect` laziness: these statements are only evaluated when `out_semaphore_dat` is used in Conditions 4 and 5. Since both are in the final `and {}`, the datum check is always enforced on any passing path.

  *Confirmed by test:* `mint_no_datum` *(fail — `NoDatum` → `expect InlineDatum(...)` rejects).*

**Test gap:** No test attempts to mint with a `DatumHash` datum or a datum of the wrong type. Both are structurally rejected by `expect InlineDatum(...)` and `expect out_semaphore_dat: SemaphoreDatum`, but neither is empirically confirmed. → **[F-SEM-4]**

---

### `semaphore.ak` — `mint` Property 3: Group binding

```aiken
// Condition 4: Is group merkle root correctly set?
expect [group_reference_input] =
  list.filter(
    reference_inputs,
    fn(i) {
      is_policy_on_value(
        i.output.value,
        out_semaphore_dat.group_token_policy,
      )
    },
  )
expect InlineDatum(group_datum) = group_reference_input.output.datum
expect group_datum_data: GroupDatum = group_datum
let is_merkle_root_correct: Bool =
  group_datum_data.group_merke_root == out_semaphore_dat.group_merke_root
```

Condition 4 anchors the Semaphore datum to the Group NFT's current state at creation time. It has three sub-steps:

- `list.filter` searches `reference_inputs` (not `inputs`) for an input carrying `out_semaphore_dat.group_token_policy`:

  > *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

  Using `reference_inputs` is correct: the Group NFT is read without being consumed, keeping the group state thread alive for future registration transactions. `expect [group_reference_input]` fails hard if zero or more than one input carrying the group policy is found. Since the Group NFT is a one-shot token, exactly one can exist, so the `expect` is always well-formed when the input is present.

  The policy to search for is `out_semaphore_dat.group_token_policy` — the value the minter placed in the Semaphore datum. The validator does not verify that this policy ID is legitimate; it trusts the minter to supply the correct group policy. A minter controlling a fake group could pass any policy here, but a dishonest Semaphore minting provides no security guarantee regardless, as the admin controls the bootstrap.

- `expect InlineDatum(group_datum)` and `expect group_datum_data: GroupDatum` extract the `GroupDatum` from the reference input — same datum extraction pattern verified throughout. `NoDatum`, `DatumHash`, and wrong-typed data all fail hard.

- `is_merkle_root_correct` asserts equality between the two Merkle roots:

  ```aiken
  group_datum_data.group_merke_root == out_semaphore_dat.group_merke_root
  ```

  This ensures the Semaphore datum commits to the exact Merkle root the group holds at creation time. The ZK circuit will use this root as a public input — so any voter registering after this point (causing a root update) would require a new Semaphore NFT or a group update transaction to remain consistent.

*Confirmed by test:* `mint_group_root_tamper` *(fail — Semaphore datum sets `group_merke_root: 1111111111111111111` while Group NFT holds `12345678901234567890` → equality fails).*

**Test gap:** No test attempts to mint without including the Group NFT in `reference_inputs`. `expect [group_reference_input]` would fail hard on an empty filter result, but this is not empirically confirmed. → **[F-SEM-5]**

---

### `semaphore.ak` — `mint` Property 4: Clean nullifier state

```aiken
pub const null_hash =
  #"0000000000000000000000000000000000000000000000000000000000000000"

// Condition 5: Is initial MPF root empty?
let is_nullifier_root_empty: Bool =
  out_semaphore_dat.nullifier_mpf_root == null_hash
```

`null_hash` is a module-level constant — 32 zero bytes — representing the root of an empty MPF trie. The check is a direct equality: `out_semaphore_dat.nullifier_mpf_root` must be exactly `null_hash`. Any non-zero value is rejected. This prevents a minter from pre-loading the trie with nullifiers at creation time, which would allow pre-burning voter identities.

Note: `is_nullifier_root_empty` depends on `out_semaphore_dat`, which is bound by the `expect` in Condition 3. As established in Property 2, this `expect` is always evaluated before `is_nullifier_root_empty` is needed in the `and {}`, so the datum check is guaranteed to have run on any passing path.

*Confirmed by tests:* `mint_create_semaphore_token_1` *(pass — `nullifier_mpf_root: null_hash` → accepted)* and `mint_mpf_root_wrong_setup` *(fail — `nullifier_mpf_root: #"111111111111"` → equality fails).*

---

### `semaphore.ak` — `spend` Property 1: STT continuity

```aiken
// Find script input
expect Some(this_script_input) = find_input(inputs, utxo)
// Find output sent back to script
let this_script_address = this_script_input.output.address
expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address == this_script_address })
// Condition 0: Is script value sent back?
let is_value_returned: Bool =
  assets.without_lovelace(output_to_script.value) == assets.without_lovelace(
    this_script_input.output.value,
  )
```

Three sub-checks keep the state thread alive — the same pattern verified in `group.ak` spend Property 2 and `voting.ak` spend Property 2.

- `find_input(inputs, utxo)` locates the script's own input (the Semaphore UTxO being spent):

  > *"Find an input by its OutputReference."* `find_input(inputs: List<Input>, output_reference: OutputReference) -> Option<Input>`
  > — [stdlib cardano/transaction](https://aiken-lang.github.io/stdlib/cardano/transaction.html#find_input)

  `expect Some(...)` fails hard if absent.

- `list.filter(outputs, fn(o) { o.address == this_script_address })` finds the output returning to the same address. Full address equality is used — both payment credential and staking credential must match. `expect [output_to_script]` fails hard if zero or more than one such output exists:

  > *"Produce a list of elements that satisfy a predicate."* `filter(self: List<a>, predicate: fn(a) -> Bool) -> List<a>`
  > — [stdlib aiken/collection/list](https://aiken-lang.github.io/stdlib/aiken/collection/list.html#filter)

- `assets.without_lovelace` strips ADA from both sides before comparing:

  > *"Get Assets excluding Ada."* `without_lovelace(self: Assets) -> Assets`
  > — [stdlib cardano/assets](https://aiken-lang.github.io/stdlib/cardano/assets.html#without_lovelace)

  The equality asserts all native tokens — including the Semaphore NFT — are preserved in the output. The input side is never empty: `this_script_input` is the Semaphore UTxO, which always holds the Semaphore NFT locked there at mint time.

*Confirmed by test:* `spend_value_not_sent_back` *(fail — output sent to a different address → filter returns empty → `expect` rejects).* The happy path test `spend_signal_semaphore_1` fails due to F-SEM-1 and does not confirm this property.

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

The output datum is first extracted via `expect InlineDatum(out_data)` and `expect out_datum: SemaphoreDatum` — the same datum extraction pattern verified throughout. Then three fields are checked for equality: `group_merke_root`, `group_token_policy`, and `vkey_ref_input`. The fourth field, `nullifier_mpf_root`, is intentionally absent from this check — it is the only field permitted to change, updated by Condition 4.

This separation is the key design decision: the immutable event parameters — which group this Semaphore is bound to, and which VKey UTxO holds the proof verification key — are locked in place for the lifetime of the event. Only the nullifier accumulator is allowed to advance.

**Test isolation note:** `spend_datum_not_preserved_1` and `spend_datum_not_preserved_2` set `is_datum_preserved` to `False`, which causes the `and {}` to short-circuit before reaching Condition 2 (the VKey lookup). This means these tests correctly exercise Condition 1 and are not affected by F-SEM-1.

*Confirmed by tests:* `spend_datum_not_preserved_1` *(fail — `group_merke_root` altered in output datum → equality fails)* and `spend_datum_not_preserved_2` *(fail — `group_token_policy` altered in output datum → equality fails).*

**Test gap:** No test alters `vkey_ref_input` in the output datum while keeping other fields intact. The third equality check is structurally enforced but not independently confirmed. → **[F-SEM-6]**

---

### `semaphore.ak` — `spend` Property 3: ZK proof verification

```aiken
// Condition 2: Is Snark Verification Keys reference input correct?
expect Some(snark_vkey_ref_input) =
  find_input(reference_inputs, dat.vkey_ref_input)
expect InlineDatum(snark_vkey_input) = snark_vkey_ref_input.output.datum
expect snark_vkey: SnarkVerificationKey = snark_vkey_input

// Get external nullifier value (The scripthash/policyID of the validator itself)
expect Script(script_hash) = this_script_address.payment_credential
expect Some(external_nullifier) =
  scalar.from_bytearray_big_endian(script_hash)

// Cond 3: Verify ZK proof
let public_values: List<Int> =
  [
    dat.group_merke_root,
    nullifier,
    signal_hash,
    scalar.to_int(external_nullifier),
  ]
let is_snark_correct: Bool =
  groth_verify(snark_vkey, zk_proof, public_values)
```

Two steps load the trusted VKey and run the proof verifier.

**Condition 2** loads the `SnarkVerificationKey` from the permanent VKey UTxO:

- `find_input(reference_inputs, dat.vkey_ref_input)` locates the VKey UTxO by `OutputReference` in `reference_inputs` — fixed in `cardano-semaphore v0.9.4` (previously searched `inputs`, which would have consumed the UTxO). `expect Some(...)` fails hard if the reference input is absent.

- `expect InlineDatum(snark_vkey_input)` and `expect snark_vkey: SnarkVerificationKey = snark_vkey_input` decode the datum using the standard pattern. A datum that is not an inline `SnarkVerificationKey` fails hard.

**External nullifier** is derived from the Semaphore script's own address:

- `expect Script(script_hash) = this_script_address.payment_credential` extracts the 28-byte script hash. Since `this_script_address` was already located from a valid `find_input(inputs, utxo)` in Property 1, the payment credential is always `Script(...)` — this `expect` cannot fail.

- `expect Some(external_nullifier) = scalar.from_bytearray_big_endian(script_hash)`:

  `scalar.from_bytearray_big_endian` returns `None` only when the byte value is ≥ the BLS12-381 scalar field prime `r` (~2^254.87). A Cardano script hash is 28 bytes = 224 bits, always strictly less than `r`, so this `expect Some(...)` never fails in practice.

  Note: this still uses the old pre-v0.9.3 pattern (without `% scalar.field_prime`), unlike Condition 5's `signal_hash` computation. It is safe here due to the fixed 28-byte length, but the two conditions are inconsistent in style.

  The external nullifier binds each proof to a specific contract instance — a proof generated for one voting event cannot be replayed under another, because each event's distinct script hash produces a distinct external nullifier in the circuit's public inputs.

**Condition 3** assembles the four public inputs and calls the Groth16 verifier:

- `public_values = [group_merke_root, nullifier, signal_hash, external_nullifier]`
- `groth_verify(snark_vkey, zk_proof, public_values)` — the verifier is implemented in `ak-381` and is out of scope for this audit. Its correctness is trusted. A valid proof asserts: the voter knows a secret that is a leaf of the Merkle tree with root `group_merke_root`, produces nullifier `nullifier`, and committed to signal `signal_hash` under external context `external_nullifier`.

*Confirmed by test:* `snark_1` *(pass — standalone `groth_verify` with a hardcoded valid proof and matching public values → verifier returns true).* The spending tests `spend_incorrect_zk_proof` (fail) and `spend_vkey_field_with_incorrect_value` (fail) are intended to confirm the rejection path for this condition, but both fail at Condition 2 due to **F-SEM-1** and never reach `groth_verify`. Neither provides empirical coverage of Condition 3. → **[F-SEM-1]**

---

### `semaphore.ak` — `spend` Property 4: Double-vote prevention

```aiken
// Cond 4: Is the Nullifier already inserted.
let nullifier_mpf: MerklePatriciaForestry =
  mpf.from_root(dat.nullifier_mpf_root)

expect Some(n_value) = scalar.new(nullifier)
let nullifier_value: ByteArray =
  scalar.to_bytearray_little_endian(n_value, 0)
let nullifier_key: ByteArray = crypto.blake2b_256(nullifier_value)
let new_mpf_nullifier: MerklePatriciaForestry =
  mpf.insert(nullifier_mpf, nullifier_key, nullifier_value, mpf_proof)

let is_new_nullifier_root: Bool =
  mpf.from_root(out_datum.nullifier_mpf_root) == new_mpf_nullifier
```

This condition enforces that each Semaphore identity can cast at most one vote per event, and that the on-chain nullifier state is durably updated.

**Trie reconstruction.** `mpf.from_root(dat.nullifier_mpf_root)` reconstructs the MPF trie from the root hash stored in the current datum. This is the authenticated snapshot of all nullifiers used so far. The trie itself is not stored on-chain — only the root hash; the off-chain `mpf_proof` in the redeemer supplies the witness.

**Nullifier serialisation.** Before inserting, the nullifier integer is converted to a canonical byte form:

- `expect Some(n_value) = scalar.new(nullifier)` — `scalar.new` rejects values outside the BLS12-381 field. A valid Semaphore nullifier is `poseidon(identity_nullifier, external_nullifier)`, always within the field, so this `expect` succeeds on honest inputs. A malformed redeemer with an out-of-range integer fails hard here.

- `scalar.to_bytearray_little_endian(n_value, 0)` produces the canonical little-endian byte representation.

- `crypto.blake2b_256(nullifier_value)` derives the MPF trie key from the serialised nullifier. Hashing to derive the key is standard practice — it ensures uniform key length and avoids leaking scalar structure.

**Insertion and double-vote prevention.** `mpf.insert(nullifier_mpf, nullifier_key, nullifier_value, mpf_proof)` is the core security step. The MPF library — [`aiken-lang/merkle-patricia-forestry`](https://github.com/aiken-lang/merkle-patricia-forestry) — requires `mpf_proof` to prove that `nullifier_key` does **not** already exist in the trie. If the key is already present (i.e., the voter previously cast a vote), the proof is invalid and `mpf.insert` fails, rejecting the transaction. This makes double-voting impossible without a valid non-membership proof.

**Root update enforcement.** `is_new_nullifier_root = mpf.from_root(out_datum.nullifier_mpf_root) == new_mpf_nullifier` checks that the output datum's root matches the trie after the new nullifier is inserted. This is load-bearing: without it, a voter could present a valid non-membership proof and "insert" the nullifier without committing the updated root — leaving the trie state unchanged and the same nullifier reusable in a future transaction.

*Confirmed by test:* `spend_nullifier_already_inserted_1` (fail) is intended to confirm rejection of a duplicate nullifier. Due to **F-SEM-1** it fails at Condition 2 and never reaches Condition 4. There is no test providing empirical coverage of this property. → **[F-SEM-1]**

---

### `semaphore.ak` — `spend` Property 5: Signal integrity

```aiken
// Condition 5. Is message tampered?
// blake2b_256 produces a 256-bit value which may exceed the BLS12-381 scalar field prime r.
// Using scalar.from_bytearray_big_endian would return None for ~55% of all messages.
// Fix: reduce mod field_prime (same reduction the circom circuit applies implicitly).
let message_digest_int =
  builtin.bytearray_to_integer(True, crypto.blake2b_256(signal_message)) % scalar.field_prime
let is_signal_message_tampered: Bool =
  message_digest_int == signal_hash
```

This condition binds `signal_message` (the raw CBOR vote data decoded by `voting.ak`) to `signal_hash` (the ZK circuit's public input), preventing a third party from substituting a different vote payload after the proof has been generated.

**Hash recomputation.** The validator hashes `signal_message` on-chain and compares the result to `signal_hash`:

- `crypto.blake2b_256(signal_message)` produces a 256-bit hash of the raw signal bytes.
- `builtin.bytearray_to_integer(True, ...)` interprets those bytes as a big-endian integer.
- `% scalar.field_prime` reduces the integer into the BLS12-381 scalar field `r`. The result is what the circuit receives as the `signal_hash` public input.

If `signal_message` is altered after proof generation, the recomputed hash diverges from `signal_hash` and the check fails. If `signal_hash` is altered instead, Condition 3 (`groth_verify`) already rejects the proof because the hash is a circuit public input — the two conditions are mutually reinforcing.

**BLS12-381 field overflow fix.** `blake2b_256` produces 256 bits; the scalar field prime `r ≈ 2^{254.87}`, so ~55% of possible digests exceed `r`. Prior to `cardano-semaphore v0.9.3`, the code used `scalar.from_bytearray_big_endian(hash)`, which returns `None` for any value ≥ `r`, causing `expect Some(...)` to fail on roughly half of all valid votes. The current code uses `% scalar.field_prime`, matching the implicit modular reduction the circom circuit already performs on all field inputs. This makes on-chain and off-chain representations consistent without altering circuit behaviour.

**Consistency with off-chain.** The same reduction is applied in `src/zk/src/proof.ts`:

```ts
signalHash = BigInt('0x' + digestHex) % BLS12_381_R
```

Both sides reduce the same 256-bit digest modulo the same prime, ensuring the public input the circuit was proved against equals the value recomputed on-chain.

*Confirmed by test:* `spend_tampered_message` (fail) is intended to confirm rejection of an altered `signal_message`. Due to **F-SEM-1** it fails at Condition 2 and never reaches Condition 5. There is no test providing empirical coverage of this property. → **[F-SEM-1]**

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

### `group.ak`

**[F-GROUP-1] `group.ak` does not validate `GroupDatum` structure**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/group.ak`
- **Description:** Neither `mint` nor `spend` validate the `GroupDatum` inline datum. At mint time no datum check exists at all; at update time the admin is trusted to write a correct datum. A malformed datum at mint time would not be caught by `group.ak` — errors would surface later in `semaphore.ak` mint (which reads the Group reference input). This is a deliberate trade-off for cheaper execution, but the assumption is implicit.
- **Impact:** Low
- **Recommendation:** Document the off-chain invariant explicitly. Optionally add a minimal datum shape check at mint time.
- **Status:** Open

**[F-GROUP-2] `group.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** No test attempts to mint two tokens with distinct asset names under the Group policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test minting two tokens with distinct asset names under the group policy.
- **Status:** Open

**[F-GROUP-3] `group.ak`: no test for minting Group NFT alongside an extra token**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** No test attempts to mint the Group NFT while sending an extra token (under a different policy) to the same script output. The `policies(without_lovelace(value)) == [policy_id]` check structurally rejects it, but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test that includes an extra token in the minted output alongside the Group NFT.
- **Status:** Open

### `voting.ak`

**[F-VOTING-1] No minimum options count enforced**
- **Type:** Improvement
- **Location:** `src/on-chain/lib/voting_utilities.ak:24`
- **Description:** `check_options_index` rejects an empty options list but does not enforce a minimum of 2. A single-option voting event passes all mint checks. A meaningful vote requires at least two options; with an abstain option, at least three.
- **Impact:** Medium
- **Recommendation:** Add a `list.length(options) >= 2` (or `>= 3`) guard in `check_options_index` before the recursive check.
- **Status:** Open

**[F-VOTING-2] Unresolved TODO comment on value preservation check**
- **Type:** Improvement
- **Location:** `src/on-chain/validators/voting.ak:106`
- **Description:** A TODO comment questions whether `assets.without_lovelace(output) == assets.without_lovelace(input)` could trivially pass if both sides are empty. This cannot happen — `this_script_input` is the Urna UTxO, which always holds the Urna NFT from mint time, so the input side is never empty. The comment should be resolved and removed.
- **Impact:** Low
- **Recommendation:** Remove the TODO comment.
- **Status:** Open

**[F-VOTING-3] Weaker NFT destination check than `group.ak`**
- **Type:** Improvement
- **Location:** `src/on-chain/lib/voting_utilities.ak:111`, `src/on-chain/validators/voting.ak:52`
- **Description:** `voting.ak` Condition 2 uses `is_policy_on_value` to confirm the Urna NFT reached the script address. This only checks that the policy is *present* in the output value — other tokens can coexist in the same output. `group.ak` uses the stricter `policies(without_lovelace(value)) == [policy_id]`, which asserts the NFT is the *only* non-lovelace asset at that output. Both serve the same purpose, but `group.ak`'s approach is more defensive.
- **Impact:** Medium
- **Recommendation:** Replace `is_policy_on_value(output_to_script.value, policy_id)` with `assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]` to align with `group.ak` and prevent unintended tokens from being co-locked at the Urna UTxO.
- **Status:** Open

**[F-VOTING-4] No test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** The existing test `tx_mints_more_than_two_tokens` covers quantity > 1 for a single asset name. There is no test for the case where two tokens with *different* asset names (each with quantity 1) are minted under the same policy. The `expect [Pair(_, amount)]` pattern structurally handles this, but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a test that attempts to mint two tokens with distinct asset names under the voting policy and asserts failure.
- **Status:** Open

**[F-VOTING-5] No test for missing or non-inline datum on mint output**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint while sending the output with `NoDatum`, `DatumHash`, or a datum of the wrong type. Condition 3 uses `expect InlineDatum(...)` and `expect urna_datum: UrnaDatum`, which structurally reject all three cases, but none are empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add failure tests for `NoDatum` output, `DatumHash` output, and a datum that does not match `UrnaDatum`.
- **Status:** Open

**[F-VOTING-6] No test for inverted or zero-length voting window**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint with `event_start >= event_end`. The `event_start < event_end` check in Condition 4 handles it, but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test with `event_start == event_end` and another with `event_start > event_end`.
- **Status:** Open

**[F-VOTING-7] Weighted vote — invalid option index silently discards weight**
- **Type:** Note
- **Location:** `src/on-chain/lib/voting_utilities.ak:40`
- **Description:** `update_option` returns the options unchanged if the given index is not found, rather than failing. `weighted_vote` calls `update_option` for each `(index, count)` pair in the signal. `check_weight` only verifies the total weight in the signal sums to `dat.weight` — it does not verify all indices are valid. A voter can include weight on a non-existent option index: `check_weight` passes, but that weight is silently lost from the tally. The voter's nullifier is consumed. This is asymmetric with simple mode, where `simple_vote` fails hard on an invalid index.
- **Impact:** Medium
- **Recommendation:** Add an index validation step in `weighted_vote` or `check_weight` to verify all option indices in the signal exist in `dat.options`. Alternatively, make `update_option` fail on a missing index.
- **Status:** Open

### `semaphore.ak`

**[F-SEM-3] `semaphore.ak` mint: weaker NFT destination check than `group.ak`**
- **Type:** Improvement
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/semaphore.ak:46`
- **Description:** `semaphore.ak` Condition 2 uses `is_policy_on_value` to confirm the Semaphore NFT reached the script address. This only checks that the policy is *present* in the output value — other tokens can coexist in the same output. `group.ak` uses the stricter `policies(without_lovelace(value)) == [policy_id]`, which asserts the NFT is the *only* non-lovelace asset at that output. Same issue as F-VOTING-3.
- **Impact:** Medium
- **Recommendation:** Replace `is_policy_on_value(output_to_script.value, policy_id)` with `assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]` to align with `group.ak`.
- **Status:** Open

**[F-SEM-6] `semaphore.ak`: no test for altered `vkey_ref_input` in output datum**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** `spend_datum_not_preserved_1` and `spend_datum_not_preserved_2` confirm that `group_merke_root` and `group_token_policy` are independently enforced. No test alters `vkey_ref_input` in the output datum while keeping the other fields intact. The third equality check in `is_datum_preserved` is structurally enforced but not independently confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test that changes only `vkey_ref_input` in the output datum and asserts rejection.
- **Status:** Open

**[F-SEM-5] `semaphore.ak`: no test for missing Group NFT in `reference_inputs` on mint**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** No test attempts to mint the Semaphore NFT without including the Group NFT as a reference input. `expect [group_reference_input]` fails hard when the filter returns empty, but this is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test that omits the Group reference input from `reference_inputs`.
- **Status:** Open

**[F-SEM-4] `semaphore.ak`: no test for `DatumHash` or wrong-typed datum on mint output**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** `mint_no_datum` confirms the `NoDatum` case is rejected, but there is no test for a `DatumHash` datum or a datum that does not match `SemaphoreDatum`. Both are structurally rejected by `expect InlineDatum(...)` and `expect out_semaphore_dat: SemaphoreDatum`, but neither is empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add failure tests for a `DatumHash` output and a datum that does not match `SemaphoreDatum`.
- **Status:** Open

**[F-SEM-2] `semaphore.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** No test attempts to mint two tokens with distinct asset names under the Semaphore policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this but it is not empirically confirmed. Same gap as F-GROUP-2 and F-VOTING-4.
- **Impact:** Low
- **Recommendation:** Add a failure test minting two tokens with distinct asset names under the Semaphore policy.
- **Status:** Open

**[F-SEM-1] All spending tests use `inputs` instead of `reference_inputs` for the VKey input**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** Every spending test builds the transaction with `vkey_input` in the `inputs` field, but the spending validator reads from `reference_inputs` (`find_input(reference_inputs, dat.vkey_ref_input)`). Since `reference_inputs` is never set in these tests, it is always empty, causing `expect Some(snark_vkey_ref_input)` to fail before any of the intended conditions are reached. The happy path test `spend_signal_semaphore_1` fails. All `fail` spending tests (`spend_value_not_sent_back`, `spend_datum_not_preserved_1/2`, `spend_vkey_field_with_incorrect_value`, `spend_incorrect_zk_proof`, `spend_nullifier_already_inserted`, `spend_tampered_message`) pass, but for the wrong reason — each errors at Condition 2 rather than the condition it is intended to test. Confirmed by running `aiken check` in the dependency package.
- **Impact:** High
- **Recommendation:** In all spending tests, move `vkey_input` from `inputs` to `reference_inputs` in the transaction construction. Verify that `spend_signal_semaphore_1` then passes and that each `fail` test fails at its intended condition.
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

---

## Annex A — Test Review: `voting.ak`

Full test run: **154 pass, 0 fail** (`aiken check` in `src/on-chain/`).

Test files reviewed:
- `validators/tests/minting_logic_test.ak` — 8 tests (mint)
- `validators/tests/spending_logic_test.ak` — 14 tests (spend)
- `lib/tests/voting_tests.ak` — `simple_vote`, `weighted_vote`, `check_weight`, `update_option`
- `lib/tests/check_option_values.ak` — `check_options_index`, `check_initial_options_value`
- `lib/tests/is_interval_within.ak` — `is_interval_within`
- `lib/tests/signal_tests.ak` — `serialise_signal`, `deserialise_signal`, signal hash computation

### Clean areas

- `minting_logic_test.ak` — all mint conditions covered independently; clean construction.
- `check_option_values.ak` — thorough boundary coverage including negative indices, gaps, and duplicates.
- `is_interval_within.ak` — 30 tests; boundary discipline is correct (touching-boundary cases are `fail`).
- `voting_tests.ak` — `update_option`, `simple_vote`, `weighted_vote`, `check_weight` well-covered. `signal_tests.ak` includes property-based tests via Aiken's fuzzer for serialisation round-trip.

### Issues found

**T-1 — `vote_out_of_time_3` fails for the wrong reason** (`spending_logic_test.ak:914`)

Labelled "validity range of the tx is not within the voting time event." The `signal_message` encodes a vote for option index 35 with weight 60, on a 3-option, weight-1 ballot. Option index 35 is out of bounds (`simple_vote` errors); weight 60 != 1. The test `fail`s but for an ambiguous reason — the time check and the malformed signal both cause rejection. The intended condition (time enforcement) is not cleanly isolated.

**T-2 — `vote_out_of_time_2` output datum mutates `event_date`** (`spending_logic_test.ak:824`)

Labelled "vote window is not open yet." The output `urna_datum_1` sets `event_date = (50, 100)` while the input has `(1, 100)`. `voting.ak` spend enforces `dat.event_date == out_dat.event_date` via `is_datum_preserved`. The test fails due to both the time check and the datum check, not the time check alone. Two confounding rejection reasons.

**T-3 — `signal_digest_scalar` uses pre-v0.9.3 pattern on 256-bit hash** (`signal_tests.ak:89`)

```aiken
let signal_bytes = serialise_signal([(2,1)]) |> blake2b_256()
expect Some(signal_scalar) = scalar.from_bytearray_big_endian(signal_bytes)
```

`scalar.from_bytearray_big_endian` returns `None` for values ≥ the BLS12-381 scalar field prime `r`. A 256-bit blake2b hash exceeds `r` ~55% of the time. This test passes only because the hash of `[(2,1)]` happens to be < `r`. The pattern is inconsistent with the on-chain fix introduced in v0.9.3 (`% scalar.field_prime`) and could mislead a developer using this test as a reference for computing `signal_hash`.

**T-4 — `vote_14` comment is wrong** (`voting_tests.ak:179`)

Comment reads: *"Validates voting on option that has negative vote count (-5→-4)."* The actual option is `(1, 5)` (positive). The test itself is correct (5→6) but the comment is misleading.

**T-5 — `weighted_vote_10` has an unresolved TODO** (`voting_tests.ak:292`)

`weighted_vote` accepts duplicate indices in `target_options` (e.g., `[(1,1),(1,1)]` adds 2 to option 1). The developer flagged this with `// TODO: Fix this corner case`. Not exploitable because `check_weight` enforces total == allowed weight, but the redundant format is unresolved and could confuse the off-chain signal encoder.

**T-6 — Spending tests use stub Semaphore datum**

All `cast_*` and `vote_*` tests set `semaphore_output.datum: NoDatum` and most use `nullifier = 0, signal_hash = 0`. Valid as unit tests of `voting.ak` in isolation. Confirms there is no integration test running both `voting.ak` and `semaphore.ak` on a fully-formed transaction with a real ZK proof.

---

## Annex B — Test Review: `group.ak`

Full test run: **7 pass, 0 fail** (`aiken check` in `modulo-p-cardano-semaphore` package).

Test file reviewed: `validators/tests/group_test.ak`

### Clean areas

All conditions are covered and tests are well-constructed. Mint conditions for token quantity and destination address have dedicated `fail` tests. Spend conditions for admin signature, return address, and value conservation each have a dedicated `fail` test.

### Issues found

**G-1 — No test for wrong `oref` in mint** (`group_test.ak`)

`group.ak` mint Condition 0 consumes the parameterised `oref` (one-shot guarantee). No `fail` test passes a wrong UTxO as input while providing the correct `oref`. The equivalent test exists for `voting.ak` mint (`wrong_parameter_utxo`) but is absent here.

**G-2 — No test for `Create` redeemer on spend**

`group.ak` spend returns `False` for any redeemer other than `Update` (`_ -> False`). No test confirms that spending with the `Create` redeemer is rejected.

**G-3 — `group.ak` mint does not verify the `GroupDatum` (design observation)**

The mint validator has no condition checking that a `GroupDatum` is attached, that `admin_pkh` is non-empty, or that `group_merke_root` is initialised to 0. Any datum — or `NoDatum` — is accepted at mint time. `mint_create_group_1` tests with a valid datum, but this is not enforced on-chain. Initialisation constraints are entirely off-chain trust. Security consequence is limited (the minting admin controls the event regardless), but it is a design choice worth documenting explicitly.

---

## Annex C — Test Review: `semaphore.ak`

Full test run: **15 pass, 1 fail** (`aiken check` in `modulo-p-cardano-semaphore` package).

Test file reviewed: `validators/tests/semaphore_test.ak`

### Mint tests — 6 tests, all pass/fail correctly

All 5 mint conditions have dedicated coverage: one-shot UTxO (`mint_create_semaphore_token_1`), token quantity (`mint_wrong_value`), destination address (`mint_wrong_address`), group root copy (`mint_group_root_tamper`), datum presence (`mint_no_datum`), MPF root initialisation (`mint_mpf_root_wrong_setup`). These six tests are well-constructed.

### Standalone proof test — `snark_1`

`snark_1` calls `groth_verify(vk, zk_proof, public_values)` directly (outside the validator). It is the only test that provides empirical confirmation that the Groth16 verifier accepts a real proof with the hardcoded public inputs. Not a validator integration test, but important as a sanity check.

### Spending tests — 8 tests, 5 broken by F-SEM-1

All spending tests place `vkey_input` in `inputs` rather than `reference_inputs`. The validator's Condition 2 calls `find_input(reference_inputs, dat.vkey_ref_input)`. Due to UPLC call-by-need, the VKey lookup is reached only when all conditions up to that point hold. The per-test breakdown:

| Test | Expected | Actual failure reason | Correct? |
|---|---|---|---|
| `spend_signal_semaphore_1` | PASS | F-SEM-1 — `reference_inputs` empty, VKey lookup returns `None` | ✗ WRONG |
| `spend_value_not_sent_back` | FAIL | `expect [output_to_script]` — no output at the script address | ✓ RIGHT |
| `spend_datum_not_preserved_1` | FAIL | `is_datum_preserved = False` — lazy short-circuit, VKey lookup never reached | ✓ RIGHT |
| `spend_datum_not_preserved_2` | FAIL | `is_datum_preserved = False` — same | ✓ RIGHT |
| `spend_vkey_field_with_incorrect_value` | FAIL | F-SEM-1 — both sides reference `OutputReference{#"01bc",0}`, so `is_datum_preserved = True` | ✗ WRONG |
| `spend_incorrect_zk_proof` | FAIL | F-SEM-1 — `is_datum_preserved = True`, reaches Condition 2 | ✗ WRONG |
| `spend_nullifier_already_inserted` | FAIL | F-SEM-1 — `is_datum_preserved = True`, reaches Condition 2 | ✗ WRONG |
| `spend_tampered_message` | FAIL | F-SEM-1 — `is_datum_preserved = True`, reaches Condition 2 | ✗ WRONG |

### Issues found

**S-1 — `spend_vkey_field_with_incorrect_value` has a construction error beyond F-SEM-1**

This test intends to verify that a VKey UTxO with a wrong datum type (`InlineDatum(1)`) is rejected. However, `initial_semaphore_datum.vkey_ref_input` and `output_semaphore_datum.vkey_ref_input` both point to `OutputReference { transaction_id: #"01bc", output_index: 0 }` — the same reference. So `is_datum_preserved` is `True`, and after fixing F-SEM-1, the test would proceed to Condition 2, find the wrong-typed datum, and fail at `expect snark_vkey: SnarkVerificationKey = snark_vkey_input`. The test will produce the correct outcome after fixing F-SEM-1, but for an indirect reason. A cleaner construction would set a distinct `OutputReference` for `wrong_vk_input` to isolate the datum-type rejection from the reference lookup.

**S-2 — `spend_signal_semaphore_1` has an incomplete MPF proof** (`semaphore_test.ak`, lines 620–628)

The happy-path test stubs `mpf_proof = []`. The code that would compute a real MPF proof from the LevelDB store is commented out. Because F-SEM-1 causes this test to fail before the MPF check, the empty-proof substitution has never been tested either. For an empty initial trie (`null_hash`), `mpf.insert` with an empty proof appears to work (the `insert_nullifier` test in `mpf_proofs.ak` passes with the same hardcoded root), but this is a coincidence of the empty-trie case. No test exercises MPF insertion into a non-empty trie through the spending path.

**S-3 — No test for wrong `oref` in mint**

Same gap as `group.ak`. No `fail` test passes a wrong UTxO as input while providing the correct `oref` parameter. `mint_wrong_oref` is absent.

**S-4 — No test for `Signal` redeemer on mint**

The mint validator's `_ -> False` branch is not exercised. No test confirms that a `Signal` redeemer on the mint endpoint is rejected.

**S-5 — Misleading comment on `spend_signal_semaphore_1` (line 657)**

The line `inputs: [semaphore_input, vkey_input],` is prefixed with the comment `// Include vkey as reference input`. The comment is correct about the intent; the code is wrong. This directly points at the root cause of F-SEM-1 and suggests the author knew the VKey should be a reference input but placed it in the wrong field.

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
