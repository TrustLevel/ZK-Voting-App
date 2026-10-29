# Tutorial video: shot list and spoken text

Purpose: the user tutorial for Milestone 5. Two parts that can be published as one video with
chapters or as two short videos: the organiser part and the voter part. Screen recording
with voice-over, no talking head needed. Follows the [Organiser guide](../../guides/ORGANISER_GUIDE.md)
and the [Voter guide](../../guides/VOTER_GUIDE.md) exactly, so viewers can pause and read along.

Preparation:
- Eternl on Preprod with test ADA from the faucet (one plain-ADA UTxO of at least 5 ADA).
- Two or three test e-mail addresses you control, for the voter part.
- Set the event start about 10 minutes after you expect to publish, so the recording of the
  voter part can follow without a long wait. Set the end a few minutes after that for the
  results part.
- Keep the admin link and invitation links out of frame or blur them.

---

## Part A: Organiser

### A1: Intro card

**On screen:** "ZK Voting App. Tutorial part 1: running a vote as the organiser."

**Spoken:**
"In this tutorial I run a complete vote with the ZK Voting App: create the event, invite
participants, publish it to the Cardano blockchain and read the results. The application
runs on the Cardano Preprod testnet, so no real money is involved."

### A2: What you need

**On screen:** Eternl settings with Preprod selected; the faucet page.

**Spoken:**
"As the organiser you need a Cardano wallet extension, Eternl, Lace or Yoroi, switched to the
Preprod network, and some free test ADA from the Cardano testnet faucet. Your participants need
nothing but a browser and their invitation link."

### A3: Create the event

**On screen:** vote.trustlevel.io, click Create New Event. Connect Wallet, choose Eternl,
approve. Fill Event Name, choose Weighted, keep 100 points, enter three options, set start and
end. Click Create Event.

**Spoken:**
"On the start page click Create New Event. Connect your wallet. Give the event a name. Choose
Simple for one vote per person, or Weighted if every voter should distribute points across the
options. I take Weighted with 100 points. Enter at least two options. Set the start and end
of the voting window in your local time, and leave some room before the start, because
publishing takes a couple of minutes. Click Create Event."

### A4: The admin link

**On screen:** Admin Dashboard header, the line "Use this link to access your event
dashboard. Keep it secure.", the Copy button.

**Spoken:**
"The admin dashboard opens. Copy this link and store it like a password. It is the only way
back into the dashboard, and anyone who has it can manage the event."

### A5: Invite participants

**On screen:** Invite Participants tab. Add three addresses. The Participant List with
Pending badges. The Important Notice. Click Send Invitations to All Participants. Success
card.

**Spoken:**
"On the Invite Participants tab, add one e-mail address at a time. The list shows everyone as
Pending. Note the warning: invitations are sent once, so complete the list first. Then send
them. Every participant gets a personal link."

### A6: Watch registrations

**On screen:** Participant List with one address switched to Registered after a voter has
registered (cut to the voter part if needed).

**Spoken:**
"When a participant registers, the badge changes to Registered. You can only publish once at
least one participant has registered, and only registered participants will be able to vote."

### A7: Publish

**On screen:** Start Voting tab. The Preview box, the Before you publish box with counters and
the "What happens when you click Publish" list. Click Publish Voting Event to Blockchain.
Step 1/2 card, Eternl signature prompt, sign. Waiting. Step 2/2 card, sign again. Green card
Event Published to Blockchain with two Cardanoscan links; open one.

**Spoken:**
"The Start Voting tab shows what will be written on chain and who is still pending. Read the
list of what happens when you publish: two signatures, one for the Group NFT that carries the
voter list, one for the Semaphore and Voting NFTs that hold the ballot. Click Publish. Sign the
first transaction. The page waits for the confirmation, about one to two minutes, then asks for
the second signature. When the green card appears, the event is live. Both transactions can be
checked on Cardanoscan."

### A8: During and after the vote

**On screen:** Voting Results tab during the vote, the turnout line and Refresh turnout. Then
after the end: Voting Statistics, Results by Option, Blockchain Verified. Then the public
results URL.

**Spoken:**
"While voting is open the dashboard shows only how many have voted. The results per option
appear when the window closes, so that nobody is influenced by interim counts. The public
results page works without any token, so you can share the result with anyone."

### A9: End card part 1

**On screen:** "Part 2: voting as a participant."

---

## Part B: Voter

### B1: Intro card

**On screen:** "ZK Voting App. Tutorial part 2: casting an anonymous vote."

**Spoken:**
"In this part I vote as a participant. I need nothing but the invitation e-mail and a browser.
No wallet, no ADA, no signature."

### B2: Open the invitation

**On screen:** The invitation e-mail "You're invited to vote in …". Click the button. The event
page with the tabs Register, Vote, Results.

**Spoken:**
"The e-mail contains a personal link. Open it. The page shows the event and three tabs."

### B3: Register

**On screen:** Click Generate Identity. The file download. The Identity File Downloaded card
with the Keep this file safe warning. The Commitment ID. Click Register Commitment.
Registration Complete.

**Spoken:**
"Generate Identity creates my voting identity inside the browser and downloads a backup file.
Keep that file: you need it if you vote from another device, and nobody can replace it. The
long number is the commitment, the only thing that goes to the server. Click Register
Commitment, and registration is complete."

### B4: Wait for the window

**On screen:** Vote tab with "Voting Hasn't Started Yet" and the date.

**Spoken:**
"Until the organiser has published the event and the start time is reached, the Vote tab tells
me when voting begins. The page updates by itself."

### B5: Vote

**On screen:** Vote tab with Cast Your Vote. For the weighted event: Distribute 100 Points,
move the sliders until Points Remaining shows 0. Click Submit Vote. The status lines
Fetching Merkle proof, Encoding vote signal, Generating ZK proof (this may take ~30s),
Submitting vote. Then Vote Submitted with Your choice and View on Explorer.

**Spoken:**
"When voting is open I distribute my points, here across two options, until nothing remains.
Submit Vote. The browser loads my membership path, encodes my choice, and generates the
zero-knowledge proof. This takes about thirty seconds and happens entirely on my device. Then
the service records the vote on the blockchain and pays the fee. Vote Submitted. The link
opens the transaction on the explorer: it contains the proof and the new tally, nothing about
me."

### B6: Identity on another device (optional)

**On screen:** Open the invitation link in another browser. Vote tab shows Identity File
Required. Click Upload Identity File, choose the JSON file. The vote form appears.

**Spoken:**
"If I open the vote on a different browser, the page asks for the identity file from
registration. Upload it, and I can vote as usual."

### B7: Results

**On screen:** Results tab during the vote with "X of N registered voters have voted so far",
then after the end with the per-option results.

**Spoken:**
"The Results tab shows the turnout while voting is open and the per-option result after the
end, loaded from the blockchain."

### B8: End card

**On screen:** "Guides: github.com/TrustLevel/ZK-Voting-App/docs/guides. Live:
vote.trustlevel.io"

**Spoken:**
"The written guides for organisers and voters are in the repository. The application is live
on the Preprod testnet; try it with your own group."
