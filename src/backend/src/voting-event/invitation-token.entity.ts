import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { VotingEvent } from './voting-event.entity';
import { User } from '../users/user.entity';

@Entity('InvitationToken')
export class InvitationToken {
  @PrimaryGeneratedColumn({ name: 'token_id' })
  tokenId: number;

  @Column({ name: 'token', type: 'text', unique: true })
  token: string;

  @Column({ name: 'event_id', type: 'integer' })
  eventId: number;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @Column({ name: 'email', type: 'text' })
  email: string;

  @Column({ name: 'used', type: 'boolean', default: false })
  used: boolean;

  @Column({ name: 'expires_at', type: 'integer' })
  expiresAt: number; // POSIX timestamp in seconds

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => VotingEvent)
  @JoinColumn({ name: 'event_id' })
  votingEvent: VotingEvent;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
