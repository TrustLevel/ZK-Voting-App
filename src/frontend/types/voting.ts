export type VotingPowerType = 'simple' | 'weighted';

export interface VotingOption {
  index: number;
  name: string;
  voteCount: number;
}

export interface VotingEvent {
  id: string;
  name: string;
  votingPowerType: VotingPowerType;
  weight: number;
  startDate: Date;
  endDate: Date;
  options: VotingOption[];
  status: 'upcoming' | 'active' | 'ended';
}

export interface UserSecrets {
  identitySecret: string;
  nullifierSecret: string;
}

export interface VoteSubmission {
  eventId: string;
  selectedOption: number;
  weight?: number; // for weighted voting
}