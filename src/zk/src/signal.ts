import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { csl } = require('@meshsdk/core-csl');

// Uses @meshsdk/core-csl (cardano-serialization-lib) to produce the exact same
// indefinite-length CBOR encoding as Aiken's cbor.serialise.
// Verified: serialise_signal([(2,1)]) == #"9f9f0201ffff" (signal_tests.ak line 98)

/**
 * Encodes vote options into the signal format expected by the on-chain
 * `deserialise_signal` function (voting_utilities.ak).
 *
 * options is List<(Int, Int)> — each pair is (option_index, vote_count).
 * The result is used as `signal_message` in SemaphoreRedeemer.Signal.
 */
export function encodeVoteSignal(options: Array<[number, number]>): string {
  const outer = csl.PlutusList.new();

  for (const [index, count] of options) {
    // Each tuple (Int, Int) is a 2-element Plutus list
    const inner = csl.PlutusList.new();
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(index))));
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(count))));
    outer.add(csl.PlutusData.new_list(inner));
  }

  const data = csl.PlutusData.new_list(outer);
  return Buffer.from(data.to_bytes()).toString('hex');
}

/**
 * Decodes a hex-encoded signal back into vote options.
 * Reverses encodeVoteSignal — matches Aiken's `deserialise_signal`.
 */
export function decodeVoteSignal(hex: string): Array<[number, number]> {
  const data = csl.PlutusData.from_bytes(Buffer.from(hex, 'hex'));
  const outer = data.as_list();
  const options: Array<[number, number]> = [];

  for (let i = 0; i < outer.len(); i++) {
    const inner = outer.get(i).as_list();
    const index = parseInt(inner.get(0).as_integer().to_str());
    const count = parseInt(inner.get(1).as_integer().to_str());
    options.push([index, count]);
  }

  return options;
}
