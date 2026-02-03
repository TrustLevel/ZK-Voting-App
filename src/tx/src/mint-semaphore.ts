// Script to mint a Semaphore NFT using the semaphore.ak validator
import { createWallet, walletBaseAddress, applyOrefParamToScript, parseMnemonic, textToHex, extractPaymentKeyHash, selectUtxoAndCreateOutputReference } from './utils.js';
import { BlockfrostProvider, conStr, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import { VALIDATORS } from './validators.js';
import 'dotenv/config';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         SEMAPHORE NFT MINTING (semaphore.ak)              ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Get mnemonic from environment
const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
console.log('Loaded mnemonic:', mnemonic.length, 'words');

// Set Provider
const apiKey: string = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

// Generate wallet
const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
console.log('Wallet Address:', walletAddress);

// Extract payment key hash from wallet address
const paymentKeyHash = extractPaymentKeyHash(walletAddress!);
console.log('Payment Key Hash:', paymentKeyHash);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - UPDATE THESE VALUES
// ═══════════════════════════════════════════════════════════════════════════

// Group NFT information (from the group we created with index-unsafe.ts)
const groupNftPolicyId = "839b7c32cf0a230f7583e6e5f5f444aad7b7f6373774470796713296";
const groupNftTxHash = "4b3ae50d2732cfac39725e83b31b76aaa0c088c35cb263e0be5c226fedd1d62a";
const groupNftOutputIndex = 0; // ✅ Verified - Group NFT is at output index 0

// Group merkle root (currently 0 for empty group)
const groupMerkleRoot = 0;

// SNARK Verification Keys UTxO Reference
// TODO: Update these with actual verification keys UTxO
const vkeyRefTxHash = "0000000000000000000000000000000000000000000000000000000000000000";
const vkeyRefOutputIndex = 0;

// ═══════════════════════════════════════════════════════════════════════════

// Get available UTxOs
const walletUtxos = await wallet.getUtxos();
console.log('\nAvailable wallet UTxOs:', walletUtxos.length);

// Select a fresh UTxO for the oref parameter (one-shot minting)
const { selectedUtxo, outputReference } = selectUtxoAndCreateOutputReference(walletUtxos, 0);
console.log('\nUsing UTxO for one-shot minting:');
console.log(`  TxHash: ${selectedUtxo.input.txHash}`);
console.log(`  Index: ${selectedUtxo.input.outputIndex}`);
console.log(`  Value:`, selectedUtxo.output.amount);

// Load semaphore validator and apply oref parameter
console.log('\n📜 Loading semaphore validator...');
const validatorNaked = VALIDATORS.semaphore.mint;
const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference);

// Script Address
const plutusScript: PlutusScript = {
    code: clothedCbor,
    version: "V3"
};
const scriptAddr = resolvePlutusScriptAddress(plutusScript, 0); // 0 for testnet
console.log('Script Address:', scriptAddr);

// Get policyID
const policyId = resolveScriptHash(clothedCbor, "V3");
console.log("Semaphore NFT Policy ID:", policyId);

// Generate redeemer - Create variant (alternative 0, no fields)
const createRedeemer = conStr(0, []);

// Generate SemaphoreDatum
// pub type SemaphoreDatum {
//   group_token_policy: PolicyId,
//   group_merke_root: Int,
//   nullifier_mpf_root: ByteArray,
//   vkey_ref_input: OutputReference,
// }

// Create null_hash (32 bytes of zeros) for initial nullifier_mpf_root
const nullHash = "0000000000000000000000000000000000000000000000000000000000000000";

// Create vkey_ref_input OutputReference
const vkeyRefInput = {
  constructor: 0,
  fields: [
    {
      bytes: vkeyRefTxHash
    },
    {
      int: vkeyRefOutputIndex
    }
  ]
};

const semaphoreDatum = conStr(0, [
  byteString(groupNftPolicyId),     // group_token_policy: PolicyId
  integer(groupMerkleRoot),          // group_merke_root: Int
  byteString(nullHash),              // nullifier_mpf_root: ByteArray (empty)
  vkeyRefInput                       // vkey_ref_input: OutputReference
]);

console.log('\n📋 Semaphore Datum Configuration:');
console.log('  Group NFT Policy ID:', groupNftPolicyId);
console.log('  Group Merkle Root:', groupMerkleRoot);
console.log('  Nullifier MPF Root:', nullHash, '(empty)');
console.log('  Verification Keys Ref:', `${vkeyRefTxHash}#${vkeyRefOutputIndex}`);

// Asset name for the semaphore NFT
const assetName = textToHex("Semaphore1");
const mintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: policyId + assetName, quantity: "1" },
];

// Build transaction
const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: true,
});

console.log('\n🔨 Building transaction...');

const unsignedMintTx = await txBuilder
    .setNetwork("preprod")
    .mintPlutusScriptV3()
    .mint("1", policyId, assetName)
    .mintingScript(clothedCbor)
    .mintRedeemerValue(createRedeemer, "JSON")
    // Condition 1: Spend the oref UTxO (one-shot minting)
    .txIn(
      selectedUtxo.input.txHash,
      selectedUtxo.input.outputIndex,
      selectedUtxo.output.amount,
      walletAddress
    )
    .selectUtxosFrom(walletUtxos)
    // Condition 5: Reference input to Group NFT (to verify merkle root)
    .readOnlyTxInReference(groupNftTxHash, groupNftOutputIndex)
    .txInCollateral(
      "4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804",
      0,
      [{ unit: "lovelace", quantity: "5000000" }]
    )
    // Condition 3: Send Semaphore NFT to script
    .txOut(scriptAddr, mintValue)
    // Condition 4: Attach SemaphoreDatum
    .txOutInlineDatumValue(semaphoreDatum, "JSON")
    .changeAddress(walletAddress!)
    .requiredSignerHash(paymentKeyHash!)
    .complete();

console.log('✅ Transaction built successfully');

const signedTx = await wallet.signTx(unsignedMintTx, true);
console.log('✅ Transaction signed');

const txHash = await wallet.submitTx(signedTx);

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║                    🎉 SUCCESS! 🎉                          ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('\nSemaphore NFT minted successfully! 🔐');
console.log('\nTransaction Hash:', txHash);
console.log('\n📊 Check status:');
console.log(`   https://preprod.cardanoscan.io/transaction/${txHash}`);
console.log('\nSemaphore NFT Policy ID:', policyId);
console.log('Asset Name:', assetName);
