// Diagnostic script: compare the on-chain VKey UTxO datum against the current
// verification_key.json to confirm (or rule out) a VKey mismatch as the root
// cause of the PlutusV3 ValidationTagMismatch error.
//
// Approach:
//   1. Load verification_key.json and compress all G1/G2 points.
//   2. Fetch the raw CBOR datum hex of the VKey UTxO from Blockfrost.
//   3. Decode the datum with the `cbor` library (handles indefinite-length
//      chunks — MeshSDK splits bytestrings >64 bytes into 64+remainder chunks).
//   4. Compare every field of the decoded datum against the expected compressed
//      values and print a MATCH / MISMATCH verdict plus a summary.
//
// Run:
//   cd src/tx
//   API_KEY=preprod... tsx src/debug/vote/verify-vkey.ts

import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { compressedG1, compressedG2 } from '@src/zk';
import 'dotenv/config';

// Load the CommonJS `cbor` module in ESM context.
// cbor handles indefinite-length chunked bytestrings correctly (concatenates chunks).
const require = createRequire(import.meta.url);
const cbor = require('cbor');

const VKEY_TX_HASH      = '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083';
const VKEY_OUTPUT_INDEX = 0;

const apiKey = process.env.API_KEY || '';
if (!apiKey) throw new Error('API_KEY not set in .env');

// ── 1. Load and compress verification key ────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const vkeyPath  = resolve(__dirname, '../../../../zk/keys/verification_key.json');
const vkey      = JSON.parse(readFileSync(vkeyPath, 'utf8'));

console.log('Loading verification_key.json from:', vkeyPath);
console.log('nPublic:', vkey.nPublic, '   IC length:', vkey.IC.length);
console.log('\nCompressing G1/G2 points (this takes a moment)...');

const expectedAlpha  = await compressedG1(vkey.vk_alpha_1);
const expectedBeta   = await compressedG2(vkey.vk_beta_2);
const expectedGamma  = await compressedG2(vkey.vk_gamma_2);
const expectedDelta  = await compressedG2(vkey.vk_delta_2);
const expectedIC     = await Promise.all(vkey.IC.map((p: any) => compressedG1(p)));

console.log('\n=== Expected compressed values (from verification_key.json) ===');
console.log('vkAlpha :', expectedAlpha);
console.log('vkBeta  :', expectedBeta);
console.log('vkGamma :', expectedGamma);
console.log('vkDelta :', expectedDelta);
expectedIC.forEach((ic, i) => console.log(`vkIC[${i}] :`, ic));

// ── 2. Fetch VKey UTxO datum from Blockfrost ─────────────────────────────────

console.log(`\nFetching UTxO datum from Blockfrost: ${VKEY_TX_HASH}#${VKEY_OUTPUT_INDEX} ...`);

const txUtxosUrl = `https://cardano-preprod.blockfrost.io/api/v0/txs/${VKEY_TX_HASH}/utxos`;
const bfResponse = await fetch(txUtxosUrl, {
  headers: { 'project_id': apiKey },
});

if (!bfResponse.ok) {
  throw new Error(`Blockfrost error ${bfResponse.status}: ${await bfResponse.text()}`);
}

const bfData: any = await bfResponse.json();
const output = bfData.outputs?.[VKEY_OUTPUT_INDEX];
if (!output) throw new Error(`No output at index ${VKEY_OUTPUT_INDEX}`);

const inlineDatumHex: string = output.inline_datum;
if (!inlineDatumHex) throw new Error('Output has no inline_datum');

console.log('Datum hex length (bytes):', inlineDatumHex.length / 2);
console.log('Datum hex (first 120 chars):', inlineDatumHex.slice(0, 120), '...');

// ── 3. Decode datum CBOR ──────────────────────────────────────────────────────
// Plutus Constr 0 → CBOR tag 121 with an array of fields.
// Fields: [nPublic, vkAlpha, vkBeta, vkGamma, vkDelta, vkAlphaBeta, vkIC]
//
// MeshSDK chunks bytestrings >64 bytes into CBOR indefinite-length bytestrings
// (5f 5840 <64 bytes> 5820 <32 bytes> ff for a 96-byte G2 point).
// cbor.decodeFirstSync concatenates the chunks, returning the full Buffer.

const decoded = cbor.decodeFirstSync(Buffer.from(inlineDatumHex, 'hex'));
// decoded is a cbor.Tagged { tag: 121, value: Array }
const fields: Buffer[] = decoded.value;

const onChainNPublic: number = fields[0];
const onChainAlpha:   string = (fields[1] as Buffer).toString('hex');
const onChainBeta:    string = (fields[2] as Buffer).toString('hex');
const onChainGamma:   string = (fields[3] as Buffer).toString('hex');
const onChainDelta:   string = (fields[4] as Buffer).toString('hex');
// fields[5] = vkAlphaBeta (empty list, unused)
const onChainIC:     string[] = (fields[6] as unknown as Buffer[]).map((b: Buffer) => b.toString('hex'));

console.log('\n=== On-chain datum decoded values ===');
console.log('nPublic :', onChainNPublic);
console.log('vkAlpha :', onChainAlpha);
console.log('vkBeta  :', onChainBeta);
console.log('vkGamma :', onChainGamma);
console.log('vkDelta :', onChainDelta);
onChainIC.forEach((ic, i) => console.log(`vkIC[${i}] :`, ic));

// ── 4. Compare fields ─────────────────────────────────────────────────────────

function check(label: string, expected: string, actual: string): boolean {
  const match = expected === actual;
  console.log(`  ${match ? '✓ MATCH' : '✗ MISMATCH'} ${label}`);
  if (!match) {
    console.log('    Expected:', expected);
    console.log('    Actual  :', actual);
  }
  return match;
}

console.log('\n=== Comparison: on-chain datum vs. local verification_key.json ===');

const results = [
  check('vkAlpha  (G1, 48 bytes)', expectedAlpha,    onChainAlpha),
  check('vkBeta   (G2, 96 bytes)', expectedBeta,     onChainBeta),
  check('vkGamma  (G2, 96 bytes)', expectedGamma,    onChainGamma),
  check('vkDelta  (G2, 96 bytes)', expectedDelta,    onChainDelta),
  ...expectedIC.map((ic, i) => check(`vkIC[${i}]  (G1, 48 bytes)`, ic, onChainIC[i] ?? '')),
];

const nPublicMatch = vkey.nPublic === onChainNPublic;
console.log(`  ${nPublicMatch ? '✓ MATCH' : '✗ MISMATCH'} nPublic (${vkey.nPublic} vs ${onChainNPublic})`);

const allMatch = results.every(Boolean) && nPublicMatch;
const matchCount = results.filter(Boolean).length + (nPublicMatch ? 1 : 0);

console.log('\n=== VERDICT ===');
if (allMatch) {
  console.log('ALL FIELDS MATCH — VKey UTxO is consistent with verification_key.json.');
  console.log('→ VKey mismatch is NOT the root cause of the PlutusV3 failure.');
  console.log('→ Next: investigate ZK proof public inputs, MPF proof encoding, datum fields.');
  console.log('   Note: Blockfrost detected chunked G2 CBOR (MeshSDK chunks bytes >64).');
  console.log('   The Plutus runtime handles this correctly (concatenates CBOR chunks).');
} else {
  console.log(`MISMATCH DETECTED: ${matchCount}/${results.length + 1} fields match.`);
  console.log('→ The on-chain VKey UTxO was created with a DIFFERENT verification key.');
  console.log('→ All vote transactions will fail groth_verify until a new VKey UTxO is posted');
  console.log('   (mint-vkey.ts) and SemaphoreDatum.vkey_ref_input is updated accordingly.');
}
