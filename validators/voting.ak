use aiken/collection/list
use aiken/collection/dict
use aiken/interval.{is_entirely_after}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference, find_input, InlineDatum}
use utilities.{check_initial_options_value, is_policy_on_value}
use types.{Options}

pub type UrnaDatum {
    weight: Int,
    options: Options,
    event_date: (Int, Int),
    semaphore_nft: PolicyId,
}

pub type UrnaRedeemer {
  Mint
  Vote
}

validator voting(utxo: OutputReference) {

  mint(_redeemer: UrnaDatum, policy_id: PolicyId, self: Transaction) {
    // A unique id for the voting is needed - This could be the policy ID.
    let Transaction { inputs, outputs, mint, validity_range, .. } = self

    // Condition 0: Is expected UTxO spent?
    expect Some(_nft_utxo) = find_input(inputs, utxo) 

    // Condition 1: Is only one Group NFT minted?
    expect [Pair(_asset_name, amount)] =
        mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()
    
    let is_one_token_minted: Bool = amount == 1

    // Condition 2: Is Voting NFT sent to script?
    let own_script_credential = Script(policy_id)
    expect [output_to_script] = list.filter(outputs, fn (o) { o.address.payment_credential == own_script_credential })
    let is_nft_sent_to_script: Bool = is_policy_on_value(output_to_script.value, policy_id)

    // Condition 3: Is there a Urna Datum atttached?
    expect InlineDatum(out_datum) = output_to_script.datum
    expect urna_datum: UrnaDatum = out_datum

    // Condition 4: Is voting event correctly set?
    let (event_start, event_end) = urna_datum.event_date
    let is_event_time_set: Bool = event_start < event_end && is_entirely_after(validity_range, event_start)

    // Condition 5: Are all options set at 0?
    let are_options_values_correct: Bool = check_initial_options_value(urna_datum.options)

    // Condition 6: Are the options indexes in ascending order?
    let are_options_indexes_correct: Bool = check_options_index(options)

    // Observation: Conditions from 3 to 6 are optional - The datum construction could be trusted at the tx creation.

    and {
      is_one_token_minted,
      is_nft_sent_to_script,
      is_event_time_set,
      are_options_values_correct,
      are_options_indexes_correct,
    }
  }

  spend(_datum: Option<UrnaDatum>, _redeemer: UrnaRedeemer, _utxo: OutputReference, _self: Transaction) {
    True
    // Does spent the Semaphore token.

    // Does the signal is correct (deserialise - order verificate.)

    
  }

}
