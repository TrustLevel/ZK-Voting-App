// use aiken/cbor as cbor
use aiken/interval as interval
use utilities.{ is_interval_within, simple_vote, weighted_vote}
use types.{ Options }

// Interval Tests

test iiw_1() {
    let a = interval.between(5,10)
    let tp = (1,20)
    is_interval_within(a,tp)
}

test iiw_2() fail {
    let a = interval.between(5,30)
    let tp = (1,20)
    is_interval_within(a,tp)
}

test iiw_3() {
    let a = interval.between(2,19)
    let tp = (1,20)
    is_interval_within(a,tp)
}

test iiw_4() fail {
    let a = interval.between(21,30)
    let tp = (1,20)
    is_interval_within(a,tp)
}

test iiw_5() fail {
    let a = interval.between(15,30)
    let tp = (1,20)
    is_interval_within(a,tp)
}

test iiw_6() fail {
    let a = interval.between(1,10)
    let tp = (20,60)
    is_interval_within(a,tp)
}

test iiw_7() fail {
    let a = interval.between(1,30)
    let tp = (20,60)
    is_interval_within(a,tp)
}

test iiw_8() {
    let a = interval.between(34,35)
    let tp = (33,60)
    is_interval_within(a,tp)
}

// Simple vote test

test vote_1() {
    let options: Options = [(0,0)]
    simple_vote(options, 0) == [(0,1)]
}

test vote_2() {
    let options: Options = [(0,0)]
    { simple_vote(options, 0) |> simple_vote(_,0) |> simple_vote(_,0) } == [(0,3)]
}

test vote_3() {
    let options: Options = [(0,0), (1,0), (2,0)]
    simple_vote(options, 2) ==  [(0,0), (1,0), (2,1)]
}

test vote_4() {
    let options: Options = [(0,8), (1,7), (2,3)]
    simple_vote(options, 1) ==  [(0,8), (1,8), (2,3)]
}

test vote_5() {
    let options: Options = [(0,8), (1,7), (2,3), (3,4)]
    simple_vote(options, 0) ==  [(0,9), (1,7), (2,3), (3,4)]
}

test vote_6() {
    let options: Options = [(0,8), (1,7), (2,3), (3,4)]
    simple_vote(options, 3) ==  [(0,8), (1,7), (2,3), (3,5)]
}

// Weighted Voting tests.

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


// Serialization tests.

//test signal_serialization_1() {
//    
//    let ballot = Ballot {
//        mode: 0,
//        options: [(0,0)],
//    }
//
//    let serialized_signal: ByteArray = serialise_signal(ballot.options)
//
//    ballot.options == deserialise_signal(serialized_signal)
//
//}
//
//test signal_serialization_2() {
//    
//    let options = [(0,0)]
//    
//
//    deserialise_signal(#"") == options
//}
//
//test signal_serialization_3() {
//    
//    let ballot = Ballot {
//        mode: 0,
//        options: [(0,9), (1,7), (2,3), (3,4)],
//    }
//
//    serialise_signal(ballot.options) == #""
//}
//
//test signal_serialization_4() {
//    
//    let ballot = Ballot {
//        mode: 0,
//        options: [(0,9), (1,7), (2,3), (3,4)],
//    }
//
//    deserialise_signal(#"") == ballot.options
//}