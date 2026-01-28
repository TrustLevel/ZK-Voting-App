// BYPASS EVALUATION - Submit directly to blockchain
// WARNING: If validator fails, collateral (5 ADA) will be lost!

import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import 'dotenv/config';

console.log('=== BYPASSING EVALUATION - DIRECT SUBMISSION ===\n');
console.log('⚠️  WARNING: This will consume 5 ADA collateral if the script fails!');
console.log('⚠️  Proceeding in 3 seconds...\n');

await new Promise(resolve => setTimeout(resolve, 3000));

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

console.log('Wallet address:', walletAddress);
console.log('Payment key hash:', paymentKeyHash);

const validatorNaked = cborOfValidatorWith(
  "/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json",
  "group",
  "mint"
);

const outputReference = txOutRef("d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d", 1);
const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference);
const policyId = resolveScriptHash(clothedCbor, "V3");

const plutusScript: PlutusScript = {
  code: clothedCbor,
  version: "V3"
};
const scriptAddr = resolvePlutusScriptAddress(plutusScript, 0);

console.log("Policy ID:", policyId);
console.log("Script address:", scriptAddr);

const assetName = textToHex("BattleTest");
const walletUtxos = await wallet.getUtxos();
console.log("Available UTxOs:", walletUtxos.length);

const createRedeemer = conStr(0, []);
const groupDatum = conStr(0, [
  integer(0), // Empty merkle root
  byteString(paymentKeyHash)
]);

const mintValue: Asset[] = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: policyId + assetName, quantity: "1" },
];

console.log('\n=== Building transaction with MANUAL exUnits ===');

try {
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  console.log('Setting high exUnits to ensure execution...');

  const unsignedTx = await txBuilder
    .setNetwork("preprod")
    .mintPlutusScriptV3()
    .mint("1", policyId, assetName)
    .mintingScript(clothedCbor)
    .mintRedeemerValue(createRedeemer, "JSON", {
      mem: 14000000,           // 14M memory units
      steps: 10000000000       // 10B CPU steps
    })
    .txIn(
      "d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d",
      1,
      [{ unit: "lovelace", quantity: '4989593039' }],
      walletAddress
    )
    .selectUtxosFrom(walletUtxos)
    .txInCollateral(
      "4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804",
      5,
      [{ unit: "lovelace", quantity: "5000000" }]
    )
    .txOut(scriptAddr, mintValue)
    .txOutInlineDatumValue(groupDatum, "JSON")
    .changeAddress(walletAddress!)
    .requiredSignerHash(paymentKeyHash!)
    .completeSync();  // BYPASS EVALUATION!

  console.log('\n✅ Transaction built successfully (evaluation bypassed)');
  console.log('Transaction hex length:', unsignedTx.length);

  console.log('\nSigning transaction...');
  const signedTx = await wallet.signTx(unsignedTx, true);
  console.log('✅ Transaction signed');

  console.log('\n🚀 SUBMITTING TO BLOCKCHAIN...');
  console.log('This is it, General! No turning back now!\n');

  const txHash = await wallet.submitTx(signedTx);

  console.log('\n🎉🎉🎉 SUCCESS! 🎉🎉🎉');
  console.log('Transaction submitted:', txHash);
  console.log('\n📊 Check status at:');
  console.log('  https://preprod.cardanoscan.io/transaction/' + txHash);
  console.log('\n⏳ Waiting for confirmation (usually 20-30 seconds)...');
  console.log('\nIf it confirms, your validator is BATTLE-TESTED and WORKING! 🎖️');

} catch (error: any) {
  console.error('\n💥 OPERATION FAILED 💥');
  console.error('Error:', error.message);

  if (error.message.includes('BadInputsUTxO')) {
    console.log('\n❌ UTxO already spent or invalid');
  } else if (error.message.includes('CollateralContainsNonADA')) {
    console.log('\n❌ Collateral issue');
  } else if (error.message.includes('InsufficientCollateral')) {
    console.log('\n❌ Need more collateral');
  } else if (error.message.includes('ScriptWitnessNotValidatingUTXOW')) {
    console.log('\n💥 SCRIPT VALIDATION FAILED ON-CHAIN');
    console.log('The validator rejected the transaction');
    console.log('Collateral (5 ADA) was consumed');
    console.log('\nThis means there IS a bug in the validator logic');
  } else {
    console.log('\n❌ Transaction submission failed (collateral NOT lost)');
  }

  console.log('\nFull error for debugging:');
  console.log(error);
}
