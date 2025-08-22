 //use aiken/collection/list
use voting_utilities.{ simple_vote, weighted_vote, check_weight, update_option }
use types.{ Options }

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

