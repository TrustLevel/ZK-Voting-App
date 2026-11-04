# Feedback Questionnaire
## Blockchain Voting Application — Testing Phase

---

### Tester Information

**Name:** Rodrigo Oyarzún

**Organization:** CHIL Stake Pool

**RSS / Social media:** https://x.com/ChileStakepo

**Email:**

**Wallet used:**

- [x] Eternl
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

**Date of the test:**

---

### Test session record

*Added by the project on 2026-11-04 after the Milestone 4 review, which noted that the
questionnaire names no date, device, event or transaction. Reconstructed from the hosted
instance's event records (events created with the tester's organiser wallet, invitations,
registrations) and from the chain (every transaction at the events' script addresses on Cardano
Preprod). Times are UTC. The wallet was Eternl (above); device and operating system are not
recorded by the application.*

**Test date:** 2026-10-08, 01:02–01:37 UTC, Milestone 3 deployment at vote.trustlevel.io. Nine
events created, five published on-chain, one complete cycle (invite, register, publish, vote); the
tester was his own voter.

| Event | Created (UTC) | Options | Invited / registered | Group NFT mint | Semaphore + Voting mint | Votes on-chain |
|---|---|---|---|---|---|---|
| 5543961983 "Tangananica o tanganana" | 01:02 | Tangananica / tanganana | 1 / 1 | [a564dc3d…](https://preprod.cardanoscan.io/transaction/a564dc3d61cf57761e153355af7074ba2d5ca8ce407bbe735ce10cf0c38c89c2) | [07e8b72f…](https://preprod.cardanoscan.io/transaction/07e8b72fc19a0a49a2c1981df76aed9415c0ac6224ed272d0353832fdf0af1ea) | none |
| 8834530701 "ronda 2", 1474308389 "ronda 3", 6791226673 / 1139782615 "ronda 4" | 01:06–01:13 | tangananica / tanganana | 1 / 1, 1 / 0, 1 / 0, 1 / 0 | not published | — | — |
| 1021364918 "ronda 5" | 01:15 | x / y | 1 / 1 | [7a719fc5…](https://preprod.cardanoscan.io/transaction/7a719fc56489a9096b93ba0cffa08c60709dd209e2e424d056979454d511f2c5) | record points at the mint of 5543961983 (start failure between the two mints, F11) | none |
| 8710622736 "ronda 6" | 01:18 | x / y | 1 / 1 | [7332af40…](https://preprod.cardanoscan.io/transaction/7332af4030cfe83b0ccc78aa2e2eb488897df6c62dcb5408677e8b297ab0dee7) | [8650bce0…](https://preprod.cardanoscan.io/transaction/8650bce0a9537a41e131c7472e2b453de72dcddc0b470a9036d0f44d727a7070) | none |
| 2623397610 "ronda 7" | 01:23 | x / y | 1 / 0 | [743878a2…](https://preprod.cardanoscan.io/transaction/743878a2712385521503dac7146bcb519697f62a5e45e3f1120d8ec444f138eb) | [a57ad5f9…](https://preprod.cardanoscan.io/transaction/a57ad5f9041df313b142e4e9a44b81099ab313d7ca449d012ac7a28cbc0ca766) | none (published without a registered voter) |
| 1242646942 "ronda 8" | 01:32 | x / y | 1 / 1 | [0784860f…](https://preprod.cardanoscan.io/transaction/0784860fcb8e66a36ad90223ed476ee768ea8eb757294b3d5ce60b49a79cf371) | [278ece50…](https://preprod.cardanoscan.io/transaction/278ece504c8f8532ad8397df5a4104ef6f561945721b47b4345a22160d9da086) | **1 vote**, option 0: [5dfdd59b…](https://preprod.cardanoscan.io/transaction/5dfdd59be3b83808e5103210f958d0ee4ef1866344f426e8e45ba6f5abe109f2) (tally after the vote: x = 1, y = 0) |

---

### Questions

**Q1 — What aspects of the application are well executed?**

*What worked as expected or better than expected?*

**Awnser:** 

"The voting is very short, quick and cheap, the interface is clean. The experiencie of the vote is very quick. From the administrator side is more complex."

---

**Q2 — How was your experience navigating the application?**

*Think about the onboarding, the clarity of each step, the interface messages, and how easy it was to understand what to do at each point. Was there any moment where you got stuck or ran into an error? Include the wallet connection if applicable.*

Overall experience rating:
- [ ] 1 — Very confusing
- [ ] 2 — Difficult
- [ ] 3 — Acceptable
- [x] 4 — Clear
- [ ] 5 — Very intuitive

Comments:

**Awnser:**  

"From the administrator point of view would be important to check the participants before sending, this is confusing for the administrator."

---

**Q3 — Did you feel that the voting process was transparent and verifiable?**

*Were you able to understand what happened to your vote once it was cast? Did the application give you confidence that the result would be accurate and tamper-proof? What gave you that sense — or the lack of it?*

**Awnser:** Yes

---

**Q4 — What use cases could this application have for the Cardano community?**

*DAO governance, Catalyst, SPOs, NFT communities, community treasuries, or anything else that comes to mind.*

**Awnser:**

"The Cardano embassadors, Catalyst and the dreps council. They want to make voting on-chain and this could be useful my friend"

---

**Q5 — What would you add, change, or remove if you could?**

*Open question. It could be a feature, a flow, a message, something visual — whatever has been on your mind.*

**Awnser:** 

From the administrator side I would make more explicit the route, with a checklist of whom have registered, it can't register the voting if the users aren't registered before. It is a condition that should be worked and improved for a more comfortable experience. 

The time, up on each button, if I do click on top. For example, the invite participants button is clear, but nowhere I got to know how quite right that the users have to be registered before. I need to understand that which participants are missing to launch the application, the time can't be the only constaint.

It would be wonderful if the next iteration deploy itself, or, do an automated sign up. 

Perhaps seeing from the administrator side how the voting goes. 

But keepings those things aside, it is very good.

---

*Thank you for your time and input. This feedback is key to the development of the application.*