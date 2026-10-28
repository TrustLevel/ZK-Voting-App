# ZK Voting — Learn More

Anonymous, verifiable voting on Cardano. Voters prove they belong to an authorised group and
cast a ballot **without anyone — not even the organiser — being able to link the vote back to
them**, while every vote is tallied immutably on-chain.

> **Status: Preview · Public test live · Updated: 2026-10-28**
> The application is deployed and open for public testing on the **Cardano Preprod Testnet**.
> **Voters need no wallet and no test ADA**: the vote transaction is built, paid and submitted
> by the voting service (relay design); the voter's browser only produces the zero-knowledge
> proof. **Organisers still need a Preprod wallet with free test ADA** to publish an event.
> No real funds are involved. This is a preview release; expect testnet-only behaviour and
> occasional changes.

**Try it:** https://vote.trustlevel.io

---

## What makes it different

- **Anonymous** — votes are cast with a zero-knowledge (Semaphore / Groth16) proof of group
  membership. The proof confirms you are an eligible voter without revealing *which* voter.
- **One vote per person** — a one-time cryptographic nullifier makes double voting impossible.
- **Closed group** — only invited participants can vote.
- **Publicly verifiable** — the final tally lives on the Cardano blockchain and cannot be altered.

Two voting modes: **Simple** (one vote for one option) and **Weighted** (distribute a fixed
number of points across options).

---

## Before you start (organisers only)

Voters only need their invitation link and a browser. Organisers need a Cardano wallet set to
**Preprod** and some free test ADA, because the two transactions that publish an event are
signed and paid by the organiser:

1. **Install a CIP-30 wallet** browser extension — [Eternl](https://eternl.io/) (recommended) or
   [Lace](https://www.lace.io/).
2. **Switch the wallet network to Preprod** (testnet), not Mainnet.
3. **Get free test ADA** from the [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) — paste your wallet's Preprod address and request funds. A few test ADA is enough to cover the two publishing transactions.

---

## For Organisers (Admins)

You set up and run a voting event end to end.

1. **Create the event** — connect your wallet at [vote.trustlevel.io](https://vote.trustlevel.io)
   and enter the event name, the options voters choose from, the voting mode (simple or weighted), and the voting date (must be at least ~15 minutes in the future).
2. **Invite participants** — add people by email. Each invitee gets a unique private link, valid for seven days. The group is closed: only invited people can register and vote.
3. **Wait for registration** — invitees open their link and register (no wallet needed). Their
   browser generates a random cryptographic identity locally; only a public commitment is added to the group. No personal data is collected. The *Before you publish* panel shows who has registered and who is still pending.
4. **Publish on-chain** — once the participant list is final, publish the event: your wallet signs two transactions that anchor the voting contracts on Cardano. From here, options, dates, and group membership are **immutable**; participants who have not registered by then cannot vote.
5. **Read the results** — while voting is open you see the turnout only. When voting closes, the
   tally is publicly readable on-chain. You see the totals only — never who voted for what.

---

## For Voters (Participants)

1. **Open your invitation link** in any modern browser, within seven days of receiving it. No
   wallet, no test ADA, no signature.
2. **Register** — click *Generate Identity*. Your browser creates a random Semaphore identity:
   two secret values that **never leave your device**, stored in the browser and downloaded as
   `semaphore-identity-event-<id>.json`. Keep that file; it is the only way to vote from another
   browser or device. Then click *Register Commitment* — only a public commitment is sent to the
   group.
3. **Wait for the voting window** — the event has a fixed start and end enforced by the blockchain.
4. **Vote** — during the window, pick your choice and submit. Your browser generates a
   zero-knowledge proof of membership and a one-time anti-double-vote nullifier; the voting
   service verifies the proof and records the vote on Cardano with its own wallet. No one can
   link the vote back to you.
5. **See results** — while voting is open you see the turnout only; once the event ends, the
   tally is public and final on-chain.

---

## Links

| | |
|---|---|
| Live application | https://vote.trustlevel.io |
| Source code (GitHub) | https://github.com/TrustLevel/ZK-Voting-App |
| Testnet faucet (free test ADA, organisers) | https://docs.cardano.org/cardano-testnets/tools/faucet |
| Organiser guide | [docs/guides/ORGANISER_GUIDE.md](docs/guides/ORGANISER_GUIDE.md) |
| Voter guide | [docs/guides/VOTER_GUIDE.md](docs/guides/VOTER_GUIDE.md) |
| Semaphore protocol | https://semaphore.appliedzkp.org/ |

---

## FAQ

**Is this real money?** No. It runs on the Cardano **Preprod Testnet**. Voters pay nothing; organisers use free test ADA.

**Can the organiser see how I voted?** No. The zero-knowledge proof hides who voted, and no voter
wallet appears in a vote transaction. The options' running totals are public on the blockchain
(the application hides them until the event ends); what is protected is the link between a vote
and a voter. Known limits: [docs/M4_USER_FEEDBACK.md](docs/M4_USER_FEEDBACK.md), section 5.

**Can I vote twice?** No. A one-time nullifier derived inside your zero-knowledge proof blocks any
second vote, without ever revealing your identity.

**Do I need a wallet?** Voters do not. Organisers need a Preprod wallet to create and publish an event.

**What if I lose my identity?** Your voting identity lives in the browser you registered with and
in the identity file downloaded at registration. Keep that file; you can upload it on the voting
page to vote from another browser. It cannot be recovered otherwise.
