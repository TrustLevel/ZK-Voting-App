import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Per-network configuration. One backend serves Mainnet and Preprod side by side;
 * every event carries its network and every Blockfrost call, relay wallet and
 * transaction builder is selected through this class.
 *
 * Environment variables (see deploy/.env.example):
 *   BLOCKFROST_API_KEY_MAINNET / BLOCKFROST_API_KEY_PREPROD
 *     — BLOCKFROST_API_KEY is the fallback for Preprod only (keeps the current deploy working)
 *   RELAY_WALLET_MNEMONIC_MAINNET / RELAY_WALLET_MNEMONIC_PREPROD
 *     — RELAY_WALLET_MNEMONIC is the fallback for Preprod only
 *   VKEY_REF_MAINNET / VKEY_REF_PREPROD = <txhash>#<index>
 *     — optional override of the VKey reference UTxO constants (src/tx/src/network.ts)
 *   FEE_DEPOSIT_NETWORKS = comma-separated networks on which the organiser must prepay
 *     the vote fees (default: mainnet)
 *
 * A network is "enabled" when it has a Blockfrost key, a relay mnemonic and a VKey
 * reference UTxO. Events can only be created on enabled networks.
 */

export type CardanoNetwork = 'mainnet' | 'preprod';
export const CARDANO_NETWORKS: readonly CardanoNetwork[] = ['mainnet', 'preprod'];

export function isCardanoNetwork(value: unknown): value is CardanoNetwork {
  return value === 'mainnet' || value === 'preprod';
}

/** CIP-30 / MeshWallet network id. */
export const NETWORK_ID: Record<CardanoNetwork, 0 | 1> = { mainnet: 1, preprod: 0 };

export const BLOCKFROST_BASE_URL: Record<CardanoNetwork, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
};

export const EXPLORER_BASE_URL: Record<CardanoNetwork, string> = {
  mainnet: 'https://cardanoscan.io',
  preprod: 'https://preprod.cardanoscan.io',
};

export interface OutputRef {
  txHash: string;
  outputIndex: number;
}

// Must match VKEY_REF in src/tx/src/network.ts (the builders fall back to those
// constants; the backend passes the value explicitly so both always agree).
export const DEFAULT_VKEY_REF: Record<CardanoNetwork, OutputRef | null> = {
  preprod: { txHash: '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083', outputIndex: 0 },
  mainnet: null,
};

/**
 * Fee the organiser prepays per registered voter on fee-deposit networks.
 * Measured vote tx fee on Preprod: 1.07–1.09 ADA (docs/M4_TEST_REPORT.md);
 * 1.3 ADA leaves headroom for deeper MPF proofs in larger groups.
 */
export const FEE_PER_VOTE_LOVELACE = 1_300_000n;

export interface NetworkInfo {
  network: CardanoNetwork;
  enabled: boolean;
  networkId: 0 | 1;
  relayAddress: string | null;
  feeDepositRequired: boolean;
  feePerVoteLovelace: string;
  vkeyRef: OutputRef | null;
  explorerBaseUrl: string;
}

@Injectable()
export class NetworkConfig {
  private readonly relayAddressCache = new Map<CardanoNetwork, string>();

  constructor(private readonly configService: ConfigService) {}

  private env(name: string): string | null {
    const value = this.configService.get<string>(name);
    return value && value.trim() !== '' ? value.trim() : null;
  }

  blockfrostApiKey(network: CardanoNetwork): string | null {
    if (network === 'preprod') return this.env('BLOCKFROST_API_KEY_PREPROD') ?? this.env('BLOCKFROST_API_KEY');
    return this.env('BLOCKFROST_API_KEY_MAINNET');
  }

  blockfrostBaseUrl(network: CardanoNetwork): string {
    return BLOCKFROST_BASE_URL[network];
  }

  relayMnemonic(network: CardanoNetwork): string | null {
    if (network === 'preprod') return this.env('RELAY_WALLET_MNEMONIC_PREPROD') ?? this.env('RELAY_WALLET_MNEMONIC');
    return this.env('RELAY_WALLET_MNEMONIC_MAINNET');
  }

  networkId(network: CardanoNetwork): 0 | 1 {
    return NETWORK_ID[network];
  }

  vkeyRef(network: CardanoNetwork): OutputRef | null {
    const raw = this.env(`VKEY_REF_${network.toUpperCase()}`);
    if (raw) {
      const match = raw.match(/^([0-9a-fA-F]{64})#(\d+)$/);
      if (!match) throw new Error(`VKEY_REF_${network.toUpperCase()} must be <txhash>#<index>`);
      return { txHash: match[1].toLowerCase(), outputIndex: parseInt(match[2], 10) };
    }
    return DEFAULT_VKEY_REF[network];
  }

  /** Networks on which the organiser must deposit the vote fees before publishing. */
  feeDepositNetworks(): CardanoNetwork[] {
    const raw = this.env('FEE_DEPOSIT_NETWORKS') ?? 'mainnet';
    return raw.split(',').map(s => s.trim()).filter(isCardanoNetwork);
  }

  feeDepositRequired(network: CardanoNetwork): boolean {
    return this.feeDepositNetworks().includes(network);
  }

  isEnabled(network: CardanoNetwork): boolean {
    return !!this.blockfrostApiKey(network) && !!this.relayMnemonic(network) && !!this.vkeyRef(network);
  }

  /** The relay wallet's address on the network (derived offline from the mnemonic), or null. */
  async relayAddress(network: CardanoNetwork): Promise<string | null> {
    const cached = this.relayAddressCache.get(network);
    if (cached) return cached;
    const mnemonic = this.relayMnemonic(network);
    if (!mnemonic) return null;
    const words = mnemonic.split(/\s+/);
    if (words.length !== 24) throw new Error(`Relay wallet mnemonic for ${network} must have 24 words`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MeshWallet } = require('@meshsdk/core');
    const wallet = new MeshWallet({ networkId: NETWORK_ID[network], key: { type: 'mnemonic', words } });
    const address: string = await wallet.getChangeAddress();
    this.relayAddressCache.set(network, address);
    return address;
  }

  async describe(network: CardanoNetwork): Promise<NetworkInfo> {
    return {
      network,
      enabled: this.isEnabled(network),
      networkId: NETWORK_ID[network],
      relayAddress: await this.relayAddress(network),
      feeDepositRequired: this.feeDepositRequired(network),
      feePerVoteLovelace: FEE_PER_VOTE_LOVELACE.toString(),
      vkeyRef: this.vkeyRef(network),
      explorerBaseUrl: EXPLORER_BASE_URL[network],
    };
  }

  async describeAll(): Promise<NetworkInfo[]> {
    return Promise.all(CARDANO_NETWORKS.map(n => this.describe(n)));
  }
}
