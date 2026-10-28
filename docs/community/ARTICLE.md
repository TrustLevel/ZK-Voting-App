# Anonymous, verifiable group votes on Cardano: what we built and how to try it

> Draft article for Milestone 5. Suggested outlets: TrustLevel blog or Medium, cross-posted
> to the Cardano Forum. Author: Dominik Tilman, TrustLevel. Length about 1,400 words.

Most DAO votes on Cardano today come in one of two shapes. Either the vote is on-chain and
every ballot is tied to a wallet address for everyone to see, or the vote runs in a poll tool
where members have to trust the organiser to count correctly and to keep the ballots to
themselves. For many decisions that is fine. For some it is not: budget allocations between
competing teams, personnel decisions, anything where a member might vote differently if the
vote were public.

Over the past year we built an open-source protocol and a hosted application that gives a
group the third option: every vote is verified and counted on the Cardano blockchain, and
nobody, including the organiser and the server, can tell which member cast which vote. This
article explains what it does, what it does not do, and how you can run a vote with it today.

## What the protocol does

The protocol is a Cardano port of Semaphore, a zero-knowledge group-signalling scheme, adapted
to the BLS12-381 curve that Plutus supports natively.

A voting event has three parts:

**Registration.** Each invited participant opens a personal link. Their browser generates a
secret identity, two random numbers that never leave the device, and sends only a public
commitment to the server. The commitments form a Merkle tree. When the organiser publishes the
event, the root of that tree is written to the chain in a Group NFT. From that moment the
group is frozen.

**Voting.** To vote, the browser produces a Groth16 zero-knowledge proof with four public
facts: the Merkle root of the group, a nullifier, a hash of the vote message, and the event
identifier. The proof shows that the voter knows a secret identity whose commitment is in the
tree, without revealing which one. The nullifier is derived from the secret identity and the
event, so the same identity always produces the same nullifier for the same event, and
nothing else about the identity can be recovered from it.

**Verification and tally.** The vote transaction is checked by two Plutus v3 validators. The
Semaphore validator verifies the Groth16 proof on-chain and checks that the nullifier is not
yet in a Merkle Patricia trie of used nullifiers; it inserts it. The Voting validator checks
that the vote message is well-formed, that the voting window is open and that the tally in its
datum is updated correctly. The tally lives on-chain, so anyone can verify the result
without trusting a server.

Two voting modes are supported: simple, one vote per person for one option, and weighted,
where every voter distributes a fixed number of points across options and the contract checks
that the points add up.

## What changed through testing

The first hosted version required voters to connect a Cardano wallet, hold test ADA and sign
the vote transaction. In testing with two Cardano community organisations, a five-person live
vote and the Catalyst reviewers, that requirement was the single largest source of friction.
It was also a privacy weakness: the voter's wallet paid the fee, so their address appeared in
the vote transaction.

The current version uses a relay. The browser still generates the proof locally, but the
server builds the transaction, pays the fee from a service wallet and submits it. Voters need
no wallet, no ADA and no signature. No voter address appears on-chain next to a vote.

Testing also changed the product in smaller ways. Organisers asked for a checklist of who had
registered before they publish, because publishing freezes the group. Voters wanted to know
what is happening during the thirty seconds the proof takes. And the second voter in the live
test could see the running tally before the others had voted, so interim results are now
hidden until the voting window closes, enforced on the server rather than only in the page.

The most serious bug we found was not cryptographic. After one vote failed and was rolled
back, the server's trie of used nullifiers detached from its storage, and every later vote in
that event was rejected on-chain. A scripted test with 15 voters and deliberate failures found
it; demonstrations never had.

## The audit

The on-chain contracts were audited with a property-based method: for each validator, every
security property was written down before reading the code, then traced to the exact condition
that enforces it and to a test that exercises that condition. The audit produced 42 findings
across the contracts, their tests and the application layer. The one critical finding was in
the upstream Semaphore library's test suite, where all spending tests placed the verification
key in the wrong place and so never tested four rejection conditions at the intended boundary.
The medium findings were logic issues in the voting validator: a missing minimum-options
guard, a silent discard in weighted tallying, weaker-than-intended NFT destination checks. All
contract findings were fixed, the fixes were contributed to the upstream library, and the
test suites now pass 154 tests in the project and 40 in the library. The full report is in the
repository.

## What it does not do

Two limits are worth stating plainly.

The protocol provides anonymity, not ballot secrecy. It hides who voted, not what was voted.
The chosen option and the running tally are on the public chain. Nobody can tie an option to a
member, but anyone who reads the chain can follow the count. Real ballot secrecy would need
encrypted ballots or a commit-reveal scheme, and that is the first item on the roadmap.

The hosted service could in principle correlate a voter with a vote: the browser asks the
server for its membership path and then submits the vote through the same server. The hosted
instance does not log this, and a self-hosted instance is under your own control, but the
protocol does not yet prevent it. Serving the whole frozen group so that clients compute their
own path is the known fix.

## How to try it

The application is live on the Cardano Preprod testnet at vote.trustlevel.io. Running a vote
takes an organiser with a Preprod wallet and a little test ADA from the faucet; the
participants need only their invitation e-mail. The organiser guide and the voter guide in the
repository walk through every screen.

For teams who want to run their own instance, the repository contains everything: the Aiken
contracts, the circuit and proving key, the transaction builder, the NestJS backend, the
Next.js frontend, a Docker deployment and the design documents. The licence is Apache 2.0.

If your DAO, stake pool community or working group runs votes where members should not have
to show their hand, we would like to hear what you need. Open an issue in the repository or
reach out directly.

**Links**

- Repository: https://github.com/TrustLevel/ZK-Voting-App
- Live application (Preprod): https://vote.trustlevel.io
- Organiser guide: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/guides/ORGANISER_GUIDE.md
- Voter guide: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/docs/guides/VOTER_GUIDE.md
- Audit report: https://github.com/TrustLevel/ZK-Voting-App/blob/preview/AUDIT_final.md
- Project on Catalyst: https://milestones.projectcatalyst.io/projects/1200252

*This work was funded by Project Catalyst, Fund 12, Cardano Open: Developers.*
