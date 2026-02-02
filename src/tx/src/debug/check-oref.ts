// Check if oref parameter matches the consumed input
import { txOutRef } from '@meshsdk/core';
import { applyParamsToScript } from '@meshsdk/core-csl';
import { cborOfValidatorWith } from './utils.js';

console.log('=== Checking OutputReference Parameter ===\n');

// 1. Create the OutputReference
const outputReference = txOutRef("d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d", 1);
console.log('OutputReference structure:', JSON.stringify(outputReference, null, 2));

// 2. Check how it's serialized
console.log('\nOutputReference fields:');
console.log('- constructor:', outputReference.constructor);
console.log('- fields:', JSON.stringify(outputReference.fields, null, 2));

// 3. Load naked validator
const validatorNaked = cborOfValidatorWith(
  "/home/ash/Cardano/ZK-Voting-App/src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json",
  "group",
  "mint"
);

console.log('\n=== Validator Info ===');
console.log('Title:', validatorNaked.title);
console.log('Naked CBOR length:', validatorNaked.compiledCode.length);

// 4. Apply parameter
const clothedCbor = applyParamsToScript(validatorNaked.compiledCode, [outputReference], "JSON");
console.log('\n=== After Applying Parameter ===');
console.log('Clothed CBOR length:', clothedCbor.length);
console.log('Length difference:', clothedCbor.length - validatorNaked.compiledCode.length);

// 5. Check the embedded oref in the CBOR
// The oref should be embedded at the end of the compiled code
const nakedHex = validatorNaked.compiledCode;
const clothedHex = clothedCbor;

console.log('\n=== CBOR Comparison ===');
console.log('Last 100 chars of naked:', nakedHex.slice(-100));
console.log('Last 100 chars of clothed:', clothedHex.slice(-100));

// 6. The expected oref encoding
const expectedTxHash = "d9fa1054c16cc5bc953cefbd1b71a00da1873a9a97bd852961c096111442916d";
const expectedIndex = 1;

console.log('\n=== Expected Values ===');
console.log('TxHash:', expectedTxHash);
console.log('Index:', expectedIndex);

// Check if the hash appears in the clothed CBOR
if (clothedHex.includes(expectedTxHash)) {
  console.log('✅ TxHash found in clothed CBOR');
} else {
  console.log('❌ TxHash NOT found in clothed CBOR');
}

// 7. Check the structure - OutputReference should be:
// constr 0 with fields: [constr 0 [bytes txHash], int index]
console.log('\n=== OutputReference Structure Check ===');
console.log('Expected: { constructor: 0, fields: [{ constructor: 0, fields: [{ bytes: "..." }] }, { int: 1 }] }');
console.log('Actual:  ', JSON.stringify(outputReference));

const isCorrectStructure =
  outputReference.constructor === 0 &&
  outputReference.fields &&
  outputReference.fields.length === 2 &&
  outputReference.fields[0].constructor === 0 &&
  outputReference.fields[1].int === expectedIndex;

console.log('Structure matches:', isCorrectStructure ? '✅' : '❌');
