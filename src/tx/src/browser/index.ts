// Browser-safe entry point for @src/tx.
// Does NOT re-export utils.ts or vote.ts — both use fs/MeshWallet (Node.js only).
// Import this as "@src/tx/browser" from Next.js / frontend code.

export {
  buildVoteTransaction,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
} from './vote-browser.js';
export type { BuildVoteTransactionParams } from './vote-browser.js';

export {
  createOutputReference,
  createUrnaDatum,
  selectUtxoForCollateral,
} from './utils-browser.js';

export * from '../validators.js';
