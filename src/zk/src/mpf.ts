import { Trie, Store } from '@aiken-lang/merkle-patricia-forestry';
import { blake2b } from '@noble/hashes/blake2b';

/**
 * Converts a nullifier bigint to the on-chain representation:
 *   value = little-endian bytes of nullifier (matches scalar.to_bytearray_little_endian(n, 0))
 *   key   = blake2b_256(value)              (matches crypto.blake2b_256(nullifier_value) on-chain)
 *
 * On-chain (semaphore.ak):
 *   let nullifier_value = scalar.to_bytearray_little_endian(scalar.new(nullifier), 0)
 *   let nullifier_key   = crypto.blake2b_256(nullifier_value)
 */
function nullifierToKeyValue(nullifier: bigint): { key: Buffer; value: Buffer } {
  // On-chain: scalar.to_bytearray_little_endian(scalar.new(nullifier), 0)
  // Uses size=0 = MINIMAL encoding: no leading zeros in big-endian = no trailing zeros in LE.
  // Values < 2^248 produce fewer than 32 bytes; always using 32 bytes would give a different
  // blake2b key and break the on-chain MPF root check.
  const rawHex = nullifier.toString(16);
  const paddedHex = rawHex.length % 2 ? '0' + rawHex : rawHex; // ensure even length
  const bigEndian = Buffer.from(paddedHex, 'hex'); // minimal BE (no leading zeros)
  const value = Buffer.from(Buffer.from(bigEndian).reverse()); // minimal LE
  // Key = blake2b_256(value)
  const key = Buffer.from(blake2b(value, { dkLen: 32 }));
  return { key, value };
}

/**
 * Inserts a nullifier into the MPF trie, proving it was not there before.
 *
 * The trie is loaded from disk (storePath) on each call and persisted after
 * insertion — this is the source of truth for all previously used nullifiers.
 *
 * The returned proofSteps match the on-chain `mpf.Proof = List<ProofStep>` type
 * and must be converted to Plutus data (list of conStr) before use in the redeemer.
 *
 * The on-chain validator uses the proof to:
 *   1. Verify non-existence: old MPF root (from SemaphoreDatum.nullifier_mpf_root)
 *   2. Derive new root: new MPF root stored in the updated SemaphoreDatum
 */
export async function insertNullifier(
  currentRoot: Buffer,
  nullifier: bigint,
  eventId: number
): Promise<{ newRoot: Buffer; proof: Buffer; proofSteps: Array<object> }> {
  // Each voting event gets its own isolated trie, keyed by eventId.
  // If no DB exists yet (first vote), create a fresh empty trie.
  const store = new Store(`nullifiers-db/${eventId}`);
  const trie = await Trie.load(store).catch(() => new Trie(store));

  const { key, value } = nullifierToKeyValue(nullifier);

  // Insert the nullifier — the library internally checks exclusion before inserting.
  // Throws if the nullifier is already in the trie (double vote attempt).
  await trie.insert(key, value);

  // prove() returns a Proof encoding both the old root (verify(false)) and new root (verify(true)).
  const proof = await trie.prove(key);

  return {
    newRoot: proof.verify(true),
    proof: proof.toCBOR(),
    proofSteps: proof.toJSON(),
  };
}
