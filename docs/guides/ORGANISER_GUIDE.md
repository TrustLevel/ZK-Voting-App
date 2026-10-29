# Organiser guide: running a vote with the ZK Voting App

This guide walks you through one complete voting event as the organiser: create the event,
invite participants, publish it to the Cardano blockchain, and read the results. It follows
the hosted application at https://vote.trustlevel.io step by step, using the labels you will
see on screen. Every explanation in the app is also behind a small **i** button next to the
term it belongs to, so you can read it in place.

The application runs on **Cardano Mainnet** and on the **Cardano Preprod testnet**. You choose
the network when you create the event. On Mainnet you pay real ADA for publishing and prepay
your voters' transaction fees; on Preprod everything is free test ADA. Use Preprod to try the
system, Mainnet for a vote whose record should live on the public Cardano ledger.

Companion guide for your participants: [Voter guide](VOTER_GUIDE.md).

---

## Before you start

You need four things:

1. **A browser with a Cardano wallet extension.** Eternl or Lace. Eternl is the wallet all
   testers used so far.
2. **The wallet switched to the network of your event.** For a Mainnet event, Mainnet. For a
   Preprod event, in Eternl: Settings, Network, Preprod. The application refuses a wallet on
   the wrong network when you send the fee deposit or publish.
3. **ADA in that wallet.**
   - *Mainnet:* keep about **25 ADA plus the fee deposit** available (see *What a Mainnet event
     costs* below). The wallet must hold one plain-ADA output of at least 5 ADA, which the two
     publishing transactions use as collateral.
   - *Preprod:* request free test ADA from the
     [Cardano testnet faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) with your
     Preprod address. The faucet's default amount once is enough; the same 5 ADA collateral
     rule applies.
4. **The e-mail addresses of your participants.** Each participant receives a personal
   invitation link by e-mail.

Your participants need **no wallet and no ADA** on either network. They only need the
invitation link and a browser.

### What a Mainnet event costs

| Item | Amount | When |
|---|---|---|
| Locked in the three event contracts | 15 ADA (5 ADA each), stay there | Publishing |
| Transaction fees for the two publishing transactions | about 1.5 ADA | Publishing |
| Collateral | one plain-ADA output of at least 5 ADA in your wallet; not spent unless a script fails | Publishing |
| **Fee deposit** | **1.3 ADA per registered voter**, sent to the voting service | Before publishing |

The fee deposit prepays your voters' transaction fees, so they need no wallet. It is the cost
of running the event: **any unused remainder is not refunded.** If more participants register
after you sent the deposit, the dashboard shows the missing amount and lets you top it up.

On Preprod nothing of value is involved: no deposit, free test ADA for the two transactions.

Two more things to know about the network:

- The choice is made on the create form and **cannot be changed afterwards**. Every page shows
  a **Cardano Mainnet** or **Cardano Preprod testnet** badge next to the event name.
- Mainnet has to be enabled by the operator of the instance. If the tile says *Not available on
  this server*, the instance serves Preprod only. On https://vote.trustlevel.io both networks
  are live.

### Timing

The voting window is fixed when you create the event, so plan it before you start. The minimums
below are what the system needs technically; they come from the measured flow and are repeated
under the date fields in the app.

- **Start:** at least 10 minutes from now. Everyone who should vote must be registered before
  you publish (registering takes a participant under a minute once they have the link), and
  publishing takes about 5 minutes (two transactions, each confirmed on-chain). Publishing has
  to be finished 90 seconds before the start.
- **Voting period:** at least 10 minutes plus about 1 minute for each voter. A vote takes about
  half a minute in the browser plus one to two minutes on-chain, and votes are processed one
  after another.
- **Invitation links** are valid for seven days after you send them.

---

## The two pages at a glance

Creating an event has two steps on two pages; the strip at the top of each page tells you
where you are.

| Step | Page | What happens there |
|---|---|---|
| 1 | **Create New Voting Event** (`/create`) | Name, network, voting type, options and voting period. Fixed once the event exists. |
| 2 | **Organiser Dashboard** (`/event/<id>/manage`) | Invite participants, publish the event to the blockchain, read the results. |

The organiser dashboard itself has four numbered setup steps across the top. You can click
them directly, and each one ends with a **Next** button:

| Step | Label | What happens there |
|---|---|---|
| 1 | Configure Parameter | Read-only summary of network, voting type and options |
| 2 | Invite Participants | Add e-mail addresses, send the invitations, watch who has registered |
| 3 | Start Voting | Fee deposit (Mainnet), the *Before you publish* checklist, publishing with your wallet |
| 4 | Voting Results | Turnout while the vote runs, per-option results after it ends |

---

## Step 1: Create the event

1. Open https://vote.trustlevel.io and click **Create New Event**. The page
   **Create New Voting Event** opens; the strip at the top shows *Step 1: Event parameters
   (this page)* and *Step 2: Invite & publish (organiser dashboard)*.
2. Fill in **Voting Configuration**:
   - **Event Name**: the title your participants will see, for example "Treasury allocation Q1".
   - **Cardano Network**: **Preprod testnet** or **Mainnet**. The line under the tiles repeats
     what the choice means; the **i** button explains it in full. The network cannot be changed
     after the event is created.
   - **Voting Type**: **Simple** (1 vote per person) or **Weighted** (each voter distributes a
     fixed number of points across the options). For Weighted, a field **Total Voting Power**
     appears. The default is 100 points; every voter has to distribute exactly this amount.
   - **Voting Options**: at least two. **Add Option** adds a row, the bin icon removes one.
3. Fill in **Voting Period**: **Start Date & Time** and **End Date & Time**. Times are in your
   local time. The start cannot be in the past and the end must be after the start; the hints
   under the fields state the minimums from *Timing* above.
4. Under **Connect your wallet and create the event**, click **Connect Wallet** and choose
   your wallet in the dialog. Approve the connection in the wallet extension. The page then
   shows **Wallet Connected** with a shortened address. If the wallet is on a different
   network than the one you chose, a notice tells you so: you can still create the event, but
   you will need a wallet on the event's network to publish it.
5. Click **Create Event**.

The browser moves to the **Organiser Dashboard** of the new event.

`*(screenshot to follow: Create New Voting Event form, Mainnet and Weighted selected, three options)*`

Name, network, voting type, options and voting window are fixed once the event exists. Check
them before you click **Create Event**.

---

## Step 2: Keep the organiser link

At the top of the Organiser Dashboard you see the box **Your organiser link** with the line
**Use this link to open your organiser dashboard. Keep it secure.** and a **Copy** button.

- This link is the only key to the dashboard; there is no login. Anyone who has it can invite
  and remove participants and publish the event. Store it like a password.
- There is no password reset. If you lose the link, you lose access to the dashboard. The event
  itself stays intact on-chain.

Below the box, the setup steps **Configure Parameter**, **Invite Participants**,
**Start Voting** and **Voting Results** show where you are. Step 1 is a read-only summary of
what you entered; click **Next: Invite participants**.

`*(screenshot to follow: Organiser Dashboard header with the network badge, the organiser link box and the four setup steps)*`

---

## Step 3: Invite participants

Open **Invite Participants**.

1. Type an e-mail address into the field and click **Add Participant** (or press Enter).
   Repeat for every participant.
2. The **Participant List** shows every address with a badge: **Pending** (invited, not yet
   registered) or **Registered**. The counters **Total**, **Registered** and **Pending** sit
   next to the heading; **Refresh** reloads them. **Remove** deletes a participant from the
   list.
3. Read the **Important Notice**: invitations can be sent **once**. Complete the list first.
4. Click **Send Invitations to All Participants**. The result box reports
   **All Invitations Sent Successfully!**, or **Invitations Sent with Errors** with the
   addresses that failed. After sending, the input field disappears: *Invitations have been
   sent. New participants can no longer be added to this event.*

Each participant receives an e-mail with the subject "You're invited to vote in
<event name>" and a personal link. The link is bound to that participant and **expires seven
days after it was sent**. Participants have to register within that week and before you
publish, so send the invitations when you are ready to run the vote, not weeks ahead.

Click **Next: Start voting** when the invitations are out.

`*(screenshot to follow: Invite Participants with three addresses, one Registered, two Pending)*`

---

## Step 4: Wait for registrations, then publish

Participants register by opening their link, clicking **Generate Identity** and then
**Register Commitment** (see the [Voter guide](VOTER_GUIDE.md)). Their badge in your
Participant List changes to **Registered**.

Open **Start Voting** when you want to publish. The page shows, from top to bottom:

- **Preview: Blockchain Transaction Data**: the start and end as they will be written on-chain
  (POSIX timestamps) and your wallet address.
- **Before you publish**: the counters *invited*, *registered* and *still pending*, a
  **Refresh** button, and the folded list **Who is still pending**. The box explains:
  *Publishing freezes the voter group on-chain. Only participants who have registered by now
  can vote.* Anyone still pending will not be able to vote, even if they register later. Under
  **What happens when you click Publish** it lists the transactions your wallet will sign; on
  Mainnet it also states the real-ADA costs.
- **Fee deposit** (Mainnet only): *Fee deposit: N ADA (registered voters × 1.3 ADA). This
  covers your voters' transaction fees and is the cost of running this event; any unused
  remainder is not refunded.* Connect your wallet first, then click **Send fee deposit
  (N ADA)** and sign in your wallet. The page reports *Building the deposit transaction...*
  and then *Fee deposit recorded.*; the box turns green and shows **Funded: N ADA deposited**
  with a link to the transaction. The service verifies the deposit on the blockchain; this
  takes about a minute. If more participants register afterwards, the box shows the amount
  still missing and the button lets you top it up.
- The wallet status: **Wallet Connected**, or **Wallet Not Connected** with a **Connect
  Wallet** button if you opened the dashboard in a fresh browser session.
- The button **Publish Voting Event to Blockchain**. It stays disabled until **at least one
  participant has registered**, the wallet is connected and, on Mainnet, the fee deposit is
  funded. If nobody has registered yet, the red line *No participant has registered yet. Send
  the invitations and wait until at least one participant has registered.* tells you so.

`*(screenshot to follow: Start Voting with the Before you publish box, 3 invited, 2 registered, 1 pending, and the fee deposit box)*`

Click **Publish Voting Event to Blockchain**. A status box appears right under the button and
walks through two transactions:

1. **Step 1/2: Minting Group NFT**. Your wallet opens and asks you to sign the first
   transaction: the Group NFT that carries the registered voter list. Sign it.
2. The page waits for the confirmation (*Do not close this window. Blockchain transactions may
   take 1-2 minutes.*).
3. **Step 2/2: Minting Voting NFTs**. Your wallet asks for the second signature: the Semaphore
   and Voting NFTs that hold the ballot. Sign it.
4. After the second confirmation a browser message *Voting event published to blockchain!*
   pops up. Close it. The green box **Event Published to Blockchain!** appears. It lists the
   policy IDs, the validator address and both transaction hashes, each with a link to the
   Cardano explorer of the event's network, and a **View Results** button.

The transactions are built and submitted by the voting service; your wallet only signs. The
service never sees your keys, and your browser never talks to the blockchain directly.

`*(screenshot to follow: wallet signature prompt during Step 1/2)*`
`*(screenshot to follow: Event Published to Blockchain box with the explorer links)*`

From now on the event is live on-chain. Options, dates and the voter group cannot be changed.
Participants who open their link see the vote as soon as the start time is reached.

If something fails, a browser message *Failed to start voting event* shows the reason, and the
status box disappears. If you rejected the first signature, nothing has been published; fix the
cause (usually the wallet, its network, or missing ADA) and click Publish again. If the failure
happened after the first transaction was already confirmed, do not simply retry: note the error
and contact the operator of the instance, because a retry would start a new set of
transactions.

---

## Step 5: While the vote runs

**Voting Results** shows the box **Voting in Progress** with the line **Turnout so far: X of N
registered voters** and a **Refresh turnout** button.

Per-option counts are deliberately **not** shown while voting is open, neither to you nor to
the voters, so that nobody is influenced by interim numbers. The turnout is visible to you
only: voters and the public results page see neither counts nor turnout until the end. This is
enforced by the server, not only hidden in the page.

The tally itself is written to the Cardano blockchain with every vote. A technically minded
observer can read it there at any time. The application does not provide a way to hide it
on-chain; see "What you can and cannot see" below.

`*(screenshot to follow: Voting Results during the vote, turnout line visible)*`

---

## Step 6: After the end date

Once the end time has passed, **Voting Results** shows:

- **Voting Statistics**: when voting ended, **Votes Cast** (ballots, one per voter) and
  **Registered Voters**.
- **Results by Option**: every option sorted by result, with its votes for a simple vote or
  its share of the points for a weighted vote. **Refresh Results** reloads the numbers from
  the blockchain.
- **Blockchain Verified**: a reminder that every vote was verified on-chain and that the
  result is final.

You can share the results with anyone, including people who were not invited. The public
results page needs no token:

```
https://vote.trustlevel.io/event/<event id>/results
```

While the vote is open it says *Results are not available yet. They are revealed when the
voting period ends.* After the end it shows the per-option results as votes or points with
their percentage, and for a weighted vote the line *N voters · M points distributed*.

`*(screenshot to follow: Results by Option after the end of the vote)*`
`*(screenshot to follow: public results page)*`

---

## What you can and cannot see

| You can see | You cannot see |
|---|---|
| Who was invited and who registered | Which option a particular participant chose |
| How many have voted so far | Whether a particular participant has voted |
| The final result per option | Anything that links a vote to a person |

Every vote is submitted with a zero-knowledge proof of membership in the voter group. The
proof shows that the voter is one of the registered participants, not which one. A one-time
nullifier derived inside the proof blocks a second vote from the same identity.

Two limits are stated openly:

- **The chosen option is readable on-chain.** The protocol hides who voted, not what was
  voted. Nobody can tie a vote to a participant, but anyone can follow the running tally on
  the blockchain.
- **The service operator could correlate requests.** The voter's browser asks the server for
  its membership path and then submits the vote through the same server. An operator who logs
  both could link them. The hosted instance does not do this; a self-hosted instance is under
  your own control.

---

## Common messages and what to do

| Message | Meaning | What to do |
|---|---|---|
| **Access Denied** / *You need a valid organiser token to open the organiser dashboard.* | The URL has no valid organiser token | Open the dashboard through the organiser link you copied |
| **Wallet Not Connected** | The browser session lost the wallet connection | Click **Connect Wallet** and select your wallet again |
| *Your wallet is connected to Mainnet, but this event is on Preprod testnet* (or the other way round) | The wallet is on the wrong network | Switch the wallet to the event's network and reconnect |
| *No suitable collateral UTxO in the wallet (need one pure-ADA UTxO of at least 5 ADA)* | The wallet has no plain-ADA output of at least 5 ADA | Send yourself 5 ADA or more in one plain output (Preprod: request test ADA from the faucet), wait for it to arrive, try again |
| *Fee deposit missing* / **Publish** button stays disabled on Mainnet | The deposit has not been sent or does not cover all registered voters | Click **Send fee deposit** in the Fee deposit box and wait until it shows *Funded* |
| *Invitations Sent with Errors* with a list of addresses | Some e-mails could not be delivered | Check the addresses |
| **Publish** button stays disabled | Nobody registered yet, wallet not connected, or (Mainnet) deposit not funded | Check the **Before you publish** box and the Fee deposit box |
| *Results could not be loaded from the blockchain.* | The chain query failed temporarily | Click **Refresh Results** again after a moment |

---

## Running your own instance

The application is open source (Apache 2.0): https://github.com/TrustLevel/ZK-Voting-App.
The [README](../../README.md) describes local development and
[DEPLOY.md](../../DEPLOY.md) the Docker-based deployment. A self-hosted instance needs a
Blockfrost project per network, a relay wallet per network that pays the vote transactions on
behalf of the voters, and an e-mail sender for the invitations. The Mainnet one-offs (VKey
reference UTxO, relay wallet collateral) are described in
[docs/MAINNET_SETUP.md](../MAINNET_SETUP.md).
