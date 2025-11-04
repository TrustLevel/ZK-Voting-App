// Main exports for @src/tx package
export * from './builders.js';
export * from './utils.js';
export * from './types.js';

// Note: Environment variables loaded from .env file
import { provider, createWallet, walletBaseAddress, cborOfValidatorWith, applyOrefParamToScript, parseMnemonic } from './utils.js';
import { txOutRef, TxOutRef, MeshWallet } from '@meshsdk/core';
import { toPlutusData } from '@meshsdk/core-csl';

// Get mnemonic from environment
const secretKey = process.env.SECRET_KEY || "";
const mnemonic = parseMnemonic(secretKey);
console.log('Loaded mnemonic:', mnemonic.length, 'words');



const validatorNaked = cborOfValidatorWith("/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json", "group", "mint")
//console.log(validatorNaked);

const outputReference = txOutRef('0'.repeat(64), 0); // Dummy TxOutRef with 64-char hex hash and output index 0
//console.log(outputReference);
const clothedCbor = applyOrefParamToScript(validatorNaked, outputReference)
//console.log(clothedCbor);

