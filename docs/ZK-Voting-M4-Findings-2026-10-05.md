# ZK Voting App — M4 test findings (handoff)

**Confidential — do not publish.** Several findings are exploitable on the live deployment until fixed
(F1, F2, F7). The repo is public: please don't put these details into public issues or commits before the fix ships.

## Context

- **What was tested:** a scripted end-to-end voting run on **Cardano preprod against the live backend**
  (`api.vote.trustlevel.io`), code `preview` @ `51cddaa`. 15 voter wallets + admin + funding wallet, all controlled
  by one script (simulated, *not* independent public testers). Same code paths as the app: `@src/tx/browser`
  builders, the frontend's `lib/blockchain-helpers.ts`, the backend API; only signing (MeshWallet instead of CIP-30)
  and the prover build (Node `@src/zk/dist/proof.js`, byte-identical WASM/zkey) differ.
- **Runs (2026-10-05):**
  - Dry run — event `7361329530` (2 voters). Found F0.
  - Main run — event `3907417823`, Semaphore script `addr_test1wzedkt4d3jclzq363pl8rwpvngx9k7kktq4p842trsralcsfwuwjj`,
    Voting script `addr_test1wpdyadvg7f5fu3fc58yc09rv0uj9tu9rut0yqgrqje837dgfz3ugr`.
    12 votes confirmed, final tally API = chain = expected (6/3/3). Double vote, replay, non-member, late registrant,
    too-late vote: all rejected correctly.
  - A separate five-person live test by Dominik (event `1869725828`) showed F6, F9, F10 from the user side.
- Full report with timeline, state trace and explorer links: `ZK-Voting-M4-Testreport-2026-10-05.md`.
- Tx links: `https://preprod.cexplorer.io/tx/<hash>`.

## Owners

| Agustin — backend / blockchain | Dominik — UI |
|---|---|
| **F0** nullifier trie detaches after a rollback (**critical — start here**) | **F3** no rollback when tx build fails |
| **F1** public API leaks `adminToken`, e-mails | **F9** interim results visible while voting is open |
| **F2** unauthenticated nullifier endpoints (DoS) | **F10** misleading vote error messages |
| **F7** concurrent registrations lose members | **F12 (UI part)** clear message instead of HTTP 500 |
| **F6** concurrent votes conflict (queue) | |
| **F11** event start: 2nd mint on a spent input (tx/UTxO logic in the frontend) | |
| **F12 (API part)** 404/409 instead of 500 for non-members | |
| **F8** Blockfrost key out of the frontend (backend proxy) | |
| **F4 / F5** privacy design (relayer, userId ↔ vote linkage) | |

Suggested order: **F0 → F7 → F2 → F1**, then the rest. F0, F7 and F2 can each break a real event.

---

## F0 — After one rolled-back vote, every later vote fails · Critical · Agustin

**What happens.** If the first vote attempt of an event fails after the nullifier was inserted (too early, declined
signature, network error, …) and the frontend rolls the nullifier back, the trie is empty again. From then on the
backend builds every MPF proof against an **empty trie**, and the Semaphore validator rejects every later vote. Only
one vote per event ever succeeds. All six minted live events had at most one vote on-chain.

**Where.** `src/backend/src/voting-event/voting-event.service.ts:714` (insertNullifier) and `:773`
(rollbackNullifier); same pattern in `src/zk/src/mpf.ts:48`:
```ts
const trie = await Trie.load(store).catch(() => new Trie(store));
```

**Root cause.** In `@aiken-lang/merkle-patricia-forestry` 1.3.1, `Trie.load` does
`root.equals(NULL_HASH) ? new _Trie() : …` — for an empty saved root it returns a trie with a **new in-memory
store**, not the LevelDB store. After a rollback empties the trie, `__root__` is stored as the null hash, so every
later `load` returns a detached in-memory trie: inserts never reach LevelDB, every proof has 0 steps.

**Evidence (dry run, event `7361329530`).**
- Sequence: C1 vote before start → rejected (`OutsideValidityIntervalUTxO`) → nullifier rolled back → trie empty.
- V01 voted: confirmed, tx `1b7f6726208f9cef8fd6437e1f6e8dea6edb580d3a4a55c95e6c629e952dbec1` (MPF root after
  `cefcc2a6…87df`).
- V02 failed 3× (options B and C) with `PlutusFailure` in Semaphore script `ff617c42…1126`, failing tx id e.g.
  `0a196ff4caa198073bdc8848eb8ce488793f1e54dfbfae7853e4f3b6a88d0fc3` (rejected, not on-chain).
- The V02 redeemer carried an **empty** MPF proof; its new root `218fd498…2cd3` equals a trie containing **only** V02.
  Correct new root for {V01, V02} would be `b766d8e0…4a48` with one `leaf` step.
- Checked with aiken v1.1.19 against the live tx data: fails at `expect excluding(key, proof) == self.root` in
  `mpf.insert`. With the correct one-step proof the same check passes.
- Ruled out: stale validators (deployed CBOR is byte-identical to a fresh build of cardano-semaphore v0.9.4),
  signal hash ≥ r, wrong group root, G1/G2 compression.

**Reproduce offline (no chain needed).**
```js
const { Trie, Store } = require('@aiken-lang/merkle-patricia-forestry');
const store = new Store('/tmp/mpf-repro'); await store.ready();
const load = () => Trie.load(store).catch(() => new Trie(store));       // current backend code
let t = await load(); await t.insert(k1, v1);                            // C1 insert
t = await load(); await t.delete(k1);                                    // rollback → empty
t = await load(); await t.insert(k1, v1);                                // V01
t = await load(); await t.insert(k2, v2);
console.log((await t.prove(k2)).toJSON().length);                        // 0 — should be 1
```

**Fix (verified offline: proofs 0/0/1/1, roots match a fresh reference trie).**
```ts
async function loadTrie(store) {
  try {
    const trie = await Trie.load(store);
    return trie.isEmpty() ? new Trie(store) : trie;    // re-attach an empty trie to LevelDB
  } catch (e) {
    if (/NotFound/.test(String(e))) return new Trie(store); // no trie yet
    throw e;                                                 // don't swallow real errors
  }
}
```
Use it at all three places. Existing events whose trie is already detached stay broken until their trie is rebuilt
from on-chain vote data (not needed for M4 — new events are fine).

**Verify after deploy.** New event; first vote attempt before the start (gets rolled back); then ≥3 votes in a row
must all confirm.

---

## F1 — Public event API leaks admin tokens and invitee e-mails · High · Agustin

**What.** `GET /voting-event` and `GET /voting-event/:eventId` (controller `:27`, `:32`) are unauthenticated and
return per event: `adminToken` (opens the admin page), `invitedParticipants` (e-mail addresses),
`groupLeafCommitments` (userId → commitment) and more.

**Evidence.** Checked 2026-10-05 on the live API — field names only, values were not read:
`curl -s https://api.vote.trustlevel.io/voting-event | jq '.[0] | keys'`

**Fix.** Return a public projection without these fields; admin data only with a valid admin token. Check which
fields the frontend actually reads (event page vs. manage page) before trimming.

---

## F2 — Nullifier endpoints are unauthenticated (anyone can block voting) · High · Agustin

**What.** `POST` and `DELETE /voting-event/:eventId/nullifier` (controller `:160`, `:170`) accept any value from
anyone. A junk insert or a deleted confirmed nullifier makes the backend trie diverge from the on-chain root, and
every following legitimate vote fails. Double voting is still prevented on-chain — this is a DoS.

**Evidence (main run).** MPF root on-chain vs. backend:

| Step | On-chain | Backend | Legitimate vote V10 |
|---|---|---|---|
| after junk `POST nullifier` | `3474451f…` | `44bc344c…` | rejected (Plutus failure) |
| after `DELETE` of the junk | `3474451f…` | `3474451f…` | — |
| after `DELETE` of V01's confirmed nullifier | `3474451f…` | `5f29c4ce…` | rejected (Plutus failure) |
| after re-inserting V01's nullifier | `3474451f…` | `3474451f…` | **confirmed** `89be23183e5653dd9f2a8ff6988362d312e38d9879b40822f2009a60bbf476eb` |

**Fix.** Only insert a nullifier together with a server-side verified ZK proof; remove the public DELETE (rollback
should be internal, e.g. tied to a pending-vote id); periodically reconcile the trie root with the Semaphore datum.

---

## F3 — No rollback when the vote tx fails to build · Medium · Dominik

**What.** In `submitVote()` (`src/frontend/app/event/[id]/page.tsx`) the rollback helper is defined at `:656`,
**after** `buildVoteTransaction` (`:629`). If building throws, the nullifier stays inserted; the voter's next try gets
HTTP 409 ("Nullifier already used") and they can't vote without help. Derived from the code, not observed.

**Fix.** Track "nullifier inserted" and roll back in the outer `catch`.

---

## F4 — Vote choice is public and tied to the paying wallet · Medium · Agustin (design)

**What.** The ZK proof hides *which member* votes, but `signal_message` (the option) is plaintext in the redeemer and
the fee-paying wallet is on the same tx. Report §8 decodes all 12 votes (wallet → tx → option → nullifier) from
chain data alone.

**Fix (design).** A relayer/fee sponsor so voter wallets never appear in vote txs; encrypted ballots if vote secrecy
(not just anonymity) is a goal.

## F5 — Backend can link userId to vote · Medium · Agustin (design)

**What.** Per vote the backend sees `GET merkle-proof/:userId`, ~2 s later `POST nullifier`, ~3 s later
`POST vote` (signed tx) from the same client (report §9). An operator logging these can join userId → vote.

**Fix.** Serve the frozen group so clients compute their Merkle path locally; decouple submission from the userId
request.

---

## F6 — Concurrent votes conflict · Medium · Agustin

**What.** Every vote spends and recreates the same Semaphore + Voting UTxOs; the backend trie advances on insert,
not on confirmation. Two votes in the same block window collide.

**Evidence (main run, B1/B2).** V11, V12, V13 started within ~2 s. V11 confirmed
(`e4e4430584bd0f6d9aac1eddeb0be7c087e7285e891333e45bf51c31ac82ce57`); V13 rejected ("inputs already spent"), rolled
back, retried after V11's confirmation and confirmed (`dd7c1e4e72d60d6a0e2c70485b0c22a728e59471b4a1ac30c569f563792e9f5a`).
(V12 failed for a different reason — see F7.) Dominik's live test showed the same: rejected, then OK on retry.

**Fix.** Serialise vote submission per event in the backend (queue: hand out the next MPF proof only after the
previous vote is confirmed or timed out), or move to a batching design.

---

## F7 — Concurrent registrations silently lose members · High · Agustin

**What.** `addParticipant` (`voting-event.service.ts:145`) reads `groupLeafCommitments`, adds one, writes it back —
no lock/transaction. Simultaneous registrations overwrite each other, yet all get HTTP 201.

**Evidence (main run, R1).** V11–V13 registered at the same moment: all three got 201, the group ended with
13 members instead of 14. V12 (userId `29`) was missing, so it wasn't in the root frozen at mint; every vote
attempt failed at `GET merkle-proof/29` with HTTP 500. The user thinks they're registered and can never vote.

**Fix.** DB transaction or per-event mutex around registration; after writing, re-read and verify the commitment is
in the list (return an error otherwise).

---

## F8 — Blockfrost key is public in the frontend bundle · Medium · Agustin

**What.** `NEXT_PUBLIC_BLOCKFROST_API_KEY` is inlined into the live JS chunks and accepted by Blockfrost (checked
2026-10-05; value not printed). Anyone can burn the quota and stop voting for everyone. No wallet/fund access.
Already in CLAUDE.md "Known Improvements".

**Fix.** The planned `GET /voting-event/:eventId/script-utxos` + builders taking pre-fetched UTxOs; until then a
separate, rotatable frontend-only key. (Note: Dominik currently can't log in to Blockfrost — `OAuthCallback` error —
so the key can't be rotated right now.)

---

## F9 — Interim results visible while voting is open · Medium · Dominik

**What.** In the live test, a voter who had voted saw the running tally while others were still voting.

**Fix.** Hide results in the UI until `endingDate`. Note: the tally is also readable on-chain (datum + plaintext
votes, F4), so real tally secrecy needs encrypted ballots / commit–reveal.

## F10 — Misleading vote error messages · Low · Dominik

**What.** `classifySubmissionError` (`page.tsx:449`) checks `ValueNotConserved` before `BadInputs`; a vote built on
UTxOs already spent by a pending tx shows "Insufficient funds" although the wallet has enough ADA (seen in the live
test, where one wallet was used for several voters). Unknown errors fall through to a generic message.

**Fix.** Check `BadInputs`/conflicting inputs first → "A previous transaction is still pending — wait a minute and
retry"; show a short error reference.

---

## F11 — Event start can fail between the two mints · Medium · Agustin

**What.** `handleStartVoting` (`src/frontend/app/event/[id]/manage/page.tsx:856`) reads the admin's UTxOs from
Blockfrost right after the Group NFT mint confirmed and picks index 0 (`:864`). Blockfrost can still list the input the
group mint just spent → the Semaphore+Voting mint fails with `ConwayMempoolFailure "All inputs are spent"`. The admin
has to restart, which mints another Group NFT (the earlier one is orphaned).

**Evidence (main run).** Two failed starts — orphaned group mints
`bb2e97185208dfc90d5f27b1bd45f7e968f3c3e1fdd06bb32e9d22cff362808d` and
`08b1aa6c1405927e1c391ff60a93746cb0704414e3d70a0bb8c1eec7fab9a083`; the third start succeeded
(group `a119e69d…`, Semaphore+Voting `c4459ea18993e3ce566e66d61d3eb6282fac75f99806a7394249bbc772243c1b`).
Cause likely but not proven: on the successful try the spent input was already gone from the index.

**Fix.** Exclude the group-mint tx's inputs from the selection (or use its change output directly); retry with
backoff on "inputs spent".

---

## F12 — Non-members get HTTP 500 · Low · Agustin (API) + Dominik (UI)

**What.** `GET /voting-event/:eventId/merkle-proof/:userId` (`service :614`) throws → "Internal server error" when
the user isn't in the group: late registrant V14 (userId `31`, registered after the mint) and the lost V12 (F7).

**Fix.** API: 404/409 with "not part of this vote's group (registered after voting started)". UI: show that message.
