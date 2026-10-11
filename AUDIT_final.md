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

### `mint` — Property 1: NFT uniqueness

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

### Notes

**[F-2] No test for missing or non-inline datum on mint output**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** There is no test that attempts to mint while sending the output with `NoDatum`, `DatumHash`, or a datum of the wrong type. Condition 3 uses `expect InlineDatum(...)` and `expect urna_datum: UrnaDatum`, which structurally reject all three cases, but none are empirically confirmed.
- **Recommendation:** Add failure tests for `NoDatum` output, `DatumHash` output, and a datum that does not match `UrnaDatum`.
- **Status:** Open

**[F-1] No test for minting two tokens with different asset names under the same policy**
- **Type:** Note
- **Location:** `src/on-chain/validators/tests/minting_logic_test.ak`
- **Description:** The existing test `tx_mints_more_than_two_tokens` covers quantity > 1 for a single asset name. There is no test for the case where two tokens with *different* asset names (each with quantity 1) are minted under the same policy. The `expect [Pair(_, amount)]` pattern structurally handles this, but it is not empirically confirmed.
- **Recommendation:** Add a test that attempts to mint two tokens with distinct asset names under the voting policy and asserts failure.
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
