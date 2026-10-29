import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BlockfrostProvider,
  UTxO,
  byteString,
  conStr,
  deserializeAddress,
  integer,
  resolvePlutusScriptAddress,
  resolveScriptHash,
} from '@meshsdk/core';
import { VotingEvent } from './voting-event.entity';
import { VotingEventService } from './voting-event.service';
import { CardanoNetwork, NetworkConfig, OutputRef } from '../network/network-config';

/**
 * Organiser transactions — the browser never talks to Blockfrost.
 *
 * The organiser's wallet (CIP-30) only signs. This service builds the Group NFT mint, the
 * Semaphore + Voting NFT mint and the fee-deposit payment with the backend's Blockfrost
 * key of the event's network, remembers what it built (publish_state), and submits only
 * a signed transaction whose id matches one of those. After a successful submit it
 * persists the on-chain identifiers it computed itself; the browser supplies nothing but
 * its address, its UTxOs and the event dates.
 *
 * Flow (manage page, "Start Voting"):
 *   1. POST build-group-mint-tx            → sign → POST submit-tx → GET tx/:hash until confirmed
 *   2. POST build-semaphore-voting-mint-tx → sign → POST submit-tx → GET tx/:hash
 *      (409 GROUP_NFT_NOT_INDEXED / WALLET_UTXOS_NOT_INDEXED while Blockfrost lags — retry)
 *   Fee deposit (Mainnet): POST build-fee-deposit-tx → sign → POST submit-tx → POST confirm-fee-deposit
 *
 * F11: the wallet UTxOs the browser reported for step 1 are remembered; step 2 only spends
 * UTxOs that did not exist before the Group mint (its change output), because Blockfrost's
 * address index can still list spent inputs right after confirmation.
 */

type PendingTx =
  | {
      kind: 'group-mint';
      builtAt: number;
      policyId: string;
      scriptAddress: string;
      validatorCbor: string;
      mintUtxo: OutputRef;
      walletAddress: string;
      preMintUtxoRefs: string[];
    }
  | {
      kind: 'sv-mint';
      builtAt: number;
      semaphorePolicyId: string;
      semaphoreScriptAddr: string;
      votingPolicyId: string;
      votingScriptAddr: string;
      mintingOref: OutputRef;
      vkeyRef: OutputRef;
      startingDate: number;
      endingDate: number;
      walletAddress: string;
    }
  | { kind: 'fee-deposit'; builtAt: number; amountLovelace: string; walletAddress: string };

export type PendingTxKind = PendingTx['kind'];

interface PublishState {
  // Group NFT mint that was submitted (step 1 done).
  group?: {
    policyId: string;
    scriptAddress: string;
    validatorCbor: string;
    mintUtxo: OutputRef;
    txHash: string;
    walletAddress: string;
    preMintUtxoRefs: string[];
  };
  // Unsigned transactions built for this event, keyed by transaction id.
  pending: Record<string, PendingTx>;
}

const TX_HASH_RE = /^[0-9a-f]{64}$/i;
const MAX_WALLET_UTXOS = 300;
const MAX_ASSETS_PER_UTXO = 200;
// The SV mint's validity window must end before the event starts (is_entirely_before).
const MIN_SECONDS_TO_START = 90;

export class RetryableConflict extends HttpException {
  constructor(code: string, message: string) {
    super({ statusCode: HttpStatus.CONFLICT, code, message }, HttpStatus.CONFLICT);
  }
}

@Injectable()
export class OrganiserTxService {
  constructor(
    @InjectRepository(VotingEvent)
    private readonly votingEventRepository: Repository<VotingEvent>,
    private readonly networkConfig: NetworkConfig,
    private readonly votingEventService: VotingEventService,
  ) {}

  // ── Shared helpers ─────────────────────────────────────────────────────────

  private async loadEvent(eventId: number): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) throw new HttpException('Event not found', HttpStatus.NOT_FOUND);
    return event;
  }

  private networkOf(event: VotingEvent): CardanoNetwork {
    return event.network ?? 'preprod';
  }

  // Blockfrost REST access + MeshSDK provider for the event's network (503 when not enabled).
  private chain(network: CardanoNetwork): { base: string; headers: { project_id: string }; provider: BlockfrostProvider } {
    const apiKey = this.networkConfig.blockfrostApiKey(network);
    if (!apiKey || !this.networkConfig.isEnabled(network))
      throw new HttpException(`Network ${network} is not enabled on this server`, HttpStatus.SERVICE_UNAVAILABLE);
    return {
      base: this.networkConfig.blockfrostBaseUrl(network),
      headers: { project_id: apiKey },
      provider: new BlockfrostProvider(apiKey),
    };
  }

  private readState(event: VotingEvent): PublishState {
    if (!event.publishState) return { pending: {} };
    try {
      const parsed = JSON.parse(event.publishState);
      return { group: parsed.group, pending: parsed.pending ?? {} };
    } catch {
      return { pending: {} };
    }
  }

  private writeState(event: VotingEvent, state: PublishState | null): void {
    event.publishState = state ? JSON.stringify(state) : null;
  }

  // Keeps at most one pending transaction per kind: a rebuilt transaction replaces the
  // previous one of the same kind, so a stale id never blocks a retry.
  private setPending(state: PublishState, txHash: string, entry: PendingTx): void {
    for (const [hash, p] of Object.entries(state.pending)) if (p.kind === entry.kind) delete state.pending[hash];
    state.pending[txHash] = entry;
  }

  private addressPrefix(network: CardanoNetwork): string {
    return network === 'mainnet' ? 'addr1' : 'addr_test1';
  }

  /** Validates the organiser's address: a payment-key address on the event's network. Returns its payment key hash. */
  assertWalletAddress(walletAddress: unknown, network: CardanoNetwork): string {
    if (typeof walletAddress !== 'string' || walletAddress.length === 0 || walletAddress.length > 256)
      throw new HttpException('walletAddress is required', HttpStatus.BAD_REQUEST);
    if (!walletAddress.startsWith(this.addressPrefix(network)))
      throw new HttpException(`walletAddress is not a ${network} address`, HttpStatus.BAD_REQUEST);
    let pubKeyHash = '';
    try {
      pubKeyHash = deserializeAddress(walletAddress).pubKeyHash;
    } catch {
      throw new HttpException('walletAddress is not a valid Cardano address', HttpStatus.BAD_REQUEST);
    }
    if (!/^[0-9a-f]{56}$/i.test(pubKeyHash))
      throw new HttpException('walletAddress must be a payment-key address (not a script address)', HttpStatus.BAD_REQUEST);
    return pubKeyHash.toLowerCase();
  }

  /**
   * Validates the UTxO list a CIP-30 wallet reported and reduces every entry to the fields the
   * builders use. Script-address UTxOs (some wallets list them) are dropped.
   */
  assertWalletUtxos(raw: unknown, network: CardanoNetwork): UTxO[] {
    if (!Array.isArray(raw) || raw.length === 0) throw new HttpException('walletUtxos must be a non-empty array', HttpStatus.BAD_REQUEST);
    if (raw.length > MAX_WALLET_UTXOS) throw new HttpException(`walletUtxos: at most ${MAX_WALLET_UTXOS} entries`, HttpStatus.BAD_REQUEST);
    const prefix = this.addressPrefix(network);
    const bad = (i: number, why: string) => new HttpException(`walletUtxos[${i}]: ${why}`, HttpStatus.BAD_REQUEST);
    const clean: UTxO[] = [];
    raw.forEach((u: any, i: number) => {
      const txHash = u?.input?.txHash;
      const outputIndex = u?.input?.outputIndex;
      const address = u?.output?.address;
      const amount = u?.output?.amount;
      if (typeof txHash !== 'string' || !TX_HASH_RE.test(txHash)) throw bad(i, 'input.txHash must be a 64-character hex string');
      if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex > 65535) throw bad(i, 'input.outputIndex must be a non-negative integer');
      if (typeof address !== 'string' || !address.startsWith(prefix)) throw bad(i, `output.address must be a ${network} address`);
      if (!Array.isArray(amount) || amount.length === 0 || amount.length > MAX_ASSETS_PER_UTXO) throw bad(i, 'output.amount must be a non-empty array');
      const assets = amount.map((a: any, j: number) => {
        if (typeof a?.unit !== 'string' || !(a.unit === 'lovelace' || /^[0-9a-f]{56,}$/i.test(a.unit))) throw bad(i, `amount[${j}].unit is invalid`);
        if (typeof a?.quantity !== 'string' || !/^\d{1,20}$/.test(a.quantity)) throw bad(i, `amount[${j}].quantity must be a decimal string`);
        return { unit: a.unit, quantity: a.quantity };
      });
      if (!assets.some(a => a.unit === 'lovelace')) throw bad(i, 'output.amount has no lovelace entry');
      // Script addresses carry the script hash in the payment part (addr1w… / addr_test1w…).
      if (address.startsWith(`${prefix}w`)) return;
      clean.push({
        input: { txHash: txHash.toLowerCase(), outputIndex },
        output: { address, amount: assets },
      });
    });
    if (clean.length === 0) throw new HttpException('walletUtxos has no UTxO at a payment-key address', HttpStatus.BAD_REQUEST);
    return clean;
  }

  private utxoRef(u: UTxO): string {
    return `${u.input.txHash}#${u.input.outputIndex}`;
  }

  private async tx(): Promise<typeof import('@src/tx/browser')> {
    return import('@src/tx/browser');
  }

  private async txNode(): Promise<typeof import('@src/tx')> {
    return import('@src/tx');
  }

  // Blockfrost address UTxOs in the MeshSDK shape (only the fields the builders need).
  private async fetchAddressUtxos(base: string, headers: { project_id: string }, address: string): Promise<UTxO[]> {
    const all: UTxO[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${base}/addresses/${address}/utxos?count=100&page=${page}`, { headers });
      if (res.status === 404) return all; // address never seen on-chain
      if (!res.ok) throw new HttpException(`Blockfrost error fetching UTxOs (${res.status})`, HttpStatus.BAD_GATEWAY);
      const rows: any[] = await res.json();
      for (const r of rows) {
        all.push({
          input: { txHash: r.tx_hash, outputIndex: r.output_index },
          output: { address: r.address, amount: (r.amount ?? []).map((a: any) => ({ unit: a.unit, quantity: String(a.quantity) })) },
        });
      }
      if (rows.length < 100) break;
    }
    return all;
  }

  private async fetchLatestBlock(base: string, headers: { project_id: string }): Promise<{ slot: number; time: number }> {
    const res = await fetch(`${base}/blocks/latest`, { headers });
    if (!res.ok) throw new HttpException(`Blockfrost error fetching the latest block (${res.status})`, HttpStatus.BAD_GATEWAY);
    const b: any = await res.json();
    return { slot: Number(b.slot), time: Number(b.time) };
  }

  // ── Step 1: Group NFT mint ─────────────────────────────────────────────────

  async buildGroupMintTx(
    eventId: number,
    body: { walletAddress: unknown; walletUtxos: unknown },
  ): Promise<{ unsignedTx: string; txHash: string; policyId: string; scriptAddress: string; mintUtxo: OutputRef }> {
    const event = await this.loadEvent(eventId);
    const network = this.networkOf(event);
    const { provider } = this.chain(network);
    const paymentKeyHash = this.assertWalletAddress(body.walletAddress, network);
    const walletAddress = body.walletAddress as string;
    const walletUtxos = this.assertWalletUtxos(body.walletUtxos, network);

    if (event.votingNft)
      throw new HttpException('This event is already on-chain (Voting NFT minted) — it cannot be published again', HttpStatus.CONFLICT);
    const options = this.parseOptions(event);
    if (options.length < 2) throw new HttpException('The event needs at least two options before it can be published', HttpStatus.BAD_REQUEST);

    // Fee-deposit networks (Mainnet): the voters' fees must be prepaid before publishing.
    const deposit = await this.votingEventService.getFeeDepositStatus(eventId);
    if (deposit.required && !deposit.funded)
      throw new HttpException(
        `Fee deposit missing: ${deposit.missingLovelace} lovelace still required before this event can be published`,
        HttpStatus.PAYMENT_REQUIRED,
      );

    const tx = await this.tx();
    const { selectedUtxo } = tx.selectUtxoAndCreateOutputReference(walletUtxos, 0);
    const collateralUtxo = tx.selectUtxoForCollateral(walletUtxos);
    if (!collateralUtxo) throw new HttpException('No suitable collateral UTxO in the wallet (need one pure-ADA UTxO of at least 5 ADA)', HttpStatus.BAD_REQUEST);

    const merkleRoot = BigInt(event.groupMerkleRootHash || '0');
    const outputReference = tx.createOutputReference(selectedUtxo.input.txHash, selectedUtxo.input.outputIndex);
    const clothedCbor = await tx.applyOrefParamToScript(tx.VALIDATORS.group.mint, outputReference);
    const policyId = resolveScriptHash(clothedCbor, 'V3');
    const scriptAddress = resolvePlutusScriptAddress({ code: clothedCbor, version: 'V3' }, this.networkConfig.networkId(network));
    const assetName = tx.textToHex('zkvapp-group');

    const unsignedTx = await tx.buildGroupMintTransaction({
      provider,
      network,
      policyId,
      assetName,
      clothedCbor,
      createRedeemer: conStr(0, []),
      selectedUtxo,
      walletUtxos,
      walletAddress,
      scriptAddr: scriptAddress,
      mintValue: [
        { unit: 'lovelace', quantity: '5000000' },
        { unit: policyId + assetName, quantity: '1' },
      ],
      groupDatum: tx.createGroupDatum(merkleRoot, paymentKeyHash),
      paymentKeyHash,
      collateralUtxo,
    });
    const { getTxHash } = await this.txNode();
    const txHash = getTxHash(unsignedTx);

    // A new Group mint starts the publish over: previous group/SV state is dropped.
    const mintUtxo = { txHash: selectedUtxo.input.txHash, outputIndex: selectedUtxo.input.outputIndex };
    const state: PublishState = { pending: {} };
    this.setPending(state, txHash, {
      kind: 'group-mint',
      builtAt: Date.now(),
      policyId,
      scriptAddress,
      validatorCbor: clothedCbor,
      mintUtxo,
      walletAddress,
      preMintUtxoRefs: walletUtxos.map(u => this.utxoRef(u)),
    });
    this.writeState(event, state);
    await this.votingEventRepository.save(event);

    return { unsignedTx, txHash, policyId, scriptAddress, mintUtxo };
  }

  // ── Step 2: Semaphore + Voting NFT mint ───────────────────────────────────

  async buildSemaphoreVotingMintTx(
    eventId: number,
    body: { walletAddress: unknown; startingDate: unknown; endingDate: unknown },
  ): Promise<{
    unsignedTx: string;
    txHash: string;
    semaphorePolicyId: string;
    semaphoreScriptAddr: string;
    votingPolicyId: string;
    votingScriptAddr: string;
    mintingOref: OutputRef;
    txValidityEndSlot: number;
  }> {
    const event = await this.loadEvent(eventId);
    const network = this.networkOf(event);
    const { base, headers, provider } = this.chain(network);
    const paymentKeyHash = this.assertWalletAddress(body.walletAddress, network);
    const walletAddress = body.walletAddress as string;

    if (event.votingNft)
      throw new HttpException('This event is already on-chain (Voting NFT minted) — it cannot be published again', HttpStatus.CONFLICT);
    const state = this.readState(event);
    const group = state.group;
    if (!group) throw new HttpException('Mint the Group NFT first (build-group-mint-tx + submit-tx)', HttpStatus.CONFLICT);
    if (group.walletAddress !== walletAddress)
      throw new HttpException('walletAddress differs from the wallet that minted the Group NFT', HttpStatus.BAD_REQUEST);

    const startingDate = Number(body.startingDate);
    const endingDate = Number(body.endingDate);
    if (!Number.isInteger(startingDate) || !Number.isInteger(endingDate) || startingDate <= 0)
      throw new HttpException('startingDate and endingDate must be POSIX seconds', HttpStatus.BAD_REQUEST);
    if (endingDate <= startingDate) throw new HttpException('endingDate must be after startingDate', HttpStatus.BAD_REQUEST);

    const vkeyRef = this.networkConfig.vkeyRef(network);
    if (!vkeyRef) throw new HttpException(`VKey reference UTxO for ${network} not configured`, HttpStatus.SERVICE_UNAVAILABLE);
    const options = this.parseOptions(event);
    if (options.length < 2) throw new HttpException('The event needs at least two options', HttpStatus.BAD_REQUEST);

    // The Group NFT UTxO is the reference input of this tx: it must be indexed first.
    const groupUtxos = await this.fetchAddressUtxos(base, headers, group.scriptAddress);
    const groupNftUtxo = groupUtxos.find(u => u.input.txHash === group.txHash);
    if (!groupNftUtxo)
      throw new RetryableConflict('GROUP_NFT_NOT_INDEXED', 'The Group NFT transaction is not indexed yet — retry in a few seconds');

    // F11: spend only UTxOs that did not exist before the Group mint.
    const preMint = new Set(group.preMintUtxoRefs);
    const walletUtxos = (await this.fetchAddressUtxos(base, headers, walletAddress)).filter(u => !preMint.has(this.utxoRef(u)));
    if (walletUtxos.length === 0)
      throw new RetryableConflict('WALLET_UTXOS_NOT_INDEXED', 'The wallet change of the Group mint is not indexed yet — retry in a few seconds');

    const tx = await this.tx();
    const { selectedUtxo } = tx.selectUtxoAndCreateOutputReference(walletUtxos, 0);
    const collateralUtxo = tx.selectUtxoForCollateral(walletUtxos);
    if (!collateralUtxo)
      throw new HttpException('No suitable collateral UTxO after the Group mint (need one pure-ADA UTxO of at least 5 ADA)', HttpStatus.BAD_REQUEST);

    // Validity window: the voting validator requires the tx to be entirely before event_start.
    //   window = min(120 s, (startingDate − block.time) − 60 s)
    const latest = await this.fetchLatestBlock(base, headers);
    const secondsToStart = startingDate - latest.time;
    if (secondsToStart < MIN_SECONDS_TO_START)
      throw new HttpException(
        `Event start is too soon (only ${Math.round(secondsToStart)}s away). Set the start at least ${MIN_SECONDS_TO_START} seconds from now.`,
        HttpStatus.BAD_REQUEST,
      );
    const txValidityEndSlot = latest.slot + Math.min(120, secondsToStart - 60);

    const networkId = this.networkConfig.networkId(network);
    const mintingOref = { txHash: selectedUtxo.input.txHash, outputIndex: selectedUtxo.input.outputIndex };
    const outputReference = tx.createOutputReference(mintingOref.txHash, mintingOref.outputIndex);
    const semaphoreValidatorCbor = await tx.applyOrefParamToScript(tx.VALIDATORS.semaphore.mint, outputReference);
    const semaphoreScriptAddr = resolvePlutusScriptAddress({ code: semaphoreValidatorCbor, version: 'V3' }, networkId);
    const semaphorePolicyId = resolveScriptHash(semaphoreValidatorCbor, 'V3');
    const votingValidatorCbor = await tx.applyOrefParamToScript(tx.VALIDATORS.voting.mint, outputReference);
    const votingScriptAddr = resolvePlutusScriptAddress({ code: votingValidatorCbor, version: 'V3' }, networkId);
    const votingPolicyId = resolveScriptHash(votingValidatorCbor, 'V3');

    const merkleRoot = BigInt(event.groupMerkleRootHash || '0');
    const semaphoreDatum = conStr(0, [
      byteString(group.policyId),
      integer(merkleRoot),
      byteString('0'.repeat(64)),
      tx.createOutputReference(vkeyRef.txHash, vkeyRef.outputIndex),
    ]);
    const weight = (event.votingPower ?? 0) > 1 ? event.votingPower! : 0;
    // Dates are POSIX seconds; the on-chain validity range is POSIX milliseconds.
    const urnaDatum = tx.createUrnaDatum({
      weight,
      options: tx.generateInitialOptions(options.length),
      eventStart: startingDate * 1000,
      eventEnd: endingDate * 1000,
      semaphoreNftPolicyId: semaphorePolicyId,
    });

    const semaphoreAssetName = tx.textToHex('Semaphore1');
    const votingAssetName = tx.textToHex('VotingEvent1');
    const unsignedTx = await tx.buildSemaphoreVotingMintTransaction({
      provider,
      network,
      txValidityEndSlot,
      groupNftTxHash: groupNftUtxo.input.txHash,
      groupNftOutputIndex: groupNftUtxo.input.outputIndex,
      semaphorePolicyId,
      semaphoreAssetName,
      semaphoreValidatorCbor,
      votingPolicyId,
      votingAssetName,
      votingValidatorCbor,
      selectedUtxo,
      walletUtxos,
      walletAddress,
      semaphoreScriptAddr,
      semaphoreMintValue: [
        { unit: 'lovelace', quantity: '5000000' },
        { unit: semaphorePolicyId + semaphoreAssetName, quantity: '1' },
      ],
      semaphoreDatum,
      votingScriptAddr,
      votingMintValue: [
        { unit: 'lovelace', quantity: '5000000' },
        { unit: votingPolicyId + votingAssetName, quantity: '1' },
      ],
      urnaDatum,
      paymentKeyHash,
      collateralUtxo,
    });
    const { getTxHash } = await this.txNode();
    const txHash = getTxHash(unsignedTx);

    this.setPending(state, txHash, {
      kind: 'sv-mint',
      builtAt: Date.now(),
      semaphorePolicyId,
      semaphoreScriptAddr,
      votingPolicyId,
      votingScriptAddr,
      mintingOref,
      vkeyRef,
      startingDate,
      endingDate,
      walletAddress,
    });
    this.writeState(event, state);
    await this.votingEventRepository.save(event);

    return { unsignedTx, txHash, semaphorePolicyId, semaphoreScriptAddr, votingPolicyId, votingScriptAddr, mintingOref, txValidityEndSlot };
  }

  // ── Fee deposit (fee-deposit networks) ────────────────────────────────────

  async buildFeeDepositTx(
    eventId: number,
    body: { walletAddress: unknown; walletUtxos: unknown },
  ): Promise<{ unsignedTx: string; txHash: string; amountLovelace: string; relayAddress: string }> {
    const event = await this.loadEvent(eventId);
    const network = this.networkOf(event);
    const { provider } = this.chain(network);
    this.assertWalletAddress(body.walletAddress, network);
    const walletAddress = body.walletAddress as string;
    const walletUtxos = this.assertWalletUtxos(body.walletUtxos, network);

    const deposit = await this.votingEventService.getFeeDepositStatus(eventId);
    if (!deposit.required) throw new HttpException(`No fee deposit is required on ${network}`, HttpStatus.BAD_REQUEST);
    if (deposit.funded) throw new HttpException('This event is already funded for all registered voters', HttpStatus.CONFLICT);
    if (!deposit.relayAddress) throw new HttpException(`Relay wallet for ${network} not configured`, HttpStatus.SERVICE_UNAVAILABLE);

    const tx = await this.tx();
    const unsignedTx = await tx.buildPaymentTransaction({
      provider,
      network,
      walletUtxos,
      changeAddress: walletAddress,
      toAddress: deposit.relayAddress,
      lovelace: deposit.missingLovelace,
    });
    const { getTxHash } = await this.txNode();
    const txHash = getTxHash(unsignedTx);

    const state = this.readState(event);
    this.setPending(state, txHash, { kind: 'fee-deposit', builtAt: Date.now(), amountLovelace: deposit.missingLovelace, walletAddress });
    this.writeState(event, state);
    await this.votingEventRepository.save(event);

    return { unsignedTx, txHash, amountLovelace: deposit.missingLovelace, relayAddress: deposit.relayAddress };
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  /**
   * Submits a signed transaction the organiser returned from the wallet — only if its id matches
   * a transaction this service built for the event. Scripts are evaluated before submission
   * (same path as votes: a script failure is reported as 422 and nothing reaches the chain);
   * on success the identifiers computed at build time are persisted.
   */
  async submitTx(eventId: number, body: { signedTx: unknown }): Promise<{ txHash: string; kind: PendingTxKind }> {
    const event = await this.loadEvent(eventId);
    const network = this.networkOf(event);
    const signedTx = body.signedTx;
    if (typeof signedTx !== 'string' || !/^[0-9a-f]+$/i.test(signedTx) || signedTx.length < 100 || signedTx.length > 400_000)
      throw new HttpException('signedTx must be a transaction hex string', HttpStatus.BAD_REQUEST);

    const { getTxHash } = await this.txNode();
    let txHash: string;
    try {
      txHash = getTxHash(signedTx);
    } catch {
      throw new HttpException('signedTx is not a valid transaction', HttpStatus.BAD_REQUEST);
    }
    const state = this.readState(event);
    const pending = state.pending[txHash];
    if (!pending)
      throw new HttpException('This transaction was not built by the server for this event (or was superseded) — rebuild it', HttpStatus.CONFLICT);

    let result: { txHash: string };
    try {
      result = await this.votingEventService.submitSignedTx(signedTx, network);
    } catch (err: any) {
      // A wallet UTxO the node does not know: already spent (e.g. by a fee deposit or a previous
      // publish attempt the wallet still lists) or not yet indexed. Evaluation catches it before
      // anything reaches the chain. The built tx is useless — drop it and let the organiser retry
      // with fresh UTxOs (the frontend does that by itself).
      const text = err instanceof HttpException ? JSON.stringify(err.getResponse()) : String(err?.message ?? err);
      const unknownInput = text.match(/Unknown transaction input[\s\S]*?([0-9a-f]{64}#\d+)/i);
      if (unknownInput || /BadInputsUTxO/.test(text)) {
        delete state.pending[txHash];
        this.writeState(event, state);
        await this.votingEventRepository.save(event);
        throw new RetryableConflict(
          'STALE_INPUT',
          `A wallet UTxO in this transaction is unknown to the node (already spent or not yet indexed${unknownInput ? `: ${unknownInput[1]}` : ''}). Wait a few seconds and start the step again.`,
        );
      }
      throw err;
    }
    if (result.txHash.toLowerCase() !== txHash) console.warn(`[submitTx] node returned ${result.txHash}, expected ${txHash}`);

    delete state.pending[txHash];
    switch (pending.kind) {
      case 'group-mint': {
        state.group = {
          policyId: pending.policyId,
          scriptAddress: pending.scriptAddress,
          validatorCbor: pending.validatorCbor,
          mintUtxo: pending.mintUtxo,
          txHash,
          walletAddress: pending.walletAddress,
          preMintUtxoRefs: pending.preMintUtxoRefs,
        };
        event.groupNft = pending.policyId;
        event.groupValidatorAddress = pending.scriptAddress;
        event.groupValidatorCbor = pending.validatorCbor;
        this.mergeBlockchainData(event, {
          groupNft: pending.policyId,
          groupValidatorAddress: pending.scriptAddress,
          groupValidatorCbor: pending.validatorCbor,
          walletAddress: pending.walletAddress,
          txHashes: { groupMint: txHash },
        });
        this.writeState(event, state);
        break;
      }
      case 'sv-mint': {
        event.semaphoreNft = pending.semaphorePolicyId;
        event.semaphoreAddress = pending.semaphoreScriptAddr;
        event.votingNft = pending.votingPolicyId;
        event.votingValidatorAddress = pending.votingScriptAddr;
        event.mintingOrefTxHash = pending.mintingOref.txHash;
        event.mintingOrefIndex = pending.mintingOref.outputIndex;
        event.vkeyRefTxHash = pending.vkeyRef.txHash;
        event.vkeyRefIndex = pending.vkeyRef.outputIndex;
        event.startingDate = pending.startingDate;
        event.endingDate = pending.endingDate;
        // Snapshot the group tree: SemaphoreDatum.group_merke_root is fixed at mint time.
        if (!event.semaphoreMerkleRoot) {
          event.semaphoreMerkleRoot = event.groupMerkleRootHash;
          event.semaphoreLeafCommitments = event.groupLeafCommitments;
        }
        this.mergeBlockchainData(event, {
          semaphoreNft: pending.semaphorePolicyId,
          semaphoreAddress: pending.semaphoreScriptAddr,
          votingNft: pending.votingPolicyId,
          votingValidatorAddress: pending.votingScriptAddr,
          mintingOrefTxHash: pending.mintingOref.txHash,
          mintingOrefIndex: pending.mintingOref.outputIndex,
          txHashes: { semaphoreVotingMint: txHash },
          mintedAt: Date.now(),
        });
        this.writeState(event, null); // publish complete
        break;
      }
      case 'fee-deposit':
        // confirm-fee-deposit books the budget once the tx is on-chain.
        this.writeState(event, state);
        break;
    }
    await this.votingEventRepository.save(event);
    console.log(`[organiserTx] event ${eventId} (${network}): ${pending.kind} submitted as ${txHash}`);
    return { txHash, kind: pending.kind };
  }

  // ── Confirmation polling ──────────────────────────────────────────────────

  async getTxStatus(eventId: number, txHash: string): Promise<{ txHash: string; confirmed: boolean; blockHeight: number | null }> {
    const event = await this.loadEvent(eventId);
    if (typeof txHash !== 'string' || !TX_HASH_RE.test(txHash))
      throw new HttpException('txHash must be a 64-character hex string', HttpStatus.BAD_REQUEST);
    const { base, headers } = this.chain(this.networkOf(event));
    const res = await fetch(`${base}/txs/${txHash.toLowerCase()}`, { headers });
    if (res.status === 404) return { txHash: txHash.toLowerCase(), confirmed: false, blockHeight: null };
    if (!res.ok) throw new HttpException(`Blockfrost error fetching the transaction (${res.status})`, HttpStatus.BAD_GATEWAY);
    const info: any = await res.json();
    return { txHash: txHash.toLowerCase(), confirmed: true, blockHeight: Number(info.block_height ?? 0) || null };
  }

  // ── Small helpers ─────────────────────────────────────────────────────────

  private parseOptions(event: VotingEvent): unknown[] {
    try {
      const parsed = JSON.parse(event.options ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private mergeBlockchainData(event: VotingEvent, patch: Record<string, any>): void {
    let current: Record<string, any> = {};
    try {
      current = event.blockchainData ? JSON.parse(event.blockchainData) : {};
    } catch {
      current = {};
    }
    const txHashes = { ...(current.txHashes ?? {}), ...(patch.txHashes ?? {}) };
    event.blockchainData = JSON.stringify({ ...current, ...patch, txHashes });
  }
}
