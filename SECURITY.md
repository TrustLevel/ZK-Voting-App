# Security policy

The ZK Voting App runs anonymous, on-chain verified votes. A weakness in the contracts, the
proof pipeline or the hosted service can affect the anonymity or the integrity of real votes,
so please report security problems privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

**[Report a vulnerability](https://github.com/TrustLevel/ZK-Voting-App/security/advisories/new)**

Please do not open a public issue or pull request for a security problem, and please do not
discuss it publicly before a fix is available.

Include what you can of the following:

- the component (contracts in `src/on-chain`, backend, frontend, `src/tx`, `src/zk`, the
  deployment in `deploy/`, or the hosted instance at vote.trustlevel.io)
- steps to reproduce, or a proof of concept
- the impact as you understand it (for example: a voter can be linked to a vote, a second vote
  is accepted, a vote is lost, funds of the relay wallet are at risk)

## What to expect

- We confirm receipt of the report and keep you informed about the fix through the advisory.
- We will credit you in the advisory and the release notes unless you prefer not to be named.
- There is no bug bounty programme.

## Scope

In scope: everything in this repository and the hosted instance at vote.trustlevel.io and
api.vote.trustlevel.io.

Out of scope: the Cardano network itself, Blockfrost, wallet software, and the upstream
libraries this project depends on (report those to their maintainers; for
`modulo-p/cardano-semaphore` we are happy to help coordinate).

## Known limits

The limits of the design are documented, not hidden: anonymity rather than ballot secrecy
(the chosen option is readable on-chain, not who chose it), and the correlation a hosted
server could in principle perform. They are described in
[docs/guides/LEARN_MORE.md](docs/guides/LEARN_MORE.md) and in the
[audit report](docs/audit/AUDIT.md). A report that shows one of them to be worse than
described is in scope.
