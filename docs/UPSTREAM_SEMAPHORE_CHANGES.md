# Upstream Changes: `modulo-p/cardano-semaphore`

**Status: ALL CHANGES APPLIED** — group_test 7→9, semaphore_test 16→22, total 32→40 tests, all pass.

## Context

This document was produced during a security audit of a Cardano ZK voting application that uses `modulo-p/cardano-semaphore v0.9.4` as a dependency. The audit covered `voting.ak` (in-repo), `group.ak`, and `semaphore.ak` (upstream).

Fixes and tests for `voting.ak` were applied directly to the consuming repo. The changes listed here belong in `modulo-p/cardano-semaphore` and are intended to be ported as one or more PRs.

**Approach used throughout:** same as applied to `voting.ak`:
- Identify the finding
- Apply the minimal code fix
- Write a test that confirms the fix
- Document the change

---

## `group.ak` — Findings and Required Changes

### [F-GROUP-2] No test for minting two tokens with different asset names

**Type:** Test gap  
**File:** `validators/tests/group_test.ak`

The existing `mint_wrong_value` test mints quantity 2 of the same asset name. No test mints two tokens with *distinct* asset names (each quantity 1). The `expect [Pair(_, amount)]` pattern structurally rejects this, but it is not empirically confirmed.

**Required:** Add a `fail` test that mints two tokens with distinct asset names under the Group policy.

```aiken
test mint_two_tokens_different_names() fail {
    // mint: group_nft_1 (qty 1) + group_nft_2 (qty 1) under the same policy
    // expect [Pair(_, amount)] fails on a two-element list
}
```

---

### [F-GROUP-3] No test for minting Group NFT alongside an extra token from a different policy

**Type:** Test gap  
**File:** `validators/tests/group_test.ak`

No test attempts to mint the Group NFT while sending an extra token (under a different policy) to the same script output. The `policies(without_lovelace(value)) == [policy_id]` check in the destination condition structurally rejects it, but it is not empirically confirmed.

**Required:** Add a `fail` test that includes an extra foreign token in the output alongside the Group NFT.

```aiken
test mint_extra_token_in_output() fail {
    // output value: group_nft + some_other_token + lovelace
    // policies(without_lovelace(output.value)) returns [group_policy, other_policy]
    // != [group_policy] → fails
}
```

---

### [F-GROUP-1] `group.ak` does not validate `GroupDatum` structure at mint (design note)

**Type:** Design observation  
**File:** `validators/group.ak`

Neither `mint` nor `spend` validate the `GroupDatum` inline datum. At mint time no datum check exists at all — any datum (or `NoDatum`) is accepted. Errors from a malformed datum surface later in `semaphore.ak` mint, which reads the Group reference input. This is a deliberate trade-off for cheaper execution.

**Required:** No code change necessary. Add a comment in the mint validator acknowledging this design choice explicitly, so future maintainers understand it is intentional.

---

## `semaphore.ak` — Findings and Required Changes

### [F-SEM-1] All spending tests use `inputs` instead of `reference_inputs` for the VKey input *(HIGH)*

**Type:** Test bug  
**File:** `validators/tests/semaphore_test.ak`

Every spending test builds the transaction with `vkey_input` in `inputs`, but the spending validator calls `find_input(reference_inputs, dat.vkey_ref_input)`. Since `reference_inputs` is never set, it is always `[]`, causing `expect Some(snark_vkey_ref_input)` to fail before any intended condition is reached.

Consequences:
- `spend_signal_semaphore_1` (happy path) **fails** — should pass
- All `fail` spending tests pass, but by hitting Condition 2 (empty `reference_inputs`) instead of their intended condition
- Line 657 of `semaphore_test.ak` has the comment `// Include vkey as reference input` directly above the line that puts it in `inputs` — the intent was correct, the code was wrong

**Required:** In every spending test, move `vkey_input` from `inputs` to `reference_inputs`:

```aiken
// Before (wrong)
Transaction {
    ..transaction,
    inputs: [semaphore_input, vkey_input],
    ...
}

// After (correct)
Transaction {
    ..transaction,
    inputs: [semaphore_input],
    reference_inputs: [vkey_input],
    ...
}
```

After this fix: verify `spend_signal_semaphore_1` passes, and verify each `fail` test fails at its intended condition.

---

### [F-SEM-3] Weaker NFT destination check than `group.ak`

**Type:** Improvement  
**File:** `validators/semaphore.ak` (Condition 2, mint)

`semaphore.ak` mint uses `is_policy_on_value` to confirm the Semaphore NFT reached the script address. This only checks the policy is *present* in the output — other tokens can coexist. `group.ak` uses the stricter `policies(without_lovelace(value)) == [policy_id]`, asserting the NFT is the *only* non-lovelace asset at that output.

**Required:** Replace `is_policy_on_value(output_to_script.value, policy_id)` with the stricter check:

```aiken
// Before
let is_nft_sent_to_script: Bool =
  is_policy_on_value(output_to_script.value, policy_id)

// After
let is_nft_sent_to_script: Bool =
  assets.policies(assets.without_lovelace(output_to_script.value)) == [policy_id]
```

---

### [F-SEM-2] No test for minting two tokens with different asset names

**Type:** Test gap  
**File:** `validators/tests/semaphore_test.ak`

Same gap as F-GROUP-2 and F-VOTING-4. No test mints two tokens with distinct asset names under the Semaphore policy.

**Required:** Add a `fail` test analogous to `mint_wrong_value` but with two distinct asset names each at quantity 1.

---

### [F-SEM-4] No test for `DatumHash` or wrong-typed datum on mint output

**Type:** Test gap  
**File:** `validators/tests/semaphore_test.ak`

`mint_no_datum` confirms `NoDatum` is rejected. No test covers `DatumHash` or a datum that does not decode to `SemaphoreDatum`. Both are structurally rejected by `expect InlineDatum(...)` and `expect out_semaphore_dat: SemaphoreDatum`, but neither is empirically confirmed.

**Required:** Add two `fail` tests:
- Output with `DatumHash` instead of inline datum
- Output with an inline datum of the wrong type (e.g. `InlineDatum(42)`)

---

### [F-SEM-5] No test for missing Group NFT in `reference_inputs` on mint

**Type:** Test gap  
**File:** `validators/tests/semaphore_test.ak`

No test mints the Semaphore NFT without including the Group NFT as a reference input. `expect [group_reference_input]` fails hard when the filter returns empty, but this is not empirically confirmed.

**Required:** Add a `fail` test that omits the Group reference input from `reference_inputs`.

---

### [F-SEM-6] No test for altered `vkey_ref_input` in output datum

**Type:** Test gap  
**File:** `validators/tests/semaphore_test.ak`

`spend_datum_not_preserved_1/2` independently confirm `group_merke_root` and `group_token_policy` are enforced. No test alters only `vkey_ref_input` in the output datum. The third equality check in `is_datum_preserved` is structurally enforced but not independently confirmed.

**Required:** Add a `fail` test that changes only `vkey_ref_input` in the output datum while keeping the other fields intact.

---

### [S-2] `spend_signal_semaphore_1` has incomplete MPF proof (follow-up after F-SEM-1)

**Type:** Test gap (follow-up)  
**File:** `validators/tests/semaphore_test.ak`

After fixing F-SEM-1, `spend_signal_semaphore_1` will pass with `mpf_proof = []`. This works for the empty-trie case but the real MPF proof path (multi-step proof for a non-empty trie) is still untested through the spending validator. Consider adding a second happy-path spending test with a pre-populated trie and a real proof.

---

## Pending for Audit Document

The following sections of `AUDIT_final.md` (in the consuming repo) still need to be completed once all upstream changes are applied and verified:

- **Changes Made** — add entries for each group/semaphore finding resolved
- **Conclusions** — overall security posture, residual risks, what is trusted to the upstream dependency
- **Executive Summary** — high-level summary of findings, fixes applied, and open items

---

## Summary Table

| Finding | File | Type | Priority | Change Required |
|---|---|---|---|---|
| F-SEM-1 | semaphore_test.ak | Test bug | High | Move `vkey_input` to `reference_inputs` in all spending tests |
| F-SEM-3 | semaphore.ak | Improvement | Medium | Stricter NFT destination check at mint |
| F-GROUP-2 | group_test.ak | Test gap | Low | `fail` test: two tokens, different names |
| F-GROUP-3 | group_test.ak | Test gap | Low | `fail` test: extra foreign token in output |
| F-SEM-2 | semaphore_test.ak | Test gap | Low | `fail` test: two tokens, different names |
| F-SEM-4 | semaphore_test.ak | Test gap | Low | `fail` tests: `DatumHash` and wrong-typed datum |
| F-SEM-5 | semaphore_test.ak | Test gap | Low | `fail` test: missing Group NFT in reference inputs |
| F-SEM-6 | semaphore_test.ak | Test gap | Low | `fail` test: altered `vkey_ref_input` in output datum |
| F-GROUP-1 | group.ak | Design note | Low | Add comment acknowledging implicit off-chain trust |
| S-2 | semaphore_test.ak | Test gap | Low | Happy-path spending test with non-empty MPF trie |
