/**
 * Blockchain Helper Functions for Browser Wallet Integration
 *
 * Adapts transaction building logic from @src/tx for use with browser wallets.
 * Based on mint-group.ts and mint-sv.ts but using IWallet instead of MeshWallet.
 */

import {
  BlockfrostProvider,
  MeshTxBuilder,
  Asset,
  UTxO,
  conStr,
  resolveScriptHash,
  resolvePlutusScriptAddress,
  integer,
  byteString,
  list,
  IWallet,
} from '@meshsdk/core';
import { VALIDATORS } from './validators';

/**
 * Lazy load applyParamsToScript from @meshsdk/core-csl
 * WASM modules can only be loaded in the browser
 */
let applyParamsToScriptCache: any = null;

async function getApplyParamsToScript() {
  if (applyParamsToScriptCache) {
    return applyParamsToScriptCache;
  }

  try {
    const module = await import('@meshsdk/core-csl');
    if (!module.applyParamsToScript) {
      throw new Error('@meshsdk/core-csl module loaded but applyParamsToScript is undefined');
    }
    applyParamsToScriptCache = module.applyParamsToScript;
    return applyParamsToScriptCache;
  } catch (error) {
    console.error('Failed to load @meshsdk/core-csl:', error);
    throw new Error('Failed to load WASM module. Please refresh the page and try again.');
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface OutputReference {
  constructor: number;
  fields: Array<{ bytes?: string; int?: number }>;
}

export interface BuildGroupMintTxParams {
  provider: BlockfrostProvider;
  wallet: IWallet;
  walletAddress: string;
  paymentKeyHash: string;
  merkleRoot: number;
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
}

export interface BuildSemaphoreVotingMintTxParams {
  provider: BlockfrostProvider;
  wallet: IWallet;
  walletAddress: string;
  paymentKeyHash: string;
  groupNftTxHash: string;
  groupNftOutputIndex: number;
  groupPolicyId: string;
  merkleRoot: number;
  options: string[]; // Array of option texts
  startingDate: number; // POSIX timestamp (seconds)
  endingDate: number; // POSIX timestamp (seconds)
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
  txValidityEndSlot: number;
}

export interface MintResult {
  txHash: string;
  policyId: string;
  assetName: string;
  scriptAddress: string;
}

export interface SemaphoreVotingMintResult {
  txHash: string;
  semaphorePolicyId: string;
  semaphoreAssetName: string;
  semaphoreScriptAddr: string;
  votingPolicyId: string;
  votingAssetName: string;
  votingScriptAddr: string;
}

// ============================================================================
// UTILITY FUNCTIONS (from utils.ts)
// ============================================================================

/**
 * Convert text to hex for asset names
 */
export function textToHex(text: string): string {
  return Array.from(text)
    .map(character => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create an OutputReference structure for PlutusData
 */
export function createOutputReference(txHash: string, outputIndex: number): OutputReference {
  if (!txHash || txHash.length !== 64) {
    throw new Error('Transaction hash must be a 64-character hex string');
  }

  if (outputIndex < 0) {
    throw new Error('Output index must be non-negative');
  }

  return {
    constructor: 0,
    fields: [
      { bytes: txHash },
      { int: outputIndex }
    ]
  };
}

/**
 * Select a UTxO and create an OutputReference
 */
export function selectUtxoAndCreateOutputReference(
  walletUtxos: UTxO[],
  index: number = 0
): { selectedUtxo: UTxO; outputReference: OutputReference } {
  if (!walletUtxos || walletUtxos.length === 0) {
    throw new Error('No UTxOs available in wallet');
  }

  if (index < 0 || index >= walletUtxos.length) {
    throw new Error(`Invalid UTxO index: ${index}. Available UTxOs: ${walletUtxos.length}`);
  }

  const selectedUtxo = walletUtxos[index];
  const outputReference = createOutputReference(
    selectedUtxo.input.txHash,
    selectedUtxo.input.outputIndex
  );

  return { selectedUtxo, outputReference };
}

/**
 * Apply OutputReference parameter to validator script
 */
export async function applyOrefParamToScript(validatorCbor: string, oref: OutputReference): Promise<string> {
  const applyParamsToScript = await getApplyParamsToScript();
  return applyParamsToScript(validatorCbor, [oref], "JSON");
}

/**
 * Create GroupDatum for Cardano Semaphore group
 */
export function createGroupDatum(merkleRoot: number, adminPkh: string): any {
  if (merkleRoot < 0) {
    throw new Error('Merkle root must be non-negative');
  }

  if (!adminPkh || adminPkh.length !== 56) {
    throw new Error('Admin PKH must be a 56-character hex string');
  }

  return conStr(0, [
    integer(merkleRoot),
    byteString(adminPkh)
  ]);
}

/**
 * Generate initial voting options with zero vote counts
 */
export function generateInitialOptions(numOptions: number): any[] {
  if (numOptions < 2) {
    throw new Error('Minimum 2 options required');
  }

  const options = [];
  for (let i = 0; i < numOptions; i++) {
    options.push(list([integer(i), integer(0)]));
  }

  return options;
}

/**
 * Create UrnaDatum for a voting event
 */
export function createUrnaDatum(params: {
  weight: number;
  options: any[];
  eventStart: number;
  eventEnd: number;
  semaphoreNftPolicyId: string;
}): any {
  const { weight, options, eventStart, eventEnd, semaphoreNftPolicyId } = params;

  if (weight < 0) {
    throw new Error('Weight must be non-negative');
  }

  if (!options || options.length < 2) {
    throw new Error('Must have at least 2 options');
  }

  if (eventEnd <= eventStart) {
    throw new Error('Event end time must be after start time');
  }

  if (!semaphoreNftPolicyId || semaphoreNftPolicyId.length !== 56) {
    throw new Error('Semaphore NFT policy ID must be a 56-character hex string');
  }

  return conStr(0, [
    integer(weight),
    list(options),
    list([integer(eventStart * 1000), integer(eventEnd * 1000)]), // Convert to milliseconds
    byteString(semaphoreNftPolicyId)
  ]);
}

/**
 * Get wallet UTxOs from browser wallet
 */
export async function getWalletUtxos(wallet: IWallet): Promise<UTxO[]> {
  const utxos = await wallet.getUtxos();
  if (!utxos || utxos.length === 0) {
    throw new Error('No UTxOs available in wallet');
  }
  return utxos;
}

/**
 * Find a suitable collateral UTxO from wallet
 * Collateral must be pure ADA (no other tokens) and have enough funds
 */
export function findCollateralUtxo(utxos: UTxO[], minLovelace: number = 5000000): UTxO | null {
  for (const utxo of utxos) {
    // Check if UTxO only contains lovelace (no other tokens)
    if (utxo.output.amount.length === 1 && utxo.output.amount[0].unit === 'lovelace') {
      const lovelaceAmount = parseInt(utxo.output.amount[0].quantity);
      if (lovelaceAmount >= minLovelace) {
        return utxo;
      }
    }
  }
  return null;
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTxConfirmation(
  provider: BlockfrostProvider,
  txHash: string,
  maxAttempts: number = 30,
  delayMs: number = 2000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await provider.fetchTxInfo(txHash);
      return true; // Transaction found on chain
    } catch (error) {
      // Transaction not yet confirmed
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  return false; // Timeout
}

// ============================================================================
// TRANSACTION BUILDERS
// ============================================================================

/**
 * Build and submit Group NFT minting transaction
 * Adapted from mint-group.ts for browser wallet
 */
export async function buildAndSubmitGroupMintTx(
  params: BuildGroupMintTxParams
): Promise<MintResult> {
  const {
    provider,
    wallet,
    walletAddress,
    paymentKeyHash,
    merkleRoot,
    selectedUtxo,
    walletUtxos,
  } = params;

  console.log('🔨 Building Group NFT mint transaction...');

  // Create output reference for one-shot minting
  const outputReference = createOutputReference(
    selectedUtxo.input.txHash,
    selectedUtxo.input.outputIndex
  );

  // Load and parameterize group validator
  const validatorNaked = VALIDATORS.group.mint;
  const clothedCbor = await applyOrefParamToScript(validatorNaked, outputReference);

  // Calculate policy ID and script address
  const policyId = resolveScriptHash(clothedCbor, "V3");
  const scriptAddr = resolvePlutusScriptAddress({ code: clothedCbor, version: "V3" }, 0);

  console.log('Group NFT Policy ID:', policyId);

  // Create redeemer and datum
  const createRedeemer = conStr(0, []);
  const groupDatum = createGroupDatum(merkleRoot, paymentKeyHash);

  // Asset details
  const assetName = textToHex("zkvapp-group");
  const mintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: policyId + assetName, quantity: "1" },
  ];

  // Find collateral UTxO
  const collateralUtxo = findCollateralUtxo(walletUtxos, 5000000);
  if (!collateralUtxo) {
    throw new Error('No suitable collateral UTxO found. Please ensure you have a UTxO with at least 5 ADA that contains only ADA (no other tokens).');
  }

  console.log('Selected collateral UTxO:', {
    txHash: collateralUtxo.input.txHash.slice(0, 16) + '...',
    index: collateralUtxo.input.outputIndex,
    lovelace: collateralUtxo.output.amount[0].quantity,
  });

  // Build transaction
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  try {
    const unsignedTx = await txBuilder
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
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
        collateralUtxo.output.address
      )
      .txOut(scriptAddr, mintValue)
      .txOutInlineDatumValue(groupDatum, "JSON")
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();

    console.log('✅ Transaction built (length:', unsignedTx.length, ')');

    // Sign transaction
    console.log('🔏 Signing transaction...');
    const signedTx = await wallet.signTx(unsignedTx, true);

    // Submit transaction
    console.log('🚀 Submitting transaction...');
    const txHash = await wallet.submitTx(signedTx);

    console.log('✅ Transaction submitted:', txHash);

    return {
      txHash,
      policyId,
      assetName,
      scriptAddress: scriptAddr,
    };

  } catch (evalError: any) {
    console.error('❌ Transaction build error:', evalError);
    console.error('Error type:', typeof evalError);
    console.error('Error keys:', Object.keys(evalError));
    console.error('Error message:', evalError?.message);
    console.error('Error toString:', evalError?.toString());

    // Handle Ogmios evaluation errors
    const errorMessage = evalError?.message || evalError?.toString() || String(evalError);
    const match = errorMessage.match(/For txHex: ([0-9a-f]+)/);

    if (match) {
      const unsignedTx = match[1];
      console.log('⚠️ Ogmios evaluation failed, extracted TX hex');

      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);

      return {
        txHash,
        policyId,
        assetName,
        scriptAddress: scriptAddr,
      };
    } else {
      throw new Error('Transaction build failed: ' + errorMessage);
    }
  }
}

/**
 * Build and submit Semaphore + Voting NFT minting transaction (single TX)
 * Adapted from mint-sv.ts for browser wallet
 */
export async function buildAndSubmitSemaphoreVotingMintTx(
  params: BuildSemaphoreVotingMintTxParams
): Promise<SemaphoreVotingMintResult> {
  const {
    provider,
    wallet,
    walletAddress,
    paymentKeyHash,
    groupNftTxHash,
    groupNftOutputIndex,
    groupPolicyId,
    merkleRoot,
    options,
    startingDate,
    endingDate,
    selectedUtxo,
    walletUtxos,
    txValidityEndSlot,
  } = params;

  console.log('🔨 Building Semaphore + Voting NFT mint transaction...');

  // Create output reference (same for both NFTs)
  const outputReference = createOutputReference(
    selectedUtxo.input.txHash,
    selectedUtxo.input.outputIndex
  );

  // Prepare Semaphore validator
  const semaphoreValidatorCbor = await applyOrefParamToScript(VALIDATORS.semaphore.mint, outputReference);
  const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreValidatorCbor, version: "V3" }, 0);
  const semaphorePolicyId = resolveScriptHash(semaphoreValidatorCbor, "V3");
  console.log('1️⃣ Semaphore Policy ID:', semaphorePolicyId);

  // Prepare Voting validator
  const votingValidatorCbor = await applyOrefParamToScript(VALIDATORS.voting.mint, outputReference);
  const votingScriptAddr = resolvePlutusScriptAddress({ code: votingValidatorCbor, version: "V3" }, 0);
  const votingPolicyId = resolveScriptHash(votingValidatorCbor, "V3");
  console.log('2️⃣ Voting Policy ID:', votingPolicyId);

  // Create datums
  const vkeyRefTxHash = "0000000000000000000000000000000000000000000000000000000000000000";
  const vkeyRefOutputIndex = 0;
  const nullHash = "0000000000000000000000000000000000000000000000000000000000000000";

  const semaphoreDatum = conStr(0, [
    byteString(groupPolicyId),
    integer(merkleRoot),
    byteString(nullHash),
    createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex)
  ]);

  const weight = 0;
  const initialOptions = generateInitialOptions(options.length);
  const urnaDatum = createUrnaDatum({
    weight,
    options: initialOptions,
    eventStart: startingDate,
    eventEnd: endingDate,
    semaphoreNftPolicyId: semaphorePolicyId
  });

  // Asset details
  const semaphoreAssetName = textToHex("Semaphore1");
  const semaphoreMintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: semaphorePolicyId + semaphoreAssetName, quantity: "1" }
  ];

  const votingAssetName = textToHex("VotingEvent1");
  const votingMintValue: Asset[] = [
    { unit: "lovelace", quantity: "5000000" },
    { unit: votingPolicyId + votingAssetName, quantity: "1" }
  ];

  // Find collateral UTxO
  const collateralUtxo = findCollateralUtxo(walletUtxos, 5000000);
  if (!collateralUtxo) {
    throw new Error('No suitable collateral UTxO found. Please ensure you have a UTxO with at least 5 ADA that contains only ADA (no other tokens).');
  }

  console.log('Selected collateral UTxO:', {
    txHash: collateralUtxo.input.txHash.slice(0, 16) + '...',
    index: collateralUtxo.input.outputIndex,
    lovelace: collateralUtxo.output.amount[0].quantity,
  });

  // Build transaction
  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false
  });

  try {
    const unsignedTx = await txBuilder
      .setNetwork("preprod")
      .invalidHereafter(txValidityEndSlot)

      // Reference input to existing Group NFT
      .readOnlyTxInReference(groupNftTxHash, groupNftOutputIndex)

      // Mint Semaphore NFT
      .mintPlutusScriptV3()
      .mint("1", semaphorePolicyId, semaphoreAssetName)
      .mintingScript(semaphoreValidatorCbor)
      .mintRedeemerValue(conStr(0, []), "JSON", {
        mem: 5500000,
        steps: 3400000000
      })

      // Mint Voting NFT
      .mintPlutusScriptV3()
      .mint("1", votingPolicyId, votingAssetName)
      .mintingScript(votingValidatorCbor)
      .mintRedeemerValue(conStr(0, []), "JSON", {
        mem: 5500000,
        steps: 3300000000
      })

      // Consume UTxO
      .txIn(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex, selectedUtxo.output.amount, walletAddress)
      .selectUtxosFrom(walletUtxos)
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
        collateralUtxo.output.address
      )

      // Output Semaphore NFT
      .txOut(semaphoreScriptAddr, semaphoreMintValue)
      .txOutInlineDatumValue(semaphoreDatum, "JSON")

      // Output Voting NFT
      .txOut(votingScriptAddr, votingMintValue)
      .txOutInlineDatumValue(urnaDatum, "JSON")

      // Change and signature
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();

    console.log('✅ Transaction built (length:', unsignedTx.length, ')');

    // Sign transaction
    console.log('🔏 Signing transaction...');
    const signedTx = await wallet.signTx(unsignedTx, true);

    // Submit transaction
    console.log('🚀 Submitting transaction...');
    const txHash = await wallet.submitTx(signedTx);

    console.log('✅ Transaction submitted:', txHash);

    return {
      txHash,
      semaphorePolicyId,
      semaphoreAssetName,
      semaphoreScriptAddr,
      votingPolicyId,
      votingAssetName,
      votingScriptAddr,
    };

  } catch (evalError: any) {
    console.error('❌ Transaction build error:', evalError);
    console.error('Error type:', typeof evalError);
    console.error('Error keys:', Object.keys(evalError));
    console.error('Error message:', evalError?.message);
    console.error('Error toString:', evalError?.toString());

    // Handle Ogmios evaluation errors
    const errorMessage = evalError?.message || evalError?.toString() || String(evalError);
    const match = errorMessage.match(/For txHex: ([0-9a-f]+)/);

    if (match) {
      const unsignedTx = match[1];
      console.log('⚠️ Ogmios evaluation failed, extracted TX hex');

      const signedTx = await wallet.signTx(unsignedTx, true);
      const txHash = await wallet.submitTx(signedTx);

      return {
        txHash,
        semaphorePolicyId,
        semaphoreAssetName,
        semaphoreScriptAddr,
        votingPolicyId,
        votingAssetName,
        votingScriptAddr,
      };
    } else {
      throw new Error('Transaction build failed: ' + errorMessage);
    }
  }
}
