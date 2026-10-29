# Project close-out report

> Draft for review. Items marked `[verify: …]` could not be confirmed from the repository or
> the milestone submissions and need a check before publication.

## Project details

| | |
|---|---|
| **Project name** | Zero-Knowledge (zkSNARK) Voting Protocol on Cardano for DAO Governance [open source] |
| **Project number** | 1200252 |
| **Fund / challenge** | Fund 12, Cardano Open: Developers |
| **Proposer** | Dominik Tilman, TrustLevel |
| **Requested funding** | 177,500 ADA |
| **Project manager** | Dominik Tilman |
| **Date project started** | `[verify: funding date / project start]` |
| **Date project completed** | `[verify: date of M5 approval]` |
| **Repository** | https://github.com/TrustLevel/ZK-Voting-App |
| **Live application** | https://vote.trustlevel.io (Cardano Preprod) |
| **Proposal** | https://projectcatalyst.io/funds/12/f12-cardano-open-developers/zero-knowledge-zksnark-voting-protocol-on-cardano-for-dao-governance-open-source |
| **Milestones** | https://milestones.projectcatalyst.io/projects/1200252 |

---

## Summary

The project set out to build an open-source voting protocol on Cardano in which voters prove
that they belong to an authorised group and cast a ballot without anyone, including the
organiser, being able to link the ballot to them, while every vote is verified and tallied on
the blockchain.

The result is a working, hosted application and a documented protocol:

- An organiser creates a voting event, invites participants by e-mail and publishes the event
  to the Cardano blockchain with two transactions from a CIP-30 wallet.
- Each participant generates a Semaphore identity in the browser; only a public commitment
  is registered. The identity secrets never leave the device.
- To vote, the browser produces a Groth16 zero-knowledge proof of group membership over
  BLS12-381. The proof, a one-time nullifier and the vote are verified by Plutus v3 validators
  on-chain, which also update the tally.
- Since Milestone 4 the vote transaction is built and paid by a relay wallet on the server.
  Voters need no wallet, no ADA and no signature, and no voter address appears next to a vote
  on-chain.
- Two voting modes are supported: simple (one vote per person) and weighted (a fixed number
  of points distributed across options).

The on-chain contracts were audited, the application was tested by external users in both
roles and with a scripted 15-voter system test, and the findings were fixed before the final
test run.

---

## Deliverables per milestone

### Milestone 1: Architecture Documentation (53,250 ADA)

- System design document: [design/SYSTEM_DESIGN.md](../design/SYSTEM_DESIGN.md)
- Smart-contract specification: [design/SMART_CONTRACT_SPECIFICATION.md](../design/SMART_CONTRACT_SPECIFICATION.md)
- Database schema design: [design/design_2.sql](../design/design_2.sql)
- `[verify: link to the M1 submission / interface prototypes as submitted in the portal]`

### Milestone 2: Development of an advanced ZK protocol (53,250 ADA)

- Aiken (Plutus v3) validators for the voting event: [src/on-chain](../src/on-chain), with
  the Semaphore and Group validators from `modulo-p/cardano-semaphore`
- Semaphore circuit compiled for BLS12-381 with a 21-contributor trusted setup, and the
  proof module: [src/zk](../src/zk)
- Transaction builder for the mint and vote transactions: [src/tx](../src/tx)
- `[verify: link to the M2 submission and the testnet transactions submitted as evidence]`

### Milestone 3: Development of a hosted application (35,500 ADA)

- Hosted frontend https://vote.trustlevel.io and backend https://api.vote.trustlevel.io
- Submission document: [MILESTONE3_SUBMISSION.md](../MILESTONE3_SUBMISSION.md), with the
  on-chain evidence of a full vote on Preprod (Group mint, Semaphore and Voting mint, anonymous
  vote) and the component documentation per module
- Walkthrough videos: simple voting https://youtu.be/b8HeAZMSW6s, weighted voting
  https://www.youtube.com/watch?v=EuaH2kGwe_0
- Learn More guide: [LEARN_MORE.md](../LEARN_MORE.md)

### Milestone 4: Testing and Advanced Development (8,875 ADA)

- Audit report of the on-chain contracts: [AUDIT_final.md](../AUDIT_final.md). 42 findings
  across three review phases, all contract findings resolved; 154 on-chain tests in the
  project and 40 in the Semaphore library pass after the fixes.
- User feedback from two external organisers and voters (CHIL Stake Pool, Gimbalabs), a
  five-person live group vote and the Catalyst reviewers, with the changes made in response:
  [docs/M4_USER_FEEDBACK.md](M4_USER_FEEDBACK.md)
- Scripted system test with 15 voters, concurrency and attack scenarios, repeated after the
  fixes: [docs/M4_TEST_REPORT.md](M4_TEST_REPORT.md)
- Relay vote design (voters without wallets): [docs/RELAY_VOTE_DESIGN.md](RELAY_VOTE_DESIGN.md)
- Submission document: [MILESTONE4_SUBMISSION.md](../MILESTONE4_SUBMISSION.md)

### Milestone 5: Close Out Report and Community Engagement (26,625 ADA)

- User guides: [Organiser guide](guides/ORGANISER_GUIDE.md), [Voter guide](guides/VOTER_GUIDE.md)
- This report
- Close-out video: `[verify: link]`
- Tutorial video: `[verify: link]`
- Article, forum post and social media posts: `[verify: links and engagement figures]`

---

## Challenge KPIs and how the project addressed them

`[verify: the Fund 12 "Cardano Open: Developers" challenge KPIs as stated in the challenge brief]`

The challenge asked for open-source developer tooling and infrastructure for the Cardano
ecosystem. The project contributes:

- An Apache-2.0 licensed, complete reference implementation of anonymous group voting on
  Cardano: contracts, proof generation, transaction building, backend and frontend.
- Fixes and tests contributed upstream to the `modulo-p/cardano-semaphore` library (versions
  0.9.3 to 0.9.5), documented in
  [design/implementation/UPSTREAM_SEMAPHORE_CHANGES.md](../design/implementation/UPSTREAM_SEMAPHORE_CHANGES.md).
- A property-based audit method for Aiken validators, written up in the audit report so that
  other projects can reuse it.

---

## Project KPIs and how the project addressed them

| KPI from the proposal | Outcome |
|---|---|
| Architecture documentation published on GitHub | Delivered in M1 (see above) |
| zk-SNARK circuits and smart contracts for registration, voting and tallying on a Cardano testnet | Delivered in M2; every event since then mints its contracts on Preprod |
| Hosted application for testing | Live since M3 at https://vote.trustlevel.io |
| Audit report and optimised contracts | Delivered in M4 |
| Feedback from at least 3 test users | Two external organisers (CHIL Stake Pool, Gimbalabs), a five-person live group and the Catalyst reviewers; see the feedback document |
| User guides, close-out report and video, community engagement | This milestone; `[verify: engagement figures]` |

---

## Key achievements

- **A complete anonymous vote on Cardano, end to end.** In-browser Groth16 proof generation,
  on-chain verification of the proof and of the nullifier, and on-chain tallying work together
  in production conditions on Preprod. The final scripted test confirmed every vote in a
  15-voter run and the tally on the API matched the chain state exactly.
- **Voting without a wallet.** The relay design removed the biggest hurdle that testers and
  reviewers reported: voters no longer need a Cardano wallet, test ADA or a signature. It
  also removed the voter's wallet address from the vote transaction.
- **An audited contract set.** The audit stated every security property before reading the
  implementation and traced each to the enforcing condition and a test. The one critical
  finding was in the test infrastructure of the upstream library; the medium findings were
  logic issues in the voting validator. All were fixed and the fixes were contributed upstream.
- **Testing with real organisers.** Two Cardano community organisations ran their own events
  as organisers and voters. Their feedback changed the product: a readiness checklist before
  publishing, an explanation of the two wallet signatures, step-by-step status during the vote
  and interim results hidden until the end.
- **Open source throughout.** Every design document, every milestone submission, the audit
  and the test and feedback reports are in the public repository.

---

## Key learnings

- **Wallet requirements for voters kill participation.** The M3 reviewers and all three
  tester groups struggled with the Preprod wallet setup and test ADA. Moving the transaction
  to a relay wallet made the voter side a two-click experience. For a governance tool, the
  voter should never need to touch a wallet.
- **Off-chain state needs the same care as on-chain state.** The most serious application
  bug found in testing was a nullifier trie that detached from its store after one rolled-back
  vote and then broke every later vote. The fix was small; finding it required a scripted test
  with real failures, not only happy-path demos.
- **Anonymity is not ballot secrecy.** The zero-knowledge proof hides who voted, not what was
  voted. Testers noticed interim results influencing later voters. Hiding results in the
  application until the end helps in practice, but real ballot secrecy needs encrypted
  ballots or a commit-reveal scheme. This should be designed in from the start.
- **Concurrency on a shared UTxO must be handled explicitly.** Two votes in the same block
  collide on the state UTxO. Serialising vote submission per event on the server solved it for
  this scale; larger groups will need batching or a different state layout.
- **A property-based audit finds different bugs than reading code.** Stating "what must hold"
  first surfaced a test suite that never exercised four rejection conditions at their intended
  boundary, which a line-by-line review had missed.
- **Testers need a plan for the organiser side.** Voters found the flow clear; organisers
  asked for a checklist of who had registered and what would happen when they clicked Publish.
  The organiser role carries the complexity and deserves the most guidance.

---

## Next steps

- **Ballot secrecy.** Encrypted ballots or commit-reveal so that neither the running tally
  nor the final per-option counts are readable before the end.
- **Remove the correlation path.** Serve the frozen voter group so that clients compute
  their own Merkle path, so that the server cannot correlate a membership-path request with a
  vote.
- **Move the organiser's mint flow behind the backend** so that no Blockfrost key is needed
  in the browser at all.
- **Resilience of the nullifier store.** Rebuild the off-chain trie from on-chain history on
  startup, and check it periodically against the on-chain root.
- **Mainnet readiness.** Fee and collateral handling for the relay wallet, rate limiting,
  and a review of the trusted-setup ceremony before any mainnet deployment.
- **Adoption.** Work with the two tester organisations and other DAO tooling projects on
  Cardano on integrating the protocol into their governance processes, and support forks that
  want to self-host.

---

## Final thoughts

The project delivered what it proposed: an open-source, audited, hosted zero-knowledge voting
protocol on Cardano that organisations can try today. The largest change along the way was
not cryptographic but practical: taking the wallet out of the voter's hands. The code, the
audit, the test reports and the feedback are public so that others can build on them, and the
known limits are stated so that nobody mistakes anonymity for ballot secrecy.

`[verify: team acknowledgement. The proposal lists Roman Preuss, Josch Rossa, Alex Ramalho
and Sergey K.; the repository history shows Agustín Salinas (AgustinBadi), "ash" and Dominik
Tilman as committers. Decide who is named here.]`

---

## Links

| | |
|---|---|
| Repository | https://github.com/TrustLevel/ZK-Voting-App |
| Live application (Preprod) | https://vote.trustlevel.io |
| Organiser guide | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/guides/ORGANISER_GUIDE.md |
| Voter guide | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/guides/VOTER_GUIDE.md |
| Audit report | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/AUDIT_final.md |
| User feedback (M4) | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/M4_USER_FEEDBACK.md |
| Test report (M4) | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/M4_TEST_REPORT.md |
| Milestone 3 submission | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/MILESTONE3_SUBMISSION.md |
| Milestone 4 submission | https://github.com/TrustLevel/ZK-Voting-App/blob/preview/MILESTONE4_SUBMISSION.md |
| TrustLevel knowledge base | https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app |
| Walkthrough videos (M3) | https://youtu.be/b8HeAZMSW6s · https://www.youtube.com/watch?v=EuaH2kGwe_0 |
| Close-out video | `[verify: link]` |
| Tutorial video | `[verify: link]` |
| Article | `[verify: link]` |
| Cardano Forum post | `[verify: link]` |

## Contact

`[verify: contact e-mail or handle Dominik wants published]`
