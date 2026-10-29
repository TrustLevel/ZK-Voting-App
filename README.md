# ZK Voting App

A decentralised, privacy-preserving voting application built on the Cardano blockchain. Voters prove group membership and cast ballots anonymously using zero-knowledge cryptography, while all votes are recorded and tallied immutably on-chain.

**Live on Cardano Mainnet and on the Preprod testnet** at [vote.trustlevel.io](https://vote.trustlevel.io). The organiser chooses the network when creating an event. Voters need no wallet and no ADA on either network; the voting service submits and pays their vote transactions. On Mainnet the organiser pays for publishing (about 15 ADA locked in the event contracts plus about 1.5 ADA fees) and prepays the voters' fees as a deposit of 1.3 ADA per registered voter; Preprod is free. Details: [Organiser guide](docs/guides/ORGANISER_GUIDE.md).

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
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│                                                             │
│  Next.js Frontend (port 3002)                               │
│  ├─ @src/zk          — Groth16 prover · signal encoding     │
│  │                     (voter's identity never leaves here) │
│  └─ @src/tx/browser  — pure helpers only, no chain access   │
│                                                             │
│  CIP-30 wallet (Eternl, Lace): organiser only, signs the    │
│  publish transactions; voters have no wallet                │
└──────────────────────────────┬──────────────────────────────┘
                             ▲ │ REST API (proofs, signed txs)
                             │ ▼
┌─────────────────────────────────────────────────────────────┐
│  NestJS Backend (port 3000)                                 │
│  ├─ @src/tx — builds every transaction (organiser mints,    │
│  │            fee deposit, relayed votes)                    │
│  ├─ relay wallet per network — pays and submits votes       │
│  ├─ SQLite (events, participants, Merkle trees)             │
│  └─ LevelDB (MPF nullifier tries)                           │
└──────────────────────────────┬──────────────────────────────┘
                               │ Blockfrost (one project per network)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Cardano Mainnet  ·  Cardano Preprod testnet                │
│  Voting validator · Semaphore validator · Group validator   │
│  VKey reference UTxO (Groth16 verification key, per network)│
└─────────────────────────────────────────────────────────────┘
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

`@src/zk` is compiled into the frontend bundle: the proof is generated in the voter's browser. `@src/tx` runs in the backend, which builds every transaction (organiser mints, fee deposit, relayed votes); the frontend imports only its pure helpers through `@src/tx/browser` and holds no Blockfrost key. Neither is a standalone service.

---

## Branches and releases

- **`main`** is the canonical branch: the hosted application at vote.trustlevel.io is deployed from it, and all documentation links point at it.
- **Tags** freeze the state submitted to Project Catalyst: **`v1.0`** = Milestone 4 (Mainnet and Preprod, audited contracts, relay voting). Evidence links in the submission documents use the tag, so they keep showing exactly what was reviewed.
- **`preview`** is the staging branch for work in progress; feature branches are merged there first.

## Component Evidence Index

The application is delivered as six components, each independently documented. The table below
links each component to its source tree and documentation. The live deployment is hosted at
[vote.trustlevel.io](https://vote.trustlevel.io) (frontend) and
[api.vote.trustlevel.io](https://api.vote.trustlevel.io) (backend).

| Component | Source | Documentation |
|---|---|---|
| Frontend | [`src/frontend`](src/frontend) | [DOCS.md](src/frontend/DOCS.md) |
| On-chain interaction layer | [`src/tx`](src/tx) · [`src/on-chain`](src/on-chain) | [tx/DOCS.md](src/tx/DOCS.md) · [on-chain/DOCS.md](src/on-chain/DOCS.md) |
| Off-chain computations | [`src/zk`](src/zk) | [zk/DOCS.md](src/zk/DOCS.md) |
| Backend server setup | [`src/backend`](src/backend) | [backend/DOCS.md](src/backend/DOCS.md) · [docs/operations/DEPLOY.md](docs/operations/DEPLOY.md) |
| Database management | [`src/backend`](src/backend) (SQLite + LevelDB/MPF) | [backend/DOCS.md#database](src/backend/DOCS.md#database) |
| Cryptographic primitives | [`src/zk`](src/zk) · [`src/on-chain`](src/on-chain) | [zk/DOCS.md#cryptographic-primitives](src/zk/DOCS.md#cryptographic-primitives) |

Phase 1 design references: [SMART_CONTRACT_SPECIFICATION.md](docs/design/SMART_CONTRACT_SPECIFICATION.md), [SYSTEM_DESIGN.md](docs/design/SYSTEM_DESIGN.md).

### Milestone 4 evidence (testing and advanced development)

| Document | Where |
|---|---|
| Submission (acceptance criteria → evidence) | [docs/milestones/MILESTONE4_SUBMISSION.md](docs/milestones/MILESTONE4_SUBMISSION.md) |
| Smart-contract audit report | [docs/audit/AUDIT.md](docs/audit/AUDIT.md) · [Upstream Semaphore changes](docs/audit/UPSTREAM_SEMAPHORE_CHANGES.md) |
| User feedback and resulting changes | [docs/testing/M4_USER_FEEDBACK.md](docs/testing/M4_USER_FEEDBACK.md) · questionnaires in [docs/testing/interviews](docs/testing/interviews) |
| Test report (regression run of 2026-10-29 after the fixes) | [docs/testing/M4_TEST_REPORT.md](docs/testing/M4_TEST_REPORT.md) |
| Relay vote design (voters need no wallet) | [docs/design/RELAY_VOTE_DESIGN.md](docs/design/RELAY_VOTE_DESIGN.md) |

---

## The Semaphore Protocol

This application uses a BLS12-381 variant of [Semaphore](https://semaphore.appliedzkp.org/) — a zero-knowledge protocol for anonymous group signalling. Each voter holds a secret identity and proves group membership with a Groth16 ZK proof, without revealing who they are. A one-time nullifier prevents double voting. The proof is verified entirely on-chain by the Semaphore smart contract.

For the full protocol description and cryptographic details see [`src/zk/DOCS.md`](src/zk/DOCS.md).

---

## User Guides

Step-by-step guides against the hosted application, with the labels and messages you see on screen:

- [Organiser guide](docs/guides/ORGANISER_GUIDE.md) — create an event, invite participants, publish it to the blockchain, read the results. Needs a wallet on the network of the event (Mainnet or Preprod).
- [Voter guide](docs/guides/VOTER_GUIDE.md) — register, keep your identity file, cast a vote, check the result. No wallet and no ADA needed.

---

## How It Works

There are two roles: an **organiser** who sets up and manages the voting event, and **participants** who receive invitations and cast votes.

### The Organiser's Journey

**1. Create the event**
Fill in the event details: a name, the Cardano network (Mainnet with real ADA, or Preprod with free test ADA; fixed for the lifetime of the event), the list of options voters can choose from, the voting mode (simple: one vote per person; weighted: each person distributes a fixed number of points across options), and the voting window in your local time. Plan the start at least 10 minutes ahead and the window at least 10 minutes plus about one minute per voter; the form repeats these minimums. Then connect a Cardano wallet on that network; it identifies you as the organiser and later signs the publishing transactions.

**2. Invite participants**
Add participants by email. Each invited person receives a unique private link that is valid for seven days. Only invited participants can vote — the group is closed.

**3. Wait for participants to register**
Each invitee visits their link and registers — no wallet needed. Their browser generates a random cryptographic identity and adds only a public commitment to the group. The *Before you publish* panel shows who has registered and who is still pending.

**4. Publish the event on-chain**
Once the participant list is final, publish. On Mainnet the dashboard first asks for the fee deposit (1.3 ADA per registered voter, sent to the voting service; it is the cost of the event and an unused remainder is not refunded). Then your wallet signs two transactions, built and submitted by the backend, that anchor the voting contracts on the Cardano blockchain. From this point the event is live: options, dates and group membership are immutable; participants who have not registered by then cannot vote.

**5. Results**
While voting is open you, the organiser, see the turnout only; voters and the public results page see nothing until the end. Once the voting window closes, the final tally is readable on-chain by anyone. The organiser cannot see who voted for what; only the totals are public.

---

### The Participant's Journey

**1. Receive an invitation**
The organiser sends a link with a unique invitation token, valid for seven days. Open it in any browser — voters need no wallet, no ADA and never sign anything.

**2. Register**
Click *Generate Identity*. Your browser generates a random Semaphore identity — two secret values that stay on your device and are never sent to the server — and downloads it as `semaphore-identity-event-<id>.json`. Keep that file: it is your only way to vote from another browser or device. Then click *Register Commitment*; only the public commitment derived from the secrets is added to the group on the backend.

**3. Wait for the voting window**
The event has a fixed start and end time enforced by the blockchain. The event page shows them in your local time, together with the voting type and the current status.

**4. Cast your vote**
During the voting window, open the event and select your choice. Before submitting, your browser silently:
- Generates a zero-knowledge proof that you are a registered group member — without revealing *which* member you are.
- Computes a one-time nullifier that prevents voting twice.
- Sends proof, nullifier and your choice to the voting service, which verifies the proof and submits the vote transaction to Cardano with its own wallet — no signature and no fee from you.

No one — not the organiser, not the server, not the blockchain — can link your vote back to you. The known limits of this guarantee are listed in [docs/testing/M4_USER_FEEDBACK.md](docs/testing/M4_USER_FEEDBACK.md), section 5.

**5. View results**
While voting is open the page shows neither counts nor turnout, so that interim numbers influence nobody. Once the event ends, the vote tally is publicly visible on-chain. Results are final and cannot be altered by anyone.

---

For the full technical breakdown — transactions, API calls, on-chain validation — see [`src/on-chain/DOCS.md`](src/on-chain/DOCS.md#system-workflow).

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Backend, frontend, tx, zk |
| npm | ≥ 10 | Package management |
| Aiken | v1.1.19 | Smart contract compiler |
| Cardano wallet | Eternl / Lace | CIP-30 wallet in the organiser's browser |
| Blockfrost account | — | Chain access, one project per network (Preprod, Mainnet) |

---

## Quick Start (Local Development)

### 1. Install all workspaces

```sh
npm install
```

`npm install` (or `npm ci`) runs the root `postinstall`, which compiles the `modp-semaphore-bls12381`
dependency in place — `--ignore-scripts` leaves it unbuilt and the backend and tx tests fail with
"Cannot find module". The lockfile resolves that dependency over `git+ssh://`; without an SSH key for
GitHub, map it to HTTPS first:

```sh
git config --global url."https://github.com/".insteadOf "git@github.com:"
```

Test suites from a clean clone: `cd src/on-chain && aiken check` (contract tests), `cd src/tx && npm test`,
`cd src/backend && npm test`. `src/tx`'s `npm run build` keeps the committed validator CBORs when the
on-chain project has not been built locally.

### 2. Configure environment variables

```sh
# Backend
cp src/backend/.env.example src/backend/.env
# Fill in: BLOCKFROST_API_KEY (Preprod), JWT_SECRET, RELAY_WALLET_MNEMONIC (a funded Preprod wallet
# that pays the relayed votes); the Mainnet variables stay empty for local development

# Frontend
cp src/frontend/.env.example src/frontend/.env.local
# Fill in: NEXT_PUBLIC_BACKEND_API_URL (the frontend needs no Blockfrost key)
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

The hosted instance runs as two Docker containers (backend and frontend) behind Caddy on one
VPS, built from this repository with `deploy/docker-compose.yml`. The step-by-step procedure,
including DNS, TLS, the `deploy/.env` file and updates, is in
[docs/operations/DEPLOY.md](docs/operations/DEPLOY.md). Mainnet needs three one-off steps by
the operator (VKey reference UTxO, relay wallet, keys): [docs/operations/MAINNET_SETUP.md](docs/operations/MAINNET_SETUP.md).

The frontend needs a single variable, `NEXT_PUBLIC_BACKEND_API_URL` (the public URL of the
backend); it holds no Blockfrost key. The backend takes the variables of `.env.example`; for
production, pay attention to:

| Variable | Production note |
|---|---|
| `CORS_ORIGIN` | Must match the deployed frontend URL exactly |
| `DATABASE_PATH` | Point to a path on a **persistent volume** |
| `JWT_SECRET` | Cryptographically random value, ≥ 32 bytes |
| `BLOCKFROST_API_KEY` / `BLOCKFROST_API_KEY_MAINNET` | One Blockfrost key per network; a network without key, relay wallet and VKey UTxO is not offered to organisers |
| `RELAY_WALLET_MNEMONIC` / `RELAY_WALLET_MNEMONIC_MAINNET` | Relay wallet per network (Mainnet: separate hot wallet, see `docs/operations/MAINNET_SETUP.md`) |
| `VKEY_REF_MAINNET` | `<txhash>#<index>` of the Mainnet VKey UTxO, deployed once |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `FRONTEND_URL` | E-mail sender for the invitations and the base URL of the links it sends |

The network (Preprod or Mainnet) is chosen per event by the organiser; one backend serves both.

**Persistent storage requirements**

Two directories must be on a persistent volume:

- `DATABASE_PATH` — SQLite database (default `db/voting-app.db`). Create `db/` in advance.
- `nullifiers-db/` — LevelDB store for nullifier tries, relative to the backend working directory. This directory is created automatically on first use but must survive restarts and redeployments.

### Smart contracts — no deployment step

The Aiken validators are pre-compiled and their CBORs are embedded in `src/tx/src/validators.ts`. They are network-independent: each new voting event mints its own set of NFTs using these validators on the event's network. The only per-network one-off is the VKey reference UTxO (Preprod: already deployed; Mainnet: `docs/operations/MAINNET_SETUP.md`).

To redeploy contracts after code changes:

```sh
cd src/on-chain
aiken build                 # recompile → plutus.json

cd src/tx
npm run build:force         # re-extract CBORs from plutus.json
```

---

## Contributing and security

Issues, pull requests, forks and reports from self-hosted instances are welcome; the
procedure and the checks to run are in [CONTRIBUTING.md](CONTRIBUTING.md). Security problems
go through GitHub's private vulnerability reporting, not through public issues: see
[SECURITY.md](SECURITY.md).

## Licence

Copyright 2025-2026 TrustLevel. Licensed under the [Apache License 2.0](LICENSE); you may use,
modify, self-host and redistribute the software under its terms. Contributions are accepted
under the same licence.

Third-party components keep their own licences: `aiken-lang/stdlib`, `aiken-lang/fuzz`,
`modulo-p/cardano-semaphore` and `modulo-p/ak-381` (Apache-2.0),
`aiken-lang/merkle-patricia-forestry` (MPL-2.0), and the npm packages listed in each module's
`package.json`. The TrustLevel name and logo are not covered by the licence.

---

See each module's `DOCS.md` for full configuration and component details.
