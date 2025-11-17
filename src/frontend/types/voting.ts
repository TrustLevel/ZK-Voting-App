// Backend-aligned types matching VotingEvent entity from dev/ash

export interface VotingEvent {
  // Core fields
  eventId: number;
  eventName: string;

  // Voting configuration (nullable during creation)
  votingNft?: string | null;
  votingValidatorAddress?: string | null;
  votingPower: number | null; // 1 = simple vote, >1 = weighted (distribute X points)
  options: string | null; // JSON string of string array: ["Option 1", "Option 2", ...]
  adminUserId: number | null;
  startingDate: number | null; // POSIX timestamp
  endingDate: number | null; // POSIX timestamp

  // Group configuration (required fields)
  groupNft?: string | null;
  groupValidatorAddress?: string | null;
  groupMerkleRootHash: string;
  groupLeafCommitments: string; // JSON: [{userId: number, commitment: string}, ...]
  groupSize: number;

  // Semaphore configuration (nullable)
  semaphoreNft?: string | null;
  semaphoreAddress?: string | null;
  nullifierMerkleTree?: string | null;
  nullifierLeafCommitments?: string | null;
  verificationReferenceInput?: string | null;
  currentVoteCount?: string | null; // JSON: vote tallies
}

// Participant with backend-compatible structure
export interface Participant {
  userId: number;
  commitment: string;
  email?: string; // Optional: for frontend display only, fetched from User API
  status?: 'pending' | 'registered'; // Optional: for frontend UI state
  registeredAt?: Date; // Optional: for frontend display
}

// Frontend helper types for options parsing
export interface VotingOption {
  index: number;
  name: string;
}

// User secrets for ZK proof generation
export interface UserSecrets {
  identitySecret: string;
  nullifierSecret: string;
}

// Vote submission payload
export interface VoteSubmission {
  eventId: number; // Changed from string to number
  selectedOption: number; // Index of selected option
  votingPower?: number; // For weighted voting: how many points to assign
}

// Helper type for create event payload (minimal fields needed)
export interface CreateEventPayload {
  eventName: string;
  adminUserId?: number | null; // TODO: Will be set after User auth is implemented
  groupSize?: number; // Optional: backend sets default 20
}