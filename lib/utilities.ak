// use aiken/builtin
use aiken/cbor
use aiken/interval.{Interval}
use aiken/collection/list as list
use cardano/assets.{PolicyId, Value, policies}
use types.{ Options }

//use types.{Ballot, Options }

pub fn is_interval_within(iv1: Interval<Int>,time_pair: (Int,Int)) -> Bool {
    interval.is_entirely_after(iv1, time_pair.1st) && interval.is_entirely_before(iv1, time_pair.2nd) 
}

// The options indexes must be in an ascending order.
pub fn check_options_index_rec(options: Options, state: Int) -> Bool {
    when options is {
        [] -> True
        [o, ..opts] -> {
            o.1st == state && check_options_index_rec(opts, state + 1)
        }
    }
}

pub fn check_options_index(options: Options) -> Bool {
    check_options_index_rec(options, 0)
}


pub fn check_initial_options_value(options: Options) -> Bool {
    list.all(options, fn(e) { e.2nd == 0 })
}


// Updates an option value at a given index.
pub fn update_option(options: Options, index: Int, quantity: Int) -> Options {
    when options is {
        [] -> options
        [o, ..opts] -> {
            if o.1st == index {
                [(o.1st, o.2nd + quantity), .. opts]
            } else {
                [o, ..(update_option(opts, index, quantity))]
            }
        }
    }
}


pub fn simple_vote(options: Options, index: Int) -> Options {
    update_option(options, index, 1)
}


// Older implementation of simple_vote

//pub fn simple_vote(options: Options, index: Int) -> Options {
//    map(options, fn (o) { 
//        if o.1st == index {
//             (o.1st, o.2nd + 1) 
//        } else { 
//            o 
//        } 
//    })
//}

// This could be improved to apply the weight without iterating the options in a redundant manner.
pub fn weighted_vote(options: Options, target_options: Options) -> Options {
    when target_options is {
        [] -> options
        [to, ..tops] -> {
            weighted_vote((update_option(options, to.1st, to.2nd)), tops)
        }
    }
}

// The weight on the target_options must be equal to the weight allowed by the voting event.
pub fn check_weight(target_options: Options, allowed_weight: Int) -> Bool {
    let weight: Int = list.foldr(target_options, 0, fn(to, total) { to.2nd + total } )
    weight == allowed_weight
}


pub fn deserialise_signal( message: ByteArray ) -> Options {
    expect Some(data) = cbor.deserialise(message)
    expect options: Options = data
    options
}

pub fn serialise_signal( options: Options ) -> ByteArray {
    let data = cbor.serialise(options)
    data
}


pub fn is_policy_on_value(value: Value, policy_id: PolicyId) -> Bool {
  let result: List<PolicyId> = policies(value)
  list.has(result, policy_id)
}

//pub fn deserialise_signal_2(message: ByteArray) -> Ballot {
//
//}

// 