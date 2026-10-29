# Milestone 4 — Submission

**Project:** ZK Voting App — Cardano-based zero-knowledge anonymous voting (Catalyst project 1200252)
**Milestone 4:** Testing and Advanced Development
**Repository:** https://github.com/TrustLevel/ZK-Voting-App (branch `preview`)

---

## Deliverable summary

| Surface | URL |
|---|---|
| Hosted frontend | https://vote.trustlevel.io |
| Hosted backend API | https://api.vote.trustlevel.io |
| Source (this milestone) | https://github.com/TrustLevel/ZK-Voting-App/tree/preview |
| Audit report | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/audit/AUDIT.md |
| User feedback | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/M4_USER_FEEDBACK.md |
| Test report | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/M4_TEST_REPORT.md |
| TrustLevel Gitbook | [ZK Voting App](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app) · [Audit report](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/audit-report-milestone-4) · [User feedback](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/user-feedback-milestone-4) · [Test report](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/test-report-milestone-4) |

The milestone's outputs, acceptance criteria and evidence are addressed one by one below.

---

## Output 1 — Prototype testing and feedback collection from at least 3 test users

**What we did.** The hosted Milestone 3 application was tested by four external testers on
Cardano Preprod: two in the organiser and voter roles (Rodrigo Oyarzún, Sebastián Pabón), one
with a scripted 15-voter system test including concurrency and attack scenarios (Talon), and one
with a live group vote with five participants (pinisch). Feedback was collected with a
questionnaire (reproduced verbatim) and the testers' own write-ups.

**Evidence.**
- Feedback document (who tested, what they said, what changed):
  https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/M4_USER_FEEDBACK.md
- Questionnaires: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/docs/testing/interviews
- The testers' own test write-ups (scripted system test, live group test):
  https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/interviews/VotingAppFeedback_Pumbi.md ·
  https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/interviews/VotingAppFeedback_pinisch.md
- Regression run after the fixes (test report):
  https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/M4_TEST_REPORT.md

---

## Output 2 — Audit report

**What we did.** A property-based audit of the on-chain contracts (`voting.ak`,
`voting_utilities.ak`, and the critical path of `modulo-p/cardano-semaphore`): every security
property was stated before reading the implementation, traced to the enforcing condition and
confirmed by a test; standard-library boundary semantics and every custom function were checked
independently. The off-chain layer was reviewed through the scripted system test.

**Result.** 42 findings across three review phases — 16 from the contract audit (1 critical, 4
medium, 1 low, 10 notes; all resolved), 13 from the test review (11 fixed, 2 acknowledged), 13
application-level findings from the system test (see Output 3). The audit reports the on-chain
suite after the fixes at 154 passing tests in `src/on-chain` and 40 in `cardano-semaphore` (the
latter with the upstream changes applied, see Output 3).

The audit records the status of the application-level findings at audit time (7 fixed, 4 partial,
2 acknowledged). Three of them were closed after the audit — F2 by commit `bf24963`, F9 and F10 by
commit `b2a86a6`; the feedback document (§4) gives the status as deployed for this milestone.

**Evidence.**
- Audit report: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/audit/AUDIT.md
- Upstream changes to the Semaphore library:
  https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/audit/UPSTREAM_SEMAPHORE_CHANGES.md

---

## Output 3 — Smart contracts and zk-SNARK pipeline optimized according to audit and feedback

**Smart contracts.**
- `voting.ak` (this repository): minimum of two options enforced at mint, stricter NFT destination
  check, index validation for weighted votes, silent-discard in weighted tallying removed.
- Test suite extended (mint failure cases, `check_vote_indices` unit tests, spending tests fixed
  to use `reference_inputs`).
- `cardano-semaphore` dependency bumped v0.9.4 → v0.9.5; the deployed contracts use that released
  version (VKey as a read-only reference input since v0.9.4, signal hash reduced modulo the
  BLS12-381 scalar field since v0.9.3). The audit's findings against the library itself — one
  validator improvement (stricter NFT destination check at mint, F-SEM-3) and eight additional
  tests — are documented with ready-to-apply code in `UPSTREAM_SEMAPHORE_CHANGES.md` for porting
  to `modulo-p/cardano-semaphore`; they are not yet part of a released library version.
- Commits:
  - [`2646ae0`](https://github.com/TrustLevel/ZK-Voting-App/commit/2646ae0) enforce minimum 2 options and stricter NFT destination check at mint
  - [`95fcb6b`](https://github.com/TrustLevel/ZK-Voting-App/commit/95fcb6b) index validation for weighted votes, stale TODO removed
  - [`0a82f29`](https://github.com/TrustLevel/ZK-Voting-App/commit/0a82f29) mint failure tests: duplicate asset names, bad datum, invalid time window
  - [`96fa4ed`](https://github.com/TrustLevel/ZK-Voting-App/commit/96fa4ed) `check_vote_indices` unit tests
  - [`b3275e0`](https://github.com/TrustLevel/ZK-Voting-App/commit/b3275e0) bump `cardano-semaphore` to v0.9.5, test quality fixes

**zk-SNARK pipeline.** The circuit itself was left unchanged: neither the audit nor any test run
found a defect in it, and recompiling would invalidate the 21-contributor trusted setup. The
optimizations were made where the findings were — the on-chain verifier and the signal handling
(see above) — and in how proofs are used: the backend now **verifies every vote proof
server-side** before it touches the nullifier trie, and the vote transaction is built and
submitted by a relay wallet so that voters need neither a wallet nor test ADA.

**Application changes from feedback and testing.** The full list with status is in the feedback
document (§3 and §4). Highlights:
- Critical fix: a rolled-back vote detached the nullifier trie and broke every later vote (F0).
- Security: public event API no longer exposes admin tokens or e-mail addresses (F1); nullifier
  writes are proof-gated and all admin endpoints require the admin token (F2).
- Robustness: registrations are serialised per event (F7); votes are serialised per event and a
  losing concurrent vote is rolled back automatically so the voter can retry (F6, mitigated — see
  Known limits); event start no longer fails between the two mint transactions (F11).
- UX from the interviews: organiser readiness checklist before publishing, explanation of the two
  wallet signatures, step-by-step status during the vote, interim results hidden until the end,
  actionable error messages.
- Commits:
  - [`109496c`](https://github.com/TrustLevel/ZK-Voting-App/commit/109496c) F0 — re-attach the empty nullifier trie to its LevelDB store after a rollback
  - [`48f5aa2`](https://github.com/TrustLevel/ZK-Voting-App/commit/48f5aa2) F1 — strip admin token, invitee list and commitments from the public event API
  - [`f87d6bb`](https://github.com/TrustLevel/ZK-Voting-App/commit/f87d6bb) F7 — serialise registration per event
  - [`dcbb438`](https://github.com/TrustLevel/ZK-Voting-App/commit/dcbb438) F12 — 404/409 from the Merkle-proof endpoint instead of HTTP 500
  - [`936976b`](https://github.com/TrustLevel/ZK-Voting-App/commit/936976b) F2 (first step) — remove the public nullifier delete, server-side rollback
  - [`3767bbd`](https://github.com/TrustLevel/ZK-Voting-App/commit/3767bbd) F6 — serialise vote submission per event
  - [`3e98a6a`](https://github.com/TrustLevel/ZK-Voting-App/commit/3e98a6a) F4/F5/F8 — relay vote design: the backend builds and submits the vote transaction
  - [`7f2b270`](https://github.com/TrustLevel/ZK-Voting-App/commit/7f2b270) F11 — exclude pre-mint UTxOs when building the second mint transaction
  - [`bf24963`](https://github.com/TrustLevel/ZK-Voting-App/commit/bf24963) F2 — admin-token guard on all organiser endpoints; Groth16 proof verified server-side before the nullifier trie is touched
  - [`2f1c7ee`](https://github.com/TrustLevel/ZK-Voting-App/commit/2f1c7ee) relay wallet read from `RELAY_WALLET_MNEMONIC`
  - [`b2a86a6`](https://github.com/TrustLevel/ZK-Voting-App/commit/b2a86a6) F9/F10 and interview feedback — readiness checklist, interim results hidden until the end, step hints, clearer errors

---

## Acceptance criterion — Successful final testing of the system

After all fixes were deployed, the scripted system test was run again against the hosted system
on Preprod, now including the scenario that previously broke the system (a rolled-back first
vote) and attack scenarios against the hardened endpoints.

**Run:** 2026-10-28, event `4988274691` on Preprod, backend `preview` @ `b2a86a6` as deployed on
https://api.vote.trustlevel.io; voting window 05:52–07:07 UTC; 15 script-controlled voters (13
registered before publishing, one late registrant, one no-show). All 26 verdicts passed. Full detail,
timeline and on-chain state trace: test report
(https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/testing/M4_TEST_REPORT.md).

| Scenario | Expected | Result |
|---|---|---|
| R1 — three voters register at the same instant (F7) | all three in the group, backend root consistent | pass — 14 members, backend root consistent, nobody lost |
| C1 — vote before the event starts, then normal votes (F0 regression) | rejected; backend trie root unchanged; later votes succeed | pass — rejected by the ledger (outside validity interval), trie unchanged, all nine wave-A votes confirmed afterwards |
| A — nine sequential votes | all confirmed on-chain | pass — 9 of 9 confirmed |
| C2 — second vote by the same identity through the API | HTTP 409 | pass |
| C3 — second vote by the same identity bypassing the backend (own MPF proof, direct submission) | rejected on-chain | pass — Plutus script failed (phase 2) |
| C4 — replay of a voter's exact relay-vote request | HTTP 409, no transaction | pass |
| C5 — proof from an identity that is not in the group | HTTP 400 before the trie is touched | pass — "proof is not for this event's voter group", trie unchanged |
| C6 — late registrant (registered after publishing) asks for a Merkle path | HTTP 404/409 with a clear message (F12) | pass — HTTP 409 "registered after voting started" |
| B1 — three votes within about two seconds (F6) | hypothesis: one succeeds, the others are rolled back | pass — 1 confirmed, 2 rolled back automatically with HTTP 502 ("All inputs are spent"), trie consistent |
| B2 — the two losers retry | both succeed | pass — both confirmed on the first retry |
| C7a — removed nullifier endpoints | `POST` 404; `DELETE` 401 without or with a wrong admin token | pass |
| C7b — organiser endpoints without the admin token | all 401; 200 with the token | pass — invited, invite, send-invitations, PATCH, remove participant, save-blockchain-data |
| C7c — public event API (F1) | no admin token, e-mails or commitments in the response | pass |
| C7d — junk proof sent to relay-vote | HTTP 400 "ZK proof does not verify", trie unchanged | pass |
| C7e — a legitimate voter votes after the attack scenarios | confirmed on-chain | pass |
| C8 — vote after the event has ended | rejected by the ledger | pass — ledger: transaction outside its validity interval |
| T1 — final tally | API = chain = planned distribution (A 6, B 4, C 3) | pass — API 6/4/3 = chain 6/4/3 = planned 6/4/3 |

Confirmed vote transactions (13; voter wallets never appear in them — the relay wallet pays):

| Voter | Option | Transaction |
|---|---|---|
| V01 | A | [5f58c0e119a6…](https://preprod.cardanoscan.io/transaction/5f58c0e119a6bc160f682f586ba3acb18997533931ab48abb81b41b2af89ffe2) |
| V02 | A | [d239347ede96…](https://preprod.cardanoscan.io/transaction/d239347ede96ea0d007e2844ee095bd899683953f1c8b8b5b8e2646b39f927e4) |
| V03 | A | [130cd866547e…](https://preprod.cardanoscan.io/transaction/130cd866547eae0980d1af2f87fca3abd680fa60fcdb942d3fdf2cdf001aed8e) |
| V04 | A | [76f4eb91b52b…](https://preprod.cardanoscan.io/transaction/76f4eb91b52b78ce1dd150a9621cf5653bd875fd84884293fd85664358e0d226) |
| V05 | B | [28db15d97693…](https://preprod.cardanoscan.io/transaction/28db15d97693d6bb8aaeabc4eeaeecf14739253d8424d8b415842c62a76a542d) |
| V06 | B | [9af15e33c689…](https://preprod.cardanoscan.io/transaction/9af15e33c6899b44bc9a9281112f547e27533507c2bf8837adf4df33ade99e73) |
| V07 | B | [9cdd5db8bf8a…](https://preprod.cardanoscan.io/transaction/9cdd5db8bf8af8e98499de040897a6ded3b36de25fba055661d210fb49c9b755) |
| V08 | C | [c1e466944855…](https://preprod.cardanoscan.io/transaction/c1e4669448555050d26f04e8c76f291877a21d3bf7ce984ff8e72ca10957a12b) |
| V09 | C | [87410cbd7213…](https://preprod.cardanoscan.io/transaction/87410cbd7213c32b8175f7ad3f02a3e441fae22313b813e37e3c8630752f9f57) |
| V12 | B | [fd50138a8391…](https://preprod.cardanoscan.io/transaction/fd50138a8391b0c5fdde1f0bf80000aed486e56415cf0eeec119877beddb7630) |
| V11 | A | [c8c558afdd0f…](https://preprod.cardanoscan.io/transaction/c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726) |
| V13 | C | [ff878e16de65…](https://preprod.cardanoscan.io/transaction/ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a) |
| V10 | A | [b792b6334efd…](https://preprod.cardanoscan.io/transaction/b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5) |

Compared with the 2026-10-05 run on the Milestone 3 build: C1 had to be skipped then (it would have
broken the event, F0), R1 lost one registration (F7), a non-member got HTTP 500 (F12), and C7 showed
that an unauthenticated nullifier insert or delete blocked legitimate votes (F2). All four now pass.

---

## Evidence of milestone completion

| Required | Where |
|---|---|
| Complete audit report published on the TrustLevel Gitbook | https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/audit-report-milestone-4 |
| User feedback published on the TrustLevel Gitbook | https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/user-feedback-milestone-4 |
| Updated smart contracts on GitHub | https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/on-chain |
| Documentation of the protocol on GitHub | [README](https://github.com/TrustLevel/ZK-Voting-App/blob/preview/README.md) · [System design](https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/design/SYSTEM_DESIGN.md) · [Smart-contract specification](https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/design/SMART_CONTRACT_SPECIFICATION.md) · [Relay vote design](https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/design/RELAY_VOTE_DESIGN.md) · [On-chain docs](https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/on-chain/DOCS.md) · [Upstream Semaphore changes](https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/audit/UPSTREAM_SEMAPHORE_CHANGES.md) |

---

## Known limits

Stated in the feedback document, §5: the vote option is readable on-chain (anonymity, not ballot
secrecy); the backend can correlate a voter's Merkle-path request with the vote; a vote submitted
while another vote of the same event is still unconfirmed is rolled back and needs one retry (the
per-event queue does not yet wait for on-chain confirmation); the organiser's mint flow still uses a
browser-side Blockfrost key; the circuit was not changed in this milestone.

Events created before this milestone's deployment cannot receive votes any more: the contract
script hashes changed with `cardano-semaphore` v0.9.5, so earlier events point at the old scripts.
This is expected for a testnet preview.
