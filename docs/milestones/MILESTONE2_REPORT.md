> *Archived copy of the original report. The Google Doc is no longer available because the company account no longer exists. The text is unchanged; only links to documents that have moved were updated.*

![milestone2 figure 1](images/milestone2-01.jpg)

# ZK VOTING PROTOCOL

| **Proof of Achievement** |  |
|---|---|
| Proposal | 1200252 |
| Link | [Zero-Knowledge (zkSNARK) Voting Protocol on Cardano for DAO Governance](https://projectcatalyst.io/funds/12/f12-cardano-open-developers/zero-knowledge-zksnark-voting-protocol-on-cardano-for-dao-governance-open-source) |
| Milestone | 2 |
| Version | 2.0 <br> Changes to v1: <br> adjusted to approved change request of Nov, 13. <br> updated documentation |
| Status | Submitted |
| Last Update | December 3, 2025 |
| Contributors | Dominik Tilman & Agustin Salinas |
| Deliverables | Working prototype of the zk-SNARKs voting system, including smart contracts and ZK circuits |
| New Github Link | [https://github.com/TrustLevel/ZK-Voting-App](https://github.com/TrustLevel/ZK-Voting-App) |
| New Gitbook Link | [https://trustlevel.gitbook.io/knowledge-base/](https://trustlevel.gitbook.io/knowledge-base/) |

## Milestone Report – Smart Contracts & ZK Circuits

#### Introduction

This milestone delivers a fully functional zero-knowledge voting system on Cardano, implementing the advanced ZK protocol and smart contract infrastructure outlined in our approved SOM change request of November 13, 2024.

Our implementation builds on Semaphore, an early proof-of-concept for zero-knowledge proofs on Cardano, adapted specifically for secure, anonymous voting. We have developed two core smart contracts in Aiken: a voting validator that manages the complete voting lifecycle (registration, voting, and tallying), and a Semaphore validator that provides zk-SNARK circuit functionality for proof generation and verification.

The system ensures voter anonymity through cryptographic proofs that verify both eligibility and vote correctness without revealing voter identities or choices. Security is enhanced through a Multi-Party Computation (MPC) trusted setup, producing cryptographic keys that prevent any single party from compromising the voting process.

This milestone includes fully tested smart contracts, complete ZK circuit implementation, trusted setup keys from the MPC ceremony, and comprehensive documentation covering system architecture, smart contract specifications, and Semaphore protocol details. All components have been tested and are demonstrated in the accompanying materials.

#### Deliverables

**Video Walkthrough**

- Explanation of the ZK Voting Protocol:[zk-voting-app-milestone-2.mp4](https://drive.google.com/file/d/1cCHhGV2ZIgaxYcJDU46f7n8gfgF7yhxh/view?usp=sharing)

**Smart Contracts (Aiken)**

- Voting validators (for registration, voting & tally):
  - [voting.ak](https://github.com/TrustLevel/ZK-Voting-App/blob/main/src/on-chain/validators/voting.ak)
  - [voting_utilities.ak](https://github.com/TrustLevel/ZK-Voting-App/blob/main/src/on-chain/lib/voting_utilities.ak)
- Semaphore validator (for ZK circuits):[semaphore.ak](https://github.com/Modulo-P/Cardano-Semaphore/blob/main/validators/semaphore.ak)

**Smart Contract Tests**

- Video demonstration:[Aiken Check - Screen Recording 2025-09-16 at 10.38.40.mov](https://drive.google.com/file/d/1PG_UZYGXmJyBAqbyBTOMVujC1twwUaql/view?usp=sharing)

**ZK Circuits**

- Semaphore circuits:[modp-semaphore-bls12381/circuits](https://github.com/Modulo-P/modp-semaphore-bls12381/tree/main/packages/circuits/circuits)

**Trusted Setup Keys**

- Prover and verification keys derived from the MPC:[keys](https://github.com/Modulo-P/Cardano-Semaphore/tree/main/keys)

**Documentation**

- Smart Contracts:
  - [docs/design/SMART_CONTRACT_SPECIFICATION.md](../design/SMART_CONTRACT_SPECIFICATION.md)
- Semaphore Specifications:
  - [https://github.com/Modulo-P/Cardano-Semaphore/blob/main/docs/Research/Research-Semaphore-Modp-09-2024.pdf](https://github.com/Modulo-P/Cardano-Semaphore/blob/main/docs/Research/Research-Semaphore-Modp-09-2024.pdf)
- Updated System Design:
  - System Architecture:
    - [docs/design/SYSTEM_DESIGN.md](../design/SYSTEM_DESIGN.md)
