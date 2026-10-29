/**
 * network.ts — per-network constants
 *
 * Checks that the slot configuration matches MeshSDK's resolveSlotNo for both
 * networks, that the always-false address is derived from the same script hash
 * on both networks, and that the Preprod VKey constants are unchanged.
 *
 * Run with: node tests/network.test.mjs
 */

import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveSlotNo, resolvePlutusScriptAddress, deserializeAddress } = require('@meshsdk/core');

import {
  NETWORK_ID,
  SLOT_CONFIG,
  posixMsToSlot,
  VKEY_REF,
  vkeyRefFor,
  ALWAYS_FALSE_ADDRESS,
  ALWAYS_FALSE_SCRIPT_HASH,
  BLOCKFROST_BASE_URL,
  explorerTxUrl,
  isCardanoNetwork,
  VKEY_REF_TX_HASH,
  VKEY_REF_OUTPUT_INDEX,
} from '../dist/browser/index.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log('\nnetwork.ts — per-network constants\n');

await test('network ids are 1 for mainnet and 0 for preprod', () => {
  assert.strictEqual(NETWORK_ID.mainnet, 1);
  assert.strictEqual(NETWORK_ID.preprod, 0);
});

await test('posixMsToSlot matches MeshSDK resolveSlotNo on both networks', () => {
  for (const ms of [1_700_000_000_000, 1_770_000_000_000, 1_790_000_000_123, Date.now()]) {
    assert.strictEqual(posixMsToSlot('preprod', ms), Number(resolveSlotNo('preprod', ms)), `preprod @ ${ms}`);
    assert.strictEqual(posixMsToSlot('mainnet', ms), Number(resolveSlotNo('mainnet', ms)), `mainnet @ ${ms}`);
  }
});

await test('preprod slot formula is the one the builders used before (1655769600 / 86400)', () => {
  const ms = 1_770_000_000_000;
  const legacy = Math.floor(ms / 1000) - 1655769600 + 86400;
  assert.strictEqual(posixMsToSlot('preprod', ms), legacy);
  assert.deepStrictEqual(SLOT_CONFIG.preprod, { zeroTime: 1655769600, zeroSlot: 86400 });
  assert.deepStrictEqual(SLOT_CONFIG.mainnet, { zeroTime: 1596059091, zeroSlot: 4492800 });
});

await test('Preprod VKey reference UTxO is unchanged and exported under the legacy names', () => {
  assert.strictEqual(VKEY_REF.preprod.txHash, '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083');
  assert.strictEqual(VKEY_REF.preprod.outputIndex, 0);
  assert.strictEqual(VKEY_REF_TX_HASH, VKEY_REF.preprod.txHash);
  assert.strictEqual(VKEY_REF_OUTPUT_INDEX, 0);
  assert.deepStrictEqual(vkeyRefFor('preprod'), VKEY_REF.preprod);
});

await test('vkeyRefFor throws for mainnet until the UTxO is deployed, and accepts an override', () => {
  if (VKEY_REF.mainnet === null) {
    assert.throws(() => vkeyRefFor('mainnet'), /not deployed/);
  }
  const override = { txHash: 'f'.repeat(64), outputIndex: 2 };
  assert.deepStrictEqual(vkeyRefFor('mainnet', override), override);
  assert.deepStrictEqual(vkeyRefFor('preprod', override), override);
});

await test('always-false addresses on both networks derive from the same script hash', () => {
  const code = '5101010023259800a508a4d136564004ae69'; // always_false.always_false.else compiledCode
  assert.strictEqual(resolvePlutusScriptAddress({ code, version: 'V3' }, 0), ALWAYS_FALSE_ADDRESS.preprod);
  assert.strictEqual(resolvePlutusScriptAddress({ code, version: 'V3' }, 1), ALWAYS_FALSE_ADDRESS.mainnet);
  assert.strictEqual(deserializeAddress(ALWAYS_FALSE_ADDRESS.preprod).scriptHash, ALWAYS_FALSE_SCRIPT_HASH);
  assert.strictEqual(deserializeAddress(ALWAYS_FALSE_ADDRESS.mainnet).scriptHash, ALWAYS_FALSE_SCRIPT_HASH);
  assert.ok(ALWAYS_FALSE_ADDRESS.mainnet.startsWith('addr1w'));
  assert.ok(ALWAYS_FALSE_ADDRESS.preprod.startsWith('addr_test1w'));
});

await test('Blockfrost and explorer URLs follow the network', () => {
  assert.strictEqual(BLOCKFROST_BASE_URL.preprod, 'https://cardano-preprod.blockfrost.io/api/v0');
  assert.strictEqual(BLOCKFROST_BASE_URL.mainnet, 'https://cardano-mainnet.blockfrost.io/api/v0');
  assert.strictEqual(explorerTxUrl('preprod', 'ab'), 'https://preprod.cardanoscan.io/transaction/ab');
  assert.strictEqual(explorerTxUrl('mainnet', 'ab'), 'https://cardanoscan.io/transaction/ab');
});

await test('isCardanoNetwork accepts only the two networks', () => {
  assert.ok(isCardanoNetwork('mainnet'));
  assert.ok(isCardanoNetwork('preprod'));
  assert.ok(!isCardanoNetwork('preview'));
  assert.ok(!isCardanoNetwork(undefined));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
