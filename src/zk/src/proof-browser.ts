/**
 * Browser-safe ZK vote proof generation.
 *
 * Mirrors proof.ts but:
 *   - Loads WASM and zkey from the Next.js public directory (/zk/) via fetch,
 *     not from the local filesystem (no fs, no __dirname).
 *   - Uses dynamic imports for snarkjs and @noble/hashes to avoid SSR issues.
 *   - Imports compressedG1/compressedG2 from conversion-browser.ts.
 * Identity secrets (nullifier, trapdoor) never leave the client.
 */

import { compressedG1, compressedG2 } from './conversion-browser.js';

const BLS12_381_R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

export async function generateVoteProof(params: {
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  merkleProof: { root: bigint; siblings: bigint[]; pathIndices: number[] };
  externalNullifier: bigint;
  signal: string; // hex from encodeVoteSignal
}): Promise<{
  zkProof: { pi_a: string; pi_b: string; pi_c: string };
  nullifierHash: bigint;
  publicSignals: string[];
}> {
  const { identityNullifier, identityTrapdoor, merkleProof, externalNullifier, signal } = params;

  const { blake2b } = await import('@noble/hashes/blake2b');
  const digestBytes = blake2b(new Uint8Array(Buffer.from(signal, 'hex')), { dkLen: 32 });
  const signalHash = BigInt('0x' + Buffer.from(digestBytes).toString('hex')) % BLS12_381_R;

  // @ts-expect-error — snarkjs has no type declarations
  const snarkjs = await import('snarkjs');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { identityNullifier, identityTrapdoor, treePathIndices: merkleProof.pathIndices, treeSiblings: merkleProof.siblings, externalNullifier, signalHash },
    '/zk/semaphore.wasm',
    '/zk/semaphore_final.zkey',
  );

  return {
    zkProof: {
      pi_a: await compressedG1(proof.pi_a),
      pi_b: await compressedG2(proof.pi_b),
      pi_c: await compressedG1(proof.pi_c),
    },
    nullifierHash: BigInt(publicSignals[1]),
    publicSignals,
  };
}
