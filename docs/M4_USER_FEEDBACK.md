# Milestone 4 — User feedback and what changed because of it

**Project:** ZK Voting App (Catalyst project 1200252)
**Period:** September – October 2026 · **Network:** Cardano Preprod
**Companion documents:** [Audit report](../AUDIT_final.md) · [Test report](M4_TEST_REPORT.md) · [Submission](../MILESTONE4_SUBMISSION.md)

Milestone 4 asked for prototype testing and feedback from at least three test users, and for the
system to be optimized according to that feedback and the audit. This document collects the
feedback we received, where it came from, and what we changed in response. Items that we decided
*not* to change are listed with the reason.

---

## 1. Who tested

| # | Tester | Background | Role in the test | Wallet |
|---|---|---|---|---|
| 1 | Rodrigo Oyarzún — CHIL Stake Pool | SPO, community voting | Organiser (created and ran an event) and voter | Eternl |
| 2 | Sebastián Pabón — Gimbalabs | Developer, runs blockchain projects | Organiser and voter | Eternl |
| 3 | Live group test (5 participants), organised by TrustLevel | Mixed; first contact with ZK voting for most | Voters in one event (3 votes succeeded, 2 failed at first) | Eternl |
| 4 | Independent reviewers (Catalyst milestone review of M3) | Milestone reviewers | Written review of the hosted application | — |

In addition to the human testers, we ran a **scripted system test** with 15 simulated voters
against the hosted backend on Preprod (12 confirmed votes, concurrency and attack scenarios).
That test is *our own* and is reported separately in the [test report](M4_TEST_REPORT.md); it is
not counted as a test user, but several of the changes below come from it.

The two questionnaire answers are reproduced verbatim in
[`docs/Interviews/`](Interviews/).

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

### Live group test (5 participants, 2026-10-05)

Three of five votes went through on the first try. Observations:

1. A voter saw **"Insufficient funds"** although the wallet held enough test ADA — the real cause was a transaction built on inputs that a still-pending vote had already spent.
2. The second successful voter could **see the running tally** while others had not voted yet.
3. One vote was **rejected on the first attempt and succeeded on the second** — two votes had been submitted within the same block and collided on the shared on-chain state.

### Catalyst reviewers (M3 review, carried into M4)

Unfriendly raw transaction errors in the UI; a cancelled wallet signature locked the voter out;
missing unit tests for backend and transaction builder; no demo of weighted voting.
All four were addressed in the M3 resubmission and are included here for completeness.

---

## 3. What changed because of the feedback

| Feedback | Change | Where |
|---|---|---|
| "Check the participants before sending" / "checklist of whom have registered" (Rodrigo) | New **"Before you publish"** panel on the Start Voting tab: invited / registered / still-pending counts, the list of pending participants, a refresh button, and an explicit note that publishing freezes the voter group. Publishing is **blocked while nobody has registered**. | `src/frontend/app/event/[id]/manage/page.tsx` |
| "Make the route more explicit" (Rodrigo) / "show what is happening during wallet interactions" (Sebastián) | The publish panel now explains the two wallet signatures (Group NFT, then Semaphore + Voting NFTs) and the confirmation times before the organiser clicks. During the vote, every step shows a one-line explanation (proof is generated in the browser, identity never leaves the device, no wallet needed to submit). | manage page, `src/frontend/app/event/[id]/page.tsx` |
| "Seeing from the administrator side how the voting goes" (Rodrigo) + interim results visible (live test #2) | While voting is open the API and all result pages show **turnout only** ("X of N registered voters have voted"); per-option results are revealed after the end date. Enforced in the backend, not just hidden in the UI. | `getResults` in `src/backend/src/voting-event/voting-event.service.ts`; admin, voter and public results pages |
| "Didn't get too much success while casting the votes" (Sebastián) + the live-test failures | Root causes fixed: the nullifier-trie bug that broke every vote after one rolled-back attempt (F0), lost registrations under concurrency (F7), start-event failure between the two mint transactions (F11). Vote collisions (F6) are mitigated: votes are serialised per event in the backend and a losing vote is rolled back automatically, so the voter can simply retry (see §4). | backend, see the audit's F-APP findings |
| Misleading "Insufficient funds" (live test #1) | Error classification reordered: a pending-input conflict now says *"Another vote is still being confirmed … wait about a minute and try again"*; fee problems are attributed to the service wallet, not the voter. | `classifySubmissionError` in the vote page |
| "Moment of anxiety when it mints two tokens" (Sebastián) | Explained up front (see above); the mint flow itself keeps its step indicator. | manage page |
| "Next iteration: automated sign up" (Rodrigo) | **Not changed.** Registration is deliberately a voter-side action: the Semaphore identity is generated in the voter's browser and only the commitment is sent, so nobody else can register on a voter's behalf. The registration step explains this and hands the voter their identity file. | — |
| Voters needed a funded wallet to vote (M3 reviewers, all testers on Preprod) | **Relay design:** the backend builds, signs and submits the vote transaction from a service wallet. Voters need no wallet, no test ADA and no signature; their address never appears on-chain next to a vote. | `docs/RELAY_VOTE_DESIGN.md`, `POST /voting-event/:id/relay-vote` |

---

## 4. Findings from the scripted system test and their status

The scripted test (2026-10-05, 15 voters) produced 13 application-level findings. The audit report
lists them as F-APP-0 … F-APP-12 with their status at audit time; this table gives the status as of
the Milestone 4 deployment (`preview` @ `b2a86a6`). Three findings that the audit still records as
partial or acknowledged were closed afterwards: F2 (proof-gated nullifier, commit `bf24963`), F9 and
F10 (commit `b2a86a6`). Numbering follows the test report; in the audit report F-APP-4 and F-APP-5
are swapped (F-APP-4 = backend correlation, F-APP-5 = on-chain wallet linkage).

| ID | Finding | Severity | Status | Fix |
|---|---|---|---|---|
| F0 | After one rolled-back vote every later vote fails (nullifier trie detached from its store) | Critical | **Fixed, verified in the final run (C1)** | `loadTrie` helper re-attaches an empty trie to LevelDB |
| F1 | Public event API returned the admin token, invitee e-mails and the userId→commitment map | High | **Fixed** | public projection without those fields; `/invited` and all admin routes behind the admin token |
| F2 | Nullifier endpoints were unauthenticated (insert junk / delete a confirmed nullifier → trie desync) | High | **Fixed** | nullifier is inserted only by `relay-vote` after the ZK proof is verified server-side; public insert/delete removed; admin rollback behind the admin token |
| F3 | No rollback when the vote tx failed to build | Medium | **Fixed by design** | relay flow: the backend rolls back on any failure |
| F4 | Vote option is public on-chain and was tied to the paying wallet | Medium | **Partly addressed** | the voter's wallet no longer appears in vote transactions (relay design); the option itself stays readable on-chain — a known limit, see §5 |
| F5 | Backend can correlate the Merkle-proof request with the vote | Medium | **Open (design)** | see §5 |
| F6 | Concurrent votes collide on the shared state UTxO | Medium | **Mitigated — retry succeeds; queue does not yet wait for confirmation** | votes are serialised per event in the backend and a losing vote is rolled back automatically (no stuck voter, no trie desync); a vote submitted while another vote of the same event is still unconfirmed still needs one retry. Final run B1/B2: 3 votes within ~2 s → 1 confirmed, 2 rolled back, both confirmed on the first retry |
| F7 | Concurrent registrations lost members silently | High | **Fixed** | per-event mutex around registration |
| F8 | Blockfrost key shipped in the frontend bundle | Medium | **Fixed** | voters never needed a key after the relay design; the organiser's publish transactions (Group mint, Semaphore + Voting mint, fee deposit) are now built, submitted and watched by the backend (`build-*-tx` / `submit-tx` / `tx/:hash`, admin token); the organiser's wallet only signs. `NEXT_PUBLIC_BLOCKFROST_API_KEY*` is gone from the build |
| F9 | Interim results visible while voting is open | Medium | **Fixed** | results gated in the backend until the end date |
| F10 | Misleading error messages ("Insufficient funds") | Low | **Fixed** | reordered classification, actionable messages |
| F11 | Event start could fail between the two mint transactions | Medium | **Fixed** | pre-mint UTxOs excluded when building the second mint |
| F12 | Non-members got HTTP 500 instead of a clear message | Low | **Fixed** | 404 / 409 / 422 with an explanation |

The detailed evidence (transaction hashes, request logs, before/after state) is in the
[test report](M4_TEST_REPORT.md).

---

## 5. Known limits we state openly

- **The vote option is readable on-chain.** The ZK proof hides *who* voted; it does not hide *what*
  was voted. With the relay design no voter wallet appears next to a vote, so the option cannot be
  tied to a wallet, but anyone can follow the tally on-chain. Real ballot secrecy would need
  encrypted ballots or a commit–reveal scheme — a design change beyond this milestone.
- **The backend can correlate a voter with a vote.** The voter asks the backend for their Merkle
  path (by user id) and then submits the vote through the same backend. An operator who logs both
  can link them. Serving the whole frozen group so that clients compute their own path, and
  submitting through an uncorrelated channel, are the known mitigations.
- **A vote submitted while another vote of the same event is still unconfirmed needs one retry.**
  Every vote spends the same two state UTxOs, so two votes in one block window cannot both succeed.
  The backend serialises votes per event and rolls the losing vote back automatically, so nothing is
  stuck and the trie stays consistent, but the queue does not yet wait for the previous transaction
  to confirm before building the next one (F6).
- **The circuit was not changed in this milestone.** The audit and all test runs found no defect
  in the Semaphore circuit; the optimizations landed in the on-chain verifier and the signal
  handling (`cardano-semaphore` v0.9.3 → v0.9.5). Recompiling the circuit would invalidate the
  21-contributor trusted setup, which no finding justified.
