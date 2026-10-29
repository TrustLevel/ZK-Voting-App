# Voter guide: casting an anonymous vote with the ZK Voting App

You have been invited to a vote that runs on the ZK Voting App. This guide shows what to do,
step by step, using the labels you will see on screen.

Short version: open your invitation link, click **Generate Identity**, keep the downloaded
file, click **Register Commitment**, come back when voting opens, pick your option and click
**Submit Vote**.

---

## What you need

- **The invitation link** from the e-mail with the subject "You're invited to vote in
  <event name>". The link is personal. Do not forward it.
- **A browser.** Desktop or mobile.

You do **not** need a Cardano wallet, any ADA or test ADA, and you never sign anything. The
voting service pays the blockchain fee for your vote. The event page shows whether the vote
runs on the Cardano **Preprod testnet** (no real money involved) or on **Mainnet** (the
organiser has prepaid the fees); for you the steps are the same.

---

## Step 1: Open the invitation link

Click the button in the e-mail. The page shows the event name and three tabs across the top:
**Register**, **Vote** and **Results**. While the link is checked you see **Validating
Invitation**.

If you see **Invalid Invitation**, the link is incomplete or has expired. Invitation links are
valid for seven days after the organiser sent them. Ask the organiser.

`[screenshot: event page after opening the invitation link, Register tab active]`

---

## Step 2: Register

Registration creates your anonymous voting identity. Do this as soon as you can: the
invitation link is valid for seven days, and the organiser can only publish the vote with the
participants who have registered by then.

1. In the **Registration** card, click **Generate Identity**.
   Your browser creates a Semaphore identity, two random secret numbers, entirely on your
   device. A file named `semaphore-identity-event-<number>.json` is downloaded automatically.
2. The card now shows **Identity File Downloaded** and the warning **Keep this file safe!**
   - You need it to vote later.
   - Never share it with anyone. Whoever has the file can vote in your place.
   - If you lose it and your browser data, you cannot vote.
3. Below it you see **Your Commitment ID**, a long number. This is the only thing that is sent
   to the server: a public fingerprint of your identity from which the secrets cannot be
   recovered.
4. Click **Register Commitment**. The card changes to **Registration Complete**.

`[screenshot: Registration card after Generate Identity, with the Keep this file safe warning]`
`[screenshot: Registration Complete]`

Your browser also keeps the identity in its local storage. If you vote from the same browser
on the same device, you will not need the file. The file is your backup for any other device.

---

## Step 3: Wait for the voting window

The vote has a fixed start and end time, enforced by the blockchain. The **Vote** tab tells
you where things stand:

| What you see | Meaning |
|---|---|
| **Voting Not Yet Available** | The organiser has not published the vote on the blockchain yet |
| **Voting Hasn't Started Yet** with a date | Published; come back at that time (the page updates itself) |
| **Cast Your Vote**, *Voting is open until …* | You can vote now |
| **Voting Has Ended** | The window is closed; see the Results tab |

---

## Step 4: Vote

Open your invitation link again (or the same page) and go to the **Vote** tab.

If you are on a different browser or device than the one you registered with, the page shows
**Identity File Required**. Click **Upload Identity File** and select the
`semaphore-identity-event-<number>.json` file from step 2.

Then make your choice:

- **Simple vote**: under **Select Your Choice**, pick one option.
- **Weighted vote**: under **Distribute <N> Points**, move the slider of each option. The
  counter **Points Remaining** must reach 0; the button stays disabled until all points are
  placed.

Click **Submit Vote**. The page walks through four steps and explains each one:

1. **Fetching Merkle proof...** Your membership path in the voter group is loaded.
2. **Encoding vote signal...** Your choice is prepared as the message the proof commits to.
3. **Generating ZK proof... (this may take ~30s)** Your browser proves that you are a
   registered voter without revealing which one. Your identity never leaves the device.
4. **Submitting vote...** The voting service records your vote on the Cardano blockchain.
   No wallet or signature is needed from you.

Keep the tab open until you see **Vote Submitted**.

`[screenshot: Select Your Choice with one option selected]`
`[screenshot: Generating ZK proof step]`

---

## Step 5: Confirmation

The card **Vote Submitted** says *Your vote has been recorded anonymously on-chain.* and
shows **Your choice** and a **Transaction** link (**View on Explorer**) to the Cardano
explorer of the event's network. The transaction contains your proof and the updated tally, but nothing
that identifies you: no wallet address of yours, no name, no e-mail.

You can vote only once. A second attempt with the same identity is rejected.

`[screenshot: Vote Submitted card with the explorer link]`

---

## Step 6: Results

The **Results** tab shows the voting period and the voting type. While the vote is open it
shows *X of N registered voters have voted so far.* The numbers per option are revealed only
after the end time, so that nobody is influenced by interim counts. After the end, click
**Refresh Results** to load the final tally from the blockchain.

Anyone can open the public results page without a link:
`https://vote.trustlevel.io/event/<event id>/results`.

---

## If something goes wrong

| Message | What it means | What to do |
|---|---|---|
| **Invalid Invitation** | Link incomplete, or older than seven days | Open the link from the e-mail again; if it has expired, ask the organiser |
| **Registration Required** on the Vote tab | You have not registered yet | Go to the Register tab |
| **Identity File Required** | This browser has no copy of your identity | Upload the JSON file from registration |
| *Another vote is still being confirmed on the blockchain. Please wait about a minute and try again.* | Someone else's vote is in the same block | Wait a minute, click **Submit Vote** again; your vote was not counted yet |
| *The voting period is not open right now.* | Start not reached or end passed | Check the dates on the Results tab |
| *Your vote could not be verified for this event.* | The proof did not match the published voter group, for example because you registered after publishing | Reload once; if it persists, contact the organiser |
| *The voting service could not pay the transaction fee.* | A problem on the service side | Nothing is required from you; tell the organiser |

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
