/**
 * Vote Helper Functions — Browser-adapted ZK + TX logic for the voter flow.
 *
 * Adapts:
 *   - src/zk/src/signal.ts  → encodeVoteSignal
 *   - src/zk/src/proof.ts   → generateVoteProof
 *   - src/tx/src/vote.ts    → buildVoteTransaction
 *
 * Key differences from the Node.js originals:
 *   - @meshsdk/core-csl loaded via dynamic import (WASM, browser only)
 *   - snarkjs loaded via dynamic import
 *   - WASM + ZKEY fetched by URL from /public/zk/
 *   - No fs/path — no Node.js APIs
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
import { VALIDATORS } from './validators';
import { createOutputReference, findCollateralUtxo } from './blockchain-helpers';

// ── Constants ─────────────────────────────────────────────────────────────────

const BLS12_381_R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;

export const VKEY_REF_TX_HASH = "3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083";
export const VKEY_REF_OUTPUT_INDEX = 0;

// ── WASM lazy-load cache ───────────────────────────────────────────────────────

let cslModuleCache: any = null;

async function getCsl() {
  if (cslModuleCache) return cslModuleCache;
  cslModuleCache = await import('@meshsdk/core-csl');
  return cslModuleCache;
}

let applyParamsToScriptCache: any = null;

async function getApplyParamsToScript() {
  if (applyParamsToScriptCache) return applyParamsToScriptCache;
  const module = await getCsl();
  if (!module.applyParamsToScript) {
    throw new Error('@meshsdk/core-csl loaded but applyParamsToScript is undefined');
  }
  applyParamsToScriptCache = module.applyParamsToScript;
  return applyParamsToScriptCache;
}

/**
 * Serializes a MeshSDK data object ({int}, {bytes}, {list}, {alternative/fields})
 * to CBOR hex using CSL primitives directly.
 *
 * The 'JSON' format path (JSONbig.stringify → csl.from_json) loses precision for
 * integers > 2^53 because the browser WASM CSL JSON parser converts large unquoted
 * numbers to float64 internally. This function bypasses that path entirely by using
 * csl.PlutusData.new_integer(csl.BigInt.from_str(exactString)) for all integers.
 */
async function toCborHex(data: any): Promise<string> {
  const { csl } = await getCsl();

  function convert(d: any): any {
    if (d === null || d === undefined) {
      throw new Error('toCborHex: null/undefined datum field');
    }
    // {int: number | bigint}
    if (typeof d === 'object' && 'int' in d) {
      const v = d.int;
      const s = typeof v === 'bigint' ? v.toString() : String(v);
      return csl.PlutusData.new_integer(csl.BigInt.from_str(s));
    }
    // {bytes: hexString}
    if (typeof d === 'object' && 'bytes' in d) {
      return csl.PlutusData.new_bytes(Buffer.from(d.bytes, 'hex'));
    }
    // {list: [...]}
    if (typeof d === 'object' && 'list' in d) {
      const pl = csl.PlutusList.new();
      for (const item of d.list) pl.add(convert(item));
      return csl.PlutusData.new_list(pl);
    }
    // {alternative: n, fields: [...]} or {constructor: n, fields: [...]}  (conStr)
    if (typeof d === 'object' && ('alternative' in d || 'constructor' in d)) {
      const alt = d.alternative ?? d.constructor;
      const pl = csl.PlutusList.new();
      for (const field of d.fields) pl.add(convert(field));
      return csl.PlutusData.new_constr_plutus_data(
        csl.ConstrPlutusData.new(csl.BigNum.from_str(String(alt)), pl)
      );
    }
    throw new Error(`toCborHex: unknown datum shape: ${JSON.stringify(d)}`);
  }

  return convert(data).to_hex();
}

export async function applyOrefParamToScript(
  validatorCbor: string,
  oref: ReturnType<typeof createOutputReference>,
): Promise<string> {
  const applyParamsToScript = await getApplyParamsToScript();
  return applyParamsToScript(validatorCbor, [oref], 'JSON');
}

// ── G1 / G2 point compression (ported from src/zk/src/conversion.ts) ─────────
//
// Uses ffjavascript (bundled inside snarkjs) via dynamic import.
// bigint-buffer provides the big-endian Buffer serialisation.

type G1Point = [string, string, string];
type G2Point = [[string, string], [string, string], [string, string]];

async function compressedG1(point: G1Point): Promise<string> {
  const bb = await import('bigint-buffer');
  // @ts-ignore — ffjavascript has no types
  const ff = await import('ffjavascript');
  const curve = await ff.getCurveFromName('bls12381');

  const result: Buffer = bb.toBufferBE(BigInt(point[0]), 48);
  const COMPRESSED = 0b10000000;
  const INFINITY = 0b01000000;
  const YBIT = 0b00100000;

  result[0] = result[0] | COMPRESSED;

  if (BigInt(point[2]) !== 1n) {
    result[0] = result[0] | INFINITY;
  } else {
    const F = curve.G1.F;
    const x = F.fromObject(BigInt(point[0]));
    const x3b = F.add(F.mul(F.square(x), x), curve.G1.b);
    const y1 = F.toObject(F.sqrt(x3b));
    const y2 = F.toObject(F.neg(F.sqrt(x3b)));
    const y = BigInt(point[1]);
    if ((y1 > y2 && y > y2) || (y1 < y2 && y > y1)) {
      result[0] = result[0] | YBIT;
    }
  }

  return result.toString('hex');
}

async function compressedG2(point: G2Point): Promise<string> {
  const bb = await import('bigint-buffer');
  // @ts-ignore
  const ff = await import('ffjavascript');
  const curve = await ff.getCurveFromName('bls12381');

  const result = Buffer.concat([
    bb.toBufferBE(BigInt(point[0][1]), 48),
    bb.toBufferBE(BigInt(point[0][0]), 48),
  ]);
  const COMPRESSED = 0b10000000;
  const INFINITY = 0b01000000;
  const YBIT = 0b00100000;

  result[0] = result[0] | COMPRESSED;

  if (BigInt(point[2][0]) !== 1n) {
    result[0] = result[0] | INFINITY;
  } else {
    const F = curve.G2.F;
    const x = F.fromObject(point[0].map((item: string) => BigInt(item)));
    const x3b = F.add(F.mul(F.square(x), x), curve.G2.b);
    const y1 = F.toObject(F.sqrt(x3b));
    const y2 = F.toObject(F.neg(F.sqrt(x3b)));

    function greaterThan(a: [bigint, bigint], b: [bigint, bigint]): boolean {
      if (a[1] > b[1]) return true;
      if (a[1] === b[1] && a[0] > b[0]) return true;
      return false;
    }

    const y = point[1].map((item: string) => BigInt(item)) as [bigint, bigint];
    if ((greaterThan(y1, y2) && greaterThan(y, y2)) || (greaterThan(y2, y1) && greaterThan(y, y1))) {
      result[0] = result[0] | YBIT;
    }
  }

  return result.toString('hex');
}

// ── MPF proof steps → Plutus data (ported from src/tx/src/vote.ts) ────────────

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

// ── createUrnaDatum (local copy, avoids import from blockchain-helpers) ────────

function createUpdatedUrnaDatum(params: {
  weight: number;
  options: ReturnType<typeof list>[];
  eventStart: number;
  eventEnd: number;
  semaphoreNftPolicyId: string;
}) {
  const { weight, options, eventStart, eventEnd, semaphoreNftPolicyId } = params;
  return conStr(0, [
    integer(weight),
    list(options),
    list([integer(eventStart), integer(eventEnd)]),
    byteString(semaphoreNftPolicyId),
  ]);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * 1.1 Encodes vote options into CBOR signal_message.
 * Matches Aiken's deserialise_signal format.
 * Input: [[optionIndex, voteCount], ...]
 * Output: CBOR hex string
 */
export async function encodeVoteSignal(options: Array<[number, number]>): Promise<string> {
  const { csl } = await import('@meshsdk/core-csl');

  const outer = csl.PlutusList.new();
  for (const [index, count] of options) {
    const inner = csl.PlutusList.new();
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(index))));
    inner.add(csl.PlutusData.new_integer(csl.BigInt.from_str(String(count))));
    outer.add(csl.PlutusData.new_list(inner));
  }
  const data = csl.PlutusData.new_list(outer);
  return Buffer.from(data.to_bytes()).toString('hex');
}

/**
 * 1.2 Generates the Groth16 ZK vote proof in the browser.
 * Loads WASM and ZKEY from /public/zk/ (fetched via URL).
 * Returns compressed BLS12-381 proof points and the nullifier hash.
 */
export async function generateVoteProof(params: {
  identityNullifier: bigint;
  identityTrapdoor: bigint;
  merkleProof: { root: bigint; siblings: bigint[]; pathIndices: number[] };
  externalNullifier: bigint;
  signal: string; // hex string from encodeVoteSignal
}): Promise<{
  zkProof: { pi_a: string; pi_b: string; pi_c: string };
  nullifierHash: bigint;
  publicSignals: string[];
}> {
  const { identityNullifier, identityTrapdoor, merkleProof, externalNullifier, signal } = params;

  // signal_hash = blake2b_256(signal_message) mod BLS12_381_R
  const { blake2b } = await import('@noble/hashes/blake2b');
  const signalBytes = new Uint8Array(Buffer.from(signal, 'hex'));
  const digestBytes = blake2b(signalBytes, { dkLen: 32 });
  const digestHex = Buffer.from(digestBytes).toString('hex');
  const signalHash = BigInt('0x' + digestHex) % BLS12_381_R;

  const circuitInputs = {
    identityNullifier,
    identityTrapdoor,
    treePathIndices: merkleProof.pathIndices,
    treeSiblings: merkleProof.siblings,
    externalNullifier,
    signalHash,
  };

  // @ts-ignore — snarkjs has no type declarations
  const snarkjs = await import('snarkjs');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    '/zk/semaphore.wasm',
    '/zk/semaphore_final.zkey',
  );

  const zkProof = {
    pi_a: await compressedG1(proof.pi_a),
    pi_b: await compressedG2(proof.pi_b),
    pi_c: await compressedG1(proof.pi_c),
  };

  const nullifierHash = BigInt(publicSignals[1]);

  return { zkProof, nullifierHash, publicSignals };
}

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
  currentOptions: Array<[number, number]>;
  weight: number;
  eventStart: number; // POSIX ms
  eventEnd: number;   // POSIX ms
}

/**
 * 1.3 Builds an unsigned vote transaction (CBOR hex).
 * Fetches Semaphore and Voting UTxOs internally via provider.
 * Caller signs via CIP-30 and submits via POST /voting-event/:id/vote.
 */
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
    voteSignal, currentOptions, weight, eventStart, eventEnd,
  } = params;

  // Fetch Semaphore UTxO
  const semaphoreUtxos: UTxO[] = await provider.fetchAddressUTxOs(semaphoreScriptAddress);
  const semaphoreUtxo = semaphoreUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(semaphoreNftPolicyId))
  );
  if (!semaphoreUtxo) throw new Error('Semaphore UTxO not found at ' + semaphoreScriptAddress);

  // Fetch Voting UTxO
  const votingUtxos: UTxO[] = await provider.fetchAddressUTxOs(votingScriptAddress);
  const votingUtxo = votingUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(votingNftPolicyId))
  );
  if (!votingUtxo) throw new Error('Voting UTxO not found at ' + votingScriptAddress);

  const collateralUtxo = findCollateralUtxo(walletUtxos, 5000000);
  if (!collateralUtxo) throw new Error('No suitable collateral UTxO found. Please ensure you have a UTxO with at least 5 ADA containing only ADA (no other tokens).');

  // Updated UrnaDatum: apply voteSignal to current tallies
  const updatedOptions = currentOptions.map(([idx, count]) => {
    const voted = voteSignal.find(([vi]) => vi === idx);
    return list([integer(idx), integer(count + (voted ? voted[1] : 0))]);
  });

  const updatedUrnaDatum = createUpdatedUrnaDatum({
    weight,
    options: updatedOptions,
    eventStart,
    eventEnd,
    semaphoreNftPolicyId,
  });

  // SemaphoreRedeemer.Signal: Constr 1 [zk_proof, mpf_proof, nullifier, signal_hash, signal_message]
  const semaphoreRedeemer = conStr(1, [
    conStr(0, [byteString(zkProof.pi_a), byteString(zkProof.pi_b), byteString(zkProof.pi_c)]),
    mpfStepsToPlutusData(mpfProofSteps),
    integer(nullifierHash),
    integer(signalHash),
    byteString(signalMessage),
  ]);

  // Updated SemaphoreDatum (only nullifier_mpf_root changes)
  const updatedSemaphoreDatum = conStr(0, [
    byteString(groupNftPolicyId),
    integer(groupMerkleRoot),
    byteString(mpfNewRoot),
    createOutputReference(VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX),
  ]);

  // Pre-convert datums/redeemers to CBOR hex using CSL directly.
  // 'JSON' format (JSONbig.stringify → csl.from_json) loses precision for integers > 2^53:
  // the browser WASM CSL JSON parser converts large unquoted numbers to float64 internally.
  // 'CBOR' format (csl.PlutusData.from_hex) bypasses this entirely.
  const [semaphoreRedeemerCbor, updatedSemaphoreDatumCbor, updatedUrnaDatumCbor] = await Promise.all([
    toCborHex(semaphoreRedeemer),
    toCborHex(updatedSemaphoreDatum),
    toCborHex(updatedUrnaDatum),
  ]);

  // Preprod slot calculation
  const SHELLEY_UNIX_TIME = 1655769600;
  const SHELLEY_SLOT = 86400;
  const eventStartSlot = Math.floor(eventStart / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;
  // eventEndSlot = the slot corresponding to eventEnd POSIX ms.
  // The on-chain check (voting.ak) requires the TX validity range to be entirely
  // within the event window: is_entirely_before(validity_range, event_end_ms).
  // With an exclusive invalidHereafter bound, this passes when txValidityEndSlot <= eventEndSlot.
  // So we cap the TX validity end at eventEndSlot to avoid exceeding the event window.
  const eventEndSlot = Math.floor(eventEnd / 1000) - SHELLEY_UNIX_TIME + SHELLEY_SLOT;
  const currentSlot = await provider.fetchLatestBlock().then((b: any) => parseInt(b.slot));
  const txValidityEndSlot = Math.min(currentSlot + 1200, eventEndSlot);

  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    // IMPORTANT — evaluator intentionally omitted (previously: evaluator: provider).
    // Reason: The vote TX spends the Semaphore and Voting UTxOs which were just minted.
    // Blockfrost's Ogmios proxy evaluates scripts at build-time and requires all spent/reference
    // inputs to be in the node's ledger state. Even after Blockfrost confirms the mint TX,
    // Ogmios can lag behind and return EvaluationFailure { ScriptFailures: {} }.
    // Without the evaluator, MeshSDK uses the hardcoded execution units below — which are
    // sized to be (a) sufficient for real ZK proof execution and (b) within the preprod
    // protocol limit of 14M memory / 10B steps per TX.
    verbose: false,
  });

  let unsignedVoteTx: string;

  try {
    unsignedVoteTx = await txBuilder
      .setNetwork('preprod')
      .invalidBefore(eventStartSlot + 1)
      .invalidHereafter(txValidityEndSlot)

      // Spend Semaphore UTxO
      .spendingPlutusScriptV3()
      .txIn(
        semaphoreUtxo.input.txHash,
        semaphoreUtxo.input.outputIndex,
        semaphoreUtxo.output.amount,
        semaphoreScriptAddress,
      )
      .txInScript(semaphoreValidatorCbor)
      .txInInlineDatumPresent()
      // Semaphore: generous units for ZK proof verification (BLS12-381 Groth16 is expensive).
      .txInRedeemerValue(semaphoreRedeemerCbor, 'CBOR', { mem: 12000000, steps: 7000000000 })

      // Spend Voting UTxO
      .spendingPlutusScriptV3()
      .txIn(
        votingUtxo.input.txHash,
        votingUtxo.input.outputIndex,
        votingUtxo.output.amount,
        votingScriptAddress,
      )
      .txInScript(votingValidatorCbor)
      .txInInlineDatumPresent()
      // Voting: cheap datum-validation script. 1.5M mem keeps total (12M+1.5M=13.5M) < 14M limit.
      .txInRedeemerValue(conStr(1, []), 'JSON', { mem: 1500000, steps: 1000000000 })

      // VKey UTxO as read-only reference input
      .readOnlyTxInReference(VKEY_REF_TX_HASH, VKEY_REF_OUTPUT_INDEX)

      // Collateral
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
      )

      // Output: Semaphore back with updated nullifier_mpf_root
      .txOut(semaphoreScriptAddress, semaphoreUtxo.output.amount)
      .txOutInlineDatumValue(updatedSemaphoreDatumCbor, 'CBOR')

      // Output: Voting back with updated tally
      .txOut(votingScriptAddress, votingUtxo.output.amount)
      .txOutInlineDatumValue(updatedUrnaDatumCbor, 'CBOR')

      .selectUtxosFrom(walletUtxos)
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();
  } catch (evalError: any) {
    // Log full error so we can see what Blockfrost/Ogmios says about the TX evaluation
    console.error('🔴 TX evaluation error:', evalError);
    console.error('🔴 evalError.message:', evalError?.message);
    const match = evalError?.message?.match(/For txHex: ([0-9a-f]+)/);
    if (match) {
      console.warn('⚠️ Using Ogmios bypass — evaluation failed, using hardcoded execution units.');
      unsignedVoteTx = match[1];
    } else {
      throw evalError;
    }
  }

  return unsignedVoteTx;
}
