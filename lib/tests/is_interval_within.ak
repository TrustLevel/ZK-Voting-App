use aiken/interval as interval
use utilities.{ is_interval_within}

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