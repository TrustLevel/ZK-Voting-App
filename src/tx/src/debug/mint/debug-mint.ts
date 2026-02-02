// Debug mint transaction with explicit checks
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { txOutRef, MeshWallet, BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import 'dotenv/config';

// Setup
const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey: string = process.env.API_KEY || "";
export const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;

console.log('Wallet address:', walletAddress);
console.log('Payment key hash:', paymentKeyHash);

// Load and parameterize script
const validatorNaked = cborOfValidatorWith(
  "/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json",
  "group",
  "mint"
);

const outputReference = txOutRef("d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d", 1);
console.log('Output reference:', outputReference);

const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference);
console.log('Script CBOR length:', clothedCbor.length);

// Get policy ID and script address
const policyId = resolveScriptHash(clothedCbor, "V3");
console.log("Policy ID:", policyId);

const plutusScript: PlutusScript = {
  code: clothedCbor,
  version: "V3"
};
const scriptAddr = resolvePlutusScriptAddress(plutusScript, 0);
console.log("Script address:", scriptAddr);

// Verify script address matches policy ID
const scriptAddrInfo = deserializeAddress(scriptAddr);
console.log("Script hash from address:", scriptAddrInfo.scriptHash);
console.log("Hashes match:", scriptAddrInfo.scriptHash === policyId);

// Build transaction
const assetName = textToHex("DebugGroup");
const walletUtxos = await wallet.getUtxos();

// Redeemer: Create (constructor 0, no fields)
const createRedeemer = conStr(0, []);
console.log('Create redeemer:', JSON.stringify(createRedeemer));

// Datum: GroupDatum { group_merke_root: Int, admin_pkh: ByteArray }
const groupDatum = conStr(0, [
  integer(0), // Start with 0 merkle root for empty group
  byteString(paymentKeyHash)
]);
console.log('Group datum:', JSON.stringify(groupDatum));

const mintValue: Asset[] = [
  { unit: "lovelace", quantity: "5000000" },
  { unit: policyId + assetName, quantity: "1" },
];

console.log('\n=== Building transaction ===');

try {
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
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

  console.log('\n✅ Transaction built successfully!');

  const signedTx = await wallet.signTx(unsignedTx, true);
  const txHash = await wallet.submitTx(signedTx);
  console.log("✅ Transaction submitted:", txHash);

} catch (error) {
  console.error('\n❌ Error:', error.message);

  // Check UTxO still exists
  console.log('\n=== Checking UTxO ===');
  try {
    const utxo = await provider.fetchUTxOs("d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d", 1);
    console.log('UTxO exists:', utxo.length > 0);
    if (utxo.length > 0) {
      console.log('UTxO value:', JSON.stringify(utxo[0].output.amount));
    }
  } catch (e) {
    console.log('UTxO check failed:', e.message);
  }
}
