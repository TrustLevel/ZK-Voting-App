// Check the 2nd tx on the semaphore address to see if it was a vote or re-bootstrap
// Run: cd src/tx && API_KEY=preprod... tsx src/debug/vote/check-tx2.ts

import 'dotenv/config';
const apiKey = process.env.API_KEY || '';
if (!apiKey) throw new Error('API_KEY not set');

const semaphoreAddr = 'addr_test1wr0r03cellu3nvtgr87uk2wcdcwgsh92dh56g53cx9m4uegl0cz26';
const votingAddr    = 'addr_test1wp3veftrvs4x44hde9pu6jgqu9z8tcmhrq67ul44qc5mfms9902tf';

// tx2 = the tx that produced the current Semaphore UTxO with non-zero nullifier_mpf_root
const tx2 = 'f2f59247a79b11ebf59871097190e628073ab86287a613051465c1a8cf0158d1';

const res = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/txs/${tx2}/utxos`,
  { headers: { 'project_id': apiKey } }
);
const data: any = await res.json();

console.log('=== TX:', tx2, '===');
console.log('\n--- INPUTS ---');
for (const i of data.inputs) {
  const fromSemaphore = i.address === semaphoreAddr;
  const fromVoting    = i.address === votingAddr;
  console.log(`  ${i.tx_hash}#${i.output_index}`);
  console.log(`    address: ${i.address}`);
  if (fromSemaphore) console.log('    *** SEMAPHORE SCRIPT INPUT ***');
  if (fromVoting)    console.log('    *** VOTING SCRIPT INPUT ***');
}

console.log('\n--- OUTPUTS ---');
for (let i = 0; i < data.outputs.length; i++) {
  const o = data.outputs[i];
  const toSemaphore = o.address === semaphoreAddr;
  const toVoting    = o.address === votingAddr;
  console.log(`  [${i}] ${o.address}`);
  if (toSemaphore) console.log('    *** SEMAPHORE SCRIPT OUTPUT ***');
  if (toVoting)    console.log('    *** VOTING SCRIPT OUTPUT ***');
  if (o.inline_datum) {
    console.log('    inline_datum (first 64 chars):', o.inline_datum.slice(0, 64));
  }
}

// Check Voting address tx history
console.log('\n=== Voting address transaction history ===');
const histRes = await fetch(
  `https://cardano-preprod.blockfrost.io/api/v0/addresses/${votingAddr}/transactions?order=asc`,
  { headers: { 'project_id': apiKey } }
);
const vtxs: any[] = await histRes.json();
vtxs.forEach(t => console.log(' ', t.tx_hash, ' block:', t.block_height));
console.log('Total txs:', vtxs.length);
