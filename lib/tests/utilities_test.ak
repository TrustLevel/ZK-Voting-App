// use aiken/cbor as cbor
use aiken/interval as interval
use utilities.{ is_interval_within, simple_vote, serialise_signal, deserialise_signal}
use types.{ Ballot }

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
    let ballot = [(0,0)]
    simple_vote(ballot, 0) == [(0,1)]
}

test vote_2() {
    let ballot = [(0,0)]
    { simple_vote(ballot, 0) |> simple_vote(_,0) |> simple_vote(_,0) } == [(0,3)]
}

test vote_3() {
    let ballot = [(0,0), (1,0), (2,0)]
    simple_vote(ballot, 2) ==  [(0,0), (1,0), (2,1)]
}

test vote_4() {
    let ballot = [(0,8), (1,7), (2,3)]
    simple_vote(ballot, 1) ==  [(0,8), (1,8), (2,3)]
}

test vote_5() {
    let ballot = [(0,8), (1,7), (2,3), (3,4)]
    simple_vote(ballot, 0) ==  [(0,9), (1,7), (2,3), (3,4)]
}

test vote_6() {
    let ballot = [(0,8), (1,7), (2,3), (3,4)]
    simple_vote(ballot, 3) ==  [(0,8), (1,7), (2,3), (3,5)]
}

// Weighted Voting tests.


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