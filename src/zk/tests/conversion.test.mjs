import assert from 'assert';
import { compressedG1, compressedG2, decompressG1, decompressG2 } from '../dist/conversion.js';

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

console.log('\nconversion.ts — roundtrip tests\n');

// A known valid G1 point on BLS12-381 (the generator)
const G1_GENERATOR = [
  '3685416753713387016781088315183077757961620795782546409894578378688607592378376318836054947676345821548104185464507',
  '1339506544944476473020471379941921221584933875938349620426543736416511423956333506472724655353366534992391756441569',
  '1'
];

// A known valid G2 point on BLS12-381 (the generator)
const G2_GENERATOR = [
  [
    '352701069587466618187139116011060144890029952792775240219908644239793785735715026873347600343865175952761926303160',
    '3059144344244213709971259814753781636986470325476647558659373206291635324768958432433509563104347017837885763365758',
  ],
  [
    '1985150602287291935568054521177171638300868978215655730859378665066344726373823718423869104263333984641494340347905',
    '927553665492332455747201965776037880757740193453592970025027978793976877002675564980949289727957565575433344219582',
  ],
  ['1', '0']
];

await test('G1 roundtrip: compress then decompress equals original point', async () => {
  const compressed = await compressedG1(G1_GENERATOR);
  const decompressed = await decompressG1(compressed);

  assert.strictEqual(decompressed[0], G1_GENERATOR[0], 'x coordinate mismatch');
  assert.strictEqual(decompressed[1], G1_GENERATOR[1], 'y coordinate mismatch');
  assert.strictEqual(decompressed[2], '1',              'z coordinate mismatch');
});

await test('G2 roundtrip: compress then decompress equals original point', async () => {
  const compressed = await compressedG2(G2_GENERATOR);
  const decompressed = await decompressG2(compressed);

  assert.strictEqual(decompressed[0][0], G2_GENERATOR[0][0], 'x[0] mismatch');
  assert.strictEqual(decompressed[0][1], G2_GENERATOR[0][1], 'x[1] mismatch');
  assert.strictEqual(decompressed[1][0], G2_GENERATOR[1][0], 'y[0] mismatch');
  assert.strictEqual(decompressed[1][1], G2_GENERATOR[1][1], 'y[1] mismatch');
});

await test('G1 compressed output is 96 hex chars (48 bytes)', async () => {
  const compressed = await compressedG1(G1_GENERATOR);
  assert.strictEqual(compressed.length, 96, `expected 96 chars, got ${compressed.length}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
