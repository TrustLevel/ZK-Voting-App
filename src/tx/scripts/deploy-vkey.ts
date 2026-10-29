/**
 * One-off per network: post the Groth16 SnarkVerificationKey as a permanent on-chain
 * UTxO datum at the always-false script address.
 *
 * The UTxO is referenced read-only by every vote transaction and stored in
 * SemaphoreDatum.vkey_ref_input at mint time. It never moves. Run this ONCE per
 * network, then put the printed tx hash into src/tx/src/network.ts (VKEY_REF)
 * or into the backend's VKEY_REF_MAINNET environment variable.
 *
 * The output locks VKEY_LOVELACE (5 ADA) forever — on Mainnet that is real ADA.
 *
 * Usage (from src/tx):
 *   NETWORK=preprod API_KEY=preprod... SECRET_KEY="24 words" npx tsx scripts/deploy-vkey.ts
 *   NETWORK=mainnet API_KEY=mainnet... SECRET_KEY="24 words" npx tsx scripts/deploy-vkey.ts
 *
 * Add DRY_RUN=1 to build and print the transaction without signing or submitting.
 * The wallet needs VKEY_LOVELACE plus the fee (≈ 0.2 ADA) in a payment-key address.
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { BlockfrostProvider, MeshTxBuilder, MeshWallet, conStr, integer, byteString, list, deserializeAddress } from '@meshsdk/core';
import { compressedG1, compressedG2 } from '@src/zk';
import {
  ALWAYS_FALSE_ADDRESS,
  BLOCKFROST_BASE_URL,
  NETWORK_ID,
  VKEY_REF,
  explorerTxUrl,
  isCardanoNetwork,
} from '../src/network.js';
import 'dotenv/config';

const VKEY_LOVELACE = '5000000';

const network = process.env.NETWORK ?? '';
if (!isCardanoNetwork(network)) throw new Error('NETWORK must be "mainnet" or "preprod"');

const apiKey = process.env.API_KEY ?? '';
if (!apiKey) throw new Error('API_KEY (Blockfrost project id) not set');
if (!apiKey.startsWith(network)) throw new Error(`API_KEY does not look like a ${network} Blockfrost key`);

const secretKey = process.env.SECRET_KEY ?? '';
if (!secretKey) throw new Error('SECRET_KEY (24-word mnemonic of the paying wallet) not set');

const dryRun = process.env.DRY_RUN === '1';

if (VKEY_REF[network]) {
  console.log(`A VKey UTxO is already configured for ${network}: ${VKEY_REF[network]!.txHash}#${VKEY_REF[network]!.outputIndex}`);
  console.log('Set FORCE=1 to deploy another one anyway.');
  if (process.env.FORCE !== '1') process.exit(1);
}

// (utils.ts is not imported here: its ESM import of @meshsdk/core-csl does not load under tsx.)
const words = secretKey.trim().split(/\s+/);
if (words.length !== 24) throw new Error(`SECRET_KEY must be a 24-word mnemonic, got ${words.length} words`);

const provider = new BlockfrostProvider(apiKey);
const wallet = new MeshWallet({
  networkId: NETWORK_ID[network],
  fetcher: provider,
  submitter: provider,
  key: { type: 'mnemonic', words },
});
const walletAddress = await wallet.getChangeAddress();
const paymentKeyHash = deserializeAddress(walletAddress).pubKeyHash;
const walletUtxos = await wallet.getUtxos();

const lovelace = walletUtxos.reduce((sum, u) => sum + BigInt(u.output.amount.find(a => a.unit === 'lovelace')?.quantity ?? '0'), 0n);
console.log(`Network:        ${network}`);
console.log(`Paying wallet:  ${walletAddress}`);
console.log(`Wallet balance: ${Number(lovelace) / 1e6} ADA in ${walletUtxos.length} UTxO(s)`);
console.log(`Lock address:   ${ALWAYS_FALSE_ADDRESS[network]} (always-false script, never spendable)`);
console.log(`Amount locked:  ${Number(VKEY_LOVELACE) / 1e6} ADA (permanently)`);
if (lovelace < BigInt(VKEY_LOVELACE) + 500_000n) throw new Error('Wallet balance too low: need 5 ADA plus the fee');

// ── Verification key → on-chain SnarkVerificationKey datum ──────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const vkeyPath = resolve(__dirname, '../../zk/keys/verification_key.json');
const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8'));
console.log(`VKey file:      ${vkeyPath} (nPublic ${vkey.nPublic}, IC ${vkey.IC.length})`);

const vkAlpha = await compressedG1(vkey.vk_alpha_1);
const vkBeta = await compressedG2(vkey.vk_beta_2);
const vkGamma = await compressedG2(vkey.vk_gamma_2);
const vkDelta = await compressedG2(vkey.vk_delta_2);
const vkIC: string[] = await Promise.all(vkey.IC.map((p: any) => compressedG1(p)));

// SnarkVerificationKey (ak_381/groth16.ak): nPublic, vkAlpha, vkBeta, vkGamma, vkDelta, vkAlphaBeta (unused, empty), vkIC
const vkeyDatum = conStr(0, [
  integer(vkey.nPublic),
  byteString(vkAlpha),
  byteString(vkBeta),
  byteString(vkGamma),
  byteString(vkDelta),
  list([]),
  list(vkIC.map(ic => byteString(ic))),
]);

// ── Build ────────────────────────────────────────────────────────────────────
const txBuilder = new MeshTxBuilder({ fetcher: provider, verbose: false });
const unsignedTx = await txBuilder
  .setNetwork(network)
  .selectUtxosFrom(walletUtxos)
  .txOut(ALWAYS_FALSE_ADDRESS[network], [{ unit: 'lovelace', quantity: VKEY_LOVELACE }])
  .txOutInlineDatumValue(vkeyDatum, 'JSON')
  .changeAddress(walletAddress)
  .requiredSignerHash(paymentKeyHash)
  .complete();

console.log(`\nUnsigned tx built (${unsignedTx.length / 2} bytes).`);
if (dryRun) {
  console.log('DRY_RUN=1 — not signing, not submitting.');
  process.exit(0);
}

const signedTx = await wallet.signTx(unsignedTx, true);
const txHash = await wallet.submitTx(signedTx);

console.log('\nVKey UTxO submitted.');
console.log(`  tx hash:      ${txHash}`);
console.log(`  output index: 0`);
console.log(`  explorer:     ${explorerTxUrl(network, txHash)}`);
console.log('\nNext steps:');
console.log(`  1. Wait for confirmation, then verify: NETWORK=${network} API_KEY=... npx tsx scripts/verify-vkey.ts ${txHash}#0`);
console.log(`  2. Backend env: VKEY_REF_${network.toUpperCase()}=${txHash}#0`);
console.log(`     (or set VKEY_REF.${network} in src/tx/src/network.ts and rebuild)`);
console.log(`  Blockfrost check: ${BLOCKFROST_BASE_URL[network]}/txs/${txHash}/utxos`);
