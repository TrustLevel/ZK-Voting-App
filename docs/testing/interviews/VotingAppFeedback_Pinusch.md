# Feedback Questionnaire
## Blockchain Voting Application — Testing Phase

---

### Tester Information

**Name:** Paula S.

**GitHub:** pinusch

**Organization:**

**RSS / Social media:**

**Email:**

**Wallet used:**

- [x] Eternl
- [ ] Nami
- [ ] Vespr
- [ ] Lace
- [ ] Flint
- [ ] Other: _______________

**Device and operating system:**
MacOS / Chrome

**Prior experience with dApps:**
- [x] None — this is my first time
- [ ] Basic — I have used a dApp occasionally
- [ ] Intermediate — I use dApps regularly
- [ ] Advanced — I develop or manage blockchain projects

**Date of the test:** 2026-10-05

---

### Questions

**Q1 — What aspects of the application are well executed?**

*What worked as expected or better than expected?*

Once everyone was set up, voting itself was quick: open the link, pick an option, wait half a minute for the proof, confirm in the wallet, done. The page told me what it was doing at each step, and the explorer link at the end made it feel real. Inviting people by e-mail and seeing them show up as registered was easy. But getting there, was overwhelming. I had never used a wallet before, same es most of the particpants.
---

**Q2 — How was your experience navigating the application?**

*Think about the onboarding, the clarity of each step, the interface messages, and how easy it was to understand what to do at each point. Was there any moment where you got stuck or ran into an error? Include the wallet connection if applicable.*

Overall experience rating:
- [ ] 1 — Very confusing
- [x] 2 — Difficult
- [ ] 3 — Acceptable
- [ ] 4 — Clear
- [ ] 5 — Very intuitive

Comments:

The hard part was everything before the app: installing Eternl, switching it to Preprod, getting test ADA from the faucet, and explaining that to four other people. Two of five votes failed on the first try. One person got 'Insufficient funds' although the wallet had enough test ADA, which sent us looking for the wrong problem. Another vote was simply rejected and worked a minute later. The identity file download worried people: nobody knew what it was or whether they would need it again. As organiser I was not sure when it was safe to publish; I had to ask who had registered.

---

**Q3 — Did you feel that the voting process was transparent and verifiable?**

*Were you able to understand what happened to your vote once it was cast? Did the application give you confidence that the result would be accurate and tamper-proof? What gave you that sense — or the lack of it?*

Yes, in the sense that every vote had a transaction I could open in the explorer and the result came from the blockchain. I could not read what was in the transaction myself, so my trust came from the explanation on the page, not from checking. One thing felt wrong: I could see the running result while the others had not voted yet.

---

**Q4 — What use cases could this application have for the Cardano community?**

*DAO governance, Catalyst, SPOs, NFT communities, community treasuries, or anything else that comes to mind.*

I am not part of Cardano. But any group that votes among known members and wants the result to be checkable afterwards. In our case (a local townhall meeting) it was quite a good experience to vote und important topics without feeling peer pressure to vote for your favorable outcome.  

---

**Q5 — What would you add, change, or remove if you could?**

*Open question. It could be a feature, a flow, a message, something visual — whatever has been on your mind.*

Voters should not need a wallet or test ADA; that was the single biggest obstacle. Error messages should say what actually happened and what to do ('try again in a minute' instead of 'insufficient funds'). Hide the result until the vote is over. Tell the organiser plainly who has registered and that nobody else can vote after publishing. Explain the identity file in one sentence where it is downloaded.

---

*Thank you for your time and input. This feedback is key to the development of the application.*

---

## Own testing: live group test with five participants, 2026-10-05

I organised a real event on the hosted application (event 1869725828 on Cardano Preprod) with five participants who registered through their invitation links and
voted from the browser with an Eternl wallet. Three votes were confirmed on-chain on the first
attempt; two votes failed.

| # | What happened | Finding |
|---|---|---|
| 1 | A voter was told "Insufficient funds" although the wallet held enough test ADA.
| 2 | The second successful voter saw the running tally while others had not voted yet.
| 3 | A vote was rejected on the first attempt and succeeded on the second.



| Time | What | Transaction |
|---|---|---|
| 09:18:39 | Invitations sent to the five participants | — |
| 09:20:58 | Group NFT minted | [`1d8bd719c9237fcc0f75f41677b00ef1dcfcb170fb738c5e20c49bfdcd8bcea1`](https://preprod.cardanoscan.io/transaction/1d8bd719c9237fcc0f75f41677b00ef1dcfcb170fb738c5e20c49bfdcd8bcea1) |
| 09:21:39 | Semaphore + Voting NFTs minted| [`8eda0c92dced8f1579ce074c6549ab035c942b4379ad520ed31b84e1bffebd5f`](https://preprod.cardanoscan.io/transaction/8eda0c92dced8f1579ce074c6549ab035c942b4379ad520ed31b84e1bffebd5f) |
| 09:30:00 | Voting window opens | — |
| 09:32:00 | Vote 1 confirmed | [`4562a7bf5f6a066e9697217192744b63068fe015077786386d2ba7dde2c96427`](https://preprod.cardanoscan.io/transaction/4562a7bf5f6a066e9697217192744b63068fe015077786386d2ba7dde2c96427) |
| 09:33:31 | Vote 2 confirmed| [`dd60247300660709fdaf05ecc6270f8cf40bf897e4c47104ac9260cb9a433897`](https://preprod.cardanoscan.io/transaction/dd60247300660709fdaf05ecc6270f8cf40bf897e4c47104ac9260cb9a433897) |
| 09:34:57 | Vote 3 confirmed | [`07bf5de3c6f4f1674c9b52759b9281d6445e726594676b9930606efd9e469a1d`](https://preprod.cardanoscan.io/transaction/07bf5de3c6f4f1674c9b52759b9281d6445e726594676b9930606efd9e469a1d) |
| 09:35:00 | Voting window closes | — |
