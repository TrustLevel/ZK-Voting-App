import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { compressedG1, compressedG2, decompressG1, decompressG2 } from './conversion.js';

const require = createRequire(import.meta.url);
const snarkjs = require('snarkjs');
const blake2b = require('blake2b');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(__dirname, '../wasm/semaphore.wasm');
const ZKEY_PATH = path.join(__dirname, '../keys/semaphore_final.zkey');
const VKEY_PATH = path.join(__dirname, '../keys/verification_key.json');

type MerkleProof = {
  root: bigint;
  siblings: bigint[];
  pathIndices: number[];
};

export async function generateVoteProof(params: {
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  merkleProof: MerkleProof;
  externalNullifier: bigint;
  signal: string; // hex string from encodeVoteSignal()
}): Promise<{
  zkProof: { pi_a: string; pi_b: string; pi_c: string };
  nullifierHash: bigint;
  publicSignals: string[];
}> {
  const { identityNullifier, identityTrapdoor, merkleProof, externalNullifier, signal } = params;

  // signal_hash = blake2b_256(signal_message) mod r, where r is the BLS12-381 scalar field prime.
  // The circom circuit implicitly reduces all inputs mod r, so this matches publicSignals[2].
  // On-chain semaphore.ak also applies % scalar.field_prime before comparing (condition 5).
  const BLS12_381_R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
  const signalBytes = Buffer.from(signal, 'hex');
  const digestHex = Buffer.from(blake2b(32).update(signalBytes).digest()).toString('hex');
  const signalHash = BigInt('0x' + digestHex) % BLS12_381_R;

  // Assemble the private/public inputs expected by semaphore.circom
  const circuitInputs = {
    identityNullifier,
    identityTrapdoor,
    treePathIndices: merkleProof.pathIndices,
    treeSiblings: merkleProof.siblings,
    externalNullifier,
    signalHash,
  };

  // Generate the Groth16 proof using the compiled WASM and ceremony prover key
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    WASM_PATH,
    ZKEY_PATH
  );

  // Compress G1 (pi_a, pi_c) and G2 (pi_b) points into BLS12-381 compressed byte format
  // expected by the on-chain ak_381/groth16 Aiken verifier
  const zkProof = {
    pi_a: await compressedG1(proof.pi_a),
    pi_b: await compressedG2(proof.pi_b),
    pi_c: await compressedG1(proof.pi_c),
  };

  // nullifierHash is the second public signal (index 1); prevents double voting on-chain
  const nullifierHash = BigInt(publicSignals[1]);

  return { zkProof, nullifierHash, publicSignals };
}

/**
 * Verifies a compressed zkProof off-chain against the ceremony verification key.
 * Decompresses pi_a, pi_b, pi_c back to the snarkjs G1/G2 point format before verifying.
 */
export async function verifyVoteProof(
  zkProof: { pi_a: string; pi_b: string; pi_c: string },
  publicSignals: string[]
): Promise<boolean> {
  // Decompress the BLS12-381 points back to the decimal tuple format snarkjs expects
  const rawProof = {
    pi_a: await decompressG1(zkProof.pi_a),
    pi_b: await decompressG2(zkProof.pi_b),
    pi_c: await decompressG1(zkProof.pi_c),
    protocol: 'groth16',
    curve: 'bls12-381',
  };

  const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, 'utf8'));

  return snarkjs.groth16.verify(vKey, publicSignals, rawProof);
}
