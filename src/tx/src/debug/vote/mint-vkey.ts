// Script to post the SnarkVerificationKey as an on-chain UTxO datum.
//
// The semaphore validator's Signal spending path reads the VKey from a UTxO
// identified by SemaphoreDatum.vkey_ref_input. Run this script once before
// Phase 2 of bootstrap-vote.ts, then paste the printed tx hash and output
// index into bootstrap-vote.ts (vkeyRefTxHash / vkeyRefOutputIndex).
//
// The VKey UTxO is sent to the wallet address so the wallet can include it
// as a spending input in each vote transaction.
// NOTE: the vote transaction must also re-create this UTxO as an output so
// the VKey remains available for subsequent votes.

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import {
  BlockfrostProvider,
  MeshTxBuilder,
  conStr,
  integer,
  byteString,
  list,
} from '@meshsdk/core';
import { compressedG1, compressedG2 } from '@src/zk';
import {
  createWallet,
  parseMnemonic,
  walletBaseAddress,
  extractPaymentKeyHash,
} from '../../utils.js';
import 'dotenv/config';

// ═══════════════════════════════════════════════════════════════════════════
// Provider and wallet
// ═══════════════════════════════════════════════════════════════════════════

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);

const apiKey: string = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet)!;
const paymentKeyHash = extractPaymentKeyHash(walletAddress)!;
const walletUtxos = await wallet.getUtxos();

console.log('Wallet address:', walletAddress);
console.log('Available UTxOs:', walletUtxos.length);

// ═══════════════════════════════════════════════════════════════════════════
// Load and compress verification key
// ═══════════════════════════════════════════════════════════════════════════

const __dirname = dirname(fileURLToPath(import.meta.url));
const vkeyPath = resolve(__dirname, '../../../../zk/keys/verification_key.json');
const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8'));

console.log('\nCompressing verification key points...');

// SnarkVerificationKey on-chain type (ak_381/groth16.ak):
//   nPublic:      Int
//   vkAlpha:      ByteArray  (compressed G1)
//   vkBeta:       ByteArray  (compressed G2)
//   vkGamma:      ByteArray  (compressed G2)
//   vkDelta:      ByteArray  (compressed G2)
//   vkAlphaBeta:  List<ByteArray>  (not used in groth_verify — stored as empty list)
//   vkIC:         List<ByteArray>  (compressed G1, one per public input + 1)

const vkAlpha = await compressedG1(vkey.vk_alpha_1);
const vkBeta  = await compressedG2(vkey.vk_beta_2);
const vkGamma = await compressedG2(vkey.vk_gamma_2);
const vkDelta = await compressedG2(vkey.vk_delta_2);
const vkIC    = await Promise.all(vkey.IC.map((p: any) => compressedG1(p)));

console.log('vkAlpha:', vkAlpha);
console.log('vkBeta: ', vkBeta);
console.log('vkGamma:', vkGamma);
console.log('vkDelta:', vkDelta);
console.log('vkIC:   ', vkIC);

// SnarkVerificationKey datum — constr 0 matching the Aiken record field order.
// vkAlphaBeta is not used by groth_verify so we store an empty list.
const vkeyDatum = conStr(0, [
  integer(vkey.nPublic),
  byteString(vkAlpha),
  byteString(vkBeta),
  byteString(vkGamma),
  byteString(vkDelta),
  list([]),                               // vkAlphaBeta — unused by groth_verify
  list(vkIC.map((ic: string) => byteString(ic))),  // vkIC
]);

// ═══════════════════════════════════════════════════════════════════════════
// Build and submit transaction
// ═══════════════════════════════════════════════════════════════════════════

const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  evaluator: provider,
  verbose: false,
});

console.log('\nBuilding VKey UTxO transaction...');

const unsignedTx = await txBuilder
  .setNetwork("preprod")
  .selectUtxosFrom(walletUtxos)
  .txOut(walletAddress, [{ unit: "lovelace", quantity: "5000000" }])
  .txOutInlineDatumValue(vkeyDatum, "JSON")
  .changeAddress(walletAddress)
  .requiredSignerHash(paymentKeyHash)
  .complete();

const signedTx = await wallet.signTx(unsignedTx, true);
const txHash = await wallet.submitTx(signedTx);

console.log('\nVKey UTxO tx hash:', txHash);
console.log('Output index:     0');
console.log('Explorer: https://preprod.cardanoscan.io/transaction/' + txHash);
console.log('\n→ Paste into bootstrap-vote.ts:');
console.log(`  const vkeyRefTxHash      = "${txHash}";`);
console.log(`  const vkeyRefOutputIndex = 0;`);
