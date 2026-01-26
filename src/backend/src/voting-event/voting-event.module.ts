import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VotingEventController } from './voting-event.controller';
import { VotingEventService } from './voting-event.service';
import { EmailService } from './email.service';
import { VotingEvent } from './voting-event.entity';
import { InvitationToken } from './invitation-token.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VotingEvent, InvitationToken]),
    ConfigModule,
    UsersModule,
  ],
  controllers: [VotingEventController],
  providers: [VotingEventService, EmailService],
  exports: [TypeOrmModule],
})
export class VotingEventModule {}
