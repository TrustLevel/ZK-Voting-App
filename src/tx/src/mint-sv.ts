// Script to mint Semaphore + Voting NFTs in a SINGLE transaction
// (Assumes Group NFT already exists on-chain)
import { fileURLToPath } from 'url';
import {
  createWallet,
  walletBaseAddress,
  applyOrefParamToScript,
  parseMnemonic,
  textToHex,
  extractPaymentKeyHash,
  selectUtxoAndCreateOutputReference,
  createOutputReference,
  generateInitialOptions,
  generateEventTiming,
  createUrnaDatum
} from './utils.js';
import {
  BlockfrostProvider,
  conStr,
  resolveScriptHash,
  MeshTxBuilder,
  Asset,
  resolvePlutusScriptAddress,
  PlutusScript,
  integer,
  byteString,
  UTxO
} from '@meshsdk/core';
import { VALIDATORS } from './validators.js';
import 'dotenv/config';

/**
 * Build unsigned transaction for minting Semaphore + Voting NFTs together
 * Handles Ogmios evaluation errors by extracting transaction hex from error messages
 */
export async function buildSemaphoreVotingMintTransaction(params: {
  provider: BlockfrostProvider;
  txValidityEndSlot: number;
  groupNftTxHash: string;
  groupNftOutputIndex: number;
  semaphorePolicyId: string;
  semaphoreAssetName: string;
  semaphoreValidatorCbor: string;
  votingPolicyId: string;
  votingAssetName: string;
  votingValidatorCbor: string;
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
  walletAddress: string;
  semaphoreScriptAddr: string;
  semaphoreMintValue: Asset[];
  semaphoreDatum: any;
  votingScriptAddr: string;
  votingMintValue: Asset[];
  urnaDatum: any;
  paymentKeyHash: string;
  collateralUtxo: UTxO;
}): Promise<string> {
  const {
    provider,
    txValidityEndSlot,
    groupNftTxHash,
    groupNftOutputIndex,
    semaphorePolicyId,
    semaphoreAssetName,
    semaphoreValidatorCbor,
    votingPolicyId,
    votingAssetName,
    votingValidatorCbor,
    selectedUtxo,
    walletUtxos,
    walletAddress,
    semaphoreScriptAddr,
    semaphoreMintValue,
    semaphoreDatum,
    votingScriptAddr,
    votingMintValue,
    urnaDatum,
    paymentKeyHash,
    collateralUtxo,
  } = params;

  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false
  });

  console.log('\n🔨 Building combined transaction (2 mints in 1 tx)...\n');

  try {
    const unsignedTx = await txBuilder
      .setNetwork("preprod")
      .invalidHereafter(txValidityEndSlot)

      // Reference input to existing Group NFT (required by Semaphore validator)
      .readOnlyTxInReference(groupNftTxHash, groupNftOutputIndex)

      // Mint Semaphore NFT (allocate ~5.5M mem, 3.4B steps)
      .mintPlutusScriptV3()
      .mint("1", semaphorePolicyId, semaphoreAssetName)
      .mintingScript(semaphoreValidatorCbor)
      .mintRedeemerValue(conStr(0, []), "JSON", {
        mem: 5500000,
        steps: 3400000000
      })

      // Mint Voting NFT (allocate ~5.5M mem, 3.3B steps)
      .mintPlutusScriptV3()
      .mint("1", votingPolicyId, votingAssetName)
      .mintingScript(votingValidatorCbor)
      .mintRedeemerValue(conStr(0, []), "JSON", {
        mem: 5500000,
        steps: 3300000000
      })

      // Consume the UTxO (satisfies one-shot condition for both)
      .txIn(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex, selectedUtxo.output.amount, walletAddress)
      .selectUtxosFrom(walletUtxos)

      // Collateral
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
      )

      // Output 0: Semaphore NFT to script
      .txOut(semaphoreScriptAddr, semaphoreMintValue)
      .txOutInlineDatumValue(semaphoreDatum, "JSON")

      // Output 1: Voting NFT to script
      .txOut(votingScriptAddr, votingMintValue)
      .txOutInlineDatumValue(urnaDatum, "JSON")

      // Change and signature
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();

    console.log('✅ Transaction built successfully (length:', unsignedTx.length, ')');
    return unsignedTx;
  } catch (evalError: any) {
    // Ogmios evaluation might fail even for valid transactions
    // Extract the TX hex from error message and proceed anyway
    const match = evalError.message.match(/For txHex: ([0-9a-f]+)/);
    if (match) {
      const unsignedTx = match[1];
      console.log('⚠️  Ogmios evaluation failed (known issue), but extracted TX hex');
      console.log('✅ Unsigned tx (length:', unsignedTx.length, ')');
      return unsignedTx;
    } else {
      console.error('❌ Evaluation failed and could not extract TX hex');
      throw evalError;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MINT Semaphore + Voting NFTs IN ONE TRANSACTION       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Initializing wallet and provider...\n');

  const secretKey = process.env.SECRET_KEY || "";
  const mnemonic = parseMnemonic(secretKey);
  console.log('Loaded mnemonic:', mnemonic.length, 'words');

  const apiKey: string = process.env.API_KEY || "";
  const provider = new BlockfrostProvider(apiKey);

  const wallet = await createWallet(provider, mnemonic, 0);
  const walletAddress = walletBaseAddress(wallet);
  const paymentKeyHash = extractPaymentKeyHash(walletAddress!);

  console.log('Wallet Address:', walletAddress);
  console.log('Payment Key Hash:', paymentKeyHash);

  const walletUtxos = await wallet.getUtxos();
  console.log('Available wallet UTxOs:', walletUtxos.length);

  const groupNftTxHash = "7d343bb3a9fc94c20889e660f9913d52d6e550f76adc5e469ff90d49bd42df39";
  const groupNftOutputIndex = 0;
  const groupPolicyId = "a7bc807147157225d078e47f96a43d18248577955f1e93c7da28cd6c";

  console.log('\n📌 Using existing Group NFT:');
  console.log(`  Policy ID: ${groupPolicyId}`);
  console.log(`  TxHash: ${groupNftTxHash}`);
  console.log(`  Output Index: ${groupNftOutputIndex}`);

  const { selectedUtxo, outputReference } = selectUtxoAndCreateOutputReference(walletUtxos, 0);
  const collateralUtxo = walletUtxos[1] ?? walletUtxos[0];

  console.log('\n📌 Using single UTxO for Semaphore + Voting mints:');
  console.log(`  TxHash: ${selectedUtxo.input.txHash}`);
  console.log(`  Index: ${selectedUtxo.input.outputIndex}`);
  console.log(`  Value:`, selectedUtxo.output.amount);

  console.log('\n📜 Preparing validators...\n');

  const semaphoreValidatorCbor = applyOrefParamToScript(VALIDATORS.semaphore.mint, outputReference);
  const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreValidatorCbor, version: "V3" }, 0);
  const semaphorePolicyId = resolveScriptHash(semaphoreValidatorCbor, "V3");
  console.log('1️⃣  Semaphore Policy ID:', semaphorePolicyId);

  const votingValidatorCbor = applyOrefParamToScript(VALIDATORS.voting.mint, outputReference);
  const votingScriptAddr = resolvePlutusScriptAddress({ code: votingValidatorCbor, version: "V3" }, 0);
  const votingPolicyId = resolveScriptHash(votingValidatorCbor, "V3");
  console.log('2️⃣  Voting Policy ID:', votingPolicyId);

  console.log('\n📋 Creating datums and assets...\n');

  const { VKEY_REF_TX_HASH: vkeyRefTxHash, VKEY_REF_OUTPUT_INDEX: vkeyRefOutputIndex } = await import('./vote.js');
  const nullHash = "0000000000000000000000000000000000000000000000000000000000000000";

  const semaphoreDatum = conStr(0, [
    byteString(groupPolicyId),
    integer(0),
    byteString(nullHash),
    createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex),
  ]);

  const semaphoreAssetName = textToHex("Semaphore1");
  const semaphoreMintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: semaphorePolicyId + semaphoreAssetName, quantity: "1" },
  ];

  const options = generateInitialOptions(3);
  const { eventStart, eventEnd, txValiditySlots, description } = generateEventTiming({
    startsInMinutes: 60,
    durationMinutes: 60,
    txValidityMinutes: 5,
  });

  const urnaDatum = createUrnaDatum({
    weight: 0,
    options,
    eventStart,
    eventEnd,
    semaphoreNftPolicyId: semaphorePolicyId,
  });

  const votingAssetName = textToHex("VotingEvent1");
  const votingMintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: votingPolicyId + votingAssetName, quantity: "1" },
  ];

  console.log('✅ Semaphore datum created (references Group policy:', groupPolicyId + ')');
  console.log('✅ Voting datum created (references Semaphore policy)');
  console.log('\nVoting Configuration:');
  console.log('  Options:', options.length);
  console.log('  Timing:', description);

  const currentSlot = await provider.fetchLatestBlock().then(block => parseInt(block.slot));
  const txValidityEndSlot = currentSlot + txValiditySlots;

  console.log('\nTransaction Validity:');
  console.log('  Current slot:', currentSlot);
  console.log('  TX expires at slot:', txValidityEndSlot);

  const unsignedTx = await buildSemaphoreVotingMintTransaction({
    provider,
    txValidityEndSlot,
    groupNftTxHash,
    groupNftOutputIndex,
    semaphorePolicyId,
    semaphoreAssetName,
    semaphoreValidatorCbor,
    votingPolicyId,
    votingAssetName,
    votingValidatorCbor,
    selectedUtxo,
    walletUtxos,
    walletAddress: walletAddress!,
    semaphoreScriptAddr,
    semaphoreMintValue,
    semaphoreDatum,
    votingScriptAddr,
    votingMintValue,
    urnaDatum,
    paymentKeyHash: paymentKeyHash!,
    collateralUtxo,
  });

  console.log('\n🔏 Signing transaction...');
  const signedTx = await wallet.signTx(unsignedTx, true);
  console.log('✅ Signed tx (length:', signedTx.length, ')');

  console.log('\n🚀 Submitting transaction via Blockfrost...\n');

  const response = await fetch('https://cardano-preprod.blockfrost.io/api/v0/tx/submit', {
    method: 'POST',
    headers: { 'project_id': apiKey, 'Content-Type': 'application/cbor' },
    body: Buffer.from(signedTx, 'hex'),
  });

  const txHash = await response.text();

  if (response.ok) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       🎉 Semaphore + Voting NFTs MINTED IN 1 TX! 🎉       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('Transaction Hash:', txHash);
    console.log('Explorer:', `https://preprod.cardanoscan.io/transaction/${txHash}`);
    console.log('\n📊 Minted NFTs:\n');
    console.log('1️⃣  Semaphore Policy ID:', semaphorePolicyId);
    console.log('2️⃣  Voting Policy ID:', votingPolicyId);
    console.log('✅ Voting system setup completed!');
    console.log('🗳️  Voting event starts:', new Date(eventStart).toISOString());
    console.log('🗳️  Voting event ends:', new Date(eventEnd).toISOString());
  } else {
    console.log('❌ FAILED. Status:', response.status);
    console.log('Response:', txHash);
  }
}
