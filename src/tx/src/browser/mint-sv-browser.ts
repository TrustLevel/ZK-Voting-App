/**
 * Browser-safe Semaphore + Voting NFT mint transaction builder.
 *
 * Mirrors ../node/mint-sv.ts buildSemaphoreVotingMintTransaction — same parameter
 * interface, same return type (unsigned TX hex). Browser adaptations:
 *   - Datums and redeemers serialized via toCborHex to avoid JSON float64
 *     truncation in browser WASM CSL for integers > 2^53.
 *   - No evaluator: this TX references the Group NFT UTxO as a read-only input.
 *     Ogmios evaluates at build-time and requires all reference inputs already in
 *     ledger state, but Ogmios can lag behind Blockfrost confirmation of the Group
 *     NFT TX. Static execution units eliminate the race condition entirely.
 *   - No MeshWallet, no fs, no __main__ block.
 */

import {
  BlockfrostProvider,
  UTxO,
  Asset,
  conStr,
  MeshTxBuilder,
} from '@meshsdk/core';

// ── CSL lazy-load ─────────────────────────────────────────────────────────────

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

// ── Public interface ──────────────────────────────────────────────────────────

export async function buildSemaphoreVotingMintTransaction(params: {
  provider: BlockfrostProvider;
  txValidityEndSlot: number;
  groupNftTxHash: string;
  groupNftOutputIndex: number;
  semaphorePolicyId: string;
  semaphoreAssetName: string;
  semaphoreValidatorCbor: string;
  votingPolicyId: string;
  votingAssetName: string;
  votingValidatorCbor: string;
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
  walletAddress: string;
  semaphoreScriptAddr: string;
  semaphoreMintValue: Asset[];
  semaphoreDatum: any;
  votingScriptAddr: string;
  votingMintValue: Asset[];
  urnaDatum: any;
  paymentKeyHash: string;
  collateralUtxo: UTxO;
}): Promise<string> {
  const {
    provider,
    txValidityEndSlot,
    groupNftTxHash,
    groupNftOutputIndex,
    semaphorePolicyId,
    semaphoreAssetName,
    semaphoreValidatorCbor,
    votingPolicyId,
    votingAssetName,
    votingValidatorCbor,
    selectedUtxo,
    walletUtxos,
    walletAddress,
    semaphoreScriptAddr,
    semaphoreMintValue,
    semaphoreDatum,
    votingScriptAddr,
    votingMintValue,
    urnaDatum,
    paymentKeyHash,
    collateralUtxo,
  } = params;

  const [semaphoreRedeemerCbor, votingRedeemerCbor, semaphoreDatumCbor, urnaDatumCbor] =
    await Promise.all([
      toCborHex(conStr(0, [])),
      toCborHex(conStr(0, [])),
      toCborHex(semaphoreDatum),
      toCborHex(urnaDatum),
    ]);

  // No evaluator: static execution units avoid the Ogmios lag on the Group NFT reference input.
  const txBuilder = new MeshTxBuilder({ fetcher: provider, verbose: false });

  try {
    const unsignedTx = await txBuilder
      .setNetwork('preprod')
      .invalidHereafter(txValidityEndSlot)

      .readOnlyTxInReference(groupNftTxHash, groupNftOutputIndex)

      .mintPlutusScriptV3()
      .mint('1', semaphorePolicyId, semaphoreAssetName)
      .mintingScript(semaphoreValidatorCbor)
      .mintRedeemerValue(semaphoreRedeemerCbor, 'CBOR', { mem: 5500000, steps: 3400000000 })

      .mintPlutusScriptV3()
      .mint('1', votingPolicyId, votingAssetName)
      .mintingScript(votingValidatorCbor)
      .mintRedeemerValue(votingRedeemerCbor, 'CBOR', { mem: 5500000, steps: 3300000000 })

      .txIn(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex, selectedUtxo.output.amount, walletAddress)
      .selectUtxosFrom(walletUtxos)
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
        collateralUtxo.output.address,
      )

      .txOut(semaphoreScriptAddr, semaphoreMintValue)
      .txOutInlineDatumValue(semaphoreDatumCbor, 'CBOR')

      .txOut(votingScriptAddr, votingMintValue)
      .txOutInlineDatumValue(urnaDatumCbor, 'CBOR')

      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();

    return unsignedTx;
  } catch (evalError: any) {
    const match = evalError?.message?.match(/For txHex: ([0-9a-f]+)/);
    if (match) return match[1];
    throw evalError;
  }
}
