# Feedback Questionnaire
## Blockchain Voting Application — Testing Phase

---

### Tester Information

**Name:** pinusch

**GitHub:** pinusch

**Organization:**

**RSS / Social media:**

**Email:**

**Wallet used:**

- [ ] Eternl
- [ ] Nami
- [ ] Vespr
- [ ] Lace
- [ ] Flint
- [ ] Other: _______________

**Device and operating system:**

**Prior experience with dApps:**
- [ ] None — this is my first time
- [ ] Basic — I have used a dApp occasionally
- [ ] Intermediate — I use dApps regularly
- [ ] Advanced — I develop or manage blockchain projects

**Date of the test:** 2026-10-05

---

### Questions

**Q1 — What aspects of the application are well executed?**

*What worked as expected or better than expected?*

**Answer:**

---

**Q2 — How was your experience navigating the application?**

*Think about the onboarding, the clarity of each step, the interface messages, and how easy it was to understand what to do at each point. Was there any moment where you got stuck or ran into an error? Include the wallet connection if applicable.*

Overall experience rating:
- [ ] 1 — Very confusing
- [ ] 2 — Difficult
- [ ] 3 — Acceptable
- [ ] 4 — Clear
- [ ] 5 — Very intuitive

Comments:

**Answer:**

---

**Q3 — Did you feel that the voting process was transparent and verifiable?**

*Were you able to understand what happened to your vote once it was cast? Did the application give you confidence that the result would be accurate and tamper-proof? What gave you that sense — or the lack of it?*

**Answer:**

---

**Q4 — What use cases could this application have for the Cardano community?**

*DAO governance, Catalyst, SPOs, NFT communities, community treasuries, or anything else that comes to mind.*

**Answer:**

---

**Q5 — What would you add, change, or remove if you could?**

*Open question. It could be a feature, a flow, a message, something visual — whatever has been on your mind.*

**Answer:**

---

*Thank you for your time and input. This feedback is key to the development of the application.*

---

## Own testing: live group test with five participants, 2026-10-05

The tester organised a real event on the hosted application (event 1869725828, Cardano Preprod,
Milestone 3 deployment) with five participants who registered through their invitation links and
voted from the browser with an Eternl wallet. Three votes were confirmed on-chain on the first
attempt; two failed at first.

| # | What happened | Finding |
|---|---|---|
| 1 | A voter was told "Insufficient funds" although the wallet held enough test ADA. The vote had been built on inputs that a still-pending vote already spent. | F10 (misleading message), F6 (collision) |
| 2 | The second successful voter saw the running tally while others had not voted yet. | F9 (interim results) |
| 3 | A vote was rejected on the first attempt and succeeded on the second: two votes within one block collided on the shared state UTxO. | F6 |

### Timeline and on-chain evidence

Event `1869725828` ("Group Test event"), Cardano Preprod, simple vote with the options A, B and C.
Times in UTC on 2026-10-05; the transactions are public on the chain. The on-chain state and the
times were read back from the public event record of the hosted backend and from the Preprod
chain (Koios) on 2026-10-29.

| Time | What | Transaction |
|---|---|---|
| 09:18:39 | Invitations sent to the five participants | — |
| 09:20:58 | Group NFT minted: the group Merkle tree with the five registered commitments is written on-chain | [`1d8bd719c9237fcc0f75f41677b00ef1dcfcb170fb738c5e20c49bfdcd8bcea1`](https://preprod.cardanoscan.io/transaction/1d8bd719c9237fcc0f75f41677b00ef1dcfcb170fb738c5e20c49bfdcd8bcea1) |
| 09:21:39 | Semaphore + Voting NFTs minted: the ballot is published | [`8eda0c92dced8f1579ce074c6549ab035c942b4379ad520ed31b84e1bffebd5f`](https://preprod.cardanoscan.io/transaction/8eda0c92dced8f1579ce074c6549ab035c942b4379ad520ed31b84e1bffebd5f) |
| 09:30:00 | Voting window opens | — |
| 09:32:00 | Vote 1 confirmed (fee 1.071755 ADA, paid by the voter's wallet in the Milestone 3 design) | [`4562a7bf5f6a066e9697217192744b63068fe015077786386d2ba7dde2c96427`](https://preprod.cardanoscan.io/transaction/4562a7bf5f6a066e9697217192744b63068fe015077786386d2ba7dde2c96427) |
| 09:33:31 | Vote 2 confirmed (fee 1.075011 ADA, paid by the voter's wallet in the Milestone 3 design) | [`dd60247300660709fdaf05ecc6270f8cf40bf897e4c47104ac9260cb9a433897`](https://preprod.cardanoscan.io/transaction/dd60247300660709fdaf05ecc6270f8cf40bf897e4c47104ac9260cb9a433897) |
| 09:34:57 | Vote 3 confirmed (fee 1.078223 ADA, paid by the voter's wallet in the Milestone 3 design) | [`07bf5de3c6f4f1674c9b52759b9281d6445e726594676b9930606efd9e469a1d`](https://preprod.cardanoscan.io/transaction/07bf5de3c6f4f1674c9b52759b9281d6445e726594676b9930606efd9e469a1d) |
| 09:35:00 | Voting window closes | — |

Result on-chain and in the API: A 1, B 1, C 1; 3 votes from 5 registered voters.

What the times show: the voting window was **five minutes** long. The three confirmed votes went
through one after another, about 90 seconds apart (proof in the browser, then one block
confirmation each), and the third one landed three seconds before the window closed. After
09:35:00 the validator rejects every vote, so the two attempts that failed at first had no window
left for a retry. The live test therefore hit three things at once: the collision of two votes
built on the same state (F6), the misleading message that reported it (F10), and a window too
short for five serialised votes. The create form now states the minimum derived from this:
at least 10 minutes plus about one minute per voter.

What changed because of these observations is in [M4_USER_FEEDBACK.md](../M4_USER_FEEDBACK.md),
sections 3 and 4: the misleading message and the interim results are fixed; the collision is
mitigated (automatic rollback, retry succeeds) and the fix for the remaining retry is deployed
with its verification pending. The project's regression run of 2026-10-28
([test report](../M4_TEST_REPORT.md)) shows the same scenarios against the fixed deployment.
