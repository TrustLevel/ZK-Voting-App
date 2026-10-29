/**
 * Relay vote transaction builder — Node.js backend only.
 *
 * Differences from node/vote.ts (voter-signed frontend path):
 *   - Uses relay wallet params instead of voter wallet params.
 *   - Reads groupMerkleRoot and currentOptions directly from on-chain UTxO datums
 *     instead of requiring them as params (avoids stale DB values and keeps
 *     the service params minimal).
 *   - Uses selectUtxoForCollateral instead of walletUtxos[0].
 *   - CSL loaded via createRequire (CJS) — the ESM build of @meshsdk/core-csl
 *     fails in Node.js because whisky-evaluator imports its .wasm as an ES module.
 *
 * Concurrency: callers must serialise per-event submissions externally (withVoteLock
 * in voting-event.service.ts) — this function is not re-entrant safe for the same event.
 */

import { createRequire } from 'module';
import {
  BlockfrostProvider,
  UTxO,
  integer,
  list,
  conStr,
  byteString,
  MeshTxBuilder,
} from '@meshsdk/core';
import { createUrnaDatum, createOutputReference } from '../utils.js';
import { selectUtxoForCollateral } from '../browser/utils-browser.js';
import { CardanoNetwork, OutputRef, vkeyRefFor, posixMsToSlot } from '../network.js';

export { VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX } from './vote.js';

// CJS load of @meshsdk/core-csl — used for on-chain datum parsing, CBOR serialization,
// and as the MeshTxBuilder serializer. The default CardanoSDKSerializer (Scala.js, from
// @meshsdk/core-cst) throws "unreachable" on complex Plutus script txs in Node.js.
// CSLSerializer uses the same Rust/WASM CSL and works correctly in the CJS context.
// The ESM build of @meshsdk/core-csl fails in Node.js (whisky-evaluator imports .wasm as
// a native ES module); the CJS build works fine and exposes the same API.
const _req = createRequire(import.meta.url);
const { csl, CSLSerializer, applyParamsToScript: cjsApplyParamsToScript } = _req('@meshsdk/core-csl') as any;

/**
 * CJS-backed version of applyOrefParamToScript.
 * The ESM build of @meshsdk/core-csl crashes in Node.js with WASM "unreachable"
 * inside js_apply_params_to_script. Loading CJS via createRequire avoids this.
 */
export function applyOrefParamToScriptNode(validatorCbor: string, oref: any): string {
  return cjsApplyParamsToScript(validatorCbor, [oref], 'JSON');
}

/** Fee (lovelace) declared in the body of a (signed or unsigned) transaction hex. */
export function getTxFeeLovelace(txHex: string): bigint {
  const tx = csl.Transaction.from_hex(txHex);
  return BigInt(tx.body().fee().to_str());
}

/**
 * Transaction id (blake2b-256 of the body) of a signed or unsigned transaction hex.
 * CIP-30 signing only adds witnesses, so the id of the unsigned tx the backend built
 * equals the id of the signed tx the organiser returns — submit-tx relies on that.
 */
export function getTxHash(txHex: string): string {
  return csl.FixedTransaction.from_hex(txHex).transaction_hash().to_hex();
}

// ── CBOR serialization ─────────────────────────────────────────────────────────
//
// CardanoSDKSerializer (Scala.js, used by MeshTxBuilder) cannot handle JavaScript BigInt
// in { int: bigint } when the value exceeds 2^53. Semaphore nullifier/signal hashes and
// group Merkle roots are 256-bit values. Pre-serialize them to CBOR hex via CSL so
// MeshTxBuilder receives an opaque hex string ('CBOR' mode) instead of a raw BigInt.

function toCborHex(data: any): string {
  function convert(d: any): any {
    if (d === null || d === undefined) throw new Error('toCborHex: null/undefined field');
    if ('int' in d) {
      const s = typeof d.int === 'bigint' ? d.int.toString() : String(d.int);
      return csl.PlutusData.new_integer(csl.BigInt.from_str(s));
    }
    if ('bytes' in d) {
      return csl.PlutusData.new_bytes(Buffer.from(d.bytes, 'hex'));
    }
    if ('list' in d) {
      const pl = csl.PlutusList.new();
      for (const item of d.list) pl.add(convert(item));
      return csl.PlutusData.new_list(pl);
    }
    if ('alternative' in d || 'constructor' in d) {
      const alt = d.alternative ?? d.constructor;
      const pl = csl.PlutusList.new();
      for (const field of d.fields) pl.add(convert(field));
      return csl.PlutusData.new_constr_plutus_data(
        csl.ConstrPlutusData.new(csl.BigNum.from_str(String(alt)), pl)
      );
    }
    throw new Error(`toCborHex: unknown shape: ${JSON.stringify(d)}`);
  }
  return convert(data).to_hex();
}

// ── On-chain datum parsing ─────────────────────────────────────────────────────

/**
 * Extract group_merke_root (field 1) from a SemaphoreDatum inline datum hex.
 * SemaphoreDatum = Constr(0, [group_policy_id, group_merke_root, nullifier_mpf_root, vkey_ref_input])
 */
function parseGroupMerkleRootFromDatum(datumHex: string): bigint {
  const pd = csl.PlutusData.from_hex(datumHex);
  const constrData = pd.as_constr_plutus_data();
  if (!constrData) throw new Error('Semaphore datum is not a constructor');
  return BigInt(constrData.data().get(1).as_integer().to_str());
}

/**
 * Extract options (field 1) from a UrnaDatum inline datum hex.
 * UrnaDatum = Constr(0, [weight, options, event_dates, semaphore_nft_policy_id])
 * options   = List<List<Int>>  where each inner list is [optionIndex, voteCount]
 */
function parseCurrentOptionsFromDatum(datumHex: string): Array<[number, number]> {
  const pd = csl.PlutusData.from_hex(datumHex);
  const constrData = pd.as_constr_plutus_data();
  if (!constrData) throw new Error('Voting UTxO datum is not a constructor');
  const optionsList = constrData.data().get(1).as_list();
  if (!optionsList) throw new Error('Options field in UrnaDatum is not a list');
  const result: Array<[number, number]> = [];
  for (let i = 0; i < optionsList.len(); i++) {
    const pair = optionsList.get(i).as_list();
    if (!pair) throw new Error(`Option entry ${i} is not a list`);
    const idx   = Number(pair.get(0).as_integer()?.to_str() ?? '0');
    const count = Number(pair.get(1).as_integer()?.to_str() ?? '0');
    result.push([idx, count]);
  }
  return result;
}

// ── MPF proof steps → Plutus data ─────────────────────────────────────────────

function mpfStepsToPlutusData(steps: Array<any>): ReturnType<typeof list> {
  return list(steps.map(step => {
    switch (step.type) {
      case 'branch':
        return conStr(0, [integer(step.skip), byteString(step.neighbors)]);
      case 'fork':
        return conStr(1, [
          integer(step.skip),
          conStr(0, [integer(step.neighbor.nibble), byteString(step.neighbor.prefix), byteString(step.neighbor.root)]),
        ]);
      case 'leaf':
        return conStr(2, [integer(step.skip), byteString(step.neighbor.key), byteString(step.neighbor.value)]);
      default:
        throw new Error(`Unknown MPF proof step type: ${step.type}`);
    }
  }));
}

// ── Public interface ───────────────────────────────────────────────────────────

export interface BuildRelayVoteTransactionParams {
  provider: BlockfrostProvider;

  // Cardano network of the event (default 'preprod'); selects network id, slot config and VKey UTxO.
  network?: CardanoNetwork;
  // Override of the VKey reference UTxO (default: the network's constant from ../network.ts).
  vkeyRef?: OutputRef;

  semaphoreScriptAddress: string;
  votingScriptAddress: string;
  semaphoreNftPolicyId: string;
  votingNftPolicyId: string;
  groupNftPolicyId: string;

  semaphoreValidatorCbor: string;
  votingValidatorCbor: string;

  // Relay wallet — signs and pays fees; voter identity never appears on-chain.
  relayWalletUtxos: UTxO[];
  relayWalletAddress: string;
  relayPaymentKeyHash: string;

  zkProof: { pi_a: string; pi_b: string; pi_c: string };
  nullifierHash: bigint;
  signalHash: bigint;
  signalMessage: string;

  mpfProofSteps: Array<object>;
  mpfNewRoot: string;

  voteSignal: Array<[number, number]>;
  weight: number;
  eventStart: number; // POSIX ms
  eventEnd: number;   // POSIX ms
}

export async function buildRelayVoteTransaction(
  params: BuildRelayVoteTransactionParams,
): Promise<string> {
  const {
    provider,
    semaphoreScriptAddress, votingScriptAddress,
    semaphoreNftPolicyId, votingNftPolicyId,
    groupNftPolicyId,
    semaphoreValidatorCbor, votingValidatorCbor,
    relayWalletUtxos, relayWalletAddress, relayPaymentKeyHash,
    zkProof, nullifierHash, signalHash, signalMessage,
    mpfProofSteps, mpfNewRoot,
    voteSignal, weight, eventStart, eventEnd,
  } = params;
  const network: CardanoNetwork = params.network ?? 'preprod';
  const vkeyRef = vkeyRefFor(network, params.vkeyRef);

  // ── Fetch on-chain UTxOs ───────────────────────────────────────────────────

  const semaphoreUtxos: UTxO[] = await provider.fetchAddressUTxOs(semaphoreScriptAddress);
  const semaphoreUtxo = semaphoreUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(semaphoreNftPolicyId))
  );
  if (!semaphoreUtxo) throw new Error('Semaphore UTxO not found at ' + semaphoreScriptAddress);

  const votingUtxos: UTxO[] = await provider.fetchAddressUTxOs(votingScriptAddress);
  const votingUtxo = votingUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(votingNftPolicyId))
  );
  if (!votingUtxo) throw new Error('Voting UTxO not found at ' + votingScriptAddress);

  // ── Read live state from on-chain datums ────────────────────────────────────
  //
  // groupMerkleRoot: read from chain — DB value can lag after new participants join.
  // currentOptions:  read from chain — DB always stores initial zeros, chain has live tallies.

  const semaphoreDatumHex = semaphoreUtxo.output.plutusData;
  if (!semaphoreDatumHex) throw new Error('Semaphore UTxO has no inline datum');
  const groupMerkleRoot = parseGroupMerkleRootFromDatum(semaphoreDatumHex);

  const votingDatumHex = votingUtxo.output.plutusData;
  const currentOptions: Array<[number, number]> = votingDatumHex
    ? parseCurrentOptionsFromDatum(votingDatumHex)
    : voteSignal.map(([idx]) => [idx, 0]);

  // ── Collateral ─────────────────────────────────────────────────────────────

  const collateralUtxo = selectUtxoForCollateral(relayWalletUtxos);
  if (!collateralUtxo) throw new Error('Relay wallet has no suitable collateral UTxO (need pure ADA ≥5 ADA)');

  // ── Build updated datums ───────────────────────────────────────────────────

  const updatedOptions = currentOptions.map(([idx, count]) => {
    const voted = voteSignal.find(([vi]) => vi === idx);
    return list([integer(idx), integer(count + (voted ? voted[1] : 0))]);
  });

  const updatedUrnaDatum = createUrnaDatum({
    weight,
    options: updatedOptions,
    eventStart,
    eventEnd,
    semaphoreNftPolicyId,
  });

  const semaphoreRedeemer = conStr(1, [
    conStr(0, [byteString(zkProof.pi_a), byteString(zkProof.pi_b), byteString(zkProof.pi_c)]),
    mpfStepsToPlutusData(mpfProofSteps),
    integer(nullifierHash),
    integer(signalHash),
    byteString(signalMessage),
  ]);

  const updatedSemaphoreDatum = conStr(0, [
    byteString(groupNftPolicyId),
    integer(groupMerkleRoot),
    byteString(mpfNewRoot),
    createOutputReference(vkeyRef.txHash, vkeyRef.outputIndex),
  ]);

  // ── Slot window (network-specific Shelley slot config) ─────────────────────

  const eventStartSlot = posixMsToSlot(network, eventStart);
  const eventEndSlot   = posixMsToSlot(network, eventEnd);

  const currentSlot = await provider.fetchLatestBlock().then((b: any) => parseInt(b.slot));
  const txValidityEndSlot = Math.min(currentSlot + 1200, eventEndSlot);

  // ── Serialize large-BigInt data to CBOR before passing to MeshTxBuilder ────
  //
  // CardanoSDKSerializer (Scala.js) cannot handle JS BigInt > 2^53.
  // semaphoreRedeemer and updatedSemaphoreDatum both contain 256-bit values
  // (nullifierHash, signalHash, groupMerkleRoot) — pass them as pre-built CBOR hex.

  const semaphoreRedeemerCbor  = toCborHex(semaphoreRedeemer);
  const updatedSemaphoreDatumCbor = toCborHex(updatedSemaphoreDatum);
  const updatedUrnaDatumCbor   = toCborHex(updatedUrnaDatum);

  // ── Build transaction ──────────────────────────────────────────────────────

  // No evaluator — execution units are declared statically (see txInRedeemerValue calls below).
  // Using evaluator: provider causes Ogmios to run mid-build; if it fails, the extracted
  // TX hex has an incomplete fee/change output and gets rejected. Static units include
  // headroom (Semaphore ~266K/2.48B measured; declared 600K/5B. Voting ~381K/131M; declared 800K/300M).
  const txBuilder = new MeshTxBuilder({
    serializer: new CSLSerializer(),
    fetcher: provider,
    verbose: false,
  });

  let unsignedVoteTx: string;

  try {
    unsignedVoteTx = await txBuilder
      .setNetwork(network)
      .invalidBefore(eventStartSlot + 1)
      .invalidHereafter(txValidityEndSlot)

      .spendingPlutusScriptV3()
      .txIn(semaphoreUtxo.input.txHash, semaphoreUtxo.input.outputIndex, semaphoreUtxo.output.amount, semaphoreScriptAddress)
      .txInScript(semaphoreValidatorCbor)
      .txInInlineDatumPresent()
      .txInRedeemerValue(semaphoreRedeemerCbor, 'CBOR', { mem: 600000, steps: 5000000000 })

      .spendingPlutusScriptV3()
      .txIn(votingUtxo.input.txHash, votingUtxo.input.outputIndex, votingUtxo.output.amount, votingScriptAddress)
      .txInScript(votingValidatorCbor)
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr(1, []), 'JSON', { mem: 800000, steps: 300000000 })

      .readOnlyTxInReference(vkeyRef.txHash, vkeyRef.outputIndex)

      .txInCollateral(collateralUtxo.input.txHash, collateralUtxo.input.outputIndex, collateralUtxo.output.amount)

      .txOut(semaphoreScriptAddress, semaphoreUtxo.output.amount)
      .txOutInlineDatumValue(updatedSemaphoreDatumCbor, 'CBOR')

      .txOut(votingScriptAddress, votingUtxo.output.amount)
      .txOutInlineDatumValue(updatedUrnaDatumCbor, 'CBOR')

      .selectUtxosFrom(relayWalletUtxos)
      .changeAddress(relayWalletAddress)
      .requiredSignerHash(relayPaymentKeyHash)
      .complete();
  } catch (evalError: any) {
    // Ogmios evaluation may fail while still producing a valid TX hex in the error message.
    const match = evalError?.message?.match(/For txHex: ([0-9a-f]+)/);
    if (match) {
      unsignedVoteTx = match[1];
    } else {
      throw evalError;
    }
  }

  return unsignedVoteTx;
}
