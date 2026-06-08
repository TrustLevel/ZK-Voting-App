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

## Cryptographic Primitives

### Curve: BLS12-381

All ZK operations use the **BLS12-381** pairing-friendly elliptic curve. This curve was chosen because:
- It is supported natively in Cardano's Plutus built-ins (since Chang hard fork).
- The Semaphore circuit was compiled with `--prime bls12381`, matching the on-chain verifier.
- The scalar field prime `r ≈ 2^255` fits within Cardano's integer limits.

### Proof system: Groth16

The application uses the **Groth16** zk-SNARK proving system:
- Constant-size proofs (3 elliptic curve points: π_A, π_B, π_C).
- Fast on-chain verification (suitable for Plutus execution budget).
- Requires a trusted setup (see below).

Proving is performed by **snarkjs** in the browser via a compiled WASM module. The on-chain verifier is implemented in `modulo-p/cardano-semaphore` using the BLS12-381 built-ins.

### Hash function: Poseidon

Group Merkle tree leaves and internal nodes are hashed with the **Poseidon** hash function, which is ZK-circuit-friendly (low constraint count). The specific instantiation is `poseidon-bls12381` over the BLS12-381 scalar field.

### Nullifier hash

The nullifier is computed inside the circuit as:

```
nullifierHash = poseidon(externalNullifier, identityNullifier)
```

`externalNullifier` is derived from the voting event, making each nullifier event-specific. The same identity produces a different nullifier in every event, preserving cross-event anonymity.

### Signal hash

The signal hash is the circuit's public input binding the proof to the vote content:

```
signalHash = blake2b_256(signal_message) % BLS12_381_R
```

The modular reduction is required because `blake2b_256` produces 256-bit values and the BLS12-381 scalar field prime `r` is ~255 bits. Without it, ~55% of possible messages would produce an out-of-range value. Both the off-chain prover and the on-chain verifier apply this reduction.

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

Runs the Groth16 prover and returns a compressed proof.

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
