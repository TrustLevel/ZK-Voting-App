/**
 * Network helpers for the frontend. An event lives on one Cardano network
 * (chosen at creation); the backend reports which networks it serves via
 * GET /voting-event/networks.
 */

import type { IWallet } from '@meshsdk/core';

export type CardanoNetwork = 'mainnet' | 'preprod';

export const NETWORK_LABEL: Record<CardanoNetwork, string> = {
  mainnet: 'Mainnet',
  preprod: 'Preprod testnet',
};

/** CIP-30 network id: 1 = mainnet, 0 = any testnet. */
export const NETWORK_ID: Record<CardanoNetwork, 0 | 1> = { mainnet: 1, preprod: 0 };

export const EXPLORER_BASE_URL: Record<CardanoNetwork, string> = {
  mainnet: 'https://cardanoscan.io',
  preprod: 'https://preprod.cardanoscan.io',
};

export function isCardanoNetwork(value: unknown): value is CardanoNetwork {
  return value === 'mainnet' || value === 'preprod';
}

export function asNetwork(value: unknown): CardanoNetwork {
  return isCardanoNetwork(value) ? value : 'preprod';
}

export function explorerTxUrl(network: CardanoNetwork, txHash: string): string {
  return `${EXPLORER_BASE_URL[network]}/transaction/${txHash}`;
}

export function lovelaceToAda(lovelace: string | number | bigint): string {
  const n = Number(BigInt(lovelace)) / 1_000_000;
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/**
 * Blockfrost key for the organiser's mint flow (the only place the browser still
 * talks to Blockfrost directly). NEXT_PUBLIC_BLOCKFROST_API_KEY stays the Preprod
 * key; Mainnet needs NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET. Both are inlined at
 * build time, so they must be read as literal property accesses.
 */
export function blockfrostKeyFor(network: CardanoNetwork): string | undefined {
  if (network === 'mainnet') return process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET || undefined;
  return process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY_PREPROD || process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY || undefined;
}

export function blockfrostKeyEnvName(network: CardanoNetwork): string {
  return network === 'mainnet' ? 'NEXT_PUBLIC_BLOCKFROST_API_KEY_MAINNET' : 'NEXT_PUBLIC_BLOCKFROST_API_KEY';
}

export interface NetworkInfo {
  network: CardanoNetwork;
  enabled: boolean;
  networkId: 0 | 1;
  relayAddress: string | null;
  feeDepositRequired: boolean;
  feePerVoteLovelace: string;
  vkeyRef: { txHash: string; outputIndex: number } | null;
  explorerBaseUrl: string;
}

export async function fetchNetworks(backendApiUrl: string): Promise<NetworkInfo[]> {
  const res = await fetch(`${backendApiUrl}/voting-event/networks`);
  if (!res.ok) throw new Error(`Failed to load networks (${res.status})`);
  return res.json();
}

/**
 * Refuses a CIP-30 wallet that is connected to the wrong network. Wallets expose
 * getNetworkId() (1 = mainnet, 0 = testnet); the error names both sides.
 */
export async function assertWalletNetwork(wallet: IWallet, network: CardanoNetwork): Promise<void> {
  const walletNetworkId = await wallet.getNetworkId();
  if (walletNetworkId !== NETWORK_ID[network]) {
    const walletLabel = walletNetworkId === 1 ? 'Mainnet' : 'a testnet (Preprod/Preview)';
    throw new Error(
      `Your wallet is connected to ${walletLabel}, but this event is on ${NETWORK_LABEL[network]}. ` +
      `Switch the wallet to ${NETWORK_LABEL[network]} and reconnect.`,
    );
  }
}
