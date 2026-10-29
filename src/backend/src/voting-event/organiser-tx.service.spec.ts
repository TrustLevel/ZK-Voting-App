jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { MeshWallet } from '@meshsdk/core';
import { OrganiserTxService } from './organiser-tx.service';
import { VotingEvent } from './voting-event.entity';
import { NetworkConfig } from '../network/network-config';

// Env of a server that serves both networks (placeholders, not real keys).
const TEST_MNEMONIC = Array(23).fill('abandon').concat('art').join(' ');
const bothNetworksEnv: Record<string, string> = {
  BLOCKFROST_API_KEY: 'preprodLegacyKey',
  BLOCKFROST_API_KEY_MAINNET: 'mainnetKey',
  RELAY_WALLET_MNEMONIC: TEST_MNEMONIC,
  RELAY_WALLET_MNEMONIC_MAINNET: TEST_MNEMONIC,
  VKEY_REF_MAINNET: 'a'.repeat(64) + '#0',
};
const configWith = (env: Record<string, string>) => ({ get: jest.fn((k: string) => env[k]) }) as unknown as ConfigService;

const HASH_A = '1'.repeat(64);
const HASH_B = '2'.repeat(64);
const HASH_C = '3'.repeat(64);
const SCRIPT_ADDRESS_PREPROD = 'addr_test1wzl94ddu5xplr7p8f55ldtxjvw6cqqsh57jkj4vndwthtkgdw2fq8';
const MERKLE_ROOT = '18294709324987123733638749701660864052903047706621346238354131364456493772435';

const utxo = (txHash: string, outputIndex: number, address: string, lovelace: string, extra: Array<{ unit: string; quantity: string }> = []) => ({
  input: { txHash, outputIndex },
  output: { address, amount: [{ unit: 'lovelace', quantity: lovelace }, ...extra] },
});

const makeEvent = (overrides: Partial<VotingEvent> = {}): VotingEvent =>
  ({
    eventId: 42,
    eventName: 'Test',
    network: 'preprod',
    groupMerkleRootHash: MERKLE_ROOT,
    groupLeafCommitments: '["1","2"]',
    options: JSON.stringify([{ index: 0, text: 'A' }, { index: 1, text: 'B' }]),
    votingPower: 1,
    votingNft: null,
    semaphoreMerkleRoot: null,
    blockchainData: null,
    publishState: null,
    ...overrides,
  }) as VotingEvent;

describe('OrganiserTxService', () => {
  let service: OrganiserTxService;
  let repo: { findOne: jest.Mock; save: jest.Mock };
  let votingEventService: { getFeeDepositStatus: jest.Mock; submitSignedTx: jest.Mock };
  let env: Record<string, string>;
  let txMock: Record<string, jest.Mock | any>;
  let txNodeMock: { getTxHash: jest.Mock };
  let preprodAddress: string;
  let mainnetAddress: string;

  beforeAll(async () => {
    const words = TEST_MNEMONIC.split(' ');
    preprodAddress = await new MeshWallet({ networkId: 0, key: { type: 'mnemonic', words } }).getChangeAddress();
    mainnetAddress = await new MeshWallet({ networkId: 1, key: { type: 'mnemonic', words } }).getChangeAddress();
  });

  beforeEach(() => {
    repo = { findOne: jest.fn(), save: jest.fn(async (e: VotingEvent) => e) };
    votingEventService = {
      getFeeDepositStatus: jest.fn(async () => ({ required: false, funded: true, missingLovelace: '0', relayAddress: preprodAddress })),
      submitSignedTx: jest.fn(async () => ({ txHash: HASH_C })),
    };
    env = { ...bothNetworksEnv };
    service = new OrganiserTxService(repo as any, new NetworkConfig(configWith(env)), votingEventService as any);

    // The @src/tx builders are exercised by the tx module's own tests; here they are stubbed.
    txMock = {
      VALIDATORS: { group: { mint: '4e4d01000033222220051200120011' }, semaphore: { mint: '4e4d01000033222220051200120022' }, voting: { mint: '4e4d01000033222220051200120033' } },
      selectUtxoAndCreateOutputReference: jest.fn((utxos: any[], i = 0) => ({ selectedUtxo: utxos[i], outputReference: {} })),
      selectUtxoForCollateral: jest.fn((utxos: any[]) => utxos.find(u => u.output.amount.length === 1 && BigInt(u.output.amount[0].quantity) >= 5_000_000n)),
      createOutputReference: jest.fn((txHash: string, outputIndex: number) => ({ constructor: 0, fields: [{ bytes: txHash }, { int: outputIndex }] })),
      applyOrefParamToScript: jest.fn(async (cbor: string, oref: any) => cbor + oref.fields[0].bytes.slice(0, 8)),
      textToHex: jest.fn((t: string) => Buffer.from(t).toString('hex')),
      createGroupDatum: jest.fn(() => ({ datum: 'group' })),
      createUrnaDatum: jest.fn(() => ({ datum: 'urna' })),
      generateInitialOptions: jest.fn((n: number) => Array(n).fill(0)),
      buildGroupMintTransaction: jest.fn(async () => 'unsigned-group-tx'),
      buildSemaphoreVotingMintTransaction: jest.fn(async () => 'unsigned-sv-tx'),
      buildPaymentTransaction: jest.fn(async () => 'unsigned-payment-tx'),
    };
    txNodeMock = { getTxHash: jest.fn((hex: string) => (hex.includes('group') ? HASH_A : hex.includes('sv') ? HASH_B : HASH_C)) };
    jest.spyOn(service as any, 'tx').mockResolvedValue(txMock);
    jest.spyOn(service as any, 'txNode').mockResolvedValue(txNodeMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  // Captures fetch calls (url + project_id header) and answers them from a handler.
  const mockFetch = (handler: (url: string) => { status: number; body?: any }) => {
    const calls: Array<{ url: string; key: string }> = [];
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
      calls.push({ url, key: init?.headers?.project_id });
      const r = handler(url);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body ?? '') };
    });
    return calls;
  };

  const expectHttp = async (p: Promise<unknown>, status: number, messagePart?: string) => {
    await expect(p).rejects.toBeInstanceOf(HttpException);
    try {
      await p;
    } catch (e: any) {
      expect(e.getStatus()).toBe(status);
      if (messagePart) expect(JSON.stringify(e.getResponse())).toContain(messagePart);
      return e;
    }
  };

  const stateOf = (event: VotingEvent) => JSON.parse(event.publishState ?? '{}');

  describe('input validation', () => {
    it('accepts a payment-key address of the event network and returns its key hash', () => {
      expect(service.assertWalletAddress(preprodAddress, 'preprod')).toMatch(/^[0-9a-f]{56}$/);
      expect(service.assertWalletAddress(mainnetAddress, 'mainnet')).toMatch(/^[0-9a-f]{56}$/);
    });

    it('rejects an address of the other network, a script address and garbage', () => {
      expect(() => service.assertWalletAddress(mainnetAddress, 'preprod')).toThrow(/not a preprod address/);
      expect(() => service.assertWalletAddress(preprodAddress, 'mainnet')).toThrow(/not a mainnet address/);
      expect(() => service.assertWalletAddress(SCRIPT_ADDRESS_PREPROD, 'preprod')).toThrow(/payment-key address/);
      expect(() => service.assertWalletAddress('addr_test1qnotanaddress', 'preprod')).toThrow(/not a valid/);
      expect(() => service.assertWalletAddress(42, 'preprod')).toThrow(/required/);
    });

    it('reduces wallet UTxOs to the fields the builders use and drops script-address entries', () => {
      const clean = service.assertWalletUtxos(
        [
          { ...utxo(HASH_A.toUpperCase(), 0, preprodAddress, '7000000'), extra: 'ignored' },
          utxo(HASH_B, 1, SCRIPT_ADDRESS_PREPROD, '2000000'),
        ],
        'preprod',
      );
      expect(clean).toEqual([utxo(HASH_A, 0, preprodAddress, '7000000')]);
    });

    it('rejects malformed UTxOs and UTxOs of the other network', () => {
      expect(() => service.assertWalletUtxos([utxo('abc', 0, preprodAddress, '1')], 'preprod')).toThrow(/txHash/);
      expect(() => service.assertWalletUtxos([utxo(HASH_A, -1, preprodAddress, '1')], 'preprod')).toThrow(/outputIndex/);
      expect(() => service.assertWalletUtxos([utxo(HASH_A, 0, preprodAddress, '1.5')], 'preprod')).toThrow(/quantity/);
      expect(() => service.assertWalletUtxos([utxo(HASH_A, 0, mainnetAddress, '1')], 'preprod')).toThrow(/preprod address/);
      expect(() => service.assertWalletUtxos([{ input: { txHash: HASH_A, outputIndex: 0 }, output: { address: preprodAddress, amount: [{ unit: 'abc', quantity: '1' }] } }], 'preprod')).toThrow(/lovelace|unit/);
      expect(() => service.assertWalletUtxos([], 'preprod')).toThrow(/non-empty/);
      expect(() => service.assertWalletUtxos(Array(301).fill(utxo(HASH_A, 0, preprodAddress, '1')), 'preprod')).toThrow(/at most 300/);
    });
  });

  describe('buildGroupMintTx', () => {
    const body = () => ({ walletAddress: preprodAddress, walletUtxos: [utxo(HASH_A, 0, preprodAddress, '20000000'), utxo(HASH_A, 1, preprodAddress, '6000000')] });

    it('refuses an event that is already on-chain (409)', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ votingNft: 'deadbeef' }));
      await expectHttp(service.buildGroupMintTx(42, body()), 409, 'already on-chain');
    });

    it('refuses a fee-deposit network event without a funded deposit (402)', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ network: 'mainnet' }));
      votingEventService.getFeeDepositStatus.mockResolvedValue({ required: true, funded: false, missingLovelace: '2600000' });
      await expectHttp(service.buildGroupMintTx(42, { walletAddress: mainnetAddress, walletUtxos: [utxo(HASH_A, 0, mainnetAddress, '20000000')] }), 402, '2600000');
    });

    it('refuses when the event network is not enabled on this server (503)', async () => {
      delete env.BLOCKFROST_API_KEY_MAINNET;
      repo.findOne.mockResolvedValue(makeEvent({ network: 'mainnet' }));
      await expectHttp(service.buildGroupMintTx(42, { walletAddress: mainnetAddress, walletUtxos: [utxo(HASH_A, 0, mainnetAddress, '20000000')] }), 503, 'not enabled');
    });

    it('rejects a wallet without a collateral UTxO (400)', async () => {
      repo.findOne.mockResolvedValue(makeEvent());
      const b = { walletAddress: preprodAddress, walletUtxos: [utxo(HASH_A, 0, preprodAddress, '20000000', [{ unit: 'a'.repeat(56), quantity: '1' }])] };
      await expectHttp(service.buildGroupMintTx(42, b), 400, 'collateral');
    });

    it('builds with the event network, derives the key hash server-side and remembers the pre-mint UTxOs', async () => {
      const event = makeEvent();
      repo.findOne.mockResolvedValue(event);
      const res = await service.buildGroupMintTx(42, body());

      expect(res.unsignedTx).toBe('unsigned-group-tx');
      expect(res.txHash).toBe(HASH_A);
      expect(res.scriptAddress).toMatch(/^addr_test1w/);
      expect(res.mintUtxo).toEqual({ txHash: HASH_A, outputIndex: 0 });
      const args = txMock.buildGroupMintTransaction.mock.calls[0][0];
      expect(args.network).toBe('preprod');
      expect(args.paymentKeyHash).toBe(service.assertWalletAddress(preprodAddress, 'preprod'));
      expect(args.walletAddress).toBe(preprodAddress);
      expect(args.collateralUtxo.input.outputIndex).toBe(0); // first pure-ADA UTxO ≥ 5 ADA (same selector as before)
      expect(txMock.createGroupDatum).toHaveBeenCalledWith(BigInt(MERKLE_ROOT), args.paymentKeyHash);

      const state = stateOf(event);
      expect(state.pending[HASH_A].kind).toBe('group-mint');
      expect(state.pending[HASH_A].preMintUtxoRefs).toEqual([`${HASH_A}#0`, `${HASH_A}#1`]);
      expect(state.group).toBeUndefined();
      expect(repo.save).toHaveBeenCalledWith(event);
    });

    it('on mainnet derives mainnet script addresses', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ network: 'mainnet' }));
      const res = await service.buildGroupMintTx(42, { walletAddress: mainnetAddress, walletUtxos: [utxo(HASH_A, 0, mainnetAddress, '20000000'), utxo(HASH_A, 1, mainnetAddress, '6000000')] });
      expect(res.scriptAddress).toMatch(/^addr1w/);
      expect(txMock.buildGroupMintTransaction.mock.calls[0][0].network).toBe('mainnet');
    });

    it('a rebuilt Group mint replaces the previous publish state', async () => {
      const event = makeEvent({ publishState: JSON.stringify({ group: { txHash: 'old' }, pending: { [HASH_C]: { kind: 'sv-mint' } } }) });
      repo.findOne.mockResolvedValue(event);
      await service.buildGroupMintTx(42, body());
      const state = stateOf(event);
      expect(state.group).toBeUndefined();
      expect(Object.keys(state.pending)).toEqual([HASH_A]);
    });
  });

  describe('buildSemaphoreVotingMintTx', () => {
    const groupState = (network: 'preprod' | 'mainnet', walletAddress: string) => ({
      group: {
        policyId: 'b'.repeat(56),
        scriptAddress: network === 'mainnet' ? 'addr1w' + 'x'.repeat(10) : SCRIPT_ADDRESS_PREPROD,
        validatorCbor: 'cbor',
        mintUtxo: { txHash: HASH_A, outputIndex: 0 },
        txHash: HASH_B,
        walletAddress,
        preMintUtxoRefs: [`${HASH_A}#0`, `${HASH_A}#1`],
      },
      pending: {},
    });
    const now = 1_800_000_000;
    const bfUtxo = (tx_hash: string, output_index: number, address: string, lovelace: string) => ({ tx_hash, output_index, address, amount: [{ unit: 'lovelace', quantity: lovelace }] });

    it('requires the Group mint first (409)', async () => {
      repo.findOne.mockResolvedValue(makeEvent());
      await expectHttp(service.buildSemaphoreVotingMintTx(42, { walletAddress: preprodAddress, startingDate: now + 600, endingDate: now + 7200 }), 409, 'Group NFT first');
    });

    it('answers a retryable 409 while the Group NFT is not indexed', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ publishState: JSON.stringify(groupState('preprod', preprodAddress)) }));
      mockFetch(() => ({ status: 200, body: [] }));
      const e = await expectHttp(service.buildSemaphoreVotingMintTx(42, { walletAddress: preprodAddress, startingDate: now + 600, endingDate: now + 7200 }), 409);
      expect(e.getResponse().code).toBe('GROUP_NFT_NOT_INDEXED');
    });

    it('answers a retryable 409 while only pre-mint wallet UTxOs are indexed (F11)', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ publishState: JSON.stringify(groupState('preprod', preprodAddress)) }));
      mockFetch((url) => {
        if (url.includes(`/addresses/${SCRIPT_ADDRESS_PREPROD}/utxos`)) return { status: 200, body: [bfUtxo(HASH_B, 0, SCRIPT_ADDRESS_PREPROD, '5000000')] };
        if (url.includes(`/addresses/${preprodAddress}/utxos`)) return { status: 200, body: [bfUtxo(HASH_A, 0, preprodAddress, '20000000'), bfUtxo(HASH_A, 1, preprodAddress, '6000000')] };
        return { status: 500 };
      });
      const e = await expectHttp(service.buildSemaphoreVotingMintTx(42, { walletAddress: preprodAddress, startingDate: now + 600, endingDate: now + 7200 }), 409);
      expect(e.getResponse().code).toBe('WALLET_UTXOS_NOT_INDEXED');
    });

    it('rejects an event start less than 90 s away (400) and end before start', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ publishState: JSON.stringify(groupState('preprod', preprodAddress)) }));
      mockFetch((url) => {
        if (url.includes(`/addresses/${SCRIPT_ADDRESS_PREPROD}/utxos`)) return { status: 200, body: [bfUtxo(HASH_B, 0, SCRIPT_ADDRESS_PREPROD, '5000000')] };
        if (url.includes(`/addresses/${preprodAddress}/utxos`)) return { status: 200, body: [bfUtxo(HASH_B, 1, preprodAddress, '14000000'), bfUtxo(HASH_A, 1, preprodAddress, '6000000')] };
        if (url.endsWith('/blocks/latest')) return { status: 200, body: { slot: 1000, time: now } };
        return { status: 500 };
      });
      await expectHttp(service.buildSemaphoreVotingMintTx(42, { walletAddress: preprodAddress, startingDate: now + 30, endingDate: now + 7200 }), 400, 'too soon');
      await expectHttp(service.buildSemaphoreVotingMintTx(42, { walletAddress: preprodAddress, startingDate: now + 600, endingDate: now + 600 }), 400, 'after startingDate');
    });

    it('spends only the Group-mint change, uses the event network key and stores the pending SV mint', async () => {
      const event = makeEvent({ network: 'mainnet', votingPower: 3, publishState: JSON.stringify(groupState('mainnet', mainnetAddress)) });
      repo.findOne.mockResolvedValue(event);
      const groupAddr = groupState('mainnet', mainnetAddress).group.scriptAddress;
      const calls = mockFetch((url) => {
        if (url.includes(`/addresses/${groupAddr}/utxos`)) return { status: 200, body: [bfUtxo(HASH_B, 0, groupAddr, '5000000')] };
        if (url.includes(`/addresses/${mainnetAddress}/utxos`))
          return { status: 200, body: [bfUtxo(HASH_A, 0, mainnetAddress, '20000000'), bfUtxo(HASH_B, 1, mainnetAddress, '14000000'), bfUtxo(HASH_B, 2, mainnetAddress, '6000000')] };
        if (url.endsWith('/blocks/latest')) return { status: 200, body: { slot: 5000, time: now } };
        return { status: 500 };
      });

      const res = await service.buildSemaphoreVotingMintTx(42, { walletAddress: mainnetAddress, startingDate: now + 600, endingDate: now + 7200 });

      expect(calls.every(c => c.url.startsWith('https://cardano-mainnet.blockfrost.io/') && c.key === 'mainnetKey')).toBe(true);
      const args = txMock.buildSemaphoreVotingMintTransaction.mock.calls[0][0];
      expect(args.network).toBe('mainnet');
      expect(args.groupNftTxHash).toBe(HASH_B);
      expect(args.walletUtxos.map((u: any) => `${u.input.txHash}#${u.input.outputIndex}`)).toEqual([`${HASH_B}#1`, `${HASH_B}#2`]);
      expect(args.selectedUtxo.input).toEqual({ txHash: HASH_B, outputIndex: 1 });
      expect(args.collateralUtxo.input).toEqual({ txHash: HASH_B, outputIndex: 1 }); // same selector as the old browser flow: first pure-ADA UTxO ≥ 5 ADA
      expect(args.txValidityEndSlot).toBe(5000 + 120);
      expect(txMock.createUrnaDatum).toHaveBeenCalledWith(expect.objectContaining({ weight: 3, eventStart: (now + 600) * 1000, eventEnd: (now + 7200) * 1000 }));
      expect(res.semaphoreScriptAddr).toMatch(/^addr1w/);
      expect(res.mintingOref).toEqual({ txHash: HASH_B, outputIndex: 1 });

      const pending = stateOf(event).pending[HASH_B];
      expect(pending.kind).toBe('sv-mint');
      expect(pending.vkeyRef).toEqual({ txHash: 'a'.repeat(64), outputIndex: 0 });
      expect(pending.startingDate).toBe(now + 600);
      expect(stateOf(event).group.txHash).toBe(HASH_B);
    });
  });

  describe('buildFeeDepositTx', () => {
    const body = () => ({ walletAddress: mainnetAddress, walletUtxos: [utxo(HASH_A, 0, mainnetAddress, '20000000')] });

    it('refuses on a network without fee deposit (400) and a funded event (409)', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ network: 'mainnet' }));
      votingEventService.getFeeDepositStatus.mockResolvedValue({ required: false, funded: true });
      await expectHttp(service.buildFeeDepositTx(42, body()), 400, 'No fee deposit');
      votingEventService.getFeeDepositStatus.mockResolvedValue({ required: true, funded: true });
      await expectHttp(service.buildFeeDepositTx(42, body()), 409, 'already funded');
    });

    it('pays the missing amount (computed server-side) to the relay address', async () => {
      const event = makeEvent({ network: 'mainnet' });
      repo.findOne.mockResolvedValue(event);
      votingEventService.getFeeDepositStatus.mockResolvedValue({ required: true, funded: false, missingLovelace: '2600000', relayAddress: mainnetAddress });
      const res = await service.buildFeeDepositTx(42, body());
      const args = txMock.buildPaymentTransaction.mock.calls[0][0];
      expect(args).toMatchObject({ network: 'mainnet', toAddress: mainnetAddress, lovelace: '2600000', changeAddress: mainnetAddress });
      expect(res).toMatchObject({ unsignedTx: 'unsigned-payment-tx', txHash: HASH_C, amountLovelace: '2600000' });
      expect(stateOf(event).pending[HASH_C].kind).toBe('fee-deposit');
    });
  });

  describe('submitTx', () => {
    const signed = 'a'.repeat(200);

    it('rejects non-hex input (400) and a transaction the server did not build (409)', async () => {
      repo.findOne.mockResolvedValue(makeEvent());
      await expectHttp(service.submitTx(42, { signedTx: 'zz' }), 400);
      txNodeMock.getTxHash.mockReturnValue(HASH_C);
      await expectHttp(service.submitTx(42, { signedTx: signed }), 409, 'not built by the server');
      expect(votingEventService.submitSignedTx).not.toHaveBeenCalled();
    });

    it('submits a pending Group mint with the event network and persists the Group NFT', async () => {
      const event = makeEvent({
        network: 'mainnet',
        publishState: JSON.stringify({
          pending: { [HASH_A]: { kind: 'group-mint', policyId: 'p'.repeat(56), scriptAddress: 'addr1wgroup', validatorCbor: 'cbor', mintUtxo: { txHash: HASH_A, outputIndex: 0 }, walletAddress: mainnetAddress, preMintUtxoRefs: [`${HASH_A}#0`] } },
        }),
      });
      repo.findOne.mockResolvedValue(event);
      txNodeMock.getTxHash.mockReturnValue(HASH_A);

      const res = await service.submitTx(42, { signedTx: signed });

      expect(votingEventService.submitSignedTx).toHaveBeenCalledWith(signed, 'mainnet');
      expect(res).toEqual({ txHash: HASH_A, kind: 'group-mint' });
      expect(event.groupNft).toBe('p'.repeat(56));
      expect(event.groupValidatorAddress).toBe('addr1wgroup');
      expect(event.groupValidatorCbor).toBe('cbor');
      const state = stateOf(event);
      expect(state.pending).toEqual({});
      expect(state.group).toMatchObject({ txHash: HASH_A, policyId: 'p'.repeat(56), preMintUtxoRefs: [`${HASH_A}#0`] });
      expect(JSON.parse(event.blockchainData!).txHashes.groupMint).toBe(HASH_A);
    });

    it('submits a pending SV mint, persists identifiers, dates and the Merkle snapshot, and closes the publish', async () => {
      const event = makeEvent({
        blockchainData: JSON.stringify({ groupNft: 'g', txHashes: { groupMint: HASH_A } }),
        publishState: JSON.stringify({
          group: { txHash: HASH_A },
          pending: {
            [HASH_B]: {
              kind: 'sv-mint', semaphorePolicyId: 's'.repeat(56), semaphoreScriptAddr: 'addr_test1wsem', votingPolicyId: 'v'.repeat(56), votingScriptAddr: 'addr_test1wvot',
              mintingOref: { txHash: HASH_B, outputIndex: 1 }, vkeyRef: { txHash: '3dc5', outputIndex: 0 }, startingDate: 1_800_000_600, endingDate: 1_800_007_200, walletAddress: preprodAddress,
            },
          },
        }),
      });
      repo.findOne.mockResolvedValue(event);
      txNodeMock.getTxHash.mockReturnValue(HASH_B);

      const res = await service.submitTx(42, { signedTx: signed });

      expect(votingEventService.submitSignedTx).toHaveBeenCalledWith(signed, 'preprod');
      expect(res).toEqual({ txHash: HASH_B, kind: 'sv-mint' });
      expect(event).toMatchObject({
        semaphoreNft: 's'.repeat(56), semaphoreAddress: 'addr_test1wsem', votingNft: 'v'.repeat(56), votingValidatorAddress: 'addr_test1wvot',
        mintingOrefTxHash: HASH_B, mintingOrefIndex: 1, vkeyRefTxHash: '3dc5', vkeyRefIndex: 0, startingDate: 1_800_000_600, endingDate: 1_800_007_200,
        semaphoreMerkleRoot: MERKLE_ROOT, semaphoreLeafCommitments: '["1","2"]', publishState: null,
      });
      const bd = JSON.parse(event.blockchainData!);
      expect(bd.txHashes).toEqual({ groupMint: HASH_A, semaphoreVotingMint: HASH_B });
      expect(bd.groupNft).toBe('g');
    });

    it('maps an unknown input (stale wallet UTxO) to a retryable 409 and drops the pending entry', async () => {
      const event = makeEvent({ publishState: JSON.stringify({ pending: { [HASH_A]: { kind: 'group-mint', policyId: 'p', scriptAddress: 'a', validatorCbor: 'c', mintUtxo: {}, walletAddress: preprodAddress, preMintUtxoRefs: [] } } }) });
      repo.findOne.mockResolvedValue(event);
      txNodeMock.getTxHash.mockReturnValue(HASH_A);
      votingEventService.submitSignedTx.mockRejectedValue(
        new HttpException(`Script evaluation failed — collateral NOT taken.\nScriptFailures:\n{"mint:0":{"CannotCreateEvaluationContext":{"reason":"Unknown transaction input (missing from UTxO set): ${HASH_C}#2"}}}`, 422),
      );
      const e = await expectHttp(service.submitTx(42, { signedTx: signed }), 409, `${HASH_C}#2`);
      expect(e.getResponse().code).toBe('STALE_INPUT');
      expect(stateOf(event).pending).toEqual({});
      expect(event.groupNft).toBeUndefined();
    });

    it('keeps the pending entry when the node rejects the transaction', async () => {
      const event = makeEvent({ publishState: JSON.stringify({ pending: { [HASH_A]: { kind: 'group-mint', policyId: 'p', scriptAddress: 'a', validatorCbor: 'c', mintUtxo: {}, walletAddress: preprodAddress, preMintUtxoRefs: [] } } }) });
      repo.findOne.mockResolvedValue(event);
      txNodeMock.getTxHash.mockReturnValue(HASH_A);
      votingEventService.submitSignedTx.mockRejectedValue(new HttpException('Blockfrost submission failed', 502));
      await expectHttp(service.submitTx(42, { signedTx: signed }), 502);
      expect(stateOf(event).pending[HASH_A]).toBeDefined();
      expect(event.groupNft).toBeUndefined();
    });
  });

  describe('getTxStatus', () => {
    it('reports confirmation from Blockfrost with the event network key', async () => {
      repo.findOne.mockResolvedValue(makeEvent({ network: 'mainnet' }));
      const calls = mockFetch((url) => (url.endsWith(`/txs/${HASH_A}`) ? { status: 200, body: { block_height: 123 } } : { status: 404 }));
      expect(await service.getTxStatus(42, HASH_A)).toEqual({ txHash: HASH_A, confirmed: true, blockHeight: 123 });
      expect(await service.getTxStatus(42, HASH_B)).toEqual({ txHash: HASH_B, confirmed: false, blockHeight: null });
      expect(calls[0]).toEqual({ url: `https://cardano-mainnet.blockfrost.io/api/v0/txs/${HASH_A}`, key: 'mainnetKey' });
    });

    it('rejects a malformed hash (400)', async () => {
      repo.findOne.mockResolvedValue(makeEvent());
      await expectHttp(service.getTxStatus(42, 'nope'), 400);
    });
  });
});
