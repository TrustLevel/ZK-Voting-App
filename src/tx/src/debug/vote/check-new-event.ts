// Check on-chain SemaphoreDatum for new event 1347743114
// Run: cd src/tx && API_KEY=preprod... tsx src/debug/vote/check-new-event.ts

import { createRequire } from 'module';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const cbor = require('cbor');

const apiKey = process.env.API_KEY || '';
if (!apiKey) throw new Error('API_KEY not set');

const semaphoreAddr = 'addr_test1wrptdudnmwjpmwwvv07ueatdatu9g5zt54jufrru6s5y44saxm7n8';
const semaphoreNft  = 'c2b6f1b3dba41db9cc63fdccf56deaf854504ba565c48c7cd4284ad6';

// Expected values from backend
const backendMerkleRoot = '35632686238999577966785466154003189654355401386946381996050240642721051780222';
const expectedVkeyHash  = '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083';
const expectedVkeyIndex = 0;

// 1. Fetch UTxOs at semaphore address
const utxoRes = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/addresses/${semaphoreAddr}/utxos`,
  { headers: { 'project_id': apiKey } }
);
if (!utxoRes.ok) throw new Error(`Blockfrost UTxO ${utxoRes.status}: ${await utxoRes.text()}`);
const utxos: any[] = await utxoRes.json();

console.log(`UTxOs at semaphore address: ${utxos.length}`);
const utxo = utxos.find(u => u.amount.some((a: any) => a.unit.startsWith(semaphoreNft)));
if (!utxo) {
  console.log('ERROR: Semaphore UTxO not found! Has bootstrap tx confirmed?');
  console.log('All UTxOs:', JSON.stringify(utxos.map(u => ({ tx: u.tx_hash, idx: u.tx_index, amounts: u.amount })), null, 2));
  process.exit(1);
}

console.log(`\nSemaphore UTxO: ${utxo.tx_hash}#${utxo.tx_index}`);

if (!utxo.inline_datum) {
  console.log('ERROR: UTxO has no inline datum!');
  process.exit(1);
}

const datumHex: string = utxo.inline_datum;
console.log(`Datum hex length (bytes): ${datumHex.length / 2}`);

// 2. Decode SemaphoreDatum = Constr 0 [group_token_policy, group_merke_root, nullifier_mpf_root, vkey_ref_input]
const decoded = cbor.decodeFirstSync(Buffer.from(datumHex, 'hex'));
const fields = decoded.value;

const groupTokenPolicy: string = (fields[0] as Buffer).toString('hex');
const groupMerkleRoot:  bigint = BigInt(fields[1]);
const nullifierMpfRoot: string = (fields[2] as Buffer).toString('hex');
const vkeyRefFields = fields[3].value;
const vkeyRefTxHash: string = (vkeyRefFields[0] as Buffer).toString('hex');
const vkeyRefIndex:  number = vkeyRefFields[1];

console.log('\n=== SemaphoreDatum (on-chain) ===');
console.log('group_token_policy  :', groupTokenPolicy);
console.log('group_merke_root    :', groupMerkleRoot.toString());
console.log('nullifier_mpf_root  :', nullifierMpfRoot);
console.log('vkey_ref_input.hash :', vkeyRefTxHash);
console.log('vkey_ref_input.index:', vkeyRefIndex);

console.log('\n=== Checks ===');
const merkleRootMatch = groupMerkleRoot.toString() === backendMerkleRoot;
console.log(`group_merke_root matches backend: ${merkleRootMatch}`);
if (!merkleRootMatch) {
  console.log(`  backend says: ${backendMerkleRoot}`);
  console.log(`  on-chain has: ${groupMerkleRoot.toString()}`);
  console.log('  → MISMATCH: ZK proof will fail (wrong merkle root)!');
}

const nullIsZero = nullifierMpfRoot === '0'.repeat(64);
console.log(`nullifier_mpf_root is all-zeros (no votes yet): ${nullIsZero}`);
if (!nullIsZero) {
  console.log(`  nullifier_mpf_root: ${nullifierMpfRoot}`);
}

const vkeyMatch = vkeyRefTxHash === expectedVkeyHash && vkeyRefIndex === expectedVkeyIndex;
console.log(`vkey_ref_input matches hardcoded constant: ${vkeyMatch}`);
if (!vkeyMatch) {
  console.log(`  expected: ${expectedVkeyHash}#${expectedVkeyIndex}`);
  console.log(`  on-chain: ${vkeyRefTxHash}#${vkeyRefIndex}`);
}

// 3. Check if vkey_ref UTxO is still unspent
console.log('\n=== VKey UTxO liveness ===');
const vkeyAddr = 'addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8';
const vkeyUtxoRes = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/addresses/${vkeyAddr}/utxos?count=100`,
  { headers: { 'project_id': apiKey } }
);
const vkeyUtxos: any[] = await vkeyUtxoRes.json();
const vkeyFound = Array.isArray(vkeyUtxos) && vkeyUtxos.some(
  u => u.tx_hash === expectedVkeyHash && u.tx_index === expectedVkeyIndex
);
console.log(`3dc5c982...#0 (always-false VKey): ${vkeyFound ? 'UNSPENT ✓' : 'SPENT ✗'}`);

// 4. Fetch tx history for the new semaphore address
console.log('\n=== Semaphore address tx history ===');
const histRes = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/addresses/${semaphoreAddr}/transactions?order=asc`,
  { headers: { 'project_id': apiKey } }
);
const txs: any[] = await histRes.json();
txs.forEach(t => console.log(`  ${t.tx_hash}  block: ${t.block_height}`));
console.log(`Total txs: ${txs.length}`);
