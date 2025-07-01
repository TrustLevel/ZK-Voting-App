
pub type Options = List<(Int,Int)>

pub type Urna {
    voting_mode: Int,
    options: Options,
}

// Idea - If mode is 0 then is a simple vote, if greater than 0 must be a wegihted vote specified by the mode value itself