# Relay Vote Design — Option B

**Goal:** Backend builds, signs, and submits vote transactions on behalf of voters.  
The voter's CIP-30 wallet never touches the vote transaction; only ZK proof data is sent to the server.

**Addresses:** F4 (wallet deanonymisation), F8 (Blockfrost key exposure), F6 (concurrent vote conflicts).

---

## Current flow (to be replaced)

```
Frontend:
  1. generateVoteProof()         — ZK proof (in browser, secrets stay client-side)
  2. POST /nullifier              — insert nullifier, receive MPF proof + new root
  3. buildVoteTransaction()       — assemble unsigned TX with voter's wallet UTxOs (Blockfrost key in browser)
  4. wallet.signTx()              — CIP-30 prompts the user
  5. POST /vote { signedTx }      — backend submits to Blockfrost
```

Problems:
- Voter's wallet address appears on-chain (fees, change, required-signer hash) → deanonymisation.
- `BlockfrostProvider` API key lives in the browser.
- No serialisation of concurrent vote submissions (F6).

---

## New flow (Option B)

```
Frontend:
  1. generateVoteProof()         — ZK proof (unchanged; secrets stay in browser)
  2. POST /nullifier              — unchanged
  3. POST /relay-vote { proofData } — new endpoint; sends only proof data, no wallet involved

Backend:
  4. Load relay wallet from RELAY_WALLET_MNEMONIC
  5. Re-derive validator CBORs via applyOrefParamToScript()
  6. Fetch current vote tallies from on-chain Voting UTxO datum
  7. buildVoteTransaction() with relay wallet UTxOs
  8. Sign with MeshWallet (relay wallet)
  9. Submit to Blockfrost (backend API key)
 10. Return { txHash }
```

The voter's wallet is no longer part of the vote transaction at any step.  
The smart contract does not check `txInfoSignatories` — the required-signer field in the tx will use the relay wallet's payment key hash.

---

## Implementation plan

### Step 1 — `src/tx/src/node/vote.ts`

The node version of `buildVoteTransaction` already exists. One change is needed:

**Add `fetchCurrentOptions()`** — a helper that decodes the on-chain `UrnaDatum` from the Voting UTxO to extract the current vote tallies. This avoids passing `currentOptions` as a parameter from the backend (which would require datum decoding in NestJS).

```ts
export async function fetchCurrentOptions(
  provider: BlockfrostProvider,
  votingScriptAddress: string,
  votingNftPolicyId: string,
): Promise<Array<[number, number]>>
```

Decode the inline datum CBOR from the UTxO already fetched in `buildVoteTransaction`. The on-chain `UrnaDatum` is:
```
Constr 0 [weight, options, eventStart, eventEnd, semaphoreNftPolicyId]
```
where `options` is `List<Pair<Int, Int>>` — the current tallies.

Alternatively, add an overload `buildRelayVoteTransaction` that takes everything except `currentOptions` / `walletUtxos` / `walletAddress` / `paymentKeyHash` and derives those internally. This is the preferred approach — fewer moving parts at the call site.

**New export: `buildRelayVoteTransaction`**

```ts
export interface BuildRelayVoteTransactionParams
  extends Omit<BuildVoteTransactionParams, 'walletUtxos' | 'walletAddress' | 'paymentKeyHash' | 'currentOptions'> {
  relayWalletUtxos: UTxO[];
  relayWalletAddress: string;
  relayPaymentKeyHash: string;
  // currentOptions is derived internally from the on-chain Voting UTxO datum
}

export async function buildRelayVoteTransaction(
  params: BuildRelayVoteTransactionParams,
): Promise<string>
```

Inside: fetch Voting UTxO, decode datum to get `currentOptions`, then call the existing logic with `relayWalletUtxos` in place of `walletUtxos`.

**Note on `requiredSignerHash`:** Keep it, pointing to the relay wallet's payment key. The smart contract does not check signatories; this just ensures the relay wallet's key is present in the tx witnesses (which it will be, since the relay wallet signs).

---

### Step 2 — `src/backend/src/voting-event/voting-event.service.ts`

Add `relayVote(eventId, payload)`.

**Inputs from the event entity:**
- `semaphoreAddress`, `semaphoreNft`
- `votingValidatorAddress`, `votingNft`
- `groupNft`, `groupMerkleRootHash`
- `mintingOrefTxHash`, `mintingOrefIndex` → `applyOrefParamToScript()`
- `votingPower`, `startingDate`, `endingDate`

**Inputs from the request body (see Step 3):**
- `piA`, `piB`, `piC`, `nullifierHash`, `signalHash`, `signalMessage`
- `mpfProofSteps`, `mpfNewRoot`
- `voteSignal: Array<[number, number]>`

**Relay wallet initialisation:**
```ts
import { MeshWallet, BlockfrostProvider } from '@meshsdk/core';

const provider = new BlockfrostProvider(process.env.API_KEY);
const wallet = new MeshWallet({
  networkId: 0,  // testnet
  fetcher: provider,
  key: { type: 'mnemonic', words: parseMnemonic(process.env.RELAY_WALLET_MNEMONIC) },
});
const relayWalletUtxos = await wallet.getUtxos();
const relayWalletAddress = await wallet.getChangeAddress();
const relayPaymentKeyHash = extractPaymentKeyHash(relayWalletAddress);
```

The relay wallet is already initialised this way for minting (`src/tx/src/node/mint-group.ts`). The service can instantiate it once on startup (or lazily on first call).

**Validator CBORs:**
```ts
import { VALIDATORS, applyOrefParamToScript } from '@src/tx';
const mintingOref = { txHash: event.mintingOrefTxHash, outputIndex: event.mintingOrefIndex };
const semaphoreValidatorCbor = applyOrefParamToScript(VALIDATORS.semaphore.spend, mintingOref);
const votingValidatorCbor    = applyOrefParamToScript(VALIDATORS.voting.spend, mintingOref);
```

**Submit flow:**
```ts
const unsignedTx = await buildRelayVoteTransaction({ provider, ...eventFields, ...walletFields, ...proofFields });
const signedTx   = wallet.signTx(unsignedTx, true);
const txHash     = await this.blockfrostSubmit(signedTx);
return { txHash };
```

**Concurrency (F6):** Wrap the relay wallet fetch + build + sign + submit in a per-network async mutex (same promise-chain pattern as `withRegistrationLock`; the relay wallet is shared by all events of a network, so a per-event lock is not enough — learned in the 2026-10-29 tests). This prevents two concurrent vote submissions from selecting the same UTxOs.

```ts
private readonly voteLocks = new Map<number, Promise<any>>();
private withVoteLock<T>(eventId: number, fn: () => Promise<T>): Promise<T> { ... }
```

The relay wallet's collateral UTxO is the first UTxO in `relayWalletUtxos` (as in the existing `buildVoteTransaction`). The per-network mutex ensures only one vote tx is in-flight per event at any time, so collateral is never double-spent.

---

### Step 3 — `src/backend/src/voting-event/voting-event.controller.ts`

Add a new `POST /:eventId/relay-vote` endpoint.

Keep `POST /:eventId/vote` (submits a pre-signed tx) for backward compatibility and for the manage-page group-update flow. Only the voter vote path moves to relay.

**Request body:**
```ts
@Post(':eventId/relay-vote')
async relayVote(
  @Param('eventId') eventId: number,
  @Body('piA') piA: string,
  @Body('piB') piB: string,
  @Body('piC') piC: string,
  @Body('nullifierHash') nullifierHash: string,
  @Body('signalHash') signalHash: string,
  @Body('signalMessage') signalMessage: string,
  @Body('mpfProofSteps') mpfProofSteps: Array<object>,
  @Body('mpfNewRoot') mpfNewRoot: string,
  @Body('voteSignal') voteSignal: Array<[number, number]>,
  @Body('nullifier') nullifier?: string,   // for rollback on submit failure
) {
  return this.votingEventService.relayVote(eventId, {
    zkProof: { pi_a: piA, pi_b: piB, pi_c: piC },
    nullifierHash: BigInt(nullifierHash),
    signalHash: BigInt(signalHash),
    signalMessage,
    mpfProofSteps,
    mpfNewRoot,
    voteSignal,
    nullifier,
  });
}
```

The `nullifier` field is optional and used only for server-side rollback if Blockfrost submission fails (same pattern as `submitVote`).

---

### Step 4 — `src/frontend/app/event/[id]/page.tsx`

Remove all wallet interaction from the vote submission path.

**Remove:**
- `wallet.enable()` / `wallet.getUtxos()` / `wallet.getChangeAddress()` / `wallet.getNetworkId()` during vote
- `buildVoteTransaction()` call and all its params setup (Blockfrost key, CSL loading)
- `wallet.signTx()` call
- All `@src/tx` imports used only for vote tx building

**Keep:**
- `generateVoteProof()` — ZK proof stays in browser (identity secrets must not leave client)
- `POST /nullifier` — unchanged
- `POST /relay-vote` — replace `POST /vote { signedTx }` with proof data payload

**New submit call (simplified):**
```ts
const response = await fetch(`${BACKEND_URL}/voting-event/${eventId}/relay-vote`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    piA: compressedProof.pi_a,
    piB: compressedProof.pi_b,
    piC: compressedProof.pi_c,
    nullifierHash: nullifierHash.toString(),
    signalHash: signalHash.toString(),
    signalMessage,
    mpfProofSteps,
    mpfNewRoot,
    voteSignal,
    nullifier: nullifierHash.toString(),
  }),
});
const { txHash } = await response.json();
```

**Wallet connection:** The manage page and group-update flow still use CIP-30. The voter vote page no longer requires wallet connection at all — or at minimum, no longer needs UTxO fetching / signing. The wallet connect button on the vote page can be removed or made optional (e.g. shown only to allow verifying membership by commitment).

---

### Step 5 — Environment

The backend reads the relay wallet mnemonic from `RELAY_WALLET_MNEMONIC` and uses its own `BLOCKFROST_API_KEY` (both in `src/backend/.env`, or `deploy/.env` in the Docker deploy).

Ensure the relay wallet (the wallet whose mnemonic is in `RELAY_WALLET_MNEMONIC`) has:
- Enough ADA to cover fees for each vote transaction (~0.2–0.5 ADA per tx).
- A suitable collateral UTxO (pure ADA, ≥2 ADA).

---

## Networks and the fee model (Mainnet)

The backend serves Preprod and Mainnet side by side. Each event carries its `network`
(chosen at creation, immutable); `relayVote` uses the Blockfrost key, relay wallet, network id
and VKey reference UTxO of that network (`NetworkConfig`, `src/backend/src/network/`).

On Mainnet the relay wallet pays real ADA for every vote, from a hot wallet on the server.
Anyone can create an event and invite arbitrary addresses, so without a budget an attacker
could register N identities and drain the relay. The ZK group is frozen when the event is
published and each member votes at most once, so `registered voters × fee per vote` is a hard
upper bound on what an event can cost. That bound is what the organiser prepays:

1. **Fee deposit before publishing.** On fee-deposit networks (`FEE_DEPOSIT_NETWORKS`, default
   `mainnet`) the Start Voting tab asks the organiser's wallet to send
   `registered voters × 1.3 ADA` (`FEE_PER_VOTE_LOVELACE`; the measured vote fee on Preprod is
   1.07–1.09 ADA) to the relay wallet address of the network. The deposit is the cost of the
   event; an unused remainder is not refunded (stated in the UI before the wallet opens).
2. **On-chain verification.** `POST /:eventId/confirm-fee-deposit { txHash }` (admin token)
   fetches the tx with the backend's own Blockfrost key, sums the outputs to the relay address,
   requires at least the still-missing amount, refuses a hash that was used before, and books
   the amount as `feeBudgetLovelace`. Voters who register between the deposit and the publish
   raise the required amount; a further deposit tops the budget up.
3. **Budget check per vote.** `relayVote` answers HTTP 402 before verifying the proof when the
   event has no deposit or `feeSpentLovelace + FEE_PER_VOTE_LOVELACE > feeBudgetLovelace`.
   After a successful submit the actual fee of the signed tx (`getTxFeeLovelace`) is added to
   `feeSpentLovelace`.
4. **Preprod stays free.** No deposit, no budget check; setting
   `FEE_DEPOSIT_NETWORKS=mainnet,preprod` on a test deployment exercises the deposit path
   with test ADA.

Rejected: voters paying their own tx (breaks the relay anonymity, F4), a service-funded cap
(drainable, not sustainable with real ADA), per-event relay addresses derived from the mnemonic
(cleaner ledger, more key-derivation surface — possible follow-up), automatic refunds
(outbound payments from the hot wallet are a new attack surface). Operator steps for Mainnet:
[MAINNET_SETUP.md](../operations/MAINNET_SETUP.md).

## Security notes

| Concern | Mitigation |
|---|---|
| Relay wallet drained by spam | Rate-limit `POST /relay-vote` per IP / per identity commitment. The ZK proof check (Step 6 in flow) is the authoritative guard; a valid proof was already checked by `POST /nullifier`. |
| Server-side proof re-use | The nullifier is inserted before `relayVote` is called. If Blockfrost fails, `relayVote` rolls back the nullifier (same as current `submitVote`). |
| Voter deanonymisation via IP | Relay wallet prevents on-chain linkage. IP linkage is a separate concern (Tor / VPN out of scope). |
| Concurrent relay votes | Per-event `voteLocks` mutex ensures UTxO selection is serialised; no double-spend of collateral. |
| `currentOptions` race | Fetched live from the on-chain UTxO inside `buildRelayVoteTransaction`, so stale DB values never cause a wrong tally. |

---

## File change summary

| File | Change |
|---|---|
| `src/tx/src/node/vote.ts` | Add `buildRelayVoteTransaction` + `fetchCurrentOptions` |
| `src/tx/src/index.ts` | Export `buildRelayVoteTransaction` |
| `src/backend/src/voting-event/voting-event.service.ts` | Add `relayVote()`, relay wallet init, `withVoteLock` |
| `src/backend/src/voting-event/voting-event.controller.ts` | Add `POST /:eventId/relay-vote` endpoint |
| `src/frontend/app/event/[id]/page.tsx` | Remove tx building / wallet signing; call `/relay-vote` |

`POST /:eventId/vote` is gone (F2). Admin transactions that require the organiser's CIP-30 signature use the pattern below.

---

## Organiser transactions (no Blockfrost in the browser)

The organiser's publish flow follows the same principle as the relay: the backend owns every
chain access, the browser only signs. `OrganiserTxService` (`src/backend/src/voting-event/organiser-tx.service.ts`):

| Step | Endpoint (admin token) | Backend does |
|---|---|---|
| 1 | `POST build-group-mint-tx` `{ walletAddress, walletUtxos }` | validates address/UTxOs, derives the payment key hash, reads the Merkle root from the DB, checks network enabled / deposit funded (402) / not yet on-chain (409), builds the Group mint, stores the pending tx and the wallet's UTxO refs (F11) in `publish_state` |
| 2 | `POST submit-tx` `{ signedTx }` | accepts only a tx whose id matches a pending one, evaluates then submits, persists `groupNft`, `groupValidatorAddress`, `groupValidatorCbor` |
| 3 | `GET tx/:hash` | confirmation polling |
| 4 | `POST build-semaphore-voting-mint-tx` `{ walletAddress, startingDate, endingDate }` | waits for the Group NFT UTxO to be indexed (409 `GROUP_NFT_NOT_INDEXED` → retry), spends only UTxOs created after the Group mint, derives the validity window and both datums, stores the pending tx |
| 5 | `POST submit-tx` | persists Semaphore/Voting NFTs, minting oref, VKey ref, dates, the Merkle snapshot; clears `publish_state` |
| Mainnet | `POST build-fee-deposit-tx` → `submit-tx` → `confirm-fee-deposit` | plain payment of the missing deposit (amount computed server-side) |

A rebuilt Group mint replaces the whole `publish_state`, so a stale transaction id never blocks a
retry; a fully published event (Voting NFT set) cannot be published again (409).

---

## Open questions

1. **`currentOptions` decoding** — does `@meshsdk/core` expose a datum CBOR decoder, or do we need `@emurgo/cardano-serialization-lib-nodejs` directly? The node vote.ts already imports `MeshTxBuilder`; CSL is already a transitive dep.

2. **Relay wallet balance monitoring** — should the backend expose a health endpoint that warns when relay wallet ADA falls below a threshold?

3. **Transaction confirmation** — `relayVote` returns `txHash` immediately after Blockfrost accepts the submission (same as current `submitVote`). The frontend can poll `GET /current-slot` or use Blockfrost webhooks to confirm finality. No change needed now.
