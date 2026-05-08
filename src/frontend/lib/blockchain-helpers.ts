/**
 * Blockchain Helper Functions for Browser Wallet Integration
 *
 * Adapts transaction building logic from @src/tx for use with browser wallets.
 * Based on mint-group.ts and mint-sv.ts but using IWallet instead of MeshWallet.
 */

import {
  BlockfrostProvider,
  Asset,
  UTxO,
  conStr,
  integer,
  byteString,
  resolveScriptHash,
  resolvePlutusScriptAddress,
  IWallet,
} from '@meshsdk/core';
import {
  VALIDATORS,
  textToHex,
  createOutputReference,
  createUrnaDatum,
  createGroupDatum,
  generateInitialOptions,
  selectUtxoAndCreateOutputReference,
  selectUtxoForCollateral,
  applyOrefParamToScript,
  buildGroupMintTransaction,
  buildSemaphoreVotingMintTransaction,
} from '@src/tx/browser';

export {
  textToHex,
  createOutputReference,
  createUrnaDatum,
  createGroupDatum,
  generateInitialOptions,
  selectUtxoAndCreateOutputReference,
  applyOrefParamToScript,
};

// ============================================================================
// TYPES
// ============================================================================

export interface BuildGroupMintTxParams {
  provider: BlockfrostProvider;
  wallet: IWallet;
  walletAddress: string;
  paymentKeyHash: string;
  merkleRoot: bigint;
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
  merkleRoot: bigint;
  options: string[]; // Array of option texts
  votingPower: number; // 1 = simple voting, >1 = weighted voting
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
  validatorCbor: string;
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
// UTILITY FUNCTIONS (browser-only, not in @src/tx/browser)
// ============================================================================

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

export { selectUtxoForCollateral };

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

  const outputReference = createOutputReference(
    selectedUtxo.input.txHash,
    selectedUtxo.input.outputIndex
  );

  const clothedCbor = await applyOrefParamToScript(VALIDATORS.group.mint, outputReference);
  const policyId = resolveScriptHash(clothedCbor, 'V3');
  const scriptAddr = resolvePlutusScriptAddress({ code: clothedCbor, version: 'V3' }, 0);

  console.log('Group NFT Policy ID:', policyId);

  const assetName = textToHex('zkvapp-group');
  const mintValue: Asset[] = [
    { unit: 'lovelace', quantity: '5000000' },
    { unit: policyId + assetName, quantity: '1' },
  ];

  const collateralUtxo = selectUtxoForCollateral(walletUtxos, 5000000);
  if (!collateralUtxo) {
    throw new Error('No suitable collateral UTxO found. Please ensure you have a UTxO with at least 5 ADA that contains only ADA (no other tokens).');
  }

  const unsignedTx = await buildGroupMintTransaction({
    provider: provider as any, // dual node_modules structural mismatch — same at runtime
    policyId,
    assetName,
    clothedCbor,
    createRedeemer: conStr(0, []),
    selectedUtxo,
    walletUtxos,
    walletAddress,
    scriptAddr,
    mintValue,
    groupDatum: createGroupDatum(merkleRoot, paymentKeyHash),
    paymentKeyHash,
    collateralUtxo,
  });

  console.log('✅ Transaction built (length:', unsignedTx.length, ')');

  console.log('🔏 Signing transaction...');
  let signedTx: string;
  try {
    signedTx = await wallet.signTx(unsignedTx, true);
  } catch (signError: any) {
    const msg = signError?.message || String(signError);
    if (msg.toLowerCase().includes('user declined') ||
        msg.toLowerCase().includes('declined sign') ||
        msg.toLowerCase().includes('user rejected')) {
      throw new Error('Wallet signature declined. Please accept the signing request in Eternl to continue.');
    }
    throw signError;
  }

  console.log('🚀 Submitting transaction...');
  let txHash: string;
  try {
    txHash = await wallet.submitTx(signedTx);
    console.log('✅ Transaction submitted via wallet:', txHash);
  } catch (walletSubmitErr: any) {
    const walletErrMsg = walletSubmitErr?.message || String(walletSubmitErr);
    console.warn('⚠️ wallet.submitTx failed:', walletErrMsg, '— retrying via Blockfrost...');
    txHash = await provider.submitTx(signedTx);
    console.log('✅ Transaction submitted via Blockfrost fallback:', txHash);
  }

  return {
    txHash,
    policyId,
    assetName,
    scriptAddress: scriptAddr,
    validatorCbor: clothedCbor,
  };
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
    votingPower,
    startingDate,
    endingDate,
    selectedUtxo,
    walletUtxos,
    txValidityEndSlot,
  } = params;

  console.log('🔨 Building Semaphore + Voting NFT mint transaction...');

  const outputReference = createOutputReference(
    selectedUtxo.input.txHash,
    selectedUtxo.input.outputIndex
  );

  const semaphoreValidatorCbor = await applyOrefParamToScript(VALIDATORS.semaphore.mint, outputReference);
  const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreValidatorCbor, version: 'V3' }, 0);
  const semaphorePolicyId = resolveScriptHash(semaphoreValidatorCbor, 'V3');
  console.log('1️⃣ Semaphore Policy ID:', semaphorePolicyId);

  const votingValidatorCbor = await applyOrefParamToScript(VALIDATORS.voting.mint, outputReference);
  const votingScriptAddr = resolvePlutusScriptAddress({ code: votingValidatorCbor, version: 'V3' }, 0);
  const votingPolicyId = resolveScriptHash(votingValidatorCbor, 'V3');
  console.log('2️⃣ Voting Policy ID:', votingPolicyId);

  // VKEY_REF_TX_HASH: permanent UTxO holding the Groth16 verification key, locked at the
  // always-false script address (addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8).
  const vkeyRefTxHash = '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083';
  const vkeyRefOutputIndex = 0;
  const nullHash = '0000000000000000000000000000000000000000000000000000000000000000';

  const semaphoreDatum = conStr(0, [
    byteString(groupPolicyId),
    integer(merkleRoot),
    byteString(nullHash),
    createOutputReference(vkeyRefTxHash, vkeyRefOutputIndex),
  ]);

  const weight = votingPower > 1 ? votingPower : 0;
  const urnaDatum = createUrnaDatum({
    weight,
    options: generateInitialOptions(options.length),
    eventStart: startingDate * 1000,
    eventEnd: endingDate * 1000,
    semaphoreNftPolicyId: semaphorePolicyId,
  });

  const semaphoreAssetName = textToHex('Semaphore1');
  const semaphoreMintValue: Asset[] = [
    { unit: 'lovelace', quantity: '5000000' },
    { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1' },
  ];

  const votingAssetName = textToHex('VotingEvent1');
  const votingMintValue: Asset[] = [
    { unit: 'lovelace', quantity: '5000000' },
    { unit: votingPolicyId + votingAssetName, quantity: '1' },
  ];

  const collateralUtxo = selectUtxoForCollateral(walletUtxos, 5000000);
  if (!collateralUtxo) {
    throw new Error('No suitable collateral UTxO found. Please ensure you have a UTxO with at least 5 ADA that contains only ADA (no other tokens).');
  }

  const unsignedTx = await buildSemaphoreVotingMintTransaction({
    provider: provider as any, // dual node_modules structural mismatch — same at runtime
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
  });

  console.log('✅ Transaction built (length:', unsignedTx.length, ')');

  console.log('🔏 Signing transaction...');
  let signedTx: string;
  try {
    signedTx = await wallet.signTx(unsignedTx, true);
  } catch (signError: any) {
    const msg = signError?.message || String(signError);
    if (msg.toLowerCase().includes('user declined') ||
        msg.toLowerCase().includes('declined sign') ||
        msg.toLowerCase().includes('user rejected')) {
      throw new Error('Wallet signature declined. Please accept the signing request in Eternl to continue.');
    }
    throw signError;
  }

  console.log('🚀 Submitting transaction...');
  let txHash: string;
  try {
    txHash = await wallet.submitTx(signedTx);
    console.log('✅ Transaction submitted via wallet:', txHash);
  } catch (walletSubmitErr: any) {
    const walletErrMsg = walletSubmitErr?.message || String(walletSubmitErr);
    console.warn('⚠️ wallet.submitTx failed:', walletErrMsg, '— retrying via Blockfrost...');
    txHash = await provider.submitTx(signedTx);
    console.log('✅ Transaction submitted via Blockfrost fallback:', txHash);
  }

  return {
    txHash,
    semaphorePolicyId,
    semaphoreAssetName,
    semaphoreScriptAddr,
    votingPolicyId,
    votingAssetName,
    votingScriptAddr,
  };
}
