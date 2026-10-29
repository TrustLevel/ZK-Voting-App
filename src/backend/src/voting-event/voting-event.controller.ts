import { Controller, Post, Get, Delete, Patch, Body, Param, Query, Headers, UseGuards } from '@nestjs/common';
import { VotingEventService } from './voting-event.service';
import { AdminTokenGuard } from './admin-token.guard';

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
    @Body('network') network?: string,
  ) {
    return await this.votingEventService.createBasicVotingEvent(
      eventName,
      options,
      startingDate,
      endingDate,
      votingPower,
      adminUserId ?? null,
      network,
    );
  }

  @Get()
  async getAllVotingEvents() {
    return await this.votingEventService.getAllVotingEvents();
  }

  // Which networks this server serves (enabled = key + relay wallet + VKey UTxO configured),
  // with the relay address, fee-deposit rule and VKey reference the frontend needs.
  // Declared before GET :eventId so "networks" is not read as an event id.
  @Get('networks')
  async getNetworks() {
    return await this.votingEventService.getNetworks();
  }

  @Get(':eventId')
  async getVotingEvent(@Param('eventId') eventId: number) {
    return await this.votingEventService.getVotingEvent(eventId);
  }

  @Patch(':eventId')
  @UseGuards(AdminTokenGuard)
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
    @Body('token') token: string,
    @Body('commitment') commitment: string,
  ) {
    return await this.votingEventService.addParticipant(eventId, token, commitment);
  }

  @Delete(':eventId/participants/:userId')
  @UseGuards(AdminTokenGuard)
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
  @UseGuards(AdminTokenGuard)
  async inviteParticipant(
    @Param('eventId') eventId: number,
    @Body('email') email: string,
  ) {
    return await this.votingEventService.inviteParticipant(eventId, email);
  }

  @Get(':eventId/invited')
  @UseGuards(AdminTokenGuard)
  async getInvitedParticipants(@Param('eventId') eventId: number) {
    return await this.votingEventService.getInvitedParticipants(eventId);
  }

  @Post(':eventId/send-invitations')
  @UseGuards(AdminTokenGuard)
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

  // Relay vote: the voter sends only the ZK proof and the signal message. The backend
  // verifies the proof, inserts the nullifier, then builds, signs and submits the tx
  // with the relay wallet. The voter's wallet never appears on-chain.
  @Post(':eventId/relay-vote')
  async relayVote(
    @Param('eventId') eventId: number,
    @Body('piA') piA: string,
    @Body('piB') piB: string,
    @Body('piC') piC: string,
    @Body('publicSignals') publicSignals: string[],
    @Body('signalMessage') signalMessage: string,
  ) {
    return this.votingEventService.relayVote(eventId, {
      zkProof: { pi_a: piA, pi_b: piB, pi_c: piC },
      publicSignals,
      signalMessage,
    });
  }

  @Post(':eventId/validate-admin-token')
  async validateAdminToken(
    @Param('eventId') eventId: number,
    @Body('token') token: string,
  ) {
    return await this.votingEventService.validateAdminToken(eventId, token);
  }

  @Post(':eventId/mark-invitations-sent')
  @UseGuards(AdminTokenGuard)
  async markInvitationsSent(
    @Param('eventId') eventId: number,
  ) {
    return await this.votingEventService.markInvitationsSent(eventId);
  }

  // Returns the Semaphore group Merkle proof for a participant.
  // Frontend uses this as witness input when generating the ZK vote proof.
  @Get(':eventId/merkle-proof/:userId')
  async getMerkleProof(
    @Param('eventId') eventId: number,
    @Param('userId') userId: number,
    @Query('targetRoot') targetRoot?: string,
  ) {
    return await this.votingEventService.getMerkleProof(eventId, userId, targetRoot);
  }

  // Admin-only: removes a specific nullifier from the MPF trie.
  // Use to unblock a voter whose nullifier is stuck from a failed previous attempt.
  // Nullifiers are only ever inserted by relay-vote, after the ZK proof was verified.
  @Delete(':eventId/nullifier')
  @UseGuards(AdminTokenGuard)
  async adminRollbackNullifier(
    @Param('eventId') eventId: number,
    @Body('nullifier') nullifier: string,
  ) {
    return await this.votingEventService.rollbackNullifier(eventId, nullifier);
  }

  // Fee deposit status of an event (organiser only): required amount, relay address, budget.
  @Get(':eventId/fee-deposit')
  @UseGuards(AdminTokenGuard)
  async getFeeDeposit(@Param('eventId') eventId: number) {
    return await this.votingEventService.getFeeDepositStatus(eventId);
  }

  // Records the organiser's fee deposit after verifying the tx on-chain (fee-deposit networks).
  @Post(':eventId/confirm-fee-deposit')
  @UseGuards(AdminTokenGuard)
  async confirmFeeDeposit(
    @Param('eventId') eventId: number,
    @Body('txHash') txHash: string,
  ) {
    return await this.votingEventService.confirmFeeDeposit(eventId, txHash);
  }

  @Get(':eventId/on-chain-group-root')
  async getOnChainGroupRoot(@Param('eventId') eventId: number) {
    return await this.votingEventService.getOnChainGroupRoot(eventId);
  }

  // Turnout while voting is open is only returned with the event's admin token.
  @Get(':eventId/results')
  async getResults(@Param('eventId') eventId: number, @Headers('x-admin-token') adminToken?: string) {
    return await this.votingEventService.getResults(eventId, adminToken);
  }

  @Post(':eventId/save-blockchain-data')
  @UseGuards(AdminTokenGuard)
  async saveBlockchainData(
    @Param('eventId') eventId: number,
    @Body('blockchainData') blockchainData: any,
  ) {
    return await this.votingEventService.saveBlockchainData(eventId, blockchainData);
  }

  // Updates groupMerkleRootHash in DB after the group-update TX is confirmed on-chain.
  @Post(':eventId/confirm-group-update')
  @UseGuards(AdminTokenGuard)
  async confirmGroupUpdate(
    @Param('eventId') eventId: number,
    @Body('newMerkleRoot') newMerkleRoot: string,
    @Body('txHash') txHash: string,
  ) {
    return await this.votingEventService.confirmGroupUpdate(eventId, newMerkleRoot, txHash);
  }

  // Returns an unsigned TX hex for the admin to sign via CIP-30.
  // Body: { newMerkleRoot, walletUtxos, walletAddress, paymentKeyHash, collateralUtxo }
  @Post(':eventId/build-update-group-tx')
  @UseGuards(AdminTokenGuard)
  async buildUpdateGroupTx(
    @Param('eventId') eventId: number,
    @Body() body: {
      newMerkleRoot: string;
      walletUtxos: any[];
      walletAddress: string;
      paymentKeyHash: string;
      collateralUtxo: any;
    },
  ) {
    return await this.votingEventService.buildUpdateGroupTx(eventId, body);
  }
}
