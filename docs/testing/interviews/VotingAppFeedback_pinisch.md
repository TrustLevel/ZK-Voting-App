# Feedback Questionnaire
## Blockchain Voting Application — Testing Phase

---

### Tester Information

**Name:** pinusch

**GitHub:** pinusch100

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

What changed because of these observations is in [M4_USER_FEEDBACK.md](../M4_USER_FEEDBACK.md),
sections 3 and 4: the misleading message and the interim results are fixed; the collision is
mitigated (automatic rollback, retry succeeds) and the fix for the remaining retry is deployed
with its verification pending. The project's regression run of 2026-10-28
([test report](../M4_TEST_REPORT.md)) shows the same scenarios against the fixed deployment.
