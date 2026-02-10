import { createWallet, walletBaseAddress, parseMnemonic } from './utils.js';
import { BlockfrostProvider } from '@meshsdk/core';
import 'dotenv/config';

const secretKey = process.env.SECRET_KEY || '';
const mnemonic = parseMnemonic(secretKey);
const apiKey = process.env.API_KEY || '';
const provider = new BlockfrostProvider(apiKey);
const wallet = await createWallet(provider, mnemonic, 0);
const utxos = await wallet.getUtxos();

console.log('\nAvailable UTxOs for collateral:\n');
utxos.forEach((utxo, i) => {
  const lovelace = utxo.output.amount.find(a => a.unit === 'lovelace')?.quantity || '0';
  const ada = parseInt(lovelace) / 1000000;
  const hasTokens = utxo.output.amount.length > 1;
  console.log(`[${i}] ${utxo.input.txHash}#${utxo.input.outputIndex}`);
  console.log(`    ${ada.toFixed(2)} ADA ${hasTokens ? '+ tokens' : '(pure ADA)'}`);
  console.log();
});
