// Manages the nullifier Merkle Patricia Forestry (MPF) trie used for
// double-vote prevention. Given the current on-chain MPF root (from
// SemaphoreDatum.nullifier_mpf_root) and a new nullifier hash (output of the
// ZK proof), inserts the nullifier into the trie and returns the updated root
// plus the serialised insertion proof required by the on-chain
// SemaphoreRedeemer.Signal as its `mpf_proof` field.
//
// Uses @aiken-lang/merkle-patricia-forestry for trie operations.
//
// insertNullifier(currentRoot: Uint8Array, nullifier: bigint):
//   Promise<{ newRoot: Uint8Array, proof: Uint8Array }>
//   currentRoot — 32-byte MPF root from SemaphoreDatum
//   nullifier   — nullifierHash integer from the ZK proof public signals
//   returns     — updated root and serialised proof for the redeemer
