/**
 * Off-chain mirror of the on-chain vote rules in `voting.ak` / `voting_utilities.ak`.
 *
 * The relay checks every decoded signal with this function before it verifies the ZK proof,
 * inserts the nullifier or builds a transaction. The ZK proof only binds the *hash* of the
 * signal, not its content, so any group member can prove any signal; the content rules live
 * here (first line) and on-chain (final line).
 *
 * Rules (F-VOTING-14, Catalyst reviewer 2026-11-04):
 *  - every pair is (optionIndex, count) with integer values
 *  - every count is strictly positive — a negative count would subtract points from an option,
 *    a zero count carries no vote
 *  - no option index appears twice
 *  - every option index exists in the event's options (when they are known)
 *  - simple voting (weight <= 1): exactly one pair with count 1
 *  - weighted voting (weight > 1): the counts sum exactly to the weight
 *
 * @returns null when the signal is valid, otherwise a short reason.
 */
export function validateVoteSignal(
  voteSignal: ReadonlyArray<readonly [number, number]>,
  votingPower: number | null | undefined,
  validIndices?: ReadonlySet<number> | null,
): string | null {
  if (!Array.isArray(voteSignal) || voteSignal.length === 0) return 'signal carries no vote';

  const seen = new Set<number>();
  let total = 0;
  for (const pair of voteSignal) {
    if (!Array.isArray(pair) || pair.length !== 2) return 'signal entry is not an (index, count) pair';
    const [index, count] = pair;
    if (!Number.isSafeInteger(index) || index < 0) return `invalid option index ${String(index)}`;
    if (!Number.isSafeInteger(count)) return `invalid count for option ${index}`;
    if (count <= 0) return `count for option ${index} must be positive, got ${count}`;
    if (seen.has(index)) return `option ${index} appears more than once`;
    seen.add(index);
    if (validIndices && !validIndices.has(index)) return `option ${index} does not exist`;
    total += count;
  }

  const weight = Number(votingPower) > 1 ? Number(votingPower) : 1;
  if (weight <= 1) {
    if (voteSignal.length !== 1 || voteSignal[0][1] !== 1) return 'simple voting accepts exactly one option with count 1';
    return null;
  }
  if (total !== weight) return `counts sum to ${total}, the event weight is ${weight}`;
  return null;
}

/** Option indices of an event from its stored `options` JSON, or null when unknown. */
export function optionIndicesOf(optionsJson: string | null | undefined): Set<number> | null {
  if (!optionsJson) return null;
  try {
    const parsed = JSON.parse(optionsJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return new Set(parsed.map((o: any, i: number) => (Number.isInteger(o?.index) ? o.index : i)));
  } catch {
    return null;
  }
}

/**
 * Decodes the hex `signal_message` (Plutus Data CBOR, `List<(Int, Int)>` as nested lists) into
 * `[index, count]` pairs. Same shape as `decodeVoteSignal` in `src/zk`, implemented here with the
 * synchronous CSL binding so that the relay can check a signal without loading the ESM zk module.
 * Throws when the bytes are not a list of two-integer lists.
 */
export function decodeVoteSignalHex(hex: string): Array<[number, number]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { csl } = require('@meshsdk/core-csl');
  const outer = csl.PlutusData.from_bytes(Buffer.from(hex, 'hex')).as_list();
  if (!outer) throw new Error('signal is not a list');
  const options: Array<[number, number]> = [];
  for (let i = 0; i < outer.len(); i++) {
    const inner = outer.get(i).as_list();
    if (!inner || inner.len() !== 2) throw new Error('signal entry is not a pair');
    const index = inner.get(0).as_integer();
    const count = inner.get(1).as_integer();
    if (!index || !count) throw new Error('signal entry is not a pair of integers');
    options.push([Number(index.to_str()), Number(count.to_str())]);
  }
  return options;
}
