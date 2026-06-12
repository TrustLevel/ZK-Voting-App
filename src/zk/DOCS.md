# ZK Proof Module — `@src/zk`

This module implements all zero-knowledge cryptography for the voting application: Groth16 proof generation, vote signal encoding, BLS12-381 point compression, and MPF nullifier insertion. The browser entry point is designed to run entirely client-side — voter identity secrets never leave the user's device.

---

## Setup

```sh
cd src/zk
npm install
npm run build       # compile TypeScript → dist/
npm run dev         # watch mode
npm run test        # run all tests (conversion, signal, proof)
```

---

## Entry Points

| Import path | Usage |
|---|---|
| `@src/zk` | Node.js (backend, tests) — loads WASM and zkey from the filesystem |
| `@src/zk/browser` | Browser / Next.js frontend — fetches WASM and zkey via HTTP from `/public/zk/` |

The browser entry point uses dynamic imports and `fetch()` instead of `fs` / `require()`, making it safe to bundle with webpack.

---

## Protocol Background

[Semaphore](https://semaphore.appliedzkp.org/) is a zero-knowledge protocol for anonymous signalling within a defined group. This application uses a BLS12-381 variant, verified on Cardano via a Groth16 proof.

### Identity

Each participant holds a **Semaphore identity**: a pair of secret values (`identityNullifier`, `identityTrapdoor`) that never leave the user's device. From these, a public **identity commitment** is derived — a Poseidon hash that is safe to share and is registered in the group.

### The Group

The organiser maintains a group as an **incremental Merkle tree**. Every registered participant's identity commitment occupies a leaf. The Merkle root represents the entire group and is anchored on-chain inside the Semaphore NFT.

### Proving Membership Without Revealing Identity

When a participant wants to vote, they produce a Groth16 zero-knowledge proof that simultaneously demonstrates:

1. They know the secret behind one of the commitments in the Merkle tree (group membership).
2. The signal they are sending (the encoded vote) is bound to that proof.
3. They have computed a **nullifier hash** — a one-time value derived from their secret and the specific voting event — that cannot be traced back to their identity.

The proof is verified on-chain by the Semaphore smart contract. Because the proof reveals nothing except its own validity, the voter's identity remains anonymous.

### Double-Vote Prevention

The nullifier hash is inserted into a **Merkle Patricia Forestry (MPF) trie** stored off-chain and anchored on-chain. Submitting the same nullifier twice is rejected by the smart contract, preventing any participant from voting more than once — without ever exposing who they are.

---

## Cryptographic Primitives

### Curve: BLS12-381

**BLS12-381** is a pairing-friendly elliptic curve defined over a 381-bit prime field. "Pairing-friendly" means it supports bilinear pairings — a mathematical operation that makes efficient on-chain ZK-proof verification possible. This curve was chosen because:
- It is supported natively in Cardano's Plutus built-ins (since the Chang hard fork).
- The Semaphore circuit was compiled with `--prime bls12381`, matching the on-chain verifier.
- The scalar field prime `r ≈ 2^255` fits within Cardano's integer limits.

### Proof system: Groth16

**Groth16** is a zk-SNARK (Zero-Knowledge Succinct Non-interactive ARgument of Knowledge) proving system. A zk-SNARK lets a prover convince a verifier that a statement is true without revealing any information beyond its truth. Groth16's specific properties make it suitable for on-chain use:
- Constant-size proofs — always 3 elliptic curve points (π_A ∈ G1, π_B ∈ G2, π_C ∈ G1), regardless of circuit complexity.
- Fast on-chain verification — a fixed number of pairing operations, within the Plutus execution budget.
- Requires a trusted setup (see [Trusted Setup](#trusted-setup) below).

Proving is performed by **snarkjs** in the browser via a compiled WASM module. The on-chain verifier is implemented in `modulo-p/cardano-semaphore` using the BLS12-381 built-ins.

### Hash function: Poseidon

**Poseidon** is a cryptographic hash function designed specifically for ZK circuits. Unlike general-purpose hashes (SHA-256, blake2b), Poseidon operates natively over prime field arithmetic — the same arithmetic used inside ZK circuits — which results in a very low constraint count. This makes it practical to compute Poseidon inside a circuit without blowing up proof generation time. All identity and group hashing in Semaphore uses Poseidon. The specific instantiation here is `poseidon-bls12381` over the BLS12-381 scalar field.

### Identity secret

The **identity secret** is an intermediate private value derived from the voter's two secret inputs:

```
identitySecret = poseidon(identityTrapdoor, identityNullifier)
```

It is never shared or exposed — it exists only inside the circuit and the voter's local state.

### Identity commitment

The **identity commitment** is the voter's public identifier — the value added as a leaf in the group Merkle tree:

```
identityCommitment = poseidon(identitySecret)
```

It is safe to share publicly because Poseidon is a one-way function: the commitment reveals nothing about the underlying `identitySecret`, `identityTrapdoor`, or `identityNullifier`. It is analogous to a public key.

### Merkle inclusion proof

To prove group membership without revealing which leaf they occupy, a voter provides a **Merkle inclusion proof**: the sequence of sibling hashes (`siblings`) and left/right positions (`pathIndices`) from their leaf up to the root. The circuit recomputes the root from the leaf and this path, then checks it matches the public root anchored on-chain. If the recomputed root matches, group membership is proven — without disclosing which leaf belongs to the voter.

### External nullifier

The **external nullifier** is a public value that scopes a nullifier to a specific context (in this case, a specific voting event). In this application it is set to:

```
externalNullifier = BigInt('0x' + semaphoreNftPolicyId)
```

Using the Semaphore NFT policy ID — which is unique per voting event — means a voter's nullifier hash is different in every event. This preserves cross-event anonymity: a voter's participation in one event cannot be linked to their participation in another.

### Nullifier hash

The **nullifier hash** is the double-vote prevention token. It is computed inside the circuit as:

```
nullifierHash = poseidon(externalNullifier, identityNullifier)
```

Because `identityNullifier` is secret and the computation happens inside the ZK proof, the nullifier hash can be published on-chain without revealing the voter's identity. The smart contract rejects any vote transaction that reuses a nullifier hash already stored in the MPF trie.

### Signal hash

The **signal hash** binds the ZK proof to the specific vote content, preventing a proof from being replayed with a different vote:

```
signalHash = blake2b_256(signal_message) % BLS12_381_R
```

`blake2b_256` is used here (rather than Poseidon) because the signal is arbitrary bytes, not a field element. The modular reduction by `BLS12_381_R` is required because `blake2b_256` produces 256-bit values while the BLS12-381 scalar field prime `r` is ~255 bits — without it, ~55% of possible messages would produce an out-of-range value. Both the off-chain prover and the on-chain verifier apply this reduction.

---

## Trusted Setup

The Groth16 prover requires a **proving key** (`semaphore_final.zkey`) generated in a trusted setup ceremony. The key used in this application was produced with **21 contributors**, following the Semaphore project's ceremony process.

| File | Path | Description |
|---|---|---|
| `semaphore.wasm` | `wasm/semaphore.wasm` | Compiled Semaphore circuit (BLS12-381) |
| `semaphore_final.zkey` | `keys/semaphore_final.zkey` | Groth16 proving key |
| `verification_key.json` | `keys/verification_key.json` | Groth16 verification key |

The WASM and zkey were verified compatible by generating and verifying a test proof before deployment. The verification key is also embedded on-chain as the VKey UTxO datum.

For the browser, these files are served as static assets from `src/frontend/public/zk/`.

---

## Functions

### `generateVoteProof(params)` — `proof.ts` / `proof-browser.ts`

Runs the Groth16 prover and returns a compressed proof, the nullifier hash, and the circuit's public signals.

```ts
const { zkProof, nullifierHash, publicSignals } = await generateVoteProof({
  identityNullifier: bigint,
  identityTrapdoor: bigint,
  merkleProof: { root, siblings, pathIndices },
  externalNullifier: bigint,
  signal: string,   // hex from encodeVoteSignal()
});
```

**Browser behaviour**: loads `semaphore.wasm` and `semaphore_final.zkey` via `fetch('/zk/...')`. Both files are large (~40 MB for the zkey) and are cached by the browser after first load.

### `encodeVoteSignal(options)` — `signal.ts` / `signal-browser.ts`

CBOR-encodes vote options as `List<(Int, Int)>` — the format expected by the on-chain `deserialise_signal()` function.

```ts
// Simple vote: cast 1 vote for option index 2
const hex = await encodeVoteSignal([[2, 1]]);

// Weighted vote: distribute 5 points across options 0 and 1
const hex = await encodeVoteSignal([[0, 3], [1, 2]]);
```

Returns a hex string used both as the `signal_message` in the redeemer and as input to compute `signal_hash`.

### `decodeVoteSignal(hex)` — `signal.ts` / `signal-browser.ts`

Inverse of `encodeVoteSignal`. Decodes a hex-encoded CBOR signal back to `Array<[index, count]>`.

### `compressedG1(point)` / `compressedG2(point)` — `conversion.ts` / `conversion-browser.ts`

Compress BLS12-381 elliptic curve points to the compact on-chain representation expected by the Cardano Semaphore verifier.

- `compressedG1`: 48-byte compressed affine G1 point.
- `compressedG2`: 96-byte compressed affine G2 point.

Compression follows the ZCash standard: the most-significant byte encodes the compression flag, infinity flag, and sign bit.

### `insertNullifier(eventId, nullifier)` — `mpf.ts`

Node.js only. Inserts a nullifier into the LevelDB-backed MPF trie for the given event and returns the CBOR-encoded proof steps and new root. Used by the backend (`POST /voting-event/:eventId/nullifier`).

---

## File Structure

```
src/zk/
├── src/
│   ├── index.ts              # Node.js entry point
│   ├── browser/
│   │   └── index.ts          # Browser entry point
│   ├── proof.ts              # Node.js Groth16 prover
│   ├── proof-browser.ts      # Browser Groth16 prover (fetch-based)
│   ├── signal.ts             # Node.js signal encoding
│   ├── signal-browser.ts     # Browser signal encoding (dynamic import)
│   ├── conversion.ts         # Node.js G1/G2 compression
│   ├── conversion-browser.ts # Browser G1/G2 compression (dynamic import)
│   └── mpf.ts                # MPF nullifier trie (Node.js only)
├── wasm/
│   └── semaphore.wasm        # Compiled Semaphore circuit
└── keys/
    ├── semaphore_final.zkey  # Groth16 proving key (trusted setup)
    └── verification_key.json # Groth16 verification key
```
