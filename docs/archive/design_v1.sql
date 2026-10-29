-- SQLite3 Database Schema for Voting System
-- Updated: 2025-11-11
-- Reflects backend TypeScript entity structure with Cardano wallet authentication

-- User Table - Supports both email and wallet authentication
CREATE TABLE User (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT UNIQUE,  -- Nullable for wallet-only users
    wallet_address TEXT UNIQUE,  -- Nullable for email-only users  
    event_permissions TEXT NOT NULL DEFAULT '[]',  -- Stored as JSON: [event_id, ...]
    nonces TEXT NOT NULL DEFAULT '[]'  -- Stored as JSON: [nonce_string, ...] for wallet authentication
);

-- Voting Event Table - Updated with nullable fields and participant management
CREATE TABLE VotingEvent (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    
    -- Voting configuration (can be null during initial creation)
    voting_nft TEXT,
    voting_validator_address TEXT,
    voting_power INTEGER,
    options TEXT,  -- Stored as JSON: vote options
    admin_user_id INTEGER,
    starting_date INTEGER,  -- POSIX timestamp
    ending_date INTEGER,    -- POSIX timestamp
    
    -- Group configuration (can be null during initial creation)
    group_nft TEXT,
    group_validator_address TEXT,
    
    -- Required group fields (always populated)
    group_merkle_root_hash TEXT NOT NULL,
    group_leaf_commitments TEXT NOT NULL DEFAULT '[]',  -- Stored as JSON: [{userId: number, commitment: string}, ...] - merged participants and commitments
    group_size INTEGER NOT NULL,
    
    -- Semaphore configuration (can be null during initial creation)
    semaphore_nft TEXT,
    semaphore_address TEXT,
    nullifier_merkle_tree TEXT,
    nullifier_leaf_commitments TEXT DEFAULT '[]',  -- Stored as JSON: [nullifier_commitment, ...]
    verification_reference_input TEXT,
    current_vote_count TEXT,  -- Stored as JSON: vote tallies
    
    FOREIGN KEY (admin_user_id) REFERENCES User(user_id) ON DELETE SET NULL
);

-- Indexes for performance optimization
CREATE INDEX idx_user_email ON User(user_email);
CREATE INDEX idx_user_wallet ON User(wallet_address);
CREATE INDEX idx_voting_admin ON VotingEvent(admin_user_id);
CREATE INDEX idx_voting_dates ON VotingEvent(starting_date, ending_date);

-- Comments on key changes made:
-- 1. User table: Added wallet_address and nonces fields for Cardano wallet authentication
-- 2. User table: Made user_email nullable to support wallet-only users
-- 3. VotingEvent table: Made most fields nullable for flexible event creation
-- 4. VotingEvent table: Removed separate participants field - now merged with group_leaf_commitments
-- 5. group_leaf_commitments: Now stores [{userId, commitment}] objects instead of separate arrays
-- 6. Foreign key: Changed to SET NULL instead of CASCADE to handle optional admin_user_id