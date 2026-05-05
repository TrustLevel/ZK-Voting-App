# Frontend vs Backend Code Split

Analysis of which functions/code belong in frontend vs backend, with focus on API key exposure.

## 🔴 BACKEND ONLY (Requires API Keys/Secrets)

### Functions that use Blockfrost API Key

These functions **MUST run on backend** because they need the Blockfrost API key:

#### `createWallet(provider, mnemonic, networkId)`
- ❌ **BACKEND ONLY**
- Creates MeshWallet with BlockfrostProvider as fetcher
- Requires: API key (via provider) + mnemonic (secret!)
- **Why backend**: Exposes both API key and mnemonic

#### `wallet.getUtxos()`
- ❌ **BACKEND ONLY**
- Internally calls BlockfrostProvider to query UTxOs
- Requires: Blockfrost API key (via provider)
- **Workaround for frontend**: Use CIP-30 wallet API instead

```typescript
// BACKEND (current code)
const wallet = await createWallet(provider, mnemonic, 0);
const utxos = await wallet.getUtxos(); // Uses Blockfrost API key

// FRONTEND (CIP-30 alternative)
const walletApi = await window.cardano.nami.enable();
const utxos = await walletApi.getUtxos(); // No API key needed!
```

#### `provider.fetchLatestBlock()`
- ❌ **BACKEND ONLY**
- Requires: Blockfrost API key
- Used in: mint-sv.ts line 152 to get current slot
- **Workaround**: Backend endpoint that returns current slot

#### `wallet.signTx(unsignedTx, partialSign)`
- ❌ **BACKEND ONLY** (in current implementation)
- Requires: Wallet mnemonic (to sign)
- **Frontend alternative**: CIP-30 `walletApi.signTx(unsignedTx, partialSign)`

#### `wallet.submitTx(signedTx)`
- ❌ **BACKEND ONLY** (in current implementation)
- Submits via BlockfrostProvider
- Requires: Blockfrost API key
- **Frontend alternative**: CIP-30 `walletApi.submitTx(signedTx)`

### Functions that handle secrets

#### `parseMnemonic(mnemonicString)`
- ❌ **BACKEND ONLY**
- Handles mnemonic seed phrase (secret!)
- Never expose mnemonics in frontend

## ✅ FRONTEND SAFE (No API Keys/Secrets)

### Transaction Builders (Safe for Frontend!)

These functions **BUILD** transactions but don't sign or submit them:

#### `buildGroupMintTransaction(params)`
- ✅ **FRONTEND SAFE**
- Builds unsigned transaction CBOR
- Does NOT sign or submit
- **BUT**: Requires UTxOs and provider as input
- **Frontend adaptation needed**: Pass UTxOs from CIP-30, use provider for evaluation only (or skip evaluation)

#### `buildSemaphoreVotingMintTransaction(params)`
- ✅ **FRONTEND SAFE** (same as above)
- Builds unsigned transaction CBOR
- Requires UTxOs from somewhere

### Pure Utility Functions (Frontend Safe)

These functions are **pure** - no API calls, no secrets:

#### `extractPaymentKeyHash(walletAddress)`
- ✅ **FRONTEND SAFE**
- Pure function - deserializes address to extract key hash
- No API calls

#### `createOutputReference(txHash, outputIndex)`
- ✅ **FRONTEND SAFE**
- Pure function - creates PlutusData structure
- No API calls

#### `createGroupDatum(merkleRoot, adminPkh)`
- ✅ **FRONTEND SAFE**
- Pure function - creates PlutusData structure

#### `createUrnaDatum(params)`
- ✅ **FRONTEND SAFE**
- Pure function - creates PlutusData structure

#### `generateInitialOptions(numOptions)`
- ✅ **FRONTEND SAFE**
- Pure function - generates array of zeros

#### `generateEventTiming(options)`
- ✅ **FRONTEND SAFE**
- Pure function - calculates timestamps

#### `applyOrefParamToScript(validator, oref)`
- ✅ **FRONTEND SAFE**
- Pure function - parameterizes validator CBOR

#### `textToHex(text)`
- ✅ **FRONTEND SAFE**
- Pure function - converts text to hex

#### `selectUtxoAndCreateOutputReference(utxos, index)`
- ✅ **FRONTEND SAFE**
- Pure function - selects UTxO from array
- No API calls

### Validator Access (Frontend Safe)

#### `VALIDATORS` object
- ✅ **FRONTEND SAFE**
- Static CBOR strings - no API calls

#### `getValidatorCbor(name)`
- ✅ **FRONTEND SAFE**
- Pure function - returns CBOR from static object

## 🔧 WORKAROUNDS FOR FRONTEND

### Problem 1: Getting UTxOs

**Current (Backend):**
```typescript
const wallet = await createWallet(provider, mnemonic, 0); // Uses API key
const walletUtxos = await wallet.getUtxos(); // Uses API key via provider
```

**Frontend Solution:**
```typescript
// Connect to CIP-30 wallet (Nami, Eternl, etc.)
const walletApi = await window.cardano.nami.enable();

// Get UTxOs directly from wallet (no API key needed!)
const walletUtxosRaw = await walletApi.getUtxos();

// Parse CBOR to UTxO objects if needed
const walletUtxos = walletUtxosRaw.map(utxo => /* parse CBOR */);
```

### Problem 2: Getting Current Slot

**Current (Backend):**
```typescript
const currentSlot = await provider.fetchLatestBlock()
  .then(block => parseInt(block.slot)); // Uses API key
```

**Frontend Solution Option A (Backend endpoint):**
```typescript
// Create backend endpoint: GET /api/current-slot
const response = await fetch('/api/current-slot');
const { currentSlot } = await response.json();
```

**Frontend Solution Option B (Wallet API):**
```typescript
// Some CIP-30 wallets expose network info
const networkInfo = await walletApi.experimental.getNetworkId();
// Or calculate from local time (less accurate)
```

### Problem 3: Transaction Evaluation

**Current (Backend):**
```typescript
const txBuilder = new MeshTxBuilder({
  fetcher: provider,  // Uses API key
  evaluator: provider, // Uses API key
  verbose: false
});
```

**Frontend Solution:**
```typescript
// Option A: Skip evaluation, extract TX from error
const txBuilder = new MeshTxBuilder({
  fetcher: provider,  // Could be null or mock
  evaluator: provider, // Could be null or mock
  verbose: false
});
// Handle evaluation errors, extract TX hex

// Option B: Backend evaluation endpoint
const response = await fetch('/api/evaluate-tx', {
  method: 'POST',
  body: JSON.stringify({ unsignedTx })
});
```

### Problem 4: Signing & Submitting

**Current (Backend):**
```typescript
const signedTx = await wallet.signTx(unsignedTx, true); // Uses mnemonic
const txHash = await wallet.submitTx(signedTx); // Uses API key
```

**Frontend Solution:**
```typescript
// CIP-30 wallet handles both!
const signedTx = await walletApi.signTx(unsignedTx, true);
const txHash = await walletApi.submitTx(signedTx);
```

## 📋 RECOMMENDED ARCHITECTURE

### Frontend Flow (Browser)

```typescript
// 1. Connect to CIP-30 wallet
const walletApi = await window.cardano.nami.enable();

// 2. Get wallet data (no API key needed!)
const address = await walletApi.getChangeAddress();
const utxos = await walletApi.getUtxos();
const paymentKeyHash = extractPaymentKeyHash(address); // Pure function

// 3. Get current slot from backend
const { currentSlot } = await fetch('/api/current-slot').then(r => r.json());

// 4. Build transaction (pure functions + builder)
const { unsignedTx, policyId } = await buildGroupMintTransaction({
  // ... params using data from above
});

// 5. Sign with browser wallet (no API key needed!)
const signedTx = await walletApi.signTx(unsignedTx, true);

// 6. Submit with browser wallet (no API key needed!)
const txHash = await walletApi.submitTx(signedTx);
```

### Backend Endpoints Needed

```typescript
// GET /api/current-slot
// Returns: { currentSlot: number }

// POST /api/evaluate-tx (optional)
// Body: { unsignedTx: string }
// Returns: { evaluated: boolean, executionUnits: {...} }
```

## 🎯 SUMMARY

### ✅ Frontend Can Use:
- All transaction builder functions (`buildGroupMintTransaction`, `buildSemaphoreVotingMintTransaction`)
- All pure utility functions (datum creators, converters, selectors)
- VALIDATORS object and `getValidatorCbor()`
- CIP-30 wallet APIs for UTxOs, signing, submitting

### ❌ Frontend CANNOT Use:
- `createWallet()` - needs mnemonic + API key
- `wallet.getUtxos()` - needs API key (via provider)
- `provider.fetchLatestBlock()` - needs API key
- Any mnemonic handling

### 🔧 Backend Endpoints Needed:
1. `GET /api/current-slot` - Returns current blockchain slot
2. `POST /api/evaluate-tx` (optional) - Evaluates transaction execution units

### 🎨 Key Insight:
The transaction **builder functions** are already frontend-safe! They just **build** unsigned transactions. The issue is with the **input data** (UTxOs, slot) and **submission** (signing, submitting) - which CIP-30 wallets handle perfectly.
