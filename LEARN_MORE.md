# ZK Voting — Learn More

Anonymous, verifiable voting on Cardano. Voters prove they belong to an authorised group and
cast a ballot **without anyone — not even the organiser — being able to link the vote back to
them**, while every vote is tallied immutably on-chain.

> **Status: Preview · Public test live · Updated: 2026-10-29**
> The application runs on the **Cardano Preprod Testnet** and on **Cardano Mainnet**; the
> organiser chooses the network when creating an event. **Voters need no wallet and no ADA**
> on either network: the vote transaction is built, paid and submitted by the voting service
> (relay design); the voter's browser only produces the zero-knowledge proof. **Organisers need
> a wallet on the chosen network**: free test ADA on Preprod, real ADA on Mainnet (see
> *Preprod or Mainnet?* below). This is a preview release; expect occasional changes.

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

## Preprod or Mainnet?

You choose the network when you create an event, and it cannot be changed afterwards.

| | Preprod testnet | Mainnet |
|---|---|---|
| Money | free test ADA from the faucet | real ADA |
| Publishing an event | two transactions, a few test ADA | two transactions: 15 ADA stay locked in the event contracts, about 1.5 ADA fees, plus one plain-ADA output of at least 5 ADA as collateral |
| Voters' transaction fees | paid by the service | prepaid by you: a **fee deposit** of 1.3 ADA per registered voter, sent before publishing; it is the cost of the event and an unused remainder is not refunded |
| Voters | no wallet, no ADA | no wallet, no ADA |
| Explorer | preprod.cardanoscan.io | cardanoscan.io |

Use Preprod to try the application; use Mainnet for a vote whose record should live on the
public Cardano ledger.

## Before you start (organisers only)

Voters only need their invitation link and a browser. Organisers need a Cardano wallet on the
network of the event, because the transactions that publish an event (and, on Mainnet, the fee
deposit) are signed and paid by the organiser:

1. **Install a CIP-30 wallet** browser extension — [Eternl](https://eternl.io/) (recommended) or
   [Lace](https://www.lace.io/).
2. **Switch the wallet to the network of your event.** The application refuses a wallet on the
   wrong network when you publish.
3. **Preprod: get free test ADA** from the [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) — paste your wallet's Preprod address and request funds. **Mainnet:** have about 25 ADA plus the fee deposit available.

---

## For Organisers

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

**Is this real money?** On **Preprod** no: free test ADA, voters pay nothing. On **Mainnet** yes: the organiser pays the publishing transactions and prepays the voters' fees as a deposit; voters still pay nothing and need no wallet.

**Can the organiser see how I voted?** No. The zero-knowledge proof hides who voted, and no voter
wallet appears in a vote transaction. The options' running totals are public on the blockchain
(the application hides them until the event ends); what is protected is the link between a vote
and a voter. Known limits: [docs/M4_USER_FEEDBACK.md](docs/M4_USER_FEEDBACK.md), section 5.

**Can I vote twice?** No. A one-time nullifier derived inside your zero-knowledge proof blocks any
second vote, without ever revealing your identity.

**Do I need a wallet?** Voters do not. Organisers need a wallet on the network of their event (Preprod or Mainnet) to create and publish it.

**What if I lose my identity?** Your voting identity lives in the browser you registered with and
in the identity file downloaded at registration. Keep that file; you can upload it on the voting
page to vote from another browser. It cannot be recovered otherwise.
