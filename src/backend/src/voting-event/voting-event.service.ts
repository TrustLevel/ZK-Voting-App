import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VotingEvent } from './voting-event.entity';
import { Group } from 'modp-semaphore-bls12381/packages/typescript/src/group';

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
  ) {}

  async createBasicVotingEvent(
    eventName: string,
    options: string[], // Changed to array of option strings
    startingDate: number,
    endingDate: number,
    votingPower: number,
    adminUserId: number,
  ): Promise<VotingEvent> {
    // Create a new Group to get the zero value merkle root
    const defaultGroupSize = 20; // Default group size
    const group = new Group(BigInt(1), defaultGroupSize); // Using groupId = 1 and default size
    const zeroMerkleRoot = group.zeroValue.toString();

    // Format options as JSON string with initial vote counts
    const formattedOptions = JSON.stringify(
      options.map((option, index) => ({ index, text: option, votes: 0 }))
    );

    const votingEvent = this.votingEventRepository.create({
      eventName,
      startingDate,
      endingDate,
      votingPower,
      options: formattedOptions,
      adminUserId,
      // Set required non-nullable fields with defaults
      groupMerkleRootHash: zeroMerkleRoot,
      groupLeafCommitments: '[]',
      groupSize: defaultGroupSize,
      // All other nullable fields will be null by default
    });

    return await this.votingEventRepository.save(votingEvent);
  }

  async createVotingEvent(createData: CreateVotingEventDto): Promise<VotingEvent> {
    const votingEvent = this.votingEventRepository.create({
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
}
