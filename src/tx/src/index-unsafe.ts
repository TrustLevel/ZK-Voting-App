// UNSAFE VERSION - Bypasses evaluation and submits directly to blockchain
// WARNING: If validator fails on-chain, collateral (5 ADA) will be consumed!

// Main exports for @src/tx package
import { createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic, textToHex } from './utils.js';
import { BlockfrostProvider, conStr, deserializeAddress, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString } from '@meshsdk/core';
import { toPlutusData, toAddress } from '@meshsdk/core-csl';
import 'dotenv/config';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           ⚠️  UNSAFE MODE - EVALUATION BYPASSED  ⚠️         ║');
console.log('║                                                            ║');
console.log('║  This will submit directly to the blockchain              ║');
console.log('║  If the validator fails, 5 ADA collateral will be lost    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Get mnemonic from environment
const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
console.log('Loaded mnemonic:', mnemonic.length, 'words');

// Set Provider
const apiKey: string = process.env.API_KEY || "";
export const provider = new BlockfrostProvider(apiKey);

// Generate wallet
const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
console.log('Wallet Address:', walletAddress);

// Extract payment key hash from wallet address
const addressInfo = deserializeAddress(walletAddress!);
const paymentKeyHash = addressInfo.pubKeyHash;
console.log('Payment Key Hash:', paymentKeyHash);

// Import and apply Oref to validator
const validatorNaked = cborOfValidatorWith("/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json", "group", "mint")
// Fresh UTxO with 2492272124 lovelace
// FIXED: Create OutputReference manually - txOutRef has extra wrapper bug
const outputReference = {
  constructor: 0,
  fields: [
    {
      bytes: "8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c"
    },
    {
      int: 1
    }
  ]
};
console.log('Output Reference:', outputReference);

const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference)

// Script Address
const plutusScript: PlutusScript = {
    code: clothedCbor,
    version: "V3"
};
const scriptAddr = resolvePlutusScriptAddress(plutusScript, 0); // 0 for testnet
console.log('Script Address:', scriptAddr);

// Get policyID
const policyId = resolveScriptHash(clothedCbor, "V3");
console.log("Script Policy ID:", policyId);

// Generate redeemer - Create variant (alternative 0, no fields)
const createRedeemer = conStr(0, [])

// Generate Datum - GroupDatum with empty merkle root and admin_pkh
const groupDatum = conStr(0,[
    integer(0),  // Empty merkle root for new group
    byteString(paymentKeyHash)
])

const walletUtxos = await wallet.getUtxos()
console.log('Available wallet UTxOs:', walletUtxos.length);

const assetName = textToHex("zkvapp-group-1")
const mintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: policyId + assetName, quantity: "1" },
];

console.log('\n🔨 Building transaction...');

const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
})

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
            .txIn("8a87c4aed75f5a612b51580db759b5eee278665f61094550f35b2cddf4b38d6c", 1, [{ unit: "lovelace", quantity: '2492272124' }], walletAddress)
            .selectUtxosFrom(walletUtxos)
            .txInCollateral("4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804", 5, [{ unit: "lovelace", quantity: "5000000" }])
            .txOut(scriptAddr, mintValue)
            .txOutInlineDatumValue(groupDatum, "JSON")
            .changeAddress(walletAddress!)
            .requiredSignerHash(paymentKeyHash!)
            .complete()
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

console.log('\n🚀 Submitting directly to Blockfrost API...\n');

// Submit via Blockfrost REST API (bypasses Ogmios evaluation)
const response = await fetch('https://cardano-preprod.blockfrost.io/api/v0/tx/submit', {
  method: 'POST',
  headers: {
    'project_id': apiKey,
    'Content-Type': 'application/cbor',
  },
  body: Buffer.from(signedTx, 'hex'),
});

const result = await response.text();

if (response.ok) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    🎉 SUCCESS! 🎉                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Transaction Hash:', result);
  console.log('\n📊 Check status:');
  console.log('   https://preprod.cardanoscan.io/transaction/' + result);
  console.log('\n✅ Original validator with all 3 conditions PASSED!\n');
  console.log('Group NFT "SecondGroup" minted successfully! 🎖️');
} else {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                     ❌ FAILED ❌                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Status:', response.status);
  console.log('Response:', result);

  try {
    const errorData = JSON.parse(result);
    console.log('\nError details:', JSON.stringify(errorData, null, 2));

    if (errorData.message?.includes('ScriptWitnessNotValidatingUTXOW')) {
      console.log('\n💥 VALIDATOR FAILED ON-CHAIN');
      console.log('   Collateral (5 ADA) was consumed');
      console.log('   One of the three validator conditions failed');
    } else if (errorData.message?.includes('BadInputsUTxO')) {
      console.log('\n❌ UTxO already spent or invalid');
      console.log('   Get a fresh UTxO using: npx tsx debug/check-wallet-utxos.ts');
    }
  } catch {}
}
