import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotingEventController } from './voting-event.controller';
import { VotingEventService } from './voting-event.service';
import { VotingEvent } from './voting-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VotingEvent])],
  controllers: [VotingEventController],
  providers: [VotingEventService],
  exports: [TypeOrmModule]
})
export class VotingEventModule {}
