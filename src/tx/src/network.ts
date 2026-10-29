/**
 * Per-network constants for the transaction builders.
 *
 * Browser-safe (no Node.js APIs). Every builder takes a `network` parameter
 * that selects the entries below; the default is 'preprod', which keeps the
 * tested Preprod path byte-identical.
 */

export type CardanoNetwork = 'mainnet' | 'preprod';

export const CARDANO_NETWORKS: readonly CardanoNetwork[] = ['mainnet', 'preprod'] as const;

export function isCardanoNetwork(value: unknown): value is CardanoNetwork {
  return value === 'mainnet' || value === 'preprod';
}

/** CIP-30 / MeshWallet network id: 1 = mainnet, 0 = any testnet. */
export const NETWORK_ID: Record<CardanoNetwork, 0 | 1> = {
  mainnet: 1,
  preprod: 0,
};

/**
 * Slot configuration (Shelley start) per network — the same values MeshSDK
 * uses in resolveSlotNo(). zeroTime is in POSIX seconds, one slot = 1 second.
 */
export const SLOT_CONFIG: Record<CardanoNetwork, { zeroTime: number; zeroSlot: number }> = {
  mainnet: { zeroTime: 1596059091, zeroSlot: 4492800 },
  preprod: { zeroTime: 1655769600, zeroSlot: 86400 },
};

/** POSIX milliseconds → absolute slot number on the given network. */
export function posixMsToSlot(network: CardanoNetwork, posixMs: number): number {
  const { zeroTime, zeroSlot } = SLOT_CONFIG[network];
  return Math.floor(posixMs / 1000) - zeroTime + zeroSlot;
}

export interface OutputRef {
  txHash: string;
  outputIndex: number;
}

/**
 * VKey reference UTxO per network: holds the Groth16 verification key datum,
 * permanently locked at the always-false script address, used as a read-only
 * reference input on every vote tx and stored in SemaphoreDatum.vkey_ref_input
 * at mint time. Deployed once per network (see scripts/deploy-vkey.ts).
 *
 * Mainnet: filled in after the one-off deployment; until then the backend can
 * supply it via the VKEY_REF_MAINNET environment variable.
 */
export const VKEY_REF: Record<CardanoNetwork, OutputRef | null> = {
  preprod: { txHash: '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083', outputIndex: 0 },
  mainnet: null,
};

/** Returns the VKey reference UTxO for the network, or throws when it is not deployed yet. */
export function vkeyRefFor(network: CardanoNetwork, override?: OutputRef | null): OutputRef {
  const ref = override ?? VKEY_REF[network];
  if (!ref) throw new Error(`VKey reference UTxO for ${network} is not deployed yet`);
  return ref;
}

/**
 * Always-false script (always_false.always_false.else in src/on-chain/plutus.json,
 * compiledCode 5101010023259800a508a4d136564004ae69). A UTxO sent here can never be
 * spent — this is where the VKey UTxO is locked on each network. The payment
 * credential is the script hash as MeshSDK computes it (resolveScriptHash of the
 * CBOR-wrapped code), which is what the Preprod VKey address was derived from;
 * plutus.json lists a different hash (7b21efdd…) for the unwrapped code.
 */
export const ALWAYS_FALSE_SCRIPT_HASH = 'be5ab5bca183f1f8274d29f6acd263b5800217a7a56955936b9775d9';
export const ALWAYS_FALSE_ADDRESS: Record<CardanoNetwork, string> = {
  mainnet: 'addr1wxl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgkx740z',
  preprod: 'addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8',
};

/** Blockfrost REST base URL per network (project keys are network-specific). */
export const BLOCKFROST_BASE_URL: Record<CardanoNetwork, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
};

/** Cardanoscan explorer base URL per network. */
export const EXPLORER_BASE_URL: Record<CardanoNetwork, string> = {
  mainnet: 'https://cardanoscan.io',
  preprod: 'https://preprod.cardanoscan.io',
};

export function explorerTxUrl(network: CardanoNetwork, txHash: string): string {
  return `${EXPLORER_BASE_URL[network]}/transaction/${txHash}`;
}
