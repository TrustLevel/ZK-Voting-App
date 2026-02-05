// Script to mint a Cardano Semaphore Group NFT using the group validator
import { createWallet, walletBaseAddress, applyOrefParamToScript, parseMnemonic, textToHex, extractPaymentKeyHash, selectUtxoAndCreateOutputReference, createGroupDatum } from './utils.js';
import { BlockfrostProvider, conStr, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript } from '@meshsdk/core';
import { VALIDATORS } from './validators.js';
import 'dotenv/config';

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

// Get available UTxOs
const walletUtxos = await wallet.getUtxos();
console.log('Available wallet UTxOs:', walletUtxos.length);

// Select a fresh UTxO for the oref parameter
const { selectedUtxo, outputReference } = selectUtxoAndCreateOutputReference(walletUtxos, 0);
console.log('\nUsing UTxO:');
console.log(`  TxHash: ${selectedUtxo.input.txHash}`);
console.log(`  Index: ${selectedUtxo.input.outputIndex}`);
console.log(`  Value:`, selectedUtxo.output.amount);
console.log('\nOutput Reference:', outputReference);

// Load group validator and apply oref parameter
const validatorNaked = VALIDATORS.group.mint;
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
console.log("Group NFT Policy ID:", policyId);

// Generate redeemer - Create variant (alternative 0, no fields)
const createRedeemer = conStr(0, []);

// Generate GroupDatum with empty merkle root and admin_pkh
const groupDatum = createGroupDatum(0, paymentKeyHash);

console.log('\nGroup Configuration:');
console.log('  Merkle Root: 0 (empty - new group)');
console.log('  Admin PKH:', paymentKeyHash);

// Asset name for the group NFT
const assetName = textToHex("zkvapp-group");
const mintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: policyId + assetName, quantity: "1" },
];

// Build transaction
const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,  // Disable verbose to reduce noise
});

console.log('\n🔨 Building transaction...');

let unsignedMintTx;
try {
  unsignedMintTx = await txBuilder
      .setNetwork("preprod")
      .mintPlutusScriptV3()
      .mint("1", policyId, assetName)
      .mintingScript(clothedCbor)
      .mintRedeemerValue(createRedeemer, "JSON", {
        mem: 14000000,
        steps: 10000000000
      })
      .txIn(
        selectedUtxo.input.txHash,
        selectedUtxo.input.outputIndex,
        selectedUtxo.output.amount,
        walletAddress
      )
      .selectUtxosFrom(walletUtxos)
      .txInCollateral(
        "a0c462bc82ee224bd8f76ec50dbf89b7b42ea831ea830000802771ba49c43d97",
        1,
        [{ unit: "lovelace", quantity: "2470930000" }]
      )
      .txOut(scriptAddr, mintValue)
      .txOutInlineDatumValue(groupDatum, "JSON")
      .changeAddress(walletAddress!)
      .requiredSignerHash(paymentKeyHash!)
      .complete();
  console.log('✅ Transaction completed successfully (length:', unsignedMintTx.length, ')');
} catch (evalError: any) {
  // Extract transaction hex from error message
  const match = evalError.message.match(/For txHex: ([0-9a-f]+)/);
  if (match) {
    unsignedMintTx = match[1];
    console.log('✅ Extracted unsigned tx hex from error (length:', unsignedMintTx.length, ')');
  } else {
    throw new Error('Could not extract transaction hex: ' + evalError.message);
  }
}

console.log('🔏 Signing transaction...');
const signedTx = await wallet.signTx(unsignedMintTx, true);
console.log('✅ Signed tx (length:', signedTx.length, ')');

console.log('\n🚀 Submitting transaction...\n');

// Submit transaction
const txHash = await wallet.submitTx(signedTx);

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                    🎉 SUCCESS! 🎉                          ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');
console.log('Transaction Hash:', txHash);
console.log('\n📊 Check status:');
console.log(`   https://preprod.cardanoscan.io/transaction/${txHash}`);
console.log('\n✅ Group NFT minted successfully! 🎖️');
console.log('\nGroup NFT Policy ID:', policyId);
console.log('Asset Name:', assetName);
