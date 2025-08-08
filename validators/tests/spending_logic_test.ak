//use aiken/builtin.{as_data}
use aiken/primitive/bytearray
use aiken/primitive/int
use aiken/interval.{between, Interval}
use cardano/address.{from_script}
use cardano/assets.{from_lovelace, from_asset, merge, Value}
use cardano/transaction.{Input, NoDatum, InlineDatum, Output, OutputReference, Transaction, Spend} as transaction
use utilities.{serialise_signal}
use voting.{ UrnaDatum, Vote, SemaphoreRedeemer, Signal, }

const validator_policy_id = bytearray.from_string(@"policy_id")
const semaphore_policy_id = bytearray.from_string(@"semaphore_policy_id")
//const arbitrary_address = bytearray.from_string(@"arbitrary_script") |> from_script()

// Simple vote tests

test cast_simple_vote() {

    // Construct the semaphore input
    let semaphore_oref: OutputReference = OutputReference { transaction_id: "#00", output_index: 0 }
    let semaphore_token: Value = from_asset(policy_id: semaphore_policy_id, asset_name: bytearray.from_string(@"semaphore_token"), quantity: 1) |> merge(_, from_lovelace(2000000))
    let semaphore_output: Output = Output {
        address: from_script(semaphore_policy_id),
        value: semaphore_token,
        datum: NoDatum, // TODO: It is a Semaphore Datum, but for now is empty
        reference_script: None,
    }
    let semaphore_input: Input = Input {
        output_reference: semaphore_oref,
        output: semaphore_output,
    }

    // Define Urna Datum
    let urna_datum_0: UrnaDatum = UrnaDatum {
        weight: 1,
        options: [(0,0), (1,0), (2,0)],
        event_date: (1, 100),
        semaphore_nft: semaphore_policy_id,
    }


    // Define script outputreference and token
    let script_oref: OutputReference = OutputReference { transaction_id: "#01", output_index: 0 }
    let group_nft: Value =  from_asset(policy_id: validator_policy_id, asset_name: bytearray.from_string(@"vote_example_1"), quantity: 1) |> merge(_, from_lovelace(2000000))

    // Input spent from voting validator
    let output_from_script: Output = Output {
        address: from_script(validator_policy_id),
        value: group_nft,
        datum: InlineDatum(urna_datum_0), 
        reference_script: None,
    }
    let input_from_script: Input = Input {
        output_reference: script_oref,
        output: output_from_script,
    }

    // Condition 2: Is Vote NFT sent back to
    let urna_datum_1: UrnaDatum = UrnaDatum {
        weight: 1,
        options: [(0,0), (1,0), (2,1)],
        event_date: (1, 100),
        semaphore_nft: semaphore_policy_id,
    }
    let output_to_script: Output = Output {
        address: from_script(validator_policy_id),
        value: group_nft,
        datum: InlineDatum(urna_datum_1),
        reference_script: None,
    }

    // Create Semaphore Redeemer in way that the signal is correct
    let signal_bytes = serialise_signal([(2,1)])
    // Pad ByteArray to minimum 18 bytes for int conversion, but keep result small enough for 10-byte conversion
    let padded_signal = bytearray.concat(#"0000000000000000", signal_bytes)  // Pad with 8 zero bytes at start
    let signal_options = int.from_bytearray_big_endian(padded_signal)
    let semaphore_redeemer: SemaphoreRedeemer = Signal(True, True, 1, signal_options)
    
    // Set a time event within the voting time. 
    let time_range: Interval<Int> = between(5, 95)


    let tx: Transaction = transaction.placeholder
        |> fn(transaction) {
            Transaction {
                ..transaction,
                    inputs: [semaphore_input, input_from_script],
                    outputs: [output_to_script],
                    validity_range: time_range,
                    redeemers: [Pair(Spend(semaphore_oref), as_data(semaphore_redeemer)) ],
            }
    }

    let parameter_utxo = OutputReference { transaction_id: "#00", output_index: 0 }


    voting.voting.spend(parameter_utxo, Some(urna_datum_0), Vote, script_oref, tx)
}

// Weighted vote tests

//test cast_weighted_vote() {
//
//    // Construct the semaphore input
//    let semaphore_oref: OutputReference = OutputReference { transaction_id: "#00", output_index: 0 }
//    let semaphore_token: Value = from_asset(policy_id: semaphore_policy_id, asset_name: bytearray.from_string(@"semaphore_token"), quantity: 1) |> merge(_, from_lovelace(2000000))
//    let semaphore_output: Output = Output {
//        address: from_script(semaphore_policy_id),
//        value: semaphore_token,
//        datum: NoDatum, // TODO: It is a Semaphore Datum, but for now is empty
//        reference_script: None,
//    }
//    let semaphore_input: Input = Input {
//        output_reference: semaphore_oref,
//        output: semaphore_output,
//    }
//
//    // Define Urna Datum
//    let urna_datum_0: UrnaDatum = UrnaDatum {
//        weight: 3,
//        options: [(0,0), (1,0), (2,0)],
//        event_date: (1, 100),
//        semaphore_nft: semaphore_policy_id,
//    }
//
//
//    // Define script outputreference and token
//    let script_oref: OutputReference = OutputReference { transaction_id: "#01", output_index: 0 }
//    let group_nft: Value =  from_asset(policy_id: validator_policy_id, asset_name: bytearray.from_string(@"vote_example_1"), quantity: 1) |> merge(_, from_lovelace(2000000))
//
//    // Input spent from voting validator
//    let output_from_script: Output = Output {
//        address: from_script(validator_policy_id),
//        value: group_nft,
//        datum: InlineDatum(urna_datum_0), 
//        reference_script: None,
//    }
//    let input_from_script: Input = Input {
//        output_reference: script_oref,
//        output: output_from_script,
//    }
//
//    // Condition 2: Is Vote NFT sent back to
//    let urna_datum_1: UrnaDatum = UrnaDatum {
//        weight: 3,
//        options: [(0,1), (1,0), (2,2)],
//        event_date: (1, 100),
//        semaphore_nft: semaphore_policy_id,
//    }
//    let output_to_script: Output = Output {
//        address: from_script(validator_policy_id),
//        value: group_nft,
//        datum: InlineDatum(urna_datum_1),
//        reference_script: None,
//    }
//
//    // Create Semaphore Redeemer in way that the signal is correct
//    let signal_bytes = serialise_signal([(0,0), (1,0), (2,1)])
//    // Pad ByteArray to minimum 14 bytes for int conversion
//    let padded_signal = bytearray.concat(signal_bytes, #"00000000")  // Add 4 zero bytes
//    let signal_options = int.from_bytearray_big_endian(padded_signal)
//    let semaphore_redeemer: SemaphoreRedeemer = Signal(True, True, 1, signal_options)
//    
//    // Set a time event within the voting time. 
//    let time_range: Interval<Int> = between(5, 95)
//
//
//    let tx: Transaction = transaction.placeholder
//        |> fn(transaction) {
//            Transaction {
//                ..transaction,
//                    inputs: [semaphore_input, input_from_script],
//                    outputs: [output_to_script],
//                    validity_range: time_range,
//                    redeemers: [Pair(Spend(semaphore_oref), as_data(semaphore_redeemer)) ],
//            }
//    }
//
//    let parameter_utxo = OutputReference { transaction_id: "#00", output_index: 0 }
//
//
//    voting.voting.spend(parameter_utxo, Some(urna_datum_0), Vote, script_oref, tx)
//}