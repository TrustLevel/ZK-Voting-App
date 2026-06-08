// Check if key UTxOs are still unspent on-chain
// Run: cd src/tx && API_KEY=preprod... tsx src/debug/vote/check-utxo-status.ts

import 'dotenv/config';
const apiKey = process.env.API_KEY || '';
if (!apiKey) throw new Error('API_KEY not set');

async function getOutputAddress(txHash: string, index: number): Promise<string | null> {
  const res = await fetch(
    `https://cardano-preprod.blockfrost.io/api/v0/txs/${txHash}/utxos`,
    { headers: { 'project_id': apiKey } }
  );
  const data: any = await res.json();
  return data.outputs?.[index]?.address ?? null;
}

async function checkUtxo(label: string, txHash: string, index: number) {
  const address = await getOutputAddress(txHash, index);
  if (!address) { console.log(`${label}: ERROR — output not found`); return; }

  // Fetch all current UTxOs at the address; check if this one is still there
  const res = await fetch(
    `https://cardano-preprod.blockfrost.io/api/v0/addresses/${address}/utxos?count=100`,
    { headers: { 'project_id': apiKey } }
  );
  const utxos: any[] = await res.json();

  const found = Array.isArray(utxos) && utxos.some(u => u.tx_hash === txHash && u.tx_index === index);
  console.log(`${label}: ${found ? 'UNSPENT ✓' : 'SPENT ✗'}`);
  console.log(`  address: ${address.slice(0, 60)}...`);
}

console.log('=== UTxO liveness check ===\n');

await checkUtxo(
  '3dc5c982...#0 (always-false VKey, CLAUDE.md/VKEY_REF constants)',
  '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083', 0
);

await checkUtxo(
  '10b5b3ca...#2 (vkey_ref in current on-chain SemaphoreDatum)',
  '10b5b3ca7cfad3da6d344138ff4361a5398acc19b41cc0382fcfc82e427581ae', 2
);

await checkUtxo(
  'f2f59247...#2 (VKey re-created as output [2] of the successful vote TX)',
  'f2f59247a79b11ebf59871097190e628073ab86287a613051465c1a8cf0158d1', 2
);
