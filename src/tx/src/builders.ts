// Transaction builders
//export * from './voting';
//export * from './mint';


import { BlockfrostProvider, MeshWallet, TxOutRef, txOutRef } from "@meshsdk/core";
import { cborOfValidatorWith } from "./utils.js"

/* 

pub type GroupDatum {
    group_merke_root: Int,
    admin_pkh: ByteArray,
}

pub type GroupRedeemer {
    Create
    Update
}
*/


export async function instantiateGroup(oref: TxOutRef, group_merke_root: string, admin_pkh: string) {
    // define in a variable the group script cbor.
    // cborOfValidatorWith

    // Apply the oref
}