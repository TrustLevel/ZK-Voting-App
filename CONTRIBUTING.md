# Contributing

Thank you for your interest in the ZK Voting App. Issues, pull requests, forks and reports
from self-hosted instances are all welcome.

## Before you start

- **Found a security problem?** Do not open an issue. Follow [SECURITY.md](SECURITY.md).
- **Have a question or an idea?** Open an issue and describe the use case; a short discussion
  before a large change saves work on both sides.
- **Running your own instance?** [docs/operations/DEPLOY.md](docs/operations/DEPLOY.md) is the
  procedure. A report of what did and did not work for you is a useful contribution in itself.

## Setup

The repository is a monorepo with five modules (contracts, backend, frontend, transaction
builder, ZK proofs). The [README](README.md) describes the layout and the local quick start;
the module-specific commands are in `CLAUDE.md` and in each module's `DOCS.md`.

## Making a change

1. Branch from `main`. `main` is the canonical branch and the hosted instance is deployed
   from it; `preview` is staging.
2. Keep a pull request to one concern. A contract change, a backend change and a UI change
   are three pull requests, not one.
3. Run the checks of the modules you touched before opening the pull request:

   ```sh
   cd src/on-chain && aiken check -D && aiken build   # contracts
   cd src/backend  && npm run lint && npm run build && npm run test && npm run test:e2e
   cd src/tx       && npm run build && npm test
   cd src/zk       && npm run build && npm test
   cd src/frontend && npm run build
   ```

   The contract and backend checks also run in CI on every pull request.
4. Changes to a validator change its compiled CBOR, policy IDs and script addresses. Rebuild
   `src/tx` (`npm run build:force`) in the same pull request and say in the description that
   deployed events are not affected but new events will use the new scripts.
5. Describe in the pull request what changed and why, and how you tested it. Link the issue if
   there is one.

## Style

- Match the surrounding code. The backend and frontend use the repository's ESLint and
  Prettier configuration; the contracts follow `aiken fmt`.
- Documentation changes are welcome in the same pull request as the code they describe.
  The user-facing texts live in `docs/guides/`.

## Licence of contributions

The project is licensed under the Apache License 2.0 (see [LICENSE](LICENSE)). By submitting a
contribution you agree that it is licensed under the same terms, as described in section 5 of
the licence. You keep the copyright of your contribution.
