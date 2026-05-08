/**
 * Vote Helper Functions — Browser-adapted ZK + TX logic for the voter flow.
 *
 * Transaction building is delegated to @src/tx/src/vote-browser.ts which is the
 * browser-safe version of @src/tx/src/vote.ts (no fs, CBOR datums, no evaluator,
 * reads current vote tallies from the on-chain UTxO datum).
 *
 * This file owns only the browser-specific ZK proof generation and signal encoding
 * that must run in the user's browser so identity secrets never leave the client.
 */

export {
  buildVoteTransaction,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
} from '@src/tx/browser';
export type { BuildVoteTransactionParams } from '@src/tx/browser';

import { createOutputReference } from '@src/tx/browser';
export { createOutputReference };

export { applyOrefParamToScript } from '@src/tx/browser';

const BLS12_381_R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

// ── G1 / G2 point compression (BLS12-381) ─────────────────────────────────────

type G1Point = [string, string, string];
type G2Point = [[string, string], [string, string], [string, string]];

async function compressedG1(point: G1Point): Promise<string> {
  const bb = await import('bigint-buffer');
  // @ts-expect-error — ffjavascript has no type declarations
  const ff = await import('ffjavascript');
  const curve = await ff.getCurveFromName('bls12381');

  const result: Buffer = bb.toBufferBE(BigInt(point[0]), 48);
  const COMPRESSED = 0b10000000, INFINITY = 0b01000000, YBIT = 0b00100000;
  result[0] |= COMPRESSED;

  if (BigInt(point[2]) !== 1n) {
    result[0] |= INFINITY;
  } else {
    const F = curve.G1.F;
    const x = F.fromObject(BigInt(point[0]));
    const x3b = F.add(F.mul(F.square(x), x), curve.G1.b);
    const y1 = F.toObject(F.sqrt(x3b));
    const y2 = F.toObject(F.neg(F.sqrt(x3b)));
    const y = BigInt(point[1]);
    if ((y1 > y2 && y > y2) || (y1 < y2 && y > y1)) result[0] |= YBIT;
  }
  return result.toString('hex');
}

async function compressedG2(point: G2Point): Promise<string> {
  const bb = await import('bigint-buffer');
  // @ts-expect-error — ffjavascript has no type declarations
  const ff = await import('ffjavascript');
  const curve = await ff.getCurveFromName('bls12381');

  const result = Buffer.concat([bb.toBufferBE(BigInt(point[0][1]), 48), bb.toBufferBE(BigInt(point[0][0]), 48)]);
  const COMPRESSED = 0b10000000, INFINITY = 0b01000000, YBIT = 0b00100000;
  result[0] |= COMPRESSED;

  if (BigInt(point[2][0]) !== 1n) {
    result[0] |= INFINITY;
  } else {
    const F = curve.G2.F;
    const x = F.fromObject(point[0].map((s: string) => BigInt(s)));
    const x3b = F.add(F.mul(F.square(x), x), curve.G2.b);
    const y1 = F.toObject(F.sqrt(x3b));
    const y2 = F.toObject(F.neg(F.sqrt(x3b)));

    function gt(a: [bigint, bigint], b: [bigint, bigint]) { return a[1] > b[1] || (a[1] === b[1] && a[0] > b[0]); }
    const y = point[1].map((s: string) => BigInt(s)) as [bigint, bigint];
    if ((gt(y1, y2) && gt(y, y2)) || (gt(y2, y1) && gt(y, y1))) result[0] |= YBIT;
  }
  return result.toString('hex');
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Encodes vote options into CBOR signal_message.
 * Input: [[optionIndex, voteCount], ...]
 * Output: CBOR hex string (matches Aiken's deserialise_signal format)
 */
export async function encodeVoteSignal(options: Array<[number, number]>): Promise<string> {
  const { csl } = await import('@meshsdk/core-csl');
  const outer = csl.PlutusList.new();
  for (const [index, count] of options) {
    const inner = csl.PlutusList.new();
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(index))));
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(count))));
    outer.add(csl.PlutusData.new_list(inner));
  }
  return Buffer.from(csl.PlutusData.new_list(outer).to_bytes()).toString('hex');
}

/**
 * Generates the Groth16 ZK vote proof in the browser.
 * Loads WASM and ZKEY from /public/zk/.
 * Identity secrets (nullifier, trapdoor) never leave the client.
 */
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
