import {
  UTxO,
  IWallet,
  BlockfrostProvider,
  conStr,
  integer,
  byteString,
  resolveScriptHash,
  resolvePlutusScriptAddress,
  Asset,
} from '@meshsdk/core';
import {
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
  VALIDATORS,
} from '@src/tx/browser';
import { CardanoNetwork, NETWORK_ID } from './network';

export {
  textToHex,
  createOutputReference,
  createUrnaDatum,
  createGroupDatum,
  generateInitialOptions,
  selectUtxoAndCreateOutputReference,
  applyOrefParamToScript,
};

export { selectUtxoForCollateral };

export interface GroupMintResult {
  txHash: string;
  policyId: string;
  scriptAddress: string;
  validatorCbor: string;
}

export interface SemaphoreVotingMintResult {
  txHash: string;
  semaphorePolicyId: string;
  semaphoreScriptAddr: string;
  votingPolicyId: string;
  votingScriptAddr: string;
}

export async function buildAndSubmitGroupMintTx(params: {
  provider: BlockfrostProvider;
  network: CardanoNetwork; // script addresses carry the network tag; the builder sets the network too
  wallet: IWallet;
  walletAddress: string;
  paymentKeyHash: string;
  merkleRoot: bigint | number;
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
}): Promise<GroupMintResult> {
  const { provider, network, wallet, walletAddress, paymentKeyHash, merkleRoot, selectedUtxo, walletUtxos } = params;

  const outputReference = createOutputReference(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex);
  const clothedCbor = await applyOrefParamToScript(VALIDATORS.group.mint, outputReference);
  const policyId = resolveScriptHash(clothedCbor, 'V3');
  const scriptAddress = resolvePlutusScriptAddress({ code: clothedCbor, version: 'V3' }, NETWORK_ID[network]);

  const assetName = textToHex('zkvapp-group');
  const mintValue: Asset[] = [
    { unit: 'lovelace', quantity: '5000000' },
    { unit: policyId + assetName, quantity: '1' },
  ];
  const groupDatum = createGroupDatum(merkleRoot, paymentKeyHash);
  const createRedeemer = conStr(0, []);
  const collateralUtxo = selectUtxoForCollateral(walletUtxos);
  if (!collateralUtxo) throw new Error('No suitable collateral UTxO (need pure ADA ≥5 ADA)');

  const unsignedTx = await buildGroupMintTransaction({
    provider,
    network,
    policyId,
    assetName,
    clothedCbor,
    createRedeemer,
    selectedUtxo,
    walletUtxos,
    walletAddress,
    scriptAddr: scriptAddress,
    mintValue,
    groupDatum,
    paymentKeyHash,
    collateralUtxo,
  });

  const signedTx = await wallet.signTx(unsignedTx, true);
  const txHash = await wallet.submitTx(signedTx);

  return { txHash, policyId, scriptAddress, validatorCbor: clothedCbor };
}

export async function buildAndSubmitSemaphoreVotingMintTx(params: {
  provider: BlockfrostProvider;
  network: CardanoNetwork;
  // VKey reference UTxO of the network (from GET /voting-event/networks) — stored in the
  // Semaphore datum and used by the relay on every vote, so both must agree.
  vkeyRef: { txHash: string; outputIndex: number };
  wallet: IWallet;
  walletAddress: string;
  paymentKeyHash: string;
  groupNftTxHash: string;
  groupNftOutputIndex: number;
  groupPolicyId: string;
  merkleRoot: bigint | number;
  options: Array<{ index: number; text: string }>;
  votingPower: number;
  startingDate: number;
  endingDate: number;
  selectedUtxo: UTxO;
  walletUtxos: UTxO[];
  txValidityEndSlot: number;
}): Promise<SemaphoreVotingMintResult> {
  const {
    provider, network, vkeyRef, wallet, walletAddress, paymentKeyHash,
    groupNftTxHash, groupNftOutputIndex, groupPolicyId,
    merkleRoot, options, votingPower, startingDate, endingDate,
    selectedUtxo, walletUtxos, txValidityEndSlot,
  } = params;
  const networkId = NETWORK_ID[network];

  const outputReference = createOutputReference(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex);

  const semaphoreValidatorCbor = await applyOrefParamToScript(VALIDATORS.semaphore.mint, outputReference);
  const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreValidatorCbor, version: 'V3' }, networkId);
  const semaphorePolicyId = resolveScriptHash(semaphoreValidatorCbor, 'V3');

  const votingValidatorCbor = await applyOrefParamToScript(VALIDATORS.voting.mint, outputReference);
  const votingScriptAddr = resolvePlutusScriptAddress({ code: votingValidatorCbor, version: 'V3' }, networkId);
  const votingPolicyId = resolveScriptHash(votingValidatorCbor, 'V3');

  const nullHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const semaphoreDatum = conStr(0, [
    byteString(groupPolicyId),
    integer(merkleRoot),
    byteString(nullHash),
    createOutputReference(vkeyRef.txHash, vkeyRef.outputIndex),
  ]);

  const weight = votingPower > 1 ? votingPower : 0;
  // startingDate/endingDate from the backend are POSIX seconds; the on-chain
  // validity_range is POSIX milliseconds, so multiply before storing in the datum.
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

  const collateralUtxo = selectUtxoForCollateral(walletUtxos);
  if (!collateralUtxo) throw new Error('No suitable collateral UTxO (need pure ADA ≥5 ADA)');

  const unsignedTx = await buildSemaphoreVotingMintTransaction({
    provider,
    network,
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

  const signedTx = await wallet.signTx(unsignedTx, true);
  const txHash = await wallet.submitTx(signedTx);

  return { txHash, semaphorePolicyId, semaphoreScriptAddr, votingPolicyId, votingScriptAddr };
}

export async function waitForTxConfirmation(
  provider: BlockfrostProvider,
  txHash: string,
  maxAttempts: number,
  intervalMs: number,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await provider.fetchTxInfo(txHash);
      return true;
    } catch {
      // Not yet confirmed
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

export async function getWalletUtxos(wallet: IWallet): Promise<UTxO[]> {
  const utxos = await wallet.getUtxos();
  if (!utxos || utxos.length === 0) {
    throw new Error('No UTxOs available in wallet');
  }
  // Some wallets (e.g. Eternl) include script-address UTxOs in getUtxos().
  // Filter to payment-key addresses only (bech32 addr_test1q... or addr1q...).
  // Script addresses start with addr_test1w / addr1w (script hash in payment part).
  const walletUtxos = utxos.filter(u => {
    const addr = u.output.address ?? '';
    return !addr.startsWith('addr_test1w') && !addr.startsWith('addr1w');
  });
  if (walletUtxos.length === 0) {
    throw new Error('No UTxOs available in wallet (all UTxOs are at script addresses)');
  }
  return walletUtxos;
}
