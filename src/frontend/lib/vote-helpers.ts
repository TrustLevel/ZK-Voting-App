/**
 * Vote Helper Functions — re-exports for the voter flow.
 *
 * TX building: @src/tx/browser (vote-browser.ts)
 * ZK proofs and signal encoding: @src/zk/browser (*-browser.ts adaptations)
 * Script parameterisation: @src/tx/browser (utils-browser.ts)
 *
 * No logic lives here — each concern has a canonical home in its own package.
 */

export {
  buildVoteTransaction,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
} from '@src/tx/browser';
export type { BuildVoteTransactionParams } from '@src/tx/browser';

export { createOutputReference, applyOrefParamToScript } from '@src/tx/browser';

export { encodeVoteSignal, generateVoteProof } from '@src/zk/browser';
