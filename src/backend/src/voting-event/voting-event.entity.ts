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
  @Column({ name: 'event_id', type: 'bigint', primary: true })
  eventId: number;

  @Column({ name: 'event_name', type: 'text' })
  eventName: string;

  @Column({ name: 'voting_nft', type: 'text', nullable: true })
  votingNft: string | null;

  @Column({ name: 'voting_validator_address', type: 'text', nullable: true })
  votingValidatorAddress: string | null;

  @Column({ name: 'voting_power', type: 'integer', nullable: true })
  votingPower: number | null;

  @Column({ name: 'options', type: 'text', nullable: true })
  options: string | null;

  @Column({ name: 'admin_user_id', type: 'integer', nullable: true })
  adminUserId: number | null;

  @Column({ name: 'admin_token', type: 'text', nullable: true })
  adminToken: string | null;

  @Column({ name: 'starting_date', type: 'integer', nullable: true })
  startingDate: number | null;

  @Column({ name: 'ending_date', type: 'integer', nullable: true })
  endingDate: number | null;

  @Column({ name: 'group_nft', type: 'text', nullable: true })
  groupNft: string | null;

  @Column({ name: 'group_validator_address', type: 'text', nullable: true })
  groupValidatorAddress: string | null;

  @Column({ name: 'group_validator_cbor', type: 'text', nullable: true })
  groupValidatorCbor: string | null;

  @Column({ name: 'group_merkle_root_hash', type: 'text' })
  groupMerkleRootHash: string;

  @Column({ name: 'group_leaf_commitments', type: 'text', default: '[]' })
  groupLeafCommitments: string;

  @Column({ name: 'group_size', type: 'integer' })
  groupSize: number;

  @Column({ name: 'semaphore_nft', type: 'text', nullable: true })
  semaphoreNft: string | null;

  @Column({ name: 'semaphore_address', type: 'text', nullable: true })
  semaphoreAddress: string | null;

  @Column({ name: 'nullifier_merkle_tree', type: 'text', nullable: true })
  nullifierMerkleTree: string | null;

  @Column({ name: 'nullifier_leaf_commitments', type: 'text', nullable: true, default: '[]' })
  nullifierLeafCommitments: string | null;

  @Column({ name: 'verification_reference_input', type: 'text', nullable: true })
  verificationReferenceInput: string | null;

  @Column({ name: 'current_vote_count', type: 'text', nullable: true })
  currentVoteCount: string | null;

  @Column({ name: 'invited_participants', type: 'text', nullable: true, default: '[]' })
  invitedParticipants: string | null;

  @Column({ name: 'invitations_sent_at', type: 'integer', nullable: true })
  invitationsSentAt: number | null;

  @Column({ name: 'blockchain_data', type: 'text', nullable: true })
  blockchainData: string | null;

  // Minting OutputReference used in Phase 2 of bootstrap (semaphore + voting NFT mint).
  // Required by the frontend to derive the parameterized validator CBORs via applyOrefParamToScript().
  @Column({ name: 'minting_oref_tx_hash', type: 'text', nullable: true })
  mintingOrefTxHash: string | null;

  @Column({ name: 'minting_oref_index', type: 'integer', nullable: true })
  mintingOrefIndex: number | null;

  // VKey UTxO reference — points to the UTxO holding the Groth16 verification key datum.
  // Must match SemaphoreDatum.vkey_ref_input on-chain. Consumed and re-created on each vote.
  @Column({ name: 'vkey_ref_tx_hash', type: 'text', nullable: true })
  vkeyRefTxHash: string | null;

  @Column({ name: 'vkey_ref_index', type: 'integer', nullable: true })
  vkeyRefIndex: number | null;

  // Snapshot of the group Merkle tree at SV mint time.
  // SemaphoreDatum.group_merke_root is set once at SV mint and never changes on-chain.
  // groupMerkleRootHash can drift (new participants added after minting), so ZK proof
  // generation and vote TX output datum must use this snapshot, not groupMerkleRootHash.
  @Column({ name: 'semaphore_merkle_root', type: 'text', nullable: true })
  semaphoreMerkleRoot: string | null;

  @Column({ name: 'semaphore_leaf_commitments', type: 'text', nullable: true })
  semaphoreLeafCommitments: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'admin_user_id' })
  adminUser: User;
}
