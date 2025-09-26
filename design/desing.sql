-- SQLite3 Database Schema for Voting System
-- Created: 2025-09-26

-- User Table
CREATE TABLE User (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL UNIQUE,
    event_permissions TEXT NOT NULL DEFAULT '[]'  -- Stored as JSON: [(event_id, commitment_hash), ...] where commitment_hash is null if not committed yet
);

-- Voting Event Table
CREATE TABLE VotingEvent (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    voting_nft TEXT NOT NULL,
    voting_validator_address TEXT NOT NULL,
    voting_power INTEGER NOT NULL,
    options TEXT NOT NULL,  -- Stored as JSON: [(int, int, string), ...]
    admin_user_id INTEGER NOT NULL,
    starting_date INTEGER NOT NULL,  -- POSIX timestamp
    ending_date INTEGER NOT NULL,    -- POSIX timestamp
    group_nft TEXT NOT NULL,
    group_validator_address TEXT NOT NULL,
    group_merkle_root_hash TEXT NOT NULL,
    group_leaf_commitments TEXT NOT NULL DEFAULT '[]',  -- Stored as JSON: [commitment_hash, ...] collection of leaf commitments to reconstruct merkle tree
    group_size INTEGER NOT NULL,
    semaphore_nft TEXT NOT NULL,
    semaphore_address TEXT NOT NULL,
    nullifier_merkle_tree TEXT NOT NULL,
    nullifier_leaf_commitments TEXT NOT NULL DEFAULT '[]',  -- Stored as JSON: [nullifier_commitment, ...] collection of nullifier commitments to construct nullifier root hash
    verification_reference_input TEXT NOT NULL,
    current_vote_count TEXT NOT NULL,  -- Stored as JSON: [(int, int, string), ...]
    FOREIGN KEY (admin_user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX idx_user_email ON User(user_email);
CREATE INDEX idx_voting_admin ON VotingEvent(admin_user_id);
CREATE INDEX idx_voting_dates ON VotingEvent(starting_date, ending_date);