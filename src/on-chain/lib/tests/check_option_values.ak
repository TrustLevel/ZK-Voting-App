use voting_utilities.{ check_options_index, check_initial_options_value}
use types.{ Options }


// Option checking

// Test single option with correct index (0)
test check_options_index_1() {
    let options: Options = [(0,0)]
    check_options_index(options)
}

// Test gap in sequence - should fail (missing index 1)
test check_options_index_2() fail {
    let options: Options = [(0,0), (2,0)]
    check_options_index(options)
}

// Test correct ascending sequence 0,1,2
test check_options_index_3() {
    let options: Options = [(0,0), (1,0), (2,0)]
    check_options_index(options)
}

// Test correct sequence with different values (values don't matter for index check)
test check_options_index_4() {
    let options: Options = [(0,0), (1,1), (2,3)]
    check_options_index(options)
}

// Test wrong starting index - should fail (starts with 3 instead of 0)
test check_options_index_5() fail {
    let options: Options = [(3,0), (1,1), (2,3)]
    check_options_index(options)
}

// Test longer correct sequence 0,1,2,3,4
test check_options_index_6() {
    let options: Options = [(0,0), (1,1), (2,3), (3,0), (4,0)]
    check_options_index(options)
}

// Test negative index at end - should fail
test check_options_index_7() fail {
    let options: Options = [(0,0), (1,1), (2,3), (3,0), ((-4),0)]
    check_options_index(options)
}

// Test negative starting index - should fail
test check_options_index_8() fail {
    let options: Options = [((-1),0), (1,1), (2,3), (3,0), (4,0)]
    check_options_index(options)
}

// Test gap in sequence - should fail (missing index 5)
test check_options_index_9() fail {
    let options: Options = [(0,0), (1,1), (2,3), (3,0), (4,0), (6,0)]
    check_options_index(options)
}

// Test duplicate indices - should fail (three 0s)
test check_options_index_10() fail {
    let options: Options = [(0,0), (0,1), (0,3), (3,0), (4,0), (5,0)]
    check_options_index(options)
}

// Test empty list - should pass (vacuously true)
test check_options_index_11() fail {
    let options: Options = []
    check_options_index(options)
}

// Test single option not starting at 0 - should fail
test check_options_index_12() fail {
    let options: Options = [(1,0)]
    check_options_index(options)
}

// Test missing index 2 in sequence - should fail
test check_options_index_13() fail {
    let options: Options = [(0,0), (1,0), (3,0)]
    check_options_index(options)
}

// Test large list with correct ascending order and large values
test check_options_index_14() {
    let options: Options = [(0,10), (1,20), (2,30), (3,40), (4,50), (5,60), (6,70), (7,80), (8,90), (9,100)]
    check_options_index(options)
}

// Test missing index 3 in sequence - should fail
test check_options_index_15() fail {
    let options: Options = [(0,0), (1,0), (2,0), (4,0)]
    check_options_index(options)
}

// Test sequence starting at 1 instead of 0 - should fail
test check_options_index_16() fail {
    let options: Options = [(1,0), (2,0), (3,0)]
    check_options_index(options)
}

// Test missing index 4 in sequence - should fail
test check_options_index_17() fail {
    let options: Options = [(0,0), (1,0), (2,0), (3,0), (5,0)]
    check_options_index(options)
}

// Test correct sequence with large values
test check_options_index_18() {
    let options: Options = [(0,1000), (1,2000), (2,3000)]
    check_options_index(options)
}

// Test even numbers only (non-consecutive) - should fail
test check_options_index_19() fail {
    let options: Options = [(0,0), (2,0), (4,0), (6,0)]
    check_options_index(options)
}

// Test negative starting indices - should fail
test check_options_index_20() fail {
    let options: Options = [((-2),0), ((-1),0), (0,0)]
    check_options_index(options)
}


// Test all options have zero values - should pass
test check_initial_options_value_1() {
    let options: Options = [(0,0), (1,0), (2,0)]
    check_initial_options_value(options)
}

// Test first option has non-zero value - should fail
test check_initial_options_value_2() fail{
    let options: Options = [(0,1), (1,0), (2,0)]
    check_initial_options_value(options)
}

// Test middle option has non-zero value - should fail
test check_initial_options_value_3() fail{
    let options: Options = [(0,0), (1,9), (2,0)]
    check_initial_options_value(options)
}

// Test last option has non-zero value - should fail
test check_initial_options_value_4() fail{
    let options: Options = [(0,0), (1,0), (2,8)]
    check_initial_options_value(options)
}

// Test multiple options have non-zero values - should fail
test check_initial_options_value_5() fail{
    let options: Options = [(0,1), (1,0), (2,8)]
    check_initial_options_value(options)
}

// Test all options have non-zero values - should fail
test check_initial_options_value_6() fail{
    let options: Options = [(0,20), (1,15), (2,8)]
    check_initial_options_value(options)
}

// Test single option with zero value - should pass
test check_initial_options_value_7() {
    let options: Options = [(0,0)]
    check_initial_options_value(options)
}

// Test longer list with all zero values - should pass
test check_initial_options_value_8()  {
    let options: Options = [(0,0), (1,0), (2,0), (3,0), (4,0), (5,0), (6,0)] 
    check_initial_options_value(options)
}

// Test reversed order with all zero values - should pass (order doesn't matter)
test check_initial_options_value_9() {
    let options: Options = [(6,0), (5,0), (4,0), (3,0), (2,0), (1,0), (0,0)] 
    check_initial_options_value(options)
}

// Test another long list with all zero values - should pass
test check_initial_options_value_10() {
    let options: Options = [(0,0), (1,0), (2,0), (3,0), (4,0), (5,0), (6,0)] 
    check_initial_options_value(options)
}

// Test empty list - should pass (vacuously true)
test check_initial_options_value_11() {
    let options: Options = []
    check_initial_options_value(options)
}

// Test single option with non-zero value - should fail
test check_initial_options_value_12() fail {
    let options: Options = [(0,1)]
    check_initial_options_value(options)
}

// Test last element has non-zero value - should fail
test check_initial_options_value_13() fail {
    let options: Options = [(0,0), (1,0), (2,1)]
    check_initial_options_value(options)
}

// Test first element in reversed list has non-zero value - should fail
test check_initial_options_value_14() fail {
    let options: Options = [(5,1), (4,0), (3,0), (2,0), (1,0), (0,0)]
    check_initial_options_value(options)
}

// Test last element in long list has non-zero value - should fail
test check_initial_options_value_15() fail {
    let options: Options = [(0,0), (1,0), (2,0), (3,0), (4,0), (5,0), (6,1)]
    check_initial_options_value(options)
}

// Test negative value in first position - should fail
test check_initial_options_value_16() fail {
    let options: Options = [(0,-1), (1,0), (2,0)]
    check_initial_options_value(options)
}

// Test negative value in middle position - should fail
test check_initial_options_value_17() fail {
    let options: Options = [(0,0), (1,-5), (2,0)]
    check_initial_options_value(options)
}

// Test all elements have large positive values - should fail
test check_initial_options_value_18() fail {
    let options: Options = [(0,100), (1,200), (2,300)]
    check_initial_options_value(options)
}

// Test all zeros with large index values - should pass (indices don't matter)
test check_initial_options_value_19() {
    let options: Options = [(100,0), (200,0), (300,0)]
    check_initial_options_value(options)
}

// Test only last element in very long list is non-zero - should fail
test check_initial_options_value_20() fail {
    let options: Options = [(0,0), (1,0), (2,0), (3,0), (4,0), (5,0), (6,0), (7,0), (8,0), (9,1)]
    check_initial_options_value(options)
}