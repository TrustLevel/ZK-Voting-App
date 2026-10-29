# Documentation index

Everything about the ZK Voting App beyond the code itself lives here. Module-level documentation
stays next to the code (`src/<module>/DOCS.md`).

| Folder | What is in it |
|---|---|
| [guides/](guides/) | For users: [Organiser guide](guides/ORGANISER_GUIDE.md), [Voter guide](guides/VOTER_GUIDE.md), [Learn more](guides/LEARN_MORE.md) (one-pager), [Troubleshooting](guides/TROUBLESHOOTING.md). The same guides are published on the [TrustLevel knowledge base](https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app). |
| [design/](design/) | Protocol and system design: [System design](design/SYSTEM_DESIGN.md), [Smart-contract specification](design/SMART_CONTRACT_SPECIFICATION.md), [Relay vote design](design/RELAY_VOTE_DESIGN.md) (voters need no wallet; organiser transactions), [Integration notes](design/INTEGRATION.md). |
| [operations/](operations/) | Running it: [Deployment](operations/DEPLOY.md) (Docker, VPS), [Mainnet setup](operations/MAINNET_SETUP.md) (one-off steps, costs, relay wallet). |
| [audit/](audit/) | [Smart-contract audit report](audit/AUDIT.md) and the [upstream Semaphore library changes](audit/UPSTREAM_SEMAPHORE_CHANGES.md) it produced. |
| [testing/](testing/) | [Milestone 4 test report](testing/M4_TEST_REPORT.md) (the regression run after the fixes), [user feedback and resulting changes](testing/M4_USER_FEEDBACK.md), the testers' questionnaires and test write-ups in [testing/interviews/](testing/interviews/). |
| [milestones/](milestones/) | Catalyst submissions: [Milestone 3](milestones/MILESTONE3_SUBMISSION.md), [Milestone 4](milestones/MILESTONE4_SUBMISSION.md). |
| [archive/](archive/) | Superseded working documents kept for history (early audit draft, integration plans, merge notes, the June 2026 to-do list, SQL sketches). Not maintained. |

Repository root: [README.md](../README.md) (overview, quick start, evidence index) and
[CLAUDE.md](../CLAUDE.md) (developer notes for the modules).
