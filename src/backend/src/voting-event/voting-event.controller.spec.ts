import { Test, TestingModule } from '@nestjs/testing';
import { VotingEventController } from './voting-event.controller';

describe('VotingEventController', () => {
  let controller: VotingEventController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VotingEventController],
    }).compile();

    controller = module.get<VotingEventController>(VotingEventController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
