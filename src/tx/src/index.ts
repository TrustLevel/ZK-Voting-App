// Main exports for @src/tx package
export * from './builders.js';
export * from './utils.js';
export * from './types.js';

// Note: Environment variables loaded from .env file
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import { toPlutusData, toAddress } from '@meshsdk/core-csl';
import 'dotenv/config';

// Get mnemonic from environment
const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
console.log('Loaded mnemonic:', mnemonic.length, 'words');

// Set Provider
const apiKey: string = process.env.API_KEY || "";
export const provider = new BlockfrostProvider(apiKey);

// Generate wallet
const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
console.log(walletAddress);
// Extract payment key hash from wallet address
const addressInfo = deserializeAddress(walletAddress!);
console.log(addressInfo);
const paymentKeyHash = addressInfo.pubKeyHash; // Correct property name
console.log('Payment Key Hash:', paymentKeyHash);


// Import and apply Oref to validator
const validatorNaked = cborOfValidatorWith("/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json", "group", "mint")
// Fresh UTxO with 2492272124 lovelace
// FIXED: Create OutputReference manually - txOutRef has extra wrapper bug
const outputReference = {
  constructor: 0,
  fields: [
    {
      bytes: "8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c"
    },
    {
      int: 1
    }
  ]
};
console.log('Output Reference:', outputReference);
const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference)

// Script Address
const plutusScript: PlutusScript = {
    code: clothedCbor,
    version: "V3"
};
const scriptAddr = resolvePlutusScriptAddress(plutusScript, 0); // 0 for testnet
console.log(scriptAddr);
const deserializedScriptAddress = deserializeAddress(scriptAddr);
console.log(deserializedScriptAddress);


// Get policyID
const policyId = resolveScriptHash(clothedCbor, "V3");
console.log("Script policyId: " + policyId);
console.log(policyId == deserializedScriptAddress.scriptHash)


// Generate redeemer - Create variant (alternative 0, no fields)
const createRedeemer = conStr(0, [])

// Generate Datum - GroupDatum with empty merkle root and admin_pkh
const groupDatum = conStr(0,[
    integer(0),  // Empty merkle root for new group
    byteString(paymentKeyHash)
])

const walletUtxos = await wallet.getUtxos()
//console.log(walletUtxos)

const assetName = textToHex("SecondGroup")
const mintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: policyId + assetName, quantity: "1" },
  ];

// Collateral
// 4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804#0
const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: true,
})

const unsignedMintTx = await txBuilder
          .setNetwork("preprod")
          .mintPlutusScriptV3()
          .mint("1", policyId, assetName)
          .mintingScript(clothedCbor)
          .mintRedeemerValue(createRedeemer, "JSON")
          .txIn("8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c", 1, [{ unit: "lovelace", quantity: '2492272124' }], walletAddress)
          .selectUtxosFrom(walletUtxos)
          .txInCollateral("4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804", 5, [{ unit: "lovelace", quantity: "5000000" }])
          .txOut(scriptAddr, mintValue)
          .txOutInlineDatumValue(groupDatum, "JSON")
          .changeAddress(walletAddress!)
          .requiredSignerHash(paymentKeyHash!)
          .complete()
          
const signedTx =  await wallet.signTx(unsignedMintTx, true);
const txHash = await wallet.submitTx(signedTx);
console.log("Copy and paste this value at the field 'oracle_tx_id' in the cli_input.json file:")
console.log(txHash);




