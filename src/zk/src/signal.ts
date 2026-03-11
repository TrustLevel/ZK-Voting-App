// Encodes the voter's choice as a ByteArray that matches what Aiken's
// `serialise_signal` produces: CBOR encoding of List<(Int, Int)> where each
// pair is (option_index, vote_count). The resulting hex string is hashed
// (blake2b-256) to produce the `signalHash` public input for the ZK circuit,
// and also passed as `signal_message` in the on-chain SemaphoreRedeemer.Signal.
//
// encodeVoteSignal(options: Array<[number, number]>): string
//   options — array of (index, votes) pairs matching UrnaDatum.options format
//   returns — hex string of the CBOR-encoded signal
