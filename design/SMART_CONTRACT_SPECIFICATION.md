# Smart Contract Specification

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Data Structures](#data-structures)
4. [Voting Validator (voting.ak)](#voting-validator-votingak)
5. [Semaphore Validator Specification](#semaphore-validator-specification)
6. [Group Management Specification](#group-management-specification)
7. [On-Chain & Off-Chain Proof Mechanism](#on-chain--off-chain-proof-mechanism)
8. [Complete Flow Specifications](#complete-flow-specifications)
9. [Security Considerations](#security-considerations)

---

## Overview

### Purpose
This document provides a complete specification of all smart contracts used in the ZK-Voting-App system, including detailed data structures, validation logic, and on-chain/off-chain interactions for:
- Registration flow
- Voting flow
- Tally flow

### Smart Contract Components
1. **Voting Validator** (`voting.ak`) - Core voting logic (minting and spending)
2. **Semaphore Validator** (external dependency: `modulo-p/cardano-semaphore`) - ZK-proof verification
3. **Group Management** (hybrid: on-chain + off-chain) - Participant enrollment and Merkle tree management

---

## System Architecture

### On-Chain Components
```
┌─────────────────────────────────────────────────────────────────┐
│                    Cardano Blockchain Layer                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │  Voting Validator│◄────────┤Semaphore Validator│            │
│  │   (voting.ak)    │         │   (external dep)  │            │
│  │                  │         │                   │            │
│  │  Mint: Create    │         │  Verify ZK-Proofs │            │
│  │  Spend: Process  │         │  Track Nullifiers │            │
│  │         Votes    │         │  Prevent Double   │            │
│  └────────┬─────────┘         │  Voting           │            │
│           │                   └──────────────────┬┘            │
│           │                                      │             │
│           ▼                                      ▼             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              UTxO with UrnaDatum                        │  │
│  │  {                                                      │  │
│  │    weight: Int,                                         │  │
│  │    options: [(0, 42), (1, 35), (2, 23)],               │  │
│  │    event_date: (start, end),                           │  │
│  │    semaphore_nft: PolicyId                             │  │
│  │  }                                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Off-Chain Components
```
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (NestJS)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Group Management Service                              │    │
│  │  - Incremental Merkle Tree (@zk-kit)                  │    │
│  │  - Participant Commitments                             │    │
│  │  - Root Hash Computation                               │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  SQLite Database                                       │    │
│  │  - Event metadata                                      │    │
│  │  - groupLeafCommitments: [{userId, commitment}, ...]  │    │
│  │  - groupMerkleRootHash                                 │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Frontend Components
```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js + React)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Semaphore Client Library (modp-semaphore-bls12381)   │    │
│  │  - Identity Generation                                 │    │
│  │  - Commitment Creation                                 │    │
│  │  - ZK-Proof Generation (client-side)                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Transaction Builder (MeshSDK)                         │    │
│  │  - Build vote transactions                             │    │
│  │  - Submit to Cardano network                           │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### 1. UrnaDatum (On-Chain Voting State)

**Location**: `voting.ak:17-22`

```aiken
pub type UrnaDatum {
  weight: Int,              // Vote weight per participant
  options: Options,         // List of (index, vote_count) pairs
  event_date: (Int, Int),   // (start_timestamp, end_timestamp) in POSIX ms
  semaphore_nft: PolicyId,  // Reference to Semaphore validator
}
```

**Field Specifications**:

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `weight` | `Int` | Voting power per participant | `>= 1`. If `1`, simple voting. If `>1`, weighted voting. |
| `options` | `Options` | Vote tallies for each option | `List<(Int, Int)>`. First element is option index (starting at 0), second is vote count. Must be in ascending order by index. |
| `event_date` | `(Int, Int)` | Event time window | `(start, end)` where `start < end`. Timestamps in POSIX milliseconds. |
| `semaphore_nft` | `PolicyId` | Link to Semaphore validator | 28-byte policy ID of the Semaphore NFT that verifies ZK-proofs for this event. |

**Example**:
```aiken
UrnaDatum {
  weight: 100,
  options: [(0, 0), (1, 0), (2, 0)],  // 3 options, all initialized to 0
  event_date: (1735689600000, 1735776000000),  // Jan 1-2, 2025
  semaphore_nft: #"a1b2c3d4..."
}
```

### 2. UrnaRedeemer (Actions)

**Location**: `voting.ak:24-27`

```aiken
pub type UrnaRedeemer {
  Mint  // Action: Create voting event NFT
  Vote  // Action: Cast a vote
}
```

**Usage**:
- `Mint`: Used when creating a new voting event (minting policy)
- `Vote`: Used when casting a vote (spending validator)

### 3. Options Type

**Location**: `types.ak:6`

```aiken
pub type Options = List<(Int, Int)>
```

**Structure**: List of tuples where:
- First element: Option index (0-based, ascending order)
- Second element: Current vote count for that option

**Invariants**:
- Must not be empty
- Indexes must be consecutive starting from 0
- During minting, all vote counts must be 0

**Examples**:
```aiken
// Valid - simple voting with 3 options
[(0, 12), (1, 8), (2, 5)]

// Valid - weighted voting with 2 options
[(0, 250), (1, 180)]

// Invalid - missing index 1
[(0, 5), (2, 3)]

// Invalid - not in ascending order
[(1, 5), (0, 3)]
```

### 4. SemaphoreRedeemer (External Type)

**Location**: External dependency `modulo-p/cardano-semaphore`

```aiken
pub type SemaphoreRedeemer = Signal(
  zk_proof: ByteArray,      // Zero-knowledge proof data
  mpf_proof: ByteArray,     // Merkle Patricia Forestry proof
  nullifier: ByteArray,     // One-time-use identifier (prevents double voting)
  signal_hash: ByteArray,   // Hash of the signal message
  signal_message: ByteArray // Encrypted vote data (CBOR-encoded Options)
)
```

**Field Specifications**:

| Field | Type | Description | Size |
|-------|------|-------------|------|
| `zk_proof` | `ByteArray` | BLS12-381 ZK-SNARK proof | Variable (typically ~200 bytes) |
| `mpf_proof` | `ByteArray` | Proof of group membership | Variable |
| `nullifier` | `ByteArray` | Unique hash preventing double voting | 32 bytes (Poseidon hash) |
| `signal_hash` | `ByteArray` | Hash of signal_message | 32 bytes |
| `signal_message` | `ByteArray` | CBOR-encoded vote data | Variable |

**Signal Message Format**:
The `signal_message` field contains CBOR-encoded vote data:
- **Simple voting**: `[(index, 1)]` - single option with weight 1
- **Weighted voting**: `[(index1, weight1), (index2, weight2), ...]` - multiple options with weights

**Example**:
```
// Simple vote for option 1
signal_message (decoded): [(1, 1)]

// Weighted vote: 60 points to option 0, 40 points to option 2
signal_message (decoded): [(0, 60), (2, 40)]
```

### 5. VotingEvent Entity (Off-Chain Database)

**Location**: Backend database schema

```typescript
{
  eventId: number,
  eventName: string,

  // Voting configuration
  votingNft: string | null,                    // Policy ID of Urna NFT
  votingValidatorAddress: string | null,       // Script address
  votingPower: number,                         // Same as UrnaDatum.weight
  options: string,                             // JSON: [{index, text, votes}, ...]
  adminUserId: number | null,
  adminToken: string,                          // Secret admin access token
  startingDate: number | null,                 // POSIX timestamp (ms)
  endingDate: number | null,                   // POSIX timestamp (ms)

  // Group configuration (off-chain Merkle tree state)
  groupNft: string | null,
  groupValidatorAddress: string | null,
  groupMerkleRootHash: string,                 // Must match on-chain root
  groupLeafCommitments: string,                // JSON: [{userId, commitment}, ...]
  groupSize: number,                           // Max participants (tree depth = log2)

  // Semaphore configuration
  semaphoreNft: string | null,                 // Same as UrnaDatum.semaphore_nft
  semaphoreAddress: string | null,
  nullifierMerkleTree: string | null,          // Serialized nullifier tree state
  nullifierLeafCommitments: string,            // JSON: [nullifier, ...]
  verificationReferenceInput: string | null,
  currentVoteCount: string | null,             // JSON: mirrored vote tallies
}
```

**Key Fields for On-Chain Integration**:
- `groupMerkleRootHash`: Used to construct the group Merkle tree for ZK-proof generation
- `semaphoreNft`: Stored in `UrnaDatum.semaphore_nft` to link validators
- `votingPower`: Stored in `UrnaDatum.weight`
- `startingDate`/`endingDate`: Stored in `UrnaDatum.event_date`

---

## Voting Validator (voting.ak)

### Overview
The voting validator has two purposes (mint and spend):
1. **Mint**: Create a unique NFT representing a voting event (Urna)
2. **Spend**: Process votes and update vote tallies

### Dependencies
```aiken
use aiken/collection/dict
use aiken/collection/list
use aiken/interval.{is_entirely_before}
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, OutputReference, Spend, Transaction, find_input}
use semaphore_types.{SemaphoreRedeemer, Signal}
use types.{Options}
use voting_utilities.{
  check_initial_options_value, check_options_index, check_weight,
  deserialise_signal, is_interval_within, is_policy_on_value,
  simple_vote, weighted_vote
}
```

### Mint Function Specification

**Location**: `voting.ak:30-79`

**Purpose**: Create a unique voting event NFT (Urna) with initial state

**Parameters**:
- `_redeemer: UrnaRedeemer` - Must be `Mint`
- `policy_id: PolicyId` - This minting policy's ID
- `self: Transaction` - Current transaction context

**Validation Conditions**:

#### Condition 0: Expected UTxO Spent
```aiken
expect Some(_nft_utxo) = find_input(inputs, oref)
```
- **Purpose**: Enforce one-shot minting (unique NFT per UTxO)
- **Parameter**: `oref: OutputReference` - Unique UTxO reference provided at validator compilation
- **Failure**: Transaction rejected if `oref` is not consumed
- **Rationale**: Prevents multiple voting events with same policy ID

#### Condition 1: Exactly One Token Minted
```aiken
expect [Pair(_asset_name, amount)] =
  mint |> assets.tokens(policy_id) |> dict.to_pairs()
let is_one_token_minted: Bool = amount == 1
```
- **Purpose**: Ensure only one Urna NFT is created
- **Check**: Minting exactly 1 token with this policy ID
- **Failure**: Reject if 0, 2, or more tokens minted
- **Rationale**: One NFT = one voting event

#### Condition 2: NFT Sent to Script Address
```aiken
let own_script_credential = Script(policy_id)
expect [output_to_script] =
  list.filter(outputs, fn(o) {
    o.address.payment_credential == own_script_credential
  })
let is_nft_sent_to_script: Bool =
  is_policy_on_value(output_to_script.value, policy_id)
```
- **Purpose**: Lock NFT at script address (script-controlled)
- **Check**: NFT appears in exactly one output with script address
- **Failure**: Reject if NFT sent to wallet or multiple outputs
- **Rationale**: Voting state must be on-chain and script-controlled

#### Condition 3: Valid UrnaDatum Attached
```aiken
expect InlineDatum(out_datum) = output_to_script.datum
expect urna_datum: UrnaDatum = out_datum
```
- **Purpose**: Ensure voting event state is properly initialized
- **Check**: Output has inline datum of type `UrnaDatum`
- **Failure**: Reject if no datum or wrong type
- **Rationale**: Voting logic requires access to event parameters

#### Condition 4: Event Time Correctly Set
```aiken
let (event_start, event_end) = urna_datum.event_date
let is_event_time_set: Bool =
  event_start < event_end &&
  is_entirely_before(validity_range, event_start)
```
- **Purpose**: Enforce valid time window and prevent backdating
- **Checks**:
  1. `event_start < event_end` - Start before end
  2. `validity_range < event_start` - Minting before event starts
- **Failure**: Reject if times are invalid or minting during/after event
- **Rationale**: Prevents tampering with voting timeline

#### Condition 5: All Options Initialized to Zero
```aiken
let are_options_values_correct: Bool =
  check_initial_options_value(urna_datum.options)

// voting_utilities.ak:34-36
pub fn check_initial_options_value(options: Options) -> Bool {
  list.all(options, fn(e) { e.2nd == 0 })
}
```
- **Purpose**: Ensure vote counts start at zero
- **Check**: Every option's vote count is 0
- **Failure**: Reject if any option has non-zero votes
- **Rationale**: Prevents pre-filled vote counts

#### Condition 6: Option Indexes in Ascending Order
```aiken
let are_options_indexes_correct: Bool =
  check_options_index(urna_datum.options)

// voting_utilities.ak:24-30
pub fn check_options_index(options: Options) -> Bool {
  if options == [] {
    error "Empty options"
  } else {
    check_options_index_rec(options, 0)
  }
}

// Recursive check: voting_utilities.ak:15-22
pub fn check_options_index_rec(options: Options, state: Int) -> Bool {
  when options is {
    [] -> True
    [o, ..opts] -> {
      o.1st == state && check_options_index_rec(opts, state + 1)
    }
  }
}
```
- **Purpose**: Enforce consistent option indexing
- **Check**: Options indexed as 0, 1, 2, ... N-1 with no gaps
- **Failure**: Reject if empty, gaps, or wrong order
- **Rationale**: Simplifies vote counting and prevents index manipulation

**Output State**:
```aiken
UTxO {
  address: Script(policy_id),
  value: {policy_id: {asset_name: 1}, lovelace: min_ada},
  datum: InlineDatum(UrnaDatum {
    weight: votingPower,
    options: [(0, 0), (1, 0), ...],
    event_date: (start, end),
    semaphore_nft: semaphore_policy_id
  })
}
```

### Spend Function Specification

**Location**: `voting.ak:81-161`

**Purpose**: Process a vote and update vote tallies

**Parameters**:
- `datum: Option<UrnaDatum>` - Current voting event state
- `_redeemer: UrnaRedeemer` - Must be `Vote`
- `utxo: OutputReference` - Urna UTxO being spent
- `self: Transaction` - Current transaction context

**Validation Conditions**:

#### Condition 1: Semaphore NFT Spent
```aiken
expect [semaphore_input] =
  list.filter(inputs, fn(i) {
    is_policy_on_value(i.output.value, dat.semaphore_nft)
  })
```
- **Purpose**: Ensure ZK-proof verification occurred
- **Check**: Exactly one input contains the Semaphore NFT
- **Failure**: Reject if Semaphore NFT not spent
- **Rationale**: Semaphore validator must run to verify ZK-proof and nullifier

#### Condition 2: Urna NFT Returned to Script
```aiken
expect Some(this_script_input) = find_input(inputs, utxo)
let this_script_address = this_script_input.output.address

expect [output_to_script] =
  list.filter(outputs, fn(o) { o.address == this_script_address })

let is_value_returned: Bool =
  assets.without_lovelace(output_to_script.value) ==
  assets.without_lovelace(this_script_input.output.value)
```
- **Purpose**: Preserve voting state on-chain (no burning)
- **Checks**:
  1. Exactly one output to same script address
  2. Output value equals input value (excluding lovelace)
- **Failure**: Reject if NFT not returned or value changed
- **Rationale**: Voting state must persist for future votes and tallying

#### Condition 3: Valid Signal Deserialization
```aiken
expect [Pair(Spend(_input), semaphore_redeemer)] =
  list.filter(redeemers, fn(r) {
    r.1st == Spend(semaphore_input.output_reference)
  })
expect semaphore_redeemer: SemaphoreRedeemer = semaphore_redeemer
expect Signal(_zk_proof, _mpf_proof, _nullifier, _signal_hash, signal_message) =
  semaphore_redeemer

let vote: Options = deserialise_signal(signal_message)

// voting_utilities.ak:99-103
pub fn deserialise_signal(message: ByteArray) -> Options {
  expect Some(data) = cbor.deserialise(message)
  expect options: Options = data
  options
}
```
- **Purpose**: Extract vote data from Semaphore signal
- **Process**:
  1. Find Semaphore redeemer in transaction
  2. Extract `signal_message` field
  3. CBOR-decode to `Options` type
- **Failure**: Reject if deserialization fails or wrong type
- **Rationale**: Vote data is encrypted in Semaphore signal; must decode to process

**Signal Message Structure**:
- **Simple Vote**: `[(option_index, 1)]` - single option
- **Weighted Vote**: `[(idx1, weight1), (idx2, weight2), ...]` - multiple options

#### Condition 4: Vote Within Event Time Window
```aiken
let is_within_time_event: Bool =
  is_interval_within(validity_range, dat.event_date)

// voting_utilities.ak:10-12
pub fn is_interval_within(iv1: Interval<Int>, time_pair: (Int,Int)) -> Bool {
  interval.is_entirely_after(iv1, time_pair.1st) &&
  interval.is_entirely_before(iv1, time_pair.2nd)
}
```
- **Purpose**: Enforce voting time bounds
- **Check**: Transaction validity range is after start and before end
- **Failure**: Reject if voting outside event window
- **Rationale**: Prevents early or late votes

#### Condition 5: Datum Preservation
```aiken
expect InlineDatum(out_datum) = output_to_script.datum
expect out_dat: UrnaDatum = out_datum

let is_datum_preserved: Bool = and {
  dat.weight == out_dat.weight,
  dat.event_date == out_dat.event_date,
  dat.semaphore_nft == out_dat.semaphore_nft,
}
```
- **Purpose**: Prevent tampering with voting parameters
- **Checks**: Critical fields unchanged:
  - `weight` - Voting power per participant
  - `event_date` - Time window
  - `semaphore_nft` - ZK-proof validator link
- **Failure**: Reject if any critical field modified
- **Rationale**: Only vote tallies (`options`) should change during voting

#### Condition 6a: Simple Voting Logic
**Activated when**: `dat.weight == 1`

```aiken
if dat.weight > 1 {
  // ... weighted logic ...
} else {
  // Simple voting
  expect [vote_target] = vote  // Must be exactly one option
  let is_vote_correct: Bool =
    simple_vote(dat.options, vote_target.1st) == out_dat.options
  is_vote_correct && validator_conditions
}

// voting_utilities.ak:56-66
pub fn simple_vote(options: Options, index: Int) -> Options {
  if options == [] {
    error "Empty options"
  } else if index < 0 {
    error "Negative index"
  } else if list.length(options) < index + 1 {
    error "Index out of range"
  } else {
    update_option(options, index, 1)
  }
}

// voting_utilities.ak:40-51
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
```

**Rules**:
1. Vote must contain exactly one option: `expect [vote_target] = vote`
2. Vote quantity must be 1 (implicit in signal format)
3. Target option incremented by 1
4. All other options unchanged

**Example**:
```aiken
// Before vote
dat.options = [(0, 10), (1, 5), (2, 8)]

// Vote signal: [(1, 1)]
vote = [(1, 1)]

// After vote
out_dat.options = [(0, 10), (1, 6), (2, 8)]  // Option 1 +1
```

**Failure Cases**:
- Multiple options in vote signal
- Invalid option index (negative or out of range)
- Output options don't match expected increment

#### Condition 6b: Weighted Voting Logic
**Activated when**: `dat.weight > 1`

```aiken
if dat.weight > 1 {
  // Weighted voting
  let is_vote_correct: Bool =
    weighted_vote(dat.options, vote) == out_dat.options
  let is_weight_correct: Bool =
    check_weight(vote, dat.weight)
  is_vote_correct && is_weight_correct && validator_conditions
}

// voting_utilities.ak:83-90
pub fn weighted_vote(options: Options, target_options: Options) -> Options {
  when target_options is {
    [] -> options
    [to, ..tops] -> {
      weighted_vote((update_option(options, to.1st, to.2nd)), tops)
    }
  }
}

// voting_utilities.ak:93-96
pub fn check_weight(target_options: Options, allowed_weight: Int) -> Bool {
  let weight: Int = list.foldr(target_options, 0, fn(to, total) {
    to.2nd + total
  })
  weight == allowed_weight
}
```

**Rules**:
1. Vote can contain multiple options
2. Sum of all vote weights must equal `dat.weight`
3. Each specified option incremented by its weight
4. Unspecified options unchanged

**Example**:
```aiken
// Before vote (weight = 100)
dat.options = [(0, 50), (1, 30), (2, 20)]

// Vote signal: [(0, 60), (2, 40)]
vote = [(0, 60), (2, 40)]

// Weight check: 60 + 40 = 100 ✓

// After vote
out_dat.options = [(0, 110), (1, 30), (2, 60)]  // +60, unchanged, +40
```

**Failure Cases**:
- Total weight ≠ `dat.weight` (over-voting or under-voting)
- Invalid option indexes
- Output options don't match expected increments

**Output State**:
```aiken
UTxO {
  address: Script(policy_id),
  value: {policy_id: {asset_name: 1}, lovelace: min_ada},
  datum: InlineDatum(UrnaDatum {
    weight: dat.weight,                    // Preserved
    options: updated_vote_counts,          // Updated
    event_date: dat.event_date,            // Preserved
    semaphore_nft: dat.semaphore_nft       // Preserved
  })
}
```

---

## Semaphore Validator Specification

### Overview
The Semaphore validator is provided by external dependency `modulo-p/cardano-semaphore` (v0.9.2). It handles zero-knowledge proof verification and double-voting prevention using the Semaphore protocol adapted for Cardano.

**External Repository**: https://github.com/modulo-p/cardano-semaphore

### Purpose
1. **Verify ZK-Proofs**: Validate that voter is a group member without revealing identity
2. **Prevent Double-Voting**: Track nullifiers to ensure each identity votes only once
3. **Validate Signal Integrity**: Ensure signal (vote data) matches the proof

### Integration Architecture
```
┌────────────────────────────────────────────────────────────┐
│              Vote Transaction Structure                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Inputs:                                                   │
│    ┌──────────────────────────────────────┐              │
│    │ Semaphore NFT UTxO                  │              │
│    │ - Must be spent for every vote      │              │
│    │ - Redeemer: SemaphoreRedeemer       │              │
│    └──────────────────────────────────────┘              │
│                                                            │
│    ┌──────────────────────────────────────┐              │
│    │ Urna NFT UTxO (Voting Validator)    │              │
│    │ - Contains current vote tallies     │              │
│    │ - Redeemer: Vote                    │              │
│    └──────────────────────────────────────┘              │
│                                                            │
│  Outputs:                                                  │
│    ┌──────────────────────────────────────┐              │
│    │ Semaphore NFT UTxO (returned)       │              │
│    │ - Updated nullifier tree            │              │
│    └──────────────────────────────────────┘              │
│                                                            │
│    ┌──────────────────────────────────────┐              │
│    │ Urna NFT UTxO (returned)            │              │
│    │ - Updated vote tallies              │              │
│    └──────────────────────────────────────┘              │
│                                                            │
│  Validation Order:                                         │
│    1. Semaphore Validator runs first                      │
│       ✓ Verify ZK-proof                                   │
│       ✓ Check nullifier uniqueness                        │
│       ✓ Validate signal hash                              │
│    2. Voting Validator runs second                        │
│       ✓ Confirm Semaphore NFT was spent (Condition 1)    │
│       ✓ Process vote (deserialize signal, update tallies)│
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### SemaphoreDatum (On-Chain State)

```aiken
pub type SemaphoreDatum {
  group_merkle_root: ByteArray,      // Root hash of participant Merkle tree
  depth: Int,                        // Tree depth (log2 of max participants)
  nullifier_root: ByteArray,         // Root hash of used nullifiers tree
  signal_hash_config: SignalHashConfig,  // Configuration for signal hashing
}
```

**Field Specifications**:

| Field | Type | Description |
|-------|------|-------------|
| `group_merkle_root` | `ByteArray` | 32-byte root hash of the incremental Merkle tree containing all participant commitments. Updated only during registration (off-chain recomputation, then on-chain update). |
| `depth` | `Int` | Tree depth. For 20 participants: depth=5 (2^5=32 slots). Determines maximum group size. |
| `nullifier_root` | `ByteArray` | Root hash of the Merkle tree tracking used nullifiers. Updated after each vote. |
| `signal_hash_config` | `SignalHashConfig` | Parameters for hashing signal message (vote data). |

### SemaphoreRedeemer (Vote Action)

```aiken
pub type SemaphoreRedeemer = Signal(
  zk_proof: ByteArray,        // BLS12-381 SNARK proof
  mpf_proof: ByteArray,       // Merkle Patricia Forestry proof
  nullifier: ByteArray,       // Poseidon hash(identity_secret, group_id)
  signal_hash: ByteArray,     // Hash of signal_message
  signal_message: ByteArray   // Encrypted vote data (passed to Voting Validator)
)
```

### Validation Logic (Conceptual)

The Semaphore validator performs these checks when processing a vote:

#### 1. ZK-Proof Verification
```pseudo
verify_zk_proof(zk_proof, public_inputs) where:
  public_inputs = {
    group_merkle_root: datum.group_merkle_root,
    nullifier: redeemer.nullifier,
    signal_hash: redeemer.signal_hash,
    external_nullifier: group_id  // Unique per voting event
  }

Returns: Bool (true if proof valid)
```

**What the proof proves**:
- Prover knows a valid identity secret
- Identity commitment is in the group Merkle tree (membership)
- Nullifier correctly derived: `nullifier = Poseidon(identity_secret, external_nullifier)`
- Signal hash correctly derived: `signal_hash = Hash(signal_message)`

**Failure**: Reject if proof invalid (voter not in group or tampered proof)

#### 2. Nullifier Uniqueness Check
```pseudo
check_nullifier_uniqueness(nullifier, nullifier_root, mpf_proof):
  1. Verify nullifier NOT in current nullifier_root tree using mpf_proof
  2. Add nullifier to tree, compute new nullifier_root
  3. Update output datum with new nullifier_root

Returns: Bool (true if nullifier unused)
```

**Merkle Patricia Forestry (MPF)**:
- Efficient sparse Merkle tree for nullifier tracking
- `mpf_proof` demonstrates nullifier absence in current tree
- New tree computed on-chain with added nullifier

**Failure**: Reject if nullifier already exists (double-vote attempt)

#### 3. Signal Hash Validation
```pseudo
validate_signal_hash(signal_message, signal_hash, signal_hash_config):
  computed_hash = hash(signal_message, signal_hash_config)
  return computed_hash == signal_hash

Returns: Bool (true if hash matches)
```

**Purpose**: Ensure `signal_message` (vote data) hasn't been tampered with after ZK-proof generation

**Failure**: Reject if hash mismatch (signal modified)

#### 4. Datum Update
```pseudo
Output Datum:
  group_merkle_root: datum.group_merkle_root      // Unchanged (no new participants)
  depth: datum.depth                              // Unchanged
  nullifier_root: new_nullifier_root              // Updated with new nullifier
  signal_hash_config: datum.signal_hash_config    // Unchanged
```

### Off-Chain Components

#### Identity Generation (Frontend)
```typescript
import { Identity } from "modp-semaphore-bls12381";

// Generate Semaphore identity
const identity = new Identity();
const commitment = identity.commitment;  // To be added to group tree

// Store identity securely (browser local storage or wallet)
localStorage.setItem(`identity_${eventId}`, identity.export());
```

#### Commitment Structure
```
commitment = Poseidon(identity_secret)

where:
  identity_secret = random 32-byte value
  Poseidon = Poseidon hash function over BLS12-381 curve
```

#### Proof Generation (Frontend)
```typescript
import { Group, generateProof } from "modp-semaphore-bls12381";

// Reconstruct group from backend data
const group = new Group(groupId, depth);
group.members = participantCommitments;  // From backend API

// Prepare vote signal
const voteSignal = [[optionIndex, 1]];  // Simple vote
const signalMessage = cbor.encode(voteSignal);

// Generate ZK-proof
const { proof, nullifier, signalHash } = await generateProof(
  identity,                    // Voter's identity
  group,                       // Group Merkle tree
  groupId,                     // External nullifier (voting event ID)
  signalMessage                // Vote data to encrypt
);

// Build transaction redeemer
const semaphoreRedeemer = {
  zk_proof: proof.zkProof,
  mpf_proof: proof.mpfProof,
  nullifier: nullifier,
  signal_hash: signalHash,
  signal_message: signalMessage
};
```

**Key Parameters**:
- `identity`: Voter's secret identity (never leaves client)
- `group`: Merkle tree of all participant commitments (public)
- `groupId`: Voting event identifier (prevents proof reuse across events)
- `signalMessage`: Encrypted vote data (CBOR-encoded Options)

**Output**:
- `zk_proof`: Cryptographic proof of group membership
- `nullifier`: Unique identifier for this vote (prevents double-voting)
- `signalHash`: Hash of vote data (for integrity)

### Security Properties

| Property | Implementation | Guarantee |
|----------|----------------|-----------|
| **Anonymity** | ZK-proof hides identity secret | Vote cannot be linked to voter identity |
| **Unforgeability** | Proof requires valid identity in group tree | Only group members can vote |
| **Non-repudiation** | Votes recorded on-chain immutably | Votes cannot be denied or altered |
| **Double-Vote Prevention** | Nullifier tracking in MPF tree | Each identity votes exactly once per event |
| **Signal Integrity** | Signal hash verification | Vote data cannot be modified after proof generation |

### Dependencies
```toml
# aiken.toml
[[dependencies]]
name = "modulo-p/cardano-semaphore"
version = "v0.9.2"
source = "github"

[[dependencies]]
name = "aiken-lang/merkle-patricia-forestry"
version = "v2.1.0"
source = "github"

[[dependencies]]
name = "modulo-p/ak-381"
version = "v0.1.1"
source = "github"
```

**Library Responsibilities**:
- `cardano-semaphore`: Semaphore validator logic, types
- `merkle-patricia-forestry`: Nullifier tree implementation
- `ak-381`: BLS12-381 elliptic curve operations for ZK-proofs

---

## Group Management Specification

### Overview
Group management is a **hybrid system**:
- **Off-chain**: Participant commitments stored in backend database, Merkle tree computed using `@zk-kit/incremental-merkle-tree`
- **On-chain**: Merkle root hash stored in `SemaphoreDatum.group_merkle_root`, verified during voting

### Architecture
```
┌──────────────────────────────────────────────────────────────────┐
│                  Group Management Flow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. PARTICIPANT ENROLLMENT (Off-Chain)                           │
│     ┌──────────────────────────────────────────────┐            │
│     │ Backend (NestJS)                             │            │
│     │ - Receive userId + commitment                │            │
│     │ - Add to groupLeafCommitments array          │            │
│     │ - Recompute Merkle tree                      │            │
│     │ - Store new groupMerkleRootHash              │            │
│     └──────────────────────────────────────────────┘            │
│                          │                                        │
│                          ▼                                        │
│     ┌──────────────────────────────────────────────┐            │
│     │ SQLite Database                              │            │
│     │ VotingEvent {                                │            │
│     │   groupLeafCommitments: [                    │            │
│     │     {userId: 1, commitment: "0xabc..."},    │            │
│     │     {userId: 2, commitment: "0xdef..."},    │            │
│     │     ...                                      │            │
│     │   ],                                         │            │
│     │   groupMerkleRootHash: "0x1a2b3c..."        │            │
│     │ }                                            │            │
│     └──────────────────────────────────────────────┘            │
│                                                                   │
│  2. EVENT DEPLOYMENT (On-Chain Sync)                             │
│     ┌──────────────────────────────────────────────┐            │
│     │ Transaction: Deploy Semaphore                │            │
│     │ - Create SemaphoreDatum {                    │            │
│     │     group_merkle_root: "0x1a2b3c...",       │            │
│     │     depth: 5,                                │            │
│     │     nullifier_root: "0x000...",             │            │
│     │   }                                          │            │
│     │ - Lock Semaphore NFT at script address      │            │
│     └──────────────────────────────────────────────┘            │
│                                                                   │
│  3. PROOF GENERATION (Off-Chain)                                 │
│     ┌──────────────────────────────────────────────┐            │
│     │ Frontend                                     │            │
│     │ - Fetch groupLeafCommitments from backend   │            │
│     │ - Reconstruct Merkle tree locally           │            │
│     │ - Generate ZK-proof using tree              │            │
│     └──────────────────────────────────────────────┘            │
│                                                                   │
│  4. PROOF VERIFICATION (On-Chain)                                │
│     ┌──────────────────────────────────────────────┐            │
│     │ Semaphore Validator                          │            │
│     │ - Read group_merkle_root from datum          │            │
│     │ - Verify ZK-proof against this root          │            │
│     │ - Confirm voter commitment is in tree        │            │
│     └──────────────────────────────────────────────┘            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Incremental Merkle Tree

#### Library
```typescript
import { IncrementalMerkleTree } from "@zk-kit/incremental-merkle-tree";
import { poseidon } from "poseidon-bls12381";
```

#### Structure
```
                        Root (groupMerkleRootHash)
                       /                            \
                  Hash01                            Hash23
                 /      \                          /      \
             Hash0      Hash1                  Hash2      Hash3
            /    \      /    \                /    \      /    \
         C[0]  C[1]  C[2]  C[3]            C[4]  C[5]  C[6]  C[7]

Where:
  C[i] = Participant commitment (leaf)
  Hash_n = Poseidon(left_child, right_child)
  Root = groupMerkleRootHash (stored on-chain)
```

**Properties**:
- **Depth**: `log2(groupSize)` - For 20 participants: depth=5 (32 slots)
- **Hash Function**: Poseidon over BLS12-381 (ZK-friendly)
- **Leaf Values**: Participant commitments (Poseidon(identity_secret))
- **Zero Values**: Empty slots filled with predefined zero values

#### Backend Implementation

**Location**: `src/backend/src/voting-event/voting-event.service.ts`

**Add Participant** (`addParticipant` method):
```typescript
async addParticipant(
  eventId: number,
  userId: number,
  commitment: string
): Promise<VotingEvent> {
  // 1. Fetch event from database
  const event = await this.votingEventRepository.findOne({
    where: { eventId }
  });
  if (!event) throw new Error('Voting event not found');

  // 2. Parse existing participants
  const participants = JSON.parse(event.groupLeafCommitments) as Array<{
    userId: number,
    commitment: string
  }>;

  // 3. Check if user already enrolled
  if (participants.some(p => p.userId === userId)) {
    return event;  // Already a participant
  }

  // 4. Recreate Merkle tree with existing commitments
  const group = new Group(BigInt(eventId), event.groupSize);
  if (participants.length > 0) {
    for (const participant of participants) {
      group.addMember(BigInt(participant.commitment));
    }
  }

  // 5. Add new member
  group.addMember(BigInt(commitment));

  // 6. Update database
  const updatedParticipants = [...participants, { userId, commitment }];
  event.groupLeafCommitments = JSON.stringify(updatedParticipants);
  event.groupMerkleRootHash = group.merkleTree.root.toString();

  return await this.votingEventRepository.save(event);
}
```

**Group Class** (from `modp-semaphore-bls12381`):
```typescript
class Group {
  groupId: bigint;
  merkleTree: IncrementalMerkleTree;
  zeroValue: bigint;

  constructor(groupId: bigint, depth: number) {
    this.groupId = groupId;
    this.zeroValue = poseidon([groupId]);  // Zero value for empty slots
    this.merkleTree = new IncrementalMerkleTree(
      poseidon,       // Hash function
      depth,          // Tree depth
      this.zeroValue, // Default leaf value
      2               // Binary tree (arity=2)
    );
  }

  addMember(commitment: bigint): void {
    this.merkleTree.insert(commitment);
  }

  get root(): bigint {
    return this.merkleTree.root;
  }
}
```

**Key Methods**:
- `new Group(groupId, depth)`: Initialize empty tree
- `addMember(commitment)`: Insert leaf, recompute root
- `merkleTree.root`: Get current root hash

#### Frontend Reconstruction

**Location**: Frontend vote page

**Fetch Participants**:
```typescript
// API call to backend
const response = await fetch(`/voting-event/${eventId}/participants`);
const participants = await response.json();
// Returns: [{userId, commitment}, ...]
```

**Rebuild Tree**:
```typescript
import { Group } from "modp-semaphore-bls12381";

// Reconstruct group locally
const group = new Group(BigInt(eventId), depth);
for (const participant of participants) {
  group.addMember(BigInt(participant.commitment));
}

// Verify root matches on-chain value
const localRoot = group.merkleTree.root.toString();
const onChainRoot = await fetchSemaphoreRoot(eventId);  // From blockchain
if (localRoot !== onChainRoot) {
  throw new Error("Group tree mismatch - data inconsistency");
}
```

**Generate Merkle Proof** (for ZK-proof):
```typescript
// Find voter's index in tree
const voterIndex = participants.findIndex(p =>
  p.commitment === myCommitment
);

// Generate Merkle proof (path from leaf to root)
const merkleProof = group.merkleTree.createProof(voterIndex);
// merkleProof contains: {leaf, siblings[], pathIndices[]}

// Use in ZK-proof generation
const zkProof = await generateProof(
  identity,
  group,        // Includes merkleTree
  groupId,
  signalMessage
);
```

### On-Chain State

#### SemaphoreDatum.group_merkle_root
- **Type**: `ByteArray` (32 bytes)
- **Value**: Root hash of participant Merkle tree
- **Source**: Computed off-chain, stored on-chain during deployment
- **Updates**: Only when adding participants (requires new transaction)

**Current Implementation Note**:
In the current system, `group_merkle_root` is set once at deployment and **not updated** during voting. This is acceptable because:
1. Participants enrolled before event starts (registration phase)
2. After event starts, no new participants added
3. During voting, only `nullifier_root` changes (in SemaphoreDatum)

**Future Enhancement**:
For dynamic groups (participants join during voting), would require:
1. Separate "add participant" transaction
2. Update `SemaphoreDatum.group_merkle_root` on-chain
3. All voters use latest root for proof generation

### Database Schema

**VotingEvent.groupLeafCommitments**:
```json
[
  {
    "userId": 123,
    "commitment": "0x1a2b3c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890"
  },
  {
    "userId": 456,
    "commitment": "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"
  }
]
```

**VotingEvent.groupMerkleRootHash**:
```
"0x7f8e9d0c1b2a394857f8e9d0c1b2a394857f8e9d0c1b2a394857f8e9d0c1b2a39"
```

### Security Considerations

| Concern | Mitigation |
|---------|-----------|
| **Off-chain/On-chain Mismatch** | Frontend verifies local root matches on-chain root before proof generation |
| **Commitment Reuse** | Backend checks for duplicate commitments before adding |
| **Tree Capacity** | Fixed `groupSize` limits max participants (enforced at creation) |
| **Root Tampering** | Root stored in immutable datum on-chain, only modifiable via validator |

### API Endpoints

**Add Participant**:
```
POST /voting-event/:eventId/participants
Headers: X-Admin-Token: <admin_token>
Body: {
  userId: number,
  commitment: string  // Hex-encoded 32-byte value
}
Response: {
  success: true,
  groupMerkleRootHash: string,  // Updated root
  participantCount: number
}
```

**Get Participants**:
```
GET /voting-event/:eventId/participants
Response: {
  participants: [
    {userId: number, commitment: string},
    ...
  ],
  groupMerkleRootHash: string,
  groupSize: number
}
```

**Remove Participant** (if needed):
```
DELETE /voting-event/:eventId/participants/:userId
Headers: X-Admin-Token: <admin_token>
Response: {
  success: true,
  groupMerkleRootHash: string,  // Recomputed root
  participantCount: number
}
```

**Implementation Note**:
Removing a participant requires rebuilding the entire tree without that commitment, as Merkle trees don't support efficient deletion. The new root must be deployed on-chain before voting starts.

---

## On-Chain & Off-Chain Proof Mechanism

### Overview
The proof mechanism spans three layers:
1. **Off-Chain Proof Generation** (Frontend): Generate ZK-proof client-side
2. **On-Chain Proof Verification** (Semaphore Validator): Verify proof on-chain
3. **On-Chain Vote Processing** (Voting Validator): Deserialize signal and update tallies

### Complete Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        PROOF GENERATION FLOW                              │
└──────────────────────────────────────────────────────────────────────────┘

OFF-CHAIN (Frontend)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Voter Prepares Vote
┌─────────────────────────────────────────┐
│ User selects vote options:              │
│ - Simple: [optionIndex]                 │
│ - Weighted: [(idx1, w1), (idx2, w2)]   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Encode vote as CBOR signal message:     │
│ signalMessage = CBOR.encode(vote)       │
│                                         │
│ Example:                                │
│ vote = [(1, 1)]  // Option 1            │
│ signalMessage = 0x82820101             │
└─────────────┬───────────────────────────┘
              │
              ▼
Step 2: Fetch Group Data from Backend
┌─────────────────────────────────────────┐
│ GET /voting-event/:eventId              │
│                                         │
│ Response:                               │
│ {                                       │
│   groupLeafCommitments: [               │
│     {userId: 1, commitment: "0x..."},   │
│     {userId: 2, commitment: "0x..."},   │
│     ...                                 │
│   ],                                    │
│   groupMerkleRootHash: "0x...",         │
│   groupSize: 20,                        │
│   semaphoreNft: "policy_id#asset_name"  │
│ }                                       │
└─────────────┬───────────────────────────┘
              │
              ▼
Step 3: Reconstruct Group Merkle Tree
┌─────────────────────────────────────────┐
│ import { Group } from "modp-semaphore"; │
│                                         │
│ const group = new Group(               │
│   BigInt(eventId),                     │
│   groupSize                            │
│ );                                     │
│                                         │
│ for (const p of participants) {        │
│   group.addMember(                     │
│     BigInt(p.commitment)               │
│   );                                   │
│ }                                       │
│                                         │
│ // Verify integrity                    │
│ assert(                                 │
│   group.merkleTree.root.toString()     │
│   == groupMerkleRootHash               │
│ );                                     │
└─────────────┬───────────────────────────┘
              │
              ▼
Step 4: Retrieve Voter Identity
┌─────────────────────────────────────────┐
│ // From secure storage                  │
│ const identityStr = localStorage        │
│   .getItem(`identity_${eventId}`);     │
│                                         │
│ const identity = Identity               │
│   .import(identityStr);                 │
│                                         │
│ // Verify voter is in group             │
│ const myCommitment = identity.commitment;│
│ assert(                                 │
│   participants.some(p =>                │
│     p.commitment == myCommitment        │
│   )                                     │
│ );                                     │
└─────────────┬───────────────────────────┘
              │
              ▼
Step 5: Generate ZK-Proof
┌─────────────────────────────────────────┐
│ import { generateProof } from           │
│   "modp-semaphore-bls12381";            │
│                                         │
│ const {                                 │
│   proof,                                │
│   nullifier,                            │
│   signalHash                            │
│ } = await generateProof(                │
│   identity,          // Voter secret    │
│   group,             // Merkle tree     │
│   BigInt(eventId),   // External null.  │
│   signalMessage      // Vote data       │
│ );                                      │
│                                         │
│ // Returns:                             │
│ // - proof: {zkProof, mpfProof}        │
│ // - nullifier: unique per voter+event  │
│ // - signalHash: hash of vote data     │
└─────────────┬───────────────────────────┘
              │
              ▼
Step 6: Build Cardano Transaction
┌─────────────────────────────────────────┐
│ import { MeshTxBuilder } from "mesh";   │
│                                         │
│ const txBuilder = new MeshTxBuilder();  │
│                                         │
│ // 1. Spend Semaphore NFT               │
│ txBuilder.txIn(                         │
│   semaphoreUtxo.hash,                   │
│   semaphoreUtxo.index,                  │
│   semaphoreUtxo.value,                  │
│   semaphoreAddress                      │
│ ).spendingRedeemer({                    │
│   data: {                               │
│     constructor: 0,  // Signal variant  │
│     fields: [                           │
│       proof.zkProof,                    │
│       proof.mpfProof,                   │
│       nullifier,                        │
│       signalHash,                       │
│       signalMessage                     │
│     ]                                   │
│   }                                     │
│ });                                     │
│                                         │
│ // 2. Spend Urna NFT                    │
│ txBuilder.txIn(                         │
│   urnaUtxo.hash,                        │
│   urnaUtxo.index,                       │
│   urnaUtxo.value,                       │
│   votingAddress                         │
│ ).spendingRedeemer({                    │
│   data: {                               │
│     constructor: 1  // Vote variant     │
│   }                                     │
│ });                                     │
│                                         │
│ // 3. Return Semaphore NFT              │
│ txBuilder.txOut(                        │
│   semaphoreAddress,                     │
│   [semaphoreNft],                       │
│   updatedSemaphoreDatum  // New null.   │
│ );                                      │
│                                         │
│ // 4. Return Urna NFT                   │
│ txBuilder.txOut(                        │
│   votingAddress,                        │
│   [urnaNft],                            │
│   updatedUrnaDatum  // Incremented votes│
│ );                                      │
│                                         │
│ // 5. Set time bounds                   │
│ txBuilder.invalidBefore(               │
│   event.startingDate                   │
│ ).invalidHereafter(                     │
│   event.endingDate                     │
│ );                                      │
│                                         │
│ // 6. Sign and submit                   │
│ const unsignedTx = txBuilder.complete();│
│ const signedTx = await wallet          │
│   .signTx(unsignedTx);                  │
│ const txHash = await wallet            │
│   .submitTx(signedTx);                  │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Transaction submitted to Cardano node   │
└─────────────────────────────────────────┘

ON-CHAIN (Blockchain Validators)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 7: Semaphore Validator Runs First
┌─────────────────────────────────────────┐
│ Read Input Datum:                       │
│   group_merkle_root: "0x1a2b..."        │
│   nullifier_root: "0x7f8e..."          │
│                                         │
│ Read Redeemer:                          │
│   zk_proof: <proof_bytes>               │
│   nullifier: "0xabc..."                 │
│   signal_hash: "0xdef..."               │
│   signal_message: <vote_bytes>          │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 1: Verify ZK-Proof           │
│                                         │
│ verify_zk_snark(                        │
│   zk_proof,                             │
│   public_inputs: {                      │
│     group_merkle_root,                  │
│     nullifier,                          │
│     signal_hash,                        │
│     external_nullifier: eventId         │
│   }                                     │
│ )                                       │
│                                         │
│ ✓ Proves:                                │
│   - Voter knows identity_secret         │
│   - Commitment in group tree            │
│   - Nullifier correctly derived         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 2: Check Nullifier Unique    │
│                                         │
│ verify_nullifier_absent(                │
│   nullifier,                            │
│   nullifier_root,                       │
│   mpf_proof                             │
│ )                                       │
│                                         │
│ // Add nullifier to tree                │
│ new_nullifier_root = add_nullifier(     │
│   nullifier_root,                       │
│   nullifier                             │
│ )                                       │
│                                         │
│ ✓ Ensures no double-voting              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 3: Verify Signal Hash        │
│                                         │
│ computed_hash = hash(signal_message)    │
│ assert(computed_hash == signal_hash)    │
│                                         │
│ ✓ Vote data integrity                   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Update Output Datum:                    │
│   group_merkle_root: <unchanged>        │
│   nullifier_root: new_nullifier_root    │
│   (other fields unchanged)              │
│                                         │
│ ✅ Semaphore Validation PASSED           │
└─────────────┬───────────────────────────┘
              │
              ▼
Step 8: Voting Validator Runs Second
┌─────────────────────────────────────────┐
│ Read Urna Datum:                        │
│   weight: 100                           │
│   options: [(0, 50), (1, 30), (2, 20)] │
│   event_date: (start, end)              │
│   semaphore_nft: policy_id              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 1: Semaphore NFT Spent       │
│                                         │
│ expect [sem_input] =                    │
│   filter(inputs, has_policy(           │
│     semaphore_nft                       │
│   ))                                    │
│                                         │
│ ✓ Confirms ZK-proof verified            │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 2: Deserialize Signal        │
│                                         │
│ // Extract signal from Semaphore red.   │
│ expect Signal(_, _, _, _, signal_msg)   │
│   = semaphore_redeemer                  │
│                                         │
│ vote = CBOR.decode(signal_msg)          │
│ // vote = [(0, 60), (2, 40)]           │
│                                         │
│ ✓ Vote data extracted                   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 3: Check Time Bounds         │
│                                         │
│ assert(                                 │
│   validity_range.start > event_start && │
│   validity_range.end < event_end        │
│ )                                       │
│                                         │
│ ✓ Vote within event window              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 4: Process Weighted Vote     │
│                                         │
│ // Check total weight                   │
│ total = sum(vote.map(v => v.weight))    │
│ assert(total == datum.weight)  // 100   │
│                                         │
│ // Update options                       │
│ new_options = weighted_vote(            │
│   datum.options,  // [(0,50),(1,30),..]│
│   vote            // [(0,60), (2,40)]   │
│ )                                       │
│ // Result: [(0,110), (1,30), (2,60)]   │
│                                         │
│ ✓ Vote tallies updated correctly        │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Validation 5: Datum Preservation        │
│                                         │
│ expect output_datum.weight              │
│   == datum.weight                       │
│ expect output_datum.event_date          │
│   == datum.event_date                   │
│ expect output_datum.semaphore_nft       │
│   == datum.semaphore_nft                │
│                                         │
│ ✓ Critical fields unchanged             │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Update Output Datum:                    │
│   weight: 100  (preserved)              │
│   options: [(0,110), (1,30), (2,60)]    │
│   event_date: (start, end)  (preserved) │
│   semaphore_nft: policy_id  (preserved) │
│                                         │
│ ✅ Voting Validation PASSED              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Transaction committed to blockchain     │
│ Vote permanently recorded               │
└─────────────────────────────────────────┘
```

### Detailed Component Specifications

#### 1. Off-Chain Proof Generation (Frontend)

**Libraries Used**:
```json
{
  "modp-semaphore-bls12381": "github:modulo-p/semaphore-bls12381#main",
  "@zk-kit/incremental-merkle-tree": "^1.1.0",
  "poseidon-bls12381": "^1.0.2",
  "@meshsdk/core": "^1.8.14"
}
```

**Identity Management**:
```typescript
import { Identity } from "modp-semaphore-bls12381";

// Generate new identity
const identity = new Identity();
// Returns: { secret: bigint, commitment: bigint }

// Export for storage
const exported = identity.export();
localStorage.setItem(`identity_${eventId}`, exported);

// Import from storage
const identity = Identity.import(exported);
```

**Group Reconstruction**:
```typescript
import { Group } from "modp-semaphore-bls12381";

// Fetch from backend
const eventData = await fetch(`/voting-event/${eventId}`).then(r => r.json());

// Rebuild tree
const group = new Group(
  BigInt(eventData.eventId),
  eventData.groupSize
);

for (const participant of eventData.groupLeafCommitments) {
  group.addMember(BigInt(participant.commitment));
}

// Integrity check
if (group.merkleTree.root.toString() !== eventData.groupMerkleRootHash) {
  throw new Error("Group tree mismatch");
}
```

**Proof Generation**:
```typescript
import { generateProof } from "modp-semaphore-bls12381";
import * as cbor from "cbor";

// Prepare vote signal
const voteSignal = [[optionIndex, weight]];  // e.g., [[1, 1]] for simple vote
const signalMessage = cbor.encode(voteSignal);

// Generate ZK-proof (takes 2-5 seconds)
const { proof, nullifier, signalHash } = await generateProof(
  identity,                  // Voter's secret identity
  group,                     // Group Merkle tree
  BigInt(eventId),          // External nullifier (unique per event)
  signalMessage             // CBOR-encoded vote
);

// proof = { zkProof: ByteArray, mpfProof: ByteArray }
// nullifier = Poseidon(identity.secret, eventId)
// signalHash = Hash(signalMessage)
```

**Transaction Building**:
```typescript
import { MeshTxBuilder } from "@meshsdk/core";

// 1. Fetch UTxOs
const semaphoreUtxo = await fetchUtxo(semaphoreAddress, semaphoreNft);
const urnaUtxo = await fetchUtxo(votingAddress, urnaNft);

// 2. Build transaction
const txBuilder = new MeshTxBuilder();

// Spend Semaphore NFT with ZK-proof redeemer
txBuilder.txIn(
  semaphoreUtxo.hash,
  semaphoreUtxo.index,
  semaphoreUtxo.value,
  semaphoreAddress
).spendingRedeemer({
  data: {
    constructor: 0,  // Signal variant
    fields: [
      proof.zkProof,
      proof.mpfProof,
      nullifier,
      signalHash,
      signalMessage
    ]
  },
  tag: "SPEND"
});

// Spend Urna NFT with Vote redeemer
txBuilder.txIn(
  urnaUtxo.hash,
  urnaUtxo.index,
  urnaUtxo.value,
  votingAddress
).spendingRedeemer({
  data: { constructor: 1 },  // Vote variant
  tag: "SPEND"
});

// Return Semaphore NFT (with updated nullifier root)
txBuilder.txOut(
  semaphoreAddress,
  [{ unit: semaphoreNft, quantity: "1" }],
  {
    inline: {
      group_merkle_root: currentDatum.group_merkle_root,  // Unchanged
      depth: currentDatum.depth,
      nullifier_root: computeNewNullifierRoot(nullifier),  // Updated
      signal_hash_config: currentDatum.signal_hash_config
    }
  }
);

// Return Urna NFT (with updated vote counts)
const newOptions = computeNewOptions(currentOptions, voteSignal);
txBuilder.txOut(
  votingAddress,
  [{ unit: urnaNft, quantity: "1" }],
  {
    inline: {
      weight: currentDatum.weight,
      options: newOptions,
      event_date: currentDatum.event_date,
      semaphore_nft: currentDatum.semaphore_nft
    }
  }
);

// Set time bounds
txBuilder.invalidBefore(eventStartTime);
txBuilder.invalidHereafter(eventEndTime);

// Complete, sign, submit
const unsignedTx = txBuilder.complete();
const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);
```

#### 2. On-Chain Proof Verification (Semaphore Validator)

**Validation Steps** (conceptual, actual code in external dependency):

```pseudo
function spend_semaphore(
  datum: SemaphoreDatum,
  redeemer: SemaphoreRedeemer,
  tx: Transaction
) -> Bool {
  expect Signal(zk_proof, mpf_proof, nullifier, signal_hash, signal_message) = redeemer

  // ✓ Verification 1: ZK-Proof
  public_inputs = {
    group_root: datum.group_merkle_root,
    nullifier: nullifier,
    signal_hash: signal_hash,
    external_nullifier: derive_external_nullifier(tx)
  }

  if !verify_bls12381_snark(zk_proof, public_inputs) {
    return False  // Invalid proof
  }

  // ✓ Verification 2: Nullifier Uniqueness
  if !verify_nullifier_absent(nullifier, datum.nullifier_root, mpf_proof) {
    return False  // Nullifier already used (double vote)
  }

  // ✓ Verification 3: Signal Hash
  computed_hash = hash(signal_message, datum.signal_hash_config)
  if computed_hash != signal_hash {
    return False  // Signal tampered
  }

  // ✓ Update output datum
  expect [output] = filter(tx.outputs, output_to_self)
  expect InlineDatum(out_dat) = output.datum

  new_nullifier_root = insert_nullifier(datum.nullifier_root, nullifier)

  if out_dat.nullifier_root != new_nullifier_root {
    return False  // Nullifier root not updated
  }

  if out_dat.group_merkle_root != datum.group_merkle_root {
    return False  // Group root should not change during voting
  }

  return True
}
```

**ZK-SNARK Verification**:
- **Curve**: BLS12-381 (pairing-friendly)
- **Proof System**: Groth16 SNARK (optimized for Cardano)
- **Public Inputs**:
  - `group_merkle_root`: Root of participant tree
  - `nullifier`: Unique identifier for this vote
  - `signal_hash`: Hash of vote data
  - `external_nullifier`: Event-specific identifier (prevents proof reuse)

**Nullifier Tree (Merkle Patricia Forestry)**:
- **Purpose**: Track used nullifiers (prevents double voting)
- **Data Structure**: Sparse Merkle tree (only non-zero values stored)
- **Operations**:
  - `verify_absent(nullifier, root, proof)`: Prove nullifier not in tree
  - `insert(root, nullifier)`: Add nullifier, return new root

#### 3. On-Chain Vote Processing (Voting Validator)

**Validation Steps** (voting.ak spend function):

```aiken
spend(datum: UrnaDatum, _: UrnaRedeemer, utxo: OutputReference, tx: Transaction) {
  // ✓ Check 1: Semaphore NFT spent (proves ZK verification passed)
  expect [sem_input] = filter(tx.inputs, has_policy(datum.semaphore_nft))

  // ✓ Check 2: Extract vote from Semaphore redeemer
  expect [Pair(Spend(_), sem_red)] = filter(tx.redeemers, matches_semaphore)
  expect Signal(_, _, _, _, signal_message) = sem_red
  let vote = deserialise_signal(signal_message)  // CBOR decode

  // ✓ Check 3: Time bounds
  if !is_interval_within(tx.validity_range, datum.event_date) {
    return False
  }

  // ✓ Check 4: Process vote (simple or weighted)
  expect [output] = filter(tx.outputs, output_to_self)
  expect InlineDatum(out_dat) = output.datum

  if datum.weight > 1 {
    // Weighted voting
    let expected_options = weighted_vote(datum.options, vote)
    let total_weight = sum_weights(vote)
    return (expected_options == out_dat.options) && (total_weight == datum.weight)
  } else {
    // Simple voting
    expect [vote_target] = vote  // Must be single option
    let expected_options = simple_vote(datum.options, vote_target.1st)
    return expected_options == out_dat.options
  }
}
```

**Signal Deserialization**:
```aiken
// voting_utilities.ak:99-103
pub fn deserialise_signal(message: ByteArray) -> Options {
  expect Some(data) = cbor.deserialise(message)
  expect options: Options = data
  options
}
```

**CBOR Format**:
- Simple vote: `0x82820101` → `[[1, 1]]` (vote for option 1)
- Weighted vote: `0x8382000360820102028` → `[[0, 60], [2, 40]]` (60 to option 0, 40 to option 2)

### Security Analysis

#### Threat Model

| Attack Vector | Mitigation |
|---------------|-----------|
| **Forge ZK-Proof** | BLS12-381 SNARK verification (computationally infeasible to forge) |
| **Double Vote** | Nullifier tracking in Merkle Patricia tree (on-chain enforcement) |
| **Vote as Non-Member** | Group Merkle tree verification (proof requires valid commitment in tree) |
| **Tamper Signal** | Signal hash verification (signal_hash = Hash(signal_message)) |
| **Replay Proof** | External nullifier (unique per event, proof not reusable) |
| **Front-run Vote** | Transaction time bounds (validity range enforced on-chain) |
| **Modify Vote Tallies** | Datum preservation checks (weight, event_date, semaphore_nft immutable) |
| **Mint Multiple Events** | One-shot minting (unique UTxO consumed, enforced in mint logic) |

#### Cryptographic Guarantees

**Zero-Knowledge Property**:
- Voter's identity secret never revealed on-chain
- Proof reveals only: "I am in the group" (not who)
- Signal message encrypted (vote data) is public, but unlinkable to identity

**Soundness**:
- Cannot generate valid proof without being in group
- Cannot reuse proof for different event (external nullifier binding)
- Cannot modify signal without invalidating signal_hash

**Completeness**:
- Honest voter always generates valid proof
- Valid proof always passes on-chain verification

### Performance Considerations

| Operation | Location | Time | Size |
|-----------|----------|------|------|
| **Identity Generation** | Frontend | <100ms | 32 bytes |
| **Commitment Creation** | Frontend | <100ms | 32 bytes |
| **Merkle Tree Reconstruction** | Frontend | ~500ms (for 100 participants) | N/A |
| **ZK-Proof Generation** | Frontend | 2-5 seconds | ~200 bytes |
| **Transaction Building** | Frontend | ~1 second | ~2-3 KB |
| **ZK-Proof Verification** | On-chain | ~100 CPU units | N/A |
| **Nullifier Check** | On-chain | ~50 CPU units | 32 bytes |
| **Vote Processing** | On-chain | ~30 CPU units | N/A |

**Total Transaction Cost**:
- Script execution: ~180 CPU units (~0.5 ADA)
- Transaction size: ~3 KB (~0.3 ADA)
- **Estimated cost per vote**: ~0.8-1.0 ADA

---

## Complete Flow Specifications

### 1. Registration Flow

**Purpose**: Enroll participants in voting event before voting starts

#### Off-Chain Steps (Backend)

**Step 1: Generate Identity (Frontend)**
```typescript
// User-side (in browser)
const identity = new Identity();
const commitment = identity.commitment.toString();

// Store locally (never send secret!)
localStorage.setItem(`identity_${eventId}`, identity.export());

// Send commitment to backend
await fetch(`/voting-event/${eventId}/participants`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Token': adminToken
  },
  body: JSON.stringify({ userId, commitment })
});
```

**Step 2: Add to Group Tree (Backend)**
```typescript
// src/backend/src/voting-event/voting-event.service.ts:96-127
async addParticipant(eventId: number, userId: number, commitment: string) {
  const event = await this.votingEventRepository.findOne({ where: { eventId } });
  const participants = JSON.parse(event.groupLeafCommitments);

  // Rebuild tree
  const group = new Group(BigInt(eventId), event.groupSize);
  for (const p of participants) {
    group.addMember(BigInt(p.commitment));
  }

  // Add new member
  group.addMember(BigInt(commitment));

  // Update database
  event.groupLeafCommitments = JSON.stringify([...participants, { userId, commitment }]);
  event.groupMerkleRootHash = group.merkleTree.root.toString();

  return await this.votingEventRepository.save(event);
}
```

**Step 3: Verify Registration**
```typescript
// Frontend: Fetch updated participant list
const participants = await fetch(`/voting-event/${eventId}/participants`)
  .then(r => r.json());

// Check if user is enrolled
const isEnrolled = participants.some(p => p.userId === currentUserId);
```

#### On-Chain Steps (During Event Deployment)

**Step 4: Deploy Semaphore Validator**
```typescript
// Build transaction to mint Semaphore NFT and lock at script
const tx = new MeshTxBuilder()
  .mintPlutusScript(semaphoreValidator)
  .mint("1", semaphorePolicy, "Semaphore")
  .txOut(semaphoreScriptAddress, [
    { unit: semaphoreNft, quantity: "1" }
  ], {
    inline: {
      group_merkle_root: groupMerkleRootHash,  // From backend
      depth: groupSize,
      nullifier_root: ZERO_ROOT,  // Empty nullifier tree
      signal_hash_config: defaultConfig
    }
  })
  .complete();

const signedTx = await wallet.signTx(tx);
const txHash = await wallet.submitTx(signedTx);
```

**Step 5: Deploy Voting Validator**
```typescript
// Mint Urna NFT and lock at voting script
const tx = new MeshTxBuilder()
  .mintPlutusScript(votingValidator)
  .mint("1", votingPolicy, "Urna")
  .txOut(votingScriptAddress, [
    { unit: urnaNft, quantity: "1" }
  ], {
    inline: {
      weight: votingPower,
      options: initialOptions,  // All vote counts = 0
      event_date: [startTime, endTime],
      semaphore_nft: semaphorePolicy  // Link to Semaphore validator
    }
  })
  .invalidBefore(currentTime)
  .invalidHereafter(startTime)  // Must mint before event starts
  .complete();

const signedTx = await wallet.signTx(tx);
const txHash = await wallet.submitTx(signedTx);
```

**Step 6: Store On-Chain References (Backend)**
```typescript
// Update database with on-chain deployment info
await votingEventService.update(eventId, {
  semaphoreNft: semaphorePolicy + "#Semaphore",
  semaphoreAddress: semaphoreScriptAddress,
  votingNft: votingPolicy + "#Urna",
  votingValidatorAddress: votingScriptAddress
});
```

**Complete Registration Flow Diagram**:
```
User           Frontend         Backend          Blockchain
  │                │               │                  │
  │──(1) Generate Identity──>│     │                  │
  │<──commitment───────────────│     │                  │
  │                │               │                  │
  │──(2) Register─────────────────>│                  │
  │                │               │──Add to Tree     │
  │                │               │  Update Root     │
  │<──success──────────────────────│                  │
  │                │               │                  │
  │──(3) Verify────────────────────>│                  │
  │<──participant list─────────────│                  │
  │                │               │                  │
  │──(4) Deploy Semaphore──────────────────────────>│
  │                │               │                  │──Mint NFT
  │                │               │                  │  Lock at script
  │                │               │                  │  Store root
  │<──txHash───────────────────────────────────────────│
  │                │               │                  │
  │──(5) Deploy Voting─────────────────────────────>│
  │                │               │                  │──Mint NFT
  │                │               │                  │  Lock at script
  │                │               │                  │  Link to Semaphore
  │<──txHash───────────────────────────────────────────│
  │                │               │                  │
  │──(6) Store refs───────────────>│                  │
  │<──success──────────────────────│                  │
```

### 2. Voting Flow

**Purpose**: Cast anonymous vote on-chain with ZK-proof

#### Off-Chain Steps

**Step 1: Fetch Event Data**
```typescript
const event = await fetch(`/voting-event/${eventId}`).then(r => r.json());
// Returns: { groupLeafCommitments, groupMerkleRootHash, semaphoreNft, ... }
```

**Step 2: Reconstruct Group Tree**
```typescript
const group = new Group(BigInt(eventId), event.groupSize);
for (const p of event.groupLeafCommitments) {
  group.addMember(BigInt(p.commitment));
}

// Verify integrity
if (group.merkleTree.root.toString() !== event.groupMerkleRootHash) {
  throw new Error("Tree mismatch");
}
```

**Step 3: Prepare Vote Signal**
```typescript
// Simple vote
const voteSignal = [[optionIndex, 1]];

// Weighted vote
const voteSignal = [[0, 60], [2, 40]];  // 60 to option 0, 40 to option 2

const signalMessage = cbor.encode(voteSignal);
```

**Step 4: Generate ZK-Proof**
```typescript
const identity = Identity.import(localStorage.getItem(`identity_${eventId}`));

const { proof, nullifier, signalHash } = await generateProof(
  identity,
  group,
  BigInt(eventId),
  signalMessage
);
```

**Step 5: Build and Submit Transaction**
```typescript
// Fetch current UTxOs
const semaphoreUtxo = await fetchUtxo(event.semaphoreAddress, event.semaphoreNft);
const urnaUtxo = await fetchUtxo(event.votingValidatorAddress, event.votingNft);

// Build transaction (see detailed transaction building section above)
const tx = buildVoteTransaction(semaphoreUtxo, urnaUtxo, proof, nullifier, signalMessage);

const signedTx = await wallet.signTx(tx);
const txHash = await wallet.submitTx(signedTx);
```

#### On-Chain Steps

**Step 6: Semaphore Validator Runs**
1. Read input datum (current group_merkle_root, nullifier_root)
2. Verify ZK-proof
3. Check nullifier not in tree
4. Verify signal hash
5. Update output datum (new nullifier_root)

**Step 7: Voting Validator Runs**
1. Confirm Semaphore NFT spent
2. Extract signal_message from Semaphore redeemer
3. Deserialize vote data (CBOR decode)
4. Verify time bounds
5. Process vote (simple or weighted logic)
6. Update output datum (incremented vote counts)

**Step 8: Transaction Committed**
- Both NFTs returned to script addresses
- Updated datums recorded on-chain
- Vote permanently recorded

**Complete Voting Flow Diagram**:
```
User           Frontend         Backend          Blockchain
  │                │               │                  │
  │──(1) Load event page──────────>│                  │
  │<──event data───────────────────│                  │
  │                │               │                  │
  │──(2) Rebuild tree───>│         │                  │
  │                │               │                  │
  │──(3) Select options──>│        │                  │
  │                │──Encode vote  │                  │
  │                │               │                  │
  │──(4) Generate proof───>│       │                  │
  │                │──ZK prove     │                  │
  │                │  (2-5 sec)    │                  │
  │<──proof────────│               │                  │
  │                │               │                  │
  │──(5) Build tx──────>│          │                  │
  │                │──Fetch UTxOs──────────────────>│
  │                │<─UTxOs────────────────────────────│
  │                │──Build tx     │                  │
  │<──unsigned tx──│               │                  │
  │                │               │                  │
  │──(6) Sign tx───>│              │                  │
  │<──signed tx────│               │                  │
  │                │               │                  │
  │──(7) Submit tx────────────────────────────────>│
  │                │               │                  │──Semaphore runs
  │                │               │                  │  ✓ Verify proof
  │                │               │                  │  ✓ Check nullifier
  │                │               │                  │──Voting runs
  │                │               │                  │  ✓ Process vote
  │                │               │                  │  ✓ Update tallies
  │<──txHash───────────────────────────────────────────│
  │                │               │                  │
  │──(8) Poll confirmation─────────────────────────>│
  │<──confirmed────────────────────────────────────────│
```

### 3. Tally Flow

**Purpose**: Retrieve final vote counts after event ends

#### Off-Chain Steps

**Step 1: Query On-Chain UTxO**
```typescript
import { BlockfrostProvider } from "@meshsdk/core";

const provider = new BlockfrostProvider(BLOCKFROST_API_KEY);

// Fetch Urna UTxO
const utxos = await provider.fetchAddressUTxOs(event.votingValidatorAddress);
const urnaUtxo = utxos.find(u => u.assets.some(a => a.unit === event.votingNft));

// Parse datum
const urnaDatum = parseUrnaDatum(urnaUtxo.datum);
// Returns: { weight, options, event_date, semaphore_nft }
```

**Step 2: Parse Vote Counts**
```typescript
// urnaDatum.options = [(0, 120), (1, 85), (2, 95)]

// Fetch option texts from backend
const event = await fetch(`/voting-event/${eventId}`).then(r => r.json());
const optionTexts = JSON.parse(event.options);
// [{ index: 0, text: "Alice", ... }, { index: 1, text: "Bob", ... }]

// Merge on-chain counts with off-chain texts
const results = urnaDatum.options.map(([index, votes]) => ({
  index,
  text: optionTexts.find(o => o.index === index).text,
  votes
}));

// results = [
//   { index: 0, text: "Alice", votes: 120 },
//   { index: 1, text: "Bob", votes: 85 },
//   { index: 2, text: "Charlie", votes: 95 }
// ]
```

**Step 3: Display Results**
```tsx
function ResultsPage({ eventId }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    fetchResults(eventId).then(setResults);
  }, [eventId]);

  return (
    <div>
      <h1>Voting Results</h1>
      {results.map(r => (
        <div key={r.index}>
          <span>{r.text}</span>
          <span>{r.votes} votes</span>
          <progress value={r.votes} max={totalVotes} />
        </div>
      ))}
    </div>
  );
}
```

**Step 4: Verify Results (Optional)**
```typescript
// Anyone can verify results by:
// 1. Querying on-chain UTxO directly
// 2. Verifying datum signature
// 3. Checking transaction history

const txHistory = await provider.fetchAddressTxs(event.votingValidatorAddress);
const voteTxs = txHistory.filter(tx =>
  tx.redeemers.some(r => r.purpose === "SPEND" && r.index === urnaIndex)
);

// Count votes manually
let expectedTallies = initializeToZero(optionCount);
for (const tx of voteTxs) {
  const vote = extractVoteFromTx(tx);
  expectedTallies = applyVote(expectedTallies, vote);
}

// Compare with on-chain datum
assert(JSON.stringify(expectedTallies) === JSON.stringify(urnaDatum.options));
```

**Complete Tally Flow Diagram**:
```
User           Frontend         Backend          Blockchain
  │                │               │                  │
  │──(1) View results page─────────>│                 │
  │                │                │                  │
  │                │──Query UTxO─────────────────────>│
  │                │<─Urna UTxO──────────────────────────│
  │                │  (datum: options)                │
  │                │                │                  │
  │                │──Fetch texts────>│                │
  │                │<─option texts────│                │
  │                │                │                  │
  │                │──Merge data     │                  │
  │<──results──────│                │                  │
  │                │                │                  │
  │──(2) Display───>│                │                  │
  │                │                │                  │
  │──(3) Verify (optional)──────────────────────────>│
  │                │──Fetch tx history─────────────────>│
  │                │<─all vote transactions─────────────│
  │                │──Recompute tallies              │
  │                │──Compare with datum             │
  │<──verified─────│                │                  │
```

---

## Security Considerations

### 1. Cryptographic Security

**ZK-Proof Security**:
- **Curve**: BLS12-381 (128-bit security level)
- **Assumptions**: Discrete log hardness on BLS12-381
- **Quantum Resistance**: No (vulnerable to Shor's algorithm)

**Hash Functions**:
- **Poseidon**: ZK-friendly hash over BLS12-381 (used for commitments and nullifiers)
- **BLAKE2b**: Standard hash for signal integrity (used by Semaphore)

**Randomness**:
- Identity secrets: 32 bytes from crypto.getRandomValues() (CSPRNG)
- Admin tokens: 32 bytes from crypto.getRandomValues()

### 2. Smart Contract Security

**Common Vulnerabilities**:
| Vulnerability | Mitigation |
|---------------|-----------|
| **Double Spending** | NFT value preservation checks (input value == output value) |
| **Datum Tampering** | Critical fields (weight, event_date, semaphore_nft) preserved |
| **Time Manipulation** | Transaction validity range enforced (must be within event window) |
| **Replay Attacks** | External nullifier (unique per event), nullifier tree tracking |
| **Front-Running** | Not applicable (votes are encrypted in ZK-proof) |
| **Reentrancy** | Not applicable (UTxO model prevents reentrancy) |
| **Integer Overflow** | Aiken has arbitrary-precision integers |

**Formal Verification** (Future Work):
- Model voting logic in Coq or Isabelle
- Prove correctness of vote tallying
- Verify datum preservation properties

### 3. Privacy Guarantees

**What is Private**:
- Voter identity (hidden by ZK-proof)
- Link between identity and vote choice
- Voting patterns (cannot tell if same person voted in multiple events)

**What is Public**:
- Total vote counts per option
- Number of votes cast
- Nullifiers (but unlinkable to identities)
- Transaction metadata (timestamps, fees)

**Anonymity Set**:
- Anonymity set = all participants in group
- Larger group → stronger anonymity
- Recommendation: Minimum 10 participants for meaningful anonymity

### 4. Operational Security

**Key Management**:
| Key Type | Storage | Access Control |
|----------|---------|----------------|
| **Identity Secret** | Browser localStorage (encrypted) | User only |
| **Admin Token** | Backend database (hashed) | Event admin only |
| **Wallet Private Key** | Hardware wallet / browser extension | User only |

**Access Control**:
- **Event Creation**: Anyone with wallet
- **Participant Enrollment**: Admin token required
- **Event Deployment**: Admin token + wallet signature
- **Voting**: Any enrolled participant
- **Results Viewing**: Public (on-chain)

**Audit Trail**:
- All transactions recorded on-chain (immutable)
- Backend logs API requests (off-chain audit)
- Vote count history verifiable via transaction replay

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **Urna** | Latin for "ballot box"; the NFT representing a voting event on-chain |
| **Semaphore** | Zero-knowledge proof protocol for anonymous signaling/voting |
| **Commitment** | Poseidon hash of identity secret; public identifier for group membership |
| **Nullifier** | One-time-use cryptographic token derived from identity + event ID; prevents double voting |
| **Group Merkle Tree** | Incremental Merkle tree containing all participant commitments; root used in ZK-proof verification |
| **Nullifier Tree** | Sparse Merkle tree tracking used nullifiers; prevents double voting on-chain |
| **Signal Message** | CBOR-encoded vote data encrypted in Semaphore proof; passed to voting validator |
| **ZK-Proof** | Zero-knowledge SNARK proving group membership without revealing identity |
| **External Nullifier** | Event-specific identifier (event ID) preventing proof reuse across events |
| **MPF (Merkle Patricia Forestry)** | Sparse Merkle tree implementation for efficient nullifier tracking |
| **Datum** | On-chain data attached to UTxO; contains voting state (UrnaDatum) or group state (SemaphoreDatum) |
| **Redeemer** | Action parameter when spending UTxO; specifies action (Mint/Vote) or contains proof (SemaphoreRedeemer) |

### B. References

**Protocols & Standards**:
- [Semaphore Protocol](https://semaphore.appliedzkp.org/) - Original ZK-signaling protocol
- [BLS12-381 Curve](https://hackmd.io/@benjaminion/bls12-381) - Pairing-friendly elliptic curve
- [Groth16 SNARK](https://eprint.iacr.org/2016/260.pdf) - Efficient zero-knowledge proof system
- [Poseidon Hash](https://eprint.iacr.org/2019/458.pdf) - ZK-friendly hash function

**Cardano Documentation**:
- [Aiken Language Guide](https://aiken-lang.org/language-tour) - Smart contract language tutorial
- [Cardano Developer Portal](https://developers.cardano.org/) - Official docs
- [Plutus Documentation](https://plutus.readthedocs.io/) - Smart contract platform
- [CIP-0030](https://cips.cardano.org/cips/cip30/) - Wallet connector standard

**Libraries & Tools**:
- [modulo-p/cardano-semaphore](https://github.com/modulo-p/cardano-semaphore) - Semaphore implementation for Cardano
- [@zk-kit/incremental-merkle-tree](https://github.com/privacy-scaling-explorations/zk-kit) - Merkle tree library
- [MeshSDK](https://meshjs.dev/) - Cardano transaction builder
- [Blockfrost API](https://blockfrost.io/) - Blockchain query service

**Research Papers**:
- [ZK-SNARKs Under the Hood](https://medium.com/@VitalikButerin/zk-snarks-under-the-hood-b33151a013f6) - Introductory article by Vitalik Buterin
- [Anonymous Voting on Blockchain](https://eprint.iacr.org/2017/110.pdf) - Academic survey

### C. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-03 | Initial comprehensive specification document |

### D. Contact

**Project Repository**: https://github.com/TrustLevel/ZK-Voting-App
**Issue Tracker**: https://github.com/TrustLevel/ZK-Voting-App/issues
