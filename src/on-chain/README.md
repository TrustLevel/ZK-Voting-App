# ZK-Voting-App

A decentralized zero-knowledge voting application built on Cardano using the Aiken smart contract language. This project implements a secure voting system that leverages cryptographic proofs and NFTs for vote authentication while maintaining voter privacy.

## 🎯 Overview

The ZK-Voting-App enables creation and participation in voting events on the Cardano blockchain. It uses zero-knowledge proofs through semaphore NFTs to ensure vote authenticity while preserving voter anonymity. The system supports both simple voting (one vote per option) and weighted voting scenarios.

### Key Features

- **Privacy-Preserving**: Zero-knowledge proofs ensure voter anonymity
- **NFT-Authenticated**: Semaphore NFTs validate voting rights without revealing identity  
- **Dual Voting Modes**: Support for simple and weighted voting systems
- **Time-Bounded**: Configurable voting periods with strict temporal validation
- **Tamper-Resistant**: Immutable vote tallies stored on-chain
- **Comprehensive Testing**: 600+ test cases ensuring system reliability

## 🏗️ Architecture

### Smart Contract Components

**Main Validator** (`validators/voting.ak`)
- **Mint Endpoint**: Creates voting NFTs and initializes voting events
- **Spend Endpoint**: Processes votes using ZK proof authentication

**Core Libraries** (`lib/`)
- **types.ak**: Data type definitions for voting structures
- **utilities.ak**: Validation and vote processing functions
- **tests/utilities_test.ak**: Comprehensive test suite

### Data Structures

```aiken
// Voting event configuration
UrnaDatum {
  weight: Int,                    // 0 for simple voting, >0 for weighted
  options: List<(Int,Int)>,      // (option_index, vote_count) pairs
  event_date: (Int, Int),        // (start_time, end_time)
  semaphore_nft: PolicyId        // ZK proof NFT policy
}

// Vote casting actions
UrnaRedeemer {
  Mint  // Create new voting event
  Vote  // Cast a vote
}
```

### Voting Process

1. **Event Creation** (Mint):
   - Consume unique UTxO for event ID
   - Create voting NFT sent to script address
   - Initialize vote counts to zero
   - Set voting time boundaries

2. **Vote Casting** (Spend):
   - Validate semaphore NFT with ZK proof
   - Deserialize vote signal from proof
   - Update vote tallies atomically
   - Preserve all voting event data

## 🚀 Quick Start

### Prerequisites

- [Aiken](https://aiken-lang.org) v1.1.15 or later
- Cardano testnet access
- Basic understanding of Plutus smart contracts

### Installation

1. Clone the repository:
```bash
git clone https://github.com/agustinbadi/zk-voting-app.git
cd zk-voting-app
```

2. Build the project:
```bash
aiken build
```

3. Run tests to verify installation:
```bash
aiken check
```

## 🔧 Development

### Building

Compile smart contracts and generate Plutus scripts:
```bash
aiken build
```

The compiled scripts will be available in the `build/` directory.

### Testing

Run the complete test suite:
```bash
aiken check
```

Run specific test patterns:
```bash
aiken check -m utilities        # Run utilities tests
aiken check -m "vote_"          # Run voting-related tests
aiken check -m "iiw_"           # Run interval validation tests
```

### Documentation Generation

Generate HTML documentation:
```bash
aiken docs
```

View documentation by opening `docs/index.html` in your browser.

## 📋 Validation Logic

### Vote Initialization

- **Unique Event ID**: Each voting event requires consuming a unique UTxO
- **Sequential Indexing**: Options must be indexed 0, 1, 2, ... sequentially
- **Zero Initialization**: All vote counts must start at zero
- **Time Validation**: Start time must be before end time and in the future

#### Abstain Option Convention

**Application-Level Business Rule**: Option 0 is conventionally reserved for "Abstain" votes. This allows voters to participate without selecting a specific voting option.

**Important Notes**:
- This is an **application-level convention**, NOT enforced by the smart contract
- The validator accepts any number of options (including just one)
- Frontend implementations should enforce minimum 2 options: option 0 (abstain) + at least one actual voting option
- The smart contract treats all options equally - the "abstain" semantics are purely for application logic

**Implementation Example**:
```typescript
// Generate voting options with abstain
const options = generateInitialOptions(3);
// Creates: [
//   [0, 0],  // Option 0: Abstain (0 votes)
//   [1, 0],  // Option 1: Yes (0 votes)
//   [2, 0],  // Option 2: No (0 votes)
// ]
```

### Vote Processing

- **Authentication**: Requires valid semaphore NFT with ZK proof
- **Temporal Bounds**: Votes only accepted during the configured time window
- **Signal Validation**: Vote signals must deserialize to valid option selections
- **Weight Constraints**: Weighted votes must not exceed allowed weight limits

### Critical Functions

| Function | Purpose | Validation |
|----------|---------|------------|
| `check_options_index()` | Ensures sequential 0,1,2... indexing | Index continuity |
| `check_initial_options_value()` | Validates zero starting counts | All counts = 0 |
| `simple_vote()` | Adds 1 vote to target option | Option existence |
| `weighted_vote()` | Distributes weighted votes | Weight limits |
| `is_interval_within()` | Validates voting time window | Temporal bounds |
| `deserialise_signal()` | Converts ZK proof to votes | Signal integrity |

## 🧪 Testing Framework

### Test Categories

- **Index Validation** (20 tests): Sequential option indexing
- **Initial Values** (20 tests): Zero-initialized vote counts
- **Time Intervals** (30 tests): Temporal validation edge cases
- **Vote Updates** (13 tests): Option modification functionality
- **Simple Voting** (20 tests): Single-vote-per-option scenarios
- **Weighted Voting** (10 tests): Multi-option vote distribution
- **Weight Validation** (5 tests): Vote weight constraint checks

### Running Specific Tests

```bash
# Test option index validation
aiken check -m check_options_index

# Test simple voting functionality  
aiken check -m vote_

# Test interval validation
aiken check -m iiw_

# Test weighted voting
aiken check -m weighted_vote
```

## ⚙️ Configuration

### Network Settings (aiken.toml)

```toml
name = "agustinbadi/zk-voting-app"
version = "0.0.0"
plutus = "v3"
compiler = "v1.1.15"

[config.default]
network_id = 41  # Testnet

[[dependencies]]
name = "aiken-lang/stdlib"
version = "v2.2.0"
source = "github"
```

### Environment Configuration

The system is configured for Cardano testnet (network_id = 41). For mainnet deployment:

1. Update `network_id = 1` in aiken.toml
2. Ensure proper security auditing
3. Test thoroughly on testnet first

## 🔒 Security Considerations

### Zero-Knowledge Privacy

- Vote contents are cryptographically hidden
- Only vote validity is verified on-chain
- Voter identity remains anonymous

### Smart Contract Security

- Comprehensive input validation
- Time-bounded execution windows
- Immutable vote tallies
- Protection against double-spending

### Best Practices

- Always validate semaphore NFT authenticity
- Verify voting time boundaries
- Ensure proper option indexing
- Test edge cases thoroughly

## 📚 Resources

### Documentation

- [Aiken Language Guide](https://aiken-lang.org)
- [Cardano Developer Portal](https://developers.cardano.org)
- [Plutus Smart Contracts](https://plutus.readthedocs.io)

### Project Structure

```
zk-voting-app/
├── validators/           # Smart contract validators
│   ├── voting.ak        # Main voting logic
│   └── tests/           # Validator tests
├── lib/                 # Utility libraries
│   ├── types.ak         # Data type definitions  
│   ├── utilities.ak     # Helper functions
│   └── tests/           # Library tests
├── build/               # Compiled Plutus scripts
└── docs/                # Generated documentation
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and add tests
4. Ensure all tests pass: `aiken check`
5. Commit changes: `git commit -m "Description"`
6. Push branch: `git push origin feature-name`
7. Create a Pull Request

### Testing Requirements

All contributions must include comprehensive tests:
- Unit tests for new functions
- Integration tests for validator endpoints
- Edge case validation
- Negative test cases for error conditions

## 📄 License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Documentation**: Check the generated docs in `docs/` directory
- **Community**: Join the Cardano developer community forums

---

**⚠️ Disclaimer**: This software is experimental and provided as-is. Use at your own risk. Thoroughly test on testnets before any mainnet deployment.