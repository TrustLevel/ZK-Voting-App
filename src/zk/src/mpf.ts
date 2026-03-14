import { Trie, Store } from '@aiken-lang/merkle-patricia-forestry';

// Converts a nullifier bigint to a 32-byte big-endian Buffer used as the trie key
function nullifierToBuffer(nullifier: bigint): Buffer {
  const hex = nullifier.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

/**
 * Inserts a nullifier into the MPF trie, proving it was not there before.
 *
 * The trie is loaded from disk (storePath) on each call and persisted after
 * insertion — this is the source of truth for all previously used nullifiers.
 *
 * The returned proof is the CBOR-encoded insertion proof expected by the
 * on-chain SemaphoreRedeemer.Signal as its `mpf_proof` field.
 *
 * The on-chain validator uses it to:
 *   1. Verify exclusion:  proof.verify(false) == currentRoot  (nullifier not yet used)
 *   2. Derive new root:   proof.verify(true)  == newRoot      (nullifier now included)
 */
export async function insertNullifier(
  currentRoot: Buffer,
  nullifier: bigint,
  eventId: number
): Promise<{ newRoot: Buffer; proof: Buffer }> {
  // Each voting event gets its own isolated trie, keyed by eventId.
  // If no DB exists yet (first vote), create a fresh empty trie.
  const store = new Store(`nullifiers-db/${eventId}`);
  const trie = await Trie.load(store).catch(() => new Trie(store));

  const key = nullifierToBuffer(nullifier);

  // Insert the nullifier — the library internally checks exclusion before inserting.
  // Throws if the nullifier is already in the trie (double vote attempt).
  await trie.insert(key, key);

  // A single proof after insertion encodes both:
  //   verify(false) → root without the item (must equal currentRoot on-chain)
  //   verify(true)  → root with the item (the new on-chain root after this vote)
  const proof = await trie.prove(key);

  return {
    newRoot: proof.verify(true),
    proof: proof.toCBOR(),
  };
}
