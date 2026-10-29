/**
 * Plain ADA payment (no scripts) — used by the backend to build the organiser's
 * fee-deposit transaction for CIP-30 signing. The caller passes the wallet's UTxOs;
 * the provider only supplies protocol parameters.
 */

import { BlockfrostProvider, MeshTxBuilder, UTxO } from '@meshsdk/core';
import { CardanoNetwork } from '../network.js';

export async function buildPaymentTransaction(params: {
  provider: BlockfrostProvider;
  // Cardano network (default 'preprod').
  network?: CardanoNetwork;
  walletUtxos: UTxO[];
  changeAddress: string;
  toAddress: string;
  lovelace: string;
}): Promise<string> {
  const network: CardanoNetwork = params.network ?? 'preprod';
  const txBuilder = new MeshTxBuilder({ fetcher: params.provider, verbose: false });
  return txBuilder
    .setNetwork(network)
    .txOut(params.toAddress, [{ unit: 'lovelace', quantity: params.lovelace }])
    .selectUtxosFrom(params.walletUtxos)
    .changeAddress(params.changeAddress)
    .complete();
}
