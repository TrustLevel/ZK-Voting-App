import { BlockfrostProvider, MeshWallet, TxOutRef, txOutRef } from "@meshsdk/core";
import { applyParamsToScript } from "@meshsdk/core-csl";
import fs, { read } from 'fs';

//const secretKey: string = process.env.SECRET_KEY || "";
//const mnemonic = secretKey.split(" ");
//const apiKey: string = process.env.API_KEY || "";

//export const provider = new BlockfrostProvider(apiKey);

const apiKey: string = process.env.API_KEY || "";

export const provider = new BlockfrostProvider(apiKey);

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



export function cborOfValidatorWith(path: string, name: string, purpose: string) {
    const blueprint = JSON.parse(fs.readFileSync(path, "utf-8"));
    // TODO: define the type for the parameter
    const validatorWithName = blueprint.validators.find((validator: any) => {
          const title = name + "." + name + "." + purpose;
          return validator.title == title;
    })
    return validatorWithName;
}


export function generateScriptCbor(path: string, name: string, purpose: string, oref: TxOutRef) {
    const validator = cborOfValidatorWith(path, name, purpose);
    const scriptCbor = applyParamsToScript(validator.compiledCode, [oref], "JSON");
    return scriptCbor;
}

