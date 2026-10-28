# Cardano Forum post

> Draft for forum.cardano.org. Suggested category: Developers, or Governance if the post is
> aimed at DAO operators. Title and body below. Post as Dominik.

**Title:** ZK Voting App: anonymous, on-chain verified group votes on Cardano, open source and live on Preprod

**Body:**

Hi all,

we have finished the development phase of a Fund 12 project and would like to hand the result
to the community for testing and feedback: an open-source voting protocol for DAOs and other
groups where every vote is verified and tallied on-chain, but nobody can tell which member cast
which vote.

**What it is**

- A Cardano port of the Semaphore zero-knowledge protocol on BLS12-381, with Plutus v3
  validators written in Aiken.
- Participants register a commitment of a secret identity that stays in their browser. To
  vote, the browser produces a Groth16 proof of group membership plus a one-time nullifier.
  The validators verify the proof on-chain, reject double votes and update the tally.
- Voters need no wallet and no ADA. The service builds and pays the vote transaction from a
  relay wallet after verifying the proof. No voter address appears next to a vote.
- Simple voting (one vote per person) and weighted voting (distribute points across options).
- Per-option results are hidden until the voting window closes; turnout is visible.

**What has been done**

- The contracts were audited with a property-based method (42 findings across contracts,
  tests and application, all contract findings resolved; 154 + 40 tests pass). Fixes were
  contributed upstream to modulo-p/cardano-semaphore.
- Tested by CHIL Stake Pool and Gimbalabs as organisers and voters, in a five-person live
  vote, and with a scripted 15-voter run including double votes, replays, non-members and
  out-of-window submissions.

**Known limits, stated openly**

- Anonymity, not ballot secrecy: the chosen option and the tally are readable on-chain. Nobody
  can tie them to a person. Encrypted ballots are the next step.
- The hosted server could correlate a voter's membership-path request with the vote. A
  self-hosted instance is under your control; the protocol-level fix is on the roadmap.

**Try it**

- Live on Preprod: https://vote.trustlevel.io (organiser needs a Preprod wallet with test ADA;
  voters need only the invitation e-mail)
- Organiser guide: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/guides/ORGANISER_GUIDE.md
- Voter guide: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/guides/VOTER_GUIDE.md
- Source, audit, test and feedback reports: https://github.com/TrustLevel/ZK-Voting-App
- Article with the background: `[link to the article]`

**What we are looking for**

If you run a DAO, a stake pool community or a working group that votes, we would like to know
whether this fits your process and what is missing. If you want to self-host or integrate the
protocol, fork the repository and open an issue; we will help with the setup. Feedback on the
cryptographic design is equally welcome, in particular on the ballot secrecy question.

Thanks to the testers and to the Catalyst reviewers for the feedback that shaped the current
version.

Dominik, TrustLevel
