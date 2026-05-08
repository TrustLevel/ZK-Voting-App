/**
 * Browser-safe Group NFT mint transaction builder.
 *
 * Mirrors ../node/mint-group.ts buildGroupMintTransaction — same parameter
 * interface, same return type (unsigned TX hex). Browser adaptations:
 *   - Datums and redeemers serialized via toCborHex to avoid JSON float64
 *     truncation in browser WASM CSL for integers > 2^53.
 *   - No MeshWallet, no fs, no __main__ block.
 */

import {
  BlockfrostProvider,
  UTxO,
  Asset,
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

export async function buildGroupMintTransaction(params: {
  provider: BlockfrostProvider;
  policyId: string;
  assetName: string;
  clothedCbor: string;
  createRedeemer: any;
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
  walletAddress: string;
  scriptAddr: string;
  mintValue: Asset[];
  groupDatum: any;
  paymentKeyHash: string;
  collateralUtxo: UTxO;
}): Promise<string> {
  const {
    provider,
    policyId,
    assetName,
    clothedCbor,
    createRedeemer,
    selectedUtxo,
    walletUtxos,
    walletAddress,
    scriptAddr,
    mintValue,
    groupDatum,
    paymentKeyHash,
    collateralUtxo,
  } = params;

  const [createRedeemerCbor, groupDatumCbor] = await Promise.all([
    toCborHex(createRedeemer),
    toCborHex(groupDatum),
  ]);

  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  try {
    const unsignedTx = await txBuilder
      .setNetwork('preprod')
      .mintPlutusScriptV3()
      .mint('1', policyId, assetName)
      .mintingScript(clothedCbor)
      .mintRedeemerValue(createRedeemerCbor, 'CBOR', { mem: 14000000, steps: 10000000000 })
      .txIn(
        selectedUtxo.input.txHash,
        selectedUtxo.input.outputIndex,
        selectedUtxo.output.amount,
        walletAddress,
      )
      .selectUtxosFrom(walletUtxos)
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
        collateralUtxo.output.address,
      )
      .txOut(scriptAddr, mintValue)
      .txOutInlineDatumValue(groupDatumCbor, 'CBOR')
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
