use aiken/interval.{Interval}
use aiken/collection/list.{ map}
use types.{Ballot }


pub fn is_interval_within(iv1: Interval<Int>,time_pair: (Int,Int)) -> Bool {
    interval.is_entirely_after(iv1, time_pair.1st) && interval.is_entirely_before(iv1, time_pair.2nd) 
}

pub fn simple_vote(options: Ballot, index: Int) -> Ballot {
    map(options, fn (o) { 
        if o.1st == index {
             (o.1st, o.2nd + 1) 
        } else { 
            o 
        } 
    })
}