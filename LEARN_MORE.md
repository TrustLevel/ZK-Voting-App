# ZK Voting App: Learn More

Anonymous, verifiable voting on Cardano. Voters prove they belong to an authorised group and
cast a ballot without anyone, not even the organiser, being able to link the vote back to
them, while every vote is tallied immutably on-chain.

> **Status: Mainnet live · Preprod for trials · Updated: 2026-10-29**
> The application runs on **Cardano Mainnet** and on the **Cardano Preprod testnet**; the
> organiser chooses the network when creating an event. **Voters need no wallet and no ADA**
> on either network: the vote transaction is built, paid and submitted by the voting service
> (relay design); the voter's browser only produces the zero-knowledge proof. **Organisers need
> a wallet on the chosen network**: real ADA on Mainnet, free test ADA on Preprod (see
> *Preprod or Mainnet?* below).

**Try it:** https://vote.trustlevel.io

---

## What makes it different

- **Anonymous.** Votes are cast with a zero-knowledge (Semaphore / Groth16) proof of group
  membership. The proof confirms you are an eligible voter without revealing *which* voter.
- **One vote per person.** A one-time cryptographic nullifier makes double voting impossible.
- **Closed group.** Only invited participants can vote.
- **Publicly verifiable.** The final tally lives on the Cardano blockchain and cannot be altered.

Two voting modes: **Simple** (one vote for one option) and **Weighted** (distribute a fixed
number of points across options; results are counted in points).

---

## Preprod or Mainnet?

You choose the network when you create an event, and it cannot be changed afterwards.

| | Mainnet | Preprod testnet |
|---|---|---|
| Money | real ADA | free test ADA from the faucet |
| Publishing an event | two transactions: 15 ADA stay locked in the event contracts, about 1.5 ADA fees, plus one plain-ADA output of at least 5 ADA in your wallet as collateral | the same two transactions, paid with test ADA |
| Voters' transaction fees | prepaid by you: a **fee deposit** of 1.3 ADA per registered voter, sent before publishing; it is the cost of the event and an unused remainder is not refunded | paid by the service |
| Voters | no wallet, no ADA | no wallet, no ADA |
| Explorer | cardanoscan.io | preprod.cardanoscan.io |

Use Preprod to try the application; use Mainnet for a vote whose record should live on the
public Cardano ledger.

## Before you start (organisers only)

Voters only need their invitation link and a browser. Organisers need a Cardano wallet on the
network of the event, because the transactions that publish an event (and, on Mainnet, the fee
deposit) are signed and paid by the organiser:

1. **Install a CIP-30 wallet** browser extension: [Eternl](https://eternl.io/) (recommended) or
   [Lace](https://www.lace.io/).
2. **Switch the wallet to the network of your event.** The application refuses a wallet on the
   wrong network when you publish.
3. **Mainnet:** have about 25 ADA plus the fee deposit available. **Preprod:** get free test ADA
   from the [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet);
   paste your wallet's Preprod address and request funds.

---

## For Organisers

You set up and run a voting event end to end. The [organiser guide](docs/guides/ORGANISER_GUIDE.md)
has every screen.

1. **Create the event** at [vote.trustlevel.io](https://vote.trustlevel.io): name, network,
   the options voters choose from, the voting mode (simple or weighted) and the voting window.
   Plan the start at least 10 minutes ahead and the period at least 10 minutes plus about one
   minute per voter; these are the technical minimums, the form repeats them.
2. **Invite participants** by e-mail. Each invitee gets a personal link, valid for seven days.
   The group is closed: only invited people can register and vote.
3. **Wait for registration.** Invitees open their link and register (no wallet needed). Their
   browser generates a random cryptographic identity locally; only a public commitment is added
   to the group. No personal data is collected. The *Before you publish* box shows who has
   registered and who is still pending.
4. **Publish on-chain.** On Mainnet, send the fee deposit first. Then your wallet signs two
   transactions that anchor the voting contracts on Cardano. From here, options, dates and group
   membership are **immutable**; participants who have not registered by then cannot vote.
5. **Read the results.** While voting is open you see the turnout only. When voting closes, the
   tally is publicly readable on-chain. You see the totals only, never who voted for what.

---

## For Voters (Participants)

The [voter guide](docs/guides/VOTER_GUIDE.md) has every screen.

1. **Open your invitation link** in any modern browser, within seven days of receiving it. No
   wallet, no ADA, no signature.
2. **Register.** Click *Generate Identity*. Your browser creates a random Semaphore identity:
   two secret values that **never leave your device**, stored in the browser and downloaded as
   `semaphore-identity-event-<id>.json`. Keep that file; it is the only way to vote from another
   browser or device. Then click *Register Commitment*; only a public commitment is sent to the
   group.
3. **Wait for the voting window.** The event has a fixed start and end enforced by the
   blockchain; the page shows them in your local time.
4. **Vote.** During the window, pick your choice and submit. Your browser generates a
   zero-knowledge proof of membership and a one-time anti-double-vote nullifier (about 30
   seconds); the voting service verifies the proof and records the vote on Cardano with its own
   wallet. No one can link the vote back to you.
5. **See results.** While voting is open, no counts and no turnout are shown to voters. Once
   the event ends, the tally is public and final on-chain.

---

## Links

| | |
|---|---|
| Live application | https://vote.trustlevel.io |
| Documentation (TrustLevel knowledge base) | https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app |
| Source code (GitHub) | https://github.com/TrustLevel/ZK-Voting-App |
| Testnet faucet (free test ADA, organisers) | https://docs.cardano.org/cardano-testnets/tools/faucet |
| Organiser guide | [docs/guides/ORGANISER_GUIDE.md](docs/guides/ORGANISER_GUIDE.md) |
| Voter guide | [docs/guides/VOTER_GUIDE.md](docs/guides/VOTER_GUIDE.md) |
| Mainnet setup (operators) | [docs/MAINNET_SETUP.md](docs/MAINNET_SETUP.md) |
| Semaphore protocol | https://semaphore.appliedzkp.org/ |

---

## FAQ

**Is this real money?** On **Mainnet** yes: the organiser pays the publishing transactions and
prepays the voters' fees as a deposit; voters still pay nothing and need no wallet. On
**Preprod** no: free test ADA, voters pay nothing.

**Can the organiser see how I voted?** No. The zero-knowledge proof hides who voted, and no voter
wallet appears in a vote transaction. The options' running totals are public on the blockchain
(the application hides them until the event ends); what is protected is the link between a vote
and a voter. Known limits: [docs/M4_USER_FEEDBACK.md](docs/M4_USER_FEEDBACK.md), section 5.

**Can I vote twice?** No. A one-time nullifier derived inside your zero-knowledge proof blocks any
second vote, without ever revealing your identity.

**Do I need a wallet?** Voters do not. Organisers need a wallet on the network of their event
(Mainnet or Preprod) to create and publish it.

**What if I lose my identity?** Your voting identity lives in the browser you registered with and
in the identity file downloaded at registration. Keep that file; you can upload it on the voting
page to vote from another browser. It cannot be recovered otherwise.
