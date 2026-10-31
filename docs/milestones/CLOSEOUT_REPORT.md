# Project Close-out Report


## 1. Name of project and Project URL on IdeaScale/Fund

Zero-Knowledge (zkSNARK) Voting Protocol on Cardano for DAO Governance [open source]
https://projectcatalyst.io/funds/12/f12-cardano-open-developers/zero-knowledge-zksnark-voting-protocol-on-cardano-for-dao-governance-open-source

## 2. Your Project Number

1200252

## 3. Name of project manager

Dominik Tilman, TrustLevel

## 4. Date project started

October 2024

## 5. Date project completed

October 2026

## 6. List of challenge KPIs and how the project addressed them

The Fund 12 challenge "Cardano Open: Developers" set no numeric KPIs. It asked for open-source
developer tooling, source available from day one under an open licence, high-quality
documentation the community can learn from, and named governance tooling as an area of interest.

- **Open-source tooling, source available from day one.** The repository was public throughout:
  https://github.com/TrustLevel/ZK-Voting-App, Apache-2.0. It contains a complete reference
  implementation of anonymous group voting on Cardano: Aiken (Plutus v3) validators, the Semaphore
  circuit compiled for BLS12-381, proof generation, transaction building, backend and frontend.
- **Documentation as a learning resource.** System design and smart-contract specification,
  an audit report that states every security property of each validator and traces it to the
  enforcing condition and a test, two test reports, a user-feedback document, organiser and
  voter guides, a deployment guide for self-hosting, and a Learn More page for non-technical readers.
- **Contribution back to the ecosystem.** Fixes and tests for the Semaphore port were contributed
  upstream to `modulo-p/cardano-semaphore` (versions 0.9.3 to 0.9.5), and the property-based audit
  method is written up so that other Aiken projects can reuse it.
- **Governance tooling.** A hosted instance at https://vote.trustlevel.io lets any group run an
  anonymous, on-chain verified vote on Cardano Mainnet or Preprod without integration work.

## 7. List of project KPIs and how the project addressed them

The proposal named two success metrics: adoption of the protocol by DAOs and dApps on Cardano
(benchmark: five adoptions within the first year), and community engagement measured as
participation rates and governance interactions. Both measure the use of the product over its
first year in operation, so they cannot be assessed at close-out. What the project delivered for
them, and what can be reported today:

- **Adoption.** The precondition is in place: the protocol is open source under Apache-2.0, the
  hosted application runs on Cardano Mainnet and Preprod, any group can run a vote without
  integration work, and a self-hosting guide covers groups that want their own instance. At
  close-out, two Cardano organisations, CHIL Stake Pool and Gimbalabs, have run their own events
  as organisers and voters. Adoption after close-out is countable: every event mints
  its own NFTs on-chain, and the repository's forks show self-hosted instances.
- **Community engagement.** Measured so far as participation in testing and as the reach of
  the launch campaign. Governance interactions on the protocol are
  recorded on-chain and in the hosted instance, so participation rates can be reported per event
  once groups use it for real decisions.

## 8. Key achievements (in particular around collaboration and engagement)

- **A complete anonymous vote on Cardano, live on Mainnet and Preprod.** In-browser Groth16 proof
  generation, on-chain verification of proof and nullifier, and on-chain tallying work together
  in production conditions. The scripted test confirmed every vote of a 15-voter run, and the
  tally on the API matched the chain state exactly; the same was confirmed on Mainnet.
- **Voting without a wallet.** The relay design removed the hurdle every tester and reviewer
  reported: voters need only their invitation link, no wallet, no ADA, no signature, and no voter
  address appears next to a vote on-chain. On Mainnet the organiser prepays the voters' fees.
- **Testing with real organisers.** Two Cardano community organisations ran their own events in
  both roles. Their feedback changed the product: a readiness checklist before publishing, status
  step by step during the vote, and per-option results hidden until the vote ends.
- **An audited contract set, with fixes shared upstream.** The audit stated what must hold before
  reading the code. Its one critical finding was in the test infrastructure of the upstream
  library, the medium findings were logic issues in the voting validator; all were fixed and the
  Semaphore fixes contributed to `modulo-p/cardano-semaphore`.
- **Open source throughout.** Every design document, milestone submission, the audit, the test
  and feedback reports and the guides are in the public repository under Apache-2.0, with a
  contribution guide and a security policy.

## 9. Key learnings

- **Wallet requirements for voters kill participation.** Reviewers and all tester groups struggled
  with the wallet setup and test ADA. Moving the transaction to a relay wallet made the voter side
  a two-click experience. A governance tool should never make the voter touch a wallet.
- **Anonymity is not ballot secrecy.** The proof hides who voted, not what was voted, and testers
  saw interim results influence later voters. Hiding results in the application helps in practice;
  real ballot secrecy needs encrypted ballots or commit-reveal and must be designed in from the start.
- **Off-chain state needs the same care as on-chain state.** The most serious application bug was a
  nullifier trie that detached from its store after one rolled-back vote. Finding it took a scripted
  test with real failures, not a happy-path demo.
- **Concurrency on a shared UTxO must be handled explicitly.** Two votes built on the same state
  cannot both succeed. Serialising submission per network and waiting until the previous vote is
  indexed solved it at this scale; larger groups need batching or a different state layout.
- **The organiser carries the complexity.** Voters found the flow clear; organisers asked what would
  happen when they clicked Publish. Guidance belongs on the organiser side.

## 10. Next steps for the product or service developed

- **Remove the correlation path:** serve the frozen group so that clients compute their own Merkle
  path, and an independent submission channel, so that the server cannot link a voter to a vote.
- **Delivery without a single relay:** a second relay or an independent submission path, so that
  the operator cannot delay or withhold votes and the service has no single point of availability.
- **Throughput:** batching of votes for groups beyond a few dozen voters.
- **Operations:** rebuild the nullifier store from on-chain history on startup, and a close path
  that lets the organiser reclaim the ADA locked in the event contracts after the vote.
- **Adoption:** support the organisations that tested or expressed interest in running real votes,
  and anyone who forks the repository to self-host.

## 11. Final thoughts/comments

The project delivered what it proposed: an open-source zero-knowledge voting
protocol on Cardano plus a hosted voting application that any group can use today, on Mainnet and on Preprod. We built it to get as
close to a full ZK voting design as Cardano L1 allows, and we state where it stops, so that nobody
mistakes anonymity for ballot secrecy. 

## 12. Links to other relevant project sources or documents

- Repository (Apache-2.0): https://github.com/TrustLevel/ZK-Voting-App
- Live application, Mainnet and Preprod: https://vote.trustlevel.io
- Organiser guide: https://github.com/TrustLevel/ZK-Voting-App/blob/main/docs/guides/ORGANISER_GUIDE.md
- Voter guide: https://github.com/TrustLevel/ZK-Voting-App/blob/main/docs/guides/VOTER_GUIDE.md
- Audit report: https://github.com/TrustLevel/ZK-Voting-App/blob/main/docs/audit/AUDIT.md
- User feedback (M4): https://github.com/TrustLevel/ZK-Voting-App/blob/main/docs/testing/M4_USER_FEEDBACK.md
- Self-hosting guide: https://github.com/TrustLevel/ZK-Voting-App/blob/main/docs/operations/DEPLOY.md
- TrustLevel knowledge base: https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app
- Walkthrough videos of zk protocol (M3): https://youtu.be/b8HeAZMSW6s and https://www.youtube.com/watch?v=EuaH2kGwe_0
- Walkthrough video of the voting app (organiser and voter flow): https://www.youtube.com/watch?v=obI0ELOjlhs
- Cardano Forum article: https://forum.cardano.org/t/from-the-great-builders-of-trustlevel-zk-voting-on-cardano-is-available-open-source-live-on-mainnet-and-on-the-preprod-testnet/157639

## 13. Link to Close-out video

`[YouTube link]`
