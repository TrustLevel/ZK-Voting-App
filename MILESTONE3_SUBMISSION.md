# Milestone 3 — Submission

**Project:** ZK Voting App — Cardano-based zero-knowledge anonymous voting
**Milestone 3:** Hosted Application (Deployed application — ready for public testing in Milestone 4)
**Repository:** https://github.com/TrustLevel/ZK-Voting-App (branch `preview`)

---

## Deliverable summary

The initial version of the zk voting app is deployed, hosted, and functionally complete, ready for public testing in Milestone 4. 

| Surface | URL |
|---|---|
| Hosted frontend | https://vote.trustlevel.io |
| Hosted backend API | https://api.vote.trustlevel.io |
| Source (this milestone) | https://github.com/TrustLevel/ZK-Voting-App/tree/preview |
| Walkthrough video | _(https://youtu.be/b8HeAZMSW6s)[https://youtu.be/b8HeAZMSW6s]_ |

A full end-to-end vote has been confirmed in production: in-browser proof generation → backend MPF nullifier insertion → on-chain proof verification + MPF root check + vote tally. All on-chain tx are on Cardano Preprod Testnet:

  1. Group-NFT Mint: https://preprod.cardanoscan.io/transaction/eb0814806fdae20b1b5bef4427e2f4c1ee00c64ff018ec4f8f046263011a1272

  2. Semaphore + Voting-NFT Mint — 18:52 CEST:
https://preprod.cardanoscan.io/transaction/381eb4506edf88b1942c3f836a6d4d3285d2f9e348b1b2b8950d1c6866675ebb

  3. Anonymous Vote (ZK-Proof + Nullifier) — 19:07:17 CEST, 2 Redeemer, Fee 2.10 ₳, Block 4829762:
https://preprod.cardanoscan.io/transaction/3dd103810b62bc628065d42bb81957638fdcd9d890568968236c35344afcb0e7

---

## A. Output: Frontend

**Output:** A Next.js frontend that lets organisers create and manage voting events and lets
invited participants register and cast anonymous votes. Covers CIP-30 wallet connection
(Eternl / Lace / Yoroi), event setup (options, voting mode, participant list), participant
registration (client-side Semaphore identity generation), in-browser proof generation + vote
casting, and on-chain results viewing.

**Acceptance criteria:** Deployed and hosted frontend; functional UI for creating and
participating in voting events.

**Evidence:**
- Live (hosted): https://vote.trustlevel.io
- Source: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/frontend
- Documentation: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/frontend/DOCS.md

---

## B. Output: On-chain interaction layer

**Output:** The transaction-builder package (`@src/tx`) and the Aiken Plutus v3 smart contracts.
Builds and submits the Group-NFT mint, Semaphore + Voting NFT mint, and vote transactions;
queries blockchain state (UTxOs, current slot) via Blockfrost; references on-chain contract
state (Semaphore, Voting, and VKey UTxOs) on every vote transaction.

**Acceptance criteria:** On-chain interactions implemented and functional; transactions submitted
to the blockchain, contract state queried, implemented according to the Phase 1 design.

**Evidence:**
- TX builder source: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/tx
- TX builder docs: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/tx/DOCS.md
- Smart contracts source: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/on-chain
- Smart contracts docs: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/on-chain/DOCS.md

---

## C. Output: Off-chain computations

**Output:** The ZK proof module (`@src/zk`) — Groth16 zk-SNARK proof generation, vote-signal CBOR
encoding, BLS12-381 point compression for the on-chain verifier, and MPF nullifier insertion.
The browser entry point runs entirely client-side so that voter identity secrets
(`identityNullifier`, `identityTrapdoor`) never leave the user's device; the backend only
receives the resulting compressed proof and nullifier hash.

**Acceptance criteria:** Off-chain computations implemented; zk-SNARK proof generation and
verification functional; implemented according to the Phase 1 design.

**Evidence:**
- Source: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/zk
- Documentation: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/zk/DOCS.md

---

## D. Output: Backend server setup

**Output:** A NestJS 11 REST API hosting all off-chain server-side computation: voting-event
metadata, wallet-signature authentication (JWT), participant group Merkle-tree management,
nullifier-trie endpoints, email invitations, and on-chain vote-transaction relaying. Deployed
and hosted in production behind Caddy with automatic HTTPS.

**Acceptance criteria:** Fully functional backend server setup, deployed and hosted; hosts the
APIs for off-chain computations and on-chain interaction; implemented according to the Phase 1
design.

**Evidence:**
- Live (hosted): https://api.vote.trustlevel.io
- Source: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/backend
- Documentation: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/backend/DOCS.md
- Deployment guide: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/DEPLOY.md

---

## E. Output: Database management

**Output:** Two persistent stores managing all voter and vote records off-chain:
a SQLite database (via TypeORM) holding users, voting events, group Merkle state, and invitation
tokens; and a LevelDB-backed Merkle Patricia Forestry (MPF) trie storing used nullifiers per
event for double-vote prevention. Both run on persistent volumes that survive restarts and
redeployments.

**Acceptance criteria:** Records of voters and votes stored and managed; database management
implemented according to the Phase 1 design.

**Evidence:**
- Schema & store documentation: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/backend/DOCS.md#database
- Nullifier trie (off-chain computation) documentation: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/backend/DOCS.md#nullifier-trie-mpf
- `VotingEvent` entity source: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/backend/src/voting-event/voting-event.entity.ts

---

## F. Output: Cryptographic primitives

**Output:** The full Semaphore-on-BLS12-381 cryptographic stack: the BLS12-381 pairing-friendly
curve, the Groth16 zk-SNARK proving system (snarkjs + 21-contributor trusted setup), the Poseidon
hash for identity commitments and nullifiers, the identity-secret / identity-commitment /
external-nullifier / nullifier-hash / signal-hash derivations, and the on-chain Groth16 verifier
(`modulo-p/cardano-semaphore`).

**Acceptance criteria:** Cryptographic primitives implemented and functional; implemented
according to the Phase 1 design.

**Evidence:**
- Primitives documentation: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/zk/DOCS.md#cryptographic-primitives
- ZK module source: https://github.com/TrustLevel/ZK-Voting-App/tree/preview/src/zk
- On-chain Semaphore verifier docs: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/src/on-chain/DOCS.md
- Phase 1 design reference: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/design/SMART_CONTRACT_SPECIFICATION.md

---
