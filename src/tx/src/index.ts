// Main exports for @src/tx package
export * from './builders.js';
export * from './utils.js';
export * from './types.js';

// Note: Environment variables loaded from .env file
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, TxOutRef, MeshWallet, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, stringToHex, resolvePlutusScriptAddress, PlutusScript, scriptAddress, integer, byteString, mTxOutRef} from '@meshsdk/core';
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
// const outputReference = txOutRef('4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804', 3); // Dummy TxOutRef with 64-char hex hash and output index 0
const outputReference = txOutRef("d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d", 1)
console.log(outputReference);
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

// Generate Datum - GroupDatum with group_merkle_root and admin_pkh
const groupDatum = conStr(0,[
    integer(123456789),
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
          .txIn("d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d", 1, [{ unit: "lovelace", quantity: '4989593039' }], walletAddress)
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




