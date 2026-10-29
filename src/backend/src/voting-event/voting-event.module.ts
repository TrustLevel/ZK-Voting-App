import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VotingEventController } from './voting-event.controller';
import { VotingEventService } from './voting-event.service';
import { OrganiserTxService } from './organiser-tx.service';
import { EmailService } from './email.service';
import { VotingEvent } from './voting-event.entity';
import { InvitationToken } from './invitation-token.entity';
import { UsersModule } from '../users/users.module';
import { NetworkModule } from '../network/network.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VotingEvent, InvitationToken]),
    ConfigModule,
    UsersModule,
    NetworkModule,
  ],
  controllers: [VotingEventController],
  providers: [VotingEventService, OrganiserTxService, EmailService],
  exports: [TypeOrmModule],
})
export class VotingEventModule {}
