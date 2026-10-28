# Organiser guide: running a vote with the ZK Voting App

This guide walks you through one complete voting event as the organiser: create the event,
invite participants, publish it to the Cardano blockchain, and read the results. It follows
the hosted application at https://vote.trustlevel.io step by step, using the labels you will
see on screen.

The application runs on the **Cardano Preprod testnet**. No real money is involved.

Companion guide for your participants: [Voter guide](VOTER_GUIDE.md).

---

## Before you start

You need four things:

1. **A browser with a Cardano wallet extension.** Eternl, Lace or Yoroi. Eternl is the wallet
   all testers used so far.
2. **The wallet switched to the Preprod network.** In Eternl: Settings, Network, Preprod.
   A wallet on Mainnet will not work with this application.
3. **Free test ADA in that wallet.** Request it from the
   [Cardano testnet faucet](https://docs.cardano.org/cardano-testnets/tools/faucet) with your
   Preprod address. Publishing an event sends two transactions. The wallet must hold one
   plain-ADA UTxO of at least 5 ADA (used as collateral) plus the fees for both transactions.
   Requesting the faucet's default amount once is enough.
4. **The e-mail addresses of your participants.** Each participant receives a personal
   invitation link by e-mail.

Your participants need **no wallet and no test ADA**. They only need the invitation link and a
browser.

`[screenshot: Eternl settings with the Preprod network selected]`

---

## The four steps at a glance

After you create an event, its admin dashboard shows four numbered steps across the top:

| Step | Tab label | What happens there |
|---|---|---|
| 1 | Configure Parameter | Read-only summary of name, voting type and options |
| 2 | Invite Participants | Add e-mail addresses, send the invitations, watch who has registered |
| 3 | Start Voting | Publish the event to the blockchain with your wallet |
| 4 | Voting Results | Turnout while the vote runs, per-option results after it ends |

---

## Step 1: Create the event

1. Open https://vote.trustlevel.io and click **Create New Event**.
2. On the page **Create New Voting Event**, click **Connect Wallet** and choose your wallet in
   the **Connect Your Wallet** dialog. Approve the connection in the wallet extension. The page
   then shows **Wallet Connected** with a shortened address.
3. Fill in **Voting Configuration**:
   - **Event Name**: the title your participants will see, for example "Treasury allocation Q1".
   - **Voting Type**: **Simple** (1 vote per person) or **Weighted** (each voter distributes a
     fixed number of points across the options). For Weighted, a field **Total Voting Power**
     appears. The default is 100 points; every voter has to distribute exactly this amount.
   - **Voting Options**: at least two. **Add Option** adds a row, the bin icon removes one.
4. Fill in **Voting Period**: **Start Date & Time** and **End Date & Time**, in your local
   time. The start cannot be in the past, and the end must be after the start.
   Leave room between now and the start: publishing (step 4 below) takes two blockchain
   transactions of one to two minutes each, and the previous guide recommended a start at
   least 15 minutes ahead.
5. Click **Create Event**.

The browser moves to the **Admin Dashboard** of the new event.

`[screenshot: the Create New Voting Event form filled in, Weighted selected, three options]`

What you chose here is fixed once the event is published in step 4. Options, voting type and
dates can no longer be changed after that.

---

## Step 2: Keep the admin link

At the top of the Admin Dashboard you see the line **Use this link to access your event
dashboard. Keep it secure.** with a **Copy** button.

- This link contains the admin token for the event. Anyone who has it can invite and remove
  participants and publish the event. Store it like a password.
- There is no login and no password reset. If you lose the link, you lose access to the
  dashboard. The event itself stays intact on-chain.

`[screenshot: Admin Dashboard header with the admin link and the Copy button]`

---

## Step 3: Invite participants

Open the tab **Invite Participants**.

1. Under **Invite Participants**, type an e-mail address into the field and click
   **Add Participant** (or press Enter). Repeat for every participant.
2. The **Participant List** shows every address with a status badge: **Pending** (invited,
   not yet registered) or **Registered**. The counters **Total**, **Registered** and
   **Pending** sit above the list. **Remove** deletes a participant from the list.
3. Read the **Important Notice**: invitations can be sent **once**. Complete the list first.
4. Click **Send Invitations to All Participants**. The result card reports
   **All Invitations Sent Successfully!**, or lists the addresses that failed.

Each participant receives an e-mail with the subject "You're invited to vote in
<event name>" and a personal link. The link carries an invitation token that is bound to that
participant and **expires seven days after it was sent**. Participants have to register within
that week, so send the invitations when you are ready to run the vote, not weeks ahead.

`[screenshot: Invite Participants tab with three addresses, one Registered, two Pending]`

---

## Step 4: Wait for registrations, then publish

Participants register by opening their link, generating an anonymous identity in their
browser and clicking **Register Commitment** (see the [Voter guide](VOTER_GUIDE.md)). Their
badge in your Participant List changes to **Registered**.

Open the tab **Start Voting** when you want to publish. The page shows:

- **Preview: Blockchain Transaction Data**: the start and end dates as they will be written
  on-chain (as POSIX timestamps) and your wallet address.
- **Before you publish**: the counters *invited*, *registered* and *still pending*, a
  **Refresh** button, and the folded list **Who is still pending**. The box explains:
  *Publishing freezes the voter group on-chain. Only participants who have registered by now
  can vote.* Anyone still pending will not be able to vote, even if they register later.
- **What happens when you click Publish**: your wallet asks for two signatures, first the
  **Group NFT** that carries the registered voter list, then the **Semaphore + Voting NFTs**
  that hold the ballot. Each needs one to two minutes to confirm.
- The wallet status: **Wallet Connected**, or **Connect Wallet** if you opened the dashboard
  in a fresh browser session.

The button **Publish Voting Event to Blockchain** stays disabled until the dates are set, the
wallet is connected and **at least one participant has registered**. If nobody has registered
yet, the red line *No participant has registered yet. Send the invitations and wait until at
least one participant has registered.* tells you so.

`[screenshot: Start Voting tab with the Before you publish box, 3 invited, 2 registered, 1 pending]`

Click **Publish Voting Event to Blockchain**:

1. A blue status card shows **Step 1/2: Minting Group NFT**. Your wallet opens and asks you
   to sign the first transaction. Sign it.
2. The page waits for the confirmation (*Do not close this window. Blockchain transactions
   may take 1-2 minutes.*).
3. The card switches to **Step 2/2: Minting Voting NFTs**. Your wallet asks for the second
   signature. Sign it.
4. After the second confirmation a browser message *Voting event published to blockchain!*
   pops up. Close it. The green card **Event Published to Blockchain!** appears below. It lists
   the policy IDs, the validator address and both transaction hashes, each with a
   **View on Cardanoscan** link.

`[screenshot: wallet signature prompt during Step 1/2]`
`[screenshot: Event Published to Blockchain card with the two Cardanoscan links]`

From now on the event is live on-chain. Options, dates and the voter group cannot be changed.
Participants who open their link see the vote as soon as the start time is reached.

If something fails, a browser message *Failed to start voting event* shows the reason, and the
status card returns to its initial state. If you rejected the first signature, nothing has been
published; fix the cause (usually wallet or test ADA) and click Publish again. If the failure
happened after the first transaction was already confirmed, do not simply retry: note the
error and contact the operator of the instance, because a retry would start a new set of
transactions.

---

## Step 5: While the vote runs

The tab **Voting Results** shows the card **Voting in Progress** with the line
**Turnout so far: X of N registered voters** and a **Refresh turnout** button.

Per-option counts are deliberately **not** shown while voting is open, neither to you nor to
the voters, so that nobody is influenced by interim numbers. This is enforced by the server,
not only hidden in the page.

The tally itself is written to the Cardano blockchain with every vote. A technically minded
observer can read it there at any time. The application does not provide a way to hide it
on-chain; see "What you can and cannot see" below.

`[screenshot: Voting Results tab during the vote, turnout line visible]`

---

## Step 6: After the end date

Once the end time has passed, the tab **Voting Results** shows:

- **Voting Statistics**: when voting ended, the total number of votes, the number of
  registered voters.
- **Results by Option**: every option with its votes (or its percentage for weighted events),
  sorted by result. **Refresh Results** reloads the numbers from the blockchain.
- **Blockchain Verified**: a reminder that every vote was verified on-chain and that the
  result is final.

You can share the results with anyone, including people who were not invited. The public
results page needs no token:

```
https://vote.trustlevel.io/event/<event id>/results
```

It shows the same turnout line during the vote and the per-option results after the end.

`[screenshot: Results by Option after the end of the vote]`
`[screenshot: public results page]`

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
| **Access Denied** / *Please use the admin link provided when you created the event.* | The URL has no valid admin token | Open the dashboard through the admin link you copied |
| **Wallet Not Connected** | The browser session lost the wallet connection | Click **Connect Wallet** and select your wallet again |
| *No suitable collateral UTxO (need pure ADA ≥5 ADA)* | The wallet has no plain-ADA output of at least 5 ADA | Request test ADA from the faucet, wait for it to arrive, try again |
| *Invitations Sent with Errors* with a list of addresses | Some e-mails could not be delivered | Check the addresses; removing and re-adding a participant is possible before publishing |
| **Publish** button stays disabled | Dates missing, wallet not connected, or nobody registered yet | Check the **Before you publish** box |
| *Results could not be loaded from the blockchain.* | The chain query failed temporarily | Click **Refresh Results** again after a moment |

---

## Running your own instance

The application is open source (Apache 2.0): https://github.com/TrustLevel/ZK-Voting-App.
The [README](../../README.md) describes local development and
[DEPLOY.md](../../DEPLOY.md) the Docker-based deployment. A self-hosted instance needs a
Blockfrost project ID, a relay wallet that pays the vote transactions on behalf of the voters,
and an e-mail sender for the invitations.
