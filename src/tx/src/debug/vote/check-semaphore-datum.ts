// Fetch and decode the current SemaphoreDatum from the semaphore script address.
// Run: cd src/tx && API_KEY=preprod... tsx src/debug/vote/check-semaphore-datum.ts

import { createRequire } from 'module';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const cbor = require('cbor');

const apiKey = process.env.API_KEY || '';
if (!apiKey) throw new Error('API_KEY not set');

// From cast-vote.ts
const semaphoreScriptAddress = "addr_test1wr0r03cellu3nvtgr87uk2wcdcwgsh92dh56g53cx9m4uegl0cz26";
const semaphoreNftPolicyId   = "de37c719fff919b16819fdcb29d86e1c885caa6de9a4523831775e65";

const url = `https://cardano-preprod.blockfrost.io/api/v0/addresses/${semaphoreScriptAddress}/utxos`;
const res = await fetch(url, { headers: { 'project_id': apiKey } });
if (!res.ok) throw new Error(`Blockfrost ${res.status}: ${await res.text()}`);

const utxos: any[] = await res.json();
const utxo = utxos.find(u => u.amount.some((a: any) => a.unit.startsWith(semaphoreNftPolicyId)));
if (!utxo) throw new Error('Semaphore UTxO not found');

console.log('Semaphore UTxO:', utxo.tx_hash, '#', utxo.tx_index);

const datumHex: string = utxo.inline_datum;
console.log('Datum hex length (bytes):', datumHex.length / 2);
console.log('Datum hex:', datumHex);

// SemaphoreDatum = Constr 0 [group_token_policy, group_merke_root, nullifier_mpf_root, vkey_ref_input]
// vkey_ref_input = Constr 0 [tx_hash_bytes, output_index]
const decoded = cbor.decodeFirstSync(Buffer.from(datumHex, 'hex'));
const fields = decoded.value;

const groupTokenPolicy:   string = (fields[0] as Buffer).toString('hex');
const groupMerkleRoot:    bigint = BigInt(fields[1]);
const nullifierMpfRoot:   string = (fields[2] as Buffer).toString('hex');
// fields[3] = vkey_ref_input (Constr 0 [tx_id_bytes, index])
const vkeyRefFields = fields[3].value;
const vkeyRefTxHash:  string = (vkeyRefFields[0] as Buffer).toString('hex');
const vkeyRefIndex:   number = vkeyRefFields[1];

console.log('\n=== SemaphoreDatum (on-chain) ===');
console.log('group_token_policy  :', groupTokenPolicy);
console.log('group_merke_root    :', groupMerkleRoot.toString());
console.log('nullifier_mpf_root  :', nullifierMpfRoot);
console.log('vkey_ref_input.hash :', vkeyRefTxHash);
console.log('vkey_ref_input.index:', vkeyRefIndex);

console.log('\n=== Checks ===');
const expectedNullRoot = '0'.repeat(64);
console.log('nullifier_mpf_root is all-zeros (empty trie):', nullifierMpfRoot === expectedNullRoot);
console.log('vkey_ref matches hardcoded constant:',
  vkeyRefTxHash === '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083' &&
  vkeyRefIndex === 0
);

console.log('\n=== Expected from cast-vote.ts ===');
const castVoteGroupMerkleRoot = 23030474717815918442389680005443364297749425152559009643391469983686590934097n;
console.log('groupMerkleRoot matches cast-vote.ts hardcoded value:',
  groupMerkleRoot === castVoteGroupMerkleRoot
);
if (groupMerkleRoot !== castVoteGroupMerkleRoot) {
  console.log('  cast-vote.ts uses:', castVoteGroupMerkleRoot.toString());
  console.log('  on-chain has:     ', groupMerkleRoot.toString());
  console.log('  → MISMATCH: proof was generated with wrong merkle root!');
}
