// Main exports for @src/tx package
export * from './builders/index.js';
export * from './utils/index.js';

// Test imports
import { provider, createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript } from './utils/index.js';
import { txOutRef, TxOutRef, mTxOutRef } from '@meshsdk/core';
import { toPlutusData } from '@meshsdk/core-csl';


const validatorNaked = cborOfValidatorWith("/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json", "group", "mint")
console.log(validatorNaked);

const outputReference = txOutRef('0'.repeat(64), 0); // Dummy TxOutRef with 64-char hex hash and output index 0
console.log(outputReference);
const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference)
console.log(clothedCbor);

