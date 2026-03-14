import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { poseidon1 } from 'poseidon-bls12381';
import { compressedG1, compressedG2 } from './conversion.js';

const require = createRequire(import.meta.url);
const snarkjs = require('snarkjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(__dirname, '../../wasm/semaphore.wasm');
const ZKEY_PATH = path.join(__dirname, '../../keys/semaphore_final.zkey');

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

  // Hash the signal bytes into a field element as the circuit's public input
  const signalHash = poseidon1([BigInt('0x' + signal)]);

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
