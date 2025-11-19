import { Controller, Post, Get, Delete, Body, Param } from '@nestjs/common';
import { VotingEventService } from './voting-event.service';

@Controller('voting-event')
export class VotingEventController {
  constructor(private readonly votingEventService: VotingEventService) {}

  @Post()
  async createBasicVotingEvent(
    @Body('eventName') eventName: string,
    @Body('options') options: string[],
    @Body('startingDate') startingDate: number,
    @Body('endingDate') endingDate: number,
    @Body('votingPower') votingPower: number,
    @Body('adminUserId') adminUserId: number,
  ) {
    return await this.votingEventService.createBasicVotingEvent(
      eventName,
      options,
      startingDate,
      endingDate,
      votingPower,
      adminUserId,
    );
  }

  @Post(':eventId/participants')
  async addParticipant(
    @Param('eventId') eventId: number,
    @Body('userId') userId: number,
    @Body('commitment') commitment: string,
  ) {
    return await this.votingEventService.addParticipant(eventId, userId, commitment);
  }

  @Delete(':eventId/participants/:userId')
  async removeParticipant(
    @Param('eventId') eventId: number,
    @Param('userId') userId: number,
  ) {
    return await this.votingEventService.removeParticipant(eventId, userId);
  }

  @Get(':eventId/participants')
  async getParticipants(@Param('eventId') eventId: number) {
    return await this.votingEventService.getParticipants(eventId);
  }
}
