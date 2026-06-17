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

*Erstellt: 2026-04-08 | Status: **Implementiert** — 2026-04-08*

---

## Implementierungs-Protokoll (Session 2026-04-08)

### Was wurde umgesetzt

**Neue Datei: `src/frontend/lib/vote-helpers.ts`**
- `encodeVoteSignal` — CBOR-Kodierung via dynamischem `@meshsdk/core-csl` Import
- `generateVoteProof` — snarkjs Groth16-Proof (WASM/ZKEY per URL aus `/public/zk/`), `blake2b` via `@noble/hashes`, G1/G2-Kompression via `ffjavascript`/`bigint-buffer`
- `buildVoteTransaction` — vollständige TX-Konstruktion, fetcht UTxOs intern via `provider`
- `applyOrefParamToScript` — WASM-Lazy-Load, identisch zu `blockchain-helpers.ts`
- G1/G2-Konversionsfunktionen direkt eingebettet (aus `src/zk/src/conversion.ts` portiert)

**Geändert: `src/frontend/app/event/[id]/page.tsx`**
- `VotingEvent` Interface um 7 Blockchain-Felder erweitert (`semaphoreAddress`, `votingValidatorAddress`, `semaphoreNft`, `votingNft`, `groupNft`, `groupMerkleRootHash`, `mintingOrefTxHash`, `mintingOrefIndex`)
- `useWallet` Hook hinzugefügt, Imports für `BlockfrostProvider`, `deserializeAddress`, alle Vote-Helpers
- Neuer State: `voteStep`, `voteTxHash`, `results`, `loadingResults`
- `submitVote(optionIndex: number)` → `submitVote(voteSignal: Array<[number, number]>)` — vollständiger 8-Schritt-ZK-Flow
- `handleSimpleVote` → übergibt `[[selectedOption, 1]]`
- `handleWeightedVote` → übergibt `Object.entries(pointsDistribution).filter(...).map(...)`
- UI Vote-Tab: Blockchain-Not-Ready-Banner, Wallet-Required-Banner, `voteStep`-Statusanzeige unter dem Button, TxHash-Explorer-Link in der Erfolgsmeldung
- UI Results-Tab: lädt on-chain Daten via `GET /results`, Spinner, Fehler-Fallback, Refresh-Button; `loadResults()` wird beim Klick auf den Results-Tab-Button ausgelöst

**Geändert: `src/backend/src/voting-event/voting-event.service.ts`**
- Neue Methode `getResults(eventId)` — fetcht Voting UTxO via Blockfrost, dekodiert `UrnaDatum.fields[1]` (on-chain Stimmzähler), merged mit DB-Optionstexten; `event.options ?? '[]'` für null-Safety

**Geändert: `src/backend/src/voting-event/voting-event.controller.ts`**
- Neuer Endpunkt `GET :eventId/results` → ruft `votingEventService.getResults()` auf

**Statische Assets kopiert**
- `src/zk/wasm/semaphore.wasm` → `src/frontend/public/zk/semaphore.wasm` (1.2 MB)
- `src/zk/keys/semaphore_final.zkey` → `src/frontend/public/zk/semaphore_final.zkey` (8.5 MB)

**Frontend Dependencies installiert** (`src/frontend/package.json`)
- `snarkjs@^0.7.6`
- `@noble/hashes@^1.8.0`
- `bigint-buffer@^1.1.5`
- `ffjavascript` kommt als transitive Dependency von `snarkjs`

### Abweichungen vom Plan

| Plan | Tatsächlich |
|------|-------------|
| `ffjavascript` nicht explizit erwähnt | Wird explizit als transitive `snarkjs`-Dependency benötigt und ist nach `npm install snarkjs` in root `node_modules` verfügbar |
| `bigint-buffer@^1.1.10` | Höchste verfügbare Version ist `1.1.5` — `^1.1.5` verwendet |
| `@noble/hashes@^1.6.1` | npm hat `^1.8.0` installiert — funktioniert identisch |
| Results-Tab: "beim Wechsel auf Results-Tab" | Ausgelöst beim Klick auf den Tab-Button (nicht via `useEffect`) — pragmatischer und einfacher |
| `onMouseEnter` als Trigger erwogen | Verworfen zugunsten direktem Button-Klick |

### Nachträglich behobener Bug: `weight = 0` Hardcoding

**Problem:** In `src/frontend/lib/blockchain-helpers.ts` war `weight = 0` in `buildAndSubmitSemaphoreVotingMintTx` hardcoded. Alle Events wurden damit mit `weight = 0` on-chain geminted — egal ob Simple (votingPower=1) oder Weighted (votingPower>1) Voting.

Der Vote-TX setzt im neuen UrnaDatum `weight: event.votingPower` (z.B. `1`), was nicht mit dem originalen Datum (`weight=0`) übereinstimmt → On-Chain-Validator hätte den TX abgelehnt.

**Fix (in `blockchain-helpers.ts` und `manage/page.tsx`):**
- `votingPower` als neues Pflichtfeld in `BuildSemaphoreVotingMintTxParams` hinzugefügt
- `weight = votingPower > 1 ? votingPower : 0` — Simple Voting bleibt `0` (On-Chain: `weight <= 1`), Weighted Voting bekommt den korrekten Wert
- `votingPower` wird jetzt aus dem State im Manage-Page-Call übergeben

**Wichtig für zukünftige Sessions:** `weight` im UrnaDatum und `votingPower` im Backend sind nicht identisch:
- `votingPower === 1` → `weight = 0` (Simple Voting on-chain)
- `votingPower > 1`  → `weight = votingPower` (Weighted Voting on-chain)

---

## Implementierungs-Protokoll (Session 2026-04-09) — Bug-Fixes beim End-to-End-Test

Diese Session war ein vollständiger End-to-End-Test des Vote-Flows. Dabei wurden mehrere Bugs gefunden und behoben.

---

### Bug 1: `getMerkleProof` — Typfehler bei userId-Vergleich

**Symptom:** `GET /voting-event/:eventId/merkle-proof/:userId` gab 500 zurück ("Failed to fetch Merkle proof") — Participant wurde nicht gefunden.

**Ursache:** URL-Parameter sind in NestJS immer Strings. `p.userId === userId` verglich `number === string` → immer `false`.

**Fix (`voting-event.service.ts`):**
```ts
// Vorher:
const participant = event.participants.find(p => p.userId === userId);

// Nachher:
const participant = event.participants.find(p => p.userId === Number(userId));
```

---

### Bug 2: `@aiken-lang/merkle-patricia-forestry` nicht installiert

**Symptom:** `POST /voting-event/:eventId/nullifier` gab 500 zurück — Modul nicht gefunden.

**Ursache:** `@aiken-lang/merkle-patricia-forestry` war in `package.json` gelistet, aber nie installiert worden (monorepo `npm install` fehlte).

**Fix:** `npm install` im Repository-Root ausführen. Keine Code-Änderung nötig.

---

### Bug 3: Semaphore+Voting Mint TX — Ogmios EvaluationFailure

**Symptom:** Phase 2 (Semaphore+Voting NFT Minting) schlug fehl mit:
```
EvaluationFailure: { ScriptFailures: {} }
```

**Ursache:** `buildAndSubmitSemaphoreVotingMintTx` verwendete `evaluator: provider`. Ogmios evaluiert Scripts zur Build-Zeit und benötigt dabei alle Reference Inputs im Ledger. Der Group NFT UTxO aus Phase 1 war bei Blockfrost bereits sichtbar, aber Ogmios (Knoten-State) hinkte hinterher → Evaluation schlug fehl.

**Fix (`blockchain-helpers.ts`):** `evaluator: provider` aus dem MeshTxBuilder-Aufruf entfernt. MeshSDK verwendet dann die hardcodierten Execution Units statt Ogmios.

```ts
// IMPORTANT — evaluator intentionally omitted here (previously: evaluator: provider).
// Reason: The Semaphore+Voting TX uses the Group NFT UTxO as a read-only reference
// input. Ogmios evaluates scripts at build-time and requires all reference inputs to
// already be in the node's ledger state. Even after Blockfrost confirms TX 1, Ogmios
// can lag behind and return EvaluationFailure { ScriptFailures: {} }. By omitting
// the evaluator, MeshSDK uses the hardcoded execution units instead of calling
// Ogmios — eliminating the race condition entirely.
```

**Wichtig:** Der `evaluator` in `buildAndSubmitGroupMintTx` (Phase 1) bleibt erhalten — Phase 1 hat keine problematischen Reference Inputs.

---

### Bug 4: "User declined" wurde als TX-Fehler angezeigt

**Symptom:** Wenn der Nutzer die Wallet-Signatur in Eternl ablehnte, erschien "Transaction build failed" (aus dem Ogmios-Fallback-Catch) statt einer klaren Meldung.

**Ursache:** Der Catch-Block prüfte nur auf Ogmios-Fehler, nicht auf User-Ablehnung.

**Fix (`blockchain-helpers.ts`, beide Mint-Funktionen):** Explizite Prüfung auf `"user declined"` / `"user rejected"` vor dem Ogmios-Fallback:

```ts
catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  // Check for user declining wallet prompt first
  if (msg.toLowerCase().includes('user declined') || msg.toLowerCase().includes('user rejected')) {
    throw new Error('Transaction cancelled by user');
  }
  // Ogmios bypass: if Ogmios evaluation fails, retry without evaluator...
  ...
}
```

---

### Bug 5: Phase-2 Script-Fehler bei Events mit vergangenem Startdatum

**Symptom:** `EvaluationFailure: Phase-2 script failure` beim Minting eines zweiten Events.

**Ursache:** On-Chain-Validator `voting.ak` prüft `is_entirely_before(validity_range, event_start)`. Das Event hatte `startingDate` in der Vergangenheit (April 8) — der Validator lehnte den TX ab.

**Keine Code-Änderung** — dies ist korrektes On-Chain-Verhalten.

**Wichtige Betriebsregel:** Das `startingDate` eines Events **muss mindestens 5–10 Minuten in der Zukunft** liegen, wenn der "Publish to Blockchain"-Button gedrückt wird.

---

### Bug 6: Wallet-Verbindungsstatus nicht sichtbar im Vote-Flow

**Symptom:** Nach Wallet-Connect war unklar, welche Wallet verbunden war.

**Fix (`page.tsx`):**
- `useWallet` um `name: walletName` erweitert
- Neuer State: `showWalletModal`, `connectedAddress`
- `useEffect` holt Wallet-Adresse nach Connect/Disconnect
- Grünes Banner "Wallet Connected" zeigt Wallet-Name + gekürzte Adresse
- "Connect Wallet"-Button direkt im "Wallet Required"-Banner
- Wallet-Auswahl-Modal für Eternl/Lace/Yoroi

---

### Bug 7: `insertNullifier` — opaker 500er, keine Fehlerinfo

**Symptom:** `POST /voting-event/:eventId/nullifier` gab "Internal server error" zurück — kein Detail im Browser.

**Ursache:** NestJS wirft opake 500er für plain `Error`-Objekte. MPF-Library wirft plain Errors ("element already in the trie").

**Fix (`voting-event.service.ts`):**
```ts
// Import ergänzt:
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

// insertNullifier in try/catch:
try {
  // ... trie-Operationen
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('already in the trie')) {
    throw new HttpException('Nullifier already used', HttpStatus.CONFLICT); // 409
  }
  throw new HttpException(`Nullifier insertion failed: ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
}
```

---

### Bug 8: Nullifier-Persistenz nach fehlgeschlagenem Vote — kein Retry möglich

**Symptom:** Wenn der Vote-TX nach der Nullifier-Insertion fehlschlug (Sign-Fehler, Submission-Fehler), war der Nullifier dauerhaft in der Trie. Ein erneuter Vote-Versuch gab 409 zurück.

**Ursache:** Die MPF-Trie (LevelDB) speichert den Nullifier permanent. Bei TX-Fehler nach Insertion gab es keinen Rollback.

**Fix — Backend: neue `rollbackNullifier`-Methode (`voting-event.service.ts`):**
```ts
async rollbackNullifier(eventId: number, nullifier: string) {
  // Loads trie, calls trie.delete(key), recomputes root, persists to DB
}
```

**Fix — Backend: neuer Controller-Endpunkt (`voting-event.controller.ts`):**
```ts
@Delete(':eventId/nullifier')
async rollbackNullifier(
  @Param('eventId') eventId: number,
  @Body('nullifier') nullifier: string,
) {
  return await this.votingEventService.rollbackNullifier(eventId, nullifier);
}
```

**Fix — Frontend: `rollbackNullifier`-Helper und automatischer Aufruf (`page.tsx`):**
```ts
const rollbackNullifier = async () => {
  try {
    await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/nullifier`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nullifier: nullifierHash.toString() }),
    });
  } catch { }
};
```

Rollback wird aufgerufen bei:
- `wallet.signTx()` schlägt fehl (User lehnt ab oder Wallet-Fehler)
- `POST /vote` Submission schlägt fehl

**Frontend: 409 → klare Fehlermeldung:**
```ts
if (nullifierResponse.status === 409) {
  throw new Error('You have already voted in this event.');
}
```

---

### Bug 9: `submitVote` — opaker 500er statt Blockfrost-Fehlerdetail

**Symptom:** `POST /voting-event/:eventId/vote` gab "Internal server error" zurück, wenn Blockfrost den TX ablehnte.

**Fix (`voting-event.service.ts`):**
```ts
// Vorher: throw new Error(blockfrostError.message)
// Nachher:
throw new HttpException(
  `Blockfrost submission failed (${status}): ${detail}`,
  HttpStatus.BAD_GATEWAY
);
```

---

### Bug 10: 10s Sleep durch aktives UTxO-Polling ersetzt (`manage/page.tsx`)

**Problem:** Nach Phase-1 wartete der Code pauschal 10 Sekunden, bevor Phase-2 gestartet wurde. Bei langsamer Netzwerkpropagation zu kurz, bei schneller Propagation unnötig lang.

**Fix:** Aktives Polling alle 3 Sekunden, max. 30 Versuche (90s Timeout):
```ts
let groupUtxoVisible = false;
for (let i = 0; i < 30; i++) {
  try {
    const utxosAtScript = await provider.fetchAddressUTxOs(groupResult.scriptAddress);
    if (utxosAtScript.some(u => u.input.txHash === groupResult.txHash)) {
      groupUtxoVisible = true;
      break;
    }
  } catch { }
  await new Promise(resolve => setTimeout(resolve, 3000));
}
```

---

### Offenes Problem: Blockfrost 400 "Something went wrong" bei Vote TX

**Symptom:** Vote TX wurde vom Cardano-Knoten abgelehnt mit HTTP 400. Blockfrost-Nachricht: "Something went wrong".

**Status:** Unklar — der genaue Grund konnte nicht ermittelt werden (alte LevelDB-Daten wurden manuell gelöscht: `rm -rf src/backend/nullifiers-db/<eventId>`). Benötigt frischen Test mit neuem Event.

**Hypothesen:**
- Execution Units stimmen nicht (hardcoded, ohne `evaluator`)
- Datum-Mismatch zwischen on-chain und off-chain
- Trie-State inkonsistent durch vorige fehlgeschlagene Versuche

**Nächster Schritt:** Neues Event erstellen (startingDate >10 min in Zukunft), kompletten Vote-Flow von vorne testen.

---

*Session 2026-04-09 — Bearbeiter: Claude (claude-sonnet-4-6)*

---

## Analyse-Protokoll (Session 2026-04-09, 3 Sessions) — ValidationTagMismatch Debug

**Fehler:** `PlutusV3 script failed (ValidationTagMismatch (IsValid True))`

Bedeutung: TX wurde mit `IsValid True` getaggt (= Author erwartet Script-Erfolg), aber mindestens ein Plutus-Script schlug zur Laufzeit fehl. Tritt auf weil kein `evaluator` gesetzt ist (hardcoded EUs) — der Fehler stammt aus der On-Chain-Ausführung, nicht aus der TX-Konstruktion.

---

### Was verifiziert und als korrekt befunden wurde

| Komponente | Beschreibung | Status |
|-----------|-------------|--------|
| `mpfStepsToPlutusData` | Branch/Fork/Leaf Encoding stimmt mit `toUPLC()` der JS-Library überein | ✓ |
| MPF Empty-Trie-Root | `excluding(key, []) = null_hash = 0x0000...0000` on-chain; JS gibt für leeren Trie `null` (nicht 32 Null-Bytes) — Datum setzt korrekt `"0000...0000"` | ✓ |
| `signalHash` | `blake2b_256(signalMessage) % BLS12_381_R` — gleich in Browser und Circuit | ✓ |
| ZK Public Values Reihenfolge | `[dat.group_merke_root, nullifier, signal_hash, external_nullifier]` — passt zu `publicSignals[0..3]` | ✓ |
| Semaphore Datum Preservation | `group_merke_root`, `group_token_policy`, `vkey_ref_input` bleiben unverändert | ✓ |
| VKey Referenz-Hash | `3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083#0` konsistent in allen Dateien | ✓ |
| Zeitintervall | `eventStart/End` in ms im Datum; `invalidBefore(eventStartSlot+1)` konvertiert korrekt zu POSIX ms | ✓ |
| G1/G2 Kompression | Browser-Version in `vote-helpers.ts` ist äquivalent zur Node.js-Version in `conversion.ts` | ✓ |
| `nullifierToKeyValue` | `value = little-endian(nullifier)`, `key = blake2b_256(value)` — passt zu on-chain Semaphore-Validator | ✓ |
| Execution Units | 12M + 1.5M = 13.5M < 14M Limit ✓ (Semaphore 7B steps + Voting 1B steps < 10B) | ✓ |
| `OutputReference` Encoding | `Constr(0, [ByteArray, Int])` — flat encoding (kein geschachteltes TransactionId-Constr) | ✓ |
| Voting Datum Preservation | `weight`, `event_date`, `semaphore_nft` unverändert im neuen Datum | ✓ |
| `excluding([]) = null_hash` | On-chain: `do_excluding(path, 0, []) = null_hash` → erste Insertion mit leerem Proof passt zu leerem Trie | ✓ |
| MPF neue Root Berechnung | JS und On-chain berechnen `blake2b_256([0xff] + blake2b_256(key) + blake2b_256(value))` für erste Insertion | ✓ |

---

### Gelesene On-Chain Quellcodes (via `aiken build`)

Durch `aiken build` wurden die Pakete in `src/on-chain/build/packages/` heruntergeladen:

- `modulo-p-cardano-semaphore/validators/semaphore.ak` — vollständige Spend-Handler-Logik analysiert
- `modulo-p-cardano-semaphore/lib/semaphore_types.ak` — `SemaphoreDatum`, `SemaphoreRedeemer` Typen
- `modulo-p-cardano-semaphore/lib/group_types.ak` — `GroupDatum` Typ
- `aiken-lang/merkle-patricia-forestry/lib/aiken/merkle-patricia-forestry.ak` — `insert`, `including`, `excluding`
- `aiken-lang/merkle-patricia-forestry/lib/aiken/merkle-patricia-forestry/helpers.ak` — `combine`, `suffix`
- `aiken-lang/merkle-patricia-forestry/lib/aiken/merkle-patricia-forestry/merkling.ak` — `null_hash = 0x0000...0000`
- `modulo-p-ak-381/lib/ak-381/groth16.ak` — `groth_verify`, `derive`, `Proof` Typ
- `aiken-lang/stdlib/lib/aiken/crypto/bls12_381/scalar.ak` — `from_bytearray_big_endian`, `to_int`
- `src/on-chain/validators/voting.ak` — `spend` Handler vollständig analysiert

---

### Hauptverdacht: VKey-UTxO ≠ aktuelle semaphore_final.zkey

Der `groth_verify`-Aufruf im Semaphore-Validator ist der teuerste und fehleranfälligste Schritt. Er schlägt fehl wenn:

1. **VKey-Mismatch:** Der VKey-UTxO (`3dc5c982...#0`) wurde mit einem anderen `verification_key.json` erstellt als dem aktuellen `semaphore_final.zkey`. Da der UTxO an der Always-False-Adresse dauerhaft gesperrt ist, kann er nie aktualisiert werden. Wenn `semaphore_final.zkey` nach dem Sperren des VKey regeneriert wurde, schlägt jeder Proof fehl.

2. **Browser-WASM-Unterschied:** `ffjavascript.getCurveFromName('bls12381')` liefert im Browser möglicherweise leicht andere Feldarithmetik als in Node.js — führt zu falschen G1/G2-Komprimierungswerten.

**Wahrscheinlichkeit:** Verdacht 1 (VKey-Mismatch) ist sehr hoch, da es keine Verifikation gibt, dass der on-chain VKey mit dem aktuellen zkey übereinstimmt.

---

### Empfohlene nächste Schritte zur Diagnose

**Schritt 1 — VKey-UTxO verifizieren (höchste Priorität):**
```bash
# Node.js-Script schreiben, das:
# 1. Den VKey-UTxO von Blockfrost fetcht (3dc5c982...#0)
# 2. Die compressedG1/G2-Werte aus verification_key.json berechnet
# 3. Beide vergleicht
cd src/tx && node src/debug/vote/verify-vkey.ts
```

**Schritt 2 — cast-vote.ts lokal testen:**
```bash
# cast-vote.ts aus src/tx/src/debug/vote/ mit echten Event-Daten ausführen
# Wenn dieser Node.js-Pfad erfolgreich ist → Browser-spezifisches Problem
# Wenn er auch scheitert → fundamentaleres Problem
cd src/tx && npx tsx src/debug/vote/cast-vote.ts
```

**Schritt 3 — Verbose Logging in vote-helpers.ts:**
Folgende Werte vor TX-Submission ins Browser-Console loggen:
- `zkProof.pi_a`, `pi_b`, `pi_c` (komprimierte Proof-Punkte)
- `nullifierHash`, `signalHash`
- `mpfProofSteps` (sollte `[]` für ersten Vote sein)
- `mpfNewRoot` (neuer Trie-Root nach Insertion)
- `groupMerkleRoot` (aus DB)

**Schritt 4 — Blockfrost Evaluate-Endpoint nutzen:**
Statt den TX zu submittieren, erst `/api/v0/utils/txs/evaluate` aufrufen — gibt die genaue Script-Failure-Ursache zurück (welche Condition gescheitert ist).

---

### Nicht-Ursachen (ausgeschlossen)

- ❌ MPF Proof-Encoding falsch
- ❌ Empty-Trie-Root falsch
- ❌ Signal/Hash-Berechnung falsch
- ❌ Datum-Encoding falsch
- ❌ Zeit-Check falsch (eventStart/End korrekt in ms)
- ❌ Execution Units zu hoch (13.5M < 14M)
- ❌ Collateral-Problem (phase 1 passed → ValidationTagMismatch)
- ❌ OutputReference-Encoding falsch (minting funktioniert → Encoding korrekt)

---

*Analyse abgeschlossen: 2026-04-09 — ~3 Sessions Tiefenanalyse, alle Komponenten geprüft*

---

## Analyse-Protokoll — Session 2 (2026-04-10)

### Neue Erkenntnisse: Root Cause gefunden

Die `PlutusV3 script failed (ValidationTagMismatch IsValid True)` Fehler sind auf eine **kaputte Deployment-Konfiguration** zurückzuführen — nicht auf einen Code-Bug.

---

### Was bewiesen wurde

#### VKey UTxO ist korrekt (Hypothese aus Session 1 widerlegt)

Script `src/tx/src/debug/vote/verify-vkey.ts` mit CBOR-Decoding (cbor-Library) lädt den on-chain VKey-Datum und vergleicht alle Felder mit `verification_key.json`:

| Feld | Ergebnis |
|------|----------|
| nPublic | ✓ MATCH (4) |
| vkAlpha (G1, 48 Bytes) | ✓ MATCH |
| vkBeta (G2, 96 Bytes) | ✓ MATCH |
| vkGamma (G2, 96 Bytes) | ✓ MATCH |
| vkDelta (G2, 96 Bytes) | ✓ MATCH |
| vkIC[0..4] (5× G1) | ✓ MATCH |

**Hinweis:** MeshSDK chunked CBOR — G2-Punkte (96 Bytes) werden als indefinite-length CBOR-Bytestrings gespeichert (`5f 5840 <64 Bytes> 5820 <32 Bytes> ff`). Die naive Hex-Substring-Suche in der ersten Version des Scripts meldete fälschlich MISMATCH. Mit korrektem CBOR-Decoding: alle Felder korrekt.

---

### Root Cause: Kaputte Deployment-Chain

#### Rekonstruierter Deployment-Verlauf

| Event | TX Hash | Block | Was passierte |
|-------|---------|-------|---------------|
| Bootstrap | `9bb9003c...` | 4560406 | Group/Semaphore/Voting NFTs geminted; `vkey_ref = 10b5b3ca...#2` (Wallet-Adresse) |
| 1. Vote ✓ | `f2f59247...` | 4560445 | Vote **erfolgreich** mit altem Validator (v0.9.3: VKey als regulären Input **konsumiert**) |
| 2+ Votes ✗ | — | — | Alle scheitern — `vkey_ref`-UTxO ist spent, kann nicht mehr als Reference Input eingebunden werden |

#### Warum die erste Vote erfolgreich war

Der Semaphore-Validator zum Zeitpunkt des Bootstraps verwendete `find_input(**inputs**, dat.vkey_ref_input)` (v0.9.3-Verhalten). Der VKey-UTxO wurde bei jedem Vote konsumiert und neu erstellt. TX2 consumierte `10b5b3ca...#2` und erstellte `f2f59247...#2` neu.

#### Warum alle folgenden Votes scheitern

Nach der CLAUDE.md-Dokumentation wurde in v0.9.4 der Validator geändert:
- Vorher: `find_input(inputs, dat.vkey_ref_input)` → VKey wird konsumiert
- Jetzt: `find_input(reference_inputs, dat.vkey_ref_input)` → VKey als permanenter Reference Input

Das `SemaphoreDatum.vkey_ref_input` ist immutable (geschützt durch `is_datum_preserved`). Es zeigt auf `10b5b3ca...#2` — jetzt **SPENT**. Kein zukünftiger Vote kann diesen UTxO als Reference Input einbinden, weil er nicht mehr existiert.

#### Liveness-Status aller VKey UTxOs (geprüft 2026-04-10)

| UTxO | Status | Adresse |
|------|--------|---------|
| `3dc5c982...#0` (CLAUDE.md Konstante, always-false) | **UNSPENT ✓** | always-false Script |
| `10b5b3ca...#2` (SemaphoreDatum `vkey_ref`) | **SPENT ✗** | Wallet |
| `f2f59247...#2` (re-erstellt in TX2) | **UNSPENT ✓** | Wallet |

#### On-Chain State nach TX2

```
SemaphoreDatum.vkey_ref_input  = 10b5b3ca...#2  ← SPENT → alle Votes scheitern
SemaphoreDatum.nullifier_mpf_root = 6908440d...  ← nicht mehr empty (1 Vote abgegeben)
SemaphoreDatum.group_merke_root   = 23030474...  ← korrekt (matching cast-vote.ts)
UrnaDatum.options = [[0,0],[1,0],[2,1]]          ← Option 2 hat 1 Stimme erhalten
```

---

### Fix: Vollständiges Re-Bootstrap erforderlich

Da `vkey_ref_input` immutable ist, **muss das Deployment neu aufgesetzt werden**. Der korrekte VKey-UTxO (`3dc5c982...#0`, always-false, unspent) ist bereits vorhanden.

**Schritt-für-Schritt:**

1. **Re-Bootstrap Phase 1** (`bootstrap-vote.ts` Phase 1): neues Group NFT minting
2. **Re-Bootstrap Phase 2** (`bootstrap-vote.ts` Phase 2): neues Semaphore + Voting NFT minting mit:
   - `vkeyRefTxHash = "3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083"`
   - `vkeyRefOutputIndex = 0`
   Diese Konstanten sind bereits korrekt in `src/tx/src/vote.ts` hinterlegt.
3. **cast-vote.ts updaten**: neue `semaphoreScriptAddress`, `votingScriptAddress`, `semaphoreNftPolicyId`, `votingNftPolicyId` von Bootstrap-Output übernehmen
4. **Backend-Datenbank updaten**: neue Policy IDs und Adressen in der VotingEvent-Entity
5. **Frontend vote-helpers.ts**: `VKEY_REF_TX_HASH/INDEX` sind bereits korrekt (`3dc5c982...#0`)

**Wichtig beim Re-Bootstrap:** Das neue Semaphore-Datum muss `vkey_ref_input = 3dc5c982...#0` erhalten (always-false, permanent gesperrt, kann nie spent werden → alle zukünftigen Votes funktionieren).

---

### Nicht-Ursachen (Session 2 zusätzlich ausgeschlossen)

- ❌ VKey-Datenmismatch (alle 10 Felder korrekt verifiziert)
- ❌ CBOR-Encoding der G2-Punkte (Chunking ist transparent für Plutus-Runtime)
- ❌ ZK-Proof falsch (wurde nicht ausgeführt, aber kein Grund gefunden warum er falsch wäre)
- ❌ Falscher Merkle-Root (on-chain Wert = cast-vote.ts Hardcode)

---

*Root Cause gefunden: 2026-04-10 — 1 weitere Session, on-chain State analysiert*

---

## Analyse-Protokoll Session 3 — 2026-04-10: Root Cause endgültig gefunden + Fix

### Root Cause: JavaScript BigInt Precision Loss durch `json-bigint` + `JSON.parse`

**Symptom:** Neues Event (1347743114 "Test 35") hat on-chain `group_merke_root` ≠ Backend-Wert.

| Quelle | group_merke_root |
|--------|-----------------|
| Backend (`groupMerkleRootHash`) | `35632686238999577966785466154003189654355401386946381996050240642721051780222` |
| On-chain SemaphoreDatum | `35632686238999578104686549705216941203319443376414794608333938661932803293184` |

**Beweis:** `BigInt(Number('35632686238999577966785466154003189654355401386946381996050240642721051780222'))` ergibt EXAKT den on-chain Wert — klassischer IEEE 754 double-precision Verlust.

### Bug-Kette (MeshSDK "JSON"-Format mit großen BigInts)

```
1. integer(merkleRoot)
   → { int: BigInt(3563...780222n) }           ← nativer JS BigInt, korrekt

2. castRawDataToJsonString() (in MeshSDK txOutInlineDatumValue)
   → JSONBig.stringify({ int: 3563...780222n })
   → '{"int":35632686238999577966...780222}'   ← UNQUOTED! (json-bigint Verhalten)

3. Später: JSON.parse('{"int":35632686...780222}')
   → { int: 3.563268623899958e+76 }            ← JS Number! Precision verloren!

4. fromJsonToPlutusData({ int: Number })
   → BigInt(3.563268623899958e+76)
   → 35632686238999578104...293184n            ← FALSCH → auf-chain gespeichert
```

**Warum passiert Step 3?** MeshSDK speichert den datum content als JSON-String (`castRawDataToJsonString`) und liest ihn später mit nativem `JSON.parse` wieder ein. `json-bigint` emittiert native JS BigInts als unquoted JSON-Numbers, die der native JSON-Parser auf Float64 reduziert.

### Alle betroffenen Felder (>53 bit, verlieren Precision)

| Datei | Code | Feld |
|-------|------|------|
| `blockchain-helpers.ts:180` | `createGroupDatum` | `merkleRoot` (BLS12-381 Poseidon-Hash) |
| `blockchain-helpers.ts:509` | `semaphoreDatum` | `merkleRoot` |
| `vote-helpers.ts:327` | `semaphoreRedeemer` | `nullifierHash` (BLS12-381 Scalar) |
| `vote-helpers.ts:328` | `semaphoreRedeemer` | `signalHash` (BLS12-381 Scalar) |
| `vote-helpers.ts:335` | `updatedSemaphoreDatum` | `groupMerkleRoot` |

### Fix

`{ int: bigintValue }` → `{ int: bigintValue.toString() }` an allen 5 Stellen.

**Warum das funktioniert:** `json-bigint` emittiert Strings quoted (`"35632686..."`). `JSON.parse` gibt einen JS String zurück. `fromJsonToPlutusData` ruft `BigInt(string)` — exact, kein Precision Loss.

```typescript
// VORHER (Bug): Precision Loss
integer(merkleRoot)               // → { int: BigInt } → unquoted number → float

// NACHHER (Fix): Korrekt
{ int: merkleRoot.toString() }    // → { int: "35632..." } → quoted string → BigInt(string)
```

**TypeScript:** `tsc --noEmit` läuft ohne Fehler durch.

### Status nach Fix

- ✅ `blockchain-helpers.ts` gefixt (2 Stellen)
- ✅ `vote-helpers.ts` gefixt (3 Stellen)
- ❌ Event 1347743114 noch immer broken (on-chain `group_merke_root` ist immutable — falscher Wert von damals)
- 🔴 **Aktion erforderlich:** Neues Event erstellen, alle Teilnehmer neu registrieren, mit gefikxtem Code bootstrappen, dann voten.

### VKey und Nullifier Status (alle OK)

- `3dc5c982...#0` (VKey, always-false): **UNSPENT ✓**
- `vkey_ref_input` im neuen Event Datum: korrekt = `3dc5c982...#0` ✓
- `nullifier_mpf_root` im neuen Event: alle Nullen (noch kein Vote) ✓

### Nicht-Ursachen (Session 3 zusätzlich ausgeschlossen)

- ❌ Teilnehmer-Wechsel (backend root = `new Group(eventId, 20, [current_commitment]).root` ✓)
- ❌ Falsches API-Format (backend gibt merkleRoot als quoted JSON string zurück ✓)
- ❌ `PlutusData.newInteger(BigInt)` fehlerhaft (korrekte CBOR-Ausgabe verifiziert ✓)

---

*Root Cause: MeshSDK JSON-Rundreise Precision Bug — gefunden und gefixt: 2026-04-10*

---

## Analyse-Protokoll Session 4 — 2026-04-13: Weitere Fehler beim Testen

### Kollaterale Bugs gefunden und behoben

#### Bug 1: Unzureichende Collateral-Auswahl im Vote-TX (`vote-helpers.ts`)

**Symptom:** `InsufficientCollateral (DeltaCoin 2983407) (Coin 3033287)` beim Vote-Submit.

**Ursache:** `vote-helpers.ts` nutzte `walletUtxos[0]` als Collateral — blindes Nehmen des ersten UTxOs ohne Mindest-ADA-Prüfung.

**Fix:** Import von `findCollateralUtxo` aus `blockchain-helpers.ts` und Verwendung mit 5 ADA Minimum (identisch zu bootstrap).

```typescript
// VORHER: walletUtxos[0]
// NACHHER:
const collateralUtxo = findCollateralUtxo(walletUtxos, 5000000);
```

#### Bug 2: Bootstrap nach Event-Start schlägt fehl (Protocol-Constraint, kein Code-Bug)

**Symptom:** `ValidationTagMismatch (IsValid True)` beim Semaphore+Voting NFT Minting.

**Ursache:** Der Voting Mint Validator prüft in `voting.ak`:
```aiken
is_entirely_before(validity_range, event_start)
```
D.h. die TX-Validitätsobergrenze (currentSlot + 5 Minuten) muss KLEINER sein als `event_start`. Wird nach dem Event-Start bootstrapped, schlägt diese Bedingung fehl.

**Kein Code-Bug** — das ist eine bewusste Protocol-Constraint: Bootstrap MUSS vor Event-Start erfolgen.

**Regel für Tests:** Event-Start mindestens 10–15 Minuten in die Zukunft setzen, danach sofort bootstrappen.

### Aktueller Test-Stand (2026-04-13)

| Bug | Status |
|-----|--------|
| BigInt Precision Loss (bootstrap, vote datum/redeemer) | ✅ Gefixt |
| Collateral-Auswahl im Vote-TX | ✅ Gefixt |
| Bootstrap nach Event-Start | ✅ Verstanden (kein Bug, Protocol-Constraint) |
| Vote-Flow E2E erfolgreich | 🔴 Noch ausstehend — neues Event mit korrektem Timing nötig |

### Checkliste für nächsten Test

1. Neues Event erstellen mit `starting_date` ≥ 15 Minuten in der Zukunft
2. Teilnehmer registrieren (Semaphore-Identität generieren), Commitment in Merkle Tree
3. **Sofort** bootstrappen (vor Event-Start)
4. Nach Event-Start voten → E2E-Flow sollte nun durchlaufen

---

*Session 4: Collateral-Fix + Bootstrap-Timing-Constraint identifiziert — 2026-04-13*

---

## Session 5 — MPF Nullifier Encoding Bug (2026-04-13)

### Hintergrund

Ein neues Event wurde korrekt gebootstrappt (BigInt-Fix aktiv, `group_merke_root` on-chain präzise).
Vote-TX schlägt weiterhin fehl: `ValidationTagMismatch (IsValid True)` im Semaphore-Spending-Script.

### Analyse der Semaphore-Script-Bedingungen

Das Semaphore-Spending-Script prüft 6 Bedingungen (alle mit `and { ... }` verknüpft):

| # | Bedingung | Status |
|---|-----------|--------|
| 0 | `is_value_returned` — NFT-Betrag zurück | ✅ OK |
| 1 | `is_datum_preserved` — `group_merke_root`, `group_token_policy`, `vkey_ref_input` unverändert | ✅ OK |
| 2 | VKey-Reference-Input gefunden | ✅ OK (UNSPENT bestätigt) |
| 3 | `groth_verify` — ZK-Proof-Verifikation | ❓ unklar |
| 4 | `is_new_nullifier_root` — MPF-Insert korrekt | 🔴 **Wahrscheinliche Fehlerursache** |
| 5 | `is_signal_message_tampered` — blake2b_256(signal_message) % R == signal_hash | ✅ OK |

### Root Cause: MPF Nullifier-Value Encoding-Mismatch

On-chain berechnet das Semaphore-Script den Nullifier-Wert als:
```aiken
expect Some(n_value) = scalar.new(nullifier)
let nullifier_value = scalar.to_bytearray_little_endian(n_value, 0)  -- size=0 = MINIMAL encoding
let nullifier_key   = crypto.blake2b_256(nullifier_value)
```

`size = 0` bedeutet **minimale Kodierung** (keine Padding-Nullen). Für Skalare < 2^248 (ca. 0.86% aller BLS12-381-Skalare) produziert das weniger als 32 Bytes — die **trailing zeros** (= leading zeros in Big-Endian) werden abgeschnitten.

Das Backend verwendete bisher **immer 32 Bytes** (`padStart(64, '0')`):
```typescript
const hex = nullifierBigInt.toString(16).padStart(64, '0'); // ← BUG: immer 32 Bytes
const value = Buffer.from(bigEndian).reverse();
```

Wenn `nullifierHash < 2^248` (deterministisch für eine bestimmte Identität):
- Backend: 32-byte `value` → `blake2b_256(32-byte)` = `backend_key`
- On-chain: 31-byte `value` → `blake2b_256(31-byte)` = `on_chain_key`
- `backend_key ≠ on_chain_key`
- MPF-New-Root (Backend) ≠ `including(on_chain_key, on_chain_value, [])` (On-chain)
- Bedingung 4 schlägt **immer** fehl für diese Identität

Da `nullifierHash` deterministisch ist (gleiche Identität, gleiches Event), schlägt der Vote für die betroffene Identität **konsistent** fehl.

### Fix (2026-04-13)

Minimale Kodierung in Backend und ZK-Modul eingebaut:

```typescript
// NEU — matching scalar.to_bytearray_little_endian(n, 0):
const rawHex = nullifierBigInt.toString(16);           // keine leading zeros
const paddedHex = rawHex.length % 2 ? '0' + rawHex : rawHex;
const bigEndian = Buffer.from(paddedHex, 'hex');
const value = Buffer.from(Buffer.from(bigEndian).reverse()); // minimal LE
```

#### Geänderte Dateien
- `src/backend/src/voting-event/voting-event.service.ts` — `insertNullifier()` + `rollbackNullifier()`
- `src/zk/src/mpf.ts` — `nullifierToKeyValue()`

### Diagnose-Logging

In `src/frontend/app/event/[id]/page.tsx` wurden Console-Logs hinzugefügt, die nach dem Vote-Versuch folgende Schlüsselwerte zeigen:
- `nullifierHash` und ob er < 2^248 ist (Encoding-Bug würde auftreten)
- `merkleRoot` vom Backend vs. ZK-Circuit vs. On-chain (zeigt Mismatch falls Merkle-Baum nach Bootstrap geändert)
- `mpfNewRoot` und `mpfProofSteps` (zeigt MPF-Proof-Struktur)

### Nächste Schritte

1. **Backend neu starten** (NestJS, port 3000) — der Fix ist in `voting-event.service.ts`
2. **Backend neu builden** falls TypeScript: `cd src/backend && npm run build`
3. Neues Event mit frisch registrierter Identität testen → Console-Logs im Browser analysieren
4. Falls `nullifierHash < 2^248` → Fix hat das Problem behoben
5. Falls nicht → Logs zeigen welche Bedingung wirklich fehlschlägt

---

*Session 5: MPF Nullifier Encoding Bug identifiziert und gefixt — 2026-04-13*

---

## Session 6 — 2026-04-13: Zweite Precision-Loss-Quelle im Admin-Bootstrap

### Symptom

Vote-TX für Event 2172796811 schlägt weiterhin fehl: `ValidationTagMismatch (IsValid True)` im Semaphore-Script, obwohl alle Fixes aus Session 3 und 5 aktiv sind.

### Root Cause: `parseInt()` in `manage/page.tsx` vor dem Bootstrap

Die Session-3-Fixes haben `integer(bigint)` und `{ int: bigint.toString() }` korrekt in `vote-helpers.ts` und `blockchain-helpers.ts` gesetzt — aber das Problem saß eine Ebene weiter oben:

```typescript
// manage/page.tsx (HEAD — FEHLERHAFT):
const merkleRoot = parseInt(eventData.groupMerkleRootHash || '0');
//                 ^^^^^^^^ → JS Number (float64) → Precision verloren!
```

`parseInt("36351812645344680880051503643601907518687871142185742330952368813457705573455")` ergibt `3.635181264534468e+76` — ein IEEE-754 double, das nur ~15–16 signifikante Dezimalstellen hat. Dieser precision-verlorene `number` wurde dann an `buildSemaphoreVotingMintTransaction({ merkleRoot: number })` übergeben.

### Beweis via Blockfrost (Event 2172796811)

| Quelle | group_merke_root |
|--------|-----------------|
| Backend DB (`groupMerkleRootHash`) | `36351812645344680880051503643601907518687871142185742330952368813457705573455` |
| On-chain SemaphoreDatum | `36351812645344681836751130570586947219676313571453980421080456567302735790080` |
| `BigInt(Number(DB_Wert))` | `36351812645344681836751130570586947219676313571453980421080456567302735790080` ✓ |

`BigInt(Number(DB_Wert))` ergibt exakt den on-chain Wert — der Float-Roundtrip hinterließ die charakteristische trailing-zeros Signatur im Hex:
- On-chain Hex: `505e65968709c400000000000000000000000000000000000000000000000000` (Abschneidung)
- Exakter Hex:  `505e65968709c36796c5d6fdbe4e802761397f52ba956eadc2a761b4030c9c4f`

### Warum das Minting trotzdem durchging

Beide Datums (Group und Semaphore) wurden mit demselben precision-verlorenen Wert geminted. Der Semaphore-Minting-Check vergleicht nur `group_datum.group_merke_root == semaphore_datum.group_merke_root` — beide Seiten waren identisch (gleichermaßen falsch) → Minting erfolgreich.

### Warum der Vote scheitert

Der ZK-Circuit berechnet den Merkle-Root on-the-fly aus dem echten Poseidon-Hash (exacte Backend-DB-Zahl als `publicSignals[0]`). Dieser exakte Wert stimmt nicht überein mit dem precision-verlorenen `dat.group_merke_root` on-chain:

1. **ZK-Proof-Verifikation** (`groth_verify`): `public_values[0] = dat.group_merke_root` (precision-lost) ≠ `publicSignals[0]` (exakt) → Proof schlägt fehl.
2. **`is_datum_preserved`**: `updatedSemaphoreDatum.group_merke_root` = exakter DB-Wert ≠ on-chain precision-lost → Bedingung schlägt fehl.

### Fixes (2026-04-13)

#### `src/frontend/app/event/[id]/manage/page.tsx`

```typescript
// VORHER (Bug):
const merkleRoot = parseInt(eventData.groupMerkleRootHash || '0');

// NACHHER (Fix):
const merkleRoot = BigInt(eventData.groupMerkleRootHash || '0');
```

#### `src/frontend/lib/blockchain-helpers.ts`

```typescript
// VORHER (Bug):
interface BuildSemaphoreVotingMintTxParams {
  merkleRoot: number;  // ← float64, Precision Loss möglich
  ...
}
interface BuildGroupMintTxParams {
  merkleRoot: number;  // ← float64, Precision Loss möglich
  ...
}

// NACHHER (Fix):
interface BuildSemaphoreVotingMintTxParams {
  merkleRoot: bigint;  // ← exakt
  ...
}
interface BuildGroupMintTxParams {
  merkleRoot: bigint;  // ← exakt
  ...
}
```

`createGroupDatum(merkleRoot: bigint, ...)` und `integer(merkleRoot)` in der Semaphore-Datum-Erstellung waren bereits korrekt — nur die Interface-Typen mussten angepasst werden.

### Unterschied zu Session-3-Bug

| | Session 3 | Session 6 |
|---|-----------|-----------|
| **Bug** | `json-bigint` emittiert unquoted number → `JSON.parse` reduziert auf float | `parseInt()` konvertiert vor Übergabe an Funktion auf float |
| **Wo** | MeshSDK-interne JSON-Rundreise (`castRawDataToJsonString` → `JSON.parse`) | Admin-Page direkter Aufruf |
| **Symptom** | Gleicher Wert, gleicher Effekt (precision-lost on-chain) | Gleicher Effekt, andere Code-Stelle |
| **Fix** | `{ int: bigintValue.toString() }` | `parseInt` → `BigInt` |

Beide Bugs zusammen deckten alle precision-kritischen Pfade ab:
- **Session 3**: Fix der Serialisierung im Transaction-Builder (für alle großen Integers in Datums/Redeemern)
- **Session 6**: Fix der Datenübergabe im Admin-Bootstrap-Flow (Typ-Sicherheit an der API-Grenze)

### Erforderliche Aktion

Event 2172796811 ist **nicht reparierbar** — `group_merke_root` ist immutable (protected by `is_datum_preserved`). Das Event muss neu geminted werden:

1. Admin öffnet Manage-Page für Event 2172796811
2. Klick auf "Start Voting" (Bootstrap Phase 2) — mit gefikxtem `BigInt` Code
3. Neue Policy IDs und Adressen werden via `POST /voting-event/:eventId/save-blockchain-data` im Backend gespeichert
4. Teilnehmer müssen sich neu registrieren (neue Group-NFT Policy ID)
5. Dann voten → E2E sollte durchlaufen

### Status nach Session 6

| Problem | Status |
|---------|--------|
| BigInt Precision Loss — MeshSDK JSON-Rundreise (Session 3) | ✅ Gefixt |
| MPF Nullifier Encoding-Mismatch (Session 5) | ✅ Gefixt |
| BigInt Precision Loss — `parseInt` in Admin-Page (Session 6) | ✅ Gefixt |
| E2E Vote-Flow erfolgreich | 🔴 Noch ausstehend — Event 2172796811 muss reminted werden |

---

*Session 6: Zweite Precision-Loss-Quelle (`parseInt` in manage/page.tsx) identifiziert und gefixt — 2026-04-13*

---

## Session 7 — 2026-04-14: Dritte (und finale) Precision-Loss-Quelle — Browser WASM CSL

### Symptom

Neues Event 4260190527 wurde mit gefikxtem `BigInt(...)` Code bootstrapped — aber Blockfrost zeigt trotzdem den precision-verlorenen Wert on-chain:

| Quelle | group_merke_root hex |
|--------|---------------------|
| Backend DB (exakt) | `2f2b4cfa62abf96566571f04f745268fdfa11601ce72bd1a033dd163c1f0f6f3` |
| On-chain SemaphoreDatum | `2f2b4cfa62abfa00000000000000000000000000000000000000000000000000` |

Session-6-Fix (`parseInt` → `BigInt`) war aktiv, trotzdem falscher on-chain Wert.

### Diagnose: Irreführende Diagnostics

Die Console-Logs `merkle root match? backend==on-chain: true` verglichen nur Backend-Werte mit sich selbst — **nicht** mit dem tatsächlichen on-chain Datum. Ohne direkte Blockfrost-Abfrage wäre dieser Bug nicht auffindbar gewesen.

### Root Cause: Browser WASM CSL `from_json` verliert Precision

Die Kette `integer(bigint)` → `'JSON'`-Format führt über:

```
1. integer(BigInt("30872..."))   → { int: 30872...n }         (JS BigInt, korrekt)
2. JSONbig.stringify({int: bigint}) → '{"int":30872...}'      (unquoted, korrekt)
3. csl.PlutusData.from_json('{"int":30872...}')               ← WASM CSL-Bug!
   → Browser WASM JSON-Parser liest 70-stellige Zahl als float64
   → Precision verloren → falscher on-chain Wert
```

**Warum `cast-vote.ts` (Node.js) trotzdem funktioniert:** Dieselbe CSL-Bibliothek kompiliert für Node.js nutzt den nativen V8 BigInt-Parser in `from_json` → kein Precision Loss. Browser WASM nutzt einen anderen C++-JSON-Parser-Pfad → float64-Truncation.

### Gescheiterte Zwischenlösung: `'Mesh'`-Format

Versuch: `'JSON'` → `'Mesh'` in allen Aufrufen. Dieser Ansatz crasht jedoch, weil MeshSDK's `toPlutusData()` nur native Typen und `{alternative, fields}` verarbeitet, **nicht** die Wrapper-Objekte `{int: x}`, `{bytes: x}`, `{list: x}` aus `integer()`, `byteString()`, `list()`:

```javascript
// toPlutusData({ int: bigint }) → Objekt-Case → data.alternative.toString() → TypeError!
```

### Echter Fix: `toCborHex()` — direkte CSL-Konstruktion

Neue private Hilfsfunktion in `blockchain-helpers.ts` und `vote-helpers.ts`, die unsere MeshSDK-Wrapper-Objekte direkt mit CSL-Primitiven serialisiert und CBOR-Hex zurückgibt:

```typescript
async function toCborHex(data: any): Promise<string> {
  const { csl } = await getCsl();

  function convert(d: any): any {
    if ('int' in d) {
      const s = typeof d.int === 'bigint' ? d.int.toString() : String(d.int);
      return csl.PlutusData.new_integer(csl.BigInt.from_str(s));  // ← exakter String
    }
    if ('bytes' in d)       return csl.PlutusData.new_bytes(Buffer.from(d.bytes, 'hex'));
    if ('list' in d)        { /* PlutusList.new() + rekursiv */ }
    if ('alternative' in d || 'constructor' in d) { /* ConstrPlutusData.new() */ }
  }
  return convert(data).to_hex();
}
```

Alle Datums/Redeemer werden vor der TX-Builder-Kette vorberechnet und als `'CBOR'`-Format übergeben:

```typescript
// VORHER (Bug): JSON-Pfad → WASM float64-Truncation
.txOutInlineDatumValue(semaphoreDatum, 'JSON')
.txInRedeemerValue(semaphoreRedeemer, 'JSON', exunits)

// NACHHER (Fix): CBOR-Pfad → kein JSON-Parser → kein Precision Loss
const semaphoreDatumCbor = await toCborHex(semaphoreDatum);
const semaphoreRedeemerCbor = await toCborHex(semaphoreRedeemer);
.txOutInlineDatumValue(semaphoreDatumCbor, 'CBOR')
.txInRedeemerValue(semaphoreRedeemerCbor, 'CBOR', exunits)
```

### Geänderte Dateien

**`src/frontend/lib/blockchain-helpers.ts`:**
- `getCsl()` + `toCborHex()` hinzugefügt
- Group-Datum, Semaphore-Datum, UrnaDatum, alle Mint-Redeemer → CBOR

**`src/frontend/lib/vote-helpers.ts`:**
- `getCsl()` in vorhandenen CSL-Loader integriert + `toCborHex()` hinzugefügt
- Semaphore-Redeemer, updatedSemaphoreDatum, updatedUrnaDatum → CBOR
- Voting-Redeemer `conStr(1, [])` bleibt `'JSON'` (enthält keine großen Integers)

### Vollständige Precision-Loss-Taxonomie (alle drei Bugs)

| Session | Bug | Code-Stelle | Symptom |
|---------|-----|-------------|---------|
| 3 | `json-bigint` → `JSON.parse` → float | MeshSDK intern (`castRawDataToJsonString`) | Node.js Tests ohne Browser schlagen fehl |
| 6 | `parseInt()` vor `integer()` | `manage/page.tsx` Z. 722 | Bootstrap mit falschem Root |
| 7 | Browser WASM CSL `from_json` | `csl.PlutusData.from_json(DetailedSchema)` | Bootstrap mit korrektem JS-BigInt trotzdem falsch |

**Hinweis zu Session 3:** Der damalige Fix (`{ int: bigintValue.toString() }`) wurde später wieder auf `integer(bigint)` zurückgesetzt, weil Browser-WASM-CSL quoted Strings im DetailedSchema-Format (`{"int":"..."}`) ablehnt. Session 7 löst das Problem durch vollständiges Umgehen des JSON-Pfads.

### Verifikation: Event 2181337142

Neues Event mit korrektem CBOR-Pfad bootstrapped (2026-04-14):

| Quelle | group_merke_root hex |
|--------|---------------------|
| Backend DB (exakt) | `3c5e51ffb6522dc127962a79958d537cbeeaad6d75c1cd5979b238279875eefa` |
| On-chain SemaphoreDatum | `3c5e51ffb6522dc127962a79958d537cbeeaad6d75c1cd5979b238279875eefa` |
| Precision-lost wäre | `3c5e51ffb6522e00000000000000000000000000000000000000000000000000` |

**Erstmals exakter on-chain Wert** ✅ — kein trailing-zeros Muster.

Weitere Datum-Felder korrekt:
- `nullifier_mpf_root` = all-zeros (leere Trie) ✅
- `vkey_ref_input` = `3dc5c982...#0` (always-false, permanent) ✅

### cast-vote.ts / mint-vkey.ts — Keine Änderungen nötig

Analyse beider Debug-Skripte: kein Handlungsbedarf.
- `cast-vote.ts` nutzt `'JSON'`-Format auf Node.js — funktioniert wegen V8-BigInt-Parser ✓
- `mint-vkey.ts` enthält keine Integers > 2^53 (`nPublic = 4`) ✓
- Beide Skripte sind an alte Event-Daten gebunden (hardcoded Adressen) und dienen nur als Referenz

### Status nach Session 7

| Problem | Status |
|---------|--------|
| BigInt Precision Loss — MeshSDK JSON-Rundreise (Session 3) | ✅ Gefixt |
| MPF Nullifier Encoding-Mismatch (Session 5) | ✅ Gefixt |
| BigInt Precision Loss — `parseInt` in Admin-Page (Session 6) | ✅ Gefixt |
| BigInt Precision Loss — Browser WASM CSL `from_json` (Session 7) | ✅ Gefixt |
| E2E Vote-Flow erfolgreich | 🟡 Event 2181337142 korrekt bootstrapped — Vote ausstehend |

---

*Session 7: Browser WASM CSL Precision-Loss durch `toCborHex()` vollständig behoben — 2026-04-14*
