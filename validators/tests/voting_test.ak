use aiken/primitive/bytearray
use aiken/interval.{between, Interval}
use cardano/address.{from_script}
use cardano/assets.{from_lovelace, from_asset, merge, Value}
use cardano/transaction.{Input, NoDatum, InlineDatum, Output, OutputReference, Transaction} as transaction
use voting.{ UrnaDatum, Mint }

const validator_policy_id = bytearray.from_string(@"policy_id")
const semaphore_policy_id = bytearray.from_string(@"semaphore_policy_id")
const arbitrary_address = bytearray.from_string(@"arbitrary_script") |> from_script()
//const unused_redeemer = #""

fn create_voting_instance_tx(parameter_utxo: OutputReference, minting_value: Value, output: Output, time_range: Interval<Int>) -> Transaction {
    // Create an input which spents the OutputReference
    let parameter_output: Output = Output {
        address: arbitrary_address,
        value: from_lovelace(2000000),
        datum: NoDatum,
        reference_script: None,
    }

    let parameter_input = Input { output_reference: parameter_utxo, output: parameter_output }

    transaction.placeholder
    |> fn(transaction) {
        Transaction {
          ..transaction,
          inputs: [parameter_input],
          mint: minting_value,
          outputs: [output],
          validity_range: time_range,
        }
    }
}

test create_voting_instance() {
    // validator Policy ID

    // Create validator parameter of type OutputReference
    let parameter_utxo = OutputReference { transaction_id: "#01", output_index: 0 }

    // Create the Group NFT
    let group_nft =  from_asset(policy_id: validator_policy_id, asset_name: bytearray.from_string(@"vote_example_1"), quantity: 1) |> merge(_, from_lovelace(2000000))

    // Create an output that sends the Group NFT to script
    let urna_datum: UrnaDatum = UrnaDatum {
        weight: 1,
        options: [(0,0), (1,0), (2,0)],
        event_date: (2, 100),
        semaphore_nft: semaphore_policy_id,
    }


    let output_to_script: Output = Output {
        address: from_script(validator_policy_id),
        value: group_nft,
        datum: InlineDatum(urna_datum),
        reference_script: None,
    }

    let time_range: Interval<Int> = between(0, 1)

    let tx: Transaction = create_voting_instance_tx(parameter_utxo, group_nft, output_to_script, time_range)


    voting.voting.mint(parameter_utxo, Mint, validator_policy_id, tx)

}