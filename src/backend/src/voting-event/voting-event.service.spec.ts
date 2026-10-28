jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { VotingEventService } from './voting-event.service';
import { VotingEvent } from './voting-event.entity';
import { InvitationToken } from './invitation-token.entity';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('VotingEventService', () => {
  let service: VotingEventService;
  let votingEventRepo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    votingEventRepo = mockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotingEventService,
        { provide: getRepositoryToken(VotingEvent), useValue: votingEventRepo },
        { provide: getRepositoryToken(InvitationToken), useValue: mockRepository() },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: UsersService, useValue: {} },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();

    service = module.get<VotingEventService>(VotingEventService);
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
