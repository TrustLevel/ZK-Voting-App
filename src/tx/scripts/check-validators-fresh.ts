#!/usr/bin/env tsx
/**
 * Check if validators.ts is up-to-date with plutus.json files
 * Exits with error if validators are stale
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VALIDATORS_FILE = path.resolve(__dirname, '../src/validators.ts');
const PLUTUS_FILES = [
  'src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json',
  'src/on-chain/plutus.json'
];

function computeFileHash(filePath: string): string {
  const projectRoot = path.resolve(__dirname, '../../..');
  const fullPath = path.join(projectRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    return '';
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getCurrentHashes(): Record<string, string> {
  const projectRoot = path.resolve(__dirname, '../../..');

  return {
    group: computeFileHash('src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json'),
    semaphore: computeFileHash('src/on-chain/build/packages/modulo-p-cardano-semaphore/plutus.json'),
    voting: computeFileHash('src/on-chain/plutus.json')
  };
}

function getStoredHashes(): Record<string, string> | null {
  if (!fs.existsSync(VALIDATORS_FILE)) {
    return null;
  }

  const content = fs.readFileSync(VALIDATORS_FILE, 'utf-8');

  // Extract sourceHashes from the _metadata object
  const match = content.match(/"sourceHashes":\s*({[^}]+})/s);
  if (!match) {
    return null;
  }

  try {
    // Parse the extracted JSON object
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function main() {
  console.log('🔍 Checking validator freshness...\n');

  // Check if validators.ts exists
  if (!fs.existsSync(VALIDATORS_FILE)) {
    console.log('⚠️  validators.ts not found');
    console.log('   Running extract-validators...\n');

    try {
      execSync('npm run extract-validators', { stdio: 'inherit' });
      console.log('\n✅ Validators extracted successfully');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Failed to extract validators');
      process.exit(1);
    }
  }

  // Get current hashes from plutus.json files
  const currentHashes = getCurrentHashes();

  // Get stored hashes from validators.ts
  const storedHashes = getStoredHashes();

  if (!storedHashes) {
    console.log('⚠️  Could not read stored hashes from validators.ts');
    console.log('   File may be corrupted or in old format');
    console.log('   Running extract-validators...\n');

    try {
      execSync('npm run extract-validators', { stdio: 'inherit' });
      console.log('\n✅ Validators extracted successfully');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Failed to extract validators');
      process.exit(1);
    }
  }

  // Compare hashes
  const staleValidators: string[] = [];

  for (const [name, currentHash] of Object.entries(currentHashes)) {
    const storedHash = storedHashes[name];

    if (currentHash !== storedHash) {
      staleValidators.push(name);
    }
  }

  if (staleValidators.length > 0) {
    console.log('❌ Stale validators detected!\n');
    console.log('The following validators have been modified:\n');

    staleValidators.forEach(name => {
      console.log(`   - ${name}`);
      console.log(`     Current:  ${currentHashes[name].substring(0, 16)}...`);
      console.log(`     Stored:   ${storedHashes[name].substring(0, 16)}...`);
    });

    console.log('\n💡 To fix:');
    console.log('   1. Run: aiken build');
    console.log('   2. Run: npm run extract-validators\n');

    // Auto-fix if AUTO_FIX environment variable is set
    if (process.env.AUTO_FIX === 'true') {
      console.log('🔧 AUTO_FIX enabled, running extract-validators...\n');

      try {
        execSync('npm run extract-validators', { stdio: 'inherit' });
        console.log('\n✅ Validators extracted successfully');
        process.exit(0);
      } catch (error) {
        console.error('\n❌ Failed to extract validators');
        process.exit(1);
      }
    }

    process.exit(1);
  }

  console.log('✅ All validators are up-to-date\n');

  // Show validator info
  const validatorsContent = fs.readFileSync(VALIDATORS_FILE, 'utf-8');
  const generatedMatch = validatorsContent.match(/Generated:\s*(.+)/);

  if (generatedMatch) {
    console.log(`   Last generated: ${generatedMatch[1]}`);
  }

  console.log('   Validators checked:');
  Object.keys(currentHashes).forEach(name => {
    console.log(`     - ${name}`);
  });

  process.exit(0);
}

main();
