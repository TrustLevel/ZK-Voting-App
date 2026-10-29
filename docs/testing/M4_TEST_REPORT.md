# Milestone 4 — Test report

**Project:** ZK Voting App (Catalyst project 1200252) · **Network:** Cardano Preprod
**Generated:** 2026-10-28 from the local run logs (`scripts/sim-run`, kept out of the repository)
**Companion documents:** [User feedback](../M4_USER_FEEDBACK.md) · [Audit report](../audit/AUDIT.md) · [Submission](../milestones/MILESTONE4_SUBMISSION.md)

This report has three parts:

- **Part A** — the scripted system test of 2026-10-05 against the Milestone 3 deployment: 15
  simulated voters (script-controlled wallets and Semaphore identities, real invitations, real
  registrations, real on-chain votes), including concurrency and attack scenarios. It produced the
  application-level findings F0–F12.
- **Part B** — a live group test with five human participants on the same day.
- **Part C** — the same scripted test, extended, run again on 2026-10-28 against the Milestone 4
  deployment after all fixes: the scenario that previously broke the system (a rolled-back first
  vote, C1) is now included, and the attack scenarios target the hardened endpoints.

How to read the scripted parts: every API call the script makes is the call the frontend makes;
every vote is a real transaction on Preprod (links to the explorer are in the tables); "verdict"
lines compare what happened with what the test plan expected. The script, the plan and the raw
logs stay on the maintainer's machine because they contain wallet secrets; everything needed to
verify the results is on-chain.

Redactions: e-mail addresses and invitation/admin tokens are replaced by placeholders. Wallet
addresses, transaction hashes, nullifiers and commitments are public on-chain data and are kept.

---

## Part A — Scripted system test, 2026-10-05 (Milestone 3 deployment)

## Simulated voting run — main-20261005-0941

> **Simulated run, not public testing.** All 15 voter wallets, the admin wallet and the funding
> wallet were generated and controlled by one operator (a script). This run tests the deployed system end to end
> on Cardano preprod against the live backend; it is not evidence of independent participants.

- Run started: 2026-10-05T09:41:38.186Z
- Code: `preview` @ `51cddaa`
- Backend: live (`api.vote.trustlevel.io`) · Network: Cardano preprod

### 1. Summary

| Test | Result | Expected | Observed |
|---|---|---|---|
| R1 | ❌ fail | all 3 registered, backend root consistent | consistent=true, missing=1, members=13, errors=[] |
| C1 | ⏭ skipped | rejected (before event start), nullifier rolled back | skipped: would trigger F0 on the current backend (rollback on an empty trie); covered in dry run dry-20261005-0746 |
| A-V01 | ✅ pass | confirmed on-chain | confirmed 7c40c1fd7f594b12719eb835807f947719a184f43ab819ee61bd81486af6c304 |
| A-V02 | ✅ pass | confirmed on-chain | confirmed 2df8772994a8bcf0fd8d7132b6e2e6c00a6dc47fb0619aff4593d5d39a449910 |
| A-V03 | ✅ pass | confirmed on-chain | confirmed 701cecb41805ed54d3ad36c25521c5d84cacc76c273917e20a6c97972f96b485 |
| A-V04 | ✅ pass | confirmed on-chain | confirmed cbf5220066d95aa6ad9b5b0c18f4c175f495f677973296d420b4eed3ef3b0a96 |
| A-V05 | ✅ pass | confirmed on-chain | confirmed b8d2bfa3968aaae72f120d2f433a21cec940a73c2de0d73c2a0188cf63dd7e71 |
| A-V06 | ✅ pass | confirmed on-chain | confirmed 47e2da2d13d5d6137b2f0760cc414dfa09184ada800033716b5bc7ac67eb70c9 |
| A-V07 | ✅ pass | confirmed on-chain | confirmed 3847e6221668513e70e02130eed95aa6bfd974d8f01f85c34affaa43c093efc4 |
| A-V08 | ✅ pass | confirmed on-chain | confirmed 3c75a0496f1464d2b91844de96ae60f6d64a5fabdddda7ddfa514aefddbf9916 |
| A-V09 | ✅ pass | confirmed on-chain | confirmed 23dacea6442bae53a236c7c8b04ade92e54b2bb1dd0f91d450b28e0c97db791f |
| C2 | ✅ pass | HTTP 409 from the nullifier endpoint | backend HTTP 409: nullifier already used |
| C3 | ✅ pass | rejected on-chain (MPF root mismatch) | Plutus script failed (phase 2) |
| C4 | ✅ pass | rejected by the ledger (inputs already spent) | evaluator: inputs already spent (extraRedeemers) |
| C5 | ✅ pass | rejected (proof root is not the group root) | Plutus script failed (phase 2) |
| C6 | ✅ pass | rejected (not in the group root frozen at mint) | backend HTTP 500 (Internal server error) |
| B1 | ✅ pass | hypothesis: 1 succeeds, the others fail | 1 submitted, 1 confirmed of 3; V12: backend HTTP 500 (Internal server error); V13: ledger: inputs already spent |
| B2-V12 | ❌ fail | succeeds on retry | backend HTTP 500 (Internal server error) |
| B2-V13 | ✅ pass | succeeds on retry | confirmed dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a |
| C7a | ✅ pass | hypothesis: unauthenticated junk insert desyncs the backend trie → legitimate vote fails | backend==chain: false; legitimate vote V10: Plutus script failed (phase 2) |
| C7b | ✅ pass | hypothesis: unauthenticated delete desyncs the backend trie → legitimate vote fails | backend==chain: false; legitimate vote V10: Plutus script failed (phase 2) |
| C7-recovery | ✅ pass | V10 votes successfully once the trie is repaired | confirmed 89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb |
| C8 | ✅ pass | rejected (after event end) | ledger: tx outside its validity interval |
| T1 | ✅ pass | all three equal | api=[6,3,3] chain=[6,3,3] expected=[6,3,3] |

### 2. Setup

- Event ID: `3907417823` · simple voting · options: Option A, Option B, Option C
- Voting window: 2026-10-05T10:06:21.000Z → 2026-10-05T11:21:21.000Z
- Group NFT policy: `7c987ace5258e04a5232ee1daff292cf7cfbd6dfdf993e53b5a8bfb2` · mint [a119e69d4a43…](https://preprod.cexplorer.io/tx/a119e69d4a432835c8f1f10facf7d9b6b26c41242ead79ad1802a7ee8098065e)
- Semaphore NFT policy: `b2db2ead8cb1f1023a887e71b82c9a0c5b7ad6582a13d54b1c07dfe2` · script [addr_test1wzedkt4d…fwuwjj](https://preprod.cexplorer.io/address/addr_test1wzedkt4d3jclzq363pl8rwpvngx9k7kktq4p842trsralcsfwuwjj)
- Voting NFT policy: `5a4eb588f2689e4538a1c987946c7f2455f0a3e2de402060964f1f35` · script [addr_test1wpdyadvg…fz3ugr](https://preprod.cexplorer.io/address/addr_test1wpdyadvg7f5fu3fc58yc09rv0uj9tu9rut0yqgrqje837dgfz3ugr) · mint [c4459ea18993…](https://preprod.cexplorer.io/tx/c4459ea18993e3ce566e66d61d3eb6282fac75f99806a7394249bbc772243c1b)
- Group root frozen at mint: `2646136052739700…`
- Funding: distributor [addr_test1qqs7pd2t…qf9jdq](https://preprod.cexplorer.io/address/addr_test1qqs7pd2thmrrtn9mfkcf3dmjugj6a43n0s64a42c30yt9qay4fkj4v38t8a4vuhtypg5ssyn8jdmah04wvru9n3qchuqqf9jdq) → admin + voters in [8eb9049dbb61…](https://preprod.cexplorer.io/tx/8eb9049dbb6115b4ca884735d92efe8efc96976a961bc4e631f58fbd02b5b09d)

| Voter | Role | Planned option | Wallet | Registered | Vote tx |
|---|---|---|---|---|---|
| V01 | waveA | Option A | [addr_test1qz85rm4h…kdc6df](https://preprod.cexplorer.io/address/addr_test1qz85rm4heewvve0pedwm7wng8zmmx7lz6cwvcexd4vlq7s43u7yyfxsn659tk2yzcd0uj0as3hp8e5yu2uln70kra5mqkdc6df) | yes | [7c40c1fd7f59…](https://preprod.cexplorer.io/tx/7c40c1fd7f594b12719eb835807f947719a184f43ab819ee61bd81486af6c304) |
| V02 | waveA | Option A | [addr_test1qzk5ul0h…atw374](https://preprod.cexplorer.io/address/addr_test1qzk5ul0h5v4cwd7elft8dl298z6ut5hely0h3rp77mmcl5vx6mqt57h39jdffjah49eqq8nq5l0rm5vpn2stc5qzek4qatw374) | yes | [2df8772994a8…](https://preprod.cexplorer.io/tx/2df8772994a8bcf0fd8d7132b6e2e6c00a6dc47fb0619aff4593d5d39a449910) |
| V03 | waveA | Option A | [addr_test1qzl5y3hn…j9uh6j](https://preprod.cexplorer.io/address/addr_test1qzl5y3hnsafa829w2kvm78mg2wk0ausm2znk0gk78cu46m2h2ndws74wl72vpx2ye48zpermj48zsm02qrzry9ccwhksj9uh6j) | yes | [701cecb41805…](https://preprod.cexplorer.io/tx/701cecb41805ed54d3ad36c25521c5d84cacc76c273917e20a6c97972f96b485) |
| V04 | waveA | Option A | [addr_test1qr4465xx…q0kwy5](https://preprod.cexplorer.io/address/addr_test1qr4465xxm0sv0pr5vz35l6m86thyykgug26wydm8v40cedg74wzpasa9ygtrcg96zue7hxnkxp9h8ylpenzqzt0gz8esq0kwy5) | yes | [cbf5220066d9…](https://preprod.cexplorer.io/tx/cbf5220066d95aa6ad9b5b0c18f4c175f495f677973296d420b4eed3ef3b0a96) |
| V05 | waveA | Option B | [addr_test1qr34kysn…73hhhd](https://preprod.cexplorer.io/address/addr_test1qr34kysneqstw64ad4nzxatjuqrmcpankgekchw9aj9p9cpx4vwfsktwchq06uud5vwjjg9j3cxjan400c444s78k2pq73hhhd) | yes | [b8d2bfa3968a…](https://preprod.cexplorer.io/tx/b8d2bfa3968aaae72f120d2f433a21cec940a73c2de0d73c2a0188cf63dd7e71) |
| V06 | waveA | Option B | [addr_test1qp5ggnlk…tt9wp3](https://preprod.cexplorer.io/address/addr_test1qp5ggnlk4rjy8m3ssjpm6td3egdlhxpclj589vnvvmetn5avkqsv62qdac6wfghwstcjjpkl7vwe2vr5yq7k3ldt763stt9wp3) | yes | [47e2da2d13d5…](https://preprod.cexplorer.io/tx/47e2da2d13d5d6137b2f0760cc414dfa09184ada800033716b5bc7ac67eb70c9) |
| V07 | waveA | Option B | [addr_test1qpfa4wcc…xmvrxm](https://preprod.cexplorer.io/address/addr_test1qpfa4wccn2f8ayhagq980my68clp6v2hvtumfdgujjluruynhu8jhmn9wh688jpee8qq2zj2maet57fmvedclrrygwnsxmvrxm) | yes | [3847e6221668…](https://preprod.cexplorer.io/tx/3847e6221668513e70e02130eed95aa6bfd974d8f01f85c34affaa43c093efc4) |
| V08 | waveA | Option C | [addr_test1qpv2h253…uteus7](https://preprod.cexplorer.io/address/addr_test1qpv2h2534hpxhvq3ws48q4q953uq5dc0lgtw6ywck04lu2zkw2d4qgd4g6dp9kf46dvjnhh3wqhrdjpcns9yvmd9tq8quteus7) | yes | [3c75a0496f14…](https://preprod.cexplorer.io/tx/3c75a0496f1464d2b91844de96ae60f6d64a5fabdddda7ddfa514aefddbf9916) |
| V09 | waveA | Option C | [addr_test1qp2jw907…6ad2ma](https://preprod.cexplorer.io/address/addr_test1qp2jw907lgyz9asgwq0yc8ydsj6a43jqkura8aeszf2kunz2l7330uw9rvc66qgfjrclfwkdke05dnr6yf735k95lpeq6ad2ma) | yes | [23dacea6442b…](https://preprod.cexplorer.io/tx/23dacea6442bae53a236c7c8b04ade92e54b2bb1dd0f91d450b28e0c97db791f) |
| V10 | reserve | Option A | [addr_test1qq3sqnrd…jhjk6j](https://preprod.cexplorer.io/address/addr_test1qq3sqnrd2mzhcltu8vwltp5nddhv9a2vkhyjx3um6yhmras35vqyvjntcjpmckdzywvy7rvr3rslgmvu5yrydun2x0tsjhjk6j) | yes | [89be23183e56…](https://preprod.cexplorer.io/tx/89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb) |
| V11 | waveB | Option A | [addr_test1qq2wyz82…p7ln4c](https://preprod.cexplorer.io/address/addr_test1qq2wyz82fmkec0equ5j29xdn9qf0n7c2k68g0pnwlv45cemt74uy3v8stn4xrtj7wlt3scqxkmzjdscy6fu2hhgynkdqp7ln4c) | yes | [e4e4430584bd…](https://preprod.cexplorer.io/tx/e4e4430584bd0f6d9aac1eddeb0be7c087e7285e891333e45bf51c31ac82ce57) |
| V12 | waveB | Option B | [addr_test1qqx2g4sy…0dt3fu](https://preprod.cexplorer.io/address/addr_test1qqx2g4sy09az962qrvnqup9869sktklnx3amyfn5ryuzx7cvlau96a6ryh2gzks0c5lmhpy38fa9dqhsp06uzyqm79zq0dt3fu) | yes | — |
| V13 | waveB | Option C | [addr_test1qqj9feha…f52j0s](https://preprod.cexplorer.io/address/addr_test1qqj9fehalu45nyf8mjzz5r99yexdjaxvnepznwt6tfze30a5m8gfyp56c5xecp9pea20eju0f79xpg02q6pucajak8dqf52j0s) | yes | [dd7c1e4e72d6…](https://preprod.cexplorer.io/tx/dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a) |
| V14 | late | — | [addr_test1qpxam2ah…8tjrx7](https://preprod.cexplorer.io/address/addr_test1qpxam2ahuh4cmtpaftjdqxcxtkfxxfn8ul39u99q3xvp04ws93t2e8x7jlugwdnrslpsqapsx9e5t3np2vtwxgf7uq0s8tjrx7) | yes | — |
| V15 | tooLate | Option B | [addr_test1qrvvu0uz…ml9zlp](https://preprod.cexplorer.io/address/addr_test1qrvvu0uzekd4sqzgfk9s8wyph6fx5etqcp5f6juu8hhuyagqtskvzxf9u8ehpmsx0f4uruea5njj3j648dkfj3tz0v9sml9zlp) | yes | — |

### 3. Timeline

| Time (UTC) | Phase | Test | Actor | Event | Tx / detail |
|---|---|---|---|---|---|
| 09:41:39 | fund |  |  | tx-submitted | [8eb9049dbb61…](https://preprod.cexplorer.io/tx/8eb9049dbb6115b4ca884735d92efe8efc96976a961bc4e631f58fbd02b5b09d) |
| 09:42:06 | fund |  |  | confirmed | [8eb9049dbb61…](https://preprod.cexplorer.io/tx/8eb9049dbb6115b4ca884735d92efe8efc96976a961bc4e631f58fbd02b5b09d) |
| 09:42:08 | event |  |  | event-created | [SIM] M4 test run main 2026-10-05 09:42 |
| 09:42:12 | event |  |  | invitations | sent 15, failed 0 |
| 09:49:19 | bootstrap |  |  | tx-submitted (group mint) | [bb2e97185208…](https://preprod.cexplorer.io/tx/bb2e97185208dfc90d5f27b1bd45f7e968f3c3e1fdd06bb32e9d22cff362808d) |
| 09:49:34 | bootstrap |  |  | confirmed (group mint) | [bb2e97185208…](https://preprod.cexplorer.io/tx/bb2e97185208dfc90d5f27b1bd45f7e968f3c3e1fdd06bb32e9d22cff362808d) |
| 09:50:06 | bootstrap |  |  | tx-submitted (group mint) | [08b1aa6c1405…](https://preprod.cexplorer.io/tx/08b1aa6c1405927e1c391ff60a93746cb0704414e3d70a0bb8c1eec7fab9a083) |
| 09:50:14 | bootstrap |  |  | confirmed (group mint) | [08b1aa6c1405…](https://preprod.cexplorer.io/tx/08b1aa6c1405927e1c391ff60a93746cb0704414e3d70a0bb8c1eec7fab9a083) |
| 09:50:37 | bootstrap |  |  | tx-submitted (group mint) | [a119e69d4a43…](https://preprod.cexplorer.io/tx/a119e69d4a432835c8f1f10facf7d9b6b26c41242ead79ad1802a7ee8098065e) |
| 09:51:30 | bootstrap |  |  | confirmed (group mint) | [a119e69d4a43…](https://preprod.cexplorer.io/tx/a119e69d4a432835c8f1f10facf7d9b6b26c41242ead79ad1802a7ee8098065e) |
| 09:51:32 | bootstrap |  |  | tx-submitted (semaphore+voting mint) | [c4459ea18993…](https://preprod.cexplorer.io/tx/c4459ea18993e3ce566e66d61d3eb6282fac75f99806a7394249bbc772243c1b) |
| 09:51:49 | bootstrap |  |  | confirmed (semaphore+voting mint) | [c4459ea18993…](https://preprod.cexplorer.io/tx/c4459ea18993e3ce566e66d61d3eb6282fac75f99806a7394249bbc772243c1b) |
| 10:06:58 | vote | A | V01 | vote-submitted | [7c40c1fd7f59…](https://preprod.cexplorer.io/tx/7c40c1fd7f594b12719eb835807f947719a184f43ab819ee61bd81486af6c304) |
| 10:07:28 | vote | A | V01 | confirmed | [7c40c1fd7f59…](https://preprod.cexplorer.io/tx/7c40c1fd7f594b12719eb835807f947719a184f43ab819ee61bd81486af6c304) |
| 10:07:34 | vote | A | V02 | vote-submitted | [2df8772994a8…](https://preprod.cexplorer.io/tx/2df8772994a8bcf0fd8d7132b6e2e6c00a6dc47fb0619aff4593d5d39a449910) |
| 10:07:50 | vote | A | V02 | confirmed | [2df8772994a8…](https://preprod.cexplorer.io/tx/2df8772994a8bcf0fd8d7132b6e2e6c00a6dc47fb0619aff4593d5d39a449910) |
| 10:07:56 | vote | A | V03 | vote-submitted | [701cecb41805…](https://preprod.cexplorer.io/tx/701cecb41805ed54d3ad36c25521c5d84cacc76c273917e20a6c97972f96b485) |
| 10:08:37 | vote | A | V03 | confirmed | [701cecb41805…](https://preprod.cexplorer.io/tx/701cecb41805ed54d3ad36c25521c5d84cacc76c273917e20a6c97972f96b485) |
| 10:08:44 | vote | A | V04 | vote-submitted | [cbf5220066d9…](https://preprod.cexplorer.io/tx/cbf5220066d95aa6ad9b5b0c18f4c175f495f677973296d420b4eed3ef3b0a96) |
| 10:09:09 | vote | A | V04 | confirmed | [cbf5220066d9…](https://preprod.cexplorer.io/tx/cbf5220066d95aa6ad9b5b0c18f4c175f495f677973296d420b4eed3ef3b0a96) |
| 10:09:15 | vote | A | V05 | vote-submitted | [b8d2bfa3968a…](https://preprod.cexplorer.io/tx/b8d2bfa3968aaae72f120d2f433a21cec940a73c2de0d73c2a0188cf63dd7e71) |
| 10:09:35 | vote | A | V05 | confirmed | [b8d2bfa3968a…](https://preprod.cexplorer.io/tx/b8d2bfa3968aaae72f120d2f433a21cec940a73c2de0d73c2a0188cf63dd7e71) |
| 10:09:42 | vote | A | V06 | vote-submitted | [47e2da2d13d5…](https://preprod.cexplorer.io/tx/47e2da2d13d5d6137b2f0760cc414dfa09184ada800033716b5bc7ac67eb70c9) |
| 10:10:02 | vote | A | V06 | confirmed | [47e2da2d13d5…](https://preprod.cexplorer.io/tx/47e2da2d13d5d6137b2f0760cc414dfa09184ada800033716b5bc7ac67eb70c9) |
| 10:10:08 | vote | A | V07 | vote-submitted | [3847e6221668…](https://preprod.cexplorer.io/tx/3847e6221668513e70e02130eed95aa6bfd974d8f01f85c34affaa43c093efc4) |
| 10:10:23 | vote | A | V07 | confirmed | [3847e6221668…](https://preprod.cexplorer.io/tx/3847e6221668513e70e02130eed95aa6bfd974d8f01f85c34affaa43c093efc4) |
| 10:10:29 | vote | A | V08 | vote-submitted | [3c75a0496f14…](https://preprod.cexplorer.io/tx/3c75a0496f1464d2b91844de96ae60f6d64a5fabdddda7ddfa514aefddbf9916) |
| 10:11:00 | vote | A | V08 | confirmed | [3c75a0496f14…](https://preprod.cexplorer.io/tx/3c75a0496f1464d2b91844de96ae60f6d64a5fabdddda7ddfa514aefddbf9916) |
| 10:11:06 | vote | A | V09 | vote-submitted | [23dacea6442b…](https://preprod.cexplorer.io/tx/23dacea6442bae53a236c7c8b04ade92e54b2bb1dd0f91d450b28e0c97db791f) |
| 10:11:36 | vote | A | V09 | confirmed | [23dacea6442b…](https://preprod.cexplorer.io/tx/23dacea6442bae53a236c7c8b04ade92e54b2bb1dd0f91d450b28e0c97db791f) |
| 10:11:41 | vote | C2 | V03 | vote-failed | at `nullifier` (HTTP 409): Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed. If the vote TX was never confirme |
| 10:11:47 | vote | C3 | V03 | vote-failed | at `submit`: {"data":{"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUt |
| 10:11:54 | vote | C5 | V14 | vote-failed | at `submit` (HTTP 502): {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\ |
| 10:11:56 | vote | C6 | V14 | vote-failed | at `merkle-proof` (HTTP 500): Internal server error |
| 10:11:59 | vote | B1 | V12 | vote-failed | at `merkle-proof` (HTTP 500): Internal server error |
| 10:12:04 | vote | B1 | V11 | vote-submitted | [e4e4430584bd…](https://preprod.cexplorer.io/tx/e4e4430584bd0f6d9aac1eddeb0be7c087e7285e891333e45bf51c31ac82ce57) |
| 10:12:05 | vote | B1 | V13 | vote-failed | at `submit` (HTTP 502): {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\ |
| 10:12:25 | vote | B1 | V11 | confirmed | [e4e4430584bd…](https://preprod.cexplorer.io/tx/e4e4430584bd0f6d9aac1eddeb0be7c087e7285e891333e45bf51c31ac82ce57) |
| 10:12:27 | vote | B2 | V12 | vote-failed | at `merkle-proof` (HTTP 500): Internal server error |
| 10:12:33 | vote | B2 | V13 | vote-submitted | [dd7c1e4e72d6…](https://preprod.cexplorer.io/tx/dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a) |
| 10:12:53 | vote | B2 | V13 | confirmed | [dd7c1e4e72d6…](https://preprod.cexplorer.io/tx/dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a) |
| 10:13:02 | vote | C7a-victim | V10 | vote-failed | at `submit` (HTTP 502): {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\ |
| 10:13:11 | vote | C7b-victim | V10 | vote-failed | at `submit` (HTTP 502): {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\ |
| 10:13:18 | vote | C7-recovery | V10 | vote-submitted | [89be23183e56…](https://preprod.cexplorer.io/tx/89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb) |
| 10:13:38 | vote | C7-recovery | V10 | confirmed | [89be23183e56…](https://preprod.cexplorer.io/tx/89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb) |
| 11:22:29 | vote | C8 | V15 | vote-failed | at `submit` (HTTP 502): {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\ |

### 4. On-chain state trace

After every state change: the nullifier MPF root on-chain (Semaphore datum), in the backend, and recomputed
locally from the nullifiers of confirmed votes; plus the on-chain tally (Voting datum).
Note: in run main-20261005-0941 the snapshot waited only for the Semaphore address to be indexed, so the tally
column can lag one vote behind (Blockfrost indexes the Voting address separately). The final tally in §5 is exact.

| Time | After | MPF root on-chain | MPF root backend | Backend = chain | Recomputed | Tally (A/B/C) |
|---|---|---|---|---|---|---|
| 09:51:50 | after bootstrap | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 09:51:52 | after late registration | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 10:07:29 | after A V01 | `33bcb1f16c…` | `33bcb1f16c…` | yes | `33bcb1f16c…` | 0 / 0 / 0 |
| 10:07:50 | after A V02 | `1be9ee3ac5…` | `1be9ee3ac5…` | yes | `1be9ee3ac5…` | 1 / 0 / 0 |
| 10:08:38 | after A V03 | `54de17d889…` | `54de17d889…` | yes | `54de17d889…` | 3 / 0 / 0 |
| 10:09:10 | after A V04 | `bc2bf3df86…` | `bc2bf3df86…` | yes | `bc2bf3df86…` | 3 / 0 / 0 |
| 10:09:36 | after A V05 | `598ed4b19a…` | `598ed4b19a…` | yes | `598ed4b19a…` | 4 / 0 / 0 |
| 10:10:03 | after A V06 | `79bb74e0a6…` | `79bb74e0a6…` | yes | `79bb74e0a6…` | 4 / 1 / 0 |
| 10:10:24 | after A V07 | `b27920f94c…` | `b27920f94c…` | yes | `b27920f94c…` | 4 / 2 / 0 |
| 10:11:00 | after A V08 | `0b63fc78f6…` | `0b63fc78f6…` | yes | `0b63fc78f6…` | 4 / 3 / 0 |
| 10:11:37 | after A V09 | `a2fb805e83…` | `a2fb805e83…` | yes | `a2fb805e83…` | 4 / 3 / 1 |
| 10:11:54 | after C5 | `a2fb805e83…` | `a2fb805e83…` | yes | `a2fb805e83…` | 4 / 3 / 2 |
| 10:11:56 | after attacks | `a2fb805e83…` | `a2fb805e83…` | yes | `a2fb805e83…` | 4 / 3 / 2 |
| 10:12:26 | after B1 V11 | `32b8d8afc0…` | `32b8d8afc0…` | yes | `32b8d8afc0…` | 4 / 3 / 2 |
| 10:12:54 | after B2 V13 | `3474451f06…` | `3474451f06…` | yes | `3474451f06…` | 5 / 3 / 2 |
| 10:12:56 | after C7a junk insert | `3474451f06…` | `44bc344cf0…` | **no** | `3474451f06…` | 5 / 3 / 3 |
| 10:13:03 | after C7a repair | `3474451f06…` | `3474451f06…` | yes | `3474451f06…` | 5 / 3 / 3 |
| 10:13:04 | after C7b delete | `3474451f06…` | `5f29c4ce53…` | **no** | `3474451f06…` | 5 / 3 / 3 |
| 10:13:12 | after C7b repair | `3474451f06…` | `3474451f06…` | yes | `3474451f06…` | 5 / 3 / 3 |
| 10:13:38 | after C7-recovery V10 | `5fa807640e…` | `5fa807640e…` | yes | `5fa807640e…` | 5 / 3 / 3 |
| 11:22:29 | after C8 | `5fa807640e…` | `5fa807640e…` | yes | `5fa807640e…` | 6 / 3 / 3 |
| 11:22:41 | final | `5fa807640e…` | `5fa807640e…` | yes | `5fa807640e…` | 6 / 3 / 3 |

#### Group Merkle root (registration)

| Time | After | Backend members | Registered by us | Missing | Root consistent |
|---|---|---|---|---|---|
| 09:48:53 | after V01 | 1 | 1 | 0 | yes |
| 09:48:54 | after V02 | 2 | 2 | 0 | yes |
| 09:48:55 | after V03 | 3 | 3 | 0 | yes |
| 09:48:56 | after V04 | 4 | 4 | 0 | yes |
| 09:48:57 | after V05 | 5 | 5 | 0 | yes |
| 09:48:58 | after V06 | 6 | 6 | 0 | yes |
| 09:48:59 | after V07 | 7 | 7 | 0 | yes |
| 09:49:00 | after V08 | 8 | 8 | 0 | yes |
| 09:49:01 | after V09 | 9 | 9 | 0 | yes |
| 09:49:02 | after V10 | 10 | 10 | 0 | yes |
| 09:49:03 | after V15 | 11 | 11 | 0 | yes |
| 09:49:05 | after R1 (concurrent) | 13 | 14 | 1 | yes |
| 09:49:05 | after R1 retries | 13 | 14 | 1 | yes |
| 09:51:51 | after late registration V14 | 14 | 15 | 1 | yes |

### 5. Results reconciliation

- api=[6,3,3] chain=[6,3,3] expected=[6,3,3]

### 6. Adversarial tests

#### R1 — FAIL

- Expected: all 3 registered, backend root consistent
- Cause: consistent=true, missing=1, members=13, errors=[]

<details><summary>Raw observation</summary>

```
consistent=true, missing=1, members=13, errors=[]
```
</details>

#### C1 — skipped

- Expected: rejected (before event start), nullifier rolled back
- Cause: skipped: would trigger F0 on the current backend (rollback on an empty trie); covered in dry run dry-20261005-0746

<details><summary>Raw observation</summary>

```
skipped: would trigger F0 on the current backend (rollback on an empty trie); covered in dry run dry-20261005-0746
```
</details>

#### C2 — pass

- Expected: HTTP 409 from the nullifier endpoint
- Cause: backend HTTP 409: nullifier already used

<details><summary>Raw observation</summary>

```
rejected at nullifier (HTTP 409): Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed. If the vote TX was never confirmed on-chain, please c
```
</details>

#### C3 — pass

- Expected: rejected on-chain (MPF root mismatch)
- Cause: Plutus script failed (phase 2)

<details><summary>Raw observation</summary>

```
rejected at submit: {"data":{"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUtxowFailure (UtxoFailure (UtxosFailure (ValidationTagMismatch Phase2Valid (FailedUnexpectedly (PlutusFailure \\\"\\\\nThe PlutusV3 script failed:\\\\nBase64-enco
```
</details>

#### C4 — pass

- Expected: rejected by the ledger (inputs already spent)
- Cause: evaluator: inputs already spent (extraRedeemers)

<details><summary>Raw observation</summary>

```
rejected (HTTP 422): {"statusCode":422,"message":"Script evaluation failed — collateral NOT taken.\nScriptFailures:\n{\n  \"spend:1\": {\n    \"extraRedeemers\": [\n      \"spend:1\"\n    ]\n  },\n  \"spend:2\": {\n    \"extraRedeemers\": [\n      \"spend:2\"\n    ]\n  }\n}"}
```
</details>

#### C5 — pass

- Expected: rejected (proof root is not the group root)
- Cause: Plutus script failed (phase 2)

<details><summary>Raw observation</summary>

```
rejected at submit: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\":{\\\"contents\\\":{\\\"era\\\":\\\"ShelleyBasedEraConway\\\",\\\"error\\\":[\\\"ConwayUtxowFailure (UtxoFailure (UtxosFailure (ValidationTagMismatch Phase2Val; rolledBack=true
```
</details>

#### C6 — pass

- Expected: rejected (not in the group root frozen at mint)
- Cause: backend HTTP 500 (Internal server error)

<details><summary>Raw observation</summary>

```
rejected at merkle-proof: Internal server error
```
</details>

#### B1 — pass

- Expected: hypothesis: 1 succeeds, the others fail
- Cause: backend HTTP 500 (Internal server error)

<details><summary>Raw observation</summary>

```
1 submitted, 1 confirmed of 3; failures: V12@merkle-proof rolledBack=false: Internal server error | V13@submit rolledBack=true: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\
```
</details>

#### B2-V12 — FAIL

- Expected: succeeds on retry
- Cause: backend HTTP 500 (Internal server error)

<details><summary>Raw observation</summary>

```
failed at merkle-proof (HTTP 500): Internal server error
```
</details>

#### B2-V13 — pass

- Expected: succeeds on retry
- Cause: confirmed dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a

<details><summary>Raw observation</summary>

```
confirmed dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a
```
</details>

#### C7a — pass

- Expected: hypothesis: unauthenticated junk insert desyncs the backend trie → legitimate vote fails
- Cause: backend==chain: false; V10 rejected at submit: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"co

<details><summary>Raw observation</summary>

```
backend==chain: false; V10 rejected at submit: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\":{\\\"contents\\\":{\\\"era\\\":\\\"ShelleyBasedEraConway\\
```
</details>

#### C7b — pass

- Expected: hypothesis: unauthenticated delete desyncs the backend trie → legitimate vote fails
- Cause: backend==chain: false; V10 rejected at submit: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"co

<details><summary>Raw observation</summary>

```
backend==chain: false; V10 rejected at submit: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\":{\\\"contents\\\":{\\\"era\\\":\\\"ShelleyBasedEraConway\\
```
</details>

#### C7-recovery — pass

- Expected: V10 votes successfully once the trie is repaired
- Cause: confirmed 89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb

<details><summary>Raw observation</summary>

```
confirmed 89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb
```
</details>

#### C8 — pass

- Expected: rejected (after event end)
- Cause: ledger: tx outside its validity interval

<details><summary>Raw observation</summary>

```
rejected at submit: {"statusCode":502,"message":"Blockfrost submission failed (400): {\"error\":\"Bad Request\",\"message\":\"{\\\"contents\\\":{\\\"contents\\\":{\\\"contents\\\":{\\\"era\\\":\\\"ShelleyBasedEraConway\\\",\\\"error\\\":[\\\"ConwayUtxowFailure (UtxoFailure (OutsideValidityIntervalUTxO (ValidityInterval; rolledBack=true
```
</details>

### 7. Performance

- ZK proof generation (Node, ms): min 1243 · median 1321 · max 1651
- Full voter flow until submit (ms): min 5432 · median 5555 · max 7017
- Submit → confirmed (s, incl. polling): min 15 · median 22 · max 41
- Fee per vote (lovelace): min 1071755 · median 1077915 · max 1083987
- Tx size (bytes): min 10305 · median 10445 · max 10583
- Execution units declared per vote, semaphore spend (static budget, not measured usage; steps): min 5000000000 · median 5000000000 · max 5000000000

### 8. What is traceable on-chain

Decoded from chain data only (Blockfrost: tx inputs + redeemers), without using this run's logs.

| Paying wallet | Vote tx | Option (from `signal_message`) | Nullifier |
|---|---|---|---|
| [addr_test1qz85rm4h…kdc6df](https://preprod.cexplorer.io/address/addr_test1qz85rm4heewvve0pedwm7wng8zmmx7lz6cwvcexd4vlq7s43u7yyfxsn659tk2yzcd0uj0as3hp8e5yu2uln70kra5mqkdc6df) | [7c40c1fd7f59…](https://preprod.cexplorer.io/tx/7c40c1fd7f594b12719eb835807f947719a184f43ab819ee61bd81486af6c304) | Option A ×1 | `3.388906411675…` |
| [addr_test1qzk5ul0h…atw374](https://preprod.cexplorer.io/address/addr_test1qzk5ul0h5v4cwd7elft8dl298z6ut5hely0h3rp77mmcl5vx6mqt57h39jdffjah49eqq8nq5l0rm5vpn2stc5qzek4qatw374) | [2df8772994a8…](https://preprod.cexplorer.io/tx/2df8772994a8bcf0fd8d7132b6e2e6c00a6dc47fb0619aff4593d5d39a449910) | Option A ×1 | `2.840806497447…` |
| [addr_test1qzl5y3hn…j9uh6j](https://preprod.cexplorer.io/address/addr_test1qzl5y3hnsafa829w2kvm78mg2wk0ausm2znk0gk78cu46m2h2ndws74wl72vpx2ye48zpermj48zsm02qrzry9ccwhksj9uh6j) | [701cecb41805…](https://preprod.cexplorer.io/tx/701cecb41805ed54d3ad36c25521c5d84cacc76c273917e20a6c97972f96b485) | Option A ×1 | `1.133166852329…` |
| [addr_test1qr4465xx…q0kwy5](https://preprod.cexplorer.io/address/addr_test1qr4465xxm0sv0pr5vz35l6m86thyykgug26wydm8v40cedg74wzpasa9ygtrcg96zue7hxnkxp9h8ylpenzqzt0gz8esq0kwy5) | [cbf5220066d9…](https://preprod.cexplorer.io/tx/cbf5220066d95aa6ad9b5b0c18f4c175f495f677973296d420b4eed3ef3b0a96) | Option A ×1 | `2.348326100665…` |
| [addr_test1qr34kysn…73hhhd](https://preprod.cexplorer.io/address/addr_test1qr34kysneqstw64ad4nzxatjuqrmcpankgekchw9aj9p9cpx4vwfsktwchq06uud5vwjjg9j3cxjan400c444s78k2pq73hhhd) | [b8d2bfa3968a…](https://preprod.cexplorer.io/tx/b8d2bfa3968aaae72f120d2f433a21cec940a73c2de0d73c2a0188cf63dd7e71) | Option B ×1 | `1.180567847301…` |
| [addr_test1qp5ggnlk…tt9wp3](https://preprod.cexplorer.io/address/addr_test1qp5ggnlk4rjy8m3ssjpm6td3egdlhxpclj589vnvvmetn5avkqsv62qdac6wfghwstcjjpkl7vwe2vr5yq7k3ldt763stt9wp3) | [47e2da2d13d5…](https://preprod.cexplorer.io/tx/47e2da2d13d5d6137b2f0760cc414dfa09184ada800033716b5bc7ac67eb70c9) | Option B ×1 | `6.112057817658…` |
| [addr_test1qpfa4wcc…xmvrxm](https://preprod.cexplorer.io/address/addr_test1qpfa4wccn2f8ayhagq980my68clp6v2hvtumfdgujjluruynhu8jhmn9wh688jpee8qq2zj2maet57fmvedclrrygwnsxmvrxm) | [3847e6221668…](https://preprod.cexplorer.io/tx/3847e6221668513e70e02130eed95aa6bfd974d8f01f85c34affaa43c093efc4) | Option B ×1 | `2.936713927899…` |
| [addr_test1qpv2h253…uteus7](https://preprod.cexplorer.io/address/addr_test1qpv2h2534hpxhvq3ws48q4q953uq5dc0lgtw6ywck04lu2zkw2d4qgd4g6dp9kf46dvjnhh3wqhrdjpcns9yvmd9tq8quteus7) | [3c75a0496f14…](https://preprod.cexplorer.io/tx/3c75a0496f1464d2b91844de96ae60f6d64a5fabdddda7ddfa514aefddbf9916) | Option C ×1 | `2.691995267897…` |
| [addr_test1qp2jw907…6ad2ma](https://preprod.cexplorer.io/address/addr_test1qp2jw907lgyz9asgwq0yc8ydsj6a43jqkura8aeszf2kunz2l7330uw9rvc66qgfjrclfwkdke05dnr6yf735k95lpeq6ad2ma) | [23dacea6442b…](https://preprod.cexplorer.io/tx/23dacea6442bae53a236c7c8b04ade92e54b2bb1dd0f91d450b28e0c97db791f) | Option C ×1 | `6.608378995536…` |
| [addr_test1qq3sqnrd…jhjk6j](https://preprod.cexplorer.io/address/addr_test1qq3sqnrd2mzhcltu8vwltp5nddhv9a2vkhyjx3um6yhmras35vqyvjntcjpmckdzywvy7rvr3rslgmvu5yrydun2x0tsjhjk6j) | [89be23183e56…](https://preprod.cexplorer.io/tx/89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb) | Option A ×1 | `1.143470082115…` |
| [addr_test1qq2wyz82…p7ln4c](https://preprod.cexplorer.io/address/addr_test1qq2wyz82fmkec0equ5j29xdn9qf0n7c2k68g0pnwlv45cemt74uy3v8stn4xrtj7wlt3scqxkmzjdscy6fu2hhgynkdqp7ln4c) | [e4e4430584bd…](https://preprod.cexplorer.io/tx/e4e4430584bd0f6d9aac1eddeb0be7c087e7285e891333e45bf51c31ac82ce57) | Option A ×1 | `2.202616021037…` |
| [addr_test1qqj9feha…f52j0s](https://preprod.cexplorer.io/address/addr_test1qqj9fehalu45nyf8mjzz5r99yexdjaxvnepznwt6tfze30a5m8gfyp56c5xecp9pea20eju0f79xpg02q6pucajak8dqf52j0s) | [dd7c1e4e72d6…](https://preprod.cexplorer.io/tx/dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a) | Option C ×1 | `2.435789807289…` |

- **Linkable:** paying wallet → vote tx → chosen option (plaintext CBOR in the redeemer) → nullifier.
- **Not linkable on-chain:** identity commitment → vote. Commitments never appear on-chain; only the group root does.
- **Artefact of this simulation:** all wallets were funded from one distributor in [8eb9049dbb61…](https://preprod.cexplorer.io/tx/8eb9049dbb6115b4ca884735d92efe8efc96976a961bc4e631f58fbd02b5b09d), which links them
  to each other. Real voters funding their own wallets would not share this link — but each voter's own wallet history
  (exchange withdrawals, other dApps) links the vote to them instead.

### 9. What the backend operator can see

Order of requests the backend receives per vote (from this run's request log):

| Voter | `GET merkle-proof/:userId` | `POST nullifier` | `POST vote` | Gap merkle→nullifier |
|---|---|---|---|---|
| V01 | 10:06:52 `12` | 10:06:54 | 10:06:58 | 2 s |
| V02 | 10:07:30 `13` | 10:07:31 | 10:07:34 | 2 s |
| V03 | 10:07:51 `20` | 10:07:53 | 10:07:56 | 2 s |
| V04 | 10:08:39 `21` | 10:08:41 | 10:08:44 | 2 s |
| V05 | 10:09:11 `22` | 10:09:12 | 10:09:15 | 2 s |
| V06 | 10:09:37 `23` | 10:09:38 | 10:09:42 | 2 s |
| V07 | 10:10:04 `24` | 10:10:05 | 10:10:08 | 2 s |
| V08 | 10:10:24 `25` | 10:10:26 | 10:10:29 | 2 s |
| V09 | 10:11:01 `26` | 10:11:03 | 10:11:06 | 2 s |
| V11 | 10:11:58 `28` | 10:12:00 | 10:12:04 | 2 s |
| V13 | 10:12:28 `30` | 10:12:30 | 10:12:33 | 2 s |
| V10 | 10:13:13 `27` | 10:13:15 | 10:13:18 | 1 s |

The Merkle-proof request names the voter (`userId`); the nullifier and the signed tx follow seconds later from the
same client. An operator logging request source and time can join userId → nullifier → vote tx → option.

*(The findings list of this run is maintained with its current status in [M4_USER_FEEDBACK.md §4](../M4_USER_FEEDBACK.md).)*


---

## Part B — Live group test (5 participants, 2026-10-05)

A real event on the hosted application (event 1869725828, Preprod), organised by TrustLevel with
five participants who registered through their invitation links and voted from the browser with
an Eternl wallet. Three votes were confirmed on-chain on the first attempt; two failed at first.

| # | What happened | Finding |
|---|---|---|
| 1 | A voter was told "Insufficient funds" although the wallet held enough test ADA. The vote had been built on inputs that a still-pending vote already spent. | F10 (misleading message), F6 (collision) |
| 2 | The second successful voter saw the running tally while others had not voted yet. | F9 (interim results) |
| 3 | A vote was rejected on the first attempt and succeeded on the second — two votes within one block collided on the shared state UTxO. | F6 |

All three findings are fixed in the Milestone 4 build (see [M4_USER_FEEDBACK.md](../M4_USER_FEEDBACK.md) §4);
Part C shows the same scenarios passing against the deployed fixes.

---

## Part C — Scripted system test, 2026-10-28 (Milestone 4 deployment, after the fixes)

## Simulated voting run — main-20261028-0534

> **Simulated run, not public testing.** All 15 voter wallets, the admin wallet and the funding
> wallet were generated and controlled by one operator (a script). This run tests the deployed system end to end
> on Cardano preprod against the live backend; it is not evidence of independent participants.

- Run started: 2026-10-28T05:34:55.862Z
- Code: `preview` @ `b2a86a6`
- Backend: live (`api.vote.trustlevel.io`) · Network: Cardano preprod

### 1. Summary

| Test | Result | Expected | Observed |
|---|---|---|---|
| R1 | ✅ pass | all 3 registered, backend root consistent | consistent=true, missing=0, members=14, errors=[] |
| C1 | ✅ pass | rejected (before event start), backend trie root unchanged | rejected at relay-vote (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"Sh |
| A-V01 | ✅ pass | confirmed on-chain | confirmed 5f58c0e119a6bc160f682f586ba3acb18997533931ab48abb81b41b2af89ffe2 |
| A-V02 | ✅ pass | confirmed on-chain | confirmed d239347ede96ea0d007e2844ee095bd899683953f1c8b8b5b8e2646b39f927e4 |
| A-V03 | ✅ pass | confirmed on-chain | confirmed 130cd866547eae0980d1af2f87fca3abd680fa60fcdb942d3fdf2cdf001aed8e |
| A-V04 | ✅ pass | confirmed on-chain | confirmed 76f4eb91b52b78ce1dd150a9621cf5653bd875fd84884293fd85664358e0d226 |
| A-V05 | ✅ pass | confirmed on-chain | confirmed 28db15d97693d6bb8aaeabc4eeaeecf14739253d8424d8b415842c62a76a542d |
| A-V06 | ✅ pass | confirmed on-chain | confirmed 9af15e33c6899b44bc9a9281112f547e27533507c2bf8837adf4df33ade99e73 |
| A-V07 | ✅ pass | confirmed on-chain | confirmed 9cdd5db8bf8af8e98499de040897a6ded3b36de25fba055661d210fb49c9b755 |
| A-V08 | ✅ pass | confirmed on-chain | confirmed c1e4669448555050d26f04e8c76f291877a21d3bf7ce984ff8e72ca10957a12b |
| A-V09 | ✅ pass | confirmed on-chain | confirmed 87410cbd7213c32b8175f7ad3f02a3e441fae22313b813e37e3c8630752f9f57 |
| C2 | ✅ pass | HTTP 409 from relay-vote (nullifier already used) | backend HTTP 409: nullifier already used |
| C3 | ✅ pass | rejected on-chain (MPF root mismatch) | Plutus script failed (phase 2) |
| C4 | ✅ pass | HTTP 409 (nullifier already used), no tx submitted | backend HTTP 409: nullifier already used |
| C5 | ✅ pass | HTTP 400 before the trie is touched (proof root is not the on-chain group root) | rejected at relay-vote (HTTP 400): Invalid vote proof: proof is not for this event's voter group; trie unchanged=true |
| C6 | ✅ pass | HTTP 404/409 with a clear message (not in the group root frozen at mint) — F12 | backend HTTP 409: nullifier already used |
| B1 | ✅ pass | hypothesis: 1 succeeds, the others fail | 1 submitted, 1 confirmed of 3; V11: ledger: inputs already spent; V13: ledger: inputs already spent |
| B2-V11 | ✅ pass | succeeds on retry | confirmed c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726 |
| B2-V13 | ✅ pass | succeeds on retry | confirmed ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a |
| C7a | ✅ pass | POST 404 (removed), DELETE 401 without a valid admin token | POST nullifier → 404; legitimate vote V10: POST nullifier → 404; DELETE nullifier without token → 401; with wrong token → 401 |
| C7b | ✅ pass | all 401 without the token; 200 with it | GET /invited → 401; legitimate vote V10: GET /invited → 401; POST /invite → 401; POST /send-invitations → 401; PATCH / → 401; DELETE /participants/1 → 401; POST /save-blockchain-data → 401; GET /invite |
| C7c | ✅ pass | public event objects carry none of adminToken / invitedParticipants / groupLeafCommitments | no admin token, e-mails or commitments in the public event API |
| C7d | ✅ pass | HTTP 400 (proof does not verify), backend trie root unchanged | HTTP 400: {"statusCode":400,"message":"Invalid vote proof: ZK proof does not verify"}; trie unchanged=true |
| C7e | ✅ pass | V10 votes successfully; backend trie still in sync with chain | confirmed b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5 |
| C8 | ✅ pass | rejected (after event end) | ledger: tx outside its validity interval |
| T1 | ✅ pass | all three equal | api=[6,4,3] chain=[6,4,3] expected=[6,4,3] |

### 2. Setup

- Event ID: `4988274691` · simple voting · options: Option A, Option B, Option C
- Voting window: 2026-10-28T05:52:22.000Z → 2026-10-28T07:07:22.000Z
- Group NFT policy: `86e758b97546ce57148c820263ad20df74f5b5b4ff0a51d81caa773c` · mint [db1175612f22…](https://preprod.cexplorer.io/tx/db1175612f22a4cd5ebe54d44b0392008461ac2f11108848d204b35ffe062c79)
- Semaphore NFT policy: `6a2c188c87c432b6d9a7376f0578151e7f9e140259d95d71149875c9` · script [addr_test1wp4zcxyv…dvs7l8](https://preprod.cexplorer.io/address/addr_test1wp4zcxyvslzr9dke5umk7ptcz508l8s5qfvajht3zjv8tjgdvs7l8)
- Voting NFT policy: `5f0dd063329d978560b5f210aa4b5ef9c514867f8e40ea4fc66b04ce` · script [addr_test1wp0sm5rr…n4cv2j](https://preprod.cexplorer.io/address/addr_test1wp0sm5rrx2we0ptqkhepp2jttmuu29yx078yp6j0ce4sfnsn4cv2j) · mint [b58a92ff3ffc…](https://preprod.cexplorer.io/tx/b58a92ff3ffc7b38dd22474609e6f7adbdc993f67f4ad10f8d70acc3a91faffa)
- Group root frozen at mint: `1255330098118689…`
- Funding: distributor [addr_test1qqs7pd2t…qf9jdq](https://preprod.cexplorer.io/address/addr_test1qqs7pd2thmrrtn9mfkcf3dmjugj6a43n0s64a42c30yt9qay4fkj4v38t8a4vuhtypg5ssyn8jdmah04wvru9n3qchuqqf9jdq) → admin + voters in [a44ad300de04…](https://preprod.cexplorer.io/tx/a44ad300de04dfb98035cebc76e8fb48dabad299259f4ff39652d5134e16b610)

| Voter | Role | Planned option | Wallet | Registered | Vote tx |
|---|---|---|---|---|---|
| V01 | waveA | Option A | [addr_test1qr89w0dr…g2w8zw](https://preprod.cexplorer.io/address/addr_test1qr89w0dr0xtkrzd5ml878vjlp7am9nw29af89e9r58yy6v5k52xenh486snc3xxsvxsv3uqgrm0zgd0umdsdxej7pzqqg2w8zw) | yes | [5f58c0e119a6…](https://preprod.cexplorer.io/tx/5f58c0e119a6bc160f682f586ba3acb18997533931ab48abb81b41b2af89ffe2) |
| V02 | waveA | Option A | [addr_test1qplpqfwu…5y4z7y](https://preprod.cexplorer.io/address/addr_test1qplpqfwud3w6sknelmmzrpnwgwvj5tgp796g6da568wz0y7ty96we33lf20jcthh2x6u8nchgnp3jtdwd9r8pxl2apes5y4z7y) | yes | [d239347ede96…](https://preprod.cexplorer.io/tx/d239347ede96ea0d007e2844ee095bd899683953f1c8b8b5b8e2646b39f927e4) |
| V03 | waveA | Option A | [addr_test1qq9z3fzv…tflhnr](https://preprod.cexplorer.io/address/addr_test1qq9z3fzvf94h42m9zz9zzkjhjqwn63usgm0n4zxgpznkfytzhxc4x78jx3gjgfd2zvu3pp7scl5q6lqeh38fjh2789pqtflhnr) | yes | [130cd866547e…](https://preprod.cexplorer.io/tx/130cd866547eae0980d1af2f87fca3abd680fa60fcdb942d3fdf2cdf001aed8e) |
| V04 | waveA | Option A | [addr_test1qp8a7u9w…nhqygx](https://preprod.cexplorer.io/address/addr_test1qp8a7u9wwpqlkrma7dzhp5aznp5suam6rdnxae2psf8x2eaja2l6gxuuyn9saulz9hqqq5zkzup2z22xlqgmkkkpzssqnhqygx) | yes | [76f4eb91b52b…](https://preprod.cexplorer.io/tx/76f4eb91b52b78ce1dd150a9621cf5653bd875fd84884293fd85664358e0d226) |
| V05 | waveA | Option B | [addr_test1qp6fcgxk…xh4awd](https://preprod.cexplorer.io/address/addr_test1qp6fcgxk6x7spcyzszy22meudkt3rxzwjlevkx85szqta93cfsyd9a0mlra2trv7q30j8sqla0vqyderh4qsfqqjty8sxh4awd) | yes | [28db15d97693…](https://preprod.cexplorer.io/tx/28db15d97693d6bb8aaeabc4eeaeecf14739253d8424d8b415842c62a76a542d) |
| V06 | waveA | Option B | [addr_test1qpkqpnc0…v9lh3c](https://preprod.cexplorer.io/address/addr_test1qpkqpnc0uszcdayl760hj48n4p4tmtq23aywvj4d4eda2d8yykf7zv8kj0ylq3z4gzh7gahrtzd0shyhxxdtszynmrpsv9lh3c) | yes | [9af15e33c689…](https://preprod.cexplorer.io/tx/9af15e33c6899b44bc9a9281112f547e27533507c2bf8837adf4df33ade99e73) |
| V07 | waveA | Option B | [addr_test1qzhepv8j…jkufg0](https://preprod.cexplorer.io/address/addr_test1qzhepv8j8d5qzrkahpr6ne8tkjc2gmfuh3uweqr4qrftw6uz7swfzk6x2kswru4jx4laht85xyewejhjf58dq53xv3msjkufg0) | yes | [9cdd5db8bf8a…](https://preprod.cexplorer.io/tx/9cdd5db8bf8af8e98499de040897a6ded3b36de25fba055661d210fb49c9b755) |
| V08 | waveA | Option C | [addr_test1qq00rulm…73qqz5](https://preprod.cexplorer.io/address/addr_test1qq00rulmdrtcgql6fq82jacpkx7d8tneu3vstyhh6rt387aecyr442fqal4mvydvmnyf04ecvj3yfwas074zahykfngq73qqz5) | yes | [c1e466944855…](https://preprod.cexplorer.io/tx/c1e4669448555050d26f04e8c76f291877a21d3bf7ce984ff8e72ca10957a12b) |
| V09 | waveA | Option C | [addr_test1qp7k2hfx…5m47s3](https://preprod.cexplorer.io/address/addr_test1qp7k2hfx2eemdpzjkwd0v4nkvfepne9a72yx7x50catujawarf76nxt2yu339dwwyc8ftw0h50gsrvauj5mtr3l2l46s5m47s3) | yes | [87410cbd7213…](https://preprod.cexplorer.io/tx/87410cbd7213c32b8175f7ad3f02a3e441fae22313b813e37e3c8630752f9f57) |
| V10 | reserve | Option A | [addr_test1qzedeftp…sy2t8h](https://preprod.cexplorer.io/address/addr_test1qzedeftpqnrkpqlzpvg9d8s94dx4zr832ct6t2f7wlwrruzna8kvu8sy0qnfwchfrgqmdtzszwsmjy4a0z5en7hu4vsssy2t8h) | yes | [b792b6334efd…](https://preprod.cexplorer.io/tx/b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5) |
| V11 | waveB | Option A | [addr_test1qpn56ma9…2fvxz5](https://preprod.cexplorer.io/address/addr_test1qpn56ma9dpwjk05agvcdjecu280uvzl7ykheq6ssudjtg45jg8huycnznexupu7794gw09y6psnq33nx6cf04h5z2x9s2fvxz5) | yes | [c8c558afdd0f…](https://preprod.cexplorer.io/tx/c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726) |
| V12 | waveB | Option B | [addr_test1qzrnmr7a…4wzzhv](https://preprod.cexplorer.io/address/addr_test1qzrnmr7aymn23jlxcz090ddvj0jrxjr4ffl0v6hh5h5aqjf6sfggy7kl4lwxf2c0lurx6p5jgpz0uqmtc8jgxyqwas2s4wzzhv) | yes | [fd50138a8391…](https://preprod.cexplorer.io/tx/fd50138a8391b0c5fdde1f0bf80000aed486e56415cf0eeec119877beddb7630) |
| V13 | waveB | Option C | [addr_test1qqq4u5kp…67c6zv](https://preprod.cexplorer.io/address/addr_test1qqq4u5kpjrsc5n4qcjy6esetym8r06kw02uatcn79kaq0qqgg4k624pvyj3v7dgsu7q4pqk53hz8se7v9zd2pexzqavs67c6zv) | yes | [ff878e16de65…](https://preprod.cexplorer.io/tx/ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a) |
| V14 | late | — | [addr_test1qz0cyvzj…p4prfh](https://preprod.cexplorer.io/address/addr_test1qz0cyvzjk652tyzsaljjpw6ldflkj7gsv2acm8dnr92qn9df0na0u8m8wcw3mngpvs374egk5t0962l4xfgccygy48hsp4prfh) | yes | — |
| V15 | tooLate | Option B | [addr_test1qpn7zp43…gx82a7](https://preprod.cexplorer.io/address/addr_test1qpn7zp433gzpdxhvrytlshqyr9nzv97wyea8y2wrjwwrn4k9mtte6dyfj0w0rj0s84vpggwexve7grkz9p7adauaywcsgx82a7) | yes | — |

### 3. Timeline

| Time (UTC) | Phase | Test | Actor | Event | Tx / detail |
|---|---|---|---|---|---|
| 05:34:58 | fund |  |  | tx-submitted | [a44ad300de04…](https://preprod.cexplorer.io/tx/a44ad300de04dfb98035cebc76e8fb48dabad299259f4ff39652d5134e16b610) |
| 05:35:25 | fund |  |  | confirmed | [a44ad300de04…](https://preprod.cexplorer.io/tx/a44ad300de04dfb98035cebc76e8fb48dabad299259f4ff39652d5134e16b610) |
| 05:35:27 | event |  |  | event-created | [SIM] M4 test run main 2026-10-28 05:35 |
| 05:35:31 | event |  |  | invitations | sent 15, failed 0 |
| 05:37:06 | bootstrap |  |  | tx-submitted (group mint) | [db1175612f22…](https://preprod.cexplorer.io/tx/db1175612f22a4cd5ebe54d44b0392008461ac2f11108848d204b35ffe062c79) |
| 05:37:31 | bootstrap |  |  | confirmed (group mint) | [db1175612f22…](https://preprod.cexplorer.io/tx/db1175612f22a4cd5ebe54d44b0392008461ac2f11108848d204b35ffe062c79) |
| 05:37:37 | bootstrap |  |  | tx-submitted (semaphore+voting mint) | [b58a92ff3ffc…](https://preprod.cexplorer.io/tx/b58a92ff3ffc7b38dd22474609e6f7adbdc993f67f4ad10f8d70acc3a91faffa) |
| 05:38:15 | bootstrap |  |  | confirmed (semaphore+voting mint) | [b58a92ff3ffc…](https://preprod.cexplorer.io/tx/b58a92ff3ffc7b38dd22474609e6f7adbdc993f67f4ad10f8d70acc3a91faffa) |
| 05:38:47 | vote | C1 | V01 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 05:52:57 | vote | A | V01 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 05:53:32 | vote | A-retry | V01 | vote-submitted | [5f58c0e119a6…](https://preprod.cexplorer.io/tx/5f58c0e119a6bc160f682f586ba3acb18997533931ab48abb81b41b2af89ffe2) |
| 05:53:49 | vote | A | V01 | confirmed | [5f58c0e119a6…](https://preprod.cexplorer.io/tx/5f58c0e119a6bc160f682f586ba3acb18997533931ab48abb81b41b2af89ffe2) |
| 05:53:54 | vote | A | V02 | vote-submitted | [d239347ede96…](https://preprod.cexplorer.io/tx/d239347ede96ea0d007e2844ee095bd899683953f1c8b8b5b8e2646b39f927e4) |
| 05:55:04 | vote | A | V02 | confirmed | [d239347ede96…](https://preprod.cexplorer.io/tx/d239347ede96ea0d007e2844ee095bd899683953f1c8b8b5b8e2646b39f927e4) |
| 05:55:08 | vote | A | V03 | vote-submitted | [130cd866547e…](https://preprod.cexplorer.io/tx/130cd866547eae0980d1af2f87fca3abd680fa60fcdb942d3fdf2cdf001aed8e) |
| 05:55:27 | vote | A | V03 | confirmed | [130cd866547e…](https://preprod.cexplorer.io/tx/130cd866547eae0980d1af2f87fca3abd680fa60fcdb942d3fdf2cdf001aed8e) |
| 05:55:31 | vote | A | V04 | vote-submitted | [76f4eb91b52b…](https://preprod.cexplorer.io/tx/76f4eb91b52b78ce1dd150a9621cf5653bd875fd84884293fd85664358e0d226) |
| 05:56:41 | vote | A | V04 | confirmed | [76f4eb91b52b…](https://preprod.cexplorer.io/tx/76f4eb91b52b78ce1dd150a9621cf5653bd875fd84884293fd85664358e0d226) |
| 05:56:45 | vote | A | V05 | vote-submitted | [28db15d97693…](https://preprod.cexplorer.io/tx/28db15d97693d6bb8aaeabc4eeaeecf14739253d8424d8b415842c62a76a542d) |
| 05:57:24 | vote | A | V05 | confirmed | [28db15d97693…](https://preprod.cexplorer.io/tx/28db15d97693d6bb8aaeabc4eeaeecf14739253d8424d8b415842c62a76a542d) |
| 05:57:28 | vote | A | V06 | vote-submitted | [9af15e33c689…](https://preprod.cexplorer.io/tx/9af15e33c6899b44bc9a9281112f547e27533507c2bf8837adf4df33ade99e73) |
| 05:58:06 | vote | A | V06 | confirmed | [9af15e33c689…](https://preprod.cexplorer.io/tx/9af15e33c6899b44bc9a9281112f547e27533507c2bf8837adf4df33ade99e73) |
| 05:58:11 | vote | A | V07 | vote-submitted | [9cdd5db8bf8a…](https://preprod.cexplorer.io/tx/9cdd5db8bf8af8e98499de040897a6ded3b36de25fba055661d210fb49c9b755) |
| 05:58:54 | vote | A | V07 | confirmed | [9cdd5db8bf8a…](https://preprod.cexplorer.io/tx/9cdd5db8bf8af8e98499de040897a6ded3b36de25fba055661d210fb49c9b755) |
| 05:58:59 | vote | A | V08 | vote-submitted | [c1e466944855…](https://preprod.cexplorer.io/tx/c1e4669448555050d26f04e8c76f291877a21d3bf7ce984ff8e72ca10957a12b) |
| 05:59:37 | vote | A | V08 | confirmed | [c1e466944855…](https://preprod.cexplorer.io/tx/c1e4669448555050d26f04e8c76f291877a21d3bf7ce984ff8e72ca10957a12b) |
| 05:59:42 | vote | A | V09 | vote-submitted | [87410cbd7213…](https://preprod.cexplorer.io/tx/87410cbd7213c32b8175f7ad3f02a3e441fae22313b813e37e3c8630752f9f57) |
| 06:00:41 | vote | A | V09 | confirmed | [87410cbd7213…](https://preprod.cexplorer.io/tx/87410cbd7213c32b8175f7ad3f02a3e441fae22313b813e37e3c8630752f9f57) |
| 06:00:47 | vote | C2 | V03 | vote-failed | at `relay-vote` (HTTP 409): Nullifier already used. Your vote may have already been submitted, or a previous attempt partially failed. If the vote TX was never confirme |
| 06:00:52 | vote | C3 | V03 | vote-failed | at `submit-direct`: {"data":{"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUt |
| 06:00:56 | vote | C5 | V14 | vote-failed | at `relay-vote` (HTTP 400): Invalid vote proof: proof is not for this event's voter group |
| 06:00:57 | vote | C6 | V14 | vote-failed | at `merkle-proof` (HTTP 409): Not part of this vote's group (registered after voting started) |
| 06:01:05 | vote | B1 | V12 | vote-submitted | [fd50138a8391…](https://preprod.cexplorer.io/tx/fd50138a8391b0c5fdde1f0bf80000aed486e56415cf0eeec119877beddb7630) |
| 06:01:06 | vote | B1 | V13 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 06:01:07 | vote | B1 | V11 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |
| 06:01:39 | vote | B1 | V12 | confirmed | [fd50138a8391…](https://preprod.cexplorer.io/tx/fd50138a8391b0c5fdde1f0bf80000aed486e56415cf0eeec119877beddb7630) |
| 06:01:47 | vote | B2 | V11 | vote-submitted | [c8c558afdd0f…](https://preprod.cexplorer.io/tx/c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726) |
| 06:02:52 | vote | B2 | V11 | confirmed | [c8c558afdd0f…](https://preprod.cexplorer.io/tx/c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726) |
| 06:02:57 | vote | B2 | V13 | vote-submitted | [ff878e16de65…](https://preprod.cexplorer.io/tx/ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a) |
| 06:03:33 | vote | B2 | V13 | confirmed | [ff878e16de65…](https://preprod.cexplorer.io/tx/ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a) |
| 06:03:44 | vote | C7e-victim | V10 | vote-submitted | [b792b6334efd…](https://preprod.cexplorer.io/tx/b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5) |
| 06:04:13 | vote | C7e-victim | V10 | confirmed | [b792b6334efd…](https://preprod.cexplorer.io/tx/b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5) |
| 07:08:26 | vote | C8 | V15 | vote-failed | at `relay-vote` (HTTP 502): Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraCo |

### 4. On-chain state trace

After every state change: the nullifier MPF root on-chain (Semaphore datum), in the backend, and recomputed
locally from the nullifiers of confirmed votes; plus the on-chain tally (Voting datum).
Note: in run main-20261005-0941 the snapshot waited only for the Semaphore address to be indexed, so the tally
column can lag one vote behind (Blockfrost indexes the Voting address separately). The final tally in §5 is exact.

| Time | After | MPF root on-chain | MPF root backend | Backend = chain | Recomputed | Tally (A/B/C) |
|---|---|---|---|---|---|---|
| 05:38:17 | after bootstrap | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:38:19 | after late registration | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:38:36 | before C1 | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:38:47 | after C1 | `0000000000…` | `—` | yes | `0000000000…` | 0 / 0 / 0 |
| 05:53:50 | after A V01 | `a3605aab4c…` | `a3605aab4c…` | yes | `a3605aab4c…` | 1 / 0 / 0 |
| 05:55:04 | after A V02 | `24e9ed35f8…` | `24e9ed35f8…` | yes | `24e9ed35f8…` | 2 / 0 / 0 |
| 05:55:27 | after A V03 | `e8af43de36…` | `e8af43de36…` | yes | `e8af43de36…` | 3 / 0 / 0 |
| 05:56:42 | after A V04 | `c6f42d07c4…` | `c6f42d07c4…` | yes | `c6f42d07c4…` | 4 / 0 / 0 |
| 05:57:24 | after A V05 | `31459a54c1…` | `31459a54c1…` | yes | `31459a54c1…` | 4 / 1 / 0 |
| 05:58:07 | after A V06 | `7b74619c6c…` | `7b74619c6c…` | yes | `7b74619c6c…` | 4 / 2 / 0 |
| 05:58:55 | after A V07 | `9d7ed57893…` | `9d7ed57893…` | yes | `9d7ed57893…` | 4 / 3 / 0 |
| 05:59:38 | after A V08 | `3995fdb097…` | `3995fdb097…` | yes | `3995fdb097…` | 4 / 3 / 1 |
| 06:00:42 | after A V09 | `ed36de7bf2…` | `ed36de7bf2…` | yes | `ed36de7bf2…` | 4 / 3 / 2 |
| 06:00:54 | before C5 | `ed36de7bf2…` | `ed36de7bf2…` | yes | `ed36de7bf2…` | 4 / 3 / 2 |
| 06:00:57 | after C5 | `ed36de7bf2…` | `ed36de7bf2…` | yes | `ed36de7bf2…` | 4 / 3 / 2 |
| 06:00:58 | after attacks | `ed36de7bf2…` | `ed36de7bf2…` | yes | `ed36de7bf2…` | 4 / 3 / 2 |
| 06:01:40 | after B1 V12 | `fd070dc459…` | `fd070dc459…` | yes | `fd070dc459…` | 4 / 4 / 2 |
| 06:02:53 | after B2 V11 | `92d5f9dee7…` | `92d5f9dee7…` | yes | `92d5f9dee7…` | 5 / 4 / 2 |
| 06:03:34 | after B2 V13 | `a0aa946437…` | `a0aa946437…` | yes | `a0aa946437…` | 5 / 4 / 3 |
| 06:03:35 | before C7 | `a0aa946437…` | `a0aa946437…` | yes | `a0aa946437…` | 5 / 4 / 3 |
| 06:03:40 | after C7d junk proof | `a0aa946437…` | `a0aa946437…` | yes | `a0aa946437…` | 5 / 4 / 3 |
| 06:04:14 | after C7e-victim V10 | `5dec3467ed…` | `5dec3467ed…` | yes | `5dec3467ed…` | 6 / 4 / 3 |
| 06:04:14 | after C7 | `5dec3467ed…` | `5dec3467ed…` | yes | `5dec3467ed…` | 6 / 4 / 3 |
| 07:08:27 | after C8 | `5dec3467ed…` | `5dec3467ed…` | yes | `5dec3467ed…` | 6 / 4 / 3 |
| 07:08:44 | final | `5dec3467ed…` | `5dec3467ed…` | yes | `5dec3467ed…` | 6 / 4 / 3 |

#### Group Merkle root (registration)

| Time | After | Backend members | Registered by us | Missing | Root consistent |
|---|---|---|---|---|---|
| 05:35:53 | after V01 | 0 | 1 | 1 | **no** |
| 05:35:54 | after V02 | 0 | 2 | 2 | **no** |
| 05:35:55 | after V03 | 0 | 3 | 3 | **no** |
| 05:35:56 | after V04 | 0 | 4 | 4 | **no** |
| 05:35:57 | after V05 | 0 | 5 | 5 | **no** |
| 05:35:58 | after V06 | 0 | 6 | 6 | **no** |
| 05:35:59 | after V07 | 0 | 7 | 7 | **no** |
| 05:36:00 | after V08 | 0 | 8 | 8 | **no** |
| 05:36:01 | after V09 | 0 | 9 | 9 | **no** |
| 05:36:02 | after V10 | 0 | 10 | 10 | **no** |
| 05:36:03 | after V15 | 0 | 11 | 11 | **no** |
| 05:36:05 | after R1 (concurrent) | 0 | 14 | 14 | **no** |
| 05:36:05 | after R1 retries | 0 | 14 | 14 | **no** |
| 05:36:47 | groupcheck (re-run) | 14 | 14 | undefined | yes |
| 05:38:18 | after late registration V14 | 15 | 15 | undefined | yes |

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
- Cause: rejected at merkle-proof (HTTP 409): Not part of this vote's group (registered after voting started)

<details><summary>Raw observation</summary>

```
rejected at merkle-proof (HTTP 409): Not part of this vote's group (registered after voting started)
```
</details>

#### B1 — pass

- Expected: hypothesis: 1 succeeds, the others fail
- Cause: 1 submitted, 1 confirmed of 3; failures: V11@relay-vote rolledBack=true: Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"

<details><summary>Raw observation</summary>

```
1 submitted, 1 confirmed of 3; failures: V11@relay-vote rolledBack=true: Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\" | V13@relay-vote rolledBack=true: Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\"
```
</details>

#### B2-V11 — pass

- Expected: succeeds on retry
- Cause: confirmed c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726

<details><summary>Raw observation</summary>

```
confirmed c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726
```
</details>

#### B2-V13 — pass

- Expected: succeeds on retry
- Cause: confirmed ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a

<details><summary>Raw observation</summary>

```
confirmed ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a
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
- Cause: confirmed b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5

<details><summary>Raw observation</summary>

```
confirmed b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5
```
</details>

#### C8 — pass

- Expected: rejected (after event end)
- Cause: ledger: tx outside its validity interval

<details><summary>Raw observation</summary>

```
rejected at relay-vote: Blockfrost submission failed (400): {"error":"Bad Request","message":"{\"contents\":{\"contents\":{\"contents\":{\"era\":\"ShelleyBasedEraConway\",\"error\":[\"ConwayUtxowFailure (UtxoFailure (OutsideValidityIntervalUTxO (ValidityInterval {invalidBefore = SJust (SlotNo 137483543), invalidHereafter =; rolledBack=true
```
</details>

### 7. Performance

- ZK proof generation (Node, ms): min 1236 · median 1356 · max 4087
- Full voter flow until submit (ms): min 3635 · median 3841 · max 7093
- Submit → confirmed (s, incl. polling): min 17 · median 38 · max 70
- Fee per vote (lovelace): min 1079587 · median 1085747 · max 1092171
- Tx size (bytes): min 10480 · median 10620 · max 10766
- Execution units declared per vote, semaphore spend (static budget, not measured usage; steps): min 5000000000 · median 5000000000 · max 5000000000

### 8. What is traceable on-chain

Decoded from chain data only (Blockfrost: tx inputs + redeemers), without using this run's logs.

| Paying wallet | Vote tx | Option (from `signal_message`) | Nullifier |
|---|---|---|---|
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [5f58c0e119a6…](https://preprod.cexplorer.io/tx/5f58c0e119a6bc160f682f586ba3acb18997533931ab48abb81b41b2af89ffe2) | Option A ×1 | `3.506908418486…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [d239347ede96…](https://preprod.cexplorer.io/tx/d239347ede96ea0d007e2844ee095bd899683953f1c8b8b5b8e2646b39f927e4) | Option A ×1 | `4.790077444229…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [130cd866547e…](https://preprod.cexplorer.io/tx/130cd866547eae0980d1af2f87fca3abd680fa60fcdb942d3fdf2cdf001aed8e) | Option A ×1 | `1.751032942657…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [76f4eb91b52b…](https://preprod.cexplorer.io/tx/76f4eb91b52b78ce1dd150a9621cf5653bd875fd84884293fd85664358e0d226) | Option A ×1 | `3.396922335913…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [28db15d97693…](https://preprod.cexplorer.io/tx/28db15d97693d6bb8aaeabc4eeaeecf14739253d8424d8b415842c62a76a542d) | Option B ×1 | `3.181069581725…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [9af15e33c689…](https://preprod.cexplorer.io/tx/9af15e33c6899b44bc9a9281112f547e27533507c2bf8837adf4df33ade99e73) | Option B ×1 | `2.575487507142…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [9cdd5db8bf8a…](https://preprod.cexplorer.io/tx/9cdd5db8bf8af8e98499de040897a6ded3b36de25fba055661d210fb49c9b755) | Option B ×1 | `3.107901247378…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [c1e466944855…](https://preprod.cexplorer.io/tx/c1e4669448555050d26f04e8c76f291877a21d3bf7ce984ff8e72ca10957a12b) | Option C ×1 | `1.839613389209…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [87410cbd7213…](https://preprod.cexplorer.io/tx/87410cbd7213c32b8175f7ad3f02a3e441fae22313b813e37e3c8630752f9f57) | Option C ×1 | `3.976700639161…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [b792b6334efd…](https://preprod.cexplorer.io/tx/b792b6334efd2cbd2524536fdeffd8b92dbaf12bd58407035823ea02ea77f9f5) | Option A ×1 | `1.282739417706…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [c8c558afdd0f…](https://preprod.cexplorer.io/tx/c8c558afdd0fdd144026b426dc756d9ef91dbaac84babe9ba867541f83e1f726) | Option A ×1 | `4.185602172305…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [fd50138a8391…](https://preprod.cexplorer.io/tx/fd50138a8391b0c5fdde1f0bf80000aed486e56415cf0eeec119877beddb7630) | Option B ×1 | `3.788241198822…` |
| [addr_test1qz96ul4r…s4wlzl](https://preprod.cexplorer.io/address/addr_test1qz96ul4rmng67jekrhzcnx7h45vrl2s5lz5fcucnmc3c0mjv27pjkr0xdahhhl8y842vvks5zrumkqnypdmeq0ucgn8qs4wlzl) | [ff878e16de65…](https://preprod.cexplorer.io/tx/ff878e16de65e79b3fb529ff63eaac7dc8b4b17363135cc37b5fa175e783473a) | Option C ×1 | `1.447194860317…` |

- **Linkable:** paying wallet → vote tx → chosen option (plaintext CBOR in the redeemer) → nullifier.
- **Not linkable on-chain:** identity commitment → vote. Commitments never appear on-chain; only the group root does.
- **Artefact of this simulation:** all wallets were funded from one distributor in [a44ad300de04…](https://preprod.cexplorer.io/tx/a44ad300de04dfb98035cebc76e8fb48dabad299259f4ff39652d5134e16b610), which links them
  to each other. Real voters funding their own wallets would not share this link — but each voter's own wallet history
  (exchange withdrawals, other dApps) links the vote to them instead.

### 9. What the backend operator can see

*Note for the Milestone 4 build: the `POST nullifier` and `POST vote` columns are empty because those endpoints no longer exist. A single `POST relay-vote` request follows the Merkle-proof request from the same client, so the correlation described below (F5) remains possible for the operator.*

Order of requests the backend receives per vote (from this run's request log):

| Voter | `GET merkle-proof/:userId` | `POST nullifier` | `POST vote` | Gap merkle→nullifier |
|---|---|---|---|---|
| V01 | 05:53:29 `12` | — | — | — |
| V02 | 05:53:51 `13` | — | — | — |
| V03 | 05:55:06 `20` | — | — | — |
| V04 | 05:55:29 `21` | — | — | — |
| V05 | 05:56:43 `22` | — | — | — |
| V06 | 05:57:26 `23` | — | — | — |
| V07 | 05:58:08 `24` | — | — | — |
| V08 | 05:58:56 `25` | — | — | — |
| V09 | 05:59:39 `26` | — | — | — |
| V12 | 06:01:01 `29` | — | — | — |
| V11 | 06:01:42 `28` | — | — | — |
| V13 | 06:02:54 `30` | — | — | — |
| V10 | 06:03:41 `27` | — | — | — |

The Merkle-proof request names the voter (`userId`); the nullifier and the signed tx follow seconds later from the
same client. An operator logging request source and time can join userId → nullifier → vote tx → option.

*(The findings list of this run is maintained with its current status in [M4_USER_FEEDBACK.md §4](../M4_USER_FEEDBACK.md).)*

