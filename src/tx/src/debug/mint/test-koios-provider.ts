// Try with Koios provider instead of Blockfrost
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import { KoiosProvider } from '@meshsdk/core';
import 'dotenv/config';

console.log('=== Testing with Koios Provider ===\n');

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || "";

// Use Koios instead of Blockfrost
const koiosProvider = new KoiosProvider('preprod');
console.log('✅ Using Koios provider for preprod');
console.log('API Key:', apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET');

const wallet = await createWallet(koiosProvider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

console.log('Wallet address:', walletAddress);

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

const assetName = textToHex("KoiosTest");
const walletUtxos = await wallet.getUtxos();
console.log('Wallet UTxOs:', walletUtxos.length);

const createRedeemer = conStr(0, []);
const groupDatum = conStr(0, [
  integer(0),
  byteString(paymentKeyHash)
]);

const mintValue: Asset[] = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: policyId + assetName, quantity: "1" },
];

console.log('\n=== Building transaction with Koios ===');

try {
  const txBuilder = new MeshTxBuilder({
    fetcher: koiosProvider,
    evaluator: koiosProvider,  // Use Koios for evaluation
    verbose: true,
  });

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
    .complete();

  console.log('\n✅ Transaction built successfully with Koios!');

  const signedTx = await wallet.signTx(unsignedTx, true);
  const txHash = await wallet.submitTx(signedTx);
  console.log("\n✅ Transaction submitted:", txHash);
  console.log("Check status at: https://preprod.cardanoscan.io/transaction/" + txHash);

} catch (error) {
  console.error('\n❌ Error with Koios:', error.message);
  console.log('\nThis could mean:');
  console.log('1. Koios also has V3 evaluation issues');
  console.log('2. The validator logic actually has a bug');
  console.log('3. Need to try direct Ogmios connection');
}
