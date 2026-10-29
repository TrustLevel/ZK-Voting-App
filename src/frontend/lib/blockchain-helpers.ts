/**
 * Organiser publish flow — browser side.
 *
 * The browser never talks to Blockfrost. The backend builds every transaction with its own
 * key for the event's network (POST build-*-tx), the organiser's CIP-30 wallet signs it, the
 * backend submits it (POST submit-tx — only transactions it built itself) and reports
 * confirmation (GET tx/:hash). The only wallet-side work left here is reading the wallet's
 * UTxOs and signing.
 */

import type { IWallet, UTxO } from '@meshsdk/core';

export interface OrganiserApi {
  backendApiUrl: string;
  eventId: string;
  adminToken: string;
}

export class BackendError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function call<T>(api: OrganiserApi, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${api.backendApiUrl}/voting-event/${api.eventId}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': api.adminToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.ok) return response.json() as Promise<T>;
  const err: { message?: string | string[]; code?: string } = await response.json().catch(() => ({}));
  const message = Array.isArray(err?.message) ? err.message.join(', ') : typeof err?.message === 'string' ? err.message : `HTTP ${response.status}`;
  throw new BackendError(message, response.status, err?.code);
}

// Only the fields the backend validates — wallets attach more (datums, script refs).
function slimUtxos(utxos: UTxO[]): Array<{ input: { txHash: string; outputIndex: number }; output: { address: string; amount: Array<{ unit: string; quantity: string }> } }> {
  return utxos.map(u => ({
    input: { txHash: u.input.txHash, outputIndex: u.input.outputIndex },
    output: { address: u.output.address, amount: u.output.amount.map(a => ({ unit: a.unit, quantity: a.quantity })) },
  }));
}

export interface GroupMintResult {
  txHash: string;
  policyId: string;
  scriptAddress: string;
  mintUtxo: { txHash: string; outputIndex: number };
}

export interface SemaphoreVotingMintResult {
  txHash: string;
  semaphorePolicyId: string;
  semaphoreScriptAddr: string;
  votingPolicyId: string;
  votingScriptAddr: string;
  mintingOref: { txHash: string; outputIndex: number };
}

export interface FeeDepositResult {
  txHash: string;
  amountLovelace: string;
  relayAddress: string;
}

const isRetryable = (err: unknown, codes: string[]): err is BackendError =>
  err instanceof BackendError && err.status === 409 && !!err.code && codes.includes(err.code);

/**
 * Runs one build → sign → submit attempt; when the backend reports a stale wallet UTxO
 * (STALE_INPUT: spent by an earlier tx the wallet still lists, or not yet indexed) it waits and
 * tries again with fresh UTxOs. The organiser has to sign again — the status line says so.
 */
async function withStaleInputRetry<T>(attempt: () => Promise<T>, onStatus?: (message: string) => void, attempts = 4, waitMs = 10_000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      if (!isRetryable(err, ['STALE_INPUT']) || i >= attempts) throw err;
      onStatus?.(`A wallet UTxO was already spent or not indexed yet — refreshing the wallet and trying again (${i}/${attempts - 1})...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

/** POST submit-tx: the backend submits a signed tx it built itself and returns its id. */
export async function submitSignedTx(api: OrganiserApi, signedTx: string): Promise<{ txHash: string; kind: string }> {
  return call(api, 'POST', 'submit-tx', { signedTx });
}

/** Step 1 — Group NFT mint: build on the backend, sign in the wallet, submit through the backend. */
export async function mintGroupNft(
  api: OrganiserApi,
  wallet: IWallet,
  params: { walletAddress: string },
  onStatus?: (message: string) => void,
): Promise<GroupMintResult> {
  return withStaleInputRetry(async () => {
    const walletUtxos = await getWalletUtxos(wallet);
    const built = await call<{ unsignedTx: string; txHash: string; policyId: string; scriptAddress: string; mintUtxo: { txHash: string; outputIndex: number } }>(
      api, 'POST', 'build-group-mint-tx', { walletAddress: params.walletAddress, walletUtxos: slimUtxos(walletUtxos) },
    );
    onStatus?.('Please sign the Group NFT mint in your wallet...');
    const signedTx = await wallet.signTx(built.unsignedTx, true);
    const { txHash } = await submitSignedTx(api, signedTx);
    return { txHash, policyId: built.policyId, scriptAddress: built.scriptAddress, mintUtxo: built.mintUtxo };
  }, onStatus);
}

/**
 * Step 2 — Semaphore + Voting NFT mint. The backend answers 409 with a retry code while
 * Blockfrost has not indexed the Group mint yet; we retry for up to `maxWaitMs`.
 */
export async function mintSemaphoreVotingNfts(
  api: OrganiserApi,
  wallet: IWallet,
  params: { walletAddress: string; startingDate: number; endingDate: number },
  onStatus?: (message: string) => void,
  maxWaitMs = 120_000,
  intervalMs = 3_000,
): Promise<SemaphoreVotingMintResult> {
  const deadline = Date.now() + maxWaitMs;
  return withStaleInputRetry(async () => {
    let built: {
      unsignedTx: string; txHash: string; semaphorePolicyId: string; semaphoreScriptAddr: string;
      votingPolicyId: string; votingScriptAddr: string; mintingOref: { txHash: string; outputIndex: number };
    };
    for (;;) {
      try {
        built = await call(api, 'POST', 'build-semaphore-voting-mint-tx', params);
        break;
      } catch (err) {
        if (!isRetryable(err, ['GROUP_NFT_NOT_INDEXED', 'WALLET_UTXOS_NOT_INDEXED']) || Date.now() > deadline) throw err;
        onStatus?.('Waiting for the Group NFT to be indexed on-chain...');
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    }
    onStatus?.('Please sign the Semaphore + Voting mint in your wallet...');
    const signedTx = await wallet.signTx(built.unsignedTx, true);
    const { txHash } = await submitSignedTx(api, signedTx);
    return {
      txHash,
      semaphorePolicyId: built.semaphorePolicyId,
      semaphoreScriptAddr: built.semaphoreScriptAddr,
      votingPolicyId: built.votingPolicyId,
      votingScriptAddr: built.votingScriptAddr,
      mintingOref: built.mintingOref,
    };
  }, onStatus);
}

/** Fee deposit (fee-deposit networks): plain payment of the missing amount to the relay wallet. */
export async function sendFeeDeposit(
  api: OrganiserApi,
  wallet: IWallet,
  params: { walletAddress: string },
  onStatus?: (message: string) => void,
): Promise<FeeDepositResult> {
  return withStaleInputRetry(async () => {
    const walletUtxos = await getWalletUtxos(wallet);
    const built = await call<{ unsignedTx: string; txHash: string; amountLovelace: string; relayAddress: string }>(
      api, 'POST', 'build-fee-deposit-tx', { walletAddress: params.walletAddress, walletUtxos: slimUtxos(walletUtxos) },
    );
    onStatus?.('Please sign the fee deposit in your wallet...');
    const signedTx = await wallet.signTx(built.unsignedTx, false);
    const { txHash } = await submitSignedTx(api, signedTx);
    return { txHash, amountLovelace: built.amountLovelace, relayAddress: built.relayAddress };
  }, onStatus);
}

/** Polls GET tx/:hash on the backend until the transaction is on-chain. */
export async function waitForTxConfirmation(
  api: OrganiserApi,
  txHash: string,
  maxAttempts: number,
  intervalMs: number,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await call<{ confirmed: boolean }>(api, 'GET', `tx/${txHash}`);
      if (status.confirmed) return true;
    } catch {
      // transient backend/Blockfrost error — keep polling
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

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
