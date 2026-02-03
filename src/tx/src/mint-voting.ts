// Script to mint a voting event using the voting.ak validator
import { createWallet, walletBaseAddress, applyOrefParamToScript, parseMnemonic, textToHex, extractPaymentKeyHash, selectUtxoAndCreateOutputReference } from './utils.js';
import { BlockfrostProvider, conStr, resolveScriptHash, MeshTxBuilder, Asset, resolvePlutusScriptAddress, PlutusScript, integer, byteString, list } from '@meshsdk/core';
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
const { selectedUtxo, outputReference } = selectUtxoAndCreateOutputReference(walletUtxos, 3);
console.log('\nUsing UTxO:');
console.log(`  TxHash: ${selectedUtxo.input.txHash}`);
console.log(`  Index: ${selectedUtxo.input.outputIndex}`);
console.log(`  Value:`, selectedUtxo.output.amount);
console.log('\nOutput Reference:', outputReference);

// Load voting validator and apply oref parameter
const validatorNaked = VALIDATORS.voting.mint;
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
console.log("Voting NFT Policy ID:", policyId);

// Generate redeemer - Mint variant (alternative 0, no fields)
const mintRedeemer = conStr(0, []);

// Generate UrnaDatum
// weight: Int - 0 for simple voting, >1 for weighted voting
// options: List<(Int,Int)> - [(0,0), (1,0), (2,0)] for 3 options starting at 0
// event_date: (Int, Int) - (start_posix_time, end_posix_time)
// semaphore_nft: PolicyId - The semaphore group NFT policy ID

const weight = 0; // Simple voting (1 vote per participant)

// Example: 3 voting options, all starting at 0 votes
// Options is List<(Int,Int)> - each tuple wrapped with list() for PlutusData List
const options = [
  list([integer(0), integer(0)]), // Option 0: 0 votes
  list([integer(1), integer(0)]), // Option 1: 0 votes
  list([integer(2), integer(0)]), // Option 2: 0 votes
];

// Event dates (POSIX timestamps in milliseconds)
// IMPORTANT: Event start must be AFTER TX validity window ends!
const now = Date.now();
const eventStart = now + 3600000; // Starts in 1 hour (well after 5-minute validity window)
const eventEnd = now + 7200000; // Ends in 2 hours (1 hour voting window)

// Semaphore NFT Policy ID (from the semaphore NFT we just minted)
// This is what voters will spend when voting with ZK proofs
const semaphoreNftPolicyId = "1779325f22a306fd4062a0c714dff772ef9446d3538dfb4910a75c99"; // ✅ Correct Semaphore NFT

const urnaDatum = conStr(0, [
  integer(weight),
  list(options), // List of (Int, Int) pairs - wrapped in list()
  list([integer(eventStart), integer(eventEnd)]), // event_date tuple as list
  byteString(semaphoreNftPolicyId) // Semaphore NFT policy ID
]);

console.log('\nVoting Event Configuration:');
console.log('  Weight:', weight, '(simple voting)');
console.log('  Options:', options.length);
console.log('  Event Start:', new Date(eventStart).toISOString());
console.log('  Event End:', new Date(eventEnd).toISOString());
console.log('  Semaphore NFT Policy:', semaphoreNftPolicyId);

// Asset name for the voting NFT
const assetName = textToHex("VotingEvent1");
const mintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: policyId + assetName, quantity: "1" },
];

// Set validity to end in 5 minutes (well before event start in 1 hour)
// MeshSDK's invalidHereafter() expects a SLOT NUMBER, not POSIX time!
const currentSlot = await provider.fetchLatestBlock().then(block => parseInt(block.slot));
const txValidityEndSlot = currentSlot + 300; // 5 minutes from now

console.log('Current slot:', currentSlot);
console.log('TX validity ends at slot:', txValidityEndSlot);
console.log('Event starts at POSIX (ms):', eventStart, '(' + new Date(eventStart).toISOString() + ')');

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
      .invalidHereafter(txValidityEndSlot) // Validity must be entirely before event_start
      .mintPlutusScriptV3()
      .mint("1", policyId, assetName)
      .mintingScript(clothedCbor)
      .mintRedeemerValue(mintRedeemer, "JSON", {
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
        "4782f9be3028f26fef2fc5f525ea90370530e3e47d4a2a7134476a784c238804",
        5,
        [{ unit: "lovelace", quantity: "5000000" }]
      )
      .txOut(scriptAddr, mintValue)
      .txOutInlineDatumValue(urnaDatum, "JSON")
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
  console.log(`   https://preprod.cardanoscan.io/transaction/${result}`);
  console.log('\n✅ Voting Event NFT minted successfully! 🗳️');
  console.log('\nVoting NFT Policy ID:', policyId);
  console.log('Asset Name:', assetName);
} else {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                     ❌ FAILED ❌                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  console.log('Status:', response.status);
  console.log('Response:', result);
  console.log('\nError details:', result);
}
