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
NEXT_PUBLIC_BLOCKFROST_API_KEY=                     # Blockfrost project ID (Preprod)
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/create` | Create a new voting event (name, options, voting mode, group size) |
| `/event/[id]/manage` | Event management dashboard (parameters, participants, on-chain deployment) |
| `/join` | Join a voting event as a participant via invitation token |
| `/event/[id]` | Vote casting interface |
| `/info` | Documentation and help |

### `/create`

The organiser fills in the event configuration. On submit, the frontend:
1. Calls `POST /users/find-or-create-by-wallet` to register the wallet.
2. Calls `POST /voting-event` to create the event record in the backend.
3. Redirects to `/manage/:eventId` with the `adminToken` in the query string.

### `/event/[id]/manage`

Three-tab dashboard:

- **Parameters** — read-only display of voting configuration.
- **Participants** — add/remove participants by wallet address or email. As participants register via their invitation link (`/join`), their identity commitments are added to the group Merkle tree. Once the list is finalised, triggers an on-chain group-update transaction to push the new Merkle root on-chain.
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

The Blockfrost API key is passed to `BlockfrostProvider` on the client side. This is a known limitation — see the root `README.md` for the planned fix.

---

## ZK Proof Generation

The frontend uses the **browser entry point** of `@src/zk` (`@src/zk/browser`) to avoid importing Node.js-only modules into the browser bundle.

Key functions imported via `lib/vote-helpers.ts`:

| Function | Source | Description |
|---|---|---|
| `generateVoteProof()` | `@src/zk/browser` | Runs Groth16 prover in WASM, returns compressed proof, nullifier hash, and public signals |
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

---

## Deployment

### Vercel (recommended)

1. Push the repository to GitHub.
2. Create a new Vercel project and set **Root Directory** to `src/frontend`.
3. Add the environment variables:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_BACKEND_API_URL` | URL of the deployed backend, e.g. `https://api.yourdomain.com` |
   | `NEXT_PUBLIC_BLOCKFROST_API_KEY` | Blockfrost project ID for the target network |

4. Deploy. Vercel detects Next.js automatically.

### Other Node.js hosts

```sh
cd src/frontend
npm ci
npm run build       # outputs .next/
npm run start       # production server, port 3002
```

Set `PORT` if you need a different port. The `NEXT_PUBLIC_*` environment variables must be available at **build time** (not just runtime), because Next.js inlines them into the client bundle.

### Static assets for ZK proving

The Groth16 prover runs in the browser and loads two large static files from `public/zk/`:

| File | Size | Notes |
|---|---|---|
| `semaphore.wasm` | ~1 MB | Compiled Semaphore circuit |
| `semaphore_final.zkey` | ~40 MB | Groth16 proving key |

Both files are served at `/zk/semaphore.wasm` and `/zk/semaphore_final.zkey`. Vercel and other CDN-backed hosts cache them automatically. On first load, the browser downloads and caches the zkey; subsequent votes use the cached copy.

Ensure your host does not apply a response-size limit that would reject the ~40 MB zkey file.
