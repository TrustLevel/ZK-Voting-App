// Check what inputs are actually in the transaction
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

const assetName = textToHex("TestGroup");
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

console.log('=== Building Transaction to Inspect Inputs ===\n');

try {
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  // Build up to complete (to get the txBodyJson)
  const builder = txBuilder
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
    .requiredSignerHash(paymentKeyHash!);

  // Get the transaction body JSON before complete()
  const txBodyJson = builder.txBuilder.meshTxBuilderBody;

  console.log('=== Transaction Inputs ===');
  console.log('Number of inputs:', txBodyJson.inputs.length);

  txBodyJson.inputs.forEach((input, idx) => {
    if (input.pubKeyTxIn) {
      const txIn = input.pubKeyTxIn.txIn;
      console.log(`\nInput ${idx} (PubKey):`);
      console.log('  TxHash:', txIn.txHash);
      console.log('  Index:', txIn.txIndex);
      console.log('  Address:', txIn.address);

      // Check if this matches the parameterized oref
      const matchesOref =
        txIn.txHash === "d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d" &&
        txIn.txIndex === 1;
      console.log('  Matches parameterized oref:', matchesOref ? '✅' : '❌');
    } else if (input.scriptTxIn) {
      console.log(`\nInput ${idx} (Script):`);
      console.log('  TxHash:', input.scriptTxIn.txIn.txHash);
      console.log('  Index:', input.scriptTxIn.txIn.txIndex);
    }
  });

  console.log('\n=== Parameterized Oref ===');
  console.log('TxHash:', "d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d");
  console.log('Index:', 1);

  console.log('\n=== First Condition Check ===');
  const hasMatchingInput = txBodyJson.inputs.some(input => {
    if (input.pubKeyTxIn) {
      return input.pubKeyTxIn.txIn.txHash === "d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d" &&
             input.pubKeyTxIn.txIn.txIndex === 1;
    }
    return false;
  });

  console.log('Transaction contains matching input:', hasMatchingInput ? '✅ YES' : '❌ NO');

  if (hasMatchingInput) {
    console.log('\n✅ First condition should PASS: UTxO is being consumed');
  } else {
    console.log('\n❌ First condition will FAIL: UTxO is NOT in inputs');
  }

} catch (error) {
  console.error('\n❌ Error:', error.message);
}
