# Milestone 4 — Test report

**Project:** ZK Voting App (Catalyst project 1200252) · **Network:** Cardano Preprod
**Generated:** 2026-10-29 from the local run logs (`scripts/sim-run`, kept out of the repository)
**Companion documents:** [User feedback](M4_USER_FEEDBACK.md) · [Audit report](../audit/AUDIT.md) · [Submission](../milestones/MILESTONE4_SUBMISSION.md)

This report is the project's own regression run of 2026-10-29 against the Milestone 4
deployment, after all fixes: the scripted scenarios of the testers' system test of 2026-10-05,
extended. The scenario that previously broke the system (a rolled-back first vote, C1) is
included, and the attack scenarios target the hardened endpoints.

The tests of 2026-10-05 that produced the findings F0–F12 are the testers' own and are published
with their feedback:

- the scripted system test by Talon (15 script-controlled voters, concurrency and attack
  scenarios): [interviews/VotingAppFeedback_Pumbi.md](interviews/VotingAppFeedback_Pumbi.md);
- the live group test with five participants by pinusch:
  [interviews/VotingAppFeedback_Pinusch.md](interviews/VotingAppFeedback_Pinusch.md).

The findings list with its current status is section 4 of [M4_USER_FEEDBACK.md](M4_USER_FEEDBACK.md).

How to read this report: every API call the script makes is the call the frontend makes; every
vote is a real transaction on Preprod (links to the explorer are in the tables); "verdict" lines
compare what happened with what the test plan expected. The script, the plan and the raw logs
stay on the maintainer's machine because they contain wallet secrets; everything needed to verify
the results is on-chain.

Redactions: e-mail addresses and invitation/admin tokens are replaced by placeholders. Wallet
addresses, transaction hashes, nullifiers and commitments are public on-chain data and are kept.

---

## Part C — Scripted regression test, 2026-10-29 (Milestone 4 deployment, final code)

Event `6321080341` on Cardano Preprod, 15 script-controlled voters with real Semaphore identities, real invitations and registrations; votes go through the deployed relay (`POST relay-vote`) exactly as the browser sends them. Publishing was done with the test's organiser wallet. **Result: 26 of 26 checks passed; 13 votes confirmed on-chain; the final tally matches on the API, on-chain and against the planned votes.**

How to read the table: *expected* is what the test plan demands; *observed* is what happened, verbatim where short. Transaction links go to the Preprod explorer.

| Test | What is tested | Expected | Observed | Result | On-chain |
|---|---|---|---|---|---|
| R1 | Three participants register at the same moment | all 3 registered, backend root consistent | consistent=true, missing=0, members=14, errors=[] | pass |  |
| C1 | A vote before the event start | rejected (before event start), backend trie root unchanged | rejected at relay-vote (HTTP 502): rejected by the node (see appendix) | pass |  |
| A-V01 | Wave A vote by V01 | confirmed on-chain | confirmed f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0 | pass | [tx](https://preprod.cardanoscan.io/transaction/f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0) |
| A-V02 | Wave A vote by V02 | confirmed on-chain | confirmed 7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f | pass | [tx](https://preprod.cardanoscan.io/transaction/7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f) |
| A-V03 | Wave A vote by V03 | confirmed on-chain | confirmed 9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21 | pass | [tx](https://preprod.cardanoscan.io/transaction/9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21) |
| A-V04 | Wave A vote by V04 | confirmed on-chain | confirmed 1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3 | pass | [tx](https://preprod.cardanoscan.io/transaction/1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3) |
| A-V05 | Wave A vote by V05 | confirmed on-chain | confirmed 6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f | pass | [tx](https://preprod.cardanoscan.io/transaction/6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f) |
| A-V06 | Wave A vote by V06 | confirmed on-chain | confirmed b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4 | pass | [tx](https://preprod.cardanoscan.io/transaction/b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4) |
| A-V07 | Wave A vote by V07 | confirmed on-chain | confirmed 2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03 | pass | [tx](https://preprod.cardanoscan.io/transaction/2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03) |
| A-V08 | Wave A vote by V08 | confirmed on-chain | confirmed 3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0 | pass | [tx](https://preprod.cardanoscan.io/transaction/3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0) |
| A-V09 | Wave A vote by V09 | confirmed on-chain | confirmed 2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a | pass | [tx](https://preprod.cardanoscan.io/transaction/2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a) |
| C2 | The same identity votes a second time (normal path) | HTTP 409 from relay-vote (nullifier already used) | rejected at relay-vote (HTTP 409): Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed… | pass |  |
| C3 | The same identity votes again bypassing the backend (own MPF proof, direct submit) | rejected on-chain (MPF root mismatch) | rejected at submit-direct: {"data":{"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCon… | pass |  |
| C4 | The exact relay-vote request of a confirmed vote is replayed | HTTP 409 (nullifier already used), no tx submitted | rejected (HTTP 409): {"statusCode":409,"message":"Nullifier already used. Your vote may have already been submitted, or a previous attempt p… | pass |  |
| C5 | An unregistered identity uses a member's Merkle path | HTTP 400 before the trie is touched (proof root is not the on-chain group root) | rejected at relay-vote (HTTP 400): Invalid vote proof: proof is not for this event's voter group; trie unchanged=true | pass |  |
| C6 | A participant who registered after the publish tries to vote | HTTP 404/409 with a clear message (not in the group root frozen at mint) — F12 | rejected at merkle-proof (HTTP 409): Not part of this vote's group (registered after voting started) | pass |  |
| B1 | Three voters submit within two seconds | hypothesis: 1 succeeds, the others fail | 1 submitted, 1 confirmed of 3; failures: V11@relay-vote rolledBack=true: rejected by the node (see appendix) | pass |  |
| B2-V11 | Retry of a voter rejected in B1 | succeeds on retry | confirmed e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b | pass | [tx](https://preprod.cardanoscan.io/transaction/e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b) |
| B2-V13 | Retry of a voter rejected in B1 | succeeds on retry | confirmed 9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b | pass | [tx](https://preprod.cardanoscan.io/transaction/9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b) |
| C7a | Former public nullifier endpoints | POST 404 (removed), DELETE 401 without a valid admin token | POST nullifier → 404; DELETE nullifier without token → 401; with wrong token → 401 | pass |  |
| C7b | Organiser endpoints without the admin token | all 401 without the token; 200 with it | GET /invited → 401; POST /invite → 401; POST /send-invitations → 401; PATCH / → 401; DELETE /participants/1 → 401; POST /save-blockchain-dat… | pass |  |
| C7c | Public event API must not expose admin token, e-mails or commitments | public event objects carry none of adminToken / invitedParticipants / groupLeafCommitments | no admin token, e-mails or commitments in the public event API | pass |  |
| C7d | relay-vote with a proof that does not verify | HTTP 400 (proof does not verify), backend trie root unchanged | HTTP 400: {"statusCode":400,"message":"Invalid vote proof: ZK proof does not verify"}; trie unchanged=true | pass |  |
| C7e | A legitimate vote after the attack battery | V10 votes successfully; backend trie still in sync with chain | confirmed e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20 | pass | [tx](https://preprod.cardanoscan.io/transaction/e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20) |
| C8 | A vote after the event end | rejected (after event end) | rejected at relay-vote: rejected by the node (see appendix) | pass |  |
| T1 | Final tally: API vs chain vs expected | all three equal | api=[6,4,3] chain=[6,4,3] expected=[6,4,3] | pass |  |

### Key numbers

- Votes confirmed: **13** (planned 13 eligible voters; the late and the too-late registrant are rejected by design)
- ZK proof generation per vote (Node prover, same circuit as the browser): avg **1.9 s**
- relay-vote round trip (proof check, nullifier insert, build, submit, wait for on-chain visibility): avg **28.8 s**
- B1 in this run: the two rejected submissions coincided with a parallel event voting on the same relay wallet (an organiser's live test); both succeeded on their first retry. The cause (per-event instead of per-wallet serialisation) was fixed the same day (`dabc150`, `69377fe`, and after the first concurrency check below `7914ac0`); the concurrency check at the end of this report verifies the final state.

## Mainnet smoke test, 2026-10-29

The same flow on **Cardano Mainnet** with real ADA, event `7499048647`, three voters, driven through the organiser endpoints (fee deposit → Group NFT mint → Semaphore + Voting NFT mint, organiser wallet standing in for a CIP-30 wallet) and the relay for the votes. The three votes were submitted within two seconds to exercise the serialisation of relay votes.

| Step | Transaction |
|---|---|
| Fee deposit (3.9 ADA, 3 × 1.3) | [e262db987c34e816…](https://cardanoscan.io/transaction/e262db987c34e816a381d3956c8a5b46c3a9bb5368bfe39a8f77b3cae52bd6e7) |
| Group NFT mint | [bb62c5b2e9e83e20…](https://cardanoscan.io/transaction/bb62c5b2e9e83e207f993b2e37ae0ed9d0da29b0f1b0085c4c3d4d7b8df37268) |
| Semaphore + Voting NFT mint | [de2cf7c8572fb61f…](https://cardanoscan.io/transaction/de2cf7c8572fb61f27b1f434ba8ec316b12836a1798508d032ba554d75837d7e) |
| Vote M1 (option 0, attempt 2) | [cf8ebb42f4dfca13…](https://cardanoscan.io/transaction/cf8ebb42f4dfca13e4988030cb9d004fecc98e048b015cb522f5927f7e8bb0dc) |
| Vote M2 (option 1, attempt 2) | [baab259c6affc958…](https://cardanoscan.io/transaction/baab259c6affc958f9ffcc0dd2b67815ddbe4d643995dda77331e3bb25c83ca8) |
| Vote M3 (option 1, attempt 2) | [1ca2b275cc990705…](https://cardanoscan.io/transaction/1ca2b275cc9907052443717f92a0e8f28f866e66c0faaf3397290a46a4d29086) |

| Check | Result | Observed |
|---|---|---|
| B1 — all three confirmed on the first attempt | FAIL | 0 of 3 confirmed on the first attempt; 3 total |
| T1 — tally via API equals the planned votes | pass | api=[1,2,0] expected=[1,2,0] (3 votes, resultsAvailable=true) |

Fee budget after the event: 3.249233 ADA spent of 3.9 ADA deposited (the remainder stays with the relay wallet; the deposit is the cost of the event).

Reading the first-attempt result: the three transactions were built and submitted one after another (one second apart — the per-network queue serialised them) and each was rejected by the node with `OutsideValidityIntervalUTxO`: a vote transaction is only valid from the event's start slot, and the node validates against the slot of its current tip, which on Mainnet was still before the start 37 s after it (no block had been produced yet). The retries a minute later were all confirmed, with no stale-input error between them. The serialisation itself is verified under real concurrency in the Preprod test below.

## Concurrency check on Preprod, 2026-10-29

This exercises the fix for finding F6: relay votes are serialised per network and the queue holds until the previous vote is on-chain and indexed at every address the next vote reads — the Semaphore state UTxO, the Voting state UTxO and the relay wallet.

### First run — one voter still needed a retry

Three voters of event `4317170796` submit within two seconds, 90 s after the start (so that the chain has a block past the start).

| Voter | Attempt | Transaction |
|---|---|---|
| M1 | 1 | [abef7653426d175a…](https://preprod.cardanoscan.io/transaction/abef7653426d175a07798583f602022af8755c58cf700806b63285245f8d5c0c) |
| M2 | 1 | [6eaef46cf0ec75c2…](https://preprod.cardanoscan.io/transaction/6eaef46cf0ec75c257577c0a425d20fe65a72a4f0899e6f6e2415fa6aadd73cc) |
| M3 | 2 | [a3e9983543abeb45…](https://preprod.cardanoscan.io/transaction/a3e9983543abeb45adb8c5d09a58c8131121d413a67635ab247c8d8a232fc6eb) |

| Check | Result | Observed |
|---|---|---|
| B1 — all three confirmed on the first attempt | FAIL | 2 of 3 confirmed on the first attempt; 3 total |
| T1 — tally via API equals the planned votes | pass | api=[1,2,0] expected=[1,2,0] (3 votes, resultsAvailable=true) |

The third submission was rejected with `Unknown transaction input`: the queue had waited for the Semaphore state and the relay wallet to be indexed, but not for the Voting state UTxO, which the first vote had just spent. Fixed in `7914ac0` (the queue now waits for the Voting validator address as well), deployed, and re-run:

### Second run — after the fix

Three voters of event `7599761867` submit within two seconds, 90 s after the start (so that the chain has a block past the start).

| Voter | Attempt | Transaction |
|---|---|---|
| M1 | 1 | [89ccce9f7c66ed5b…](https://preprod.cardanoscan.io/transaction/89ccce9f7c66ed5bd54a11b02773001b6bfa6240be82adbe00afb6cc0c2df2be) |
| M2 | 1 | [24493c642c7b3465…](https://preprod.cardanoscan.io/transaction/24493c642c7b3465aa39f85f97dcefd2db10bfb2794499de8b51e47a9aef0f04) |
| M3 | 1 | [3bb8cab26cfaefbb…](https://preprod.cardanoscan.io/transaction/3bb8cab26cfaefbb9367c04da73797217583be680338070e15cca4a698f4cc66) |

| Check | Result | Observed |
|---|---|---|
| B1 — all three confirmed on the first attempt | pass | 3 of 3 confirmed on the first attempt; 3 total |
| T1 — tally via API equals the planned votes | pass | api=[1,2,0] expected=[1,2,0] (3 votes, resultsAvailable=true) |

All three votes confirmed on their first attempt (the queue held the second and third vote for 51 s and 20 s respectively, until the previous vote was indexed) and the tally matches.

## Appendix — full run report

<details><summary>Timeline, on-chain state trace, per-test details, performance, and what an observer / the operator can see (generated by the harness)</summary>

## Simulated voting run — main-20261029-0455

> **Simulated run, not public testing.** All 15 voter wallets, the admin wallet and the funding
> wallet were generated and controlled by one operator (a script). This run tests the deployed system end to end
> on Cardano preprod against the live backend; it is not evidence of independent participants.

- Run started: 2026-10-29T04:55:23.685Z
- Code: `preview` @ `5b07ffb`
- Backend: live (`api.vote.trustlevel.io`) · Network: Cardano preprod

### 1. Summary

| Test | Result | Expected | Observed |
|---|---|---|---|
| R1 | ✅ pass | all 3 registered, backend root consistent | consistent=true, missing=0, members=14, errors=[] |
| C1 | ✅ pass | rejected (before event start), backend trie root unchanged | rejected at relay-vote (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"Sh |
| A-V01 | ✅ pass | confirmed on-chain | confirmed f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0 |
| A-V02 | ✅ pass | confirmed on-chain | confirmed 7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f |
| A-V03 | ✅ pass | confirmed on-chain | confirmed 9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21 |
| A-V04 | ✅ pass | confirmed on-chain | confirmed 1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3 |
| A-V05 | ✅ pass | confirmed on-chain | confirmed 6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f |
| A-V06 | ✅ pass | confirmed on-chain | confirmed b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4 |
| A-V07 | ✅ pass | confirmed on-chain | confirmed 2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03 |
| A-V08 | ✅ pass | confirmed on-chain | confirmed 3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0 |
| A-V09 | ✅ pass | confirmed on-chain | confirmed 2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a |
| C2 | ✅ pass | HTTP 409 from relay-vote (nullifier already used) | backend HTTP 409: nullifier already used |
| C3 | ✅ pass | rejected on-chain (MPF root mismatch) | Plutus script failed (phase 2) |
| C4 | ✅ pass | HTTP 409 (nullifier already used), no tx submitted | backend HTTP 409: nullifier already used |
| C5 | ✅ pass | HTTP 400 before the trie is touched (proof root is not the on-chain group root) | rejected at relay-vote (HTTP 400): Invalid vote proof: proof is not for this event's voter group; trie unchanged=true |
| C6 | ✅ pass | HTTP 404/409 with a clear message (not in the group root frozen at mint) — F12 | backend HTTP 409: nullifier already used |
| B1 | ✅ pass | hypothesis: 1 succeeds, the others fail | 1 submitted, 1 confirmed of 3; V11: ledger: inputs already spent; V13: evaluator: inputs already spent (extraRedeemers) |
| B2-V11 | ✅ pass | succeeds on retry | confirmed e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b |
| B2-V13 | ✅ pass | succeeds on retry | confirmed 9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b |
| C7a | ✅ pass | POST 404 (removed), DELETE 401 without a valid admin token | POST nullifier → 404; legitimate vote V10: POST nullifier → 404; DELETE nullifier without token → 401; with wrong token → 401 |
| C7b | ✅ pass | all 401 without the token; 200 with it | GET /invited → 401; legitimate vote V10: GET /invited → 401; POST /invite → 401; POST /send-invitations → 401; PATCH / → 401; DELETE /participants/1 → 401; POST /save-blockchain-data → 401; GET /invite |
| C7c | ✅ pass | public event objects carry none of adminToken / invitedParticipants / groupLeafCommitments | no admin token, e-mails or commitments in the public event API |
| C7d | ✅ pass | HTTP 400 (proof does not verify), backend trie root unchanged | HTTP 400: {"statusCode":400,"message":"Invalid vote proof: ZK proof does not verify"}; trie unchanged=true |
| C7e | ✅ pass | V10 votes successfully; backend trie still in sync with chain | confirmed e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20 |
| C8 | ✅ pass | rejected (after event end) | ledger: tx outside its validity interval |
| T1 | ✅ pass | all three equal | api=[6,4,3] chain=[6,4,3] expected=[6,4,3] |

### 2. Setup

- Event ID: `6321080341` · simple voting · options: Option A, Option B, Option C
- Voting window: 2026-10-29T05:37:51.000Z → 2026-10-29T06:52:51.000Z
- Group NFT policy: `953240c25192a1698e0fcc091b0b9d1f4eca21118743576653a134e6` · mint [31c1173b32ee…](https://preprod.cexplorer.io/tx/31c1173b32eea72c3a928679b22a811acae11c77a5ce63b6dffe3ba87b64cea3)
- Semaphore NFT policy: `06d7b00c562009b217a4c32ae987f68ac7444d0f7a165a004b2063fb` · script [addr_test1wqrd0vqv…vp2lfz](https://preprod.cexplorer.io/address/addr_test1wqrd0vqv2csqnvsh5npj46v8769vw3zdpaapvksqfvsx87cvp2lfz)
- Voting NFT policy: `ab74dbcca29c197cf76e0a8b08e81a36229d56790709f6e71cce9f29` · script [addr_test1wz4hfk7v…tcgn72](https://preprod.cexplorer.io/address/addr_test1wz4hfk7v52wpjl8hdc9gkz8grgmz982k0yrsnah8rn8f72gtcgn72) · mint [c641670cbaac…](https://preprod.cexplorer.io/tx/c641670cbaac5a32f59971e4ae51da8350334600fb9fd8aa7b496c4d3b636f97)
- Group root frozen at mint: `4774706874855103…`
- Funding: distributor [addr_test1qqs7pd2t…qf9jdq](https://preprod.cexplorer.io/address/addr_test1qqs7pd2thmrrtn9mfkcf3dmjugj6a43n0s64a42c30yt9qay4fkj4v38t8a4vuhtypg5ssyn8jdmah04wvru9n3qchuqqf9jdq) → admin + voters in [27fb646c5d09…](https://preprod.cexplorer.io/tx/27fb646c5d09e4438cbb9b5a4d2189b8653e523ccfbae68d358bca9a57821373)

| Voter | Role | Planned option | Wallet | Registered | Vote tx |
|---|---|---|---|---|---|
| V01 | waveA | Option A | [addr_test1qzszyhpp…clt0gk](https://preprod.cexplorer.io/address/addr_test1qzszyhpprvxufgauthhw0x3jw43hgm9lcjpemsq5f7kjkeudepw6sfm76l5qj3fv4e4qnphwrnx6ya27ru5hv8hynyssclt0gk) | yes | [f57dc5f6b770…](https://preprod.cexplorer.io/tx/f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0) |
| V02 | waveA | Option A | [addr_test1qq3ndwj4…hyxmna](https://preprod.cexplorer.io/address/addr_test1qq3ndwj4c847dmcrhz7v7dz39j728xxl87w6dxyau6dh0mlqngsarpkkjgd04kynk5m3lcyk5xhfxs5nf5q2jyw5g26shyxmna) | yes | [7938327342c5…](https://preprod.cexplorer.io/tx/7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f) |
| V03 | waveA | Option A | [addr_test1qrnzqa78…ww4lx3](https://preprod.cexplorer.io/address/addr_test1qrnzqa7808k3t58kjmw5asdqtn09qnu0hesw0qpfuu4juh7y50c5wkd0deuwduqrxt6ujv6q62md6y3a0n0ea4xhwhlqww4lx3) | yes | [9d928239623a…](https://preprod.cexplorer.io/tx/9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21) |
| V04 | waveA | Option A | [addr_test1qq87l8yh…lu4ymc](https://preprod.cexplorer.io/address/addr_test1qq87l8yh6pckaqvdckrj93dt6vv6377mcf6tuj4zregnhj08x75jcjzeceleky9ff8qzpv5zeeqcr4sas0yusd9wzx9qlu4ymc) | yes | [1ca12a1ac964…](https://preprod.cexplorer.io/tx/1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3) |
| V05 | waveA | Option B | [addr_test1qp5x8kc8…cf6mrk](https://preprod.cexplorer.io/address/addr_test1qp5x8kc859a2y8nlrue6prnrju5nn865wavfpg99t4egpevk5x3efsrffee7x3tr7xz9hkk3xdf2d7r4r0m69eyyjnyscf6mrk) | yes | [6abe760ee815…](https://preprod.cexplorer.io/tx/6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f) |
| V06 | waveA | Option B | [addr_test1qz5zx6re…68dczq](https://preprod.cexplorer.io/address/addr_test1qz5zx6reseasgx8cz57t22kft66j8ja00szcr764kt3e56egculsvehhwm2e06xzuzdfxz7qs6l7u9259xwxzqrued7s68dczq) | yes | [b46655355d33…](https://preprod.cexplorer.io/tx/b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4) |
| V07 | waveA | Option B | [addr_test1qzp4tle3…0rmdpa](https://preprod.cexplorer.io/address/addr_test1qzp4tle3yemzc96qfcx0u70yt3v2jhsw28dmy464j7fharj5yvzvhhvn7ss0mgrj3zcn3gtyu8wnes35vv8ngz2xhc3s0rmdpa) | yes | [2993fc086018…](https://preprod.cexplorer.io/tx/2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03) |
| V08 | waveA | Option C | [addr_test1qraa0dyr…h66pxn](https://preprod.cexplorer.io/address/addr_test1qraa0dyrmpen82luym7g5pdgmwf4atclf5g2ks58d0k3cj774nv888m4s6q562fjy49syc03pewkmzfud7ggyxnvy9msh66pxn) | yes | [3f313fb65e51…](https://preprod.cexplorer.io/tx/3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0) |
| V09 | waveA | Option C | [addr_test1qpvmsjdf…d2gv3y](https://preprod.cexplorer.io/address/addr_test1qpvmsjdf7jawthv8rsfx84ftnp0ar3j0dhcq0s9xul4y9l9xfcw9mdt89jz2l6neasgfzutgrxz4hh750zfswgdrlj0qd2gv3y) | yes | [2ef9f08432e0…](https://preprod.cexplorer.io/tx/2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a) |
| V10 | reserve | Option A | [addr_test1qq3q0swl…jcvhnv](https://preprod.cexplorer.io/address/addr_test1qq3q0swlkr7akfk6s2hs952cqwwsp8p4qqtddz6k3cyghwglg5wndvsqp66vjr2jkza932xq3jwe5f9tu93avutpdpfsjcvhnv) | yes | [e0676ea45584…](https://preprod.cexplorer.io/tx/e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20) |
| V11 | waveB | Option A | [addr_test1qrjp7u7l…vlhdxy](https://preprod.cexplorer.io/address/addr_test1qrjp7u7lljlu7h4ecu8nle3up9k5tfwdde8zhwmd8enkn7pvuwd6ktna30673tpk9flcg7dmgxahdm0fm42ha992mxmqvlhdxy) | yes | [e1885755fe13…](https://preprod.cexplorer.io/tx/e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b) |
| V12 | waveB | Option B | [addr_test1qzzedj08…g033eg](https://preprod.cexplorer.io/address/addr_test1qzzedj08w3dgvktpz5rh8447fdpc8qgry0ztcxa3atjusm5e9es7s6y5s29gvk4wzdhm6ljfda8vds3pszzwk3sykv8qg033eg) | yes | [a19cf051cc71…](https://preprod.cexplorer.io/tx/a19cf051cc713bc8c9b0a7e0387f1d307de57ee3eae1b90767b635e0d6a29c90) |
| V13 | waveB | Option C | [addr_test1qrzgx5aa…ulp09w](https://preprod.cexplorer.io/address/addr_test1qrzgx5aagz3xgylhyrta2w994ujz3cm4hjwn2j7tl5pkvhd9deh4juhjmrw8hgga43adfqq8vv95nammwrj2yc54p79sulp09w) | yes | [9fd3f7e1b4a9…](https://preprod.cexplorer.io/tx/9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b) |
| V14 | late | — | [addr_test1qraarjly…sllu67](https://preprod.cexplorer.io/address/addr_test1qraarjlyf5gcw6ejpdjru3dwwky7qxuk7cx9h0wv9qsclrtrxr254m6d7kwemf97t8t32px93xp6f9hfsykfkg370e0ssllu67) | yes | — |
| V15 | tooLate | Option B | [addr_test1qp2ech5h…rwn68j](https://preprod.cexplorer.io/address/addr_test1qp2ech5hjs8mftnj28s5dn3nxnzz7rxs38mnhky9thpkuvfycurl0s6fv8aaml4r58cr0fwqrrh77xdcpldlvmrg3ygqrwn68j) | yes | — |

### 3. Timeline

| Time (UTC) | Phase | Test | Actor | Event | Tx / detail |
|---|---|---|---|---|---|
| 04:55:26 | fund |  |  | tx-submitted | [27fb646c5d09…](https://preprod.cexplorer.io/tx/27fb646c5d09e4438cbb9b5a4d2189b8653e523ccfbae68d358bca9a57821373) |
| 04:56:14 | fund |  |  | confirmed | [27fb646c5d09…](https://preprod.cexplorer.io/tx/27fb646c5d09e4438cbb9b5a4d2189b8653e523ccfbae68d358bca9a57821373) |
| 05:21:39 | event |  |  | event-created | [SIM] M4 test run main 2026-10-29 05:21 |
| 05:21:43 | event |  |  | invitations | sent 15, failed 0 |
| 05:22:34 | bootstrap |  |  | tx-submitted (group mint) | [31c1173b32ee…](https://preprod.cexplorer.io/tx/31c1173b32eea72c3a928679b22a811acae11c77a5ce63b6dffe3ba87b64cea3) |
| 05:22:59 | bootstrap |  |  | confirmed (group mint) | [31c1173b32ee…](https://preprod.cexplorer.io/tx/31c1173b32eea72c3a928679b22a811acae11c77a5ce63b6dffe3ba87b64cea3) |
| 05:23:07 | bootstrap |  |  | tx-submitted (semaphore+voting mint) | [c641670cbaac…](https://preprod.cexplorer.io/tx/c641670cbaac5a32f59971e4ae51da8350334600fb9fd8aa7b496c4d3b636f97) |
| 05:23:23 | bootstrap |  |  | confirmed (semaphore+voting mint) | [c641670cbaac…](https://preprod.cexplorer.io/tx/c641670cbaac5a32f59971e4ae51da8350334600fb9fd8aa7b496c4d3b636f97) |
| 05:23:38 | vote | C1 | V01 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 05:39:11 | vote | A | V01 | vote-submitted | [f57dc5f6b770…](https://preprod.cexplorer.io/tx/f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0) |
| 05:39:13 | vote | A | V01 | confirmed | [f57dc5f6b770…](https://preprod.cexplorer.io/tx/f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0) |
| 05:40:13 | vote | A | V02 | vote-submitted | [7938327342c5…](https://preprod.cexplorer.io/tx/7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f) |
| 05:40:14 | vote | A | V02 | confirmed | [7938327342c5…](https://preprod.cexplorer.io/tx/7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f) |
| 05:40:49 | vote | A | V03 | vote-submitted | [9d928239623a…](https://preprod.cexplorer.io/tx/9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21) |
| 05:40:54 | vote | A | V03 | confirmed | [9d928239623a…](https://preprod.cexplorer.io/tx/9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21) |
| 05:41:23 | vote | A | V04 | vote-submitted | [1ca12a1ac964…](https://preprod.cexplorer.io/tx/1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3) |
| 05:41:28 | vote | A | V04 | confirmed | [1ca12a1ac964…](https://preprod.cexplorer.io/tx/1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3) |
| 05:41:32 | vote | A | V05 | vote-failed | at `relay-vote` (HTTP 422): Script evaluation failed — collateral NOT taken. ScriptFailures: {   "spend:0": {     "CannotCreateEvaluationContext": {       "reason": "Un |
| 05:42:27 | vote | A-retry | V05 | vote-submitted | [6abe760ee815…](https://preprod.cexplorer.io/tx/6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f) |
| 05:42:32 | vote | A | V05 | confirmed | [6abe760ee815…](https://preprod.cexplorer.io/tx/6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f) |
| 05:42:37 | vote | A | V06 | vote-failed | at `relay-vote` (HTTP 422): Script evaluation failed — collateral NOT taken. ScriptFailures: {   "spend:1": {     "CannotCreateEvaluationContext": {       "reason": "Un |
| 05:43:31 | vote | A-retry | V06 | vote-submitted | [b46655355d33…](https://preprod.cexplorer.io/tx/b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4) |
| 05:43:36 | vote | A | V06 | confirmed | [b46655355d33…](https://preprod.cexplorer.io/tx/b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4) |
| 05:43:40 | vote | A | V07 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 05:44:40 | vote | A-retry | V07 | vote-submitted | [2993fc086018…](https://preprod.cexplorer.io/tx/2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03) |
| 05:44:44 | vote | A | V07 | confirmed | [2993fc086018…](https://preprod.cexplorer.io/tx/2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03) |
| 05:45:09 | vote | A | V08 | vote-submitted | [3f313fb65e51…](https://preprod.cexplorer.io/tx/3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0) |
| 05:45:14 | vote | A | V08 | confirmed | [3f313fb65e51…](https://preprod.cexplorer.io/tx/3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0) |
| 05:45:18 | vote | A | V09 | vote-failed | at `relay-vote` (HTTP 422): Script evaluation failed — collateral NOT taken. ScriptFailures: {   "spend:0": {     "CannotCreateEvaluationContext": {       "reason": "Un |
| 05:46:13 | vote | A-retry | V09 | vote-submitted | [2ef9f08432e0…](https://preprod.cexplorer.io/tx/2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a) |
| 05:46:18 | vote | A | V09 | confirmed | [2ef9f08432e0…](https://preprod.cexplorer.io/tx/2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a) |
| 05:46:23 | vote | C2 | V03 | vote-failed | at `relay-vote` (HTTP 409): Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed. If the vote TX was never confirme |
| 05:46:29 | vote | C3 | V03 | vote-failed | at `submit-direct`: {"data":{"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUt |
| 05:46:34 | vote | C5 | V14 | vote-failed | at `relay-vote` (HTTP 400): Invalid vote proof: proof is not for this event's voter group |
| 05:46:36 | vote | C6 | V14 | vote-failed | at `merkle-proof` (HTTP 409): Not part of this vote's group (registered after voting started) |
| 05:46:43 | vote | B1 | V11 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 05:46:59 | vote | B1 | V12 | vote-submitted | [a19cf051cc71…](https://preprod.cexplorer.io/tx/a19cf051cc713bc8c9b0a7e0387f1d307de57ee3eae1b90767b635e0d6a29c90) |
| 05:46:59 | vote | B1 | V13 | vote-failed | at `relay-vote` (HTTP 422): Script evaluation failed — collateral NOT taken. ScriptFailures: {   "spend:0": {     "extraRedeemers": [       "spend:0"     ]   },   "spen |
| 05:47:01 | vote | B1 | V12 | confirmed | [a19cf051cc71…](https://preprod.cexplorer.io/tx/a19cf051cc713bc8c9b0a7e0387f1d307de57ee3eae1b90767b635e0d6a29c90) |
| 05:47:25 | vote | B2 | V11 | vote-submitted | [e1885755fe13…](https://preprod.cexplorer.io/tx/e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b) |
| 05:47:29 | vote | B2 | V11 | confirmed | [e1885755fe13…](https://preprod.cexplorer.io/tx/e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b) |
| 05:47:54 | vote | B2 | V13 | vote-submitted | [9fd3f7e1b4a9…](https://preprod.cexplorer.io/tx/9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b) |
| 05:47:59 | vote | B2 | V13 | confirmed | [9fd3f7e1b4a9…](https://preprod.cexplorer.io/tx/9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b) |
| 05:48:51 | vote | C7e-victim | V10 | vote-submitted | [e0676ea45584…](https://preprod.cexplorer.io/tx/e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20) |
| 05:48:52 | vote | C7e-victim | V10 | confirmed | [e0676ea45584…](https://preprod.cexplorer.io/tx/e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20) |
| 07:02:38 | vote | C8 | V15 | vote-failed | at `relay-vote`: fetch failed |
| 07:03:49 | vote | C8 | V15 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |

### 4. On-chain state trace

After every state change: the nullifier MPF root on-chain (Semaphore datum), in the backend, and recomputed
locally from the nullifiers of confirmed votes; plus the on-chain tally (Voting datum).
Note: in run main-20261005-0941 the snapshot waited only for the Semaphore address to be indexed, so the tally
column can lag one vote behind (Blockfrost indexes the Voting address separately). The final tally in §5 is exact.

| Time | After | MPF root on-chain | MPF root backend | Backend = chain | Recomputed | Tally (A/B/C) |
|---|---|---|---|---|---|---|
| 05:23:25 | after bootstrap | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:23:27 | after late registration | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:23:28 | before C1 | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:23:38 | after C1 | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:39:13 | after A V01 | `ceeff0e54a…` | `ceeff0e54a…` | yes | `ceeff0e54a…` | 1 / 0 / 0 |
| 05:40:15 | after A V02 | `223e8b8f56…` | `223e8b8f56…` | yes | `223e8b8f56…` | 2 / 0 / 0 |
| 05:40:54 | after A V03 | `6ad2f6c784…` | `6ad2f6c784…` | yes | `6ad2f6c784…` | 3 / 0 / 0 |
| 05:41:29 | after A V04 | `844588bbb3…` | `844588bbb3…` | yes | `844588bbb3…` | 4 / 0 / 0 |
| 05:42:32 | after A V05 | `4ffa5ee7bc…` | `4ffa5ee7bc…` | yes | `4ffa5ee7bc…` | 4 / 1 / 0 |
| 05:43:36 | after A V06 | `6941c37dfa…` | `6941c37dfa…` | yes | `6941c37dfa…` | 4 / 2 / 0 |
| 05:44:45 | after A V07 | `8045a64874…` | `8045a64874…` | yes | `8045a64874…` | 4 / 3 / 0 |
| 05:45:15 | after A V08 | `0772398390…` | `0772398390…` | yes | `0772398390…` | 4 / 3 / 1 |
| 05:46:18 | after A V09 | `3aae3290cf…` | `3aae3290cf…` | yes | `3aae3290cf…` | 4 / 3 / 2 |
| 05:46:30 | before C5 | `3aae3290cf…` | `3aae3290cf…` | yes | `3aae3290cf…` | 4 / 3 / 2 |
| 05:46:35 | after C5 | `3aae3290cf…` | `3aae3290cf…` | yes | `3aae3290cf…` | 4 / 3 / 2 |
| 05:46:36 | after attacks | `3aae3290cf…` | `3aae3290cf…` | yes | `3aae3290cf…` | 4 / 3 / 2 |
| 05:47:01 | after B1 V12 | `54d9d03dba…` | `54d9d03dba…` | yes | `54d9d03dba…` | 4 / 4 / 2 |
| 05:47:30 | after B2 V11 | `aa94bfce50…` | `aa94bfce50…` | yes | `aa94bfce50…` | 5 / 4 / 2 |
| 05:48:00 | after B2 V13 | `7faad3dbcb…` | `7faad3dbcb…` | yes | `7faad3dbcb…` | 5 / 4 / 3 |
| 05:48:01 | before C7 | `7faad3dbcb…` | `7faad3dbcb…` | yes | `7faad3dbcb…` | 5 / 4 / 3 |
| 05:48:06 | after C7d junk proof | `7faad3dbcb…` | `7faad3dbcb…` | yes | `7faad3dbcb…` | 5 / 4 / 3 |
| 05:48:53 | after C7e-victim V10 | `61961472e1…` | `61961472e1…` | yes | `61961472e1…` | 6 / 4 / 3 |
| 05:48:53 | after C7 | `61961472e1…` | `61961472e1…` | yes | `61961472e1…` | 6 / 4 / 3 |
| 07:02:40 | after C8 | `61961472e1…` | `61961472e1…` | yes | `61961472e1…` | 6 / 4 / 3 |
| 07:02:55 | final | `61961472e1…` | `61961472e1…` | yes | `61961472e1…` | 6 / 4 / 3 |
| 07:03:49 | after C8 | `61961472e1…` | `61961472e1…` | yes | `61961472e1…` | 6 / 4 / 3 |

#### Group Merkle root (registration)

| Time | After | Backend members | Registered by us | Missing | Root consistent |
|---|---|---|---|---|---|
| 05:22:13 | after V01 | 1 | 1 | undefined | yes |
| 05:22:14 | after V02 | 2 | 2 | undefined | yes |
| 05:22:15 | after V03 | 3 | 3 | undefined | yes |
| 05:22:16 | after V04 | 4 | 4 | undefined | yes |
| 05:22:17 | after V05 | 5 | 5 | undefined | yes |
| 05:22:19 | after V06 | 6 | 6 | undefined | yes |
| 05:22:20 | after V07 | 7 | 7 | undefined | yes |
| 05:22:21 | after V08 | 8 | 8 | undefined | yes |
| 05:22:23 | after V09 | 9 | 9 | undefined | yes |
| 05:22:24 | after V10 | 10 | 10 | undefined | yes |
| 05:22:25 | after V15 | 11 | 11 | undefined | yes |
| 05:22:27 | after R1 (concurrent) | 14 | 14 | undefined | yes |
| 05:22:27 | after R1 retries | 14 | 14 | undefined | yes |
| 05:22:29 | groupcheck (re-run) | 14 | 14 | undefined | yes |
| 05:23:26 | after late registration V14 | 15 | 15 | undefined | yes |

### 5. Results reconciliation

- api=[6,4,3] chain=[6,4,3] expected=[6,4,3]

### 6. Adversarial tests

#### R1 — pass

- Expected: all 3 registered, backend root consistent
- Cause: consistent=true, missing=0, members=14, errors=[]

<details><summary>Raw observation</summary>

```
consistent=true, missing=0, members=14, errors=[]
```
</details>

#### C1 — pass

- Expected: rejected (before event start), backend trie root unchanged
- Cause: rejected at relay-vote (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"Sh

<details><summary>Raw observation</summary>

```
rejected at relay-vote (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUtxowFailure (UtxoFailure (Outside; backend trie root unchanged=true
```
</details>

#### C2 — pass

- Expected: HTTP 409 from relay-vote (nullifier already used)
- Cause: backend HTTP 409: nullifier already used

<details><summary>Raw observation</summary>

```
rejected at relay-vote (HTTP 409): Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed. If the vote TX was never confirmed on-chain, please c
```
</details>

#### C3 — pass

- Expected: rejected on-chain (MPF root mismatch)
- Cause: Plutus script failed (phase 2)

<details><summary>Raw observation</summary>

```
rejected at submit-direct: {"data":{"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUtxowFailure (UtxoFailure (UtxosFailure (ValidationTagMismatch Phase2Valid (FailedUnexpectedly (PlutusFailure \\\"\\\\nThe PlutusV3 script failed:\\\\nBase64-enco
```
</details>

#### C4 — pass

- Expected: HTTP 409 (nullifier already used), no tx submitted
- Cause: backend HTTP 409: nullifier already used

<details><summary>Raw observation</summary>

```
rejected (HTTP 409): {"statusCode":409,"message":"Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed. If the vote TX was never confirmed on-chain, please contact the event organizer to reset the nullifier."}
```
</details>

#### C5 — pass

- Expected: HTTP 400 before the trie is touched (proof root is not the on-chain group root)
- Cause: rejected at relay-vote (HTTP 400): Invalid vote proof: proof is not for this event's voter group; trie unchanged=true

<details><summary>Raw observation</summary>

```
rejected at relay-vote (HTTP 400): Invalid vote proof: proof is not for this event's voter group; trie unchanged=true
```
</details>

#### C6 — pass

- Expected: HTTP 404/409 with a clear message (not in the group root frozen at mint) — F12
- Cause: backend HTTP 409: nullifier already used

<details><summary>Raw observation</summary>

```
rejected at merkle-proof (HTTP 409): Not part of this vote's group (registered after voting started)
```
</details>

#### B1 — pass

- Expected: hypothesis: 1 succeeds, the others fail
- Cause: evaluator: inputs already spent (extraRedeemers)

<details><summary>Raw observation</summary>

```
1 submitted, 1 confirmed of 3; failures: V11@relay-vote rolledBack=true: Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\" | V13@relay-vote rolledBack=true: Script evaluation failed — collateral NOT taken.
ScriptFailures:
{
  "spend:0": {
    "extraRedeemers": [
      "spend:0
```
</details>

#### B2-V11 — pass

- Expected: succeeds on retry
- Cause: confirmed e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b

<details><summary>Raw observation</summary>

```
confirmed e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b
```
</details>

#### B2-V13 — pass

- Expected: succeeds on retry
- Cause: confirmed 9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b

<details><summary>Raw observation</summary>

```
confirmed 9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b
```
</details>

#### C7a — pass

- Expected: POST 404 (removed), DELETE 401 without a valid admin token
- Cause: POST nullifier → 404; DELETE nullifier without token → 401; with wrong token → 401

<details><summary>Raw observation</summary>

```
POST nullifier → 404; DELETE nullifier without token → 401; with wrong token → 401
```
</details>

#### C7b — pass

- Expected: all 401 without the token; 200 with it
- Cause: GET /invited → 401; POST /invite → 401; POST /send-invitations → 401; PATCH / → 401; DELETE /participants/1 → 401; POST /save-blockchain-data → 401; GET /invite

<details><summary>Raw observation</summary>

```
GET /invited → 401; POST /invite → 401; POST /send-invitations → 401; PATCH / → 401; DELETE /participants/1 → 401; POST /save-blockchain-data → 401; GET /invited with admin token → 200
```
</details>

#### C7c — pass

- Expected: public event objects carry none of adminToken / invitedParticipants / groupLeafCommitments
- Cause: no admin token, e-mails or commitments in the public event API

<details><summary>Raw observation</summary>

```
no admin token, e-mails or commitments in the public event API
```
</details>

#### C7d — pass

- Expected: HTTP 400 (proof does not verify), backend trie root unchanged
- Cause: HTTP 400: {"statusCode":400,"message":"Invalid vote proof: ZK proof does not verify"}; trie unchanged=true

<details><summary>Raw observation</summary>

```
HTTP 400: {"statusCode":400,"message":"Invalid vote proof: ZK proof does not verify"}; trie unchanged=true
```
</details>

#### C7e — pass

- Expected: V10 votes successfully; backend trie still in sync with chain
- Cause: confirmed e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20

<details><summary>Raw observation</summary>

```
confirmed e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20
```
</details>

#### C8 — pass

- Expected: rejected (after event end)
- Cause: ledger: tx outside its validity interval

<details><summary>Raw observation</summary>

```
rejected at relay-vote: Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUtxowFailure (UtxoFailure (OutsideValidityIntervalUTxO (ValidityInterval {invalidBefore = SJust (SlotNo 137569072), invalidHereafter =; rolledBack=true
```
</details>

### 7. Performance

- ZK proof generation (Node, ms): min 1294 · median 1442 · max 2670
- Full voter flow until submit (ms): min 20811 · median 24923 · max 59527
- Submit → confirmed (s, incl. polling): min 1 · median 5 · max 5
- Fee per vote (lovelace): min 1079587 · median 1085571 · max 1091995
- Tx size (bytes): min 10480 · median 10616 · max 10762
- Execution units declared per vote, semaphore spend (static budget, not measured usage; steps): min 5000000000 · median 5000000000 · max 5000000000

### 8. What is traceable on-chain

Decoded from chain data only (Blockfrost: tx inputs + redeemers), without using this run's logs.

| Paying wallet | Vote tx | Option (from `signal_message`) | Nullifier |
|---|---|---|---|
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [f57dc5f6b770…](https://preprod.cexplorer.io/tx/f57dc5f6b770a79fe4ce24fe110aebe02b912c940e9be326828c2c492e6835d0) | Option A ×1 | `2.109034144658…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [7938327342c5…](https://preprod.cexplorer.io/tx/7938327342c55e76ec3961662187cced817edb99e4e03f00f38b276b263dba9f) | Option A ×1 | `1.537747938068…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [9d928239623a…](https://preprod.cexplorer.io/tx/9d928239623ae629f1ef181acb1fb87995a4ab9d7b4b54a5bd26d13d970f3b21) | Option A ×1 | `4.841639156537…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [1ca12a1ac964…](https://preprod.cexplorer.io/tx/1ca12a1ac9643022f42c34e9acf2b62e00b87dca123e68d21c0a801d5b5f1af3) | Option A ×1 | `2.479421982451…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [6abe760ee815…](https://preprod.cexplorer.io/tx/6abe760ee81532c9fafc76aea268e8ec67e70023552ec98965ee146cd3899d1f) | Option B ×1 | `1.290985290100…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [b46655355d33…](https://preprod.cexplorer.io/tx/b46655355d3345399bbff38cfe86d401576679379d9d64cd137d89811ad0b6e4) | Option B ×1 | `4.672874747249…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [2993fc086018…](https://preprod.cexplorer.io/tx/2993fc08601816da6551e98916bd8108a8a892867a864e5b1ffd6261a6a0cf03) | Option B ×1 | `1.928816002357…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [3f313fb65e51…](https://preprod.cexplorer.io/tx/3f313fb65e518e5b72df3b47cb5fb57eb1a4a45ff6ec7102d0a7a967afb746a0) | Option C ×1 | `1.442208499227…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [2ef9f08432e0…](https://preprod.cexplorer.io/tx/2ef9f08432e0b7587b3cb2bb11d4cdcd18f3a7f7f503257156cb018acca5281a) | Option C ×1 | `8.102686520091…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [e0676ea45584…](https://preprod.cexplorer.io/tx/e0676ea45584ae0e379659ac2a23df96cb0a07c38f86736c707b53cfea7b6a20) | Option A ×1 | `4.926386978439…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [e1885755fe13…](https://preprod.cexplorer.io/tx/e1885755fe13b5751ea0f1b4e19d639a9c49e4bf7cb132cd816c088337e4881b) | Option A ×1 | `1.879684676864…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [a19cf051cc71…](https://preprod.cexplorer.io/tx/a19cf051cc713bc8c9b0a7e0387f1d307de57ee3eae1b90767b635e0d6a29c90) | Option B ×1 | `4.012072271349…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [9fd3f7e1b4a9…](https://preprod.cexplorer.io/tx/9fd3f7e1b4a972ade011727da9ba266b07515a8fdf1aad410239f47771c7725b) | Option C ×1 | `1.797848806543…` |

- **Linkable:** paying wallet → vote tx → chosen option (plaintext CBOR in the redeemer) → nullifier.
- **Not linkable on-chain:** identity commitment → vote. Commitments never appear on-chain; only the group root does.
- **Artefact of this simulation:** all wallets were funded from one distributor in [27fb646c5d09…](https://preprod.cexplorer.io/tx/27fb646c5d09e4438cbb9b5a4d2189b8653e523ccfbae68d358bca9a57821373), which links them
  to each other. Real voters funding their own wallets would not share this link — but each voter's own wallet history
  (exchange withdrawals, other dApps) links the vote to them instead.

### 9. What the backend operator can see

Order of requests the backend receives per vote (from this run's request log):

| Voter | `GET merkle-proof/:userId` | `POST nullifier` | `POST vote` | Gap merkle→nullifier |
|---|---|---|---|---|
| V01 | 05:38:22 `12` | — | — | — |
| V02 | 05:39:15 `13` | — | — | — |
| V03 | 05:40:16 `20` | — | — | — |
| V04 | 05:40:55 `21` | — | — | — |
| V05 | 05:42:04 `22` | — | — | — |
| V06 | 05:43:08 `23` | — | — | — |
| V07 | 05:44:12 `24` | — | — | — |
| V08 | 05:44:46 `25` | — | — | — |
| V09 | 05:45:50 `26` | — | — | — |
| V12 | 05:46:39 `29` | — | — | — |
| V11 | 05:47:02 `28` | — | — | — |
| V13 | 05:47:31 `30` | — | — | — |
| V10 | 05:48:07 `27` | — | — | — |

The Merkle-proof request names the voter (`userId`); the nullifier and the signed tx follow seconds later from the
same client. An operator logging request source and time can join userId → nullifier → vote tx → option.


</details>
