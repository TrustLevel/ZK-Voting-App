// Browser-safe entry point for @src/zk.
// Does NOT re-export the Node.js originals — those use fs, require, and local paths.
export { compressedG1, compressedG2 } from '../conversion-browser.js';
export { encodeVoteSignal, decodeVoteSignal } from '../signal-browser.js';
export { generateVoteProof } from '../proof-browser.js';
