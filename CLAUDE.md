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
- `modulo-p/cardano-semaphore v0.9.4`
- `aiken-lang/merkle-patricia-forestry v2.1.0`
- `modulo-p/ak-381 v0.1.1`

### `src/backend` — NestJS API

Key modules: `AuthModule`, `UsersModule`, `VotingEventModule`

The `VotingEvent` entity (`voting-event.entity.ts`) is the central DB record. It stores:
- Event metadata (name, dates, options)
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
- `GET /:eventId` — get single event
- `GET /:eventId/merkle-proof/:userId` — Semaphore group Merkle proof for ZK circuit witness
- `POST /:eventId/nullifier` — insert nullifier into MPF trie, returns proof steps + new root
- `POST /:eventId/vote` — submit signed tx hex to Blockfrost, returns `{ txHash }`
- `GET /current-slot` — current blockchain slot (via Blockfrost), used for tx validity windows

**Dependencies:** `@aiken-lang/merkle-patricia-forestry` (MPF trie), `@noble/hashes` (blake2b)

### `src/tx` — Transaction Builder

Exports as `@src/tx`. Key exports:
- `buildGroupMintTransaction()` — unsigned Group NFT mint TX
- `buildSemaphoreVotingMintTransaction()` — unsigned Semaphore + Voting NFT mint TX
- `buildVoteTransaction(params: BuildVoteTransactionParams)` — unsigned vote TX; accepts
  pre-computed ZK proof, MPF proof steps, and signal data; fetches Semaphore and Voting
  UTxOs from chain internally via the passed `provider`; VKey UTxO is a hardcoded reference input
- `VKEY_REF_TX_HASH` / `VKEY_REF_OUTPUT_INDEX` — permanent VKey UTxO constants
- Pure utility functions: datum creators, `applyOrefParamToScript()`, `textToHex()`, etc.
- `VALIDATORS` object with compiled script CBORs (auto-extracted from `src/on-chain/plutus.json`)

See `FRONTEND_BACKEND_SPLIT.md` for which functions are safe to call from the frontend.

> **Note:** All transaction builder functions accept a `BlockfrostProvider` — on the frontend
> this exposes the API key in the browser. See Known Improvements for the planned fix.

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
BLOCKFROST_API_KEY=
BLOCKFROST_NETWORK=preview
DATABASE_PATH=db/voting-app.db
JWT_SECRET=
CORS_ORIGIN=http://localhost:3002
```

**TX module** (`src/tx/.env`):
```
NETWORK=testnet
SECRET_KEY=       # wallet mnemonic (backend only)
API_KEY=          # Blockfrost API key (backend only)
```

---

## Configuration

- Network: Cardano Preprod Testnet (network_id = 41 in aiken.toml)
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

### Blockfrost API key exposure on frontend
All transaction builder functions (`buildGroupMintTransaction`, `buildSemaphoreVotingMintTransaction`,
`buildVoteTransaction`) accept a `BlockfrostProvider` and use it internally to fetch script UTxOs
and evaluate transactions. Passing a Blockfrost API key directly to the frontend exposes it in
the browser — anyone can extract it and exhaust the quota (critical on mainnet).

Planned fix:
- Add `GET /voting-event/:eventId/script-utxos` backend endpoint that fetches and returns the
  current Semaphore UTxO, Voting UTxO, and VKey UTxO server-side.
- Refactor `buildVoteTransaction` to accept pre-fetched UTxOs instead of a `provider`.
  Evaluation can be removed — hardcoded execution units are already in the redeemer values
  and the Ogmios error-catch pattern handles the failure gracefully.
- Result: frontend needs zero Blockfrost access for vote transactions.

### MPF nullifier store resilience (`src/zk/src/mpf.ts`)
The LevelDB store for the nullifier trie (`nullifiers-db/<eventId>`) is the off-chain
source of truth for all used nullifiers. If it is lost or corrupted, the trie cannot
be reconstructed without replaying the entire on-chain vote history. Consider:
- Rebuilding the trie from on-chain events on startup if the DB is missing
- Storing the DB path via an environment variable instead of hardcoding `nullifiers-db/`
- Adding a periodic backup or integrity check against the on-chain `nullifier_mpf_root`
