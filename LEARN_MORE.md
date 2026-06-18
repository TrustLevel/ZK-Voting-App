# ZK Voting — Learn More

Anonymous, verifiable voting on Cardano. Voters prove they belong to an authorised group and
cast a ballot **without anyone — not even the organiser — being able to link the vote back to
them**, while every vote is tallied immutably on-chain.

> **Status: Preview · Public test live**
> The application is deployed and open for public testing on the **Cardano Preprod Testnet**.
> No real funds are involved — voting uses free test ADA. This is a preview release; expect
> testnet-only behaviour and occasional changes.

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

## Before you start (one-time setup)

Because this is a testnet preview, you need a Cardano wallet set to **Preprod** and some free
test ADA:

1. **Install a CIP-30 wallet** browser extension — [Eternl](https://eternl.io/),
   [Lace](https://www.lace.io/), or [Yoroi](https://yoroi-wallet.com/).
2. **Switch the wallet network to Preprod** (testnet), not Mainnet.
3. **Get free test ADA** from the [Cardano Testnet Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) — paste your wallet's Preprod address and request funds. A few test ADA is enough to cover transaction fees.

---

## For Organisers (Admins)

You set up and run a voting event end to end.

1. **Create the event** — connect your wallet at [vote.trustlevel.io](https://vote.trustlevel.io)
   and enter the event name, the options voters choose from, the voting mode (simple or weighted), and the voting date (must be at least ~15 minutes in the future).
2. **Invite participants** — add people by wallet address or email. Each invitee gets a unique private link. The group is closed: only invited people can register and vote.
3. **Wait for registration** — invitees open their link and register. Their browser generates a
   private cryptographic identity locally; only a public commitment is added to the group. No personal data is collected.
4. **Deploy on-chain** — once the participant list is final, publish the event on the blockchain: Two transactions anchor the voting contracts on Cardano. From here, options, dates, and group membership are **immutable**.
5. **Read the results** — when voting closes, the tally is publicly readable on-chain. You see
   the totals only — never who voted for what.

---

## For Voters (Participants)

1. **Open your invitation link** in a browser that has a Preprod-configured Cardano wallet
   (see setup above).
2. **Register** — connect your wallet and confirm. Your browser creates a Semaphore identity:
   two secret values that **never leave your device**. Only a public commitment is sent to the
   group.
3. **Wait for the voting window** — the event has a fixed start and end enforced by the blockchain.
4. **Vote** — during the window, pick your choice and submit. Your browser silently generates a
   zero-knowledge proof of membership, computes a one-time anti-double-vote nullifier, and submits
   the transaction. No one can link the vote back to you.
5. **See results** — once the event ends, the tally is public and final on-chain.

---

## Links

| | |
|---|---|
| Live application | https://vote.trustlevel.io |
| Source code (GitHub) | https://github.com/TrustLevel/ZK-Voting-App |
| Testnet faucet (free test ADA) | https://docs.cardano.org/cardano-testnets/tools/faucet |
| Semaphore protocol | https://semaphore.appliedzkp.org/ |

---

## FAQ

**Is this real money?** No. It runs on the Cardano **Preprod Testnet** with free test ADA.

**Can the organiser see how I voted?** No. The system is designed so that no party — organiser,
server, or blockchain observer — can link a vote to a voter.

**Can I vote twice?** No. A one-time nullifier derived inside your zero-knowledge proof blocks any
second vote, without ever revealing your identity.

**What if I lose my wallet/identity?** Your voting identity is derived from your wallet on your
device. Keep access to the same wallet you registered with for the duration of the event.
