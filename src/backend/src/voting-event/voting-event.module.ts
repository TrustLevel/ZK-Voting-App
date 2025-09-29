import { Module } from '@nestjs/common';
import { VotingEventController } from './voting-event.controller';
import { VotingEventService } from './voting-event.service';

@Module({
  controllers: [VotingEventController],
  providers: [VotingEventService]
})
export class VotingEventModule {}
