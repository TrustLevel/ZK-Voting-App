import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VotingEvent } from './voting-event.entity';
import { InvitationToken } from './invitation-token.entity';
import { Group } from 'modp-semaphore-bls12381/packages/typescript/src/group';
import { UsersService } from '../users/users.service';
import { EmailService } from './email.service';
import { v4 as uuidv4 } from 'uuid';

interface CreateVotingEventDto {
  eventName: string;
  groupMerkleRootHash: string;
  groupLeafCommitments?: string;
  groupSize: number;
  votingNft?: string | null;
  votingValidatorAddress?: string | null;
  votingPower?: number | null;
  options?: string | null;
  adminUserId?: number | null;
  startingDate?: number | null;
  endingDate?: number | null;
  groupNft?: string | null;
  groupValidatorAddress?: string | null;
  semaphoreNft?: string | null;
  semaphoreAddress?: string | null;
  nullifierMerkleTree?: string | null;
  nullifierLeafCommitments?: string | null;
  verificationReferenceInput?: string | null;
  currentVoteCount?: string | null;
}

@Injectable()
export class VotingEventService {
  constructor(
    @InjectRepository(VotingEvent)
    private votingEventRepository: Repository<VotingEvent>,
    @InjectRepository(InvitationToken)
    private invitationTokenRepository: Repository<InvitationToken>,
    private usersService: UsersService,
    private emailService: EmailService,
  ) {}

  async createBasicVotingEvent(
    eventName: string,
    options: string[], // Changed to array of option strings
    startingDate: number,
    endingDate: number,
    votingPower: number, // 1 = simple vote (one vote per user), >1 = weighted vote (distribute voting power across options)
    adminUserId: number | null,
  ): Promise<VotingEvent> {
    // Create a new Group to get the zero value merkle root
    const defaultGroupSize = 20; // Default group size
    const group = new Group(BigInt(1), defaultGroupSize); // Using groupId = 1 and default size
    const zeroMerkleRoot = group.zeroValue.toString();

    // Format options as JSON string with initial vote counts
    const formattedOptions = JSON.stringify(
      options.map((option, index) => ({ index, text: option, votes: 0 }))
    );

    // Generate random event ID (between 1 billion and 9 billion)
    const randomEventId = Math.floor(Math.random() * 8000000000) + 1000000000;

    // Generate admin token for secure access to /manage page
    const adminToken = uuidv4();

    const votingEvent = this.votingEventRepository.create({
      eventId: randomEventId,
      eventName,
      startingDate,
      endingDate,
      votingPower,
      options: formattedOptions,
      adminUserId,
      adminToken,
      // Set required non-nullable fields with defaults
      groupMerkleRootHash: zeroMerkleRoot,
      groupLeafCommitments: '[]',
      groupSize: defaultGroupSize,
      // All other nullable fields will be null by default
    });

    return await this.votingEventRepository.save(votingEvent);
  }

  async createVotingEvent(createData: CreateVotingEventDto): Promise<VotingEvent> {
    // Generate random event ID (between 1 billion and 9 billion)
    const randomEventId = Math.floor(Math.random() * 8000000000) + 1000000000;

    const votingEvent = this.votingEventRepository.create({
      eventId: randomEventId,
      eventName: createData.eventName,
      groupMerkleRootHash: createData.groupMerkleRootHash,
      groupLeafCommitments: createData.groupLeafCommitments || '[]',
      groupSize: createData.groupSize,
      votingNft: createData.votingNft || null,
      votingValidatorAddress: createData.votingValidatorAddress || null,
      votingPower: createData.votingPower || null,
      options: createData.options || null,
      adminUserId: createData.adminUserId || null,
      startingDate: createData.startingDate || null,
      endingDate: createData.endingDate || null,
      groupNft: createData.groupNft || null,
      groupValidatorAddress: createData.groupValidatorAddress || null,
      semaphoreNft: createData.semaphoreNft || null,
      semaphoreAddress: createData.semaphoreAddress || null,
      nullifierMerkleTree: createData.nullifierMerkleTree || null,
      nullifierLeafCommitments: createData.nullifierLeafCommitments || null,
      verificationReferenceInput: createData.verificationReferenceInput || null,
      currentVoteCount: createData.currentVoteCount || null,
    });

    return await this.votingEventRepository.save(votingEvent);
  }

  async addParticipant(eventId: number, userId: number, commitment: string): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;
    
    // Check if user is already a participant
    if (!participants.some(p => p.userId === userId)) {
      // Recreate the group with current state
      const group = new Group(BigInt(eventId), event.groupSize);
      
      // Add existing commitments back to the group
      if (participants.length > 0) {
        for (const participant of participants) {
          group.addMember(BigInt(participant.commitment));
        }
      }
      
      // Add the new member
      group.addMember(BigInt(commitment));
      
      // Update participants list with userId-commitment object
      const updatedParticipants = [...participants, { userId, commitment }];
      event.groupLeafCommitments = JSON.stringify(updatedParticipants);
      event.groupMerkleRootHash = group.merkleTree.root.toString();
      
      return await this.votingEventRepository.save(event);
    }

    return event;
  }

  async removeParticipant(eventId: number, userId: number): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;
    const filteredParticipants = participants.filter(p => p.userId !== userId);
    
    // Rebuild the group with remaining participants
    const group = new Group(BigInt(eventId), event.groupSize);
    if (filteredParticipants.length > 0) {
      for (const participant of filteredParticipants) {
        group.addMember(BigInt(participant.commitment));
      }
    }
    
    // Update group commitments and merkle root
    event.groupLeafCommitments = JSON.stringify(filteredParticipants);
    event.groupMerkleRootHash = group.merkleTree.root.toString();

    return await this.votingEventRepository.save(event);
  }

  async getParticipants(eventId: number): Promise<number[]> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;
    return participants.map(p => p.userId);
  }

  // Get voting event details
  async getVotingEvent(eventId: number): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }
    return event;
  }

  // Update voting event details (dates, options, voting power) - currently not used
  async updateVotingEvent(
    eventId: number,
    updates: {
      votingPower?: number;
      options?: string[];
      startingDate?: number;
      endingDate?: number;
    }
  ): Promise<VotingEvent> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // Update only the provided fields
    if (updates.votingPower !== undefined) {
      event.votingPower = updates.votingPower;
    }

    if (updates.options !== undefined) {
      // Format options as JSON string with initial vote counts
      event.options = JSON.stringify(
        updates.options.map((option, index) => ({ index, text: option, votes: 0 }))
      );
    }

    if (updates.startingDate !== undefined) {
      event.startingDate = updates.startingDate;
    }

    if (updates.endingDate !== undefined) {
      event.endingDate = updates.endingDate;
    }

    return await this.votingEventRepository.save(event);
  }

  // Add single participant by email to participant list (without sending invitation yet)
  async inviteParticipant(eventId: number, email: string): Promise<{ success: boolean; userId: number }> {
    // 1. Find or create user by email
    const user = await this.usersService.findOrCreateUserByEmail(email);

    // 2. Load event
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // 3. Parse invited participants
    const invited = JSON.parse(event.invitedParticipants || '[]') as Array<{
      email: string;
      userId: number;
      invitedAt: number;
    }>;

    // 4. Check if already invited
    if (!invited.some(i => i.email === email)) {
      invited.push({
        email,
        userId: user.userId,
        invitedAt: Date.now(),
      });
      event.invitedParticipants = JSON.stringify(invited);
      await this.votingEventRepository.save(event);
    }

    return { success: true, userId: user.userId };
  }


  // Get updated list of invited participants (to display in admin panel)
  async getInvitedParticipants(eventId: number): Promise<Array<{ email: string; userId: number; invitedAt: number }>> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    return JSON.parse(event.invitedParticipants || '[]');
  }


  // Send invitations to once to all participants via email
  async sendInvitations(
    eventId: number,
    emails: string[],
  ): Promise<{
    success: number;
    failed: number;
    results: Array<{ email: string; status: 'sent' | 'failed'; error?: string }>;
  }> {
    // Verify event exists
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const results: Array<{ email: string; status: 'sent' | 'failed'; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const email of emails) {
      try {
        // 1. Create or get existing user
        const user = await this.usersService.findOrCreateUserByEmail(email);

        // 2. Generate unique token
        const token = uuidv4();

        // 3. Calculate expiry (7 days from now)
        const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days in seconds

        // 4. Save invitation token to database
        const invitationToken = this.invitationTokenRepository.create({
          token,
          eventId,
          userId: user.userId,
          email,
          used: false,
          expiresAt,
        });
        await this.invitationTokenRepository.save(invitationToken);

        // 5. Send email via EmailService with event dates
        await this.emailService.sendInvitationEmail(
          email,
          token,
          eventId,
          event.eventName,
          event.startingDate ?? undefined,
          event.endingDate ?? undefined,
        );

        // 6. Add to invited participants list
        const invited = JSON.parse(event.invitedParticipants || '[]') as Array<{
          email: string;
          userId: number;
          invitedAt: number;
        }>;

        if (!invited.some(i => i.email === email)) {
          invited.push({
            email,
            userId: user.userId,
            invitedAt: Date.now(),
          });
          event.invitedParticipants = JSON.stringify(invited);
          await this.votingEventRepository.save(event);
        }

        results.push({ email, status: 'sent' });
        successCount++;
      } catch (error) {
        results.push({
          email,
          status: 'failed',
          error: error.message || 'Unknown error',
        });
        failedCount++;
      }
    }

    return {
      success: successCount,
      failed: failedCount,
      results,
    };
  }

  // Validate invitation token when user clicks email link
  async validateToken(token: string): Promise<{
    valid: boolean;
    userId?: number;
    eventId?: number;
    email?: string;
    error?: string;
  }> {
    try {
      // Find token in database
      const invitationToken = await this.invitationTokenRepository.findOne({
        where: { token },
      });

      // Check if token exists
      if (!invitationToken) {
        return {
          valid: false,
          error: 'Invalid token',
        };
      }

      // Check if token has already been used
      if (invitationToken.used) {
        return {
          valid: false,
          error: 'Token has already been used',
        };
      }

      // Check if token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (invitationToken.expiresAt < currentTime) {
        return {
          valid: false,
          error: 'Token has expired',
        };
      }

      // Token is valid
      return {
        valid: true,
        userId: invitationToken.userId,
        eventId: invitationToken.eventId,
        email: invitationToken.email,
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to validate token',
      };
    }
  }

  // Mark token as used after particpipation opened email link
  async markTokenAsUsed(token: string): Promise<void> {
    const invitationToken = await this.invitationTokenRepository.findOne({
      where: { token },
    });

    if (invitationToken) {
      invitationToken.used = true;
      await this.invitationTokenRepository.save(invitationToken);
    }
  }

  /**
   * ============================================================================
   * ⚠️ ATTENTION: THIS METHOD ("submitVote") IS A TEMPORARY IMPLEMENTATION TO SIMULATE VOTING WITHOUT ZK-PROOFS & On-Chain VERIFICATION
   * ============================================================================
   */
  async submitVote(
    eventId: number,
    selectedOption: number,
    userId: number, 
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 1. Load event
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        throw new Error('Event not found');
      }

      // 2. Check if voting has started
      if (!event.startingDate || Date.now() < event.startingDate * 1000) {
        return { success: false, message: 'Voting has not started yet' };
      }

      // 3. Check if voting has ended
      if (event.endingDate && Date.now() > event.endingDate * 1000) {
        return { success: false, message: 'Voting has ended' };
      }

      // 4. Parse nullifierLeafCommitments (list of userIds who voted - later to be replaced with nullifiers)
      const votedUsers = JSON.parse(event.nullifierLeafCommitments || '[]') as number[];

      // 5. Check if user already voted
      // NOTE: Should check nullifier, not userId!
      if (votedUsers.includes(userId)) {
        return { success: false, message: 'User has already voted' };
      }

      // 6. Parse and update options
      const options = JSON.parse(event.options || '[]');
      const option = options.find((opt: any) => opt.index === selectedOption);

      if (!option) {
        throw new Error('Invalid option');
      }

      option.votes += 1;

      // 7. Save updated data
      event.options = JSON.stringify(options);
      votedUsers.push(userId);  // ⚠️ Should push nullifier, not userId!
      event.nullifierLeafCommitments = JSON.stringify(votedUsers);

      await this.votingEventRepository.save(event);

      return { success: true, message: 'Vote recorded successfully' };
    } catch (error) {
      throw error;
    }
  }

  // Check admin token for /manage access
  async validateAdminToken(eventId: number, token: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Load event
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        return { valid: false, error: 'Event not found' };
      }

      // Check if token matches
      if (!event.adminToken) {
        return { valid: false, error: 'Event has no admin token' };
      }

      if (event.adminToken === token) {
        return { valid: true };
      }

      return { valid: false, error: 'Invalid admin token' };
    } catch (error) {
      return { valid: false, error: 'Failed to validate admin token' };
    }
  }

  // Mark invitations as sent by setting a timestamp
  async markInvitationsSent(eventId: number): Promise<{ success: boolean; message: string }> {
    try {
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        return { success: false, message: 'Event not found' };
      }

      // Set timestamp when invitations were sent
      event.invitationsSentAt = Math.floor(Date.now() / 1000);
      await this.votingEventRepository.save(event);

      return { success: true, message: 'Invitations marked as sent' };
    } catch (error) {
      return { success: false, message: 'Failed to mark invitations as sent' };
    }
  }

  // Save blockchain data related to the event (Temporary implementation)
  async saveBlockchainData(eventId: number, blockchainData: any): Promise<{ success: boolean; message: string }> {
    try {
      const event = await this.votingEventRepository.findOne({ where: { eventId } });
      if (!event) {
        return { success: false, message: 'Event not found' };
      }

      // Save blockchain signature data as JSON string
      event.blockchainData = JSON.stringify(blockchainData);
      await this.votingEventRepository.save(event);

      return { success: true, message: 'Blockchain data saved' };
    } catch (error) {
      return { success: false, message: 'Failed to save blockchain data' };
    }
  }
}
