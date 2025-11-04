import { BlockfrostProvider, MeshWallet, TxOutRef, txOutRef } from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";
import fs, { read } from 'fs';
import { PlutusValidatorBlueprint } from './types.js';

//const secretKey: string = process.env.SECRET_KEY || "";
//const mnemonic = secretKey.split(" ");
//const apiKey: string = process.env.API_KEY || "";

//export const provider = new BlockfrostProvider(apiKey);

const apiKey: string = process.env.API_KEY || "";

export const provider = new BlockfrostProvider(apiKey);

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


// Remove incomplete function - causing build error
export function applyOrefParamToScript(validator: PlutusValidatorBlueprint, oref: TxOutRef): string {
  return applyParamsToScript(validator.compiledCode, [oref], "JSON");
}
