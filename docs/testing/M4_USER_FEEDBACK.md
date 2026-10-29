# Milestone 4 — User feedback and what changed because of it

**Project:** ZK Voting App (Catalyst project 1200252)
**Period:** September – October 2026 · **Network:** Cardano Preprod
**Companion documents:** [Audit report](../audit/AUDIT.md) · [Test report](M4_TEST_REPORT.md) · [Submission](../milestones/MILESTONE4_SUBMISSION.md)

Milestone 4 asked for prototype testing and feedback from at least three test users, and for the
system to be optimized according to that feedback and the audit. This document collects the
feedback we received, who it came from, and what we changed in response. Items that we decided
*not* to change are listed with the reason.

---

## 1. Who tested

| # | Tester | Background | What they did | Material |
|---|---|---|---|---|
| 1 | Rodrigo Oyarzún, CHIL Stake Pool | SPO, community voting | Organiser (created and ran an event) and voter, Eternl | [Questionnaire](interviews/VotingAppFeedback_Rodrigo.md) |
| 2 | Sebastián Pabón, Gimbalabs | Developer, runs blockchain projects | Organiser and voter, Eternl | [Questionnaire](interviews/VotingAppFeedback_Sebastián.md) |
| 3 | Talon (GitHub: Pumbbii) | Developer | Scripted system test against the hosted backend: 15 script-controlled voters, real registrations and on-chain votes, concurrency and attack scenarios. Produced the findings F0–F12. | [Test write-up and questionnaire](interviews/VotingAppFeedback_Pumbi.md) |
| 4 | pinusch (GitHub: pinusch) | Community | Organised a live event with five participants who registered and voted from their browsers; 3 votes succeeded at first, 2 failed | [Test write-up and questionnaire](interviews/VotingAppFeedback_Pinusch.md) |
| 5 | Independent reviewers (Catalyst milestone review of M3) | Milestone reviewers | Written review of the hosted application | — |

All tests ran on 2026-10-05 against the Milestone 3 deployment, Rodrigo's and Sebastián's in the
weeks around it. The testers' questionnaires and write-ups are in
[`docs/testing/interviews/`](interviews/); Talon and pinusch add their questionnaire answers to
their files themselves.

After the fixes, the project re-ran Talon's scripted scenarios on 2026-10-28 against the
Milestone 4 deployment. That regression run is the [test report](M4_TEST_REPORT.md); several
status entries in section 4 cite it.

---

## 2. What the testers said

### Rodrigo (SPO, organiser view)

> "The voting is very short, quick and cheap, the interface is clean. … From the administrator side is more complex."

> "From the administrator point of view would be important to check the participants before sending, this is confusing for the administrator."

> "I would make more explicit the route, with a checklist of whom have registered, it can't register the voting if the users aren't registered before. … I need to understand which participants are missing to launch the application, the time can't be the only constraint."

> "Perhaps seeing from the administrator side how the voting goes."

Overall rating: **4 — Clear**. Transparency / verifiability: **yes**.

### Sebastián (developer, organiser view)

> "It is intuitive at a great level. The application guided me correctly … within the complexity that ZK brings. When it mints two tokens it may imply a moment of anxiety for the common user."

> "Where I didn't get too much success was while casting the votes."

> "Perhaps add alerts or pop-ups about what is happening in that moment. Sometimes when interactions with wallet occur for non-technical users, it is good to show what is happening. Maintain the level of anxiety at the lowest."

Overall rating: **4 — Clear**. Transparency / verifiability: **yes**.

### Talon (developer, scripted system test, 2026-10-05)

Fifteen scripted voters, one organiser wallet, every step through the public API of the hosted
instance: invitations, registrations, publishing, votes, and then concurrency and attack
scenarios. 12 of 15 votes were confirmed on-chain. The headline findings:

- After one rolled-back vote, every later vote failed: the nullifier trie had come loose from its
  store (F0, critical).
- The public event API returned the admin token, the invitees' e-mail addresses and the mapping
  from user id to commitment (F1).
- The nullifier endpoints accepted unauthenticated inserts and deletes, enough to desync the
  trie and block all further votes (F2).
- Two registrations at the same moment lost one member silently (F7); two votes in the same
  block window collided on the shared state UTxO (F6).
- The frontend bundle shipped a Blockfrost API key (F8); interim results were visible while
  voting was open (F9); failed votes produced misleading messages such as "Insufficient funds"
  (F10).

The full list with severities is section 4; the run itself, with transaction hashes and the
on-chain state trace, is in his [write-up](interviews/VotingAppFeedback_Pumbi.md).

### pinusch (live group test, five participants, 2026-10-05)

Three of five votes went through on the first try. Observations:

1. A voter saw **"Insufficient funds"** although the wallet held enough test ADA; the real cause
   was a transaction built on inputs that a still-pending vote had already spent.
2. The second successful voter could **see the running tally** while others had not voted yet.
3. One vote was **rejected on the first attempt and succeeded on the second**: two votes had been
   submitted within the same block and collided on the shared on-chain state.

The on-chain record adds a fourth point: the voting window of this event was five minutes long,
the three confirmed votes needed about 90 seconds each, and the last one landed three seconds
before the end, so the failed attempts had no time left to retry (timeline with the transactions
in the tester's [write-up](interviews/VotingAppFeedback_Pinusch.md)). The create form now states the
minimum window derived from this.

### Catalyst reviewers (M3 review, carried into M4)

Unfriendly raw transaction errors in the UI; a cancelled wallet signature locked the voter out;
missing unit tests for backend and transaction builder; no demo of weighted voting.
All four were addressed in the M3 resubmission and are included here for completeness.

---

## 3. What changed because of the feedback

| Feedback | Change | Where |
|---|---|---|
| "Check the participants before sending" / "checklist of whom have registered" (Rodrigo) | New **"Before you publish"** box on the Start Voting step: invited / registered / still-pending counts, the list of pending participants, a refresh button, and an explicit note that publishing freezes the voter group. Publishing is **blocked while nobody has registered**. | `src/frontend/app/event/[id]/manage/page.tsx` |
| "Make the route more explicit" (Rodrigo) / "show what is happening during wallet interactions" (Sebastián) | The publish box explains the two wallet signatures (Group NFT, then Semaphore + Voting NFTs) and the confirmation times before the organiser clicks; the minting progress (Step 1/2, Step 2/2) sits right under the Publish button. During the vote, every step shows a one-line explanation (proof is generated in the browser, identity never leaves the device, no wallet needed to submit). Every term on the organiser and voter pages has an info button that explains it in place. | manage page, `src/frontend/app/event/[id]/page.tsx`, `src/frontend/components/infoTexts.ts` |
| "Seeing from the administrator side how the voting goes" (Rodrigo) + interim results visible (pinusch, #2; Talon, F9) | While voting is open the organiser dashboard shows **turnout only** ("X of N registered voters"); voters and the public results page see neither counts nor turnout until the end date. Enforced in the backend, not just hidden in the UI. | `getResults` in `src/backend/src/voting-event/voting-event.service.ts`; organiser, voter and public results pages |
| "Didn't get too much success while casting the votes" (Sebastián) + the failures in pinusch's live test + Talon's F0/F7/F11 | Root causes fixed: the nullifier-trie bug that broke every vote after one rolled-back attempt (F0), lost registrations under concurrency (F7), start-event failure between the two mint transactions (F11). Vote collisions (F6): votes are serialised in the backend and a losing vote is rolled back automatically, so the voter can simply retry; the fix for the remaining retry is deployed, verification pending (see §4). | backend, see the audit's F-APP findings |
| Misleading "Insufficient funds" (pinusch, #1; Talon, F10) | Error classification reordered: a pending-input conflict now says *"Another vote is still being confirmed on the blockchain … please try again in a few minutes"*; fee problems are attributed to the service wallet, not the voter. | `classifySubmissionError` in the vote page |
| "Moment of anxiety when it mints two tokens" (Sebastián) | Explained up front (see above); the mint flow keeps its step indicator. | manage page |
| Leaked admin data and open nullifier endpoints (Talon, F1/F2) | Public projection of the event without token, e-mails and commitment map; every organiser route behind the admin token; the nullifier is written only by the relay after the proof is verified server-side. | `admin-token.guard.ts`, `relayVote` |
| "Next iteration: automated sign up" (Rodrigo) | **Not changed.** Registration is deliberately a voter-side action: the Semaphore identity is generated in the voter's browser and only the commitment is sent, so nobody else can register on a voter's behalf. The registration step explains this and hands the voter their identity file. | — |
| Voters needed a funded wallet to vote (M3 reviewers, all testers on Preprod); Blockfrost key in the browser (Talon, F8) | **Relay design:** the backend builds, signs and submits the vote transaction from a service wallet. Voters need no wallet, no ADA and no signature; their address never appears on-chain next to a vote. The organiser's transactions are built and submitted by the backend as well; the browser holds no API key. | `docs/design/RELAY_VOTE_DESIGN.md`, `POST /voting-event/:id/relay-vote`, `OrganiserTxService` |

---

## 4. Findings from Talon's scripted system test and their status

Talon's test of 2026-10-05 produced 13 application-level findings. The audit report lists them as
F-APP-0 … F-APP-12 with their status at audit time; this table gives the status as of the
Milestone 4 deployment (`preview` @ `79637ef`, 2026-10-29). Three findings that the audit still
records as partial or acknowledged were closed afterwards: F2 (proof-gated nullifier, commit
`bf24963`), F9 and F10 (commit `b2a86a6`). Numbering follows the tester's write-up; in the audit
report F-APP-4 and F-APP-5 are swapped (F-APP-4 = backend correlation, F-APP-5 = on-chain wallet
linkage). "Regression run" refers to the project's re-run of 2026-10-28 in the
[test report](M4_TEST_REPORT.md).

| ID | Finding | Severity | Status | Fix |
|---|---|---|---|---|
| F0 | After one rolled-back vote every later vote fails (nullifier trie detached from its store) | Critical | **Fixed, verified in the regression run (C1)** | `loadTrie` helper re-attaches an empty trie to LevelDB |
| F1 | Public event API returned the admin token, invitee e-mails and the userId→commitment map | High | **Fixed** | public projection without those fields; `/invited` and all organiser routes behind the admin token |
| F2 | Nullifier endpoints were unauthenticated (insert junk / delete a confirmed nullifier → trie desync) | High | **Fixed** | nullifier is inserted only by `relay-vote` after the ZK proof is verified server-side; public insert/delete removed; rollback behind the admin token |
| F3 | No rollback when the vote tx failed to build | Medium | **Fixed by design** | relay flow: the backend rolls back on any failure |
| F4 | Vote option is public on-chain and was tied to the paying wallet | Medium | **Partly addressed** | the voter's wallet no longer appears in vote transactions (relay design); the option itself stays readable on-chain, a known limit, see §5 |
| F5 | Backend can correlate the Merkle-proof request with the vote | Medium | **Open (design)** | see §5 |
| F6 | Concurrent votes collide on the shared state UTxO | Medium | **Fixed, verified 2026-10-29** | votes are serialised per network in the backend and a losing vote is rolled back automatically (no stuck voter, no trie desync). Regression run B1/B2: 3 votes within ~2 s → 1 confirmed, 2 rolled back, both confirmed on the first retry. Commits `69377fe` and `7914ac0` hold the queue until the previous vote is indexed at every address the next vote reads (Semaphore state, Voting state, relay wallet); verified the same day with three voters submitting within two seconds: 3 of 3 confirmed on the first attempt (test report Part C) |
| F7 | Concurrent registrations lost members silently | High | **Fixed** | per-event mutex around registration |
| F8 | Blockfrost key shipped in the frontend bundle | Medium | **Fixed** | voters never needed a key after the relay design; the organiser's publish transactions (Group mint, Semaphore + Voting mint, fee deposit) are built, submitted and watched by the backend (`build-*-tx` / `submit-tx` / `tx/:hash`, admin token); the organiser's wallet only signs. `NEXT_PUBLIC_BLOCKFROST_API_KEY*` is gone from the build |
| F9 | Interim results visible while voting is open | Medium | **Fixed** | results gated in the backend until the end date; turnout organiser-only |
| F10 | Misleading error messages ("Insufficient funds") | Low | **Fixed** | reordered classification, actionable messages |
| F11 | Event start could fail between the two mint transactions | Medium | **Fixed** | pre-mint UTxOs excluded when building the second mint |
| F12 | Non-members got HTTP 500 instead of a clear message | Low | **Fixed** | 404 / 409 / 422 with an explanation |

The detailed evidence of the original run (transaction hashes, request logs, on-chain state) is in
Talon's [write-up](interviews/VotingAppFeedback_Pumbi.md); the evidence after the fixes is in the
[test report](M4_TEST_REPORT.md).

---

## 5. Known limits we state openly

- **The vote option is readable on-chain.** The ZK proof hides *who* voted; it does not hide *what*
  was voted. With the relay design no voter wallet appears next to a vote, so the option cannot be
  tied to a wallet, but anyone can follow the tally on-chain. Real ballot secrecy would need
  encrypted ballots or a commit–reveal scheme, a design change beyond this milestone.
- **The backend can correlate a voter with a vote.** The voter asks the backend for their Merkle
  path (by user id) and then submits the vote through the same backend. An operator who logs both
  can link them. Serving the whole frozen group so that clients compute their own path, and
  submitting through an uncorrelated channel, are the known mitigations.
- **Two votes in the same block window.** Every vote spends the same two state UTxOs, so two votes
  built on the same state cannot both succeed. The backend serialises votes and rolls the losing
  vote back automatically, so nothing is stuck and the trie stays consistent. Since 2026-10-29 the
  queue holds each vote until the previous one is on-chain and indexed at every address the next
  vote reads, so concurrent voters wait 20–50 s instead of retrying; verified with three voters
  submitting within two seconds (F6, test report Part C).
- **The circuit was not changed in this milestone.** The audit and all test runs found no defect
  in the Semaphore circuit; the optimizations landed in the on-chain verifier and the signal
  handling (`cardano-semaphore` v0.9.3 → v0.9.5). Recompiling the circuit would invalidate the
  21-contributor trusted setup, which no finding justified.
