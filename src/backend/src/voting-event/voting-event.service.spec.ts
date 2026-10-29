jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { VotingEventService } from './voting-event.service';
import { VotingEvent } from './voting-event.entity';
import { InvitationToken } from './invitation-token.entity';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { NetworkConfig, FEE_PER_VOTE_LOVELACE } from '../network/network-config';
import { HttpException } from '@nestjs/common';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

// Env of a server that serves both networks (values are placeholders, not real keys).
// Standard BIP39 test vector (valid checksum), never funded.
const TEST_MNEMONIC = Array(23).fill('abandon').concat('art').join(' ');
const bothNetworksEnv: Record<string, string> = {
  BLOCKFROST_API_KEY: 'preprodLegacyKey',
  BLOCKFROST_API_KEY_MAINNET: 'mainnetKey',
  RELAY_WALLET_MNEMONIC: TEST_MNEMONIC,
  RELAY_WALLET_MNEMONIC_MAINNET: TEST_MNEMONIC,
  VKEY_REF_MAINNET: 'a'.repeat(64) + '#0',
};
const configWith = (env: Record<string, string>) => ({ get: jest.fn((k: string) => env[k]) }) as unknown as ConfigService;

describe('VotingEventService', () => {
  let service: VotingEventService;
  let votingEventRepo: ReturnType<typeof mockRepository>;
  let env: Record<string, string>;

  beforeEach(async () => {
    votingEventRepo = mockRepository();
    env = { ...bothNetworksEnv };
    const configService = configWith(env);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingEventService,
        { provide: getRepositoryToken(VotingEvent), useValue: votingEventRepo },
        { provide: getRepositoryToken(InvitationToken), useValue: mockRepository() },
        { provide: ConfigService, useValue: configService },
        { provide: NetworkConfig, useValue: new NetworkConfig(configService) },
        { provide: UsersService, useValue: {} },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();

    service = module.get<VotingEventService>(VotingEventService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  // Captures fetch calls and answers them from a handler.
  const mockFetch = (handler: (url: string, init?: any) => { status: number; body?: any; text?: string }) => {
    const calls: string[] = [];
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
      calls.push(url);
      const r = handler(url, init);
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => r.body,
        text: async () => r.text ?? JSON.stringify(r.body ?? ''),
      };
    });
    return calls;
  };

  describe('NetworkConfig', () => {
    it('falls back to the legacy single-network variables for preprod only', () => {
      const nc = new NetworkConfig(configWith({ BLOCKFROST_API_KEY: 'preprodX', RELAY_WALLET_MNEMONIC: TEST_MNEMONIC }));
      expect(nc.blockfrostApiKey('preprod')).toBe('preprodX');
      expect(nc.blockfrostApiKey('mainnet')).toBeNull();
      expect(nc.relayMnemonic('preprod')).toBe(TEST_MNEMONIC);
      expect(nc.relayMnemonic('mainnet')).toBeNull();
      expect(nc.isEnabled('preprod')).toBe(true);
      expect(nc.isEnabled('mainnet')).toBe(false);
    });

    it('preprod stays enabled without a relay wallet (as before: creating works, relaying answers 503)', async () => {
      const nc = new NetworkConfig(configWith({ BLOCKFROST_API_KEY: 'preprodX' }));
      expect(nc.isEnabled('preprod')).toBe(true);
      expect((await nc.describe('preprod')).relayConfigured).toBe(false);
    });

    it('prefers the per-network variables when both are set', () => {
      const nc = new NetworkConfig(configWith({ BLOCKFROST_API_KEY: 'legacy', BLOCKFROST_API_KEY_PREPROD: 'preprodNew', BLOCKFROST_API_KEY_MAINNET: 'mainnetNew' }));
      expect(nc.blockfrostApiKey('preprod')).toBe('preprodNew');
      expect(nc.blockfrostApiKey('mainnet')).toBe('mainnetNew');
      expect(nc.blockfrostBaseUrl('mainnet')).toBe('https://cardano-mainnet.blockfrost.io/api/v0');
      expect(nc.blockfrostBaseUrl('preprod')).toBe('https://cardano-preprod.blockfrost.io/api/v0');
      expect(nc.networkId('mainnet')).toBe(1);
      expect(nc.networkId('preprod')).toBe(0);
    });

    it('mainnet is only enabled with a key and a VKey reference UTxO', () => {
      const base = { BLOCKFROST_API_KEY_MAINNET: 'm', RELAY_WALLET_MNEMONIC_MAINNET: TEST_MNEMONIC };
      expect(new NetworkConfig(configWith(base)).isEnabled('mainnet')).toBe(false);
      expect(new NetworkConfig(configWith({ VKEY_REF_MAINNET: 'b'.repeat(64) + '#3' })).isEnabled('mainnet')).toBe(false);
      expect(new NetworkConfig(configWith({ ...base, VKEY_REF_MAINNET: 'b'.repeat(64) + '#3' })).isEnabled('mainnet')).toBe(true);
      expect(new NetworkConfig(configWith({ ...base, VKEY_REF_MAINNET: 'b'.repeat(64) + '#3' })).vkeyRef('mainnet'))
        .toEqual({ txHash: 'b'.repeat(64), outputIndex: 3 });
      expect(() => new NetworkConfig(configWith({ ...base, VKEY_REF_MAINNET: 'nonsense' })).vkeyRef('mainnet')).toThrow('<txhash>#<index>');
    });

    it('keeps the Preprod VKey UTxO constant unless overridden', () => {
      const nc = new NetworkConfig(configWith({}));
      expect(nc.vkeyRef('preprod')).toEqual({ txHash: '3dc5c982ea80091afc75f4392ac9e91af8d9124a3318a0d76a26de4e934da083', outputIndex: 0 });
      expect(nc.vkeyRef('mainnet')).toBeNull();
    });

    it('requires the fee deposit on mainnet only by default (FEE_DEPOSIT_NETWORKS)', () => {
      expect(new NetworkConfig(configWith({})).feeDepositRequired('mainnet')).toBe(true);
      expect(new NetworkConfig(configWith({})).feeDepositRequired('preprod')).toBe(false);
      const both = new NetworkConfig(configWith({ FEE_DEPOSIT_NETWORKS: 'mainnet, preprod' }));
      expect(both.feeDepositRequired('preprod')).toBe(true);
      expect(new NetworkConfig(configWith({ FEE_DEPOSIT_NETWORKS: '' })).feeDepositRequired('mainnet')).toBe(true);
    });

    it('derives the relay address per network from the mnemonic', async () => {
      const nc = new NetworkConfig(configWith(bothNetworksEnv));
      const preprod = await nc.relayAddress('preprod');
      const mainnet = await nc.relayAddress('mainnet');
      expect(preprod).toMatch(/^addr_test1/);
      expect(mainnet).toMatch(/^addr1/);
      expect(await nc.relayAddress('mainnet')).toBe(mainnet);
      expect(await new NetworkConfig(configWith({})).relayAddress('mainnet')).toBeNull();
    });
  });

  describe('createBasicVotingEvent (network)', () => {
    beforeEach(() => {
      votingEventRepo.create.mockImplementation((e: any) => e);
      votingEventRepo.save.mockImplementation(async (e: any) => e);
    });

    it('defaults to preprod and stores the chosen network', async () => {
      const a = await service.createBasicVotingEvent('A', ['x', 'y'], 1, 2, 1, null);
      expect(a.network).toBe('preprod');
      const b = await service.createBasicVotingEvent('B', ['x', 'y'], 1, 2, 1, null, 'mainnet');
      expect(b.network).toBe('mainnet');
    });

    it('rejects unknown networks and networks that are not enabled on this server', async () => {
      await expect(service.createBasicVotingEvent('A', ['x', 'y'], 1, 2, 1, null, 'preview')).rejects.toThrow('Unknown network');
      delete env.BLOCKFROST_API_KEY_MAINNET;
      await expect(service.createBasicVotingEvent('A', ['x', 'y'], 1, 2, 1, null, 'mainnet')).rejects.toThrow('not enabled');
      expect(votingEventRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('network routing of Blockfrost calls', () => {
    const semaphoreNft = 'ab'.repeat(28);
    // SemaphoreDatum with group_merke_root = 7
    const datum = 'd8799f58' + '1c' + semaphoreNft + '07' + '58200000000000000000000000000000000000000000000000000000000000000000' + 'd8799f5820' + 'a'.repeat(64) + '00ffff';

    it('reads the on-chain group root through the mainnet key and URL for a mainnet event', async () => {
      votingEventRepo.findOne.mockResolvedValue({ eventId: 1, network: 'mainnet', semaphoreAddress: 'addr1sem', semaphoreNft } as unknown as VotingEvent);
      const calls = mockFetch(() => ({ status: 200, body: [{ amount: [{ unit: semaphoreNft + '53', quantity: '1' }], inline_datum: datum }] }));
      const r = await service.getOnChainGroupRoot(1);
      expect(r.groupMerkleRoot).toBe('7');
      expect(calls[0]).toBe('https://cardano-mainnet.blockfrost.io/api/v0/addresses/addr1sem/utxos');
      expect((global as any).fetch.mock.calls[0][1].headers.project_id).toBe('mainnetKey');
    });

    it('uses the preprod URL and the legacy key for a preprod event (and for rows without a network)', async () => {
      votingEventRepo.findOne.mockResolvedValue({ eventId: 1, semaphoreAddress: 'addr_test1sem', semaphoreNft } as unknown as VotingEvent);
      const calls = mockFetch(() => ({ status: 200, body: [{ amount: [{ unit: semaphoreNft + '53', quantity: '1' }], inline_datum: datum }] }));
      await service.getOnChainGroupRoot(1);
      expect(calls[0]).toBe('https://cardano-preprod.blockfrost.io/api/v0/addresses/addr_test1sem/utxos');
      expect((global as any).fetch.mock.calls[0][1].headers.project_id).toBe('preprodLegacyKey');
    });

    it('submits a vote tx to the network it was built for', async () => {
      const calls = mockFetch((url) => url.endsWith('/evaluate') ? { status: 500, text: 'nope' } : { status: 200, text: '"deadbeef"' });
      const r = await (service as any)._submitVote('00', undefined, undefined, 'mainnet');
      expect(r.txHash).toBe('deadbeef');
      expect(calls).toEqual([
        'https://cardano-mainnet.blockfrost.io/api/v0/utils/txs/evaluate',
        'https://cardano-mainnet.blockfrost.io/api/v0/tx/submit',
      ]);
    });

    it('refuses with 503 when the event network has no Blockfrost key', async () => {
      delete env.BLOCKFROST_API_KEY_MAINNET;
      votingEventRepo.findOne.mockResolvedValue({ eventId: 1, network: 'mainnet', semaphoreAddress: 'x', semaphoreNft } as unknown as VotingEvent);
      await expect(service.getOnChainGroupRoot(1)).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('fee deposit (mainnet-fee-deposit)', () => {
    const voters = JSON.stringify([{ userId: 1, commitment: '1' }, { userId: 2, commitment: '2' }, { userId: 3, commitment: '3' }]);
    const mainnetEvent = () => ({ eventId: 5, network: 'mainnet', groupLeafCommitments: voters, feeSpentLovelace: '0' }) as unknown as VotingEvent;
    const required = 3n * FEE_PER_VOTE_LOVELACE;

    it('does not require a deposit on preprod', () => {
      expect(() => service.assertFeeBudget({ network: 'preprod' } as VotingEvent)).not.toThrow();
      expect(() => service.assertFeeBudget({} as VotingEvent)).not.toThrow();
    });

    it('blocks relaying on mainnet without a deposit or when the budget is exhausted (402)', () => {
      expect(() => service.assertFeeBudget({ network: 'mainnet' } as VotingEvent)).toThrow(HttpException);
      try { service.assertFeeBudget({ network: 'mainnet' } as VotingEvent); } catch (e: any) { expect(e.status).toBe(402); }
      const exhausted = { network: 'mainnet', feeDepositTxHash: 'x', feeBudgetLovelace: '2600000', feeSpentLovelace: '1400000' } as VotingEvent;
      expect(() => service.assertFeeBudget(exhausted)).toThrow('exhausted');
      const ok = { network: 'mainnet', feeDepositTxHash: 'x', feeBudgetLovelace: '2600000', feeSpentLovelace: '1300000' } as VotingEvent;
      expect(() => service.assertFeeBudget(ok)).not.toThrow();
    });

    it('relayVote on an unfunded mainnet event fails before the proof is checked or a nullifier is written', async () => {
      votingEventRepo.findOne.mockResolvedValue({ ...mainnetEvent(), semaphoreAddress: 'a', votingValidatorAddress: 'b', semaphoreNft: 'c', votingNft: 'd', groupNft: 'e', mintingOrefTxHash: 'f', mintingOrefIndex: 0 } as unknown as VotingEvent);
      const verify = jest.spyOn(service, 'verifyRelayVoteProof');
      const insert = jest.spyOn(service as any, 'insertNullifier');
      await expect(service.relayVote(5, { zkProof: { pi_a: '', pi_b: '', pi_c: '' }, publicSignals: [], signalMessage: '' })).rejects.toMatchObject({ status: 402 });
      expect(verify).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });

    it('reports the required amount: registered voters × fee per vote', async () => {
      votingEventRepo.findOne.mockResolvedValue(mainnetEvent());
      const s = await service.getFeeDepositStatus(5);
      expect(s).toMatchObject({ network: 'mainnet', required: true, registeredVoters: 3, requiredLovelace: required.toString(), funded: false, depositTxHash: null });
      expect(s.relayAddress).toMatch(/^addr1/);
      votingEventRepo.findOne.mockResolvedValue({ eventId: 6, network: 'preprod', groupLeafCommitments: voters } as unknown as VotingEvent);
      expect(await service.getFeeDepositStatus(6)).toMatchObject({ required: false, funded: true });
    });

    it('confirmFeeDeposit verifies the deposit on-chain and records the budget', async () => {
      const event = mainnetEvent();
      votingEventRepo.findOne.mockImplementation(async (q: any) => (q.where.eventId === 5 ? event : null));
      votingEventRepo.save.mockImplementation(async (e: any) => e);
      const relay = (await service.getNetworks()).find(n => n.network === 'mainnet')!.relayAddress!;
      const txHash = 'c'.repeat(64);
      const calls = mockFetch(() => ({ status: 200, body: { outputs: [
        { address: 'addr1somebodyelse', amount: [{ unit: 'lovelace', quantity: '99000000' }] },
        { address: relay, amount: [{ unit: 'lovelace', quantity: '2000000' }] },
        { address: relay, amount: [{ unit: 'lovelace', quantity: '2000000' }] },
      ] } }));
      const r = await service.confirmFeeDeposit(5, txHash.toUpperCase());
      expect(calls[0]).toBe(`https://cardano-mainnet.blockfrost.io/api/v0/txs/${txHash}/utxos`);
      expect(r).toEqual({ success: true, budgetLovelace: '4000000', requiredLovelace: required.toString() });
      expect(event.feeDepositTxHash).toBe(txHash);
      expect(event.feeBudgetLovelace).toBe('4000000');
      expect(() => service.assertFeeBudget(event)).not.toThrow();
      expect(await service.getFeeDepositStatus(5)).toMatchObject({ funded: true, missingLovelace: '0' });
      // Funded for all registered voters: another deposit is refused.
      await expect(service.confirmFeeDeposit(5, 'e'.repeat(64))).rejects.toMatchObject({ status: 409 });
    });

    it('accepts a top-up deposit when more voters registered after the first deposit', async () => {
      const event = { ...mainnetEvent(), feeDepositTxHash: 'a'.repeat(64), feeBudgetLovelace: '2600000' } as unknown as VotingEvent;
      votingEventRepo.findOne.mockImplementation(async (q: any) => (q.where.eventId === 5 ? event : null));
      votingEventRepo.save.mockImplementation(async (e: any) => e);
      const relay = (await service.getNetworks()).find(n => n.network === 'mainnet')!.relayAddress!;
      // 3 voters × 1.3 ADA = 3.9 ADA required, 2.6 ADA deposited → 1.3 ADA missing.
      expect(await service.getFeeDepositStatus(5)).toMatchObject({ funded: false, missingLovelace: '1300000' });
      mockFetch(() => ({ status: 200, body: { outputs: [{ address: relay, amount: [{ unit: 'lovelace', quantity: '1299999' }] }] } }));
      await expect(service.confirmFeeDeposit(5, 'b'.repeat(64))).rejects.toThrow('Deposit too small');
      mockFetch(() => ({ status: 200, body: { outputs: [{ address: relay, amount: [{ unit: 'lovelace', quantity: '1300000' }] }] } }));
      const r = await service.confirmFeeDeposit(5, 'b'.repeat(64));
      expect(r.budgetLovelace).toBe('3900000');
      expect(event.feeDepositTxHash).toBe('a'.repeat(64) + ',' + 'b'.repeat(64));
      expect(await service.getFeeDepositStatus(5)).toMatchObject({ funded: true });
    });

    it('confirmFeeDeposit rejects a deposit that is too small, unconfirmed, reused or on a free network', async () => {
      const event = mainnetEvent();
      votingEventRepo.findOne.mockImplementation(async (q: any) => (q.where.eventId === 5 ? event : null));
      const relay = (await service.getNetworks()).find(n => n.network === 'mainnet')!.relayAddress!;
      mockFetch(() => ({ status: 200, body: { outputs: [{ address: relay, amount: [{ unit: 'lovelace', quantity: '3899999' }] }] } }));
      await expect(service.confirmFeeDeposit(5, 'd'.repeat(64))).rejects.toThrow('Deposit too small');
      expect(event.feeDepositTxHash).toBeUndefined();

      mockFetch(() => ({ status: 404, body: {} }));
      await expect(service.confirmFeeDeposit(5, 'd'.repeat(64))).rejects.toMatchObject({ status: 404 });

      await expect(service.confirmFeeDeposit(5, 'not-a-hash')).rejects.toMatchObject({ status: 400 });

      // Deposit tx already used by another event (looked up with LIKE on the hash list).
      votingEventRepo.findOne.mockImplementation(async (q: any) => (q.where.eventId === 5 ? event : { eventId: 9 }));
      await expect(service.confirmFeeDeposit(5, 'd'.repeat(64))).rejects.toMatchObject({ status: 409 });

      votingEventRepo.findOne.mockResolvedValue({ eventId: 7, network: 'preprod' } as unknown as VotingEvent);
      await expect(service.confirmFeeDeposit(7, 'd'.repeat(64))).rejects.toThrow('No fee deposit is required');
    });
  });

  describe('getVotingEvent', () => {
    it('returns the event when found', async () => {
      const event = { eventId: 1, eventName: 'Test Vote' } as VotingEvent;
      votingEventRepo.findOne.mockResolvedValue(event);

      const result = await service.getVotingEvent(1);

      expect(result).toEqual(event);
    });

    it('does not expose admin token, invitee e-mails or commitments (F1)', async () => {
      votingEventRepo.findOne.mockResolvedValue({
        eventId: 1,
        eventName: 'Test Vote',
        adminToken: 'secret',
        invitedParticipants: '[{"email":"a@b.c"}]',
        groupLeafCommitments: '[{"userId":1,"commitment":"1"}]',
        nullifierLeafCommitments: '[]',
      } as unknown as VotingEvent);

      const result = await service.getVotingEvent(1);

      expect(result).toEqual({ eventId: 1, eventName: 'Test Vote' });
    });

    it('throws when the event does not exist', async () => {
      votingEventRepo.findOne.mockResolvedValue(null);

      await expect(service.getVotingEvent(999)).rejects.toThrow('Voting event not found');
    });
  });

  describe('getParticipants', () => {
    it('returns the user IDs of all participants', async () => {
      votingEventRepo.findOne.mockResolvedValue({
        eventId: 1,
        groupLeafCommitments: JSON.stringify([
          { userId: 10, commitment: '111' },
          { userId: 20, commitment: '222' },
        ]),
      } as VotingEvent);

      const result = await service.getParticipants(1);

      expect(result).toEqual([10, 20]);
    });

    it('returns an empty array when there are no participants', async () => {
      votingEventRepo.findOne.mockResolvedValue({
        eventId: 1,
        groupLeafCommitments: '[]',
      } as VotingEvent);

      const result = await service.getParticipants(1);

      expect(result).toEqual([]);
    });

    it('throws when the event does not exist', async () => {
      votingEventRepo.findOne.mockResolvedValue(null);

      await expect(service.getParticipants(999)).rejects.toThrow('Voting event not found');
    });
  });

  describe('getAllVotingEvents', () => {
    it('returns all events from the repository', async () => {
      const events = [{ eventId: 1 }, { eventId: 2 }] as VotingEvent[];
      votingEventRepo.find.mockResolvedValue(events);

      const result = await service.getAllVotingEvents();

      expect(result).toEqual(events);
    });
  });

  describe('getResults (F9)', () => {
    const base = {
      eventId: 1, eventName: 'E', options: JSON.stringify([{ index: 0, text: 'a' }, { index: 1, text: 'b' }]),
      groupLeafCommitments: JSON.stringify([{ userId: 1, commitment: '1' }, { userId: 2, commitment: '2' }]),
      votingValidatorAddress: 'addr_test1', votingNft: 'policy',
    };
    const tally: Array<[number, number]> = [[0, 3], [1, 1]];

    beforeEach(() => {
      jest.spyOn(service as any, 'fetchOnChainTally').mockResolvedValue(tally);
    });

    it('hides turnout and per-option counts from the public while voting is open', async () => {
      const now = Math.floor(Date.now() / 1000);
      votingEventRepo.findOne.mockResolvedValue({ ...base, adminToken: 'tok', startingDate: now - 100, endingDate: now + 1000 } as unknown as VotingEvent);
      const r = await service.getResults(1);
      expect(r.status).toBe('live');
      expect(r.totalVotes).toBeNull();
      expect(r.registeredVoters).toBeNull();
      expect(r.resultsAvailable).toBe(false);
      expect(r.options.map(o => o.votes)).toEqual([0, 0]);
    });

    it('reports the turnout to the organiser while voting is open', async () => {
      const now = Math.floor(Date.now() / 1000);
      votingEventRepo.findOne.mockResolvedValue({ ...base, adminToken: 'tok', startingDate: now - 100, endingDate: now + 1000 } as unknown as VotingEvent);
      const r = await service.getResults(1, 'tok');
      expect(r.totalVotes).toBe(4);
      expect(r.registeredVoters).toBe(2);
      expect(r.resultsAvailable).toBe(false);
      const wrong = await service.getResults(1, 'nope');
      expect(wrong.totalVotes).toBeNull();
    });

    it('counts ballots, not points, as turnout in a weighted event', async () => {
      const now = Math.floor(Date.now() / 1000);
      jest.spyOn(service as any, 'fetchOnChainTally').mockResolvedValue([[0, 150], [1, 50]]);
      votingEventRepo.findOne.mockResolvedValue({ ...base, adminToken: 'tok', votingPower: 100, startingDate: now - 100, endingDate: now + 1000 } as unknown as VotingEvent);
      const live = await service.getResults(1, 'tok');
      expect(live.votingPower).toBe(100);
      expect(live.totalVotes).toBe(2);
      expect(live.totalPoints).toBe(200);
      expect((await service.getResults(1)).totalPoints).toBeNull();
      votingEventRepo.findOne.mockResolvedValue({ ...base, votingPower: 100, startingDate: now - 1000, endingDate: now - 10 } as unknown as VotingEvent);
      const ended = await service.getResults(1);
      expect(ended.totalVotes).toBe(2);
      expect(ended.options.map(o => o.votes)).toEqual([150, 50]);
    });

    it('reveals per-option results after the end', async () => {
      const now = Math.floor(Date.now() / 1000);
      votingEventRepo.findOne.mockResolvedValue({ ...base, startingDate: now - 1000, endingDate: now - 10 } as unknown as VotingEvent);
      const r = await service.getResults(1);
      expect(r.status).toBe('ended');
      expect(r.resultsAvailable).toBe(true);
      expect(r.options.map(o => o.votes)).toEqual([3, 1]);
    });

    it('marks an event without contracts as not deployed', async () => {
      votingEventRepo.findOne.mockResolvedValue({ ...base, adminToken: 'tok', votingNft: null, votingValidatorAddress: null } as unknown as VotingEvent);
      const r = await service.getResults(1);
      expect(r.status).toBe('not_deployed');
      expect(r.totalVotes).toBeNull();
      expect((await service.getResults(1, 'tok')).totalVotes).toBe(0);
    });
  });

  describe('validateAdminToken', () => {
    it('accepts the event admin token', async () => {
      votingEventRepo.findOne.mockResolvedValue({ eventId: 1, adminToken: 'tok-123' } as VotingEvent);
      await expect(service.validateAdminToken(1, 'tok-123')).resolves.toEqual({ valid: true });
    });

    it('rejects a wrong or missing token', async () => {
      votingEventRepo.findOne.mockResolvedValue({ eventId: 1, adminToken: 'tok-123' } as VotingEvent);
      await expect(service.validateAdminToken(1, 'tok-124')).resolves.toMatchObject({ valid: false });
      await expect(service.validateAdminToken(1, '')).resolves.toMatchObject({ valid: false });
    });
  });

  describe('verifyRelayVoteProof (F2)', () => {
    const semaphoreNft = 'ab'.repeat(28);
    const event = { eventId: 1, semaphoreNft } as VotingEvent;
    const externalNullifier = BigInt('0x' + semaphoreNft).toString();
    // CBOR of [[1, 1]] and blake2b_256 of it mod r
    const signalMessage = '9f9f0101ffff';
    const zkProof = { pi_a: 'aa', pi_b: 'bb', pi_c: 'cc' };
    let signalHash: string;

    beforeAll(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { blake2b } = require('@noble/hashes/blake2b');
      const r = BigInt('52435875175126190479447740508185965837690552500527637822603658699938581184513');
      const digest = Buffer.from(blake2b(Buffer.from(signalMessage, 'hex'), { dkLen: 32 })).toString('hex');
      signalHash = (BigInt('0x' + digest) % r).toString();
    });

    const call = (publicSignals: string[], msg = signalMessage) =>
      service.verifyRelayVoteProof(event, { zkProof, publicSignals, signalMessage: msg });

    it('rejects a proof made for another event', async () => {
      await expect(call(['5', '7', signalHash, '123'])).rejects.toThrow('different event');
    });

    it('rejects a signal hash that does not match the signal message', async () => {
      await expect(call(['5', '7', '999', externalNullifier])).rejects.toThrow('signal hash');
    });

    it('rejects a proof against a group root other than the on-chain one', async () => {
      jest.spyOn(service, 'getOnChainGroupRoot').mockResolvedValue({ groupMerkleRoot: '42' });
      await expect(call(['5', '7', signalHash, externalNullifier])).rejects.toThrow('voter group');
    });

    it('rejects malformed input before touching the chain', async () => {
      const spy = jest.spyOn(service, 'getOnChainGroupRoot');
      await expect(call(['5', '7', signalHash])).rejects.toThrow('4 public signals');
      await expect(call(['5', '7', signalHash, externalNullifier], 'zz')).rejects.toThrow('bad signal message');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
