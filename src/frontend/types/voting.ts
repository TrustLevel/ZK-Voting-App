// Backend-aligned types matching VotingEvent entity

// User entity matching backend User table
export interface User {
  userId: number;
  userEmail: string | null; // Nullable for wallet-only users
  walletAddress: string | null; // Nullable for email-only users
  eventPermissions: string; // JSON string: [event_id, ...]
  nonces: string; // JSON string: [nonce_string, ...] for wallet authentication
}

export interface VotingEvent {
  // Core fields
  eventId: number;
  eventName: string;

  // Voting configuration (nullable during creation)
  votingNft?: string | null;
  votingValidatorAddress?: string | null;
  votingPower: number | null; // 1 = simple vote, >1 = weighted (distribute X points)
  options: string | null; // JSON string: [{index: number, text: string, votes: number}, ...]
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

// Frontend helper types for options parsing (matches backend format)
export interface VotingOption {
  index: number;
  text: string; // Changed from 'name' to 'text' to match backend
  votes: number; // Vote count for this option
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

// Create event payload matching backend API (POST /voting-event)
export interface CreateEventPayload {
  eventName: string;
  options: string[]; // Array of option strings that backend will format
  startingDate: number; // POSIX timestamp
  endingDate: number; // POSIX timestamp
  votingPower: number; // 1 = simple vote, >1 = weighted voting
  adminUserId: number;
}

// API Response types

// Response from POST /voting-event
export interface CreateEventResponse extends VotingEvent {}

// Response from GET /voting-event/:eventId/participants
export type GetParticipantsResponse = number[]; // Array of user IDs

// Response from POST /voting-event/:eventId/participants
export interface AddParticipantResponse extends VotingEvent {}

// Response from DELETE /voting-event/:eventId/participants/:userId
export interface RemoveParticipantResponse extends VotingEvent {}

// Helper types for parsing JSON fields
export interface ParsedEventPermissions {
  eventIds: number[];
}

export interface ParsedNonces {
  nonces: string[];
}

export interface ParsedGroupLeafCommitments {
  participants: Array<{
    userId: number;
    commitment: string;
  }>;
}