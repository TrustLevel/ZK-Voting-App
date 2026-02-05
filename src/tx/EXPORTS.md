# @src/tx Package Exports

All functions and utilities from the transaction package are now accessible through `index.ts` for frontend use.

## 🔨 Transaction Builder Functions

### `buildGroupMintTransaction(params)`
Build unsigned transaction for minting Group NFT. Handles Ogmios evaluation errors.

```typescript
const unsignedTx = await buildGroupMintTransaction({
  provider: BlockfrostProvider,
  policyId: string,
  assetName: string,
  clothedCbor: string,
  createRedeemer: any,
  selectedUtxo: UTxO,
  walletUtxos: UTxO[],
  walletAddress: string,
  scriptAddr: string,
  mintValue: Asset[],
  groupDatum: any,
  paymentKeyHash: string
});
```

### `buildSemaphoreVotingMintTransaction(params)`
Build unsigned transaction for minting Semaphore + Voting NFTs together in one transaction.

```typescript
const unsignedTx = await buildSemaphoreVotingMintTransaction({
  provider: BlockfrostProvider,
  txValidityEndSlot: number,
  groupNftTxHash: string,
  groupNftOutputIndex: number,
  semaphorePolicyId: string,
  semaphoreAssetName: string,
  semaphoreValidatorCbor: string,
  votingPolicyId: string,
  votingAssetName: string,
  votingValidatorCbor: string,
  selectedUtxo: UTxO,
  walletUtxos: UTxO[],
  walletAddress: string,
  semaphoreScriptAddr: string,
  semaphoreMintValue: Asset[],
  semaphoreDatum: any,
  votingScriptAddr: string,
  votingMintValue: Asset[],
  urnaDatum: any,
  paymentKeyHash: string
});
```

## 📜 Validators

### `VALIDATORS`
Object containing all validator CBORs:
- `VALIDATORS.group.mint` - Group NFT minting validator
- `VALIDATORS.semaphore.mint` - Semaphore NFT minting validator
- `VALIDATORS.voting.mint` - Voting NFT minting validator
- `VALIDATORS._metadata` - Metadata about validators

### `getValidatorCbor(name)`
Get validator CBOR by name (browser-compatible).

```typescript
const validatorCbor = getValidatorCbor('group'); // or 'semaphore' | 'voting'
```

## 🛠️ Utility Functions

### Wallet Management
- `createWallet(provider, mnemonic, accountIndex)` - Create wallet from mnemonic
- `walletBaseAddress(wallet)` - Get wallet base address
- `extractPaymentKeyHash(address)` - Extract payment key hash from address
- `parseMnemonic(mnemonicString)` - Parse mnemonic string to array

### Script Utilities
- `applyOrefParamToScript(validator, oref)` - Parameterize validator with OutputReference
- `cborOfValidatorWith(path, name, purpose)` - Load validator from plutus.json

### Datum Constructors
- `createGroupDatum(merkleRoot, adminPkh)` - Create GroupDatum
- `createUrnaDatum(params)` - Create UrnaDatum (Voting datum)
- `createOutputReference(txHash, outputIndex)` - Create OutputReference structure

### UTxO Management
- `selectUtxoAndCreateOutputReference(utxos, index)` - Select UTxO and create OutputReference

### Event Configuration
- `generateInitialOptions(numOptions)` - Generate initial vote tallies (all zeros)
- `generateEventTiming(options)` - Generate event timing parameters

### Conversion
- `textToHex(text)` - Convert text to hex for asset names

## 📚 Type Definitions

All types from `types.ts` are exported:
- `PlutusValidatorBlueprint`
- `ValidatorMetadata`
- `Validators`
- And more...

## 🎯 Frontend Usage Example

```typescript
import {
  buildGroupMintTransaction,
  buildSemaphoreVotingMintTransaction,
  VALIDATORS,
  createGroupDatum,
  createUrnaDatum,
  generateInitialOptions,
  generateEventTiming,
  createOutputReference,
  applyOrefParamToScript,
  textToHex
} from '@src/tx';
import { BlockfrostProvider } from '@meshsdk/core';

// Example: Mint Group NFT
async function mintGroupNFT(walletContext) {
  const provider = new BlockfrostProvider(apiKey);

  // Prepare validator
  const outputRef = createOutputReference(txHash, outputIndex);
  const validatorCbor = applyOrefParamToScript(
    VALIDATORS.group.mint,
    outputRef
  );

  // Create datum
  const datum = createGroupDatum(0, paymentKeyHash);

  // Build transaction
  const unsignedTx = await buildGroupMintTransaction({
    provider,
    policyId,
    assetName: textToHex('MyGroup'),
    clothedCbor: validatorCbor,
    // ... other params
  });

  // Sign with CIP-30 wallet
  const signedTx = await window.cardano.nami.signTx(unsignedTx);

  // Submit
  const txHash = await window.cardano.nami.submitTx(signedTx);

  return txHash;
}
```

## 🔗 Two-Transaction Minting Flow

1. **First**: Mint Group NFT using `buildGroupMintTransaction()`
2. **Wait** for confirmation on-chain
3. **Then**: Mint Semaphore + Voting together using `buildSemaphoreVotingMintTransaction()`
   - This transaction references the on-chain Group NFT

## ✅ Build Status

Package builds successfully with all exports available:
- Transaction builders ✅
- Validators ✅
- Utilities ✅
- Types ✅

Run `npm run build` to generate the `dist/` folder with all exports.
