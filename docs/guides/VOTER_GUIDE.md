# Voter guide: casting an anonymous vote with the ZK Voting App

You have been invited to a vote that runs on the ZK Voting App. This guide shows what to do,
step by step, using the labels you will see on screen. Every term on the page has a small
**i** button next to it that explains it in place.

Short version: open your invitation link, click **Generate Identity**, keep the downloaded
file, click **Register Commitment**, come back when voting opens, pick your option and click
**Submit Vote**.

---

## What you need

- **The invitation link** from the e-mail with the subject "You're invited to vote in
  <event name>". The link is personal and valid for seven days. Do not forward it.
- **A browser.** Desktop or mobile.

You do **not** need a Cardano wallet, any ADA or an account, and you never sign anything. The
voting service submits your vote to the blockchain and pays its fee. The badge at the top of
the event page says whether the vote runs on **Cardano Mainnet** (the organiser has prepaid
the fees) or on the **Cardano Preprod testnet** (test network, no real money involved); for
you the steps are the same.

---

## Step 1: Open the invitation link

Click the button in the e-mail. The page shows the event name, a strip with the **Voting
period**, the **Type** (simple vote, or weighted with the number of points) and the
**Status** (*Not published yet*, *Upcoming*, *Voting open* or *Voting ended*), and three steps
across the top: **Register**, **Vote** and **Results**. Times are shown in your local time
with the time zone in brackets. While the link is checked you see **Validating Invitation**.

The box **Your event link** holds the address of this page with a **Copy** button. Open the
same link later to vote; together with your identity file it lets you continue on another
device.

If you see **Invalid Invitation**, the link is incomplete or has expired. Invitation links are
valid for seven days after they were sent. If yours has expired, ask the organiser.

`*(screenshot to follow: event page after opening the invitation link, Register step active)*`

---

## Step 2: Register

Registration creates your anonymous voting identity. Do this as soon as you can: the
invitation link is valid for seven days, and the organiser can only publish the vote with the
participants who have registered by then. Registering does not cast a vote.

1. Under **Registration**, click **Generate Identity**.
   Your browser creates two random secret numbers, your voting identity, entirely on your
   device. A file named `semaphore-identity-event-<number>.json` is downloaded automatically.
2. The box **Identity File Downloaded** shows the warning **Keep this file safe!**
   - You'll need it to vote later.
   - Never share your identity file with anyone. Whoever has the file can vote in your place.
   - If you lose this file and your browser data, you cannot vote.
3. Below it you see **Your Commitment ID**, a long number. This is the only thing that is sent
   to the server: a public fingerprint of your identity from which the secrets cannot be
   recovered.
4. Click **Register Commitment**. The box changes to **Registration Complete**.

`*(screenshot to follow: Identity File Downloaded with the Keep this file safe warning)*`
`*(screenshot to follow: Registration Complete)*`

Your browser also keeps the identity in its local storage. If you vote from the same browser
on the same device, you will not need the file. The file is your backup for any other device.
Keep it until the vote has ended.

---

## Step 3: Wait for the voting window

The vote has a fixed start and end time, enforced by the blockchain. The status strip under
the event name and the **Vote** step tell you where things stand:

| What you see | Meaning |
|---|---|
| Status **Not published yet**; Vote step says *The voting start date has not been set yet.* | The organiser has not published the vote on the blockchain yet |
| Status **Upcoming**; **Voting Hasn't Started Yet** with a date | Published; come back at that time (the page updates itself) |
| Status **Voting open**; **Cast Your Vote**, *Voting is open until …* | You can vote now |
| Status **Voting ended**; **Voting Has Ended** | The window is closed; see the Results step |

---

## Step 4: Vote

Open your invitation link again (or the same page) and go to **Vote**.

If you are on a different browser or device than the one you registered with, the page shows
**Identity File Required**. Click **Upload Identity File** and select the
`semaphore-identity-event-<number>.json` file from step 2.

Then make your choice:

- **Simple vote**: under **Select Your Choice**, pick one option.
- **Weighted vote**: under **Distribute <N> Points**, move the slider of each option. The
  counter **Points Remaining** must reach 0; the button stays disabled until all points are
  placed.

Click **Submit Vote**. A status box under the button walks through four steps and explains
each one:

1. **Fetching Merkle proof...** Your membership path in the voter group is loaded.
2. **Encoding vote signal...** Your choice is prepared as the message the proof commits to.
3. **Generating ZK proof... (this may take ~30s)** Your browser proves that you are a
   registered voter without revealing which one. Your identity never leaves the device.
4. **Submitting vote...** The voting service records your vote on the Cardano blockchain.
   No wallet or signature is needed from you.

Keep the tab open until you see **Vote Submitted**.

`*(screenshot to follow: Select Your Choice with one option selected)*`
`*(screenshot to follow: Generating ZK proof step)*`

---

## Step 5: Confirmation

The box **Vote Submitted** says *Your vote has been recorded anonymously on-chain.* and shows
**Your choice**, a **Transaction** link (**View on Explorer**) to the Cardano explorer of the
event's network, and a **View Results** button. The transaction contains your proof and the
updated tally, but nothing that identifies you: no wallet address, no name, no e-mail.

You can vote only once. A second attempt with the same identity is rejected.

`*(screenshot to follow: Vote Submitted box with the explorer link)*`

---

## Step 6: Results

While the vote is open, **Results** says *Results are not available yet. They are revealed
once the voting period ends.* You see neither the counts per option nor how many people have
voted, so that nobody is influenced by interim numbers. After the end, click
**Refresh Results** to load the final tally from the blockchain: every option with its votes
(simple vote) or points (weighted vote) and its percentage.

Anyone can open the public results page without a link:
`https://vote.trustlevel.io/event/<event id>/results`. It shows the same thing: nothing
until the end, then the final tally.

---

## If something goes wrong

| Message | What it means | What to do |
|---|---|---|
| **Invalid Invitation** | Link incomplete, or older than seven days | Open the link from the e-mail again; if it has expired, ask the organiser |
| **Registration Required** on the Vote step | You have not registered yet | Click **Go to Registration** |
| **Identity File Required** | This browser has no copy of your identity | Upload the JSON file from registration |
| *Another vote is still being confirmed on the blockchain. Your vote was not counted yet — please try again in a few minutes.* | Someone else's vote is being written right now | Wait a few minutes, click **Submit Vote** again |
| *The voting period is not open right now.* | Start not reached or end passed | Check the dates in the strip under the event name |
| *Your vote could not be verified for this event.* | The proof did not match the published voter group, for example because you registered after publishing | Reload once and try again; if it persists, contact the organiser |
| *The organiser's fee budget for this event is used up …* | The organiser's prepaid fees are spent (Mainnet) | Nothing is required from you; try again later and tell the organiser |
| *The voting service could not pay the transaction fee.* | A problem on the service side | Nothing is required from you; try again in a few minutes |
| *Your vote identity has already been used in a previous attempt.* | A vote with your identity was already recorded | If you did not see **Vote Submitted** earlier, contact the organiser |

Every failed attempt is rolled back completely. You can always try again as long as the
window is open.

---

## What stays private, and what does not

- **Private:** who you are. Your identity secrets never leave your device. The server only
  receives a commitment at registration and a zero-knowledge proof at voting time. Nobody,
  including the organiser and the service operator, can tell which registered participant
  cast which vote.
- **Not private:** the content of the vote. The chosen option and the running tally are
  written to the public blockchain. What the protocol guarantees is that the option cannot be
  tied to you.
- **Not possible:** voting twice. A one-time nullifier derived inside your proof is recorded
  on-chain and blocks a second vote from the same identity.
