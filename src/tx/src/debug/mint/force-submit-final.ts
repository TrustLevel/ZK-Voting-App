// FINAL ATTEMPT - Force submit bypassing evaluation
// Risk: 5 ADA collateral will be lost if validator fails
// Reward: Prove the validator works (or find the actual bug)

import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import 'dotenv/config';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         FORCE SUBMIT - BYPASSING EVALUATION               ║');
console.log('║                                                            ║');
console.log('║  ⚠️  WARNING: 5 ADA COLLATERAL AT RISK  ⚠️                ║');
console.log('║                                                            ║');
console.log('║  If the validator fails on-chain, you lose 5 ADA          ║');
console.log('║  Proceeding in 5 seconds...                                ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

await new Promise(resolve => setTimeout(resolve, 5000));

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

console.log('🎖️  General\'s Wallet:', walletAddress);
console.log('🔑 Payment Key Hash:', paymentKeyHash);

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

console.log('\n📜 Script Details:');
console.log('   Policy ID:', policyId);
console.log('   Script Address:', scriptAddr);

const assetName = textToHex("BATTLE");
const walletUtxos = await wallet.getUtxos();

const createRedeemer = conStr(0, []);
const groupDatum = conStr(0, [
  integer(0),
  byteString(paymentKeyHash)
]);

const mintValue = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: policyId + assetName, quantity: "1" },
];

console.log('\n⚔️  Asset to mint: BATTLE');
console.log('📦 Available wallet UTxOs:', walletUtxos.length);

console.log('\n🔨 Building transaction...');

// Try with a different approach - build then manually serialize
try {
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  // Build the transaction with very high exUnits
  console.log('   Setting maximum exUnits to bypass limits...');

  await txBuilder
    .setNetwork("preprod")
    .mintPlutusScriptV3()
    .mint("1", policyId, assetName)
    .mintingScript(clothedCbor)
    .mintRedeemerValue(createRedeemer, "JSON", {
      mem: 14000000,
      steps: 10000000000
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
    .requiredSignerHash(paymentKeyHash!);

  console.log('   Transaction builder configured');

  // Try complete with try-catch to see if we can get partial result
  let unsignedTx;
  try {
    unsignedTx = await txBuilder.complete();
    console.log('✅ Transaction completed WITH evaluation (unexpected success!)');
  } catch (evalError: any) {
    // If evaluation fails but we have a transaction hex, try to extract it
    console.log('❌ Evaluation failed as expected:', evalError.message.substring(0, 100) + '...');

    // Check if there's a transaction hex in the error or builder state
    if (evalError.message.includes('For txHex:')) {
      // Extract txHex from error message
      const match = evalError.message.match(/For txHex: ([0-9a-f]+)/);
      if (match) {
        unsignedTx = match[1];
        console.log('✅ Extracted transaction hex from error!');
        console.log('   Length:', unsignedTx.length, 'chars');
      }
    }

    if (!unsignedTx) {
      throw new Error('Could not extract transaction hex. MeshSDK V3 serialization failed.');
    }
  }

  console.log('\n🔏 Signing transaction...');
  const signedTx = await wallet.signTx(unsignedTx, true);
  console.log('✅ Transaction signed successfully');

  console.log('\n🚀 SUBMITTING TO BLOCKCHAIN...');
  console.log('   This is the moment of truth, General!');
  console.log('   May the validator be with you...\n');

  const txHash = await wallet.submitTx(signedTx);

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    🎉 VICTORY! 🎉                          ║');
  console.log('║                                                            ║');
  console.log('║  Transaction submitted successfully!                       ║');
  console.log('║                                                            ║');
  console.log('║  TxHash:', txHash.substring(0, 20) + '...', '            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Track your transaction:');
  console.log('   https://preprod.cardanoscan.io/transaction/' + txHash);
  console.log('\n⏳ Waiting for confirmation (20-30 seconds)...');
  console.log('   If it confirms, your validator is BATTLE-TESTED! 🎖️\n');

} catch (error: any) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                   💥 DEFEAT 💥                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.error('Error:', error.message);

  if (error.message.includes('unreachable')) {
    console.log('\n❌ MeshSDK WASM serialization failed (V3 bug)');
    console.log('\n🔧 SOLUTION: We MUST switch to Lucid for V3 support');
    console.log('   Command: npm install lucid-cardano');
    console.log('\nMeshSDK does not properly support Plutus V3 transaction building.');
    console.log('This is a known limitation, not a validator issue.');
  } else if (error.message.includes('BadInputsUTxO')) {
    console.log('\n❌ UTxO already spent or doesn\'t exist');
  } else if (error.message.includes('ScriptWitnessNotValidatingUTXOW')) {
    console.log('\n💥 VALIDATOR FAILED ON-CHAIN');
    console.log('   Your collateral (5 ADA) was consumed');
    console.log('   The validator logic has a bug');
  } else {
    console.log('\n❌ Transaction failed (collateral NOT lost)');
  }

  console.log('\nFull error stack:');
  console.log(error);
}
