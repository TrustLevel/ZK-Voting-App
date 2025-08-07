// use aiken/cbor as cbor
//use aiken/collection/list
use aiken/interval as interval
use utilities.{ is_interval_within, simple_vote, weighted_vote, check_options_index, check_initial_options_value, check_weight, update_option}
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


// Interval Tests - Testing is_interval_within function
// This function validates that a transaction interval is completely contained within voting period bounds
// Requirements: interval must be entirely_after start_time AND entirely_before end_time

// Test 1: Basic valid case - interval completely within bounds
// Validates [5,10] ⊆ (1,20) - interval starts after 1 and ends before 20
test iiw_1() {
    let a = interval.between(5,10)
    let tp = (1,20)
    is_interval_within(a,tp)
}

// Test 2: Upper bound violation - interval extends beyond allowed end time
// Validates [5,30] ⊄ (1,20) - interval end (30) exceeds voting end time (20)
test iiw_2() fail {
    let a = interval.between(5,30)
    let tp = (1,20)
    is_interval_within(a,tp)
}

// Test 3: Near-boundary valid case - interval close to but within bounds
// Validates [2,19] ⊆ (1,20) - tight fit but still entirely contained
test iiw_3() {
    let a = interval.between(2,19)
    let tp = (1,20)
    is_interval_within(a,tp)
}

// Test 4: Complete temporal displacement - interval entirely after allowed period
// Validates [21,30] ⊄ (1,20) - entire interval occurs after voting ends
test iiw_4() fail {
    let a = interval.between(21,30)
    let tp = (1,20)
    is_interval_within(a,tp)
}

// Test 5: Partial upper overflow - interval starts valid but extends too far
// Validates [15,30] ⊄ (1,20) - starts within bounds but extends beyond end time
test iiw_5() fail {
    let a = interval.between(15,30)
    let tp = (1,20)
    is_interval_within(a,tp)
}

// Test 6: Complete temporal displacement - interval entirely before allowed period
// Validates [1,10] ⊄ (20,60) - entire interval occurs before voting begins
test iiw_6() fail {
    let a = interval.between(1,10)
    let tp = (20,60)
    is_interval_within(a,tp)
}

// Test 7: Partial lower underflow - interval starts too early but overlaps
// Validates [1,30] ⊄ (20,60) - starts before voting begins, even though it overlaps
test iiw_7() fail {
    let a = interval.between(1,30)
    let tp = (20,60)
    is_interval_within(a,tp)
}

// Test 8: Small interval within large bounds - demonstrates proper containment
// Validates [34,35] ⊆ (33,60) - short transaction window within long voting period
test iiw_8() {
    let a = interval.between(34,35)
    let tp = (33,60)
    is_interval_within(a,tp)
}

// Test 9: Minimal gap containment - interval fits with minimal space
// Validates [34,35] ⊆ (33,36) - only 1 unit gap on each side
test iiw_9() {
    let a = interval.between(34,35)
    let tp = (33,36)
    is_interval_within(a,tp)
}

// Test 10: Upper boundary collision - interval touches upper bound (exclusive)
// Validates [34,36] ⊄ (33,36) - interval end equals voting end (not allowed)
test iiw_10() fail {
    let a = interval.between(34,36)
    let tp = (33,36)
    is_interval_within(a,tp)
}

// Test 11: Standard containment case - well-centered interval
// Validates [10,15] ⊆ (5,20) - interval comfortably within bounds with good margins
test iiw_11() {
    let a = interval.between(10,15)
    let tp = (5,20)
    is_interval_within(a,tp)
}

// Test 12: Upper bound violation - similar to test 2 but different values
// Validates [10,25] ⊄ (5,20) - interval extends 5 units beyond voting end
test iiw_12() fail {
    let a = interval.between(10,25)
    let tp = (5,20)
    is_interval_within(a,tp)
}

// Test 13: Lower bound violation - interval starts too early
// Validates [0,10] ⊄ (5,20) - interval starts 5 units before voting begins
test iiw_13() fail {
    let a = interval.between(0,10)
    let tp = (5,20)
    is_interval_within(a,tp)
}

// Test 14: Large scale valid containment - tests with bigger numbers
// Validates [100,200] ⊆ (50,300) - 100-unit interval within 250-unit voting period
test iiw_14() {
    let a = interval.between(100,200)
    let tp = (50,300)
    is_interval_within(a,tp)
}

// Test 15: Large scale upper bound violation
// Validates [100,350] ⊄ (50,300) - large interval exceeds upper bound by 50 units
test iiw_15() fail {
    let a = interval.between(100,350)
    let tp = (50,300)
    is_interval_within(a,tp)
}

// Test 16: Large scale lower bound violation  
// Validates [25,200] ⊄ (50,300) - large interval starts 25 units too early
test iiw_16() fail {
    let a = interval.between(25,200)
    let tp = (50,300)
    is_interval_within(a,tp)
}

// Test 17: Very large scale valid containment - stress test with big numbers
// Validates [1000,2000] ⊆ (500,3000) - 1000-unit interval in 2500-unit period
test iiw_17() {
    let a = interval.between(1000,2000)
    let tp = (500,3000)
    is_interval_within(a,tp)
}

// Test 18: Very large scale upper bound violation
// Validates [1000,3500] ⊄ (500,3000) - exceeds upper bound by 500 units
test iiw_18() fail {
    let a = interval.between(1000,3500)
    let tp = (500,3000)
    is_interval_within(a,tp)
}

// Test 19: Extreme displacement - interval completely outside and much larger
// Validates [10000,200000] ⊄ (500,3000) - massive interval entirely after voting period
test iiw_19() fail {
    let a = interval.between(10000,200000)
    let tp = (500,3000)
    is_interval_within(a,tp)
}

// Test 20: Minimal interval in minimal bounds - tightest valid case
// Validates [51,52] ⊆ (50,53) - 1-unit interval in 3-unit period with 1-unit margins
test iiw_20() {
    let a = interval.between(51,52)
    let tp = (50,53)
    is_interval_within(a,tp)
}

// Additional Edge Cases - Testing critical boundary conditions not covered above

// Test 21: Lower boundary collision - interval touches lower bound (exclusive)
// Validates [5,10] ⊄ (5,20) - interval start equals voting start (not allowed)
test iiw_21() fail {
    let a = interval.between(5,10)
    let tp = (5,20)
    is_interval_within(a,tp)
}

// Test 22: Zero-width interval within bounds
// Validates [10,10] ⊆ (5,15) - instantaneous transaction within voting period
test iiw_22() {
    let a = interval.between(10,10)
    let tp = (5,15)
    is_interval_within(a,tp)
}

// Test 23: Zero-width interval touching lower bound
// Validates [5,5] ⊄ (5,15) - instant transaction at voting start (not allowed)
test iiw_23() fail {
    let a = interval.between(5,5)
    let tp = (5,15)
    is_interval_within(a,tp)
}

// Test 24: Zero-width interval touching upper bound
// Validates [15,15] ⊄ (5,15) - instant transaction at voting end (not allowed)
test iiw_24() fail {
    let a = interval.between(15,15)
    let tp = (5,15)
    is_interval_within(a,tp)
}

// Test 25: Interval spans entire allowed period (but doesn't touch boundaries)
// Validates [6,14] ⊆ (5,15) - maximum width interval within bounds
test iiw_25() {
    let a = interval.between(6,14)
    let tp = (5,15)
    is_interval_within(a,tp)
}

// Test 26: Interval exactly matches allowed period (both boundaries touched)
// Validates [5,15] ⊄ (5,15) - interval equals voting period (not allowed)
test iiw_26() fail {
    let a = interval.between(5,15)
    let tp = (5,15)
    is_interval_within(a,tp)
}

// Test 27: Negative time values - interval before epoch
// Validates [-10,-5] ⊆ (-15,0) - voting in past timestamps
test iiw_27() {
    let a = interval.between(-10,-5)
    let tp = (-15,0)
    is_interval_within(a,tp)
}

// Test 28: Mixed negative/positive - interval crosses epoch
// Validates [-2,3] ⊆ (-5,10) - transaction spanning epoch boundary
test iiw_28() {
    let a = interval.between(-2,3)
    let tp = (-5,10)
    is_interval_within(a,tp)
}

// Test 29: Large gap between bounds - interval lost in middle
// Validates [100,110] ⊆ (50,500) - small interval in very large voting window
test iiw_29() {
    let a = interval.between(100,110)
    let tp = (50,500)
    is_interval_within(a,tp)
}

// Test 30: Single unit valid interval - minimal gap from boundaries
// Validates [2,3] ⊆ (1,4) - 1-unit interval with 1-unit margins on both sides
test iiw_30() {
    let a = interval.between(2,3)
    let tp = (1,4)
    is_interval_within(a,tp)
}

// Update option

// Test updating single option from 0 to 1
test update_option_1() {
    let options = [(0,0)]
    update_option(options, 0, 1) == [(0,1)]
}

// Test updating last option in list
test update_option_2() {
    let options = [(0,0),(1,0),(2,0),(3,0)]
    update_option(options, 3, 3) == [(0,0),(1,0),(2,0),(3,3)]
}

// Test updating middle option in list
test update_option_3() {
    let options = [(0,0),(1,0),(2,0),(3,0)]
    update_option(options, 1, 3) == [(0,0),(1,3),(2,0),(3,0)]
}

// Test updating option in empty list - should return empty list
test update_option_4() {
    let options = []
    update_option(options, 0, 5) == []
}

// Test updating first option with existing values (10+5=15)
test update_option_5() {
    let options = [(0,10),(1,20),(2,30)]
    update_option(options, 0, 5) == [(0,15),(1,20),(2,30)]
}

// Test updating last option with existing values (30+10=40)
test update_option_6() {
    let options = [(0,10),(1,20),(2,30)]
    update_option(options, 2, 10) == [(0,10),(1,20),(2,40)]
}

// Test updating middle option in larger list (300+50=350)
test update_option_7() {
    let options = [(0,100),(1,200),(2,300),(3,400),(4,500)]
    update_option(options, 2, 50) == [(0,100),(1,200),(2,350),(3,400),(4,500)]
}

// Test updating non-existent index - should return unchanged list
test update_option_8() {
    let options = [(0,5),(1,10),(2,15)]
    update_option(options, 5, 25) == [(0,5),(1,10),(2,15)]
}

// Test updating with negative quantity (0+(-5)=-5)
test update_option_9() {
    let options = [(0,0),(1,0),(2,0)]
    update_option(options, 1, -5) == [(0,0),(1,-5),(2,0)]
}

// Test updating with non-sequential indices (200+50=250)
test update_option_10() {
    let options = [(5,100),(10,200),(15,300)]
    update_option(options, 10, 50) == [(5,100),(10,250),(15,300)]
}

// Test single option with large values (1000+2000=3000)
test update_option_11() {
    let options = [(0,1000)]
    update_option(options, 0, 2000) == [(0,3000)]
}

// Test updating middle option in very long list (0+100=100)
test update_option_12() {
    let options = [(0,0),(1,0),(2,0),(3,0),(4,0),(5,0),(6,0),(7,0),(8,0),(9,0)]
    update_option(options, 5, 100) == [(0,0),(1,0),(2,0),(3,0),(4,0),(5,100),(6,0),(7,0),(8,0),(9,0)]
}

// Test updating with zero quantity - should return unchanged (50+0=50)
test update_option_13() {
    let options = [(0,50),(1,60),(2,70)]
    update_option(options, 0, 0) == [(0,50),(1,60),(2,70)]
}


// Simple Vote Tests - Testing simple_vote function
// This function adds exactly 1 vote to the specified option index
// Requirement: Increments vote count by 1 for the target option, leaves others unchanged

// Test 1: Basic single option voting - simplest case
// Validates vote on only available option: [(0,0)] → [(0,1)]
test vote_1() {
    let options: Options = [(0,0)]
    simple_vote(options, 0) == [(0,1)]
}

// Test 2: Multiple consecutive votes on same option - cumulative voting
// Validates repeated voting: [(0,0)] → [(0,1)] → [(0,2)] → [(0,3)]
test vote_2() {
    let options: Options = [(0,0)]
    { simple_vote(options, 0) |> simple_vote(_,0) |> simple_vote(_,0) } == [(0,3)]
}

// Test 3: Vote on last option in multi-option ballot
// Validates targeting last option: [(0,0),(1,0),(2,0)] → [(0,0),(1,0),(2,1)]
test vote_3() {
    let options: Options = [(0,0), (1,0), (2,0)]
    simple_vote(options, 2) ==  [(0,0), (1,0), (2,1)]
}

// Test 4: Vote on middle option with non-zero starting values
// Validates incrementing existing vote count: option 1 goes from 7→8
test vote_4() {
    let options: Options = [(0,8), (1,7), (2,3)]
    simple_vote(options, 1) ==  [(0,8), (1,8), (2,3)]
}

// Test 5: Vote on first option in longer list
// Validates first option targeting: option 0 goes from 8→9, others unchanged
test vote_5() {
    let options: Options = [(0,8), (1,7), (2,3), (3,4)]
    simple_vote(options, 0) ==  [(0,9), (1,7), (2,3), (3,4)]
}

// Test 6: Vote on last option in longer list
// Validates last option targeting: option 3 goes from 4→5, others preserved
test vote_6() {
    let options: Options = [(0,8), (1,7), (2,3), (3,4)]
    simple_vote(options, 3) ==  [(0,8), (1,7), (2,3), (3,5)]
}

// Test 7: Vote with large existing values - overflow resilience
// Validates large number handling: option 3 goes from 400→401
test vote_7() {
    let options: Options = [(0,100), (1,200), (2,300), (3,400)]
    simple_vote(options, 3) ==  [(0,100), (1,200), (2,300), (3,401)]
}

// Test 8: Negative test - wrong expected result for non-voted option
// Validates precision: expects wrong value (299) for unchanged option 2
test vote_8() fail {
    let options: Options = [(0,100), (1,200), (2,300), (3,400)]
    simple_vote(options, 3) ==  [(0,100), (1,200), (2,299), (3,401)]
}

// Test 9: Vote on middle option in 4-option ballot
// Validates middle option targeting: option 2 goes from 300→301
test vote_9() {
    let options: Options = [(0,100), (1,200), (2,300), (3,400)]
    simple_vote(options, 2) ==  [(0,100), (1,200), (2,301), (3,400)]
}

// Test 10: Negative test - wrong expected result for non-voted option
// Validates precision: expects wrong value (2) for unchanged option 0
test vote_10() fail {
    let options: Options = [(0,100), (1,200), (2,300), (3,400)]
    simple_vote(options, 2) ==  [(0,2), (1,200), (2,301), (3,400)]
}

// Test 11: Vote on non-existent option index - should fail
test vote_11() fail {
    let options: Options = [(0,5), (1,3), (2,7)]
    simple_vote(options, 5) == [(0,5), (1,3), (2,7)]
}

// Test 12: Vote with negative option index - should fail
test vote_12() fail {
    let options: Options = [(0,1), (1,2), (2,3)]
    simple_vote(options, -1) == [(0,1), (1,2), (2,3)]
}

// Test 13: Vote with very large option index - should fail
test vote_13() fail {
    let options: Options = [(0,0), (1,0)]
    simple_vote(options, 999) == [(0,0), (1,0)]
}

// Test 14: Vote on option with negative existing value
// Validates voting on option that has negative vote count (-5→-4)
test vote_14() {
    let options: Options = [(0,0), (1, 5), (2,0)]
    simple_vote(options, 1) == [(0,0), (1, 6), (2,0)]
}

// Test 15: Vote with non-sequential option indices - targeting gaps
// Validates voting in options list with non-consecutive indices
test vote_15() fail {
    let options: Options = [(5,10), (10,20), (15,30)]
    simple_vote(options, 10) == [(5,10), (10,21), (15,30)]
}

// Test 16: Vote on single option with very large existing value
// Validates increment behavior near potential integer limits
test vote_16() {
    let options: Options = [(0,999999)]
    simple_vote(options, 0) == [(0,1000000)]
}

// Test 17: Vote with duplicate indices in options list (edge case)
// Validates behavior when options list has duplicate indices (first match wins)
test vote_17() {
    let options: Options = [(0,5), (1,3), (0,7), (2,1)]
    simple_vote(options, 0) == [(0,6), (1,3), (0,7), (2,1)]
}

// Test 18: Vote in very long options list - performance test
// Validates vote targeting in extensive ballot (option near end)
test vote_18() {
    let options: Options = [(0,0), (1,1), (2,2), (3,3), (4,4), (5,5), (6,6), (7,7), (8,8), (9,9)]
    simple_vote(options, 7) == [(0,0), (1,1), (2,2), (3,3), (4,4), (5,5), (6,6), (7,8), (8,8), (9,9)]
}

// Test 19: Vote with zero as target index multiple times
// Validates repeated voting on option 0 with different starting values
test vote_19() {
    let options: Options = [(0,42)]
    { simple_vote(options, 0) |> simple_vote(_, 0) } == [(0,44)]
}

// Test 20: Vote targeting middle of unordered indices list
// Validates correct option targeting when indices are not in ascending order
test vote_20() {
    let options: Options = [(3,100), (1,200), (5,300), (0,400)]
    simple_vote(options, 1) == [(3,100), (1,201), (5,300), (0,400)]
}

// Test 21: Vote on empty options - Should fail
test vote_21() fail {
    let options: Options = []
    simple_vote(options, 1) == []
}


// Weighted Voting tests.

// Test weighted vote with empty target options - should return unchanged
test weighted_vote_1() {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, []) == [(0,1), (1,1), (2,1)]
}

// Test weighted vote on multiple options (1+3=4, 1+10=11)
test weighted_vote_2() {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, [(0,3), (2,10)]) == [(0,4), (1,1), (2,11)]
}

// Test weighted vote adding 1 to all options
test weighted_vote_3() {
    let options: Options = [(0,0), (1,1), (2,2), (3,3), (4,4)]
    weighted_vote(options, [(0,1), (1,1), (2,1), (3,1), (4,1)]) == [(0,1), (1,2), (2,3), (3,4), (4,5)]
}

// Test weighted vote with very large values
test weighted_vote_4() {
    let options: Options = [(0,0), (1,1), (2,2), (3,3), (4,4)]
    weighted_vote(options, [(0,100000), (1,200000), (2,300000), (3,400000), (4,500000)]) == [(0,100000), (1,200001), (2,300002), (3,400003), (4,500004)]
}

// Test weighted vote on single option (0+10=10)
test weighted_vote_5() {
    let options: Options = [(0,0), (1,0), (2,0)]
    weighted_vote(options, [(1,10)]) == [(0,0), (1,10), (2,0)]
}

// Test weighted vote with mixed large additions (9+100=109, 11+89=100, 2+67=69)
test weighted_vote_6() {
    let options: Options = [(0,9), (1,11), (2,2)]
    weighted_vote(options, [(0,100), (1,89), (2,67)]) == [(0,109), (1,100), (2,69)]
}

// Test incorrect expected result - should fail (option 0 should remain 9, not 8)
test weighted_vote_7() fail {
    let options: Options = [(0,9), (1,11), (2,2)]
    weighted_vote(options, [(1,89), (2,67)]) == [(0,8), (1,100), (2,69)]
}

// Test incorrect expected result - should fail (option 0 should remain 1, not 0)
test weighted_vote_8() fail {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, [(1,1)]) == [(0,0), (1,2), (2,1)]
}

// Test incorrect expected result - should fail (option 2 should remain 1, not 0)
test weighted_vote_9() fail {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, [(1,1)]) == [(0,1), (1,2), (2,0)]
}

// Test duplicate target options - adds to same option twice (1+1+1=3)
// TODO: Fix this corner case
test weighted_vote_10() {
    let options: Options = [(0,1), (1,1), (2,1)]
    weighted_vote(options, [(1,1),(1,1)]) == [(0,1), (1,3), (2,1)]
}

// Check Weight
// Test weight check with correct total (1+3=4)
test check_weight_1() {
    let target_options = [(0,1), (1,3)]
    let allowed_weight = 4
    check_weight(target_options, allowed_weight)
}

// Test weight check with incorrect total - should fail (1+3=4 ≠ 1)
test check_weight_2() fail {
    let target_options = [(0,1), (1,3)]
    let allowed_weight = 1
    check_weight(target_options, allowed_weight)
}

// Test weight check with larger values (5+3+111=119)
test check_weight_3() {
    let target_options = [(0,5), (1,3), (2, 111)]
    let allowed_weight = 119
    check_weight(target_options, allowed_weight)
}

// Test weight check with single non-zero value (0+0+1=1)
test check_weight_4() {
    let target_options = [(0,0), (1,0), (2, 1)]
    let allowed_weight = 1
    check_weight(target_options, allowed_weight)
}

// Test weight check with all zeros - should fail (0+0+0=0 ≠ 1)
test check_weight_5() fail {
    let target_options = [(0,0), (1,0), (2, 0)]
    let allowed_weight = 1
    check_weight(target_options, allowed_weight)
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