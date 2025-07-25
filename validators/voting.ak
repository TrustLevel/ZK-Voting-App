use aiken/builtin.{integer_to_bytearray}
use aiken/collection/list
use aiken/collection/dict
use aiken/interval.{is_entirely_after}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, OutputReference, find_input, InlineDatum, Spend}
use utilities.{check_initial_options_value, check_options_index, is_policy_on_value, deserialise_signal, is_interval_within, simple_vote, weighted_vote, check_weight}
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

// pub type Redeemer {
//     Create
//     Signal(groth16.Proof, mpf.Proof, Int, Int)
// }

pub type SemaphoreRedeemer {
    Create
    Signal(Bool, Bool, Int, Int)
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
    let are_options_indexes_correct: Bool = check_options_index(urna_datum.options)

    // Observation: Conditions from 3 to 6 are optional - The datum construction could be trusted at the tx creation.

    and {
      is_one_token_minted,
      is_nft_sent_to_script,
      is_event_time_set,
      are_options_values_correct,
      are_options_indexes_correct,
    }
  }

  spend(datum: Option<UrnaDatum>, _redeemer: UrnaRedeemer, _utxo: OutputReference, self: Transaction) {

    let Transaction { inputs, outputs, redeemers, validity_range, .. } = self
    expect Some(dat) = datum

    expect [semaphore_input] = list.filter(inputs, fn(i) {is_policy_on_value(i.output.value, dat.semaphore_nft)})
    
  // Condition 1: Does spent the Semaphore token.
  //let is_there_semaphore_nft: Bool = !(semaphore_input == [])

  // Condition 2: Is Vote NFT sent back to script?

    // Finvoted script input
    expect Some(this_script_input) = find_input(inputs, utxo)

    // Find output sent back to script
    let this_script_address = this_script_input.output.address
    expect [output_to_script] = list.filter(outputs, fn (o) { o.address == this_script_address})

    let is_value_returned: Bool = assets.without_lovelace(output_to_script.value) == assets.without_lovelace(this_script_input.output.value) 

  // Condition 3: Is the signal is correct (deserialise - order verificate.)?

    expect [Pair(Spend(_input), semaphore_redeemer)] = list.filter(redeemers, fn(r) { r.1st == Spend(semaphore_input.output_reference) })
    expect semaphore_redeemer: SemaphoreRedeemer = semaphore_redeemer
    expect Signal(_zk_proof, _mpf_proof, _signal_hash, signal_message) = semaphore_redeemer
    let converted_signal: ByteArray = integer_to_bytearray(True, 10, signal_message) // Todo: Have to check the legnth and endianness of the signal_message.
    let vote: Options = deserialise_signal(converted_signal)


  // Condition 4: Is vote within the time event?
    let is_within_time_event: Bool = is_interval_within(validity_range, dat.event_date)

  // Condition 5: Is UrnaDatum preserved?
    expect InlineDatum(out_datum) = output_to_script.datum
    expect out_dat: UrnaDatum = out_datum
    let is_datum_preserved: Bool = and {
      dat.weight == out_dat.weight,
      dat.event_date == out_dat.event_date,
      dat.semaphore_nft == out_dat.semaphore_nft,
    }

  // expect urna_datum: UrnaDatum = semaphore_redeemer
    let validator_conditions: Bool = and {
        is_value_returned,
        is_within_time_event,
        is_datum_preserved,
    }

    if dat.weight > 0 {
      // Weighted voting Condition: Is the vote correct?
      let is_vote_correct: Bool = weighted_vote(dat.options, vote) == out_dat.options
      let is_weight_correct: Bool = check_weight(vote, dat.weight)
      is_vote_correct && is_weight_correct && validator_conditions
      
    } else {
      // Simple voting Condition: Is the vote correct?
      expect Some(vote_target) = list.head(vote)
      let is_vote_correct: Bool = simple_vote(dat.options, vote_target.1st) == out_dat.options
      is_vote_correct && validator_conditions
    }
  }
}