# Vote Integration — Bauplan

Ziel: Vollständige ZK-Vote-Flow Integration im Frontend (`src/frontend/app/event/[id]/page.tsx`).
Status: **Entwurf — nicht freigegeben**

---

## Übersicht

Der neue Vote-Flow ersetzt die bisherige Fake-Implementierung (`submitVote` mit `commitment`).
Er besteht aus 8 Schritten (nicht 9 — Schritt 6 des Integration Guides entfällt, siehe unten).

---

## 1. Neue Datei: `src/frontend/lib/vote-helpers.ts`

Browser-adaptierte Wrapper für die ZK- und TX-Logik aus `@src/zk` und `@src/tx`.

### 1.1 `encodeVoteSignal(options: Array<[number, number]>): Promise<string>`

- Übernimmt die Logik aus `src/zk/src/signal.ts`
- `@meshsdk/core-csl` wird per dynamischem Import geladen (identisch zum Muster in `blockchain-helpers.ts`)
- **Input:** `[[optionIndex, voteCount], ...]`
- **Output:** CBOR-kodierter Hex-String (= `signalMessage`)

### 1.2 `generateVoteProof(params): Promise<{ zkProof, nullifierHash, publicSignals }>`

- Übernimmt die Logik aus `src/zk/src/proof.ts`, browser-adaptiert:
  - `snarkjs` via dynamischem Import (`import('snarkjs')`)
  - WASM und ZKEY werden per URL geladen: `/zk/semaphore.wasm` und `/zk/semaphore_final.zkey`
  - Signal-Hash (`blake2b_256(signalMessage) mod BLS12_381_R`) via `@noble/hashes/blake2b`
- Merkle-Proof-Eingabe: Backend-Format muss intern konvertiert werden:
  - `siblings: string[]` → `bigint[]`
  - `root: string` → `bigint`
- **Voraussetzung:** `semaphore.wasm` und `semaphore_final.zkey` müssen nach `public/zk/` kopiert werden

### 1.3 `buildVoteTransaction(params): Promise<string>`

- Reimplementierung der Logik aus `src/tx/src/vote.ts` mit `@meshsdk/core`-Imports
- Enthält lokal die nötigen Hilfsfunktionen:
  - `mpfStepsToPlutusData(steps)` — konvertiert MPF-Proof-Steps in Plutus-Daten
  - `createUrnaDatum(params)` — baut das aktualisierte Voting-Datum
  - `createOutputReference(txHash, index)` — baut OutputReference für SemaphoreDatum
- Konstanten werden direkt eingetragen:
  - `VKEY_REF_TX_HASH = "3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083"`
  - `VKEY_REF_OUTPUT_INDEX = 0`
- `applyOrefParamToScript` wird per dynamischem `@meshsdk/core-csl` Import geladen (wie in `blockchain-helpers.ts`)
- **Hinweis:** Slot-Fetching (`currentSlot + 1200`) passiert intern via `provider.fetchLatestBlock()` — kein externer Slot-Input nötig

---

## 2. Änderungen in `src/frontend/app/event/[id]/page.tsx`

### 2.1 Interface `VotingEvent` — neue Felder

```ts
interface VotingEvent {
  // bestehende Felder bleiben unverändert
  semaphoreAddress: string | null;
  votingValidatorAddress: string | null;
  semaphoreNft: string | null;       // Policy ID
  votingNft: string | null;          // Policy ID
  groupNft: string | null;           // Policy ID
  groupMerkleRootHash: string;
  mintingOrefTxHash: string | null;
  mintingOrefIndex: number | null;
}
```

### 2.2 Neue Imports

```ts
import { useWallet } from '@meshsdk/react';
import { BlockfrostProvider, deserializeAddress } from '@meshsdk/core';
import { encodeVoteSignal, generateVoteProof, buildVoteTransaction } from '@/lib/vote-helpers';
import { VALIDATORS } from '@/lib/validators';
```

### 2.3 Neuer State

```ts
// Wallet
const { connected, wallet } = useWallet();

// Vote Flow Status (für UX-Feedback)
const [voteStep, setVoteStep] = useState<string | null>(null);

// txHash nach erfolgreichem Vote
const [voteTxHash, setVoteTxHash] = useState<string | null>(null);
```

### 2.4 `handleSimpleVote` — Signalformat

```ts
const handleSimpleVote = async () => {
  if (selectedOption === null) { alert('Please select an option'); return; }
  await submitVote([[selectedOption, 1]]);
};
```

### 2.5 `handleWeightedVote` — Signalformat

```ts
const handleWeightedVote = async () => {
  // Validierung wie bisher
  const voteSignal: Array<[number, number]> = Object.entries(pointsDistribution)
    .filter(([_, pts]) => pts > 0)
    .map(([idx, pts]) => [parseInt(idx), pts]);
  await submitVote(voteSignal);
};
```

### 2.6 `submitVote(voteSignal: Array<[number, number]>)` — 8-Schritt-Flow

```
Schritt 1: Event-Daten bereits im State (event.semaphoreAddress, etc.)

Schritt 2: GET /voting-event/:id/merkle-proof/:userId   (userId = validatedUserId aus State)
  → { root, leaf, siblings, pathIndices }
  ⚠ Konvertierung nötig: root und siblings als strings → BigInt vor Übergabe an generateVoteProof

Schritt 3: encodeVoteSignal(voteSignal)
  → signalMessage (CBOR hex)

Schritt 4: generateVoteProof({ identityNullifier, identityTrapdoor, merkleProof, externalNullifier, signal })
  - identityNullifier = BigInt(storedIdentity.nullifier)  ← aus localStorage
  - identityTrapdoor  = BigInt(storedIdentity.trapdoor)   ← aus localStorage
  - merkleProof = { root: BigInt(proof.root), siblings: proof.siblings.map(BigInt), pathIndices }
  - externalNullifier = BigInt('0x' + event.semaphoreNft)
  - signal = signalMessage
  → { zkProof, nullifierHash, publicSignals }
  - signalHash = BigInt(publicSignals[2])

Schritt 5: POST /voting-event/:id/nullifier { nullifier: nullifierHash.toString() }
  → { newRoot, proof, proofSteps }
  ⚠ Feldnamen im Guide falsch: Backend gibt { newRoot, proofSteps } zurück (nicht mpfNewRoot/mpfProofSteps)
  Mapping: mpfNewRoot = result.newRoot, mpfProofSteps = result.proofSteps

  [Schritt 6 des Integration Guide entfällt — buildVoteTransaction holt den Slot intern selbst]

Schritt 6 (→ Schritt 7 im Guide): buildVoteTransaction({
    provider,                                    ← new BlockfrostProvider(NEXT_PUBLIC_BLOCKFROST_API_KEY)
    semaphoreScriptAddress: event.semaphoreAddress,
    votingScriptAddress: event.votingValidatorAddress,
    semaphoreNftPolicyId: event.semaphoreNft,
    votingNftPolicyId: event.votingNft,
    groupNftPolicyId: event.groupNft,
    groupMerkleRoot: BigInt(event.groupMerkleRootHash),
    semaphoreValidatorCbor,   ← applyOrefParamToScript(VALIDATORS.semaphore.mint, mintingOref)
    votingValidatorCbor,      ← applyOrefParamToScript(VALIDATORS.voting.mint,    mintingOref)
                              ← mintingOref = createOutputReference(event.mintingOrefTxHash, event.mintingOrefIndex)
    walletUtxos, walletAddress, paymentKeyHash,
    zkProof, nullifierHash, signalHash, signalMessage,
    mpfProofSteps,            ← result.proofSteps
    mpfNewRoot,               ← result.newRoot
    voteSignal,
    currentOptions,           ← JSON.parse(event.options).map(o => [o.index, o.votes])
    weight: event.votingPower,
    eventStart: event.startingDate * 1000,
    eventEnd: event.endingDate * 1000,
  })
  → unsignedTx (CBOR hex)

Schritt 7 (→ Schritt 8 im Guide): wallet.signTx(unsignedTx, true)
  → signedTx

Schritt 8 (→ Schritt 9 im Guide): POST /voting-event/:id/vote { signedTx }
  → { txHash }
  → setVoteTxHash(txHash)
```

---

## 3. UI-Anpassungen

### 3.1 Vote-Tab

**Wallet-Verbindungspflicht (kritisch)**
- Neuer Status-Block vor dem Vote-Formular (analog zu "Registration Required"):
  - Wenn `!connected`: Hinweis "Wallet Required" + Connect-Button
- Submit-Button `disabled`-Bedingung ergänzen: `|| !connected`

**Blockchain-Bereitschafts-Check (kritisch)**
- Wenn `event.semaphoreAddress === null`: Hinweis "Voting not yet available — the event organizer has not completed the blockchain setup."
- Kein Vote-Formular in diesem Fall
- Submit-Button `disabled`-Bedingung ergänzen: `|| !event.semaphoreAddress`

**Schritt-Status während Abstimmung (UX)**
- Button-Text: "Submitting Vote..." (unverändert)
- Zusätzlich: `voteStep`-Text unterhalb des Buttons:
  - `"Fetching Merkle proof..."`
  - `"Encoding vote signal..."`
  - `"Generating ZK proof... (this may take ~30s)"`
  - `"Inserting nullifier..."`
  - `"Building transaction..."`
  - `"Waiting for wallet signature..."`
  - `"Submitting to blockchain..."`
- `voteStep` nach Abschluss auf `null` zurücksetzen

**"Vote Submitted" Erfolgsmeldung (UX)**
- `voteTxHash` in der Erfolgsmeldung anzeigen:
  ```
  Transaction: <a href="https://preprod.cardanoscan.io/transaction/{voteTxHash}">View on Explorer</a>
  ```

### 3.2 Results-Tab — neuer Backend-Endpunkt + UI-Anpassung

**Hintergrund:** Stimmzahlen liegen ausschließlich on-chain im `UrnaDatum` des Voting-UTxOs. Das Backend-Feld `options.votes` wird nie aktualisiert und zeigt immer 0.

**Neuer Backend-Endpunkt:**
```
GET /voting-event/:eventId/results
```
- Liest Voting-UTxO von der Chain via Blockfrost (Backend-seitig, kein API-Key im Browser nötig)
- Dekodiert `UrnaDatum` und extrahiert aktuelle Stimmzähler
- Gibt zurück: `{ options: [{ index, text, votes }] }`
- Zu implementieren in: `voting-event.service.ts` + `voting-event.controller.ts`

**Frontend Results-Tab:**
- Neuer State: `const [results, setResults] = useState<VotingOption[] | null>(null)`
- Beim Wechsel auf Results-Tab: `GET /voting-event/:id/results` aufrufen
- Anzeige aus `results` statt `fullOptions`
- Lade-Spinner während Fetch
- Fehler-Fallback: "Results could not be loaded from the blockchain."

---

## 4. package.json (Frontend) — neue Dependencies

```json
"snarkjs": "^0.7.5",
"@noble/hashes": "^1.6.1"
```

---

## 5. Statische Assets

Müssen manuell nach `src/frontend/public/zk/` kopiert werden (Deployment-Aufgabe, kein Code):

| Quelle | Ziel |
|--------|------|
| `src/zk/wasm/semaphore.wasm` | `public/zk/semaphore.wasm` |
| `src/zk/keys/semaphore_final.zkey` | `public/zk/semaphore_final.zkey` |

---

## 6. Bekannte Einschränkungen

- `buildVoteTransaction` benötigt `BlockfrostProvider` mit API-Key im Frontend — bekannte temporäre Einschränkung. Geplante Lösung: Backend-Endpunkt `GET /voting-event/:id/script-utxos`.
- ZKEY-Datei ist 8.9MB — wird beim ersten Vote-Vorgang aus dem Browser geladen (einmalig, dann gecacht vom Browser).

---

## 7. Bekannte Abweichungen vom Integration Guide

| Guide | Tatsächlich |
|-------|-------------|
| 9 Schritte | 8 Schritte — Schritt 6 (GET /current-slot) entfällt, da `buildVoteTransaction` den Slot intern via `provider.fetchLatestBlock()` holt |
| `insertNullifier` gibt `{ mpfNewRoot, mpfProofSteps }` | Backend gibt `{ newRoot, proofSteps }` — Frontend mapped um |
| `merkleProof.siblings` wird direkt übergeben | `root` und `siblings` müssen von `string` zu `bigint` konvertiert werden |
| `currentOptions` implizit | Muss explizit aus `event.options` transformiert werden: `JSON.parse(event.options).map(o => [o.index, o.votes])` |

---

## 8. Offene Fragen

Keine — alle Fragen selbst beantwortet:

1. **Blockfrost API-Key:** `process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY` — bereits so im Manage-Tab verwendet.
2. **`GET /current-slot`:** Existiert im Backend, wird aber vom Frontend nicht benötigt (siehe Abweichungen).

---

---

## Session-Kontext

**Branch:** `dev/dom` — 1 Commit voraus gegenüber `origin/dev/dom` (Merge main → dev/dom, commit `f5766e2`)

**Was in dieser Session passiert ist:**
- `origin/main` lokal gepullt (43 neue Commits: ZK-Modul, Vote-TX, Backend-Endpunkte)
- `main` in `dev/dom` gemergt — Konflikte manuell aufgelöst (controller, service, package-lock)
- Dieser Bauplan (`docs/VOTE_INTEGRATION_PLAN.md`) erstellt und iteriert

**Bereits committete Frontend-Änderungen (commit `6945bdd`, auf dev/dom):**
- `src/frontend/app/event/[id]/manage/page.tsx` — Manage-Seite mit Minting-Flow (Group, Semaphore+Voting NFTs)
- `src/frontend/lib/blockchain-helpers.ts` — Browser-Adapter für TX-Funktionen
- `src/frontend/lib/validators.ts` — lokale Kopie der VALIDATORS aus `@src/tx`

Diese Dateien sind **nicht** Teil des Vote-Integrations-Plans — sie betreffen den Admin-Flow (Minting), nicht den Voter-Flow.

**Uncommittetes:**
- `docs/VOTE_INTEGRATION_PLAN.md` (diese Datei) — noch nicht committed

**Nächster Schritt:** Freigabe des Bauplans, dann Implementierung starten.

---

## Kontext-Notiz für neue Sessions

Der Bauplan weicht an 3 Stellen vom Integration Guide ab — nicht weil der Guide falsch ist, sondern weil die **tatsächliche Backend-Implementierung** von den Guide-Angaben abweicht:

1. **Schritt 5 (insertNullifier):** Guide nennt `{ mpfProofSteps, mpfNewRoot }` — Backend gibt tatsächlich `{ proofSteps, newRoot }` zurück. Frontend muss mappen.
2. **Schritt 2/4 (Merkle Proof):** Guide sagt "direkt übergeben" — `generateVoteProof` erwartet aber `root: bigint` und `siblings: bigint[]`, Backend gibt Strings. Konvertierung nötig.
3. **Schritt 6 (GET /current-slot):** Im Guide als eigener Schritt beschrieben, aber `buildVoteTransaction` holt den Slot intern selbst (`provider.fetchLatestBlock()`). `currentSlot` steht nicht in `BuildVoteTransactionParams` — kein separater Frontend-Call nötig.

Alle anderen Punkte im Bauplan folgen dem Integration Guide 1:1.

*Erstellt: 2026-04-08 | Status: Entwurf — wartet auf Freigabe*
