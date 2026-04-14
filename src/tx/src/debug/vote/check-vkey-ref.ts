// Fetch the UTxO referenced in the on-chain SemaphoreDatum as vkey_ref_input
// and compare against the hardcoded constant in cast-vote.ts
// Run: cd src/tx && API_KEY=preprod... tsx src/debug/vote/check-vkey-ref.ts

import { createRequire } from 'module';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const cbor = require('cbor');

const apiKey = process.env.API_KEY || '';
if (!apiKey) throw new Error('API_KEY not set');

// ── The UTxO referenced in the on-chain SemaphoreDatum ───────────────────────
const onChainVkeyTxHash  = '10b5b3ca7cfad3da6d344138ff4361a5398acc19b41cc0382fcfc82e427581ae';
const onChainVkeyIndex   = 2;

// ── The UTxO hardcoded in cast-vote.ts / VKEY_REF constants ─────────────────
const castVoteTxHash     = '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083';
const castVoteIndex      = 0;

console.log('=== vkey_ref_input discrepancy ===');
console.log('On-chain SemaphoreDatum says:', onChainVkeyTxHash + '#' + onChainVkeyIndex);
console.log('cast-vote.ts hardcodes:      ', castVoteTxHash + '#' + castVoteIndex);
console.log('Same?', onChainVkeyTxHash === castVoteTxHash && onChainVkeyIndex === castVoteIndex);

// ── Fetch the actual on-chain vkey UTxO ──────────────────────────────────────
console.log('\nFetching on-chain vkey UTxO from Blockfrost...');
const res = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/txs/${onChainVkeyTxHash}/utxos`,
  { headers: { 'project_id': apiKey } }
);
const data: any = await res.json();
const output = data.outputs?.[onChainVkeyIndex];

if (!output) {
  console.log('ERROR: no output at index', onChainVkeyIndex);
  console.log('Total outputs:', data.outputs?.length);
  process.exit(1);
}

console.log('address:', output.address);
const hasDatum = output.inline_datum != null;
console.log('has inline_datum:', hasDatum);
if (hasDatum) {
  console.log('datum length (bytes):', output.inline_datum.length / 2);
  console.log('datum hex:', output.inline_datum);

  // Attempt to decode as SnarkVerificationKey: Constr 0 [nPublic, alpha, beta, gamma, delta, [], [IC]]
  try {
    const decoded = cbor.decodeFirstSync(Buffer.from(output.inline_datum, 'hex'));
    const fields = decoded.value;
    console.log('\nnPublic (field[0]):', fields[0]);
    console.log('vkAlpha length (bytes):', (fields[1] as Buffer).length);
    console.log('vkBeta  length (bytes):', (fields[2] as Buffer).length);
    console.log('vkGamma length (bytes):', (fields[3] as Buffer).length);
    console.log('vkDelta length (bytes):', (fields[4] as Buffer).length);
    console.log('vkIC    count:', (fields[6] as Buffer[]).length);
    console.log('\n→ This IS a SnarkVerificationKey datum.');
  } catch (e: any) {
    console.log('CBOR decode error:', e.message);
  }
} else {
  console.log('WARNING: output has no inline datum — cannot be a VKey UTxO!');
}

// ── Semaphore address tx history ─────────────────────────────────────────────
console.log('\n=== Semaphore address transaction history ===');
const histRes = await fetch(
  'https://cardano-preprod.blockfrost.io/api/v0/addresses/addr_test1wr0r03cellu3nvtgr87uk2wcdcwgsh92dh56g53cx9m4uegl0cz26/transactions?order=asc',
  { headers: { 'project_id': apiKey } }
);
const txs: any[] = await histRes.json();
txs.forEach(t => console.log(' ', t.tx_hash, ' block:', t.block_height));
console.log('Total txs:', txs.length);
