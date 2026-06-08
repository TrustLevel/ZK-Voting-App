# TODO — Deferred Tasks

## 1. Nullifier rollback on vote failure
**File:** `src/frontend/app/event/[id]/page.tsx`

After `POST /nullifier` succeeds, track `nullifierInserted = true`. If the subsequent `POST /vote` call returns an error, call `DELETE /voting-event/:eventId/nullifier` with the same nullifier hash before throwing — so the voter is not permanently locked out and can retry.

The existing `catch` block at the bottom of `handleVote` already displays the error; the rollback call goes inside the `!submitResponse.ok` branch, before the `throw`.

---

## 2. "Sync Group NFT" button on Start Voting tab
**File:** `src/frontend/app/event/[id]/manage/page.tsx`

Once the SV mint is complete (`createdEvent?.votingNft` is set), a **"Sync Group NFT"** button should appear at the bottom of the Start Voting tab (below the "See Results" or success card). This mirrors the button already present on the Participants tab but lives here so the admin can update the Merkle root without switching tabs mid-flow.

The button should call `handleUpdateGroupNft()` (already implemented) and show the same status/tx-hash feedback as the Participants tab version.

---

## 3. Rename "Start Voting" tab to "Update Voting" after minting
**File:** `src/frontend/app/event/[id]/manage/page.tsx`

Once `createdEvent?.votingNft` is set (event already minted), the step badge label and the tab navigation label for step 3 should read **"Update Voting"** instead of **"Start Voting"**, making it clear to the admin that minting is already done and the only remaining action is syncing the group.

---

## 4. Show committed vs pending participants in the on-chain success card
**File:** `src/frontend/app/event/[id]/manage/page.tsx`

In the green "Event Published to Blockchain" success card (and possibly on the existing minted state card when `createdEvent?.votingNft` is set), add a summary line showing:
- How many participants have **registered** (committed their identity to the Merkle tree)
- How many are still **pending** (invited but not yet registered)

Example: _"3 of 5 participants have committed their identity. 2 still pending — they can still register and be included via Sync Group NFT."_

This helps the admin understand whether they need to run a group update before the voting period starts.
