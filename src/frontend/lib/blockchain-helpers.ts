import {
  UTxO,
  IWallet,
} from '@meshsdk/core';
import {
  textToHex,
  createOutputReference,
  createUrnaDatum,
  createGroupDatum,
  generateInitialOptions,
  selectUtxoAndCreateOutputReference,
  selectUtxoForCollateral,
  applyOrefParamToScript,
} from '@src/tx/browser';

export {
  textToHex,
  createOutputReference,
  createUrnaDatum,
  createGroupDatum,
  generateInitialOptions,
  selectUtxoAndCreateOutputReference,
  applyOrefParamToScript,
};

export { selectUtxoForCollateral };

export async function getWalletUtxos(wallet: IWallet): Promise<UTxO[]> {
  const utxos = await wallet.getUtxos();
  if (!utxos || utxos.length === 0) {
    throw new Error('No UTxOs available in wallet');
  }
  // Some wallets (e.g. Eternl) include script-address UTxOs in getUtxos().
  // Filter to payment-key addresses only (bech32 addr_test1q... or addr1q...).
  // Script addresses start with addr_test1w / addr1w (script hash in payment part).
  const walletUtxos = utxos.filter(u => {
    const addr = u.output.address ?? '';
    return !addr.startsWith('addr_test1w') && !addr.startsWith('addr1w');
  });
  if (walletUtxos.length === 0) {
    throw new Error('No UTxOs available in wallet (all UTxOs are at script addresses)');
  }
  return walletUtxos;
}
