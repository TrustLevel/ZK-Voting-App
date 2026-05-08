import { UTxO, integer, list, conStr, byteString } from "@meshsdk/core";

// Browser-safe utilities — no Node.js APIs (no fs, no MeshWallet).
// utils.ts re-exports everything here for Node.js callers, keeping backward compat.

export function textToHex(text: string): string {
  return Array.from(text)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

export function createGroupDatum(merkleRoot: bigint | number, adminPkh: string): any {
  if (BigInt(merkleRoot) < 0n) throw new Error('Merkle root must be non-negative');
  if (!adminPkh || adminPkh.length !== 56) throw new Error('Admin PKH must be a 56-character hex string');
  return conStr(0, [integer(merkleRoot), byteString(adminPkh)]);
}

export function generateInitialOptions(numOptions: number): any[] {
  if (numOptions < 2) throw new Error('Minimum 2 options required');
  return Array.from({ length: numOptions }, (_, i) => list([integer(i), integer(0)]));
}

export function selectUtxoAndCreateOutputReference(
  walletUtxos: UTxO[],
  index = 0,
): { selectedUtxo: UTxO; outputReference: any } {
  if (!walletUtxos || walletUtxos.length === 0) throw new Error('No UTxOs available in wallet');
  if (index < 0 || index >= walletUtxos.length) throw new Error(`Invalid UTxO index: ${index}`);
  const selectedUtxo = walletUtxos[index];
  return {
    selectedUtxo,
    outputReference: createOutputReference(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex),
  };
}

export function createOutputReference(txHash: string, outputIndex: number): any {
  if (!txHash || txHash.length !== 64) {
    throw new Error('Transaction hash must be a 64-character hex string');
  }
  if (outputIndex < 0) {
    throw new Error('Output index must be non-negative');
  }
  return {
    constructor: 0,
    fields: [{ bytes: txHash }, { int: outputIndex }],
  };
}

export function createUrnaDatum(params: {
  weight: number;
  options: any[];
  eventStart: number;
  eventEnd: number;
  semaphoreNftPolicyId: string;
}): any {
  const { weight, options, eventStart, eventEnd, semaphoreNftPolicyId } = params;
  if (weight < 0) throw new Error('Weight must be non-negative');
  if (!options || options.length < 2) throw new Error('Must have at least 2 options');
  if (eventEnd <= eventStart) throw new Error('Event end must be after start');
  if (!semaphoreNftPolicyId || semaphoreNftPolicyId.length !== 56)
    throw new Error('Semaphore NFT policy ID must be 56 hex chars');

  return conStr(0, [
    integer(weight),
    list(options),
    list([integer(eventStart), integer(eventEnd)]),
    byteString(semaphoreNftPolicyId),
  ]);
}

export function selectUtxoForCollateral(walletUtxos: UTxO[], minLovelace = 5000000): UTxO | undefined {
  return walletUtxos.find(u =>
    u.output.amount.length === 1 &&
    u.output.amount[0].unit === 'lovelace' &&
    parseInt(u.output.amount[0].quantity) >= minLovelace
  );
}
