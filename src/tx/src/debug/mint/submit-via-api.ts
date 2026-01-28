// Extract signed tx and submit via Blockfrost REST API directly
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import 'dotenv/config';

console.log('=== Submitting via Blockfrost REST API ===\n');

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

// Use UTxO [3]: 8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c!1 with 2492272124 lovelace
const outputReference = txOutRef("8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c", 1);

const validatorNaked = cborOfValidatorWith(
  "/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json",
  "group",
  "mint"
);
const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference);
const policyId = resolveScriptHash(clothedCbor, "V3");

const plutusScript: PlutusScript = {
  code: clothedCbor,
  version: "V3"
};
const scriptAddr = resolvePlutusScriptAddress(plutusScript, 0);

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

try {
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

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
      "a21a718510c51e1979d81a98743766aec06b184854eadd7eb3b915144fb7ee41",
      1,
      [{ unit: "lovelace", quantity: '4979179270' }],
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

  let unsignedTxHex;
  try {
    unsignedTxHex = await txBuilder.complete();
    console.log('✅ Transaction completed successfully (length:', unsignedTxHex.length, ')');
  } catch (evalError: any) {
    const match = evalError.message.match(/For txHex: ([0-9a-f]+)/);
    if (match) {
      unsignedTxHex = match[1];
      console.log('✅ Extracted unsigned tx hex from error (length:', unsignedTxHex.length, ')');
    } else {
      throw new Error('Could not extract transaction hex');
    }
  }

  console.log('🔏 Signing...');
  const signedTxHex = await wallet.signTx(unsignedTxHex, true);
  console.log('✅ Signed tx hex (length:', signedTxHex.length, ')');

  console.log('\n🚀 Submitting directly to Blockfrost API...\n');

  // Submit via fetch to Blockfrost REST API
  const response = await fetch('https://cardano-preprod.blockfrost.io/api/v0/tx/submit', {
    method: 'POST',
    headers: {
      'project_id': apiKey,
      'Content-Type': 'application/cbor',
    },
    body: Buffer.from(signedTxHex, 'hex'),
  });

  const result = await response.text();

  if (response.ok) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    🎉 SUCCESS! 🎉                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('Transaction Hash:', result);
    console.log('\n📊 Check status:');
    console.log('   https://preprod.cardanoscan.io/transaction/' + result);
    console.log('\nYour validator works, General! 🎖️\n');
  } else {
    console.log('❌ Submission failed');
    console.log('Status:', response.status);
    console.log('Response:', result);

    // Parse error
    try {
      const errorData = JSON.parse(result);
      console.log('\nError details:', JSON.stringify(errorData, null, 2));

      if (errorData.message?.includes('ScriptWitnessNotValidatingUTXOW')) {
        console.log('\n💥 VALIDATOR FAILED ON-CHAIN');
        console.log('Collateral (5 ADA) was consumed');
      }
    } catch {}
  }

} catch (error: any) {
  console.error('\n❌ Error:', error?.message || error);
  if (error?.stack) {
    console.log('\nStack:', error.stack);
  }
}
