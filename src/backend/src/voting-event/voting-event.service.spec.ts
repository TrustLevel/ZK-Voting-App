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

      expect(result).toBe(event);
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

      expect(result).toBe(events);
    });
  });
});
