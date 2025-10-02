import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('User')
export class User {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  userId: number;

  @Column({ name: 'user_email', type: 'text', unique: true })
  userEmail: string;

  @Column({ name: 'event_permissions', type: 'text', default: '[]' })
  eventPermissions: string;
}
