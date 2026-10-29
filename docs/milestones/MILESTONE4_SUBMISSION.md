# Milestone 4 — Submission

**Project:** ZK Voting App — Cardano-based zero-knowledge anonymous voting (Catalyst project 1200252)
**Milestone 4:** Testing and Advanced Development
**Repository:** https://github.com/TrustLevel/ZK-Voting-App — submitted state frozen as tag `v1.0` (branch `main`)

---

## Deliverable summary

| Surface | URL |
|---|---|
| Hosted frontend | https://vote.trustlevel.io |
| Hosted backend API | https://api.vote.trustlevel.io |
| Source (this milestone) | https://github.com/TrustLevel/ZK-Voting-App/tree/v1.0 (tag `v1.0` on `main`) |
| Audit report | https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/audit/AUDIT.md |
| User feedback | https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/M4_USER_FEEDBACK.md |
| Test report | https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/M4_TEST_REPORT.md |
| TrustLevel Gitbook | [ZK Voting App](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app) · [Audit report](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/audit-report-milestone-4) · [User feedback](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/user-feedback-milestone-4) · [Test report](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/test-report-milestone-4) |

The milestone's outputs, acceptance criteria and evidence are addressed one by one below.

---

## Output 1 — Prototype testing and feedback collection from at least 3 test users

**What we did.** The hosted Milestone 3 application was tested by four external testers on
Cardano Preprod: two in the organiser and voter roles (Rodrigo Oyarzún, Sebastián Pabón), one
with a scripted 15-voter system test including concurrency and attack scenarios (Talon), and one
with a live group vote with five participants (pinusch). Feedback was collected with a
questionnaire (reproduced verbatim) and the testers' own write-ups.

**Evidence.**
- Feedback document (who tested, what they said, what changed):
  https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/M4_USER_FEEDBACK.md
- Questionnaires: https://github.com/TrustLevel/ZK-Voting-App/tree/v1.0/docs/testing/interviews
- The testers' own test write-ups (scripted system test, live group test):
  https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/interviews/VotingAppFeedback_Pumbi.md ·
  https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/interviews/VotingAppFeedback_Pinusch.md
- Regression run after the fixes (test report):
  https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/M4_TEST_REPORT.md

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
- Audit report: https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/audit/AUDIT.md
- Upstream changes to the Semaphore library:
  https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/audit/UPSTREAM_SEMAPHORE_CHANGES.md

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

**Mainnet and Preprod side by side.** Since 2026-10-29 the organiser chooses the network when creating
an event: **Cardano Mainnet** (real ADA) or **Preprod** (free test ADA). Every call for an event — Blockfrost,
relay wallet, transaction builders, slot configuration, VKey reference UTxO, explorer links — follows the
event's network. On Mainnet the organiser pays a **fee deposit** of 1.3 ADA per registered voter to the relay
wallet before publishing; the backend verifies the deposit on-chain, books every vote's actual fee against it
and refuses votes once the budget is spent (the deposit is the cost of the event, no refund). Mainnet
one-offs: VKey reference UTxO
[`59c31b4b…`](https://cardanoscan.io/transaction/59c31b4be362e2be94a17aa55bebfcc10826d97e64dfa8b0b52f9697bbe6ffb1)
(verification key locked at the always-false script address) and a funded relay wallet.
First Mainnet event: `4701350529` (two voters, fee deposit
[`0ac21d61…`](https://cardanoscan.io/transaction/0ac21d61ac0298cd57954608df073104b7753281ab4e419e8ba61952386380be),
mints [`b69b3036…`](https://cardanoscan.io/transaction/b69b3036c800e5b7ab9bd67ff495543413e2d883abcd06a5fd864bf49128e6ea)
/ [`5896b155…`](https://cardanoscan.io/transaction/5896b1553e64dd910035d40bec7452a8f0577d5dfceff7e2e39f826ce57c2f88)).
Scripted Mainnet smoke test the same day: event `7499048647`, fee deposit
[`e262db98…`](https://cardanoscan.io/transaction/e262db987c34e816a381d3956c8a5b46c3a9bb5368bfe39a8f77b3cae52bd6e7),
three relayed votes, tally via API = planned votes (3.25 ADA spent in total; details in the test report).
Setup and costs: [`docs/operations/MAINNET_SETUP.md`](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/operations/MAINNET_SETUP.md).

**No Blockfrost key in the browser (F8, closed).** The organiser's transactions (fee deposit, Group NFT mint,
Semaphore + Voting NFT mint) are built by admin-guarded backend endpoints, signed in the organiser's CIP-30
wallet and submitted by the backend, which only accepts transactions it built itself; confirmations are
polled through the backend. The frontend bundle contains no Blockfrost credentials; the former browser keys
were revoked.

**Interface rework from the interviews.** Organiser and voter pages were restyled with a consistent design,
info buttons explaining every step (identity file, publishing, network choice, fee deposit, why no wallet is
needed, why results appear only after the end), a readiness checklist and Next buttons on the organiser
dashboard, local times with time zone, and plain-language error messages that tell the voter to retry.

**Application changes from feedback and testing.** The full list with status is in the feedback
document (§3 and §4). Highlights:
- Critical fix: a rolled-back vote detached the nullifier trie and broke every later vote (F0).
- Security: public event API no longer exposes admin tokens or e-mail addresses (F1); nullifier
  writes are proof-gated and all admin endpoints require the admin token (F2).
- Robustness: registrations are serialised per event (F7); votes are serialised per network and
  the queue holds until the previous vote is on-chain and indexed at every address the next vote
  reads, so concurrent voters no longer need a retry (F6, fixed and verified — see final testing);
  event start no longer fails between the two mint transactions (F11).
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
  - [`dabc150`](https://github.com/TrustLevel/ZK-Voting-App/commit/dabc150), [`69377fe`](https://github.com/TrustLevel/ZK-Voting-App/commit/69377fe), [`7914ac0`](https://github.com/TrustLevel/ZK-Voting-App/commit/7914ac0) F6 — serialise per network (the relay wallet is shared) and wait until the previous vote is indexed at the Semaphore, Voting and relay addresses
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

**Run:** 2026-10-29, event `6321080341` on Preprod, backend/frontend `main` @ `79637ef` as deployed on
https://api.vote.trustlevel.io; voting window 05:37–06:52 UTC; 15 script-controlled voters (14 registered
before publishing, one late registrant, one no-show). **All 26 verdicts passed.** Summary table, key numbers and
the full timeline: test report
(https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/testing/M4_TEST_REPORT.md).

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
| V01 | A | [f57dc5f6b770…](https://preprod.cardanoscan.io/transaction/f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0) |
| V02 | A | [7938327342c5…](https://preprod.cardanoscan.io/transaction/7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f) |
| V03 | A | [9d928239623a…](https://preprod.cardanoscan.io/transaction/9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21) |
| V04 | A | [1ca12a1ac964…](https://preprod.cardanoscan.io/transaction/1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3) |
| V05 | B | [6abe760ee815…](https://preprod.cardanoscan.io/transaction/6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f) |
| V06 | B | [b46655355d33…](https://preprod.cardanoscan.io/transaction/b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4) |
| V07 | B | [2993fc086018…](https://preprod.cardanoscan.io/transaction/2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03) |
| V08 | C | [3f313fb65e51…](https://preprod.cardanoscan.io/transaction/3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0) |
| V09 | C | [2ef9f08432e0…](https://preprod.cardanoscan.io/transaction/2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a) |
| V10 | A | [e0676ea45584…](https://preprod.cardanoscan.io/transaction/e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20) |
| V11 | A | [e1885755fe13…](https://preprod.cardanoscan.io/transaction/e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b) |
| V12 | B | [a19cf051cc71…](https://preprod.cardanoscan.io/transaction/a19cf051cc713bc8c9b0a7e0387f1d307de57ee3eae1b90767b635e0d6a29c90) |
| V13 | C | [9fd3f7e1b4a9…](https://preprod.cardanoscan.io/transaction/9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b) |

Compared with the 2026-10-05 run on the Milestone 3 build: C1 had to be skipped then (it would have
broken the event, F0), R1 lost one registration (F7), a non-member got HTTP 500 (F12), and C7 showed
that an unauthenticated nullifier insert or delete blocked legitimate votes (F2). All four now pass.

**Concurrency after the run (F6, closed).** B1 above shows the state at `79637ef`: the losers of a
concurrent submission were rolled back and had to retry. The same day the queue was changed to hold
each vote until the previous one is on-chain and indexed at every address the next vote reads, and
re-tested with three voters submitting within two seconds, 90 s after the start: first run (event
`4317170796`) still lost one vote to the Voting state UTxO that was not yet indexed → `7914ac0`;
second run (event `7599761867`) **3 of 3 confirmed on the first attempt**, tally correct. Both runs
and the Mainnet smoke test are in the test report, Part C.

---

## Evidence of milestone completion

| Required | Where |
|---|---|
| Complete audit report published on the TrustLevel Gitbook | https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/audit-report-milestone-4 |
| User feedback published on the TrustLevel Gitbook | https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app/user-feedback-milestone-4 |
| Updated smart contracts on GitHub | https://github.com/TrustLevel/ZK-Voting-App/tree/v1.0/src/on-chain |
| Documentation of the protocol on GitHub | [README](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/README.md) · [System design](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/design/SYSTEM_DESIGN.md) · [Smart-contract specification](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/design/SMART_CONTRACT_SPECIFICATION.md) · [Relay vote design](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/design/RELAY_VOTE_DESIGN.md) · [On-chain docs](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/src/on-chain/DOCS.md) · [Upstream Semaphore changes](https://github.com/TrustLevel/ZK-Voting-App/blob/v1.0/docs/audit/UPSTREAM_SEMAPHORE_CHANGES.md) |

---

## Known limits

Stated in the feedback document, §5: the vote option is readable on-chain (anonymity, not ballot
secrecy); the backend can correlate a voter's Merkle-path request with the vote; the circuit was not
changed in this milestone. Votes are processed one after another per network (the relay wallet is shared by
all events of a network), so under load a vote waits 20–50 s for the one before it; a voter whose transaction
is rejected by the node — for example because the chain has not yet produced a block past the event start —
is told to retry in a few minutes.

Events created before this milestone's deployment cannot receive votes any more: the contract
script hashes changed with `cardano-semaphore` v0.9.5, so earlier events point at the old scripts.
This is expected for a testnet preview.
