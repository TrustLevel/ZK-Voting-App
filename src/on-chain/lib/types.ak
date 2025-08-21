
// Generic type alias for key-value pair collections
pub type Pairs<k, v> = List<Pair<k, v>>

// Voting options represented as (option_index, vote_count) pairs
pub type Options = List<(Int,Int)>

// Alternative type-safe representation using the generic Pairs type
// pub type Options = Pairs<Int, Int>

// Idea - If mode is 0 then is a simple vote, if greater than 0 must be a weighted vote specified by the mode value itself