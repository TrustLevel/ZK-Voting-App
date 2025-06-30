// use aiken/builtin
use aiken/cbor
use aiken/interval.{Interval}
//use aiken/collection/list.{map}
use types.{ Options }

//use types.{Ballot, Options }


pub fn is_interval_within(iv1: Interval<Int>,time_pair: (Int,Int)) -> Bool {
    interval.is_entirely_after(iv1, time_pair.1st) && interval.is_entirely_before(iv1, time_pair.2nd) 
}

//pub fn simple_vote(options: Options, index: Int) -> Options {
//    map(options, fn (o) { 
//        if o.1st == index {
//             (o.1st, o.2nd + 1) 
//        } else { 
//            o 
//        } 
//    })
//}



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

test update_option_1() {
    let options = [(0,0)]
    update_option(options, 0, 1) == [(0,1)]
}

test update_option_2() {
    let options = [(0,0),(1,0),(2,0),(3,0)]
    update_option(options, 3, 3) == [(0,0),(1,0),(2,0),(3,3)]
}

test update_option_3() {
    let options = [(0,0),(1,0),(2,0),(3,0)]
    update_option(options, 1, 3) == [(0,0),(1,3),(2,0),(3,0)]
}

pub fn simple_vote(options: Options, index: Int) -> Options {
    update_option(options, index, 1)
}


pub fn weighted_vote(options: Options, target_options: Options) -> Options {
    when target_options is {
        [] -> options
        [to, ..tops] -> {
            weighted_vote((update_option(options, to.1st, to.2nd)), tops)
        }
    }
}

test weighted_vote_1() {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, []) == [(0,1), (1,1), (2,1)]
}

test weighted_vote_2() {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, [(0,3), (2,10)]) == [(0,4), (1,1), (2,11)]
}

test weighted_vote_3() {
    let options: Options = [(0,0), (1,1), (2,2), (3,3), (4,4)]
    weighted_vote(options, [(0,1), (1,1), (2,1), (3,1), (4,1)]) == [(0,1), (1,2), (2,3), (3,4), (4,5)]
}

test weighted_vote_4() {
    let options: Options = [(0,0), (1,1), (2,2), (3,3), (4,4)]
    weighted_vote(options, [(0,100000), (1,200000), (2,300000), (3,400000), (4,500000)]) == [(0,100000), (1,200001), (2,300002), (3,400003), (4,500004)]
}

test weighted_vote_5() {
    let options: Options = [(0,0), (1,0), (2,0)]
    weighted_vote(options, [(1,10)]) == [(0,0), (1,10), (2,0)]
}

test weighted_vote_6() {
    let options: Options = [(0,9), (1,11), (2,2)]
    weighted_vote(options, [(0,100), (1,89), (2,67)]) == [(0,109), (1,100), (2,69)]
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

//pub fn deserialise_signal_2(message: ByteArray) -> Ballot {
//
//}

// 