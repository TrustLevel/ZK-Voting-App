# Close-out video: shot list and spoken text

Purpose: the final close-out video required by Catalyst Milestone 5. One speaker (Dominik),
screen recordings and a few title cards. Target length around five minutes. Spoken text is
written to be read aloud; adjust wording freely.

Recording notes:
- Record the screen parts first on a fresh event on Preprod so that every screen matches the
  guides.
- Keep the admin link and invitation links out of the recording, or blur them.
- Title cards are plain text on a neutral background; no animation needed.

---

## Shot 1: Title card

**On screen:** "Zero-Knowledge Voting Protocol on Cardano. Project Catalyst Fund 12, project
1200252. Close-out report."

**Spoken:**
"This is the close-out video for the zero-knowledge voting protocol on Cardano, a Fund 12
project by TrustLevel. In the next few minutes I will show what we built, what the testing
and the audit found, and what we learned."

---

## Shot 2: The problem, one card

**On screen:** three lines: "Who voted must stay private. Every vote must be counted once.
The result must be verifiable by anyone."

**Spoken:**
"Group votes in DAOs have a tension built in. You want to know that only members voted and
that each voted once. At the same time, members should not have to reveal how they voted to
the organiser, the server or the public. The usual answer is to trust the organiser. We wanted
a protocol where you do not have to."

---

## Shot 3: How it works, animated diagram or three cards

**On screen:** Card 1 "Register: identity stays in the browser, only a commitment is
published." Card 2 "Vote: the browser proves membership with a zero-knowledge proof."
Card 3 "Chain: the Plutus validators verify the proof and the nullifier and update the tally."

**Spoken:**
"The protocol is built on Semaphore, adapted to Cardano and the BLS12-381 curve. When a
participant registers, their browser generates a secret identity and sends only a public
commitment. The organiser publishes the list of commitments to the chain as a Merkle root.
When the participant votes, the browser creates a Groth16 proof that says: I am one of the
registered commitments, and here is a one-time nullifier that will stop me from voting twice.
It does not say which commitment. The smart contracts verify the proof and the nullifier on
chain and add the vote to the tally. The whole tally lives on the blockchain, so anyone can
check the result."

---

## Shot 4: Screen recording, the organiser side

**On screen:** vote.trustlevel.io. Create New Event. Fill the form. Admin Dashboard. Invite
Participants tab with a few addresses. Start Voting tab with the "Before you publish" box.
Click Publish, wallet signs twice, green "Event Published to Blockchain" card with the two
Cardanoscan links.

**Spoken:**
"This is the hosted application on the Cardano Preprod testnet. The organiser creates an
event: a name, simple or weighted voting, the options and the voting window. Participants
are invited by e-mail. Each gets a personal link. The dashboard shows who has registered.
Before publishing, the organiser sees exactly who is still missing, because publishing freezes
the group on chain. Publishing takes two signatures from the organiser's wallet: the Group NFT
with the voter list, then the Semaphore and Voting NFTs that hold the ballot. After about two
minutes the event is live."

---

## Shot 5: Screen recording, the voter side

**On screen:** Invitation e-mail. Event page. Generate Identity, file download, Register
Commitment. Later: Vote tab, Select Your Choice, Submit Vote, the four status lines
including "Generating ZK proof", then "Vote Submitted" with the explorer link.

**Spoken:**
"The voter opens the link. Generate Identity creates the secret identity in the browser and
downloads a backup file. Register Commitment sends the public commitment. That is the whole
registration. When the window opens, the voter picks an option and submits. The browser fetches
its membership path, generates the proof, which takes about thirty seconds, and sends the
proof to the service. The service builds the transaction, pays the fee from a relay wallet and
submits it. The voter needs no wallet, no ADA and signs nothing. The confirmation links to the
transaction on the explorer."

---

## Shot 6: Screen recording, the explorer and the results

**On screen:** Cardanoscan page of the vote transaction, then the results page during the
vote (turnout only), then after the end (results by option).

**Spoken:**
"On the explorer you can see the transaction. It carries the proof and the updated tally, but
no address of the voter. During the vote the application shows only the turnout. The per
option result is revealed when the window closes. That was a direct request from our testers,
who saw interim numbers influencing later voters."

---

## Shot 7: Testing and audit, one card with numbers

**On screen:** "Audit: 42 findings, all contract findings resolved. 154 on-chain tests + 40 in
the Semaphore library. Testers: CHIL Stake Pool, Gimbalabs, a five-person live vote, the
Catalyst reviewers. Scripted test: 15 voters, concurrency and attack scenarios."

**Spoken:**
"In milestone four the contracts were audited with a property-based method: every security
property was written down first, then traced to the condition that enforces it and to a test.
The audit produced 42 findings, including a critical gap in the upstream library's test suite,
which we fixed and contributed back. Two Cardano community organisations tested the
application as organisers and voters, and we ran a scripted test with 15 voters, including
double votes, replays, non-members and votes outside the window. Every attack was rejected,
and every finding from the testing was fixed before the final run."

---

## Shot 8: What we learned, one card

**On screen:** "1. Voters should never need a wallet. 2. Anonymity is not ballot secrecy.
3. Off-chain state needs the same care as on-chain state."

**Spoken:**
"Three things we learned. First, the wallet was the biggest hurdle for voters, so we removed
it. Second, the proof hides who voted, not what was voted. Hiding interim results helps, but
real ballot secrecy would need encrypted ballots, and that should be designed in from the
start. Third, the most serious bug we found was not in the cryptography but in how the server
stored the used nullifiers. A scripted test with real failures found it; demos would not
have."

---

## Shot 9: What is next and where to find everything

**On screen:** "Next: ballot secrecy, self-hosting support, DAO integrations.
github.com/TrustLevel/ZK-Voting-App. vote.trustlevel.io"

**Spoken:**
"Everything is open source under Apache 2.0: contracts, circuits, backend, frontend, the
audit, the test reports and the user feedback. The next steps are ballot secrecy, better
support for self-hosting, and integrations with DAO tooling on Cardano. If your organisation
runs group votes and wants to try the protocol, the organiser and voter guides are in the
repository, and the application is live on Preprod. Thank you to the testers, to the
reviewers and to the Catalyst community for funding this work."

---

## Shot 10: End card

**On screen:** "TrustLevel. github.com/TrustLevel/ZK-Voting-App. Project Catalyst Fund 12,
project 1200252."

No spoken text.
