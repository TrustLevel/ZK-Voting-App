# ZK-Voting-App System Design Document

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Components](#components)
5. [Data Flow](#data-flow)
6. [Security Features](#security-features)
7. [Database Schema](#database-schema)
8. [API Design](#api-design)
9. [Smart Contract Design](#smart-contract-design)
10. [Deployment Architecture](#deployment-architecture)

---

## System Overview

### Purpose
ZK-Voting-App is a decentralized, privacy-preserving voting system built on the Cardano blockchain. It leverages zero-knowledge proofs (specifically the Semaphore protocol) to enable anonymous voting while maintaining vote integrity and preventing double-voting.

### Key Features
- **Anonymous Voting**: Uses Semaphore ZK-proofs to hide voter identity
- **On-Chain Verification**: All votes are verified and recorded on Cardano blockchain
- **Flexible Voting**: Supports both simple (one vote per option) and weighted voting
- **Time-Bound Events**: Voting events have enforced start and end times
- **Nullifier-Based Protection**: Prevents double-voting through cryptographic nullifiers
- **Wallet-Based Authentication**: Users authenticate via Cardano wallet signatures

### Target Users
- **Event Organizers**: Create and manage voting events
- **Voters**: Cast anonymous votes within authorized voting groups
- **Auditors**: Verify vote integrity on-chain

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                           │
│                  (Next.js 15 + React 19)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Create Page │  │  Manage Page │  │  Vote Page   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                    ┌───────┴────────┐
                    │  MeshSDK (Web3)│
                    └───────┬────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────┐
│ Backend Layer │  │ Transaction Layer│  │ Cardano Node │
│  (NestJS API) │  │  (tx builders)   │  │              │
└───────┬───────┘  └─────────────────┘  └──────────────┘
        │                                        │
        ▼                                        ▼
┌───────────────┐                    ┌─────────────────────┐
│  SQLite DB    │                    │  Smart Contracts    │
│  (Off-chain)  │                    │  (Aiken Validators) │
└───────────────┘                    └─────────────────────┘
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │  Cardano Blockchain │
                                    │  (Immutable Ledger) │
                                    └─────────────────────┘
```

### Architecture Principles

1. **Separation of Concerns**: Frontend, backend, smart contracts, and transaction builders are independent
2. **Off-Chain/On-Chain Hybrid**: Database stores event metadata, blockchain stores votes and verification data
3. **Zero-Knowledge Privacy**: Voter identities are cryptographically hidden using Semaphore
4. **Wallet-First**: Authentication and authorization via Cardano wallet signatures
5. **Event-Driven**: Voting events have distinct lifecycle stages (creation → participant enrollment → voting → results)

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.5.4 | React framework with SSR/SSG |
| React | 19.1.0 | UI component library |
| TypeScript | ^5 | Type-safe JavaScript |
| TailwindCSS | ^4 | Utility-first CSS framework |
| MeshSDK | 1.9.0-beta | Cardano wallet integration |
| React DatePicker | ^8.8.0 | Date/time selection for events |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| NestJS | ^11.0.1 | Node.js API framework |
| TypeORM | ^0.3.27 | ORM for database operations |
| SQLite3 | ^5.1.7 | Embedded relational database |
| JWT | ^11.0.1 | JSON Web Tokens for auth |
| MeshSDK Core | ^1.8.14 | Cardano transaction building |
| modp-semaphore-bls12381 | github:main | Semaphore ZK-proof library |
| @zk-kit/incremental-merkle-tree | ^1.1.0 | Merkle tree for group management |
| poseidon-bls12381 | ^1.0.2 | Poseidon hash function |

### On-Chain
| Technology | Purpose |
|------------|---------|
| Aiken | Smart contract language for Cardano |
| Plutus | Cardano's smart contract platform |
| Cardano Node | Blockchain interaction |

### Development Tools
- **npm/node**: Package management
- **TypeScript**: Static typing
- **ESLint/Prettier**: Code quality and formatting
- **Jest**: Unit testing

---

## Components

### 1. Frontend (`src/frontend`)

#### Pages
- **`/` (Home)**: Landing page with app overview
- **`/create`**: Event creation with configuration (voting type, options, power)
- **`/manage/[eventId]`**: Event management dashboard with tabs:
  - **Parameters Tab**: Read-only display of voting configuration
  - **Participants Tab**: Add/remove participants, manage commitments
  - **Start Tab**: Set event dates and deploy on-chain contracts
- **`/join`**: Join a voting event as a participant
- **`/event/[id]`**: Vote casting interface for participants
- **`/info`**: Documentation and help

#### Key Components
- **WalletProvider** (`providers/wallet-provider.tsx`): MeshSDK wallet context
- **Navigation**: Header with wallet connection
- **Forms**: Event creation, participant management, vote casting

#### Frontend Responsibilities
- Wallet connection and authentication
- User interface for event lifecycle
- Generate Semaphore commitments and proofs (client-side)
- Build and submit Cardano transactions via MeshSDK
- Display voting results and event status

### 2. Backend (`src/backend`)

#### Modules

**App Module** (`app.module.ts`)
- Root module
- Imports: UsersModule, VotingEventModule, AuthModule
- Database connection configuration

**Auth Module** (`auth/`)
- Wallet signature verification
- JWT token generation
- Nonce management for replay protection

**Users Module** (`users/`)
- User entity management
- Wallet address registration
- Event permissions

**Voting Event Module** (`voting-event/`)
- Event CRUD operations
- Participant management
- Group Merkle tree updates
- Nullifier tracking

#### Key Services

**VotingEventService** (`voting-event.service.ts`)
- `createBasicVotingEvent()`: Initialize event with config
- `addParticipant()`: Add user to event, update Merkle tree
- `removeParticipant()`: Remove user from event
- `updateVotingEventDates()`: Set start/end times
- `getEventResults()`: Retrieve vote tallies

**UsersService** (`users.service.ts`)
- `findOrCreateUserByWallet()`: Register or retrieve user
- `verifyWalletSignature()`: Authenticate wallet ownership

#### Backend Responsibilities
- Off-chain event metadata storage
- Participant group management (Merkle tree)
- API endpoints for frontend
- Data validation and business logic
- Generate admin tokens for event management

### 3. On-Chain Smart Contracts (`src/on-chain`)

#### Validators

**Voting Validator** (`validators/voting.ak`)
- **Mint Function**: Creates unique voting event NFT (Urna)
  - Validates one-shot minting
  - Initializes vote counts to zero
  - Enforces time bounds (minting before event start)
- **Spend Function**: Processes votes
  - Verifies Semaphore ZK-proof
  - Updates vote tallies
  - Enforces time bounds (voting within event window)
  - Supports simple and weighted voting

**Semaphore Validator** (referenced via `semaphore_nft`)
- Verifies zero-knowledge proofs
- Prevents double-voting via nullifiers
- Validates group membership

#### Smart Contract Data Structures

**UrnaDatum** (Voting Event State)
```aiken
pub type UrnaDatum {
  weight: Int,              // Vote weight (1 = simple, >1 = weighted)
  options: Options,         // List of {index, text, votes}
  event_date: (Int, Int),   // (start_time, end_time)
  semaphore_nft: PolicyId,  // Link to Semaphore validator
}
```

**UrnaRedeemer** (Actions)
```aiken
pub type UrnaRedeemer {
  Mint  // Create voting event
  Vote  // Cast a vote
}
```

#### On-Chain Responsibilities
- Immutable vote recording
- ZK-proof verification (via Semaphore)
- Time-bound enforcement
- Vote tally computation
- Prevent double-voting and fraud

### 4. Transaction Layer (`src/tx`)

#### Purpose
Build and submit Cardano transactions for:
- Minting voting event NFTs
- Deploying validator scripts
- Casting votes (spending Semaphore + Voting NFTs)
- Querying on-chain state

#### Transaction Types
1. **Event Creation TX**: Mint Urna NFT, lock at script address
2. **Semaphore Setup TX**: Deploy Semaphore validator, mint group NFT
3. **Vote TX**: Spend Semaphore NFT (with ZK-proof), update Urna datum
4. **Query TX**: Read current vote counts from on-chain datum

---

## Data Flow

### Event Creation Flow

```
1. User (Frontend)
   ↓ Connect Wallet
2. POST /users/wallet → Backend
   ↓ Create/Retrieve User
3. Frontend: Fill event form (name, options, votingPower)
   ↓ Submit
4. POST /voting-event → Backend
   ↓ Create Event Record (with zero Merkle root)
   ↓ Return eventId + adminToken
5. Frontend: Redirect to /manage/:eventId?adminToken=xxx
```

### Participant Enrollment Flow

```
1. Event Admin (Frontend /manage)
   ↓ Add participant wallet address
2. POST /voting-event/:eventId/participants
   ↓ Backend: Generate Semaphore commitment
   ↓ Update groupLeafCommitments
   ↓ Recompute groupMerkleRootHash
3. Backend: Return updated participant list
4. Frontend: Display participants
```

### Vote Casting Flow

```
1. Voter (Frontend /event/:id)
   ↓ Connect Wallet
   ↓ Select vote options
2. Frontend: Generate Semaphore ZK-proof (client-side)
   - Inputs: identity, vote, group Merkle tree, nullifier
   - Outputs: zk_proof, nullifier, signal_hash, encrypted_vote
3. Frontend: Build Cardano transaction
   - Spend: Semaphore NFT (redeemer = ZK-proof)
   - Spend: Voting NFT (redeemer = Vote)
   - Output: Updated Urna datum (incremented vote counts)
4. Submit TX to Cardano Node
   ↓ On-chain validation
5. Smart Contract: Verify ZK-proof, update votes
6. Blockchain: Record transaction immutably
7. Frontend: Poll for TX confirmation, display success
```

### Results Retrieval Flow

```
1. Frontend: GET /voting-event/:eventId
   ↓ Backend: Query database for event metadata
2. Frontend: Query on-chain Urna datum
   ↓ Read current vote counts from blockchain
3. Frontend: Display results with option texts
```

---

## Security Features

### 1. Zero-Knowledge Proofs (Semaphore)

**How It Works:**
- Each voter generates a Semaphore identity (private key)
- Identity commitment is added to the group Merkle tree
- When voting, user proves group membership WITHOUT revealing identity
- Nullifier prevents the same identity from voting twice

**Security Properties:**
- **Anonymity**: No link between voter identity and vote choice
- **Unlinkability**: Cannot link multiple votes to same voter
- **Unforgeability**: Only group members can generate valid proofs
- **Non-repudiation**: Votes cannot be altered or deleted on-chain

### 2. Wallet Authentication

**Nonce-Based Challenge-Response:**
- Backend generates random nonce
- User signs nonce with wallet private key
- Backend verifies signature matches wallet address
- Nonce is single-use to prevent replay attacks

**Benefits:**
- No password storage
- Cryptographic proof of wallet ownership
- Resistant to phishing (signature is domain-bound)

### 3. On-Chain Security

**Smart Contract Validations:**
- **One-Shot Minting**: Unique UTxO ensures only one voting NFT per event
- **Value Preservation**: NFT must be returned to script after vote
- **Time Bounds**: Votes only accepted within event window
- **Datum Integrity**: Critical fields (weight, dates) cannot be modified
- **ZK-Proof Verification**: Delegated to Semaphore validator

**Immutability:**
- Votes recorded on blockchain cannot be altered
- Full audit trail of all voting transactions
- Public verifiability of results

### 4. Admin Access Control

**Admin Tokens:**
- Random 256-bit token generated at event creation
- Required for sensitive operations (add participants, start event)
- Stored securely in database, never exposed in URLs after initial redirect

**Permissions:**
- Only admin can modify event parameters
- Only admin can add/remove participants
- Voting is open to all enrolled participants

### 5. Data Privacy

**Off-Chain:**
- User wallet addresses stored but not linked to votes
- Participant commitments are hashed (no identity revelation)
- Admin tokens are hashed in database

**On-Chain:**
- Only vote tallies are public
- Voter identities are cryptographically hidden
- Nullifiers are one-way hashes (cannot reverse to identity)

---

## Database Schema

### User Table
```sql
CREATE TABLE User (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT UNIQUE,           -- Nullable (wallet-only users)
    wallet_address TEXT UNIQUE,       -- Cardano wallet address
    event_permissions TEXT NOT NULL DEFAULT '[]',  -- JSON: [eventId, ...]
    nonces TEXT NOT NULL DEFAULT '[]'  -- JSON: [nonce, ...] for auth
);
```

**Indexes:**
- `idx_user_email ON User(user_email)`
- `idx_user_wallet ON User(wallet_address)`

### VotingEvent Table
```sql
CREATE TABLE VotingEvent (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,

    -- Voting configuration
    voting_nft TEXT,                   -- Policy ID of Urna NFT
    voting_validator_address TEXT,     -- Script address
    voting_power INTEGER,              -- 1 = simple, >1 = weighted
    options TEXT,                      -- JSON: [{index, text, votes}, ...]
    admin_user_id INTEGER,
    admin_token TEXT UNIQUE,           -- Secret token for admin access
    starting_date INTEGER,             -- POSIX timestamp (ms)
    ending_date INTEGER,               -- POSIX timestamp (ms)

    -- Group configuration
    group_nft TEXT,                    -- Policy ID of group NFT
    group_validator_address TEXT,      -- Group script address
    group_merkle_root_hash TEXT NOT NULL,  -- Root hash of participant tree
    group_leaf_commitments TEXT NOT NULL DEFAULT '[]',  -- JSON: [{userId, commitment}, ...]
    group_size INTEGER NOT NULL,       -- Max participants

    -- Semaphore configuration
    semaphore_nft TEXT,                -- Policy ID of Semaphore NFT
    semaphore_address TEXT,            -- Semaphore script address
    nullifier_merkle_tree TEXT,        -- Nullifier tree state
    nullifier_leaf_commitments TEXT DEFAULT '[]',  -- JSON: [nullifier, ...]
    verification_reference_input TEXT, -- Reference input for ZK verification
    current_vote_count TEXT,           -- JSON: vote tallies (mirrored from on-chain)

    FOREIGN KEY (admin_user_id) REFERENCES User(user_id) ON DELETE SET NULL
);
```

**Indexes:**
- `idx_voting_admin ON VotingEvent(admin_user_id)`
- `idx_voting_dates ON VotingEvent(starting_date, ending_date)`

**Field Notes:**
- `options`, `group_leaf_commitments`, `nullifier_leaf_commitments` stored as JSON strings
- Most fields nullable during initial creation, populated when event is deployed on-chain
- `group_merkle_root_hash` initialized with zero-value Merkle root
- `admin_token` is a cryptographically secure random string

---

## API Design

### Authentication

All protected endpoints require JWT token or admin token.

**Headers:**
```
Authorization: Bearer <jwt_token>
X-Admin-Token: <admin_token>
```

### Endpoints

#### User Management

**POST `/users/wallet`**
- **Description**: Register or retrieve user by wallet address
- **Request Body**:
  ```json
  {
    "walletAddress": "addr1..."
  }
  ```
- **Response**:
  ```json
  {
    "userId": 123,
    "walletAddress": "addr1..."
  }
  ```

#### Event Management

**POST `/voting-event`**
- **Description**: Create new voting event
- **Request Body**:
  ```json
  {
    "eventName": "Board Election 2025",
    "options": ["Alice", "Bob", "Charlie"],
    "votingPower": 100,
    "adminUserId": 123,
    "startingDate": 1735689600000,  // Optional
    "endingDate": 1735776000000     // Optional
  }
  ```
- **Response**:
  ```json
  {
    "eventId": 456,
    "eventName": "Board Election 2025",
    "adminToken": "abc123...",
    "options": "[{\"index\":0,\"text\":\"Alice\",\"votes\":0},...]",
    "votingPower": 100,
    "groupMerkleRootHash": "0x...",
    "groupSize": 20,
    ...
  }
  ```

**GET `/voting-event/:eventId`**
- **Description**: Retrieve event details
- **Response**: Full event object

**PATCH `/voting-event/:eventId`**
- **Description**: Update event dates
- **Request Body**:
  ```json
  {
    "startingDate": 1735689600000,
    "endingDate": 1735776000000
  }
  ```
- **Response**: Updated event object

#### Participant Management

**POST `/voting-event/:eventId/participants`**
- **Description**: Add participant to event
- **Headers**: `X-Admin-Token: <token>`
- **Request Body**:
  ```json
  {
    "userId": 789,
    "commitment": "0x..."  // Semaphore identity commitment
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "groupMerkleRootHash": "0x...",  // Updated root
    "participantCount": 5
  }
  ```

**DELETE `/voting-event/:eventId/participants/:userId`**
- **Description**: Remove participant from event
- **Headers**: `X-Admin-Token: <token>`
- **Response**:
  ```json
  {
    "success": true,
    "groupMerkleRootHash": "0x...",  // Updated root
    "participantCount": 4
  }
  ```

**GET `/voting-event/:eventId/participants`**
- **Description**: List all participant user IDs
- **Response**:
  ```json
  [789, 790, 791, 792, 793]
  ```

---

## Smart Contract Design

See smart_contract_specification.md document!

---

## Deployment Architecture

### Development Environment

**Local Setup:**
```
Frontend: http://localhost:3000
Backend: http://localhost:3001
Cardano Node: Testnet (Preview or Preprod)
Database: ./backend.db (SQLite)
```

**Run Commands:**
```bash
# Backend
cd src/backend
npm run start:dev

# Frontend
cd src/frontend
npm run dev

# On-Chain (compile contracts)
cd src/on-chain
aiken build
```

### Production Environment

**Deployment Options:**

1. **Frontend**: Vercel / Netlify (Next.js SSR)
2. **Backend**: AWS EC2 / Heroku / DigitalOcean (NestJS API)
3. **Database**: PostgreSQL (production) or SQLite (lightweight)
4. **Blockchain**: Cardano Mainnet

**Environment Variables:**
```env
# Backend
DATABASE_URL=postgresql://...
JWT_SECRET=<secret>
CARDANO_NETWORK=mainnet
BLOCKFROST_API_KEY=<key>

# Frontend
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_CARDANO_NETWORK=mainnet
```

### Infrastructure Diagram

```
┌─────────────────────┐
│   Users (Browser)   │
└──────────┬──────────┘
           │
   ┌───────┴────────┐
   │   CDN (Vercel) │
   │   Frontend     │
   └───────┬────────┘
           │
   ┌───────┴────────┐
   │   API Gateway  │
   │   (Load Bal.)  │
   └───────┬────────┘
           │
   ┌───────┴────────┐
   │  Backend (EC2) │
   │  NestJS API    │
   └───────┬────────┘
           │
   ┌───────┴────────┐
   │  PostgreSQL    │
   │  (RDS/Managed) │
   └────────────────┘

Separate Path:
Users → MeshSDK → Cardano Node → Blockchain
                  (Blockfrost API)
```
---

## Appendix

### Glossary

- **Urna**: Latin for "ballot box", the NFT representing a voting event
- **Semaphore**: Zero-knowledge proof protocol for anonymous signaling
- **Nullifier**: One-time-use cryptographic token to prevent double-voting
- **Commitment**: Hash of voter's identity, added to group Merkle tree
- **Merkle Root**: Single hash representing all group members
- **Datum**: On-chain data attached to UTxO
- **Redeemer**: Action parameter when spending a UTxO
- **Validator**: Smart contract that validates transactions

### References

- [Aiken Documentation](https://aiken-lang.org/)
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Semaphore Protocol](https://semaphore.appliedzkp.org/)
- [MeshSDK](https://meshjs.dev/)
- [NestJS Documentation](https://nestjs.com/)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-26
**Maintained By**: ZK-Voting-App Development Team
