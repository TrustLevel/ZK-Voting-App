# Backend — NestJS API

The backend is a NestJS 11 server that manages all off-chain state: voting event metadata, participant group Merkle trees, and the nullifier trie. It exposes a REST API consumed by the frontend.

---

## Setup

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- A Blockfrost API key (Preprod Testnet)

### Install and run

```sh
cd src/backend
npm install
npm run start:dev       # dev server with watch, port 3000
npm run build           # compile TypeScript
npm run start:prod      # production server
npm run test            # unit tests
npm run test:e2e        # end-to-end tests
```

### Environment variables

Copy `.env.example` to `.env` and fill in the values:

```env
PORT=3000
BLOCKFROST_API_KEY=        # Blockfrost project ID for Preprod
BLOCKFROST_NETWORK=preview # preview | preprod | mainnet
DATABASE_PATH=db/voting-app.db
JWT_SECRET=                # random secret for JWT signing
CORS_ORIGIN=http://localhost:3002
RESEND_API_KEY=            # optional — only needed for email invitations
RESEND_FROM_EMAIL=         # sender address (must be verified in Resend)
FRONTEND_URL=http://localhost:3002
```

---

## Modules

### AuthModule

Wallet-based challenge-response authentication.

1. Frontend requests a nonce for a wallet address (`POST /auth/cardano/nonce`).
2. User signs the nonce with their CIP-30 wallet.
3. Frontend sends the signature back (`POST /auth/cardano/verify`).
4. Backend verifies the signature and returns a JWT.

Nonces are single-use to prevent replay attacks.

### UsersModule

Registers and retrieves users by wallet address or email. Each user is identified by wallet address; email is optional and used for invitations.

### VotingEventModule

Central module. Owns the `VotingEvent` entity, all event lifecycle endpoints, the Merkle tree, and the nullifier trie.

---

## Database

SQLite via TypeORM. Default path: `db/voting-app.db` (configurable via `DATABASE_PATH`).

### User table

| Column | Type | Description |
|---|---|---|
| `user_id` | INTEGER PK | Auto-increment |
| `user_email` | TEXT UNIQUE | Optional |
| `wallet_address` | TEXT UNIQUE | Cardano wallet address |
| `event_permissions` | TEXT (JSON) | Array of event IDs the user can access |
| `nonces` | TEXT (JSON) | Active auth nonces |

### VotingEvent table

| Column | Type | Description |
|---|---|---|
| `event_id` | INTEGER PK | Auto-increment |
| `event_name` | TEXT | Display name |
| `voting_power` | INTEGER | 1 = simple voting, >1 = weighted |
| `options` | TEXT (JSON) | `[{index, text, votes}]` |
| `admin_token` | TEXT UNIQUE | Secret token for admin operations |
| `starting_date` | INTEGER | POSIX timestamp (ms) |
| `ending_date` | INTEGER | POSIX timestamp (ms) |
| `voting_nft` | TEXT | Policy ID of the Voting (Urna) NFT |
| `voting_validator_address` | TEXT | Voting script address |
| `group_nft` | TEXT | Policy ID of the Group NFT |
| `group_validator_address` | TEXT | Group script address |
| `group_merkle_root_hash` | TEXT | Current Semaphore group Merkle root |
| `group_leaf_commitments` | TEXT (JSON) | `[{userId, commitment}]` |
| `group_size` | INTEGER | Maximum participants |
| `semaphore_nft` | TEXT | Policy ID of the Semaphore NFT |
| `semaphore_address` | TEXT | Semaphore script address |
| `nullifier_merkle_tree` | TEXT | Serialised MPF trie state |
| `nullifier_leaf_commitments` | TEXT (JSON) | `[nullifier]` — used nullifiers |
| `minting_oref_tx_hash` | TEXT | TX hash of the UTxO consumed at bootstrap |
| `minting_oref_index` | INTEGER | Output index of that UTxO |
| `vkey_ref_tx_hash` | TEXT | TX hash of the permanent VKey reference UTxO |
| `vkey_ref_index` | INTEGER | Output index of the VKey UTxO |

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/cardano/nonce` | Generate a sign challenge nonce for a wallet |
| `POST` | `/auth/cardano/verify` | Verify the signed nonce, return JWT |

### Users

| Method | Path | Description |
|---|---|---|
| `POST` | `/users/find-or-create-by-wallet` | Register or retrieve a user by wallet address |
| `POST` | `/users/find-or-create-by-email` | Register or retrieve a user by email |
| `GET` | `/users/:userId` | Get user by ID |

### Voting Events

| Method | Path | Description |
|---|---|---|
| `POST` | `/voting-event` | Create a new voting event |
| `GET` | `/voting-event` | List all events |
| `GET` | `/voting-event/:eventId` | Get event details |
| `PATCH` | `/voting-event/:eventId` | Update event (dates, options, voting power) |

### Participants

| Method | Path | Description |
|---|---|---|
| `POST` | `/voting-event/:eventId/participants` | Add participant (requires `token` + `commitment`) |
| `DELETE` | `/voting-event/:eventId/participants/:userId` | Remove participant |
| `GET` | `/voting-event/:eventId/participants` | List participant user IDs |
| `POST` | `/voting-event/:eventId/invite` | Invite participant by email |
| `GET` | `/voting-event/:eventId/invited` | List invited (not yet joined) participants |
| `POST` | `/voting-event/:eventId/send-invitations` | Send invitation emails to a list of addresses |
| `GET` | `/voting-event/validate-token/:token` | Validate an invitation token |

### Merkle Tree

| Method | Path | Description |
|---|---|---|
| `GET` | `/voting-event/:eventId/merkle-proof/:userId` | Merkle proof for a participant (used as ZK witness) |

### Nullifiers

| Method | Path | Description |
|---|---|---|
| `POST` | `/voting-event/:eventId/nullifier` | Insert nullifier into MPF trie, returns proof steps + new root. Returns 409 if already used. |
| `DELETE` | `/voting-event/:eventId/nullifier` | Roll back a nullifier insertion (use if vote TX fails after insertion) |

### Blockchain / Results

| Method | Path | Description |
|---|---|---|
| `POST` | `/voting-event/:eventId/vote` | Submit signed TX hex to Blockfrost, returns `{ txHash }` |
| `GET` | `/voting-event/:eventId/results` | Get current vote tallies |
| `POST` | `/voting-event/:eventId/save-blockchain-data` | Persist on-chain contract addresses after bootstrap |

### Group Transactions (admin)

| Method | Path | Description |
|---|---|---|
| `POST` | `/voting-event/:eventId/build-update-group-tx` | Build unsigned group-update TX for admin to sign. Body: `{ newMerkleRoot, walletUtxos, walletAddress, paymentKeyHash, collateralUtxo }` |
| `POST` | `/voting-event/:eventId/confirm-group-update` | Persist new Merkle root in DB after the group-update TX confirms on-chain. Body: `{ newMerkleRoot, txHash }` |

### Admin utilities

| Method | Path | Description |
|---|---|---|
| `POST` | `/voting-event/:eventId/validate-admin-token` | Verify an admin token for the event. Body: `{ token }` |
| `POST` | `/voting-event/:eventId/mark-invitations-sent` | Mark all pending invitations for an event as sent |
| `POST` | `/voting-event/mark-token-used/:token` | Mark an invitation token as used (called after a participant joins) |

### Blockchain utilities

| Method | Path | Description |
|---|---|---|
| `GET` | `/current-slot` | Current blockchain slot via Blockfrost, returns `{ currentSlot }`. Used to compute TX validity windows |

---

## Off-Chain Computations

### Group Merkle Tree

The participant group is managed as an **incremental Merkle tree** using `@zk-kit/incremental-merkle-tree` with the BLS12-381 Poseidon hash function. Each leaf is a participant's identity commitment. The tree depth is fixed to accommodate the configured `group_size`.

When a participant joins, their commitment is inserted and the root is recomputed. This root is stored in the database and must be pushed on-chain (via a group-update transaction) before voting begins so the ZK circuit's public input matches the on-chain state.

### Nullifier Trie (MPF)

Double-vote prevention is enforced off-chain with a **Merkle Patricia Forestry trie** (`@aiken-lang/merkle-patricia-forestry`) backed by a LevelDB store at `nullifiers-db/<eventId>/`.

When `POST /voting-event/:eventId/nullifier` is called:
1. The nullifier is checked for existence — returns 409 if already present.
2. The nullifier is inserted into the trie.
3. The new trie root and CBOR-encoded proof steps are returned to the frontend.
4. The vote transaction includes this proof; the on-chain Semaphore validator verifies the insertion against the stored root.

If the vote transaction fails after the nullifier was inserted, `DELETE /voting-event/:eventId/nullifier` rolls back the insertion so the voter can retry.

---

## Deployment

### Build and run

```sh
cd src/backend
npm ci
npm run build
NODE_ENV=production node dist/main.js
```

### Environment variables (production)

Copy `.env.example` to `.env` and fill in all values. Critical production settings:

| Variable | Production requirement |
|---|---|
| `CORS_ORIGIN` | Set to the deployed frontend URL (e.g. `https://app.yourdomain.com`) |
| `DATABASE_PATH` | Path on a **persistent volume** — survives restarts and redeployments |
| `JWT_SECRET` | Cryptographically random, at least 32 bytes |
| `BLOCKFROST_NETWORK` | `preprod` for Preprod Testnet, `mainnet` for Mainnet |

### Persistent storage

The backend requires two directories that must be on a persistent volume:

- **SQLite database** — path set by `DATABASE_PATH` (default `db/voting-app.db`). Create the `db/` directory before first run.
- **LevelDB nullifier store** — `nullifiers-db/<eventId>/` relative to the working directory. Created automatically, but must survive restarts. Losing this data makes it impossible to verify previously used nullifiers without replaying on-chain history.

### Hosting options

Any Node.js 20+ host works: fly.io, Render, EC2, DigitalOcean Droplet, etc. The only requirement is a persistent filesystem for the two storage paths above.
