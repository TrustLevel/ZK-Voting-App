import { createWallet, walletBaseAddress, parseMnemonic } from '../utils.js';
import { BlockfrostProvider } from '@meshsdk/core';
import 'dotenv/config';

const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || "";
const provider = new BlockfrostProvider(apiKey);

const wallet = await createWallet(provider, mnemonic, 0);
const walletAddress = walletBaseAddress(wallet);

console.log('Wallet Address:', walletAddress);
console.log('\nFetching UTxOs...\n');

const utxos = await wallet.getUtxos();

console.log(`Found ${utxos.length} UTxOs:\n`);

utxos.forEach((utxo, index) => {
  console.log(`[${index}] TxHash: ${utxo.input.txHash}`);
  console.log(`    Index: ${utxo.input.outputIndex}`);
  console.log(`    Value:`, utxo.output.amount);
  console.log('');
});

console.log('\nTo use a UTxO for minting, update submit-via-api.ts with:');
console.log(`const outputReference = txOutRef("<txHash>", <outputIndex>);`);
