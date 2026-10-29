/**
 * Verify a VKey reference UTxO on a network: the UTxO must be unspent at the
 * always-false address and its inline datum must equal the compressed
 * verification_key.json the prover uses.
 *
 * Usage (from src/tx):
 *   NETWORK=preprod API_KEY=preprod... npx tsx scripts/verify-vkey.ts            # checks VKEY_REF.preprod
 *   NETWORK=mainnet API_KEY=mainnet... npx tsx scripts/verify-vkey.ts <txhash>#0 # checks a given UTxO
 *
 * Exit code 0 = all fields match, 1 = mismatch or not found.
 */

import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { compressedG1, compressedG2 } from '@src/zk';
import { ALWAYS_FALSE_ADDRESS, BLOCKFROST_BASE_URL, VKEY_REF, isCardanoNetwork } from '../src/network.js';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const cbor = require('cbor');

const network = process.env.NETWORK ?? '';
if (!isCardanoNetwork(network)) throw new Error('NETWORK must be "mainnet" or "preprod"');
const apiKey = process.env.API_KEY ?? '';
if (!apiKey) throw new Error('API_KEY (Blockfrost project id) not set');

const arg = process.argv[2];
let txHash: string;
let outputIndex: number;
if (arg) {
  const [h, i] = arg.split('#');
  if (!/^[0-9a-f]{64}$/i.test(h ?? '')) throw new Error('Expected <txhash>#<index>');
  txHash = h;
  outputIndex = parseInt(i ?? '0', 10);
} else {
  const ref = VKEY_REF[network];
  if (!ref) throw new Error(`No VKey UTxO configured for ${network}; pass <txhash>#<index>`);
  txHash = ref.txHash;
  outputIndex = ref.outputIndex;
}

console.log(`Network: ${network}`);
console.log(`VKey UTxO: ${txHash}#${outputIndex}`);

// ── Expected values ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const vkeyPath = resolve(__dirname, '../../zk/keys/verification_key.json');
const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8'));
const expected = {
  nPublic: vkey.nPublic as number,
  alpha: await compressedG1(vkey.vk_alpha_1),
  beta: await compressedG2(vkey.vk_beta_2),
  gamma: await compressedG2(vkey.vk_gamma_2),
  delta: await compressedG2(vkey.vk_delta_2),
  ic: (await Promise.all(vkey.IC.map((p: any) => compressedG1(p)))) as string[],
};

// ── On-chain output ──────────────────────────────────────────────────────────
const headers = { project_id: apiKey };
const txRes = await fetch(`${BLOCKFROST_BASE_URL[network]}/txs/${txHash}/utxos`, { headers });
if (!txRes.ok) throw new Error(`Blockfrost ${txRes.status} for tx ${txHash}: ${await txRes.text()}`);
const txUtxos: any = await txRes.json();
const output = txUtxos.outputs?.find((o: any) => o.output_index === outputIndex);
if (!output) throw new Error(`No output #${outputIndex} in tx ${txHash}`);

let ok = true;
const check = (label: string, pass: boolean, detail = '') => {
  console.log(`  ${pass ? 'MATCH   ' : 'MISMATCH'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!pass) ok = false;
};

check('locked at the always-false address', output.address === ALWAYS_FALSE_ADDRESS[network], output.address);

const addrRes = await fetch(`${BLOCKFROST_BASE_URL[network]}/addresses/${ALWAYS_FALSE_ADDRESS[network]}/utxos?count=100`, { headers });
const addrUtxos: any[] = addrRes.ok ? await addrRes.json() : [];
check('still unspent', addrUtxos.some(u => u.tx_hash === txHash && u.output_index === outputIndex));

const inlineDatumHex: string | null = output.inline_datum;
check('has an inline datum', !!inlineDatumHex);
if (inlineDatumHex) {
  const decoded = cbor.decodeFirstSync(Buffer.from(inlineDatumHex, 'hex'));
  const fields: any[] = decoded.value;
  const hex = (b: Buffer) => b.toString('hex');
  check('nPublic', fields[0] === expected.nPublic, `${fields[0]} vs ${expected.nPublic}`);
  check('vkAlpha', hex(fields[1]) === expected.alpha);
  check('vkBeta', hex(fields[2]) === expected.beta);
  check('vkGamma', hex(fields[3]) === expected.gamma);
  check('vkDelta', hex(fields[4]) === expected.delta);
  const ic: string[] = (fields[6] ?? []).map(hex);
  check('vkIC length', ic.length === expected.ic.length, `${ic.length} vs ${expected.ic.length}`);
  expected.ic.forEach((v, i) => check(`vkIC[${i}]`, ic[i] === v));
}

console.log(ok ? '\nOK — the VKey UTxO matches verification_key.json and is unspent.' : '\nFAILED — see mismatches above.');
process.exit(ok ? 0 : 1);
