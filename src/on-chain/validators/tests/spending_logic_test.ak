//use aiken/builtin.{as_data}
use aiken/primitive/bytearray
use aiken/primitive/int
use aiken/interval.{between, Interval}
use cardano/address.{from_script}
use cardano/assets.{from_lovelace, from_asset, merge, Value}
use cardano/transaction.{Input, NoDatum, InlineDatum, Output, OutputReference, Transaction, Spend} as transaction
use voting_utilities.{serialise_signal}
use voting.{ UrnaDatum, Vote }
use semaphore_types.{ Signal, SemaphoreRedeemer }
use ak_381/groth16.{Proof}

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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 38625149408878199693830158794989919308150121977174408046140837150457929803892
    let signal_hash = 25050711957853089676855563252373407134946460892559238457710929576024828641940
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

test cast_simple_vote_1() {

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
        options: [(0,0), (1,1), (2,2), (3,3), (4,4)],
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
        options: [(0,0), (1,1), (2,2), (3,4), (4,4)],
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(3,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

test cast_simple_vote_3() {

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
        options: [(0,0), (1,1), (2,2), (3,3), (4,4)],
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
        options: [(0,0), (1,2), (2,2), (3,3), (4,4)],
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(1,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

test cast_weighted_vote() {

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
        weight: 5,
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
        weight: 5,
        options: [(0,0), (1,5), (2,0)],
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(1,5)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

test cast_weighted_vote_2() {

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
        weight: 5,
        options: [(0,10), (1,10), (2,10)],
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
        weight: 5,
        options: [(0,11), (1,12), (2,12)],
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(0,1), (1,2), (2,2)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

test cast_weighted_vote_3() {

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
        weight: 100,
        options: [(0,0), (1,100), (2,200), (3,500), (4,1)],
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
        weight: 100,
        options: [(0,10), (1,150), (2,200), (3,539), (4,2)],
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(0,10), (1,50), (3,39), (4,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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


// Fails because signal option length is greater than 1 - Simple vote should expect just one option.
test wrong_option_format() fail {

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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(0,1), (2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

// Fails because signal option is empty - Votes can't be empty
test wrong_option_format_2() fail {

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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

// The vote window has concluded.
test vote_out_of_time() fail {

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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
    // Set a time event within the voting time. 
    let time_range: Interval<Int> = between(101, 200)


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

// The vote window is not open yet
test vote_out_of_time_2() fail {

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
        event_date: (50, 100),
        semaphore_nft: semaphore_policy_id,
    }
    let output_to_script: Output = Output {
        address: from_script(validator_policy_id),
        value: group_nft,
        datum: InlineDatum(urna_datum_1),
        reference_script: None,
    }

    // Create Semaphore Redeemer in way that the signal is correct
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
    // Set a time event within the voting time. 
    let time_range: Interval<Int> = between(1, 49)


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

// The validity range of the tx is not within the voting time event.
test vote_out_of_time_3() fail {

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
        event_date: (50, 100),
        semaphore_nft: semaphore_policy_id,
    }
    let output_to_script: Output = Output {
        address: from_script(validator_policy_id),
        value: group_nft,
        datum: InlineDatum(urna_datum_1),
        reference_script: None,
    }

    // Create Semaphore Redeemer in way that the signal is correct
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(35,60)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
    // Set a time event within the voting time. 
    let time_range: Interval<Int> = between(1, 49)


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


test has_not_semaphore_input() fail {

    // Construct the semaphore input
    let semaphore_oref: OutputReference = OutputReference { transaction_id: "#00", output_index: 0 }
    let semaphore_token: Value = from_lovelace(2000000)
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

test group_token_has_not_been_returned() fail {

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
    let without_group_nft: Value = from_lovelace(2000000)

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
        value: without_group_nft,
        datum: InlineDatum(urna_datum_1),
        reference_script: None,
    }

    // Create Semaphore Redeemer in way that the signal is correct
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

// The options are altered
test datum_not_preserved() fail {
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
        options: [(0,0), (2,1)],
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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

// The weight is changed
test datum_not_preserved_2() fail {

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
        weight: 6,
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
    let zk_proof: Proof =
        Proof {
            piA: #"88f1a3db3a777e3909a2416c1eaa1a4753959e25ea8e6d314d83508ecb25644a7a49c84d9e0e48ffbb12f0f3620f348a",
            piB: #"8319df022fb874b81e0def688fe3158125682fa9ec0a010f302774a0ecf9087788b3e377da1316170102583d8db8159213fa7138dbabc34655162951f33c7e8a75e3de9e4f8431950f43a792634b09fcec324849cca3ec964f98a44ec500429b",
            piC: #"98c19d179b2cca1526dd3b2ca64f7284bc66229b0b2a470857882e38dfcecedac22a4849231018aea4c193072e76dadc",
        }
    let mpf_proof = []
    let nullifier = 0
    let signal_hash = 0
    let signal_message = serialise_signal([(2,1)])
    let semaphore_redeemer: SemaphoreRedeemer = Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message)
    
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
//    let signal_message = serialise_signal([(0,0), (1,0), (2,1)])
//    // Pad ByteArray to minimum 14 bytes for int conversion
//    let padded_signal = bytearray.concat(signal_message, #"00000000")  // Add 4 zero bytes
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
//    voting.voting.spend(parameter_utxo, Some(urna_datum_0), Vote, script_oref, tx)
//}