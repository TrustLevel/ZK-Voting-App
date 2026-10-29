# Mainnet setup — one-off steps for the operator

The application serves **Cardano Preprod and Mainnet side by side**: the organiser chooses the
network when creating an event, and every call for that event (Blockfrost, relay wallet,
transaction builders, explorer links) follows it. Preprod needs nothing new. Mainnet is
**disabled until the operator completes the steps below** — the create form greys it out and the
backend refuses Mainnet events until a Blockfrost key, a relay wallet and the VKey reference
UTxO are configured.

Everything in this document that sends ADA is done **by the operator, by hand**, with real
ADA. Rehearse the whole sequence on Preprod first (section 6): the scripts are identical, only
`NETWORK` differs.

---

## 1. What runs where, and who pays

| Transaction | Who pays | Mainnet cost |
|---|---|---|
| VKey reference UTxO (once per network, by the operator) | operator | **5 ADA locked forever** + ≈ 0.2 ADA fee |
| Relay wallet collateral (once, by the operator) | operator | one plain-ADA output ≥ 5 ADA, never spent unless a script fails |
| Fee deposit (once per event, by the organiser) | organiser | registered voters × **1.3 ADA**, sent to the relay wallet |
| Group NFT mint + Semaphore/Voting NFT mint (per event, by the organiser) | organiser | **15 ADA locked** in the three contract UTxOs + ≈ 1.5 ADA fees; the wallet also needs a plain-ADA output ≥ 5 ADA as collateral |
| Each vote (by the relay wallet, out of the event's deposit) | relay wallet | ≈ 1.08 ADA measured on Preprod |

The fee deposit is the cost of the event. The backend verifies the deposit transaction on-chain
and only relays votes while the event's budget covers them (HTTP 402 otherwise). **An unused
remainder is not refunded** — the publish step, the organiser guide and this document say so
before the organiser sends it. The relay wallet's balance is therefore bounded by the deposits of
live events plus the collateral: keep nothing else on it.

---

## 2. Prerequisites

- A **Blockfrost Mainnet project** (project id starts with `mainnet`). Create two: one for the
  backend (`BLOCKFROST_API_KEY_MAINNET`) and one for the browser
  (`NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET`), so they can be rotated independently.
- A **fresh 24-word Mainnet wallet for the relay** (never the Preprod mnemonic, never a wallet
  that holds anything else). Note its first address (`addr1…`); the backend prints it as
  `relayAddress` in `GET /voting-event/networks` once configured.
- A **funding wallet** you control (Eternl/Lace or a CLI wallet) with about **12 ADA**: 5 ADA
  for the VKey UTxO, 5 ADA for the relay collateral, the rest for fees.
- The repository built locally (`npm ci`, `cd src/zk && npm run build`, `cd src/tx && npx tsc`).

---

## 3. Deploy the VKey reference UTxO (once)

The Semaphore validator reads the Groth16 verification key from a read-only reference input on
every vote. That UTxO is locked at the always-false script address and can never be spent:

| Network | Always-false address |
|---|---|
| Preprod | `addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8` (VKey UTxO `3dc5c982…#0`, already deployed) |
| Mainnet | `addr1wxl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgkx740z` |

The script `src/tx/scripts/deploy-vkey.ts` builds the datum from `src/zk/keys/verification_key.json`
(the same key the backend verifies proofs with) and sends **exactly 5 ADA** to that address.

```sh
cd src/tx
# Dry run first: builds the transaction, prints wallet and amounts, signs nothing.
NETWORK=mainnet API_KEY=<mainnet backend Blockfrost key> SECRET_KEY="<24 words of the funding wallet>" DRY_RUN=1 npx tsx scripts/deploy-vkey.ts
# Real run: signs, submits and prints the tx hash.
NETWORK=mainnet API_KEY=<mainnet backend Blockfrost key> SECRET_KEY="<24 words of the funding wallet>" npx tsx scripts/deploy-vkey.ts
```

Write down the printed **tx hash**; the output index is **0**. Wait for one confirmation, then
verify that the datum on-chain equals the local verification key and that the UTxO is unspent:

```sh
NETWORK=mainnet API_KEY=<mainnet backend Blockfrost key> npx tsx scripts/verify-vkey.ts <txhash>#0
```

The script exits 0 and prints `OK` when every field matches. Do not continue on a mismatch.

Pass the mnemonic through an environment variable or a `.env` file in `src/tx` (gitignored);
never paste it into a shell history that is kept, a chat, or a ticket.

---

## 4. Fund the Mainnet relay wallet (once)

Send **one plain-ADA output of at least 5 ADA** (for example exactly 6 ADA, no tokens) from the
funding wallet to the relay wallet address. This output is the collateral for every vote
transaction and is only ever consumed if a Plutus script fails on-chain, which the backend's
pre-submission evaluation prevents. Nothing else needs to be on the wallet: each event's votes
are paid out of that event's fee deposit, which organisers send to the same address.

Check the balance with Blockfrost or an explorer: `https://cardanoscan.io/address/<relayAddress>`.

---

## 5. Configure and deploy

Set the following in `deploy/.env` (or the backend `.env` for a local run), **in this order**:

| Variable | Value |
|---|---|
| `BLOCKFROST_API_KEY_MAINNET` | the backend's Mainnet Blockfrost project id (`mainnet…`) |
| `RELAY_WALLET_MNEMONIC_MAINNET` | the 24 words of the Mainnet relay wallet |
| `VKEY_REF_MAINNET` | `<txhash>#0` from section 3 |
| `NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET` | the browser's Mainnet Blockfrost project id (frontend, inlined at build time) |
| `FEE_DEPOSIT_NETWORKS` | leave unset (default `mainnet`) |

The existing Preprod variables (`BLOCKFROST_API_KEY`, `NEXT_PUBLIC_BLOCKFROST_API_KEY`,
`RELAY_WALLET_MNEMONIC`) stay as they are. Rebuild and restart (`NEXT_PUBLIC_*` values are
baked into the frontend image):

```sh
cd deploy && docker compose up -d --build
```

Then confirm that Mainnet is enabled:

```sh
curl -s https://<API_DOMAIN>/voting-event/networks | jq
```

Expected for `mainnet`: `"enabled": true`, `relayAddress` starting with `addr1`,
`feeDepositRequired: true`, `vkeyRef` equal to the deployed UTxO. The create form now offers
**Mainnet** as a choice.

Optional but recommended once: put the Mainnet VKey UTxO into `src/tx/src/network.ts`
(`VKEY_REF.mainnet`) so the constant is in the repository like the Preprod one; the environment
variable keeps working either way.

---

## 6. Rehearsal on Preprod

Run the same sequence against Preprod before touching Mainnet:

1. `NETWORK=preprod … DRY_RUN=1 npx tsx scripts/deploy-vkey.ts` — the script refuses to deploy a
   second Preprod VKey UTxO unless `FORCE=1` is set; the dry run shows the wallet, the lock
   address and the amount.
2. `NETWORK=preprod API_KEY=<preprod key> npx tsx scripts/verify-vkey.ts` — checks the existing
   Preprod UTxO (`3dc5c982…#0`) and prints `OK`.
3. To rehearse the **fee deposit** with test ADA, start a local backend with
   `FEE_DEPOSIT_NETWORKS=mainnet,preprod`, create a Preprod event, invite and register one
   participant, and publish: the Start Voting tab shows the deposit box, the wallet sends
   1.3 tADA to the Preprod relay address, the backend confirms it, the vote succeeds, and
   `GET /voting-event/:id/fee-deposit` (with the admin token) shows the booked fee.

The live Preprod deployment keeps `FEE_DEPOSIT_NETWORKS` unset, so Preprod stays free there.

---

## 7. First Mainnet event (joint step)

1. Create an event with **Mainnet** selected (the choice cannot be changed later).
2. Invite one or two participants and wait until they are registered.
3. On **Start Voting**: connect a Mainnet wallet (the page refuses a wallet on another
   network), send the **fee deposit** (1.3 ADA per registered voter), wait until the box shows
   *Funded*, then **Publish** (two signatures, ≈ 25 ADA available in the wallet).
4. Let a participant vote. The relay pays the fee from the deposit; the explorer link on the
   confirmation goes to `cardanoscan.io`.
5. After the end date, read the results.

What to watch: `docker compose logs backend` prints `[confirmFeeDeposit] … budget …` when the
deposit is booked and `[relayVote] vote … confirmed and indexed` for each vote.

---

## 8. Operations

- **Relay balance:** deposits flow in, fees flow out. If the collateral output is ever consumed
  (a script failed on-chain), send a new plain-ADA output ≥ 5 ADA.
- **Key rotation:** Blockfrost keys can be swapped at any time (backend: restart; frontend:
  rebuild). Rotating the relay mnemonic changes the relay address: do it only when no Mainnet
  event is live, and move the collateral to the new address.
- **Compromise:** the relay wallet is a hot wallet on the server. Its exposure is bounded by the
  live deposits plus the collateral; keep it that way.
