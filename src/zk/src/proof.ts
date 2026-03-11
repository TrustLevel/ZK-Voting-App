// Orchestrates full ZK proof generation for a vote.
// Takes the voter's Semaphore identity internals (nullifier, trapdoor) and
// the Merkle inclusion path for their identity commitment in the group tree,
// calls snarkjs.groth16.fullProve with the compiled WASM (wasm/semaphore.wasm)
// and the ceremony prover key (keys/semaphore_final.zkey), then compresses the
// raw proof points (G1/G2 decimal tuples) into BLS12-381 compressed bytes via
// compressedG1/compressedG2 from conversion.ts.
//
// generateVoteProof(params: {
//   identityNullifier: bigint,
//   identityTrapdoor: bigint,
//   merkleProof: MerkleProof,       // siblings + pathIndices from the Group
//   externalNullifier: bigint,      // e.g. semaphore NFT policy id as bigint
//   signal: string,                 // hex from encodeVoteSignal()
// }): Promise<{
//   zkProof: { pi_a: string, pi_b: string, pi_c: string }, // compressed hex
//   nullifierHash: bigint,
//   publicSignals: string[],
// }>
