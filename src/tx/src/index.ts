// Main exports for @src/tx package
export * from './builders/index.js';
export * from './utils/index.js';

// Test imports
import { provider, createWallet, walletBaseAddress, cborOfValidatorWith, generateScriptCbor } from './utils/index.js';
import { txOutRef, TxOutRef, mTxOutRef } from '@meshsdk/core';
import { toPlutusData } from '@meshsdk/core-csl';


const cborNaked = cborOfValidatorWith("/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json", "group", "mint")
console.log(cborNaked);

const outputReference = txOutRef('0'.repeat(64), 0); // Dummy TxOutRef with 64-char hex hash and output index 0
console.log(outputReference);
const clothedCbor = generateScriptCbor("/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json", "group", "mint", outputReference)
console.log(clothedCbor);

