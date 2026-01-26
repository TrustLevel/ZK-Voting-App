import { Controller, Post, Get, Delete, Patch, Body, Param } from '@nestjs/common';
import { VotingEventService } from './voting-event.service';

@Controller('voting-event')
export class VotingEventController {
  constructor(private readonly votingEventService: VotingEventService) {}

  @Post()
  async createBasicVotingEvent(
    @Body('eventName') eventName: string,
    @Body('options') options: string[],
    @Body('votingPower') votingPower: number,
    @Body('startingDate') startingDate: number,
    @Body('endingDate') endingDate: number,
    @Body('adminUserId') adminUserId?: number,
  ) {
    return await this.votingEventService.createBasicVotingEvent(
      eventName,
      options,
      startingDate,
      endingDate,
      votingPower,
      adminUserId ?? null,
    );
  }

  @Get(':eventId')
  async getVotingEvent(@Param('eventId') eventId: number) {
    return await this.votingEventService.getVotingEvent(eventId);
  }

  @Patch(':eventId')
  async updateVotingEvent(
    @Param('eventId') eventId: number,
    @Body('votingPower') votingPower?: number,
    @Body('options') options?: string[],
    @Body('startingDate') startingDate?: number,
    @Body('endingDate') endingDate?: number,
  ) {
    return await this.votingEventService.updateVotingEvent(eventId, {
      votingPower,
      options,
      startingDate,
      endingDate,
    });
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

  @Post(':eventId/invite')
  async inviteParticipant(
    @Param('eventId') eventId: number,
    @Body('email') email: string,
  ) {
    return await this.votingEventService.inviteParticipant(eventId, email);
  }

  @Get(':eventId/invited')
  async getInvitedParticipants(@Param('eventId') eventId: number) {
    return await this.votingEventService.getInvitedParticipants(eventId);
  }

  @Post(':eventId/send-invitations')
  async sendInvitations(
    @Param('eventId') eventId: number,
    @Body('emails') emails: string[],
  ) {
    return await this.votingEventService.sendInvitations(eventId, emails);
  }

  @Get('validate-token/:token')
  async validateToken(@Param('token') token: string) {
    return await this.votingEventService.validateToken(token);
  }

  @Post('mark-token-used/:token')
  async markTokenAsUsed(@Param('token') token: string) {
    await this.votingEventService.markTokenAsUsed(token);
    return { success: true };
  }

  /**
   * ============================================================================
   * ⚠️ TEMPORARY ENDPOINT - NEEDS ZK-PROOF INTEGRATION
   * ============================================================================
   *
   * CURRENT (FAKE - NOT ANONYMOUS):
   * Body: { userId: number, selectedOption: number }
   *
   * REQUIRED FOR ZK IMPLEMENTATION:
   * Body: {
   *   proof: ZKProof,      // ZK-proof object
   *   nullifier: string,   // Computed nullifier
   *   signal: string       // The vote (selectedOption)
   * }
   * ============================================================================
   */
  @Post(':eventId/vote')
  async submitVote(
    @Param('eventId') eventId: number,
    @Body('selectedOption') selectedOption: number,
    @Body('userId') userId: number,  // ⚠️ TEMPORARY - Replace with proof, nullifier, signal
  ) {
    return await this.votingEventService.submitVote(eventId, selectedOption, userId);
  }

  @Post(':eventId/validate-admin-token')
  async validateAdminToken(
    @Param('eventId') eventId: number,
    @Body('token') token: string,
  ) {
    return await this.votingEventService.validateAdminToken(eventId, token);
  }

  @Post(':eventId/mark-invitations-sent')
  async markInvitationsSent(
    @Param('eventId') eventId: number,
  ) {
    return await this.votingEventService.markInvitationsSent(eventId);
  }

  @Post(':eventId/save-blockchain-data')
  async saveBlockchainData(
    @Param('eventId') eventId: number,
    @Body('blockchainData') blockchainData: any,
  ) {
    return await this.votingEventService.saveBlockchainData(eventId, blockchainData);
  }
}
