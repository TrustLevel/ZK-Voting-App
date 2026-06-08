# Plan: Remove Blockfrost from the Frontend

Remove `NEXT_PUBLIC_BLOCKFROST_API_KEY` from the frontend entirely.
Two features are affected and fixed independently.

---

## Flow A — Group NFT Sync (`handleUpdateGroupNft`)

TX building is already on the backend. Blockfrost only appears for
`waitForTxConfirmation` after `wallet.submitTx`.

- [x] A1 — Add `GET /voting-event/tx-confirmed/:txHash` (backend)
      Controller + service method wrapping `provider.fetchTxInfo(txHash)`.
      Returns `{ confirmed: boolean }`.

- [x] A2 — Update `handleUpdateGroupNft` (frontend)
      Replace `waitForTxConfirmation(provider, txHash)` with polling
      `GET /tx-confirmed/:txHash`. Remove `BlockfrostProvider` instantiation.

---

## Flow B — Minting Phase 1 + Phase 2 (`handleStartVoting`)

TX building happens entirely on the frontend today. Four service methods
and four controller endpoints are needed.

- [ ] B1 — Add `buildGroupMintTx` service method (backend)
      Wraps `buildGroupMintTransaction` from `@src/tx` with the backend's
      `BlockfrostProvider`. Mint/create path — no backend equivalent exists yet.

- [ ] B2 — Add `POST /voting-event/:id/build-group-mint-tx` endpoint (backend)
      Input:  `{ walletUtxos, walletAddress, paymentKeyHash, collateralUtxo,
                 selectedUtxoTxHash, selectedUtxoIndex, merkleRoot }`
      Output: `{ unsignedTx, policyId, assetName, scriptAddress, validatorCbor }`

- [ ] B3 — Add `submitGroupMintTx` service method (backend)
      Submits signed TX, polls `fetchAddressUTxOs(scriptAddress)` until the
      Group NFT UTxO appears (up to 90s). Between-phase readiness gate.

- [ ] B4 — Add `POST /voting-event/:id/submit-group-mint-tx` endpoint (backend)
      Input:  `{ signedTx, policyId, scriptAddress }`
      Output: `{ txHash }` — only after UTxO is visible on-chain.

- [ ] B5 — Add `buildSvMintTx` service method (backend)
      Wraps `buildSemaphoreVotingMintTransaction` from `@src/tx`. Calls
      `fetchLatestBlock` internally for `txValidityEndSlot`. Validates
      `startingDate` is ≥90s away (400 if not). Returns unsigned TX CBOR +
      all derived policy IDs, script addresses, mintingOrefTxHash/Index.

- [ ] B6 — Add `POST /voting-event/:id/build-sv-mint-tx` endpoint (backend)
      Input:  `{ walletUtxos, walletAddress, paymentKeyHash, collateralUtxo,
                 selectedUtxoTxHash, selectedUtxoIndex, groupNftTxHash,
                 groupNftOutputIndex, groupPolicyId, startingDate, endingDate,
                 votingPower, optionTexts, merkleRoot }`
      Output: `{ unsignedTx, semaphorePolicyId, semaphoreAssetName,
                 semaphoreScriptAddr, votingPolicyId, votingAssetName,
                 votingScriptAddr, mintingOrefTxHash, mintingOrefIndex }`

- [ ] B7 — Add `submitSvMintTx` service method (backend)
      Submits signed TX, waits for confirmation, atomically saves all
      blockchain data to DB. Replaces separate `POST /blockchain-data` call.

- [ ] B8 — Add `POST /voting-event/:id/submit-sv-mint-tx` endpoint (backend)
      Input:  `{ signedTx, semaphorePolicyId, semaphoreScriptAddr,
                 semaphoreAssetName, votingPolicyId, votingScriptAddr,
                 votingAssetName, groupNft, groupValidatorAddress,
                 groupValidatorCbor, mintingOrefTxHash, mintingOrefIndex }`
      Output: `{ txHash }`

- [ ] B9 — Refactor `handleStartVoting` (frontend)
      1. Collect wallet UTxOs, address, key hash via CIP-30
      2. Select UTxOs for Phase 1 and Phase 2
      3. POST build-group-mint-tx  → unsigned CBOR + policy info
      4. wallet.signTx             → signed CBOR
      5. POST submit-group-mint-tx → txHash (blocks until UTxO visible)
      6. POST build-sv-mint-tx     → unsigned CBOR + policy info
      7. wallet.signTx             → signed CBOR
      8. POST submit-sv-mint-tx    → txHash + DB save
      9. Show success

---

## Cleanup

- [ ] C1 — Remove dead code from `blockchain-helpers.ts`
      Remove `BlockfrostProvider` import, `waitForTxConfirmation`,
      `buildAndSubmitGroupMintTx`, `buildAndSubmitSemaphoreVotingMintTx`,
      and `provider` field from both param interfaces.

- [ ] C2 — Remove `NEXT_PUBLIC_BLOCKFROST_API_KEY`
      Delete from `src/frontend/.env` and update `.env.example`.

- [ ] C3 — Update `src/frontend/DOCS.md`
      Remove the Blockfrost key exposure known-limitation note.

---

## Order

A1 → A2 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8 → B9 → C1 → C2 → C3
