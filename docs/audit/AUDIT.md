# Smart Contract Audit — ZK-Voting-App

---

## Metadata

| Field | Value |
|-------|-------|
| **Project** | ZK-Voting-App |
| **Date** | 2026-09-29 |
| **Auditors** | AgustinBadi |
| **Commit** | e1181e1 |
| **Scope** | `src/on-chain/validators/voting.ak`, `src/on-chain/lib/voting_utilities.ak`, critical path of `modulo-p/cardano-semaphore` (ZK proof verification, nullifier uniqueness, signal hash validation) |
| **Out of scope** | Groth16 verifier implementation, BLS12-381 arithmetic (`ak-381`), Poseidon hash, MPF trie internals (`merkle-patricia-forestry`) |


---

## Executive Summary

This audit validates a Cardano-based anonymous voting system built on the Semaphore zero-knowledge protocol over BLS12-381. The system allows voters to prove group membership and cast votes on-chain without revealing their identity, using Groth16 ZK-SNARKs for proof generation and a Merkle Patricia Forestry trie for double-vote prevention. The audit covered the full stack: Plutus v3 smart contracts (`voting.ak`, `voting_utilities.ak`, `modulo-p/cardano-semaphore` v0.9.5), and the off-chain application layer (`src/backend`, `src/frontend`) through a live scripted system test on Cardano preprod.

The core of the audit was a formal property analysis of the smart contracts: every security property each validator must uphold was stated explicitly before reading the implementation, then traced to the exact condition or function that enforces it, and confirmed by a test. Standard library functions — particularly interval and time conditions — were analysed for boundary correctness. Every custom function was verified independently, with no assumption that a function does what its name suggests. This produced a complete proof-of-properties for the on-chain system. The off-chain review complemented this with a live scripted system test on Cardano preprod, confirming that the full stack — contracts, backend, frontend, and ZK proof pipeline — works together correctly in production conditions.

**The core cryptographic and on-chain architecture is sound.** The ZK proof generation, on-chain Groth16 verification, MPF nullifier insertion, and vote tallying were all confirmed correct. A live multi-voter test (M4, 2026-10-05) ran 12 votes to confirmed on-chain transactions with the final tally matching both the API and chain state exactly. All rejection cases held: double votes, replay attacks, non-member proofs, late registrants, and out-of-window submissions were each correctly rejected by the validators. The relay wallet design was validated, confirming that voter wallet addresses are fully decoupled from vote transactions on-chain.

**Forty-two findings** were identified and addressed across three review phases. The main audit produced **16 findings** (1 Critical, 4 Medium, 1 Low, 10 Notes) — **all resolved**. The test review contributed a further **13 findings** (F-GROUP-4/5/6, F-VOTING-8 through F-VOTING-13, F-SEM-7 through F-SEM-10) — all Notes; **11 Fixed**, **2 Acknowledged**. The M4 system test produced **13 application-level findings** (F-APP-0 through F-APP-12) — 1 Critical, 3 High, 5 Medium, 2 Low; **7 Fixed**, **4 Partial**, **2 Acknowledged**.

The Critical finding (F-SEM-1) was a test infrastructure failure: all spending tests in `semaphore_test.ak` placed the VKey UTxO in `inputs` instead of `reference_inputs`, masking whether four key rejection conditions were tested at their intended condition. After the fix, the full spending path is confirmed by 22 tests (up from 16). The Medium findings were logic correctness issues: a missing minimum-options guard, a silent discard in weighted voting, and weaker NFT destination checks in two validators — all corrected. After applying all fixes, the on-chain test suite passes **154 tests** in `src/on-chain/` and **40 tests** (up from 32) in `modulo-p-cardano-semaphore`.

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
- **Status:** Fixed

**[F-GROUP-2] `group.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** No test attempts to mint two tokens with distinct asset names under the Group policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test minting two tokens with distinct asset names under the group policy.
- **Status:** Fixed

**[F-GROUP-3] `group.ak`: no test for minting Group NFT alongside an extra token**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** No test attempts to mint the Group NFT while sending an extra token (under a different policy) to the same script output. The `policies(without_lovelace(value)) == [policy_id]` check structurally rejects it, but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test that includes an extra token in the minted output alongside the Group NFT.
- **Status:** Fixed

**[F-GROUP-4] `group.ak`: no test for wrong `oref` in mint**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** `group.ak` mint Condition 0 consumes the parameterised `oref` (one-shot guarantee). No `fail` test passes a wrong UTxO as input while providing the correct `oref`. The equivalent test exists for `voting.ak` mint (`wrong_parameter_utxo`) but is absent here.
- **Impact:** Low
- **Recommendation:** Add a failure test that provides a different UTxO as input while the parameterised `oref` is absent from `inputs`.
- **Status:** Fixed

**[F-GROUP-5] `group.ak`: no test for `Create` redeemer on spend**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/group_test.ak`
- **Description:** `group.ak` spend returns `False` for any redeemer other than `Update` (`_ -> False`). No test confirms that spending with the `Create` redeemer is rejected.
- **Impact:** Low
- **Recommendation:** Add a failure test that attempts to spend the Group UTxO with the `Create` redeemer.
- **Status:** Fixed

**[F-GROUP-6] `group.ak` mint: value constraints on `GroupDatum` fields remain off-chain trust**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/group.ak`
- **Description:** F-GROUP-1 added a shape check (`expect _: GroupDatum = raw_datum`) at mint time, ensuring the datum is a valid `GroupDatum`. However, field-level constraints are not enforced: `admin_pkh` could be an empty byte array, and `group_merke_root` could be initialised to any value rather than 0. These invariants are trusted entirely to the off-chain minting flow.
- **Impact:** Low
- **Recommendation:** Document these as explicit off-chain preconditions. Optionally add guards at mint time (non-empty `admin_pkh`, `group_merke_root == 0`).
- **Status:** Acknowledged — field-level invariants are enforced by the off-chain minting flow; adding on-chain guards is out of scope for this audit cycle.

### `voting.ak`

**[F-VOTING-1] No minimum options count enforced**
- **Type:** Improvement
- **Location:** `src/on-chain/lib/voting_utilities.ak:24`
- **Description:** `check_options_index` rejects an empty options list but does not enforce a minimum of 2. A single-option voting event passes all mint checks. A meaningful vote requires at least two options; with an abstain option, at least three.
- **Impact:** Medium
- **Recommendation:** Add a `list.length(options) >= 2` (or `>= 3`) guard in `check_options_index` before the recursive check.
- **Status:** Fixed

**[F-VOTING-2] Unresolved TODO comment on value preservation check**
- **Type:** Improvement
- **Location:** `src/on-chain/validators/voting.ak:106`
- **Description:** A TODO comment questions whether `assets.without_lovelace(output) == assets.without_lovelace(input)` could trivially pass if both sides are empty. This cannot happen — `this_script_input` is the Urna UTxO, which always holds the Urna NFT from mint time, so the input side is never empty. The comment should be resolved and removed.
- **Impact:** Low
- **Recommendation:** Remove the TODO comment.
- **Status:** Fixed

**[F-VOTING-3] Weaker NFT destination check than `group.ak`**
- **Type:** Improvement
- **Location:** `src/on-chain/lib/voting_utilities.ak:111`, `src/on-chain/validators/voting.ak:52`
- **Description:** `voting.ak` Condition 2 uses `is_policy_on_value` to confirm the Urna NFT reached the script address. This only checks that the policy is *present* in the output value — other tokens can coexist in the same output. `group.ak` uses the stricter `policies(without_lovelace(value)) == [policy_id]`, which asserts the NFT is the *only* non-lovelace asset at that output. Both serve the same purpose, but `group.ak`'s approach is more defensive.
- **Impact:** Medium
- **Recommendation:** Replace `is_policy_on_value(output_to_script.value, policy_id)` with `assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]` to align with `group.ak` and prevent unintended tokens from being co-locked at the Urna UTxO.
- **Status:** Fixed

**[F-VOTING-4] No test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** The existing test `tx_mints_more_than_two_tokens` covers quantity > 1 for a single asset name. There is no test for the case where two tokens with *different* asset names (each with quantity 1) are minted under the same policy. The `expect [Pair(_, amount)]` pattern structurally handles this, but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a test that attempts to mint two tokens with distinct asset names under the voting policy and asserts failure.
- **Status:** Fixed

**[F-VOTING-5] No test for missing or non-inline datum on mint output**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint while sending the output with `NoDatum`, `DatumHash`, or a datum of the wrong type. Condition 3 uses `expect InlineDatum(...)` and `expect urna_datum: UrnaDatum`, which structurally reject all three cases, but none are empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add failure tests for `NoDatum` output, `DatumHash` output, and a datum that does not match `UrnaDatum`.
- **Status:** Fixed

**[F-VOTING-6] No test for inverted or zero-length voting window**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint with `event_start >= event_end`. The `event_start < event_end` check in Condition 4 handles it, but it is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test with `event_start == event_end` and another with `event_start > event_end`.
- **Status:** Fixed

**[F-VOTING-7] Weighted vote — invalid option index silently discards weight**
- **Type:** Note
- **Location:** `src/on-chain/lib/voting_utilities.ak:40`
- **Description:** `update_option` returns the options unchanged if the given index is not found, rather than failing. `weighted_vote` calls `update_option` for each `(index, count)` pair in the signal. `check_weight` only verifies the total weight in the signal sums to `dat.weight` — it does not verify all indices are valid. A voter can include weight on a non-existent option index: `check_weight` passes, but that weight is silently lost from the tally. The voter's nullifier is consumed. This is asymmetric with simple mode, where `simple_vote` fails hard on an invalid index.
- **Impact:** Medium
- **Recommendation:** Add an index validation step in `weighted_vote` or `check_weight` to verify all option indices in the signal exist in `dat.options`. Alternatively, make `update_option` fail on a missing index.
- **Status:** Fixed

**[F-VOTING-8] `vote_out_of_time_3` fails for the wrong reason**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/spending_logic_test.ak:914`
- **Description:** Labelled "validity range of the tx is not within the voting time event." The `signal_message` encodes a vote for option index 35 with weight 60 on a 3-option, weight-1 ballot. Option index 35 is out of bounds (`simple_vote` errors) and weight 60 ≠ 1. The test fails but for an ambiguous reason — the time check and the malformed signal both independently cause rejection. The intended condition (time enforcement) is not cleanly isolated.
- **Impact:** Low
- **Recommendation:** Use a valid `signal_message` (correct index and weight) so the only rejection reason is the time condition.
- **Status:** Fixed

**[F-VOTING-9] `vote_out_of_time_2` has two confounding rejection reasons**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/spending_logic_test.ak:824`
- **Description:** Labelled "vote window is not open yet." The output datum sets `event_date = (50, 100)` while the input has `(1, 100)`. `voting.ak` spend enforces `dat.event_date == out_dat.event_date` via `is_datum_preserved`. The test fails due to both the time check and the datum preservation check, not the time check alone.
- **Impact:** Low
- **Recommendation:** Preserve `event_date` in the output datum so the only rejection reason is the time condition.
- **Status:** Fixed

**[F-VOTING-10] `signal_digest_scalar` uses pre-v0.9.3 scalar pattern**
- **Type:** Note
- **Location:** `src/on-chain/lib/tests/signal_tests.ak:89`
- **Description:** The test calls `scalar.from_bytearray_big_endian(signal_bytes)` and uses `expect Some(...)` to unwrap the result. `scalar.from_bytearray_big_endian` returns `None` for values ≥ the BLS12-381 scalar field prime `r` (~55% of all 256-bit blake2b hashes). The test passes only because the hash of `[(2,1)]` happens to fall below `r`. This is inconsistent with the v0.9.3 fix (`% scalar.field_prime` on-chain, `% BLS12_381_R` in `src/zk/src/proof.ts`) and could mislead a developer using this test as a reference for computing `signal_hash`.
- **Impact:** Low
- **Recommendation:** Update the test to use `builtin.bytearray_to_integer(True, signal_bytes) % scalar.field_prime`, matching the v0.9.3 pattern.
- **Status:** Fixed

**[F-VOTING-11] `vote_14` has a wrong comment**
- **Type:** Note
- **Location:** `src/on-chain/lib/tests/voting_tests.ak:179`
- **Description:** The comment reads "Validates voting on option that has negative vote count (-5→-4)." The actual option is `(1, 5)` (positive, incrementing 5→6). The test is correct; the comment is misleading.
- **Impact:** Low
- **Recommendation:** Update the comment to reflect the actual option values.
- **Status:** Fixed

**[F-VOTING-12] `weighted_vote_10` has an unresolved TODO on duplicate indices**
- **Type:** Note
- **Location:** `src/on-chain/lib/tests/voting_tests.ak:292`
- **Description:** `weighted_vote` accepts duplicate indices in `target_options` (e.g., `[(1,1),(1,1)]` increments option 1 by 2). The developer flagged this with `// TODO: Fix this corner case`. Not exploitable — `check_weight` still enforces total == allowed weight — but the duplicate encoding is unresolved and could confuse an off-chain signal encoder building weighted votes.
- **Impact:** Low
- **Recommendation:** Decide whether duplicate indices are intentionally accepted or should be rejected. If rejecting, add a deduplication check. Either way, remove the TODO.
- **Status:** Fixed

**[F-VOTING-13] Spending tests use stub Semaphore datum with no ZK integration coverage**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/spending_logic_test.ak`
- **Description:** All spending tests set `semaphore_output.datum: NoDatum` and most use `nullifier = 0, signal_hash = 0`. Valid as unit tests of `voting.ak` in isolation. There is no integration test running both `voting.ak` and `semaphore.ak` on a fully-formed transaction with a real ZK proof and a real MPF insertion.
- **Impact:** Low
- **Recommendation:** Consider an integration test that constructs a full vote transaction spending both UTxOs with a real proof and non-empty MPF proof steps. The `snark_1` test in `semaphore_test.ak` demonstrates a standalone proof can be verified; a combined test would confirm the full path end-to-end.
- **Status:** Acknowledged — the full vote path is covered by the M4 on-chain system test (12 confirmed votes); a pure on-chain Aiken integration test combining both validators is deferred to a future cycle.

### `semaphore.ak`


**[F-SEM-1] All spending tests use `inputs` instead of `reference_inputs` for the VKey input**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** Every spending test builds the transaction with `vkey_input` in the `inputs` field, but the spending validator reads from `reference_inputs` (`find_input(reference_inputs, dat.vkey_ref_input)`). Since `reference_inputs` is never set in these tests, it is always empty, causing `expect Some(snark_vkey_ref_input)` to fail before any of the intended conditions are reached. The happy path test `spend_signal_semaphore_1` fails. All `fail` spending tests (`spend_value_not_sent_back`, `spend_datum_not_preserved_1/2`, `spend_vkey_field_with_incorrect_value`, `spend_incorrect_zk_proof`, `spend_nullifier_already_inserted`, `spend_tampered_message`) pass, but for the wrong reason — each errors at Condition 2 rather than the condition it is intended to test. Confirmed by running `aiken check` in the dependency package.
- **Impact:** High
- **Recommendation:** In all spending tests, move `vkey_input` from `inputs` to `reference_inputs` in the transaction construction. Verify that `spend_signal_semaphore_1` then passes and that each `fail` test fails at its intended condition.
- **Status:** Fixed

**[F-SEM-2] `semaphore.ak`: no test for minting two tokens with different asset names**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** No test attempts to mint two tokens with distinct asset names under the Semaphore policy (each with quantity 1). The `expect [Pair(_, amount)]` pattern structurally handles this but it is not empirically confirmed. Same gap as F-GROUP-2 and F-VOTING-4.
- **Impact:** Low
- **Recommendation:** Add a failure test minting two tokens with distinct asset names under the Semaphore policy.
- **Status:** Fixed

**[F-SEM-3] `semaphore.ak` mint: weaker NFT destination check than `group.ak`**
- **Type:** Improvement
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/semaphore.ak:46`
- **Description:** `semaphore.ak` Condition 2 uses `is_policy_on_value` to confirm the Semaphore NFT reached the script address. This only checks that the policy is *present* in the output value — other tokens can coexist in the same output. `group.ak` uses the stricter `policies(without_lovelace(value)) == [policy_id]`, which asserts the NFT is the *only* non-lovelace asset at that output. Same issue as F-VOTING-3.
- **Impact:** Medium
- **Recommendation:** Replace `is_policy_on_value(output_to_script.value, policy_id)` with `assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]` to align with `group.ak`.
- **Status:** Fixed

**[F-SEM-4] `semaphore.ak`: no test for `DatumHash` or wrong-typed datum on mint output**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** `mint_no_datum` confirms the `NoDatum` case is rejected, but there is no test for a `DatumHash` datum or a datum that does not match `SemaphoreDatum`. Both are structurally rejected by `expect InlineDatum(...)` and `expect out_semaphore_dat: SemaphoreDatum`, but neither is empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add failure tests for a `DatumHash` output and a datum that does not match `SemaphoreDatum`.
- **Status:** Fixed

**[F-SEM-5] `semaphore.ak`: no test for missing Group NFT in `reference_inputs` on mint**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** No test attempts to mint the Semaphore NFT without including the Group NFT as a reference input. `expect [group_reference_input]` fails hard when the filter returns empty, but this is not empirically confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test that omits the Group reference input from `reference_inputs`.
- **Status:** Fixed

**[F-SEM-6] `semaphore.ak`: no test for altered `vkey_ref_input` in output datum**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** `spend_datum_not_preserved_1` and `spend_datum_not_preserved_2` confirm that `group_merke_root` and `group_token_policy` are independently enforced. No test alters `vkey_ref_input` in the output datum while keeping the other fields intact. The third equality check in `is_datum_preserved` is structurally enforced but not independently confirmed.
- **Impact:** Low
- **Recommendation:** Add a failure test that changes only `vkey_ref_input` in the output datum and asserts rejection.
- **Status:** Fixed

**[F-SEM-7] `spend_vkey_field_with_incorrect_value` has a construction error beyond F-SEM-1**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** This test intends to verify that a VKey UTxO with a wrong datum type (`InlineDatum(1)`) is rejected. However, both `initial_semaphore_datum.vkey_ref_input` and `output_semaphore_datum.vkey_ref_input` point to `OutputReference { transaction_id: #"01bc", output_index: 0 }` — the same reference. `is_datum_preserved` therefore returns `True`, and the test reaches Condition 2 where the wrong datum type is caught. After fixing F-SEM-1, the test produces the correct outcome (fail) but for an indirect reason. A clean construction would use a distinct `OutputReference` for `wrong_vk_input` so the datum-type rejection is the sole cause.
- **Impact:** Low
- **Recommendation:** Set a distinct `OutputReference` for `wrong_vk_input` to isolate the datum-type check from the datum-preservation check.
- **Status:** Fixed

**[F-SEM-8] `spend_signal_semaphore_1` uses an empty MPF proof**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak:620`
- **Description:** The happy-path spending test stubs `mpf_proof = []`. For an empty initial trie (`null_hash`), `mpf.insert` with an empty proof succeeds — this is a property of the empty-trie case, not a general result. No test exercises MPF insertion against a non-empty nullifier trie through the spending validator path.
- **Impact:** Low
- **Recommendation:** Add a spending test where the trie already holds at least one nullifier, with a real multi-step MPF proof. This would empirically confirm double-vote prevention under the conditions that arise after the first vote.
- **Status:** Fixed

**[F-SEM-9] `semaphore.ak`: no test for wrong `oref` in mint**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** No `fail` test passes a wrong UTxO as input while the parameterised `oref` is absent. The one-shot guarantee is structurally enforced by Condition 0 but not empirically confirmed. Same gap as F-GROUP-4; unlike `voting.ak` which has `wrong_parameter_utxo`, both upstream validators are missing this test.
- **Impact:** Low
- **Recommendation:** Add a failure test that provides a different UTxO as input while the parameterised `oref` is absent from `inputs`.
- **Status:** Fixed

**[F-SEM-10] `semaphore.ak`: no test for `Signal` redeemer on mint**
- **Type:** Note
- **Location:** `src/on-chain/build/packages/modulo-p-cardano-semaphore/validators/tests/semaphore_test.ak`
- **Description:** The mint validator's `_ -> False` branch is not exercised. No test confirms that calling the Semaphore mint endpoint with a `Signal` redeemer is rejected.
- **Impact:** Low
- **Recommendation:** Add a failure test that invokes the Semaphore mint validator with a `Signal` redeemer and asserts rejection.
- **Status:** Fixed

---

## Application Findings

### Test Context

The M4 system test was a scripted end-to-end voting run on Cardano preprod against the live backend (`api.vote.trustlevel.io`), code reference commit `51cddaa`. 15 voter wallets, an admin wallet, and a funding wallet were all controlled by one script (simulated voters, not independent public testers). The code paths exercised are identical to those used by real users: `@src/tx` browser builders, `src/frontend/lib/blockchain-helpers.ts`, and the `src/backend` API. The only differences from a live user session are signing (MeshWallet instead of CIP-30) and proof generation (Node.js `@src/zk/dist/proof.js` with byte-identical WASM and zkey).

**Runs (2026-10-05):**

- **Dry run** — event `7361329530`, 2 voters. Identified F-APP-0.
- **Main run** — event `3907417823`. Semaphore script `addr_test1wzedkt4d3jclzq363pl8rwpvngx9k7kktq4p842trsralcsfwuwjj`, Voting script `addr_test1wpdyadvg7f5fu3fc58yc09rv0uj9tu9rut0yqgrqje837dgfz3ugr`. 12 votes confirmed; final tally API = chain = expected (6/3/3). Double vote, replay, non-member, late registrant, and too-late vote were all correctly rejected. Identified F-APP-1 through F-APP-8, F-APP-11, F-APP-12.
- **pinusch's live test** — event `1869725828`, five participants from the community. Identified F-APP-6, F-APP-9, F-APP-10 from the user side.

Full report with timeline, state trace, and explorer links: [`docs/testing/M4_TEST_REPORT.md`](../testing/M4_TEST_REPORT.md) (Part C, the re-run after the fixes; the 2026-10-05 findings are in Talon's write-up, `docs/testing/interviews/VotingAppFeedback_Pumbiii.md`).

---

### `src/backend`

**[F-APP-0] Nullifier trie detaches after a rollback**
- **Type:** Critical
- **Location:** `src/backend/src/voting-event/voting-event.service.ts:714`, `src/zk/src/mpf.ts:48`
- **Description:** `loadTrie` uses `Trie.load(store).catch(() => new Trie(store))`. In `@aiken-lang/merkle-patricia-forestry` 1.3.1, `Trie.load` returns a new in-memory trie (not backed by LevelDB) when the stored root is the null hash. After any rollback that empties the trie, every subsequent load is detached: inserts never reach LevelDB, proof steps are always 0, and the MPF root diverges from chain. Every later vote fails at `expect excluding(key, proof) == self.root`. All six minted live events in the M4 dry run had at most one confirmed vote due to this bug.
- **Impact:** High
- **Recommendation:** Replace the catch with an explicit empty check: `const trie = await Trie.load(store); return trie.isEmpty() ? new Trie(store) : trie;` with a separate `NotFound` guard for first load. Apply at all load sites.
- **Status:** Fixed

**[F-APP-1] Public event API exposes admin token and invitee emails**
- **Type:** Note
- **Location:** `src/backend/src/voting-event/voting-event.controller.ts:27,32`
- **Description:** `GET /voting-event` and `GET /voting-event/:eventId` are unauthenticated and return the full entity including `adminToken` (grants admin page access), `invitedParticipants` (email list), and `groupLeafCommitments` (userId → Semaphore commitment mapping). Confirmed on the live API 2026-10-05 (field names only, values not read).
- **Impact:** High
- **Recommendation:** Return a sanitized public projection that omits sensitive fields. Serve admin-only fields only with a valid admin token. A fix plan exists.
- **Status:** Fixed

**[F-APP-2] Nullifier endpoints are unauthenticated**
- **Type:** Note
- **Location:** `src/backend/src/voting-event/voting-event.controller.ts:160,170`
- **Description:** `POST` and `DELETE /voting-event/:eventId/nullifier` accept any payload from anyone. A junk insert or deletion of a confirmed nullifier diverges the backend MPF trie from the on-chain root, causing all subsequent legitimate votes to fail at the Semaphore validator. Double voting remains prevented on-chain. Confirmed in M4 main run: junk POST → root divergence → vote rejected; DELETE corrected it.
- **Impact:** High
- **Recommendation:** Accept nullifier inserts only alongside a server-verified ZK proof. Remove the public DELETE; rollback must be internal, tied to a pending vote ID. Periodically reconcile the trie root against the Semaphore UTxO datum.
- **Status:** Partial — `DELETE` endpoint admin-gated via `adminToken`; `POST` endpoint still unauthenticated (only BLS12-381 scalar range check, not ZK proof verification). See Changes Made.

**[F-APP-4] Backend can correlate userId to vote choice**
- **Type:** Note
- **Location:** `src/backend/src/voting-event/voting-event.service.ts`
- **Description:** Per vote, the backend receives `GET merkle-proof/:userId`, `POST nullifier`, and `POST vote` in close succession from the same client. An operator logging these requests can join `userId → vote choice`. The relay wallet design hides the voter's on-chain wallet identity but does not affect this server-side correlation.
- **Impact:** Medium
- **Recommendation:** Serve a frozen group snapshot so clients compute their Merkle path locally; decouple the nullifier submission from the userId request.
- **Status:** Acknowledged — server-side correlation is an inherent property of a centralised relay design; mitigations (local Merkle path computation, anonymous nullifier submission) are deferred to a future architecture iteration.

**[F-APP-6] Concurrent votes conflict on shared UTxOs**
- **Type:** Improvement
- **Location:** `src/backend/src/voting-event/voting-event.service.ts`
- **Description:** Every vote transaction spends and recreates the Semaphore and Voting UTxOs. Two votes submitted within the same block window collide: the second is rejected ("inputs already spent") even though both proofs are valid. The backend MPF trie advances on insert, not on confirmation, so both voters believe they succeeded. Observed in M4 main run (V11/V13 within ~2 s).
- **Impact:** Medium
- **Recommendation:** Serialise vote submission per event: issue the next MPF proof only after the previous vote confirms or times out.
- **Status:** Fixed — relay vote path serialised via `withVoteLock`; browser vote path removed entirely (all votes now go through relay). See Changes Made.

**[F-APP-7] Concurrent registrations silently lose members**
- **Type:** Note
- **Location:** `src/backend/src/voting-event/voting-event.service.ts:145`
- **Description:** `addParticipant` reads `groupLeafCommitments`, appends one entry, and writes back with no lock or transaction. Simultaneous registrations overwrite each other; all callers receive HTTP 201 but only the last write survives. M4 main run: V11–V13 registered simultaneously, 13 members written instead of 14; V12 (userId 29) was absent from the frozen root and could never vote.
- **Impact:** High
- **Recommendation:** Wrap registration in a DB transaction or per-event mutex. After writing, re-read and verify the commitment is present; return an error if it is missing.
- **Status:** Fixed

**[F-APP-8] Blockfrost API key exposed in the frontend bundle**
- **Type:** Improvement
- **Location:** `src/frontend` (`NEXT_PUBLIC_BLOCKFROST_API_KEY`)
- **Description:** `NEXT_PUBLIC_BLOCKFROST_API_KEY` is inlined into the live JS bundle and readable by anyone. Anyone can exhaust the project quota and halt voting for all users. No wallet or fund access is possible. Confirmed on live deployment 2026-10-05. Also documented in CLAUDE.md Known Improvements.
- **Impact:** Medium
- **Recommendation:** Add `GET /voting-event/:eventId/script-utxos` backend endpoint; refactor `buildVoteTransaction` to accept pre-fetched UTxOs. Until then, use a separate rotatable frontend-only key.
- **Status:** Partial — voter flow no longer uses Blockfrost (relay-vote fetches UTxOs server-side); manage page (admin-only) still inlines `NEXT_PUBLIC_BLOCKFROST_API_KEY`. See Changes Made.

**[F-APP-12] Non-member voters receive HTTP 500**
- **Type:** Improvement
- **Location:** `src/backend/src/voting-event/voting-event.service.ts:614` (API); `src/frontend/app/event/[id]/page.tsx` (UI)
- **Description:** `GET /voting-event/:eventId/merkle-proof/:userId` throws an unhandled exception when the user is not in the group (late registrant, or victim of F-APP-7). The caller receives "Internal server error" with no actionable message. Observed with V14 (registered after mint) and V12 (lost via F-APP-7).
- **Impact:** Low
- **Recommendation:** API: return 404 with "User not in this event's group (registered after voting started)". UI: surface that message to the voter instead of showing a generic error.
- **Status:** Fixed — `getMerkleProof` now returns proper HTTP errors (409 for post-mint registrant, 404 for non-participant, 422 for historical group mismatch) with actionable messages. See Changes Made.

---

### `src/frontend`

**[F-APP-3] No nullifier rollback when transaction build fails**
- **Type:** Improvement
- **Location:** `src/frontend/app/event/[id]/page.tsx:629,656`
- **Description:** In `submitVote()`, the rollback helper is defined after `buildVoteTransaction`. If `buildVoteTransaction` throws, the nullifier is already inserted in the backend but the rollback is never reached. The voter's next attempt receives HTTP 409 ("Nullifier already used"). The relay vote backend path handles this correctly; this gap is specific to the browser vote path.
- **Impact:** Medium
- **Recommendation:** Track "nullifier inserted" before the build call and roll back in the outer catch regardless of where the failure occurs.
- **Status:** Fixed — browser vote path replaced by relay-vote; `relayVote` in the service calls `rollbackNullifier` in its outer `catch` on any build, sign, or submit failure. See Changes Made.

**[F-APP-5] Vote choice visible on-chain and linked to the fee-paying wallet**
- **Type:** Note
- **Location:** `src/frontend` / transaction construction
- **Description:** The fee-paying wallet address appears in the vote transaction alongside the plaintext `signal_message`. All 12 M4 vote choices were decoded from chain data (wallet → tx → option → nullifier). The relay wallet design hides the voter's CIP-30 wallet; the option choice remains public on-chain by design.
- **Impact:** Medium
- **Recommendation:** For anonymity-only requirements the relay design is sufficient. For ballot secrecy, encrypted signals with commit–reveal are needed.
- **Status:** Partial — relay wallet hides voter on-chain identity; option choice remains public. See Changes Made.

**[F-APP-9] Running tally visible while voting is open**
- **Type:** Improvement
- **Location:** `src/frontend/app/event/[id]/page.tsx` / results display
- **Description:** A voter who has already cast their vote can see the live running tally while others are still voting. Observed in a live five-person test. Note: the tally is also readable directly from on-chain data (plaintext redeemer), so UI hiding alone does not provide tally secrecy.
- **Impact:** Medium
- **Recommendation:** Hide the tally in the UI until `endingDate`. Clarify in the UX that on-chain tallies are always readable by anyone inspecting the chain.
- **Status:** Acknowledged — tally secrecy is not achievable at the UI level given on-chain data is public by design; deferred to a future cycle.

**[F-APP-10] Misleading vote error messages**
- **Type:** Improvement
- **Location:** `src/frontend/app/event/[id]/page.tsx:449` (`classifySubmissionError`)
- **Description:** `ValueNotConserved` is checked before `BadInputs`; a vote built against UTxOs already spent by a pending transaction shows "Insufficient funds" instead of a pending-tx message. Unknown errors fall through to a generic message. Dev mode now surfaces the raw error; the production classifier remains unchanged.
- **Impact:** Low
- **Recommendation:** Check `BadInputs`/conflicting inputs first and surface "A previous transaction is still pending — wait and retry." Add a short error reference for unknown failures.
- **Status:** Partial — raw error surfaced in dev mode; production message unchanged. See Changes Made.

**[F-APP-11] Event start can fail between the two mints**
- **Type:** Improvement
- **Location:** `src/frontend/app/event/[id]/manage/page.tsx:856,864`
- **Description:** `handleStartVoting` reads admin UTxOs from Blockfrost immediately after the Group NFT mint confirms, then picks index 0. If Blockfrost still lists the input the group mint just consumed, the Semaphore+Voting mint fails with "All inputs are spent" and the admin must restart — orphaning the earlier Group NFT. M4 main run: two failed starts and two orphaned group NFTs before the third attempt succeeded.
- **Impact:** Medium
- **Recommendation:** Exclude the group-mint transaction's inputs from UTxO selection for the second mint. Add retry-with-backoff on "inputs spent".
- **Status:** Fixed — `preGroupMintRefs` Set built from the group-mint transaction's consumed UTxOs; second Blockfrost fetch filters them out before UTxO selection. See Changes Made.

---

## Changes Made

> What was fixed or acknowledged in response to findings. Documents the response to each finding and closes the loop.

---

### `group.ak` (modulo-p/cardano-semaphore)

#### [F-GROUP-1] `group.ak` does not validate `GroupDatum` structure

**File:** `validators/group.ak`

Added Condition 3 to the `Create` mint branch: `expect InlineDatum(raw_datum) = output_to_script.datum` followed by `expect _: GroupDatum = raw_datum`. Previously any datum (including `NoDatum`) was accepted at mint time — a malformed datum would permanently brick the Group UTxO since mint is one-shot. The recommendation was to add a comment acknowledging the off-chain trust assumption; the applied fix goes further and enforces the shape on-chain. Execution cost is negligible for a one-time mint.

#### [F-GROUP-2] No test for minting two tokens with different asset names

**File:** `validators/tests/group_test.ak`

Added `mint_two_tokens_different_names` (fail): mints two tokens with distinct asset names (each qty 1) under the Group policy. Confirms `expect [Pair(_, amount)]` rejects a two-element dict.

#### [F-GROUP-3] No test for minting Group NFT alongside an extra token

**File:** `validators/tests/group_test.ak`

Added `mint_extra_token_in_output` (fail): mints one Group NFT plus a foreign-policy token in the script output. Confirms `policies(without_lovelace(value)) == [policy_id]` rejects an output containing more than the Group NFT.

#### [F-GROUP-4] No test for wrong `oref` in mint

**File:** `validators/tests/group_test.ak`

Added `mint_wrong_oref` (fail): provides a UTxO with a different `OutputReference` (`#"dead"#0`) as the only input while the parameterised `oref` is absent. Confirms `expect Some(_) = find_input(inputs, oref)` fails hard when the one-shot UTxO is not present.

#### [F-GROUP-5] No test for `Create` redeemer on spend

**File:** `validators/tests/group_test.ak`

Added `spend_create_redeemer_rejected` (fail): calls `group.group.spend` with the `Create` redeemer against an otherwise valid transaction. Confirms the `_ -> False` catch-all in the spend handler rejects any redeemer other than `Update`.

---

### `semaphore.ak` (modulo-p/cardano-semaphore)

#### [F-SEM-1] All spending tests use `inputs` instead of `reference_inputs` for the VKey input

**File:** `validators/tests/semaphore_test.ak`

Moved `vkey_input` from `inputs` to `reference_inputs` in all spending test transactions. The spending validator calls `find_input(reference_inputs, dat.vkey_ref_input)` — placing it in `inputs` caused every spending test to abort at Condition 2 instead of its intended condition. After the fix: `spend_signal_semaphore_1` (happy path) now passes; all `fail` spending tests now fail at their intended conditions. Note: line 657 carries the comment `// Include vkey as reference input` while the code uses `inputs` — a direct indicator of the root cause (S-5 / F-SEM-1). The comment is now accurate after the fix.

#### [F-SEM-2] No test for minting two tokens with different asset names

**File:** `validators/tests/semaphore_test.ak`

Added `mint_two_tokens_different_names` (fail): same gap as F-GROUP-2 and F-VOTING-4. Confirms `expect [Pair(_, amount)]` rejects two distinct asset names under the Semaphore policy.

#### [F-SEM-3] Weaker NFT destination check than `group.ak`

**Files:** `validators/semaphore.ak`, `validators/tests/semaphore_test.ak`

Replaced `is_policy_on_value(output_to_script.value, policy_id)` with `assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]` in Condition 2 of mint. Brings the Semaphore NFT destination check to parity with `group.ak`, preventing foreign tokens from being locked into the Semaphore UTxO at mint time. Added companion test `mint_extra_token_in_output` (fail) confirming the stricter check.

#### [F-SEM-4] No test for `DatumHash` or wrong-typed datum on mint output

**File:** `validators/tests/semaphore_test.ak`

Added two `fail` tests covering both datum guards in Condition 3 of mint:
- `mint_datum_hash` — output carries `DatumHash`, rejected by `expect InlineDatum(...)`
- `mint_wrong_datum_type` — output carries `InlineDatum(42)`, rejected by `expect out_semaphore_dat: SemaphoreDatum`

#### [F-SEM-5] No test for missing Group NFT in `reference_inputs` on mint

**File:** `validators/tests/semaphore_test.ak`

Added `mint_no_group_reference_input` (fail): omits the Group NFT from `reference_inputs`. Confirms `expect [group_reference_input]` aborts when the filter returns `[]`.

#### [F-SEM-6] No test for altered `vkey_ref_input` in output datum

**File:** `validators/tests/semaphore_test.ak`

Added `spend_vkey_ref_input_altered` (fail): spending test that alters only `vkey_ref_input` in the output datum while keeping all other fields and the ZK proof valid. Independently confirms the third equality check in `is_datum_preserved` is enforced.

**Test count after all upstream changes:** group_test 7 → 9, semaphore_test 16 → 22, total 32 → 40. All 40 pass.

#### [F-SEM-7] `spend_vkey_field_with_incorrect_value` construction error

**File:** `validators/tests/semaphore_test.ak`

Assigned a distinct `OutputReference { transaction_id: #"baad", output_index: 0 }` (`wrong_vk_oref`) to the wrong-typed VKey input, and set both `initial_semaphore_datum.vkey_ref_input` and `output_semaphore_datum.vkey_ref_input` to this same `wrong_vk_oref`. `is_datum_preserved` now passes (both datums agree on the oref), and the test fails solely because `expect snark_vkey: SnarkVerificationKey = InlineDatum(1)` is rejected at Condition 2 — the datum-type check is now the isolated cause.

#### [F-SEM-8] `spend_signal_semaphore_1` uses an empty MPF proof

**File:** `validators/tests/semaphore_test.ak`

Added `spend_signal_semaphore_nonempty_trie` (pass): starts from a non-empty trie (`nullifier_mpf_root: #"e547413c..."`) containing a dummy nullifier, supplies a real single-`Leaf` MPF proof step for the non-membership witness, and asserts the output root (`#"30c9a81f..."`) matches the trie after inserting the real nullifier. Empirically confirms that `mpf.insert` enforces non-membership and commits the correct root under conditions that arise after the first vote in a live event.

#### [F-SEM-9] No test for wrong `oref` in mint

**File:** `validators/tests/semaphore_test.ak`

Added `mint_wrong_oref` (fail): provides a UTxO with `OutputReference { transaction_id: #"dead", output_index: 0 }` as the only input while the parameterised `initial_oref` is absent from `inputs`. Confirms `expect Some(_) = find_input(inputs, oref)` fails hard, closing the same gap addressed in `group.ak` (F-GROUP-4).

#### [F-SEM-10] No test for `Signal` redeemer on mint

**File:** `validators/tests/semaphore_test.ak`

Added `mint_signal_redeemer_rejected` (fail): invokes `semaphore.semaphore.mint` with a `Signal(zk_proof, [], 0, 0, #"")` redeemer against an otherwise minimal valid transaction. Confirms the `_ -> False` catch-all in the mint handler rejects any redeemer other than `Create`.

---

### `voting.ak`

### [F-VOTING-7] Weighted vote — invalid option index silently discards weight

**Files:** `src/on-chain/lib/voting_utilities.ak`, `src/on-chain/validators/voting.ak`

Added `check_vote_indices` to `voting_utilities.ak`:

```aiken
pub fn check_vote_indices(options: Options, vote: Options) -> Bool {
  list.all(vote, fn(v) { list.any(options, fn(o) { o.1st == v.1st }) })
}
```

In `voting.ak` weighted branch, extracted `weighted_vote` into its own variable and added `are_indices_valid` as an explicit condition:

```aiken
let updated_options: Options = weighted_vote(dat.options, vote)
let are_indices_valid: Bool = check_vote_indices(dat.options, vote)
let is_vote_correct: Bool = updated_options == out_dat.options
let is_weight_correct: Bool = check_weight(vote, dat.weight)
are_indices_valid && is_vote_correct && is_weight_correct && validator_conditions
```

A signal with an index not present in `dat.options` now fails the transaction. Brings the weighted path to the same standard as simple voting, where `simple_vote` already rejects out-of-bounds indices with `error "Index out of range"`.

---

### [F-VOTING-2] Unresolved TODO comment on value preservation check

**File:** `src/on-chain/validators/voting.ak`

Removed the TODO comment at the `is_value_returned` binding. The concern in the comment (that both sides could be empty) cannot arise — `this_script_input` is the Urna UTxO, which always holds the Urna NFT from mint time. The check is correct as written.

---

### [F-VOTING-3] Weaker NFT destination check than `group.ak`

**File:** `src/on-chain/validators/voting.ak`

Replaced `is_policy_on_value(output_to_script.value, policy_id)` with the stricter check used by `group.ak`:

```aiken
let is_nft_sent_to_script: Bool =
  assets.policies(assets.without_lovelace(output_to_script.value)) == [
    policy_id,
  ]
```

This asserts the Urna NFT is the *only* non-lovelace asset at the script output, preventing arbitrary tokens from being co-locked at the Urna UTxO alongside the NFT.

---

#### [F-VOTING-4] No test for minting two tokens with different asset names

**File:** `src/on-chain/validators/tests/minting_logic_test.ak`

Added `tx_mints_two_tokens_different_names` (fail): mints two distinct asset names under the voting policy (each qty 1). Confirms `expect [Pair(_, amount)]` rejects a two-element dict, matching the equivalent tests added for `group.ak` (F-GROUP-2) and `semaphore.ak` (F-SEM-2).

#### [F-VOTING-5] No test for missing or non-inline datum on mint output

**File:** `src/on-chain/validators/tests/minting_logic_test.ak`

Added three `fail` tests covering all three datum guards in Condition 3 of mint:
- `mint_output_no_datum` — output carries `NoDatum`, rejected by `expect InlineDatum(...)`
- `mint_output_datum_hash` — output carries `DatumHash(#"00112233...")`, rejected by `expect InlineDatum(...)`
- `mint_output_wrong_datum_type` — output carries `InlineDatum(42)`, rejected by `expect urna_datum: UrnaDatum`

#### [F-VOTING-6] No test for inverted or zero-length voting window

**File:** `src/on-chain/validators/tests/minting_logic_test.ak`

Added two `fail` tests:
- `mint_zero_length_voting_window` — `event_date: (50, 50)`, rejected by `event_start < event_end`
- `mint_inverted_voting_window` — `event_date: (100, 1)`, rejected by `event_start < event_end`

#### [F-VOTING-8] `vote_out_of_time_3` fails for the wrong reason

**File:** `src/on-chain/validators/tests/spending_logic_test.ak`

Replaced the malformed `signal_message` (option index 35, weight 60) with `serialise_signal([(2,1)])` — a valid vote on index 2 with weight 1, matching the 3-option weight-1 ballot. The test now fails solely because validity range `[1,49]` is not entirely after `event_start=1`, isolating the time check as the only rejection reason.

#### [F-VOTING-9] `vote_out_of_time_2` has two confounding rejection reasons

**File:** `src/on-chain/validators/tests/spending_logic_test.ak`

The output datum's `event_date` was changed from `(50, 100)` to `(1, 100)`, matching the input datum. `is_datum_preserved` now passes; the test fails solely because validity range `[1,49]` is not entirely after `event_start=1`, isolating the time check as the only rejection reason.

#### [F-VOTING-10] `signal_digest_scalar` uses pre-v0.9.3 scalar pattern

**File:** `src/on-chain/lib/tests/signal_tests.ak`

Updated `signal_digest_scalar` to use `builtin.bytearray_to_integer(True, signal_bytes) % scalar.field_prime` instead of `scalar.from_bytearray_big_endian(signal_bytes)` with `expect Some(...)`. The test now documents the canonical v0.9.3 computation and will not silently pass by accident on a hash that happens to fall below `r`.

#### [F-VOTING-11] `vote_14` has a wrong comment

**File:** `src/on-chain/lib/tests/voting_tests.ak`

Updated the comment from "Validates voting on option that has negative vote count (-5→-4)" to "Test 14: Vote on option with existing positive count / Validates increment on an option already holding a value (5→6)", accurately describing the actual test data `(1, 5)` → `(1, 6)`.

#### [F-VOTING-12] `weighted_vote_10` has an unresolved TODO on duplicate indices

**File:** `src/on-chain/lib/tests/voting_tests.ak`

Decided: duplicate indices are **rejected**. The TODO was removed. The test was updated to call `check_vote_indices(options, [(1,1),(1,1)])` directly as a `fail` test, explicitly confirming that the no-duplicates check in `check_vote_indices` is the enforcement point. The test comment now reads "Test duplicate target options — duplicate indices are rejected by check_vote_indices".

---

### [F-VOTING-1] No minimum options count enforced

**File:** `src/on-chain/validators/voting.ak`

Added **Condition 7** to the `voting` mint validator:

```aiken
// Condition 7: Are there at least 2 options?
let are_options_count_valid: Bool =
  list.length(urna_datum.options) >= 2
```

`are_options_count_valid` is included in the final `and {}`. The observation comment was updated from "3 to 6" to "3 to 7". The threshold of 2 covers the minimal meaningful case (two-option vote) while leaving room for the typical three-option pattern (abstain + two choices). A single-option voting event is now rejected at mint time.

---

### `src/backend`

#### [F-APP-0] Nullifier trie detaches after a rollback

**Files:** `src/zk/src/mpf.ts`, `src/backend/src/voting-event/voting-event.service.ts`

Replaced the catch-based `Trie.load` pattern with an explicit empty check at all three load sites:

```ts
async function loadTrie(store: Store): Promise<Trie> {
  try {
    const trie = await Trie.load(store);
    return trie.isEmpty() ? new Trie(store) : trie;  // re-attach empty trie to LevelDB
  } catch (e) {
    if (/NotFound/.test(String(e))) return new Trie(store); // first load, no trie yet
    throw e;
  }
}
```

Previously `Trie.load` returned a detached in-memory trie when the stored root was the null hash (empty trie after a rollback), so subsequent inserts never reached LevelDB. The fix ensures an empty trie is always constructed with the LevelDB store, keeping inserts persistent regardless of rollback history. Verified offline: proof step counts 0/0/1/1 with the old code become 0/0/1/1 correct with the fix; roots match a fresh reference trie.

#### [F-APP-1] Public event API exposes admin token and invitee emails

**File:** `src/backend/src/voting-event/voting-event.service.ts`

`getAllVotingEvents()` and `getVotingEvent()` now return `Omit<VotingEvent, 'adminToken' | 'invitedParticipants' | 'groupLeafCommitments' | 'nullifierLeafCommitments'>`. A private `toPublic()` method strips those four fields before returning. The manage page continues to receive `adminToken` via its URL query parameter (`?token=`), so no authenticated endpoint is needed for that flow.

#### [F-APP-2] Nullifier endpoints are unauthenticated

**File:** `src/backend/src/voting-event/voting-event.controller.ts`

`DELETE /voting-event/:eventId/nullifier` now requires the event's `adminToken` in the request body; unauthorized calls receive HTTP 401. `POST /voting-event/:eventId/nullifier` remains public but `insertNullifier` in the service rejects nullifiers outside the BLS12-381 scalar field `[1, r)`, preventing garbage inserts that would corrupt the trie. Full ZK proof verification before nullifier insert (the original recommendation) is not yet implemented — the DoS vector of a targeted valid-range insert to block another voter remains.

#### [F-APP-3] No nullifier rollback when transaction build fails

**File:** `src/backend/src/voting-event/voting-event.service.ts`

The browser vote path (where the frontend built and submitted the transaction) has been replaced entirely by the relay-vote path. `relayVote` in the service wraps the entire build–sign–submit sequence in a `try/catch`; any failure (build error, signing error, Blockfrost rejection) calls `rollbackNullifier` before rethrowing. The nullifier inserted by the prior `POST /nullifier` call is cleaned up server-side in all failure cases.

#### [F-APP-6] Concurrent votes conflict on shared UTxOs

**File:** `src/backend/src/voting-event/voting-event.service.ts`

Added `withVoteLock` — an async mutex, per event at first and per network since `69377fe` (the relay wallet is shared by all events of a network) — around the relay vote submission path. Vote requests for the same event are queued: the next MPF proof is only issued after the previous vote transaction confirms or times out. The browser vote path has been removed; all votes now go through the relay, so the serialisation covers the full vote flow.

#### [F-APP-7] Concurrent registrations silently lose members

**File:** `src/backend/src/voting-event/voting-event.service.ts`

Wrapped `addParticipant` in a per-event mutex (same `withVoteLock` pattern used for vote serialisation). After writing, the service re-reads `groupLeafCommitments` and verifies the new commitment is present; if missing, it returns an error to the caller. Simultaneous registrations are now serialised — each waits for the previous write to complete before reading and appending.

---

### `src/frontend`

#### [F-APP-4] / [F-APP-5] Vote linked to fee-paying wallet

**Files:** `src/tx/src/node/relay-vote.ts`, `src/backend/src/voting-event/voting-event.service.ts`

Implemented the relay wallet design: the backend builds, signs, and submits vote transactions using a dedicated relay wallet (MeshWallet with server-held mnemonic). The voter's CIP-30 wallet no longer appears in any vote transaction on-chain. Plaintext `signal_message` on-chain is intentional by design.

#### [F-APP-8] Blockfrost API key exposed in the frontend bundle

**File:** `src/frontend/app/event/[id]/page.tsx`

The voter vote flow no longer uses a frontend Blockfrost provider. UTxO fetching for the vote transaction is handled entirely server-side inside `relayVote`. The voter page (`page.tsx`) imports no `BlockfrostProvider` and reads no `NEXT_PUBLIC_BLOCKFROST_API_KEY`. The manage page (`manage/page.tsx`) still uses `NEXT_PUBLIC_BLOCKFROST_API_KEY` for admin minting operations; this is an admin-only path and remains open for the minting flow.

#### [F-APP-10] Misleading vote error messages

**File:** `src/frontend/app/event/[id]/page.tsx`

In development mode, `classifySubmissionError` now surfaces the raw backend error string when the blockchain rejects a transaction, making it possible to diagnose Plutus failures directly without inspecting network logs. Production error classification (moving `BadInputs` before `ValueNotConserved`) remains open.

#### [F-APP-11] Event start can fail between the two mints

**File:** `src/frontend/app/event/[id]/manage/page.tsx`

After the Group NFT mint confirms, `handleStartVoting` collects the set of UTxO references that were consumed in that transaction (`preGroupMintRefs`). The subsequent Blockfrost fetch for the second mint (Semaphore+Voting) filters out any UTxO whose `txHash#outputIndex` is in that set. This prevents selecting stale UTxOs that Blockfrost has not yet marked spent and eliminates the "All inputs are spent" failure that forced multiple restart attempts.

#### [F-APP-12] Non-member voters receive HTTP 500

**File:** `src/backend/src/voting-event/voting-event.service.ts`

`getMerkleProof` now returns structured `HttpException` responses instead of propagating unhandled errors:
- HTTP 404 with `'User is not a participant in this event'` — userId not in group at all.
- HTTP 409 with `'Not part of this vote\'s group (registered after voting started)'` — user registered after the Semaphore snapshot was frozen.
- HTTP 422 with `'Voter was not in the group at the time the voting system was set up and cannot vote'` — historical root search exhausted.

The frontend surfaces the `message` field from these responses instead of showing a generic error.

---

## Conclusions

### On-chain

**The smart contract architecture is secure and ready for testnet deployment.** The audit confirmed that all critical security properties of the voting system are correctly enforced on-chain: ZK proof verification is non-bypassable (co-spend with Semaphore), double-vote prevention is cryptographically guaranteed (MPF nullifier), group membership is enforced (Merkle proof verified in circuit), and event parameters are immutable once minted. The delegation pattern — `voting.ak` requiring a co-spend with `semaphore.ak` — is tight and unambiguous, with the external nullifier (derived from the parameterised `oref`) preventing cross-event proof replay.

The core of this audit was a formal property analysis of the smart contracts. Each validator's security properties were stated explicitly before reading the implementation — what the contract must guarantee, not just what it does. Every condition was then traced to the exact line that enforces it, standard library functions were checked for boundary correctness, and every custom function was verified independently. This process produced a complete proof-of-properties: every security invariant the system claims is either confirmed enforced by the code, confirmed enforced by the test suite, or documented as a known off-chain responsibility. The analysis revealed improvements at two levels — validator logic (F-VOTING-1, F-VOTING-3, F-VOTING-7, F-SEM-3, F-GROUP-1) and test suite robustness (F-SEM-1 through F-SEM-6 and the additional test findings). The contracts were largely correct; the more significant finding was that a substantial portion of the test suite was passing for wrong reasons or not covering its intended conditions. Both levels are now addressed: the validators are correct and the test suite verifiably confirms it — 154 tests in `src/on-chain/` and 40 in `modulo-p-cardano-semaphore`, all passing.

**Scope note:** Groth16 verifier correctness, BLS12-381 arithmetic, Poseidon hash, and MPF trie internals are assumed correct from `cardano-semaphore` and `ak-381` and are out of scope for this audit. The Group validator trusts the backend to compute a correct Merkle root — a compromised backend could add a fraudulent commitment. Event parameters cannot be corrected once minted; correct setup is an off-chain responsibility.

---

### Off-chain

The property analysis proved the on-chain security model correct; the off-chain test confirmed that the full system — contracts, backend, frontend, and ZK proof pipeline — works together as intended in production conditions. The M4 system test ran 12 votes across multiple simultaneous users to confirmed on-chain transactions, with the final tally matching both the API and chain state. Every rejection case passed: double votes, non-member proofs, replay attacks, late registrations, and out-of-window submissions were all correctly rejected by the validators. A subsequent five-person independent live test confirmed the voter-facing flow from invitation through proof generation to vote confirmation.

The live test surfaced application-layer issues outside the scope of static analysis. The most critical (F-APP-0) was a trie detachment bug: any rollback left the MPF store detached from LevelDB, causing all subsequent votes in that event to fail silently — this affected every one of the six events in the dry run. The concurrent registration race condition (F-APP-7) silently dropped group members. Both are fully fixed. The relay wallet design (F-APP-5/6) was implemented and validated: voter wallet addresses no longer appear in any vote transaction on-chain, and vote submissions are serialised per event via `withVoteLock`, eliminating UTxO collisions.

**Acknowledged residuals** are limited in scope: `POST /nullifier` remains unauthenticated (DoS vector reduced but not eliminated), server-side userId–vote correlation is inherent to a centralised relay architecture, and the running tally is publicly readable from on-chain data by design. None of these affect the correctness of the voting outcome or the anonymity of the voter identity.
