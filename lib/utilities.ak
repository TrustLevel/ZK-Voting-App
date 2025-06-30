use aiken/builtin
use aiken/cbor
use aiken/interval.{Interval}
use aiken/collection/list.{ map}
use types.{Ballot, Options }


pub fn is_interval_within(iv1: Interval<Int>,time_pair: (Int,Int)) -> Bool {
    interval.is_entirely_after(iv1, time_pair.1st) && interval.is_entirely_before(iv1, time_pair.2nd) 
}

pub fn simple_vote(options: Options, index: Int) -> Options {
    map(options, fn (o) { 
        if o.1st == index {
             (o.1st, o.2nd + 1) 
        } else { 
            o 
        } 
    })
}

//pub fn weighted_vote(options: Options, target_options: Options, power: Int) -> Ballot {
//    
//}

pub fn deserialise_signal( message: ByteArray ) -> Options {
    expect Some(data) = cbor.deserialise(message)
    expect options: Options = data
    options
}

pub fn serialise_signal( options: Options ) -> ByteArray {
    let data = cbor.serialise(options)
    data
}

//pub fn deserialise_signal_2(message: ByteArray) -> Ballot {
//
//}

// 