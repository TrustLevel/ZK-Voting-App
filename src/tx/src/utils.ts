import { BlockfrostProvider, MeshWallet, TxOutRef, txOutRef, deserializeAddress, UTxO } from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";
import fs, { read } from 'fs';
import { PlutusValidatorBlueprint } from './types.js';

//const secretKey: string = process.env.SECRET_KEY || "";
//const mnemonic = secretKey.split(" ");
//const apiKey: string = process.env.API_KEY || "";

//export const provider = new BlockfrostProvider(apiKey);


// Utility function to parse mnemonic string into array
export function parseMnemonic(mnemonicString: string): string[] {
    if (!mnemonicString || mnemonicString.trim() === "") {
        throw new Error("Mnemonic string is empty or undefined");
    }
    const words = mnemonicString.trim().split(/\s+/);
    if (words.length !== 24) {
        throw new Error(`Invalid mnemonic: expected 24 words, got ${words.length}`);
    }
    return words;
}

export async function createWallet(blockchainProvider: BlockfrostProvider, seed: string[], networkId: 0 | 1) {
    const wallet = new MeshWallet({
        networkId: networkId,
        fetcher: blockchainProvider,
        submitter: blockchainProvider,
        key: {
            type: 'mnemonic',
            words: seed,
        },
    });

    return wallet;
}

export function walletBaseAddress(wallet: MeshWallet) {
    return wallet.getAddresses().baseAddressBech32;
}

/**
 * Extract payment key hash from a wallet address
 * @param walletAddress - Bech32 wallet address
 * @returns Payment public key hash
 */
export function extractPaymentKeyHash(walletAddress: string): string {
    const addressInfo = deserializeAddress(walletAddress);
    return addressInfo.pubKeyHash;
}

/**
 * Select a UTxO and create an OutputReference for one-shot minting
 * @param walletUtxos - Array of wallet UTxOs
 * @param index - Index of UTxO to select (default: 0)
 * @returns Object containing the selected UTxO and its OutputReference
 */
export function selectUtxoAndCreateOutputReference(
  walletUtxos: UTxO[],
  index: number = 0
): { selectedUtxo: UTxO; outputReference: any } {
  if (!walletUtxos || walletUtxos.length === 0) {
    throw new Error('No UTxOs available in wallet');
  }

  if (index < 0 || index >= walletUtxos.length) {
    throw new Error(`Invalid UTxO index: ${index}. Available UTxOs: ${walletUtxos.length}`);
  }

  const selectedUtxo = walletUtxos[index];

  // FIXED: Create OutputReference manually - txOutRef has extra wrapper bug
  const outputReference = {
    constructor: 0,
    fields: [
      {
        bytes: selectedUtxo.input.txHash
      },
      {
        int: selectedUtxo.input.outputIndex
      }
    ]
  };

  return { selectedUtxo, outputReference };
}

export function textToHex(text: string): string {
    return Array.from(text)
        .map(character => character.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
}


//export function paymentKeyHashForWallet(wallet: MeshWallet) {
//    const walletAddr = walletBaseAddress(wallet)
//    const pubKeyHash = Address.from_bech32(walletAddr!);
//    return pubKeyHash!.payment_cred()!.to_keyhash();
//}

export function cborOfValidatorWith(path: string, name: string, purpose: string): PlutusValidatorBlueprint {
    const blueprint = JSON.parse(fs.readFileSync(path, "utf-8"));
    const targetTitle = name + "." + name + "." + purpose;
    const validatorWithName = blueprint.validators.find((validator: PlutusValidatorBlueprint) => {
        return validator.title === targetTitle;
    });
    
    if (!validatorWithName) {
        const availableValidators = blueprint.validators.map((v: PlutusValidatorBlueprint) => v.title).join(', ');
        throw new Error(`Validator '${targetTitle}' not found. Available validators: ${availableValidators}`);
    }
    
    return validatorWithName;
}


/**
 * Apply OutputReference parameter to validator script
 * @param validator - Either a PlutusValidatorBlueprint or CBOR string
 * @param oref - OutputReference parameter
 * @returns Parameterized validator CBOR
 */
export function applyOrefParamToScript(validator: PlutusValidatorBlueprint | string, oref: any): string {
  const cbor = typeof validator === 'string' ? validator : validator.compiledCode;
  return applyParamsToScript(cbor, [oref], "JSON");
}



