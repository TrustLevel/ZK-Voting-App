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
  return utxos;
}
