import { BlockfrostProvider, MeshWallet, TxOutRef, txOutRef, deserializeAddress, UTxO, integer, list, conStr, byteString } from "@meshsdk/core";
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
 * Create an OutputReference structure for PlutusData
 *
 * This is used to reference a specific UTxO on-chain by its transaction hash and output index.
 * Common uses: one-shot minting validators, reference inputs, verification key references.
 *
 * @param txHash - Transaction hash (64-character hex string)
 * @param outputIndex - Output index in the transaction
 * @returns OutputReference object formatted for PlutusData
 *
 * @example
 * const oref = createOutputReference(
 *   "4b3ae50d2732cfac39725e83b31b76aaa0c088c35cb263e0be5c226fedd1d62a",
 *   0
 * );
 */
export function createOutputReference(txHash: string, outputIndex: number): any {
  if (!txHash || txHash.length !== 64) {
    throw new Error('Transaction hash must be a 64-character hex string');
  }

  if (outputIndex < 0) {
    throw new Error('Output index must be non-negative');
  }

  return {
    constructor: 0,
    fields: [
      {
        bytes: txHash
      },
      {
        int: outputIndex
      }
    ]
  };
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

  // Use the standalone createOutputReference function
  const outputReference = createOutputReference(
    selectedUtxo.input.txHash,
    selectedUtxo.input.outputIndex
  );

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

/**
 * Generate initial voting options with zero vote counts
 *
 * BUSINESS RULE: Option 0 is conventionally treated as "Abstain" in the application.
 * This is NOT enforced by the smart contract - it's an application-level convention.
 *
 * @param numOptions - Number of voting options (minimum 2: abstain + at least one real option)
 * @returns Array of options formatted as List<(Int, Int)> where first Int is the option index, second is the vote count (initialized to 0)
 *
 * @example
 * // Generate 3 options: Abstain (0), Option 1, Option 2
 * const options = generateInitialOptions(3);
 * // Returns: [list([integer(0), integer(0)]), list([integer(1), integer(0)]), list([integer(2), integer(0)])]
 */
export function generateInitialOptions(numOptions: number): any[] {
  if (numOptions < 2) {
    throw new Error('Minimum 2 options required: option 0 (abstain) + at least one voting option');
  }

  const options = [];
  for (let i = 0; i < numOptions; i++) {
    options.push(list([integer(i), integer(0)]));
  }

  return options;
}

/**
 * Generate voting event dates with user-friendly parameters
 *
 * IMPORTANT CONSTRAINT: The transaction validity window must end BEFORE the event starts.
 * This is enforced by the voting.ak validator to prevent time manipulation attacks.
 *
 * @param options - Configuration for the voting event timing
 * @param options.startsInMinutes - Minutes from now until voting begins (default: 60, minimum: 10)
 * @param options.durationMinutes - How long voting lasts in minutes (default: 1440 = 24 hours, minimum: 60)
 * @param options.txValidityMinutes - Transaction validity window in minutes (default: 5, maximum: startsInMinutes - 5)
 * @returns Object containing event timestamps and tx validity window
 *
 * @example
 * // Voting starts in 1 hour, lasts for 24 hours (default)
 * const timing = generateEventTiming({ startsInMinutes: 60 });
 *
 * @example
 * // Week-long voting period
 * const timing = generateEventTiming({ startsInMinutes: 60, durationMinutes: 10080 });
 */
export function generateEventTiming(options?: {
  startsInMinutes?: number;
  durationMinutes?: number;
  txValidityMinutes?: number;
}): {
  eventStart: number;
  eventEnd: number;
  txValiditySlots: number;
  description: string;
} {
  const startsInMinutes = options?.startsInMinutes ?? 60;
  const durationMinutes = options?.durationMinutes ?? 1440; // Default: 24 hours
  const txValidityMinutes = options?.txValidityMinutes ?? 5;

  // Validation
  if (startsInMinutes < 2) {
    throw new Error('Event must start at least 2 minutes from now (minimum safe margin after TX validity)');
  }

  if (durationMinutes < 1) {
    throw new Error('Voting duration must be at least 1 minute');
  }

  if (txValidityMinutes < 1 || txValidityMinutes > 10) {
    throw new Error('TX validity window must be between 1-10 minutes');
  }

  // Calculate timestamps
  const now = Date.now();
  const eventStart = now + startsInMinutes * 60 * 1000;
  const eventEnd = eventStart + durationMinutes * 60 * 1000;

  // Convert TX validity from minutes to slots (1 slot = 1 second on Cardano)
  const txValiditySlots = txValidityMinutes * 60;

  // Generate human-readable description
  const startTime = new Date(eventStart);
  const endTime = new Date(eventEnd);
  const description = `Voting starts ${startTime.toISOString()} (in ${startsInMinutes}min), ends ${endTime.toISOString()} (${durationMinutes}min duration)`;

  return {
    eventStart,
    eventEnd,
    txValiditySlots,
    description
  };
}

/**
 * Create GroupDatum for a Cardano Semaphore group
 *
 * GroupDatum structure from group.ak:
 * - merkle_root: Int (merkle root of group members, 0 for empty group)
 * - admin_pkh: ByteArray (administrator's payment key hash)
 *
 * @param merkleRoot - Merkle root of group members (default: 0 for new/empty group)
 * @param adminPkh - Administrator's payment key hash (hex string)
 * @returns Properly formatted GroupDatum for the group script
 *
 * @example
 * const datum = createGroupDatum(0, paymentKeyHash);
 */
export function createGroupDatum(merkleRoot: number, adminPkh: string): any {
  // Validate inputs
  if (merkleRoot < 0) {
    throw new Error('Merkle root must be non-negative');
  }

  if (!adminPkh || adminPkh.length !== 56) {
    throw new Error('Admin PKH must be a 56-character hex string');
  }

  // Construct GroupDatum
  return conStr(0, [
    integer(merkleRoot),      // merkle_root: Int
    byteString(adminPkh)      // admin_pkh: ByteArray
  ]);
}

/**
 * Create UrnaDatum for a voting event
 *
 * UrnaDatum structure from voting.ak:
 * - weight: Int (0 for simple voting, >0 for weighted voting)
 * - options: List<(Int, Int)> (option index, vote count pairs)
 * - event_date: (Int, Int) (start_time, end_time in POSIX ms)
 * - semaphore_nft: PolicyId (ZK proof NFT policy)
 *
 * @param params - Voting event configuration
 * @param params.weight - Voting weight (0 = simple, 1+ = weighted)
 * @param params.options - Array of voting options (use generateInitialOptions())
 * @param params.eventStart - Event start timestamp (POSIX ms)
 * @param params.eventEnd - Event end timestamp (POSIX ms)
 * @param params.semaphoreNftPolicyId - Semaphore NFT policy ID (hex string)
 * @returns Properly formatted UrnaDatum for the voting script
 *
 * @example
 * const options = generateInitialOptions(3);
 * const { eventStart, eventEnd } = generateEventTiming({ startsInMinutes: 60, durationMinutes: 1440 });
 *
 * const datum = createUrnaDatum({
 *   weight: 0,
 *   options: options,
 *   eventStart: eventStart,
 *   eventEnd: eventEnd,
 *   semaphoreNftPolicyId: "1779325f22a306fd4062a0c714dff772ef9446d3538dfb4910a75c99"
 * });
 */
export function createUrnaDatum(params: {
  weight: number;
  options: any[];
  eventStart: number;
  eventEnd: number;
  semaphoreNftPolicyId: string;
}): any {
  const { weight, options, eventStart, eventEnd, semaphoreNftPolicyId } = params;

  // Validate inputs
  if (weight < 0) {
    throw new Error('Weight must be non-negative (0 for simple voting, >0 for weighted)');
  }

  if (!options || options.length < 2) {
    throw new Error('Must have at least 2 options (use generateInitialOptions())');
  }

  if (eventEnd <= eventStart) {
    throw new Error('Event end time must be after start time');
  }

  if (!semaphoreNftPolicyId || semaphoreNftPolicyId.length !== 56) {
    throw new Error('Semaphore NFT policy ID must be a 56-character hex string');
  }

  // Construct UrnaDatum following the voting.ak structure
  return conStr(0, [
    integer(weight),                                          // weight: Int
    list(options),                                           // options: List<(Int, Int)>
    list([integer(eventStart), integer(eventEnd)]),         // event_date: (Int, Int)
    byteString(semaphoreNftPolicyId)                        // semaphore_nft: PolicyId
  ]);
}



