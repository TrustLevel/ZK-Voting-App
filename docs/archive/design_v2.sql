-- ZK-Voting Application Database Schema
-- This schema supports a Cardano-based zero-knowledge voting system
-- with semaphore proofs and NFT authentication

-- =====================================================
-- CORE ENTITIES
-- =====================================================

-- Administrators who can create and manage voting events
CREATE TABLE administrators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address VARCHAR(128) NOT NULL UNIQUE, -- Cardano address
    public_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Voting events/ballots
CREATE TABLE voting_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    admin_id UUID NOT NULL REFERENCES administrators(id),
    voting_type VARCHAR(20) NOT NULL CHECK (voting_type IN ('simple', 'weighted')),
    weight_value INTEGER DEFAULT 0, -- 0 for simple, >0 for weighted
    start_timestamp BIGINT NOT NULL, -- Unix timestamp
    end_timestamp BIGINT NOT NULL, -- Unix timestamp
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'finalized')),
    
    -- On-chain references
    voting_nft_policy_id VARCHAR(64), -- Voting validator NFT policy ID
    group_nft_policy_id VARCHAR(64), -- Group validator NFT policy ID  
    semaphore_nft_policy_id VARCHAR(64), -- Semaphore validator NFT policy ID
    utxo_reference VARCHAR(128), -- Initial UTxO reference for uniqueness
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_time_window CHECK (start_timestamp < end_timestamp)
);

-- Voting options for each event
CREATE TABLE voting_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL, -- Must be sequential (0,1,2...)
    option_text VARCHAR(500) NOT NULL,
    vote_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(event_id, option_index),
    CONSTRAINT non_negative_votes CHECK (vote_count >= 0)
);

-- =====================================================
-- USER MANAGEMENT & AUTHENTICATION
-- =====================================================

-- Registered users who can vote
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    registration_token VARCHAR(128), -- Token from registration link
    identity_secret_hash VARCHAR(128), -- Hash of user's identity secret
    nullifier_secret_hash VARCHAR(128), -- Hash of user's nullifier secret
    commitment_hash VARCHAR(128), -- User's commitment for merkle tree
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_verified BOOLEAN DEFAULT false
);

-- Group membership for voting events
CREATE TABLE group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merkle_leaf_index INTEGER, -- Position in merkle tree
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(event_id, user_id),
    UNIQUE(event_id, merkle_leaf_index)
);

-- Merkle tree structure for voter groups
CREATE TABLE merkle_trees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
    tree_depth INTEGER NOT NULL,
    root_hash VARCHAR(128) NOT NULL,
    total_leaves INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(event_id) -- One tree per voting event
);

-- Individual merkle tree nodes for proof generation
CREATE TABLE merkle_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tree_id UUID NOT NULL REFERENCES merkle_trees(id) ON DELETE CASCADE,
    level INTEGER NOT NULL, -- 0 is leaf level
    position INTEGER NOT NULL, -- Position at this level
    hash_value VARCHAR(128) NOT NULL,
    
    UNIQUE(tree_id, level, position)
);

-- =====================================================
-- VOTING & CRYPTOGRAPHIC PROOFS
-- =====================================================

-- Vote submissions with zero-knowledge proofs
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id),
    
    -- ZK Proof components
    groth16_proof JSONB NOT NULL, -- Serialized Groth16 proof
    mpf_proof JSONB NOT NULL, -- Serialized MPF proof
    nullifier_hash VARCHAR(128) NOT NULL, -- Prevents double voting
    signal_hash VARCHAR(128) NOT NULL, -- Hash of vote signal
    signal_message BYTEA NOT NULL, -- Encrypted vote choices
    
    -- Vote processing
    vote_choices JSONB, -- Deserialized vote [(option_index, weight), ...]
    processed_at TIMESTAMP,
    
    -- On-chain tracking
    transaction_hash VARCHAR(128), -- Cardano transaction hash
    block_height BIGINT,
    
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(event_id, nullifier_hash) -- Prevent double voting
);

-- Nullifier tracking to prevent double voting across the system
CREATE TABLE nullifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id),
    nullifier_hash VARCHAR(128) NOT NULL,
    vote_id UUID NOT NULL REFERENCES votes(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(event_id, nullifier_hash)
);

-- =====================================================
-- ON-CHAIN STATE TRACKING
-- =====================================================

-- Track UTxO states for each validator
CREATE TABLE validator_utxos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id),
    validator_type VARCHAR(20) NOT NULL CHECK (validator_type IN ('voting', 'group', 'semaphore')),
    utxo_reference VARCHAR(128) NOT NULL, -- TxHash#OutputIndex
    policy_id VARCHAR(64) NOT NULL,
    asset_name VARCHAR(128) NOT NULL,
    ada_amount BIGINT NOT NULL,
    datum_cbor BYTEA, -- CBOR-encoded datum
    datum_json JSONB, -- Human-readable datum
    is_spent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    spent_at TIMESTAMP,
    
    UNIQUE(utxo_reference)
);

-- Transaction tracking for audit trail
CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES voting_events(id),
    tx_hash VARCHAR(128) NOT NULL UNIQUE,
    tx_type VARCHAR(20) NOT NULL CHECK (tx_type IN ('mint', 'vote', 'finalize')),
    block_height BIGINT,
    block_hash VARCHAR(128),
    slot_number BIGINT,
    timestamp TIMESTAMP,
    fee_lovelace BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- AUDIT & LOGGING
-- =====================================================

-- System audit log for all significant actions
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES voting_events(id),
    user_id UUID REFERENCES users(id),
    admin_id UUID REFERENCES administrators(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Error tracking for debugging and monitoring
CREATE TABLE error_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES voting_events(id),
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB,
    stack_trace TEXT,
    request_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Voting events
CREATE INDEX idx_voting_events_admin ON voting_events(admin_id);
CREATE INDEX idx_voting_events_status ON voting_events(status);
CREATE INDEX idx_voting_events_timestamps ON voting_events(start_timestamp, end_timestamp);

-- Voting options
CREATE INDEX idx_voting_options_event ON voting_options(event_id);
CREATE INDEX idx_voting_options_index ON voting_options(event_id, option_index);

-- Group memberships
CREATE INDEX idx_group_memberships_event ON group_memberships(event_id);
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id);

-- Votes
CREATE INDEX idx_votes_event ON votes(event_id);
CREATE INDEX idx_votes_nullifier ON votes(nullifier_hash);
CREATE INDEX idx_votes_submitted ON votes(submitted_at);

-- Nullifiers
CREATE INDEX idx_nullifiers_event ON nullifiers(event_id);
CREATE INDEX idx_nullifiers_hash ON nullifiers(nullifier_hash);

-- UTxOs
CREATE INDEX idx_validator_utxos_event ON validator_utxos(event_id);
CREATE INDEX idx_validator_utxos_type ON validator_utxos(validator_type);
CREATE INDEX idx_validator_utxos_policy ON validator_utxos(policy_id);

-- Audit logs
CREATE INDEX idx_audit_log_event ON audit_log(event_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_error_log_created ON error_log(created_at);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Current vote tallies for active events
CREATE VIEW current_vote_tallies AS
SELECT 
    ve.id as event_id,
    ve.name as event_name,
    vo.option_index,
    vo.option_text,
    vo.vote_count,
    ve.status
FROM voting_events ve
JOIN voting_options vo ON ve.id = vo.event_id
WHERE ve.status IN ('active', 'closed')
ORDER BY ve.id, vo.option_index;

-- Event participation statistics
CREATE VIEW event_participation AS
SELECT 
    ve.id as event_id,
    ve.name as event_name,
    COUNT(gm.user_id) as total_eligible_voters,
    COUNT(DISTINCT v.nullifier_hash) as total_votes_cast,
    ROUND(
        (COUNT(DISTINCT v.nullifier_hash)::decimal / NULLIF(COUNT(gm.user_id), 0)) * 100, 2
    ) as participation_percentage,
    ve.status
FROM voting_events ve
LEFT JOIN group_memberships gm ON ve.id = gm.event_id
LEFT JOIN votes v ON ve.id = v.event_id AND v.processed_at IS NOT NULL
GROUP BY ve.id, ve.name, ve.status;

-- User voting history (anonymized)
CREATE VIEW user_voting_history AS
SELECT 
    u.id as user_id,
    u.email,
    COUNT(gm.event_id) as events_eligible,
    COUNT(v.id) as votes_cast,
    u.registration_date
FROM users u
LEFT JOIN group_memberships gm ON u.id = gm.user_id
LEFT JOIN voting_events ve ON gm.event_id = ve.id
LEFT JOIN votes v ON ve.id = v.event_id 
    AND EXISTS (
        SELECT 1 FROM nullifiers n 
        WHERE n.event_id = ve.id 
        AND n.vote_id = v.id
        AND n.nullifier_hash = v.nullifier_hash
    )
GROUP BY u.id, u.email, u.registration_date;

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update vote tallies when votes are processed
CREATE OR REPLACE FUNCTION update_vote_tallies()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if vote is being marked as processed
    IF NEW.processed_at IS NOT NULL AND OLD.processed_at IS NULL THEN
        -- Update vote counts based on vote choices
        UPDATE voting_options vo
        SET vote_count = vote_count + COALESCE((NEW.vote_choices->>vo.option_index::text)::integer, 0)
        WHERE vo.event_id = NEW.event_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update vote tallies
CREATE TRIGGER trigger_update_vote_tallies
    AFTER UPDATE ON votes
    FOR EACH ROW
    EXECUTE FUNCTION update_vote_tallies();

-- Function to automatically update timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps on voting_events
CREATE TRIGGER trigger_voting_events_updated_at
    BEFORE UPDATE ON voting_events
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- =====================================================
-- INITIAL DATA & CONSTRAINTS
-- =====================================================

-- Add some constraint checks
ALTER TABLE voting_options ADD CONSTRAINT sequential_option_indices 
    CHECK (option_index >= 0);

-- Ensure vote choices are valid JSON arrays
ALTER TABLE votes ADD CONSTRAINT valid_vote_choices
    CHECK (vote_choices IS NULL OR jsonb_typeof(vote_choices) = 'array');