// Debug script: spend Group UTxO and write a new GroupDatum with an updated Merkle root.
import { BlockfrostProvider } from '@meshsdk/core';
import { createWallet, walletBaseAddress, parseMnemonic, extractPaymentKeyHash, applyOrefParamToScript, createOutputReference } from '../utils.js';
import { buildUpdateGroupTransaction } from '../node/update-group.js';
import { VALIDATORS } from '../validators.js';
import 'dotenv/config';

const mnemonic = parseMnemonic(process.env.SECRET_KEY!);
const provider = new BlockfrostProvider(process.env.API_KEY!);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);
const paymentKeyHash = extractPaymentKeyHash(walletAddress!);
const walletUtxos = await wallet.getUtxos();

console.log('Wallet Address:', walletAddress);
console.log('Payment Key Hash:', paymentKeyHash);
console.log('UTxOs:', walletUtxos.length);

const MINTING_OREF_TX_HASH = '39cd00370cec40d7b07b798d933196ae4e5e0d64328205ac324b214303ed649b';
const MINTING_OREF_INDEX   = 2;
const GROUP_SCRIPT_ADDRESS = 'addr_test1wpduttlrg6hsxmy0wfs5r5t5l4kva6zpmka3dtdjs8evj4snfmund';
const GROUP_NFT_POLICY_ID  = '5bc5afe346af036c8f726141d174fd6ccee841ddbb16adb281f2c956';
const NEW_MERKLE_ROOT      = BigInt(0); // no-op: same root, just testing the spend path

const mintingOref = createOutputReference(MINTING_OREF_TX_HASH, MINTING_OREF_INDEX);
const groupValidatorCbor = applyOrefParamToScript(VALIDATORS.group.mint, mintingOref);

const collateralUtxo = walletUtxos.find(u =>
  u.output.amount.length === 1 &&
  u.output.amount[0].unit === 'lovelace' &&
  parseInt(u.output.amount[0].quantity) >= 5000000
)!;
console.log('Collateral:', collateralUtxo.input.txHash + '#' + collateralUtxo.input.outputIndex);

console.log('\nUpdating Merkle root to:', NEW_MERKLE_ROOT.toString());

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

console.log('🔏 Signing...');
const signedTx = await wallet.signTx(unsignedTx, true);

console.log('🚀 Submitting...');
const txHash = await wallet.submitTx(signedTx);

console.log('\n✅ Group updated!');
console.log('TX:', txHash);
console.log(`   https://preprod.cardanoscan.io/transaction/${txHash}`);
