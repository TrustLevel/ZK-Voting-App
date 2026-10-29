# Smart Contract Audit — ZK-Voting-App

**Date:** 2026-09-27  
**Branch:** `audit`  
**Auditors:** Agustín Salinas (Modulo-p)
**Scope:** `src/on-chain/validators/voting.ak` and `src/on-chain/lib/voting_utilities.ak`  

---

## Methodology

The audit proceeds in four steps, working through the code together:

1. **Read and understand** — walk through `voting.ak` and `voting_utilities.ak` line by line.
2. **Map invariants** — identify every security property the contract must uphold, and locate exactly where (or whether) each one is enforced.
3. **Deep dives** — certain categories of code are prone to subtle errors and receive a dedicated closer look:
   - **Interval / time conditions** — boundary semantics (open vs. closed) are a common source of off-by-one bugs.
   - **Custom functions** — verify correctness independently; do not assume they do what their name suggests.
   - The primary audit criterion is: *are stdlib functions correctly applied, and are custom functions correct?*
4. **Write findings** — document confirmed bugs, potential issues, and observations with severity labels.

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

---

## Contract Overview

The voting validator (`voting.ak`) is parameterised by an `OutputReference` (`oref`) which makes it a one-shot minting policy — the UTxO uniqueness guarantees each event has a unique policy ID.

It has two entry points:

### `mint` — Create a voting event
Checks (in order):
0. The parameterised `oref` is consumed (one-shot)
1. Exactly one token is minted under this policy
2. That token is sent to the script address (one output); policy confirmed present in output value ⚠️ *see Deep Dives*
3. The output carries a valid `UrnaDatum` inline datum
4. Event time is coherent: `start < end` and minting happens before `start` ⚠️ *see Deep Dives*
5. All option vote counts are initialised to 0
6. Option indexes are consecutive starting at 0

### `spend` — Cast a vote
Checks (in order):
1. Exactly one input holds the Semaphore NFT (proves Semaphore validator ran)
2. The Urna NFT is returned to the same script address with equal non-lovelace value
3. The Semaphore redeemer for that input is a `Signal(...)` — extracts `signal_message`
4. The transaction validity range is entirely within the event time window ⚠️ *see Deep Dives*
5. `UrnaDatum` fields `weight`, `event_date`, `semaphore_nft` are preserved in output
6. Vote tallies updated correctly:
   - **Simple** (`weight <= 1`): signal must carry exactly one option; that option incremented by 1
   - **Weighted** (`weight > 1`): signal may carry multiple options; total weight must equal `dat.weight`

### `else` — Catch-all
Any other purpose fails unconditionally.

---

## Invariants

| # | Invariant | Enforced at | Notes |
|---|-----------|-------------|-------|
| I1 | Each voting event has a unique policy ID | `mint` cond. 0 (oref consumed) | |
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

## Observations (reading notes)

> Notes taken while reading. Not all of these are findings.

### `voting.ak` — `mint` (lines 30–79)

Standard one-shot NFT minting pattern. The policy ID is unique because the oref can only ever be consumed once.

- **Cond. 0 (line 35):** `find_input(inputs, oref)` — strong, standard pattern.
- **Cond. 1 (lines 38–42):** `dict.to_pairs()` expects exactly `[Pair(_, 1)]` — exactly one asset name, amount exactly 1. Strong check.
- **Cond. 2 (lines 46–52):** Filter outputs for `Script(policy_id)` credential, then `is_policy_on_value`. ⚠️ Flagged for deep dive.
- **Cond. 3 (lines 55–56):** `expect InlineDatum(...)` + type cast — fails hard if datum missing, non-inline, or wrong shape.
- **Cond. 4 (lines 59–61):** `event_start < event_end && is_entirely_before(validity_range, event_start)`. ⚠️ Flagged for deep dive.
- **Cond. 5 (lines 64–65):** `check_initial_options_value` — all counts zero. Custom function. ⚠️ Flagged for deep dive.
- **Cond. 6 (lines 68–69):** `check_options_index` — sequential indexes from 0. Custom function. ⚠️ Flagged for deep dive.
- **Line 71 — misleading comment:** Says conditions 3–6 are "optional". They are enforced. Should be removed or rewritten.
- **Redeemer not checked:** `_redeemer` is ignored — any redeemer value passes. Not a vulnerability, but worth noting.

---

## Deep Dives

> Closer analysis of flagged items — interval conditions and custom functions.

### DD-1: `is_policy_on_value` (custom function, `voting_utilities.ak:111`)

```aiken
pub fn is_policy_on_value(value: Value, policy_id: PolicyId) -> Bool {
  let result: List<PolicyId> = policies(value)
  list.has(result, policy_id)
}
```

**What it does:** Calls `assets.policies(value)` (stdlib — returns all policy IDs present in the value) then `list.has`. Checks **policy presence only** — not token count, not asset name.

**Is it correct for its use at `mint` Cond. 2?**  
Taken alone, it is a weak check. But it is sound in context through a chain of reasoning:
1. Cond. 0 consumes the oref → one-shot policy, no pre-existing tokens under `policy_id`.
2. Cond. 1 asserts exactly 1 token was minted under `policy_id`.
3. Cond. 2 filter asserts exactly 1 output reaches the script address.
4. `is_policy_on_value` confirms that output holds `policy_id`.

Since no tokens under `policy_id` existed before this transaction, the only tokens possible are the ones just minted — so that output holds exactly the 1 minted token. **Verdict: sound. Correctness relies on Cond. 0.**

**Tests:** No unit tests for `is_policy_on_value` in isolation. Exercised only through the full mint integration tests. No test attempts to route the NFT to a non-script output while satisfying the filter.

---

### DD-2: `is_entirely_before` — interval boundary (mint Cond. 4, line 61)

> To be filled in.

---

### DD-3: `is_interval_within` — interval boundary (spend Cond. 4)

> To be filled in.

---

### DD-4: `check_initial_options_value` (custom function)

> To be filled in.

---

### DD-5: `check_options_index` (custom function)

> To be filled in.

---

## Findings

> Filled in after deep dives and adversarial analysis.

### Finding Template
```
**[F-N] Title**
- Severity: Critical / High / Medium / Low / Informational
- Location: file:line
- Description:
- Impact:
- Recommendation:
- Status: Open / Acknowledged / Fixed
```

---

<!-- findings go here -->

---

## Summary

> Written last.

---

## References

- `src/on-chain/validators/voting.ak`
- `src/on-chain/lib/voting_utilities.ak`
- `docs/design/SMART_CONTRACT_SPECIFICATION.md`
- `modulo-p/cardano-semaphore` v0.9.4 (upstream, out of scope)




----

 The second look it is introduced in a next section, we
  explicitly tell in the report that we took deeper look at
  that specific parts because interval conditions are prone to
  errors and custom functions too. The criteria of the audit is
  to see if the standard library functions are well applied
  and if the custom functions are correct.


We are going to read the @src/on-chain/validators/voting.ak It is a multi-validator.  It has a NFT pattern since it uses an oref as an unique minting condition. First, it checks if the
  input defined as the input oref is an input. Second, check the minted value and expectes just one Token minted. Second, it checks if the NFT is sent to the script by filtering an output
  with the policy id, after it checks if the policy is present into the value. This last step on line 51-52 it seems weak, lets check it on a second look. Then it checks if it has an
  inline datum that satisfies the Urna Datum form. Also it has a time interval condition that we also have to check in a second look. Then, it checks if all options are set by zero.
  After, check if the options are ordered in a secuential order. The last three conditions check if that the transaction is malformed, then the transaction will fail. Lets write the
  conditions and observations on Audit.md, then we are going to take a second look, checking the conditions that seem more prone to errors like condition on line 51-2 and line 60.
