// Transaction builder for updating the Group UTxO datum (new Merkle root after member registration).
import { fileURLToPath } from 'url';
import {
  BlockfrostProvider,
  MeshTxBuilder,
  UTxO,
  conStr,
  integer,
  byteString,
} from '@meshsdk/core';
import {
  createWallet,
  walletBaseAddress,
  applyOrefParamToScript,
  parseMnemonic,
  extractPaymentKeyHash,
  createOutputReference,
} from '../utils.js';
import { VALIDATORS } from '../validators.js';
import 'dotenv/config';

/**
 * Build unsigned transaction that spends the Group UTxO and writes a new GroupDatum
 * with the updated Merkle root.
 *
 * On-chain constraints enforced by group.ak Update redeemer:
 *   1. TX must be signed by admin_pkh (stored in the current GroupDatum).
 *   2. Group NFT must be returned to the same script address.
 *
 * No constraint is placed on the new merkle_root value — integrity is enforced off-chain
 * by the backend computing the correct root from registered commitments.
 */
export async function buildUpdateGroupTransaction(params: {
  provider: BlockfrostProvider;
  groupScriptAddress: string;
  groupNftPolicyId: string;
  groupValidatorCbor: string;   // parameterized (clothed) CBOR from applyOrefParamToScript
  walletUtxos: UTxO[];
  walletAddress: string;
  paymentKeyHash: string;       // admin's payment key hash — must match GroupDatum.admin_pkh
  collateralUtxo: UTxO;
  newMerkleRoot: bigint;
}): Promise<string> {
  const {
    provider,
    groupScriptAddress,
    groupNftPolicyId,
    groupValidatorCbor,
    walletUtxos,
    walletAddress,
    paymentKeyHash,
    collateralUtxo,
    newMerkleRoot,
  } = params;

  // Fetch the Group UTxO from chain
  const groupUtxos: UTxO[] = await provider.fetchAddressUTxOs(groupScriptAddress);
  const groupUtxo = groupUtxos.find(u =>
    u.output.amount.some(a => a.unit.startsWith(groupNftPolicyId))
  );
  if (!groupUtxo) throw new Error('Group UTxO not found at ' + groupScriptAddress);

  const updateRedeemer = conStr(1, []); // GroupRedeemer::Update

  // New datum: same admin_pkh, updated merkle_root
  const newGroupDatum = conStr(0, [
    integer(newMerkleRoot),
    byteString(paymentKeyHash),
  ]);

  const txBuilder = new MeshTxBuilder({
    fetcher: provider,
    evaluator: provider,
    verbose: false,
  });

  try {
    const unsignedTx = await txBuilder
      .setNetwork('preprod')
      .spendingPlutusScriptV3()
      .txIn(
        groupUtxo.input.txHash,
        groupUtxo.input.outputIndex,
        groupUtxo.output.amount,
        groupScriptAddress,
      )
      .txInScript(groupValidatorCbor)
      .txInInlineDatumPresent()
      .txInRedeemerValue(updateRedeemer, 'JSON', { mem: 2000000, steps: 1000000000 })
      .txInCollateral(
        collateralUtxo.input.txHash,
        collateralUtxo.input.outputIndex,
        collateralUtxo.output.amount,
      )
      .txOut(groupScriptAddress, groupUtxo.output.amount)
      .txOutInlineDatumValue(newGroupDatum, 'JSON')
      .selectUtxosFrom(walletUtxos)
      .changeAddress(walletAddress)
      .requiredSignerHash(paymentKeyHash)
      .complete();

    return unsignedTx;
  } catch (evalError: any) {
    const match = evalError?.message?.match(/For txHex: ([0-9a-f]+)/);
    if (match) return match[1];
    throw evalError;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const secretKey = process.env.SECRET_KEY || '';
  const mnemonic = parseMnemonic(secretKey);
  const apiKey = process.env.API_KEY || '';
  const provider = new BlockfrostProvider(apiKey);

  const wallet = await createWallet(provider, mnemonic, 0);
  const walletAddress = walletBaseAddress(wallet);
  console.log('Wallet Address:', walletAddress);

  const paymentKeyHash = extractPaymentKeyHash(walletAddress!);
  console.log('Payment Key Hash:', paymentKeyHash);

  const walletUtxos = await wallet.getUtxos();
  console.log('Available wallet UTxOs:', walletUtxos.length);

  // These must match the values used at minting time (stored in the backend DB)
  const MINTING_OREF_TX_HASH = process.env.MINTING_OREF_TX_HASH || '';
  const MINTING_OREF_INDEX  = parseInt(process.env.MINTING_OREF_INDEX || '0');
  const GROUP_SCRIPT_ADDRESS = process.env.GROUP_SCRIPT_ADDRESS || '';
  const GROUP_NFT_POLICY_ID  = process.env.GROUP_NFT_POLICY_ID || '';
  const NEW_MERKLE_ROOT      = BigInt(process.env.NEW_MERKLE_ROOT || '0');

  if (!MINTING_OREF_TX_HASH || !GROUP_SCRIPT_ADDRESS || !GROUP_NFT_POLICY_ID) {
    throw new Error(
      'Set MINTING_OREF_TX_HASH, MINTING_OREF_INDEX, GROUP_SCRIPT_ADDRESS, GROUP_NFT_POLICY_ID, NEW_MERKLE_ROOT in .env'
    );
  }

  const mintingOref = createOutputReference(MINTING_OREF_TX_HASH, MINTING_OREF_INDEX);
  const groupValidatorCbor = applyOrefParamToScript(VALIDATORS.group.mint, mintingOref);

  const collateralUtxo = walletUtxos[1] ?? walletUtxos[0];

  console.log('\nUpdating group Merkle root to:', NEW_MERKLE_ROOT.toString());

  const unsignedTx = await buildUpdateGroupTransaction({
    provider,
    groupScriptAddress: GROUP_SCRIPT_ADDRESS,
    groupNftPolicyId: GROUP_NFT_POLICY_ID,
    groupValidatorCbor,
    walletUtxos,
    walletAddress: walletAddress!,
    paymentKeyHash: paymentKeyHash!,
    collateralUtxo,
    newMerkleRoot: NEW_MERKLE_ROOT,
  });

  console.log('🔏 Signing transaction...');
  const signedTx = await wallet.signTx(unsignedTx, true);

  console.log('🚀 Submitting transaction...');
  const txHash = await wallet.submitTx(signedTx);

  console.log('\n✅ Group Merkle root updated successfully!');
  console.log('Transaction Hash:', txHash);
  console.log(`   https://preprod.cardanoscan.io/transaction/${txHash}`);
}
