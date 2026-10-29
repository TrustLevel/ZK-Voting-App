# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Cardano-based zero-knowledge voting application. Voters prove group membership and cast anonymous votes using the Semaphore ZK protocol on BLS12-381. The system is composed of five modules:

| Module | Path | Language/Framework |
|--------|------|--------------------|
| Smart contracts | `src/on-chain/` | Aiken (Plutus v3) |
| Backend API | `src/backend/` | NestJS 11, SQLite |
| Frontend | `src/frontend/` | Next.js 15, React 19 |
| Transaction builder | `src/tx/` | TypeScript, MeshSDK |
| ZK proof generation | `src/zk/` | TypeScript, snarkjs |

---

## Development Commands

### On-chain (Aiken)
```sh
cd src/on-chain
aiken build              # Compile contracts → plutus.json
aiken check              # Run all tests
aiken check -m <pattern> # Run specific tests
aiken docs               # Generate HTML documentation
```

### Backend (NestJS)
```sh
cd src/backend
npm install
npm run start:dev        # Dev server with watch (port 3000)
npm run build            # Compile TypeScript
npm run test             # Unit tests
npm run test:e2e         # E2E tests
```

### Frontend (Next.js)
```sh
cd src/frontend
npm install
npm run dev              # Dev server with Turbopack (port 3002)
npm run build            # Production build
npm run start            # Production server
```

### Transaction builder (`@src/tx`)
```sh
cd src/tx
npm run build            # Check validators + compile TypeScript
npm run build:force      # Re-extract validators from plutus.json + compile
npm run check-validators # Verify validators match plutus.json
npm run dev              # Watch mode
```

### ZK proof module (`@src/zk`)
```sh
cd src/zk
npm run build            # Compile TypeScript
npm run dev              # Watch mode
```

### Root (monorepo)
```sh
npm install              # Install all workspaces
npm run build            # Build all workspaces
```

---

## Architecture

```
Frontend (Next.js)
  │  Wallet connection via CIP-30 (Eternl, Lace, Yoroi)
  │  Uses @src/tx (transaction building) and @src/zk (ZK proofs)
  │
  ├──► Backend (NestJS)
  │      Event metadata, participant management, Merkle trees
  │      SQLite database (default: db/voting-app.db)
  │      Auth via wallet signature + JWT
  │
  └──► Cardano Blockchain (Preprod Testnet)
         Smart contracts handle: NFT minting, vote tallying,
         Semaphore ZK-proof verification, time enforcement
```

### Voting flow (high level)

1. Admin creates a voting event → mints Group NFT + Semaphore NFT + Voting NFT
2. Participants register their Semaphore identity commitment → added to group Merkle tree
3. Voter generates a Groth16 ZK proof off-chain (`src/zk`) proving membership
4. Voter inserts nullifier into MPF trie to prevent double voting
5. Vote transaction is built (`src/tx`), signed via CIP-30 wallet, submitted on-chain

---

## Module Details

### `src/on-chain` — Smart Contracts

**Validators** (`validators/`):
- `voting.ak` — Voting event NFT: `mint` creates event, `spend` processes votes
- Semaphore and Group validators come from the `modulo-p/cardano-semaphore` dependency

**Key types** (`lib/types.ak`):
- `UrnaDatum` — weight, options `List<(Int,Int)>`, event dates, semaphore NFT policy
- `SemaphoreRedeemer.Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)`

**Voting modes** (determined by `UrnaDatum.weight`):
- Simple voting (`weight <= 1`): `signal_message` must encode exactly one pair with count 1,
  e.g. `[[2, 1]]` — cast 1 vote for option 2. On-chain: `expect [vote_target] = vote`.
- Weighted/power voting (`weight > 1`): `signal_message` can distribute votes across multiple
  options, e.g. `[[1, 3], [2, 2]]` — but total counts must sum exactly to `weight`.
  On-chain: enforced by `check_weight(vote, dat.weight)` in `voting_utilities.ak`.

**Dependencies** (aiken.toml):
- `aiken-lang/stdlib v2.2.0`
- `modulo-p/cardano-semaphore v0.9.5`
- `aiken-lang/merkle-patricia-forestry v2.1.0`
- `modulo-p/ak-381 v0.1.1`

### `src/backend` — NestJS API

Key modules: `AuthModule`, `UsersModule`, `VotingEventModule`

The `VotingEvent` entity (`voting-event.entity.ts`) is the central DB record. It stores:
- Event metadata (name, dates, options)
- `network` — `'mainnet' | 'preprod'`, chosen at creation and immutable; every Blockfrost call,
  the relay wallet, the VKey reference UTxO and every tx builder for the event follow it
  (`NetworkConfig` in `src/backend/src/network/`). Existing rows default to `preprod`.
- `feeDepositTxHash` / `feeBudgetLovelace` / `feeSpentLovelace` — the organiser's prepaid vote-fee
  budget on fee-deposit networks (Mainnet by default, `FEE_DEPOSIT_NETWORKS`)
- Group NFT / Semaphore NFT / Voting NFT policy IDs and addresses
- Off-chain Merkle tree state (`groupMerkleRootHash`, `groupLeafCommitments`)
- Nullifier tracking (`nullifierMerkleTree`, `nullifierLeafCommitments`)
- Participant list and invitation tokens
- `mintingOrefTxHash` / `mintingOrefIndex` — the OutputReference consumed in Phase 2 of
  bootstrap; required by the frontend to re-derive parameterised validator CBORs via
  `applyOrefParamToScript()`
- `vkeyRefTxHash` / `vkeyRefIndex` — UTxO holding the Groth16 verification key datum;
  included as a **read-only reference input** on every vote tx (permanently locked at the
  always-false script address `addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8`,
  tx `3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083#0`)

**Key API endpoints** (`/voting-event`):
- `GET /` — list all events
- `GET /networks` — which networks this server serves: `{ network, enabled, networkId, relayAddress,
  feeDepositRequired, feePerVoteLovelace, vkeyRef, explorerBaseUrl }[]`; the frontend takes the VKey
  reference for the mint datum and the deposit address from here
- `POST /` — create an event; body includes `network` (`mainnet` | `preprod`, default `preprod`);
  refused (400) when the network is not enabled on the server
- `GET /:eventId` — get single event (includes `network`)
- `GET /:eventId/merkle-proof/:userId` — Semaphore group Merkle proof for ZK circuit witness
- `GET /:eventId/on-chain-group-root` — group Merkle root from the on-chain Semaphore datum
- `POST /:eventId/relay-vote` — body `{ piA, piB, piC, publicSignals, signalMessage }`; the backend
  verifies the Groth16 proof against the on-chain group root, inserts the nullifier into the MPF
  trie, builds/signs/submits the vote tx with the relay wallet of the event's network, rolls
  back on failure; returns `{ txHash }` (409 if the nullifier was already used, 402 when a
  fee-deposit network event has no deposit or its budget is exhausted)
- `GET /:eventId/fee-deposit` (admin) — required amount (registered voters × 1.3 ADA), relay address,
  deposited budget, spent amount, `funded`
- `POST /:eventId/confirm-fee-deposit` (admin) — body `{ txHash }`; verifies on-chain that the tx paid
  at least the missing amount to the relay address and books it as the event's budget (404 while the
  tx is not indexed yet, 409 if the hash was used before). Decision: the deposit is the cost of the
  event, no refund of an unused remainder.
- `GET /:eventId/results` — status, turnout, registered voters; per-option counts only after `endingDate`
- `DELETE /:eventId/nullifier` — admin-only rollback (header `x-admin-token`)
- Organiser transactions (admin, `OrganiserTxService`) — the browser never talks to Blockfrost:
  - `POST /:eventId/build-group-mint-tx` — body `{ walletAddress, walletUtxos }` (as the CIP-30
    wallet reports them); returns `{ unsignedTx, txHash, policyId, scriptAddress, mintUtxo }`.
    Preconditions server-side: network enabled, fee deposit funded on fee-deposit networks (402),
    event not yet on-chain (409). Remembers the wallet UTxOs (F11) in `publish_state`.
  - `POST /:eventId/build-semaphore-voting-mint-tx` — body `{ walletAddress, startingDate, endingDate }`;
    returns `{ unsignedTx, txHash, semaphorePolicyId, semaphoreScriptAddr, votingPolicyId,
    votingScriptAddr, mintingOref, txValidityEndSlot }`. Spends only UTxOs created after the Group
    mint; answers 409 with `code: GROUP_NFT_NOT_INDEXED | WALLET_UTXOS_NOT_INDEXED` while Blockfrost
    lags (the frontend retries).
  - `POST /:eventId/build-fee-deposit-tx` — body `{ walletAddress, walletUtxos }`; plain payment of the
    missing deposit to the relay address (amount computed server-side).
  - `POST /:eventId/submit-tx` — body `{ signedTx }`; submits only a transaction whose id matches one
    the backend built for this event (evaluate-then-submit like votes), then persists the identifiers
    it computed (Group NFT, Semaphore/Voting NFTs, minting oref, dates, Merkle snapshot).
  - `GET /:eventId/tx/:txHash` — `{ confirmed, blockHeight }` for confirmation polling.
- All organiser endpoints (PATCH event, invite/invited/send-invitations, remove participant,
  save-blockchain-data, group update, build-*-tx, submit-tx, tx status) require the event's admin
  token in the `x-admin-token` header (`AdminTokenGuard`). There is no public nullifier insert and no
  raw signed-tx submit endpoint; `submit-tx` accepts only transactions the backend built.

**Dependencies:** `@aiken-lang/merkle-patricia-forestry` (MPF trie), `@noble/hashes` (blake2b)

### `src/tx` — Transaction Builder

Exports as `@src/tx`. Key exports:
- `buildGroupMintTransaction()` — unsigned Group NFT mint TX
- `buildSemaphoreVotingMintTransaction()` — unsigned Semaphore + Voting NFT mint TX
- `buildVoteTransaction(params: BuildVoteTransactionParams)` — unsigned vote TX; accepts
  pre-computed ZK proof, MPF proof steps, and signal data; fetches Semaphore and Voting
  UTxOs from chain internally via the passed `provider`; VKey UTxO is a read-only reference input
- Every builder takes `network: 'mainnet' | 'preprod'` (default `preprod`, byte-identical to the
  old behaviour) and the vote builders an optional `vkeyRef`; `src/network.ts` holds `NETWORK_ID`,
  `SLOT_CONFIG` (Shelley slot config per network, verified against MeshSDK `resolveSlotNo`),
  `VKEY_REF` and `ALWAYS_FALSE_ADDRESS` per network
- `VKEY_REF_TX_HASH` / `VKEY_REF_OUTPUT_INDEX` — the Preprod VKey UTxO constants (legacy names)
- `getTxFeeLovelace(txHex)` — fee declared in a tx body (used for the fee-deposit accounting)
- `scripts/deploy-vkey.ts` / `scripts/verify-vkey.ts` — one-off VKey UTxO per network
- Pure utility functions: datum creators, `applyOrefParamToScript()`, `textToHex()`, etc.
- `VALIDATORS` object with compiled script CBORs (auto-extracted from `src/on-chain/plutus.json`)

See `FRONTEND_BACKEND_SPLIT.md` for which functions are safe to call from the frontend.

> **Note:** All transaction builder functions accept a `BlockfrostProvider`, so they run on the
> backend only (relay votes, organiser mints via `OrganiserTxService`). The frontend imports
> `@src/tx/browser` solely for pure helpers; it holds no Blockfrost key.

### `src/zk` — ZK Proof Module

Key files:
- `src/proof.ts` — `generateVoteProof()`: runs snarkjs Groth16, returns compressed proof
- `src/conversion.ts` — `compressedG1/G2()`: compress proof points for on-chain verifier
- `src/mpf.ts` — `insertNullifier()`: inserts nullifier into MPF trie, returns CBOR proof
- `src/signal.ts` — `encodeVoteSignal()`: CBOR-encodes vote options as circuit signal
- `wasm/semaphore.wasm` — compiled from `semaphore.circom` with `--prime bls12381`
- `keys/semaphore_final.zkey` — 21-contributor trusted setup prover key
- `keys/verification_key.json` — matched verification key

The WASM and zkey were verified compatible by generating and verifying a test proof.

`generateVoteProof()` is intended to run on the **frontend** (user's browser) so that the
voter's identity secrets (`identityNullifier`, `identityTrapdoor`) never leave the client.
The backend only receives the resulting compressed proof and nullifier hash.

`signal_message` and `signal_hash` serve distinct purposes in `SemaphoreRedeemer.Signal`:
- `signal_message` — the raw CBOR bytes (`encodeVoteSignal()` output). Passed directly to
  `deserialise_signal()` in `voting.ak` to decode and tally `List<(Int,Int)>` vote options.
- `signal_hash` — `blake2b_256(signal_message)` interpreted as a big-endian BLS12-381
  scalar integer. Used as the ZK circuit's public input. The on-chain Semaphore verifier
  checks `message_digest_int == blake2b_256(signal_message)` (semaphore.ak line 163),
  proving the signal was not tampered with between proof generation and submission.

MPF trie data is stored in `nullifiers-db/<eventId>/` (LevelDB) per voting event.

---

## Environment Variables

**Backend** (`src/backend/.env`):
```
PORT=3000
BLOCKFROST_API_KEY=              # Preprod key (legacy name; BLOCKFROST_API_KEY_PREPROD takes precedence)
BLOCKFROST_API_KEY_MAINNET=      # Mainnet key — empty = Mainnet disabled
DATABASE_PATH=db/voting-app.db
JWT_SECRET=
CORS_ORIGIN=http://localhost:3002
RELAY_WALLET_MNEMONIC=           # Preprod relay wallet, 24 words (legacy name; _PREPROD takes precedence)
RELAY_WALLET_MNEMONIC_MAINNET=   # Mainnet relay wallet — separate hot wallet, real ADA
VKEY_REF_MAINNET=                # <txhash>#<index> of the Mainnet VKey UTxO (docs/MAINNET_SETUP.md)
#FEE_DEPOSIT_NETWORKS=mainnet    # networks where organisers prepay the voters' fees (default mainnet)
```
`BLOCKFROST_NETWORK` is no longer used — the network is a property of each event. The Docker
deploy in `deploy/` runs the backend on port 3001 and sets these from `deploy/.env`; the frontend
needs only `NEXT_PUBLIC_BACKEND_API_URL` (no Blockfrost key in the browser).
Mainnet one-offs (VKey UTxO, relay funding) are described in `docs/MAINNET_SETUP.md`.

**TX module** (`src/tx/.env`, scripts only):
```
NETWORK=preprod   # preprod | mainnet (scripts/deploy-vkey.ts, scripts/verify-vkey.ts, node/mint-*.ts)
SECRET_KEY=       # wallet mnemonic (backend only)
API_KEY=          # Blockfrost API key of that network (backend only)
```

---

## Configuration

- Networks: Cardano Preprod Testnet and Mainnet, chosen per event (aiken.toml network_id = 41 is
  only the Aiken project setting; the compiled validators are network-independent)
- Plutus version: v3
- BLS12-381 curve (Semaphore circuit uses `--prime bls12381`)
- Collateral UTxO hardcoded in mint scripts — update before deploying to a new wallet

---

## Testing

On-chain tests (600+ lines) cover:
- Option index validation, initial value validation, time interval validation
- Simple voting, weighted voting, vote tally updates

---

## Known Improvements

### BLS12-381 scalar field constraint on `signal_hash`
`blake2b_256` produces a 256-bit value, but the BLS12-381 scalar field prime `r` is ~255 bits.
~55% of all possible signal messages produce a hash >= `r`. Fixed in `cardano-semaphore v0.9.3`:
- **On-chain** (`semaphore.ak` condition 5): replaced `scalar.from_bytearray_big_endian` (which
  returns `None` for values >= `r`) with `builtin.bytearray_to_integer(True, hash) % scalar.field_prime`.
- **Off-chain** (`src/zk/src/proof.ts`): `signalHash = BigInt('0x' + digestHex) % BLS12_381_R`
  so the value passed to the circom circuit and the redeemer are consistent.

The circom circuit already reduces all inputs mod `r` implicitly (finite field arithmetic), so
this change does not affect circuit behaviour — only the on-chain recomputation and off-chain
value construction needed to match.

### VKey UTxO (fixed in v0.9.4)
The VKey UTxO (holds the Groth16 verification key for the Semaphore verifier) is included as a
**read-only reference input** on every vote transaction. Fixed in `cardano-semaphore v0.9.4`:
- **On-chain** (`semaphore.ak`): changed `find_input(inputs, ...)` to
  `find_input(reference_inputs, ...)` so the VKey UTxO is never consumed.
- **Off-chain**: VKey UTxO sent to the always-false script address
  (`addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8`) — permanently locked,
  can never be accidentally spent.
- Constants `VKEY_REF_TX_HASH` / `VKEY_REF_OUTPUT_INDEX` are hardcoded in `src/tx/src/vote.ts`
  and used as `.readOnlyTxInReference()` in all vote transactions.
- `SemaphoreDatum.vkey_ref_input` is set once at bootstrap and never needs updating.

### Updating `cardano-semaphore` dependency version
After bumping the version in `src/on-chain/aiken.toml`, three build steps are required:
```sh
# 1. Rebuild main on-chain project
cd src/on-chain && aiken build

# 2. Build the dependency standalone to generate its own plutus.json
#    (required by src/tx/scripts/extract-validators.ts)
cd src/on-chain/build/packages/modulo-p-cardano-semaphore && aiken build

# 3. Re-extract validator CBORs and rebuild the tx module
cd src/tx && npm run build:force
```
After this, redeploy all contracts (new script CBORs → new policy IDs and script addresses).

### Blockfrost API key exposure on frontend (resolved)
Formerly the organiser's publish flow created a `BlockfrostProvider` in the browser from
`NEXT_PUBLIC_BLOCKFROST_API_KEY(_MAINNET)`, inlined into the JavaScript bundle. Resolved in two
steps: votes are relayed by the backend (`relay-vote`), and the organiser's transactions (Group
mint, Semaphore + Voting mint, fee deposit) are built, submitted and watched by the backend
(`OrganiserTxService`, endpoints `build-*-tx` / `submit-tx` / `tx/:hash` above). The organiser's
wallet only signs; `submit-tx` accepts only transactions the backend built (matched by tx id) and
persists the on-chain identifiers it computed itself. The `NEXT_PUBLIC_BLOCKFROST_*` variables are
gone from the Dockerfile, compose file and env examples; one Blockfrost key per network (backend)
is enough. The publish progress lives in `VotingEvent.publishState` (JSON) and survives restarts;
a rebuilt Group mint resets it, so a stale transaction never blocks a retry.

### MPF nullifier store resilience (`src/zk/src/mpf.ts`)
The LevelDB store for the nullifier trie (`nullifiers-db/<eventId>`) is the off-chain
source of truth for all used nullifiers. If it is lost or corrupted, the trie cannot
be reconstructed without replaying the entire on-chain vote history. Consider:
- Rebuilding the trie from on-chain events on startup if the DB is missing
- Storing the DB path via an environment variable instead of hardcoding `nullifiers-db/`
- Adding a periodic backup or integrity check against the on-chain `nullifier_mpf_root`
