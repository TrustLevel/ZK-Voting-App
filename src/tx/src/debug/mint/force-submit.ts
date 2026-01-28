// Try submitting without evaluation (skip .complete())
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import 'dotenv/config';

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey: string = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

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

const assetName = textToHex("ForceGroup");
const walletUtxos = await wallet.getUtxos();

const createRedeemer = conStr(0, []);
const groupDatum = conStr(0, [
  integer(0),
  byteString(paymentKeyHash)
]);

const mintValue: Asset[] = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: policyId + assetName, quantity: "1" },
];

console.log('⚠️  WARNING: Skipping evaluation, forcing submission');
console.log('This might fail on-chain if the script logic has errors\n');

try {
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider, // Still needed for fee calculation
    verbose: false,
  });

  // Build without evaluation by setting exUnits manually
  const unsignedTx = await txBuilder
    .setNetwork("preprod")
    .mintPlutusScriptV3()
    .mint("1", policyId, assetName)
    .mintingScript(clothedCbor)
    .mintRedeemerValue(createRedeemer, "JSON", {  // Manual exUnits
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
    .requiredSignerHash(paymentKeyHash!)
    .completeSync(); // Use completeSync to skip evaluation

  console.log('✅ Transaction built (without evaluation)');

  const signedTx = await wallet.signTx(unsignedTx, true);
  const txHash = await wallet.submitTx(signedTx);
  console.log("\n✅ Transaction submitted:", txHash);
  console.log("Check status at: https://preprod.cardanoscan.io/transaction/" + txHash);

} catch (error) {
  console.error('\n❌ Error:', error.message);
}
