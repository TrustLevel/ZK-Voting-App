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
│  └─ @src/zk  — Groth16 prover · signal encoding     │
│                                                     │
└──────────────┬──────────────────────┬───────────────┘
             ▲ │ REST API             │ TX submission
             │ ▼                      ▼ (CIP-30 wallet)
┌──────────────────────┐   ┌──────────────────────────┐
│   NestJS Backend     │   │  Cardano Preprod Testnet │
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

This application uses a BLS12-381 variant of [Semaphore](https://semaphore.appliedzkp.org/) — a zero-knowledge protocol for anonymous group signalling. Each voter holds a secret identity and proves group membership with a Groth16 ZK proof, without revealing who they are. A one-time nullifier prevents double voting. The proof is verified entirely on-chain by the Semaphore smart contract.

For the full protocol description and cryptographic details see [`src/zk/DOCS.md`](src/zk/DOCS.md).

---

## How It Works

There are two roles: an **organiser** who sets up and manages the voting event, and **participants** who receive invitations and cast votes.

### The Organiser's Journey

**1. Create the event**
Connect a Cardano wallet and fill in the event details: a name, the list of options voters can choose from, the voting mode (simple — one vote per person — or weighted — each person distributes a fixed number of points across options), and the maximum number of participants.

**2. Invite participants**
Add participants by wallet address or email. Each invited person receives a unique private link. Only invited participants can vote — the group is closed.

**3. Wait for participants to register**
Each invitee visits their link, connects their wallet, and registers. Their browser generates a cryptographic identity and adds a public commitment to the group. No personal data is stored or transmitted — only the commitment.

**4. Deploy the event on-chain**
Once the participant list is final, set the voting start and end dates and deploy. Two transactions are submitted to the Cardano blockchain, anchoring the voting contracts permanently. From this point the event is live — options, dates, and group membership are immutable.

**5. Results**
Once the voting window closes, the final tally is readable on-chain by anyone. The organiser cannot see who voted for what — only the totals are public.

---

### The Participant's Journey

**1. Receive an invitation**
The organiser sends a link with a unique invitation token. Open it in a browser with a Cardano wallet extension installed (Eternl, Lace, or Yoroi).

**2. Register**
Connect your wallet and confirm your registration. Your browser generates a Semaphore identity — two secret values that stay on your device and are never sent to the server. A public commitment derived from those secrets is added to the group on the backend.

**3. Wait for the voting window**
The event has a fixed start and end time enforced by the blockchain. You can check the event page to see when voting opens.

**4. Cast your vote**
During the voting window, open the event and select your choice. Before submitting, your browser silently:
- Generates a zero-knowledge proof that you are a registered group member — without revealing *which* member you are.
- Computes a one-time nullifier that prevents voting twice.
- Builds a transaction and submits it to the Cardano blockchain.

No one — not the organiser, not the server, not the blockchain — can link your vote back to you.

**5. View results**
Once the event ends, the vote tally is publicly visible on-chain. Results are final and cannot be altered by anyone.

---

For the full technical breakdown — transactions, API calls, on-chain validation — see [`src/on-chain/DOCS.md`](src/on-chain/DOCS.md#system-workflow).

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

## Quick Start (Local Development)

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

---

## Deployment (Production)

### Frontend — Vercel (recommended)

1. Push the repository to GitHub.
2. Import the project on [Vercel](https://vercel.com/) and set **Root Directory** to `src/frontend`.
3. Add the following environment variables in the Vercel project settings:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_BACKEND_API_URL` | URL of the deployed backend, e.g. `https://api.yourdomain.com` |
   | `NEXT_PUBLIC_BLOCKFROST_API_KEY` | Blockfrost project ID (Preprod or Mainnet) |

4. Deploy — Vercel detects Next.js automatically and handles the build.

### Backend — Node.js host (fly.io, Render, EC2, DigitalOcean, …)

```sh
cd src/backend
npm ci
npm run build
NODE_ENV=production node dist/main.js
```

Set the same variables as `.env.example`. For production, pay attention to:

| Variable | Production note |
|---|---|
| `CORS_ORIGIN` | Must match the deployed frontend URL exactly |
| `DATABASE_PATH` | Point to a path on a **persistent volume** |
| `JWT_SECRET` | Cryptographically random value, ≥ 32 bytes |
| `BLOCKFROST_NETWORK` | `preprod` for Preprod Testnet, `mainnet` for Mainnet |

**Persistent storage requirements**

Two directories must be on a persistent volume:

- `DATABASE_PATH` — SQLite database (default `db/voting-app.db`). Create `db/` in advance.
- `nullifiers-db/` — LevelDB store for nullifier tries, relative to the backend working directory. This directory is created automatically on first use but must survive restarts and redeployments.

### Smart contracts — already deployed on Preprod Testnet

The Aiken validators are pre-compiled and their CBORs are embedded in `src/tx/src/validators.ts`. No on-chain deployment step is needed to run the application — each new voting event mints its own set of NFTs using these validators.

To redeploy contracts after code changes:

```sh
cd src/on-chain
aiken build                 # recompile → plutus.json

cd src/tx
npm run build:force         # re-extract CBORs from plutus.json
```

---

See each module's `DOCS.md` for full configuration and component details.
