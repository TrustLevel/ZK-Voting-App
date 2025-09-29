import { Test, TestingModule } from '@nestjs/testing';
import { VotingEventService } from './voting-event.service';

describe('VotingEventService', () => {
  let service: VotingEventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VotingEventService],
    }).compile();

    service = module.get<VotingEventService>(VotingEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
