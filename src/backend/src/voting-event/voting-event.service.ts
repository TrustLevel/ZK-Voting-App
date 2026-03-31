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
  mintingOrefTxHash?: string | null;
  mintingOrefIndex?: number | null;
  vkeyRefTxHash?: string | null;
  vkeyRefIndex?: number | null;
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
    // Generate random event ID (between 1 billion and 9 billion)
    const randomEventId = Math.floor(Math.random() * 8000000000) + 1000000000;

    // Create an empty Semaphore Group to get the initial merkle root
    const treeDepth = 20; // Tree depth (supports up to 2^20 members)
    const group = new Group(BigInt(randomEventId), treeDepth); // Empty group (no members)
    const emptyMerkleRoot = group.root.toString();

    // Format options as JSON string with initial vote counts
    const formattedOptions = JSON.stringify(
      options.map((option, index) => ({ index, text: option, votes: 0 }))
    );

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
      groupMerkleRootHash: emptyMerkleRoot,
      groupLeafCommitments: '[]',
      groupSize: treeDepth, // Store tree depth for recreating groups
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
      mintingOrefTxHash: createData.mintingOrefTxHash || null,
      mintingOrefIndex: createData.mintingOrefIndex ?? null,
      vkeyRefTxHash: createData.vkeyRefTxHash || null,
      vkeyRefIndex: createData.vkeyRefIndex ?? null,
    });

    return await this.votingEventRepository.save(votingEvent);
  }

  async addParticipant(eventId: number, token: string, commitment: string): Promise<VotingEvent> {
    // 1. Validate invitation token
    const invitationToken = await this.invitationTokenRepository.findOne({ where: { token } });

    if (!invitationToken) {
      throw new Error('Invalid invitation token');
    }

    if (invitationToken.eventId !== eventId) {
      throw new Error('Invitation token is not valid for this event');
    }

    const currentTime = Math.floor(Date.now() / 1000);
    if (invitationToken.expiresAt < currentTime) {
      throw new Error('Invitation token has expired');
    }

    // 2. Extract userId from validated token (cannot be faked by frontend)
    const userId = invitationToken.userId;

    // 3. Load event from database
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // 4. Parse participants from group_leaf_commitments (source of truth)
    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;

    // Check if user has already committed
    if (participants.some(p => p.userId === userId)) {
      throw new Error('User has already committed to this event');
    }

    // 5. Reconstruct Semaphore group with existing members
    const existingCommitments = participants.map(p => BigInt(p.commitment));
    const group = new Group(BigInt(eventId), event.groupSize, existingCommitments);

    // Verify reconstructed root matches stored root (data integrity check)
    if (participants.length > 0 && group.root.toString() !== event.groupMerkleRootHash) {
      throw new Error('Data integrity error: merkle root mismatch');
    }

    // 6. Add new member using addMember method from the library
    group.addMember(BigInt(commitment));

    // 7. Update database with new participant and updated merkle root
    const updatedParticipants = [...participants, { userId, commitment }];
    event.groupLeafCommitments = JSON.stringify(updatedParticipants);
    event.groupMerkleRootHash = group.root.toString();

    await this.votingEventRepository.save(event);

    // 8. Mark invitation token as used (for audit purposes)
    invitationToken.used = true;
    await this.invitationTokenRepository.save(invitationToken);

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
    event.groupMerkleRootHash = group.root.toString();

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

  // Return the Semaphore group Merkle proof for a specific participant.
  // The frontend passes this proof (siblings, pathIndices) to the ZK circuit
  // as witness data when generating the vote proof.
  async getMerkleProof(eventId: number, userId: number): Promise<{
    root: string;
    leaf: string;
    siblings: string[];
    pathIndices: number[];
  }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    const participants = JSON.parse(event.groupLeafCommitments) as Array<{userId: number, commitment: string}>;
    const index = participants.findIndex(p => p.userId === userId);
    if (index === -1) {
      throw new Error('User is not a participant in this event');
    }

    const commitments = participants.map(p => BigInt(p.commitment));
    const group = new Group(BigInt(eventId), event.groupSize, commitments);
    const proof = group.generateMerkleProof(index);

    return {
      root: proof.root.toString(),
      leaf: proof.leaf.toString(),
      siblings: proof.siblings.map((s: bigint) => s.toString()),
      pathIndices: proof.pathIndices,
    };
  }

  // Insert a nullifier into the MPF trie for a voting event.
  // Called by the frontend after successfully casting a vote on-chain.
  // Returns the MPF proof (needed to build the vote transaction) and the new root.
  // Throws if the nullifier was already inserted (double-vote prevention).
  async insertNullifier(eventId: number, nullifier: string): Promise<{
    newRoot: string;
    proof: string;
    proofSteps: Array<object>;
  }> {
    const event = await this.votingEventRepository.findOne({ where: { eventId } });
    if (!event) {
      throw new Error('Voting event not found');
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Trie, Store } = require('@aiken-lang/merkle-patricia-forestry');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { blake2b } = require('@noble/hashes/blake2b');

    const nullifierBigInt = BigInt(nullifier);

    // Convert nullifier to key/value — mirrors nullifierToKeyValue() in src/zk/src/mpf.ts.
    // value = little-endian 32-byte representation  (scalar.to_bytearray_little_endian)
    // key   = blake2b_256(value)                    (crypto.blake2b_256 on-chain)
    const hex = nullifierBigInt.toString(16).padStart(64, '0');
    const bigEndian = Buffer.from(hex, 'hex');
    const value = Buffer.from(bigEndian).reverse();
    const key = Buffer.from(blake2b(value, { dkLen: 32 }));

    const store = new Store(`nullifiers-db/${eventId}`);
    const trie = await Trie.load(store).catch(() => new Trie(store));

    // Throws if nullifier already exists — prevents double voting at the backend level.
    await trie.insert(key, value);

    const mpfProof = await trie.prove(key);
    const newRootBuffer: Buffer = mpfProof.verify(true);
    const newRoot = Buffer.from(newRootBuffer).toString('hex');

    // Persist the updated MPF root so future votes use the correct old root.
    event.nullifierMerkleTree = newRoot;
    await this.votingEventRepository.save(event);

    return {
      newRoot,
      proof: Buffer.from(mpfProof.toCBOR()).toString('hex'),
      proofSteps: mpfProof.toJSON(),
    };
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
