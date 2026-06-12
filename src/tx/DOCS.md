# Transaction Builder — `@src/tx`

This module is the **on-chain interaction layer** of the voting application. It constructs all unsigned Cardano transactions — event bootstrap, group updates, and vote submission — and exposes utility functions for working with validator scripts, datums, and wallet addresses. All transaction builder functions return an unsigned transaction hex string that the caller signs via CIP-30 and submits.

---

## Setup

```sh
cd src/tx
npm install
npm run build           # compile TypeScript → dist/
npm run build:force     # re-extract validator CBORs from plutus.json, then compile
npm run check-validators # verify extracted CBORs match current plutus.json
npm run dev             # watch mode
```

### Environment variables (`src/tx/.env`)

Only needed when running scripts directly (not when used as a frontend dependency):

```env
NETWORK=testnet
SECRET_KEY=        # wallet mnemonic (for backend-side scripts)
API_KEY=           # Blockfrost API key
```

---

## Entry Points

| Import path | Usage |
|---|---|
| `@src/tx` | Node.js (backend scripts, tests) |
| `@src/tx/browser` | Browser / Next.js frontend |

Both entry points export the same functions. The browser entry point excludes any Node.js file-system access.

---

## Transaction Builders

### `buildGroupMintTransaction(params)`

Mints the **Group NFT** — the first of two bootstrap transactions. The Group NFT anchors the participant group on-chain and its policy ID is used to parameterise the subsequent validators.

### `buildSemaphoreVotingMintTransaction(params)`

Mints the **Semaphore NFT** and **Voting NFT** (Urna) in a single transaction. This is the second bootstrap transaction.

- The Semaphore NFT datum contains the Groth16 verification key and initial group Merkle root.
- The Voting NFT datum (`UrnaDatum`) contains the vote options, weight, and event dates — all tallies start at zero.
- Both validators are parameterised with the `OutputReference` consumed in this transaction, guaranteeing unique policy IDs per event.

### `buildVoteTransaction(params: BuildVoteTransactionParams)`

The most complex transaction builder — assembles the complete vote transaction that the on-chain Semaphore and Voting validators will verify. The caller provides the pre-computed ZK proof, MPF proof, and signal data; the function handles everything else:

- Fetches the live **Semaphore UTxO** and **Voting UTxO** from the chain internally using the provided `BlockfrostProvider`.
- Re-derives the parameterised validator CBORs from `mintingOrefTxHash` / `mintingOrefIndex` via `applyOrefParamToScript()`.
- Constructs the `Signal` redeemer with the ZK proof, MPF proof steps, nullifier, signal hash, and signal message.
- Attaches the **VKey UTxO** as a hardcoded read-only reference input (constants `VKEY_REF_TX_HASH` / `VKEY_REF_OUTPUT_INDEX`) — never fetched, never consumed.
- Outputs the updated `SemaphoreDatum` (new MPF root) and `UrnaDatum` (incremented vote tally).

Returns an unsigned transaction hex string ready for CIP-30 signing.

---

## Validators

```ts
VALIDATORS.group.mint       // Group NFT minting validator CBOR
VALIDATORS.semaphore.mint   // Semaphore NFT minting validator CBOR
VALIDATORS.voting.mint      // Voting NFT minting validator CBOR
```

CBORs are auto-extracted from `src/on-chain/plutus.json` by `scripts/extract-validators.ts`. Run `npm run build:force` after any contract change to regenerate them.

`getValidatorCbor(name)` is a browser-compatible helper that returns a validator CBOR by name (`'group' | 'semaphore' | 'voting'`).

---

## Utility Functions

### Script

| Function | Description |
|---|---|
| `applyOrefParamToScript(validator, oref)` | Apply an `OutputReference` as a parameter to a validator script |
| `createOutputReference(txHash, outputIndex)` | Construct an `OutputReference` object |

### Datum constructors

| Function | Description |
|---|---|
| `createGroupDatum(merkleRoot, adminPkh)` | Build a `GroupDatum` |
| `createUrnaDatum(params)` | Build a `UrnaDatum` (Voting NFT datum) |

### Wallet

| Function | Description |
|---|---|
| `createWallet(provider, mnemonic, accountIndex)` | Create a MeshSDK wallet from a mnemonic |
| `walletBaseAddress(wallet)` | Get the base address string |
| `extractPaymentKeyHash(address)` | Extract the payment key hash from an address |
| `parseMnemonic(mnemonicString)` | Parse a space-separated mnemonic string |

### Event configuration

| Function | Description |
|---|---|
| `generateInitialOptions(numOptions)` | Generate zeroed vote tally array |
| `generateEventTiming(options)` | Generate event timing parameters |
| `textToHex(text)` | Encode a string as hex (for NFT asset names) |

---

## Two-Transaction Bootstrap Flow

```
1. buildGroupMintTransaction()
      → sign → submit → wait for confirmation

2. buildSemaphoreVotingMintTransaction()
      (references the confirmed Group NFT UTxO)
      → sign → submit → wait for confirmation

3. POST /voting-event/:eventId/save-blockchain-data
      (persist contract addresses in backend)
```

The `OutputReference` consumed in step 2 must be stored in the backend (`mintingOrefTxHash`, `mintingOrefIndex`) because the frontend needs it later to re-derive the validator CBORs when building vote transactions.
