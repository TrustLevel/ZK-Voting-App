# Findings after the audit

The [audit report](AUDIT.md) is the auditor's document of 2026-09-29 (scope: commit `e1181e1`) and
is not changed afterwards. Findings that reached the project later are recorded here, in the same
structure, with the numbering continued.

---

**[F-VOTING-14] Weighted vote accepts negative counts**
- **Type:** Critical
- **Reported by:** a Catalyst Milestone 4 reviewer, 2026-11-04 (external to the project team)
- **Location:** `src/on-chain/lib/voting_utilities.ak` (`check_weight`), `src/backend/src/voting-event/voting-event.service.ts` (`verifyRelayVoteProof`)
- **Description:** `check_weight` folded the counts of a weighted signal and compared the sum with
  `dat.weight`; nothing checked the sign of a count. Plutus Data integers are signed and
  `cbor.serialise` / `deserialise_signal` round-trip negative values, so an eligible voter with
  weight 2 could submit `[(0, 102), (1, -100)]`: the sum is 2, every index exists, `weighted_vote`
  applies both increments and the output tally matches. Reproduced with a spending test through
  `voting.spend` on commit `2483dee` (the test passed, i.e. the vote was accepted). The ZK proof
  does not prevent it: the Semaphore circuit binds only the blake2b hash of the signal, not its
  content, so any group member can prove any signal. The backend relay decoded the signal but did
  not check it either; only the frontend slider was bounded at 0. The audit's invariant I13 ("total
  weight == `dat.weight`") described the implemented condition and missed that a sum check alone
  does not bound the individual counts.
- **Impact:** High — a single eligible voter can move an unbounded number of points between options
  and invert the outcome of a weighted vote. The tally becomes visibly negative, so the manipulation
  is detectable after the fact, but it is anonymous and irreversible.
- **Fix:** commit [`a82fef7`](https://github.com/TrustLevel/ZK-Voting-App/commit/a82fef7)
  (PR [#26](https://github.com/TrustLevel/ZK-Voting-App/pull/26)).
  - On-chain: `check_weight` requires every count to be strictly positive before comparing the sum;
    zero counts are rejected as well. Unit tests `check_weight_4` (zeros, now `fail`) and
    `check_weight_6`–`9`; spending tests `weighted_vote_negative_count_rejected` (the reviewer's
    payload on a weight-2 ballot) and `weighted_vote_zero_count_rejected`. 370 checks pass.
  - Backend: `validateVoteSignal()` (`src/backend/src/voting-event/vote-signal.ts`) applies the same
    rules — integer indices of existing options, every count `> 0`, no duplicate index, counts
    summing to the voting power, exactly one option with count 1 in a simple vote — right after the
    signal is decoded and before the group root and the ZK proof are checked, so an invalid signal
    is answered with HTTP 400 and never consumes a nullifier or a relay transaction.
  - Frontend: the same check before the signal is encoded.
  - The compiled `voting` validator changed; events created after the deploy of `5c05b83`
    (2026-11-04) use it. Earlier events keep their validator and are protected by the backend check.
- **Verification:** weighted run on Preprod after the deploy, event `8739534777`
  ([test report, Part D](../testing/M4_TEST_REPORT.md#part-d--weighted-voting-run-2026-11-04)):
  the reviewer's payload sent to the relay by a registered voter is rejected with HTTP 400, trie and
  tally unchanged; built into a transaction and submitted directly to the node it fails at the voting
  validator; four legitimate weighted ballots tally correctly on the API and on-chain.
- **Status:** Fixed
