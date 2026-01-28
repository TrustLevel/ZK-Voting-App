// Use Blockfrost's direct evaluation endpoint
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import 'dotenv/config';

console.log('=== Using Blockfrost Direct Evaluation Endpoint ===\n');

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

console.log('Wallet:', walletAddress);

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

const assetName = textToHex("BlockfrostTest");
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

console.log('\n=== Building transaction (will try built-in evaluation) ===');

try {
  // Build transaction normally - Blockfrost provider should use its own evaluation
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,  // BlockfrostProvider implements evaluateTx
    verbose: true,
  });

  // Try with lower exUnits first to see actual requirements
  const unsignedTx = await txBuilder
    .setNetwork("preprod")
    .mintPlutusScriptV3()
    .mint("1", policyId, assetName)
    .mintingScript(clothedCbor)
    .mintRedeemerValue(createRedeemer, "JSON")
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
    .complete();  // This should use Blockfrost's evaluation

  console.log('\n✅ Transaction built and evaluated successfully!');
  console.log('The validator PASSES evaluation!');

  const signedTx = await wallet.signTx(unsignedTx, true);
  const txHash = await wallet.submitTx(signedTx);

  console.log("\n🎉 SUCCESS! Transaction submitted:", txHash);
  console.log("Check: https://preprod.cardanoscan.io/transaction/" + txHash);

} catch (error: any) {
  console.error('\n❌ Error:', error.message);

  // Check if it's an evaluation error with details
  if (error.response?.data) {
    console.log('\nBlockfrost response:', JSON.stringify(error.response.data, null, 2));
  }

  if (error.message.includes('EvaluationFailure')) {
    console.log('\n💥 Script evaluation failed via Blockfrost endpoint');
    console.log('This means the validator logic has an issue');
  }
}
