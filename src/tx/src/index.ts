// Main exports for @src/tx package

// Transaction builder functions
export { buildGroupMintTransaction } from './mint-group.js';
export { buildSemaphoreVotingMintTransaction } from './mint-sv.js';
export { buildVoteTransaction, VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX } from './vote.js';
export type { BuildVoteTransactionParams } from './vote.js';

// Utility functions
export * from './utils.js';

// Type definitions
export * from './types.js';

// Validators
export * from './validators.js';

// Legacy builders (if any)
export * from './builders.js';

/**
 * @src/tx - Transaction Building Module
 *
 * This package provides utilities for building and submitting Cardano transactions
 * for the ZK-Voting application.
 *
 * ## Minting Scripts:
 * - `mint-group.ts` - Mint Cardano Semaphore Group NFTs
 * - `mint-semaphore.ts` - Mint Semaphore authentication NFTs
 * - `mint-voting.ts` - Mint Voting Event NFTs
 *
 * ## Usage Example:
 *
 * ```typescript
 * import { createWallet, cborOfValidatorWith, applyOrefParamToScript } from '@src/tx';
 * import { BlockfrostProvider } from '@meshsdk/core';
 *
 * const provider = new BlockfrostProvider('your-api-key');
 * const wallet = await createWallet(provider, mnemonic, 0);
 *
 * // Load and parameterize validator
 * const validatorCbor = cborOfValidatorWith(
 *   "/path/to/plutus.json",
 *   "validatorName",
 *   "endpoint"
 * );
 *
 * const parameterizedValidator = applyOrefParamToScript(
 *   validatorCbor,
 *   outputReference
 * );
 * ```
 *
 * ## Utilities Available:
 * - `createWallet()` - Create wallet from mnemonic
 * - `walletBaseAddress()` - Get wallet base address
 * - `cborOfValidatorWith()` - Load validator from plutus.json
 * - `applyOrefParamToScript()` - Parameterize validator with OutputReference
 * - `parseMnemonic()` - Parse mnemonic from string
 * - `textToHex()` - Convert text to hex for asset names
 *
 * @module @src/tx
 */
