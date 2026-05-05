/**
 * Browser-safe vote transaction builder.
 *
 * Differences from ../vote.ts (Node.js version):
 *   - Imports createOutputReference / createUrnaDatum from ./utils.ts (no fs)
 *   - All datums and redeemers serialized via CBOR using CSL loaded with dynamic import,
 *     bypassing the JSON path that truncates large integers to float64 in browser WASM CSL.
 *   - No evaluator — execution units are declared statically (Ogmios timing issues on frontend).
 *   - currentOptions is NOT a parameter: the actual vote tallies are parsed directly from
 *     the on-chain Voting UTxO inline datum, so vote 2+ produces the correct output datum.
 */

import {
  BlockfrostProvider,
  UTxO,
  integer,
  list,
  conStr,
  byteString,
  MeshTxBuilder,
} from '@meshsdk/core';
import { createOutputReference, createUrnaDatum } from './utils-browser.js';

export const VKEY_REF_TX_HASH = "3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083";
export const VKEY_REF_OUTPUT_INDEX = 0;

// ── CSL lazy-load (async dynamic import works in both Node.js and browser) ────

let _csl: any = null;
async function getCsl() {
  if (_csl) return _csl;
  _csl = await import('@meshsdk/core-csl');
  return _csl;
}

// ── CBOR serialization ────────────────────────────────────────────────────────
//
// Converts a MeshSDK data object to CBOR hex via CSL primitives.
// Using 'JSON' format loses precision for integers > 2^53 in browser WASM CSL
// because the CSL JSON parser converts large unquoted numbers to float64.

async function toCborHex(data: any): Promise<string> {
  const { csl } = await getCsl();

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

// ── Parse current vote tallies from the on-chain UrnaDatum ───────────────────
//
// UrnaDatum = Constr(0, [weight, options, event_dates, semaphore_nft_policy_id])
// options   = List<List<Int>>  — each inner list is [optionIndex, voteCount]
//
// Reading currentOptions from the backend (event.options) always gives votes=0
// because the backend does not update tallies after minting. We must read the
// actual accumulated tallies from the UTxO inline datum instead.

async function parseCurrentOptionsFromDatum(plutusDataHex: string): Promise<Array<[number, number]>> {
  const { csl } = await getCsl();
  const datum = csl.PlutusData.from_hex(plutusDataHex);
  const constrData = datum.as_constr_plutus_data();
  if (!constrData) throw new Error('Voting UTxO datum is not a constructor');
  const fields = constrData.data();
  const optionsList = fields.get(1).as_list();
  if (!optionsList) throw new Error('Options field in UrnaDatum is not a list');
  const result: Array<[number, number]> = [];
  for (let i = 0; i < optionsList.len(); i++) {
    const pair = optionsList.get(i).as_list();
    if (!pair) throw new Error(`Option entry ${i} is not a list`);
    const idx = Number(pair.get(0).as_integer()?.to_str() ?? '0');
    const count = Number(pair.get(1).as_integer()?.to_str() ?? '0');
    result.push([idx, count]);
  }
  return result;
}

// ── MPF proof steps → Plutus data ────────────────────────────────────────────

function mpfStepsToPlutusData(steps: Array<any>) {
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

// ── Public interface ──────────────────────────────────────────────────────────

export interface BuildVoteTransactionParams {
  provider: BlockfrostProvider;
  semaphoreScriptAddress: string;
  votingScriptAddress: string;
  semaphoreNftPolicyId: string;
  votingNftPolicyId: string;
  groupNftPolicyId: string;
  groupMerkleRoot: bigint;
  semaphoreValidatorCbor: string;
  votingValidatorCbor: string;
  walletUtxos: UTxO[];
  walletAddress: string;
  paymentKeyHash: string;
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
  collateralUtxo: UTxO; // caller selects a pure-ADA UTxO ≥ 5 ADA
}

export async function buildVoteTransaction(params: BuildVoteTransactionParams): Promise<string> {
  const {
    provider,
    semaphoreScriptAddress, votingScriptAddress,
    semaphoreNftPolicyId, votingNftPolicyId,
    semaphoreValidatorCbor, votingValidatorCbor,
    groupNftPolicyId, groupMerkleRoot,
    walletUtxos, walletAddress, paymentKeyHash,
    zkProof, nullifierHash, signalHash, signalMessage,
    mpfProofSteps, mpfNewRoot,
    voteSignal, weight, eventStart, eventEnd,
    collateralUtxo,
  } = params;

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

  // Read actual vote tallies from the on-chain UTxO datum (not from the backend).
  // The backend always stores votes=0; only the chain has the accumulated tallies.
  const currentOptions = votingUtxo.output.plutusData
    ? await parseCurrentOptionsFromDatum(votingUtxo.output.plutusData)
    : voteSignal.map(([idx]) => [idx, 0] as [number, number]);

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
    createOutputReference(VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX),
  ]);

  // Serialize via CBOR — avoids JSON path that truncates large integers to float64 in browser WASM CSL.
  const [semaphoreRedeemerCbor, updatedSemaphoreDatumCbor, updatedUrnaDatumCbor] = await Promise.all([
    toCborHex(semaphoreRedeemer),
    toCborHex(updatedSemaphoreDatum),
    toCborHex(updatedUrnaDatum),
  ]);

  // Preprod slot calculation: slot = unix_seconds - 1655769600 + 86400
  const SHELLEY_UNIX = 1655769600;
  const SHELLEY_SLOT = 86400;
  const eventStartSlot = Math.floor(eventStart / 1000) - SHELLEY_UNIX + SHELLEY_SLOT;
  const eventEndSlot   = Math.floor(eventEnd   / 1000) - SHELLEY_UNIX + SHELLEY_SLOT;
  const currentSlot    = await provider.fetchLatestBlock().then((b: any) => parseInt(b.slot));
  const txValidityEndSlot = Math.min(currentSlot + 1200, eventEndSlot);

  // No evaluator: execution units are declared statically.
  // Semaphore 11M + Voting 3M = 14M = protocol memory limit on Preprod.
  // Steps: 7B + 2.5B = 9.5B < 10B limit.
  const txBuilder = new MeshTxBuilder({ fetcher: provider, verbose: false });

  let unsignedTx: string;
  try {
    unsignedTx = await txBuilder
      .setNetwork('preprod')
      .invalidBefore(eventStartSlot + 1)
      .invalidHereafter(txValidityEndSlot)

      .spendingPlutusScriptV3()
      .txIn(semaphoreUtxo.input.txHash, semaphoreUtxo.input.outputIndex, semaphoreUtxo.output.amount, semaphoreScriptAddress)
      .txInScript(semaphoreValidatorCbor)
      .txInInlineDatumPresent()
      .txInRedeemerValue(semaphoreRedeemerCbor, 'CBOR', { mem: 11000000, steps: 7000000000 })

      .spendingPlutusScriptV3()
      .txIn(votingUtxo.input.txHash, votingUtxo.input.outputIndex, votingUtxo.output.amount, votingScriptAddress)
      .txInScript(votingValidatorCbor)
      .txInInlineDatumPresent()
      .txInRedeemerValue(conStr(1, []), 'JSON', { mem: 3000000, steps: 2500000000 })

      .readOnlyTxInReference(VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX)

      .txInCollateral(collateralUtxo.input.txHash, collateralUtxo.input.outputIndex, collateralUtxo.output.amount)

      .txOut(semaphoreScriptAddress, semaphoreUtxo.output.amount)
      .txOutInlineDatumValue(updatedSemaphoreDatumCbor, 'CBOR')

      .txOut(votingScriptAddress, votingUtxo.output.amount)
      .txOutInlineDatumValue(updatedUrnaDatumCbor, 'CBOR')

      .selectUtxosFrom(walletUtxos)
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();
  } catch (evalError: any) {
    console.error('TX build error:', evalError);
    const match = evalError?.message?.match(/For txHex: ([0-9a-f]+)/);
    if (match) {
      unsignedTx = match[1];
    } else {
      throw evalError;
    }
  }

  return unsignedTx;
}
