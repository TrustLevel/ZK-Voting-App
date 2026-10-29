# Feedback Questionnaire
## Blockchain Voting Application — Testing Phase

---

### Tester Information

**Name:** Talon C. 

**GitHub:** Pumbiii

**Organization:**

**RSS / Social media:**

**Email:**

**Wallet used:**

- [x] Eternl
- [ ] Nami
- [ ] Vespr
- [ ] Lace
- [ ] Flint
- [ ] Other: _______________

**Device and operating system:**

**Prior experience with dApps:**
- [ ] None — this is my first time
- [ ] Basic — I have used a dApp occasionally
- [ ] Intermediate — I use dApps regularly
- [x] Advanced — I develop or manage blockchain projects

**Date of the test:** 2026-10-05

---

### Questions

**Q1 — What aspects of the application are well executed?**

*What worked as expected or better than expected?*

The core is sound. Membership is a Semaphore proof on BLS12-381 verified by the Plutus validator itself, not by the server; the group root is frozen on-chain at publish, so the organiser cannot add voters afterwards; double voting is blocked by a nullifier in a Merkle Patricia Forestry trie whose root lives in the contract datum. Every one of my votes was a real transaction I could trace: inputs, redeemer with proof and nullifier, updated tally in the output datum. 12 of 15 scripted votes confirmed on the first run, the tally on-chain matched what the API reported, and the weighted mode enforced the point sum in the validator. The circuit and the trusted setup were left alone, which is the right call.

---

**Q2 — How was your experience navigating the application?**

*Think about the onboarding, the clarity of each step, the interface messages, and how easy it was to understand what to do at each point. Was there any moment where you got stuck or ran into an error? Include the wallet connection if applicable.*

Overall experience rating:
- [ ] 1 — Very confusing
- [ ] 2 — Difficult
- [ ] 3 — Acceptable
- [x] 4 — Clear
- [ ] 5 — Very intuitive

Comments:
Clear (for the flow; the API is another matter)

Answer:
The flow itself is clear: invite, register, publish, vote. What I ran into was underneath. After one vote was rolled back, every later vote failed because the backend's nullifier trie had detached from its store. Two concurrent registrations lost a member without an error. Two votes in one block window collide on the shared state UTxO; one of them needs a retry. The public event endpoint returned the admin token, the invitees' e-mail addresses and the user-to-commitment map. The nullifier insert and delete endpoints had no authentication at all, so anyone could desync the trie and block an election. A Blockfrost project key was in the frontend bundle. Non-members got HTTP 500 instead of a message. None of this is visible to a normal user until it bites.

---

**Q3 — Did you feel that the voting process was transparent and verifiable?**

*Were you able to understand what happened to your vote once it was cast? Did the application give you confidence that the result would be accurate and tamper-proof? What gave you that sense — or the lack of it?*

Verifiable: yes, fully. Anyone with the voting policy id can recount the tally from the chain and check every proof against the published group root. Transparent in a way the project should state plainly: the chosen option is readable on-chain, so this is voter anonymity, not ballot secrecy, and at the time of my test the paying wallet sat next to the vote in the same transaction, which undid the anonymity for anyone who knew the wallet. The backend also sees the Merkle-path request by user id seconds before the vote from the same client; an operator who logs both can link them.

---

**Q4 — What use cases could this application have for the Cardano community?**

*DAO governance, Catalyst, SPOs, NFT communities, community treasuries, or anything else that comes to mind.*

Member votes where the roll is known but the ballot must not be attributable: DAO and treasury governance, SPO alliances, working groups inside Catalyst, internal votes of DRep or committee bodies, token-holder polls with a snapshot as the group. Anything that today runs on a Google form with a promise.

---

**Q5 — What would you add, change, or remove if you could?**

*Open question. It could be a feature, a flow, a message, something visual — whatever has been on your mind.*

In order of urgency: write the nullifier only after the server has verified the proof, and put every admin route behind the token. Take the voter's wallet out of the vote transaction; a relay that pays the fee gives you anonymity and removes the onboarding problem at once. Serialise votes per event and wait for the previous transaction before building the next, with automatic rollback. Get the Blockfrost key out of the browser. Gate results until the end. Return proper status codes. Longer term: serve the frozen group so clients compute their own Merkle path, and submit through a channel the operator cannot correlate; if ballot secrecy is ever required, that is encrypted ballots or commit-reveal, a protocol change, not a patch.

---

*Thank you for your time and input. This feedback is key to the development of the application.*

---

## Own testing: scripted system test, 2026-10-05

I ran a scripted system test against the hosted application on Cardano Preprod
(Milestone 3 deployment, `preview` @ `51cddaa`): 15 script-controlled voters with their own
wallets and Semaphore identities, real invitations, real registrations and real on-chain votes,
plus concurrency and attack scenarios. The run produced the application-level findings F0–F12;
their status after the Milestone 4 fixes is kept in
[M4_USER_FEEDBACK.md, section 4](../M4_USER_FEEDBACK.md). The project re-ran the same scenarios
on 2026-10-28/29 against the fixed deployment; that regression run is the
[test report](../M4_TEST_REPORT.md).

How to read it: every API call the script makes is the call the frontend makes; every vote is a
real transaction on Preprod (links to the explorer are in the tables); "verdict" lines compare
what happened with what the test plan expected. E-mail addresses and invitation/admin tokens are
replaced by placeholders; wallet addresses, transaction hashes, nullifiers and commitments are
public on-chain data and are kept.

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
