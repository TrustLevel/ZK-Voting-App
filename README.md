# ZK Voting App

A decentralised, privacy-preserving voting application built on the Cardano blockchain. Voters prove group membership and cast ballots anonymously using zero-knowledge cryptography, while all votes are recorded and tallied immutably on-chain.

---

## What It Does

ZK Voting App lets an organiser run a binding, on-chain vote where **no observer — including the organiser — can link a cast vote to the voter who cast it**. At the same time, the system guarantees that:

- Only registered participants can vote.
- Each participant can vote at most once.
- Results are publicly verifiable on the Cardano blockchain.
- The vote tally cannot be altered after submission.

The system supports two voting modes:

| Mode | Description |
|---|---|
| **Simple voting** | Each participant casts exactly one vote for a single option. |
| **Weighted voting** | Each participant distributes a fixed number of points across one or more options. |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  User's Browser                                     │
│                                                     │
│  Next.js Frontend (port 3002)                       │
│  ├─ @src/tx  — transaction builder                  │
│  └─ @src/zk  — Groth16 prover · signal encoding    │
│                                                     │
└──────────────┬──────────────────────┬───────────────┘
             ▲ │ REST API             │ TX submission
             │ ▼                      ▼ (CIP-30 wallet)
┌──────────────────────┐   ┌──────────────────────────┐
│   NestJS Backend     │   │  Cardano Preprod Testnet  │
│   port 3000          │   │                          │
│                      │   │  Voting validator        │
│   SQLite             │   │  Semaphore validator     │
│   LevelDB (MPF)      │   │  Group validator         │
└──────────┬───────────┘   └──────────────────────────┘
           │                          ▲
           └──── Blockfrost API ──────┘
                 chain queries · TX relay
```

---

## Module Overview

| Module | Path | Docs |
|---|---|---|
| Smart contracts | `src/on-chain/` | [DOCS.md](src/on-chain/DOCS.md) |
| Backend API | `src/backend/` | [DOCS.md](src/backend/DOCS.md) |
| Frontend | `src/frontend/` | [DOCS.md](src/frontend/DOCS.md) |
| Transaction builder | `src/tx/` | [DOCS.md](src/tx/DOCS.md) |
| ZK proof module | `src/zk/` | [DOCS.md](src/zk/DOCS.md) |

`@src/tx` and `@src/zk` are TypeScript packages compiled directly into the frontend bundle — they are not standalone services.

---

## The Semaphore Protocol

[Semaphore](https://semaphore.appliedzkp.org/) is a zero-knowledge protocol designed for anonymous signalling within a defined group. This application uses a BLS12-381 variant of Semaphore, verified on Cardano via a Groth16 proof.

### Identity

Each participant holds a **Semaphore identity**: a pair of secret values (`identityNullifier`, `identityTrapdoor`) that never leave the user's device. From these, a public **identity commitment** is derived — a hash that is safe to share and is registered in the group.

### The Group

The organiser maintains a group as an **incremental Merkle tree**. Every registered participant's identity commitment occupies a leaf. The Merkle root represents the entire group and is anchored on-chain inside the Semaphore NFT.

### Proving Membership Without Revealing Identity

When a participant wants to signal (vote), they produce a **Groth16 zero-knowledge proof** that demonstrates:

1. They know the secret behind one of the commitments in the Merkle tree (group membership).
2. The signal they are sending (the encoded vote) is bound to that proof.
3. They have computed a **nullifier hash** — a one-time value derived from their secret and the specific voting event — that cannot be traced back to their identity.

The proof is verified on-chain by the Semaphore smart contract. Because the proof reveals nothing except its own validity, the voter's identity remains anonymous.

### Double-Vote Prevention

The nullifier hash is inserted into a **Merkle Patricia Forestry (MPF) trie** stored off-chain and anchored on-chain. Submitting the same nullifier twice is rejected by the smart contract, preventing any participant from voting more than once — without ever exposing who they are.

---

## Workflow: User Perspective

### As an Organiser

1. **Connect wallet** — authenticate using a Cardano wallet (Eternl, Lace, Yoroi, …).
2. **Create an event** — choose a name, define the voting options, set the voting mode (simple or weighted), and configure the group size.
3. **Add participants** — invite participants by wallet address. Each invited participant must connect and register their identity commitment.
4. **Deploy on-chain** — set the start and end dates and mint the on-chain contracts. From this point the event is live on the blockchain.

### As a Participant

1. **Receive an invitation** — the organiser shares an event link or invitation token.
2. **Connect wallet and join** — register with the event. Your identity commitment (derived from your secret identity) is added to the group. Your secrets never leave your browser.
3. **Wait for the voting window** — the event has a fixed start and end time enforced on-chain.
4. **Cast your vote** — during the voting window, select your option(s), and confirm. Your browser generates the zero-knowledge proof locally and submits the vote transaction to the blockchain. No one can see how you voted.
5. **View results** — once the event ends, results are readable by anyone directly from the blockchain.

---

## Workflow: Technical Perspective

### Phase 1 — Event Bootstrap (two transactions)

**Transaction 1 — Group NFT mint**

The organiser's frontend calls `buildGroupMintTransaction()`, which mints a **Group NFT** and locks it at the Semaphore group validator address. The NFT policy ID becomes the group identifier.

**Transaction 2 — Semaphore + Voting NFT mint**

A second transaction mints:
- A **Semaphore NFT** — holds the Groth16 verification key datum and the current group Merkle root. Locked at the Semaphore validator address.
- A **Voting NFT** (Urna) — holds the `UrnaDatum` (vote options, tally, event dates, weight). Locked at the Voting validator address.

The `OutputReference` consumed in this transaction is used to parameterise the validator scripts, guaranteeing uniqueness of each event's policy IDs.

### Phase 2 — Participant Registration

For each participant:

1. The participant derives their identity commitment client-side using `poseidon(trapdoor, nullifier)`.
2. The commitment is submitted to the backend via `POST /voting-event/:eventId/participants`.
3. The backend inserts the commitment as a new leaf in the **incremental Merkle tree**, recomputes the root, and stores the updated state in the database. The root will be written on-chain when the event is started.

### Phase 3 — Casting a Vote

1. **Fetch Merkle proof** — the frontend calls `GET /voting-event/:eventId/merkle-proof/:userId` to retrieve the sibling path from the participant's leaf to the Merkle root.
2. **Encode the signal** — `encodeVoteSignal()` CBOR-encodes the chosen vote options as `List<(Int, Int)>`. The `blake2b_256` hash of this encoding, reduced modulo the BLS12-381 scalar field prime, becomes the circuit's public input (`signal_hash`).
3. **Generate ZK proof** — `generateVoteProof()` runs the Groth16 prover in the browser (snarkjs + WASM). Inputs: the voter's secret identity, the Merkle proof, and the signal hash. Output: a compressed proof and the nullifier hash. The voter's secrets never leave the browser.
4. **Insert nullifier** — the frontend calls `POST /voting-event/:eventId/nullifier` with the nullifier hash. The backend inserts it into the **MPF trie** (LevelDB) and returns the CBOR-encoded proof steps and updated trie root. The smart contract uses this proof to verify the nullifier has not been used before.
5. **Build and submit the vote transaction** — `buildVoteTransaction()` assembles a Cardano transaction that:
   - Spends the **Semaphore NFT** with a redeemer containing the ZK proof, MPF proof, nullifier, signal hash, and signal message.
   - Spends the **Voting NFT** with a `Vote` redeemer.
   - Includes the **VKey UTxO** as a read-only reference input (permanent reference at a script address, never consumed).
   - Outputs updated datums: the new MPF root in the Semaphore NFT and the incremented vote tally in the Voting NFT.
   - The transaction is signed via the CIP-30 wallet interface and submitted to the Cardano network through Blockfrost.
6. **On-chain validation** — the Semaphore validator verifies the Groth16 proof against the verification key and the current group Merkle root. The Voting validator verifies the signal decodes to a valid vote for the event's options and that the vote weight constraint is satisfied.

### Results

Vote tallies are stored directly in the `UrnaDatum` on the Voting UTxO. Any observer can query the UTxO from the blockchain and read the current counts without needing any backend.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Backend, frontend, tx, zk |
| npm | ≥ 10 | Package management |
| Aiken | v1.1.19 | Smart contract compiler |
| Cardano wallet | Eternl / Lace / Yoroi | CIP-30 wallet for browser |
| Blockfrost account | — | Chain access (Preprod Testnet) |

---

## Quick Start

### 1. Install all workspaces

```sh
npm install
```

### 2. Configure environment variables

```sh
# Backend
cp src/backend/.env.example src/backend/.env
# Fill in: BLOCKFROST_API_KEY, JWT_SECRET

# Frontend
cp src/frontend/.env.example src/frontend/.env.local
# Fill in: NEXT_PUBLIC_BACKEND_API_URL, NEXT_PUBLIC_BLOCKFROST_API_KEY
```

### 3. Start the backend

```sh
cd src/backend
npm run start:dev       # http://localhost:3000
```

### 4. Start the frontend

```sh
cd src/frontend
npm run dev             # http://localhost:3002
```

### 5. (Optional) Rebuild smart contracts

```sh
cd src/on-chain
aiken build             # outputs plutus.json

cd src/tx
npm run build:force     # re-extracts validator CBORs from plutus.json
                        # and overwrites src/tx/src/validators.ts
```

> `src/tx/src/validators.ts` is auto-generated — do not edit it manually.

See each module's `DOCS.md` for full configuration and deployment details.
