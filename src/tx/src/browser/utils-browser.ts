import { UTxO, integer, list, conStr, byteString } from "@meshsdk/core";

// Browser-safe utilities — no Node.js APIs (no fs, no MeshWallet).
// utils.ts re-exports everything here for Node.js callers, keeping backward compat.

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
