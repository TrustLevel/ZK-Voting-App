import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('VotingEvent')
export class VotingEvent {
  @PrimaryGeneratedColumn({ name: 'event_id' })
  eventId: number;

  @Column({ name: 'event_name', type: 'text' })
  eventName: string;

  @Column({ name: 'voting_nft', type: 'text' })
  votingNft: string;

  @Column({ name: 'voting_validator_address', type: 'text' })
  votingValidatorAddress: string;

  @Column({ name: 'voting_power', type: 'integer' })
  votingPower: number;

  @Column({ name: 'options', type: 'text' })
  options: string;

  @Column({ name: 'admin_user_id', type: 'integer' })
  adminUserId: number;

  @Column({ name: 'starting_date', type: 'integer' })
  startingDate: number;

  @Column({ name: 'ending_date', type: 'integer' })
  endingDate: number;

  @Column({ name: 'group_nft', type: 'text' })
  groupNft: string;

  @Column({ name: 'group_validator_address', type: 'text' })
  groupValidatorAddress: string;

  @Column({ name: 'group_merkle_root_hash', type: 'text' })
  groupMerkleRootHash: string;

  @Column({ name: 'group_leaf_commitments', type: 'text', default: '[]' })
  groupLeafCommitments: string;

  @Column({ name: 'group_size', type: 'integer' })
  groupSize: number;

  @Column({ name: 'semaphore_nft', type: 'text' })
  semaphoreNft: string;

  @Column({ name: 'semaphore_address', type: 'text' })
  semaphoreAddress: string;

  @Column({ name: 'nullifier_merkle_tree', type: 'text' })
  nullifierMerkleTree: string;

  @Column({ name: 'nullifier_leaf_commitments', type: 'text', default: '[]' })
  nullifierLeafCommitments: string;

  @Column({ name: 'verification_reference_input', type: 'text' })
  verificationReferenceInput: string;

  @Column({ name: 'current_vote_count', type: 'text' })
  currentVoteCount: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'admin_user_id' })
  adminUser: User;
}
