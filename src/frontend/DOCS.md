# Frontend — Next.js Application

The frontend is a Next.js 15 application that provides the user interface for creating voting events, managing participants, and casting votes. ZK proof generation runs entirely in the browser — voter identity secrets never leave the client.

---

## Setup

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- A running backend (see `src/backend/DOCS.md`)
- A Cardano browser wallet extension (Eternl, Lace, or Yoroi)

### Install and run

```sh
cd src/frontend
npm install
npm run dev         # dev server with Turbopack, http://localhost:3002
npm run build       # production build
npm run start       # production server
```

### Environment variables

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:3000   # Backend API base URL
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/create` | Create a new voting event (name, options, voting mode, group size) |
| `/manage/[eventId]` | Event management dashboard (parameters, participants, on-chain deployment) |
| `/join` | Join a voting event as a participant via invitation token |
| `/event/[id]` | Vote casting interface |
| `/info` | Documentation and help |

### `/create`

The organiser fills in the event configuration. On submit, the frontend:
1. Calls `POST /users/find-or-create-by-wallet` to register the wallet.
2. Calls `POST /voting-event` to create the event record in the backend.
3. Redirects to `/manage/:eventId` with the `adminToken` in the query string.

### `/manage/[eventId]`

Three-tab dashboard:

- **Parameters** — read-only display of voting configuration.
- **Participants** — add/remove participants by wallet address; each participant must connect their wallet and submit their identity commitment. Triggers a group Merkle tree update and, once participants are finalised, an on-chain group-update transaction.
- **Start** — set event start/end dates and execute the two-transaction on-chain bootstrap (Group NFT mint → Semaphore + Voting NFT mint).

### `/event/[id]`

The voting page. Steps performed in the browser:

1. Fetch event details and the participant's Merkle proof from the backend.
2. Generate the Semaphore identity from the user's wallet-derived secret.
3. Encode the vote signal with `encodeVoteSignal()`.
4. Run the Groth16 prover with `generateVoteProof()` (WASM, runs locally).
5. Insert the nullifier via the backend (`POST /voting-event/:eventId/nullifier`).
6. Build the vote transaction with `buildVoteTransaction()`.
7. Sign via CIP-30 and submit to the Cardano network.

---

## Wallet Integration

Wallet connectivity is provided by **MeshSDK** (`@meshsdk/core`, `@meshsdk/react`). The `WalletProvider` context (`app/providers/`) wraps the application and exposes the connected wallet to all pages.

CIP-30 is used for:
- Signing the auth challenge nonce.
- Signing vote and mint transactions before submission.

---

## ZK Proof Generation

The frontend uses the **browser entry point** of `@src/zk` (`@src/zk/browser`) to avoid importing Node.js-only modules into the browser bundle.

Key functions imported via `lib/vote-helpers.ts`:

| Function | Source | Description |
|---|---|---|
| `generateVoteProof()` | `@src/zk/browser` | Runs Groth16 prover in WASM, returns compressed proof |
| `encodeVoteSignal()` | `@src/zk/browser` | CBOR-encodes vote options as `List<(Int,Int)>` |
| `buildVoteTransaction()` | `@src/tx/browser` | Assembles the Cardano vote transaction |
| `applyOrefParamToScript()` | `@src/tx/browser` | Parameterises validator CBOR with an OutputReference |

The WASM file and zkey are served as static assets from `public/zk/` and fetched at runtime by the prover.

---

## Webpack Configuration

`next.config.ts` contains two additions required to handle native and WASM packages:

**`serverExternalPackages`** — prevents webpack from bundling packages that load native binaries at SSR runtime:
- `@sidan-lab/sidan-csl-rs-nodejs` — native Rust bindings for CSL
- `@meshsdk/core-csl` — depends on the above
- `@peculiar/webcrypto` — Node.js WebCrypto polyfill
- `@meshsdk/web3-sdk` — imports `@peculiar/webcrypto` in its Node.js branch

**Client-side alias** — maps `@peculiar/webcrypto → false` for browser bundles. In the browser, `window.crypto.subtle` is used directly, so the Node.js polyfill is never needed and would fail to bundle.
