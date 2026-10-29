'use client';

/**
 * VOTING EVENT PAGE (PARTICIPANT VIEW)
 *
 * This page allows invited participants to register, vote, and view results.
 *
 * Flow:
 * 1. Validate invitation token from URL
 * 2. Load event data from backend
 * 3. Generate Semaphore identity and register commitment
 * 4. Cast vote (simple or weighted voting)
 * 5. View results after voting ends
 *
 * Backend API Calls:
 * - GET  /voting-event/validate-token/:token           (validate invitation token)
 * - POST /voting-event/mark-token-used/:token          (mark token as used after registration)
 * - GET  /voting-event/:eventId                        (load event data)
 * - GET  /voting-event/:eventId/participants           (check registration status)
 * - POST /voting-event/:eventId/participants           (register commitment)
 * - POST /voting-event/:eventId/vote                   (submit vote)
 */

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Identity } from 'modp-semaphore-bls12381/packages/typescript/src/identity';
import { encodeVoteSignal, generateVoteProof } from '@/lib/vote-helpers';
import { asNetwork, explorerTxUrl } from '@/lib/network';
import { NetworkBadge } from '@/components/NetworkBadge';
import { LinkBox } from '@/components/LinkBox';
import { formatLocalDateTime } from '@/lib/format';
import { AppShell, PageIntro } from '@/components/AppShell';
import { Button, buttonClass } from '@/components/Button';
import { CardHeader, Notice } from '@/components/Card';
import { EventFacts, eventPhase } from '@/components/EventFacts';
import { AlertIcon, BallotIcon, ChartIcon, CheckIcon, ClockIcon, ExternalIcon, KeyIcon, LinkIcon, PlusIcon, Spinner, UploadIcon } from '@/components/Icons';
import { InfoButton } from '@/components/InfoButton';
import { INFO } from '@/components/infoTexts';
import { ResultRow } from '@/components/ResultRow';
import { Steps } from '@/components/Steps';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000';

// ============================================================================
// TYPES / INTERFACES
// ============================================================================

interface VotingEvent {
  eventId: number;
  eventName: string;
  network?: 'mainnet' | 'preprod';
  options: string; // JSON string
  startingDate: number | null;
  endingDate: number | null;
  votingPower: number;
  groupSize: number;
  // Blockchain fields (set after admin completes Phase 2 minting)
  semaphoreAddress: string | null;
  votingValidatorAddress: string | null;
  semaphoreNft: string | null;   // Policy ID
  votingNft: string | null;      // Policy ID
  groupNft: string | null;       // Policy ID
  groupMerkleRootHash: string;
  mintingOrefTxHash: string | null;
  mintingOrefIndex: number | null;
}

interface VotingOption {
  index: number;
  text: string;
  votes: number;
}

interface StoredIdentity {
  trapdoor: string;
  nullifier: string;
  commitment: string;
}

type Tab = 'register' | 'vote' | 'results';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('register');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Event Data State
  const [event, setEvent] = useState<VotingEvent | null>(null);
  const [options, setOptions] = useState<VotingOption[]>([]);
  const [fullOptions, setFullOptions] = useState<VotingOption[]>([]); // Options with vote counts

  // Token Validation State
  const [validatedUserId, setValidatedUserId] = useState<number | null>(null);
  const [validatedToken, setValidatedToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [validatingToken, setValidatingToken] = useState(false);

  // Identity & Registration State
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [hasIdentity, setHasIdentity] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [identityDownloaded, setIdentityDownloaded] = useState(false);
  const [commitmentCopied, setCommitmentCopied] = useState(false);
  const [eventLinkCopied, setEventLinkCopied] = useState(false);

  // Voting State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [pointsDistribution, setPointsDistribution] = useState<{ [key: number]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedOptionIndex, setVotedOptionIndex] = useState<number | null>(null);
  const [voteStep, setVoteStep] = useState<string | null>(null);
  // What is happening behind each step — testers asked for this during the waits.
  const voteStepHint = (step: string): string => {
    if (step.startsWith('Fetching Merkle proof')) return 'Loading your membership path in the voter group.';
    if (step.startsWith('Encoding')) return 'Preparing your choice as the message the proof will commit to.';
    if (step.startsWith('Generating ZK proof')) return 'Your browser is proving that you are a registered voter without revealing who you are. Your identity never leaves this device.';
    if (step.startsWith('Submitting')) return 'The voting service records your vote on the Cardano blockchain. No wallet or signature is needed from you.';
    return '';
  };
  const [voteTxHash, setVoteTxHash] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Results State
  const [results, setResults] = useState<VotingOption[] | null>(null);
  const [resultsMeta, setResultsMeta] = useState<{ status: string; totalVotes: number | null; registeredVoters: number | null; resultsAvailable: boolean } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // File Upload State
  const [uploadingIdentity, setUploadingIdentity] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // EFFECTS / LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Initialize session: Check localStorage first, then validate token if needed
   * This allows returning users to vote without re-validating their token
   *
   * Flow:
   * 1. Check localStorage for existing identity → load it and skip token validation
   * 2. No identity found → validate token from URL (first visit)
   */

  useEffect(() => {
    const initializeSession = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');

      if (!token) {
        return;
      }

      // STEP 1: Check if user has already generated identity for this event
      // This allows them to return and vote without re-validating token
      const storedIdentityStr = localStorage.getItem(`identity_${eventId}_${token}`);

      if (storedIdentityStr) {
        // User has identity stored → restore it and skip token validation
        try {
          const storedIdentity: StoredIdentity = JSON.parse(storedIdentityStr);
          setCommitment(storedIdentity.commitment);
          setHasIdentity(true);
          setValidatedToken(token);

          // We need userId for registration check - validate token silently
          // Token validation returns userId even for "used" tokens (authentication, not registration check)
          try {
            const response = await fetch(`${BACKEND_API_URL}/voting-event/validate-token/${token}`);
            if (response.ok) {
              const result = await response.json();
              if (result.valid && result.userId) {
                setValidatedUserId(result.userId);
              }
            }
          } catch (err) {
            // Silent fail - user can still proceed with stored identity
            console.log('Could not fetch userId, but identity exists locally');
          }

          return; // Skip token validation flow
        } catch (err) {
          console.error('Failed to parse stored identity:', err);
          // Fall through to token validation
        }
      }

      // STEP 2: No stored identity → validate token (first visit)
      setValidatingToken(true);

      try {
        const response = await fetch(`${BACKEND_API_URL}/voting-event/validate-token/${token}`);

        if (!response.ok) {
          throw new Error('Failed to validate token');
        }

        const result = await response.json();

        if (result.valid) {
          // Token is authentic - set user info
          // Note: result.used flag is informational only
          // Registration status will be checked separately
          setValidatedUserId(result.userId);
          setValidatedToken(token);
          localStorage.setItem(`token_${eventId}`, token);
        } else {
          // Only show error for truly invalid tokens (not "used" tokens)
          console.error('Token validation failed:', result.error);
          setTokenError(result.error || 'Invalid invitation token');
        }

      } catch (err) {
        console.error('Error validating token:', err);
        setTokenError('Failed to validate invitation token. Please contact the event organiser.');
      } finally {
        setValidatingToken(false);
      }
    };

    initializeSession();
  }, [eventId]);

  /**
   * Load event details and set up auto-refresh timers
   * Backend: GET /voting-event/:eventId
   * Sets timers to reload page when voting starts/ends
   */
  useEffect(() => {
    if (!eventId) return;

    let startTimer: NodeJS.Timeout | undefined;
    let endTimer: NodeJS.Timeout | undefined;

    const loadEvent = async () => {
      try {
        setLoading(true);

        // Load event from backend
        const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`);
        if (!response.ok) {
          throw new Error('Failed to load voting event');
        }

        const data = await response.json();
        setEvent(data);

        // Parse options (with vote counts)
        if (data.options) {
          const parsedOptions = JSON.parse(data.options);
          setOptions(parsedOptions);
          setFullOptions(parsedOptions); // Store full options with vote counts
        }

        // Set up auto-refresh when voting starts (only if not started yet)
        if (data.startingDate) {
          const startTime = data.startingDate * 1000;
          const now = Date.now();
          const timeUntilStart = startTime - now;

          // If voting hasn't started yet, set a timer to refresh when it does
          if (timeUntilStart > 0) {
            startTimer = setTimeout(() => {
              window.location.reload();
            }, timeUntilStart);
          }
        }

        // Set up auto-refresh when voting ends (only if not ended yet)
        if (data.endingDate) {
          const endTime = data.endingDate * 1000;
          const now = Date.now();
          const timeUntilEnd = endTime - now;

          // If voting hasn't ended yet, set a timer to refresh when it does
          if (timeUntilEnd > 0) {
            endTimer = setTimeout(() => {
              window.location.reload();
            }, timeUntilEnd);
          }
        }

        // Initialize points distribution for weighted voting
        if (data.votingPower > 1 && data.options) {
          const parsedOptions = JSON.parse(data.options);
          const initialDistribution: { [key: number]: number } = {};
          parsedOptions.forEach((opt: VotingOption) => {
            initialDistribution[opt.index] = 0;
          });
          setPointsDistribution(initialDistribution);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading event:', err);
        setError('Failed to load voting event. Please try again.');
        setLoading(false);
      }
    };

    loadEvent();

    // Cleanup function: clear timers if component unmounts
    return () => {
      if (startTimer) clearTimeout(startTimer);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [eventId]);

  /**
   * Check registration status when token is validated
   * Backend: GET /voting-event/:eventId/participants
   * Auto-switches to vote tab if registered, results tab if already voted
   */
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      if (!validatedUserId || !validatedToken || !eventId) return;

      try {
        // Get list of registered participants from backend
        const participantsResponse = await fetch(
          `${BACKEND_API_URL}/voting-event/${eventId}/participants`
        );

        if (participantsResponse.ok) {
          const registeredUserIds = await participantsResponse.json() as number[];
          const isUserRegistered = registeredUserIds.includes(validatedUserId);

          if (isUserRegistered) {
            // User is registered in backend - load their identity from localStorage
            const storedIdentityStr = localStorage.getItem(`identity_${eventId}_${validatedToken}`);
            if (storedIdentityStr) {
              const storedIdentity: StoredIdentity = JSON.parse(storedIdentityStr);
              setCommitment(storedIdentity.commitment);
              setHasIdentity(true);
            }
            setIsRegistered(true);

            // Check if user has voted
            const hasVotedStr = localStorage.getItem(`has_voted_${eventId}_${validatedToken}`);
            if (hasVotedStr === 'true') {
              setHasVoted(true);
              // Load voted option from localStorage
              const votedOptionStr = localStorage.getItem(`voted_option_${eventId}_${validatedToken}`);
              if (votedOptionStr) {
                setVotedOptionIndex(parseInt(votedOptionStr));
              }
              setActiveTab('results');
            } else {
              setActiveTab('vote');
            }
          }
        }
      } catch (err) {
        console.error('Failed to check registration status:', err);
        // Continue without blocking - user can try to register
      }
    };

    checkRegistrationStatus();
  }, [eventId, validatedUserId, validatedToken]);

  useEffect(() => {
    if (activeTab === 'results') loadResults();
  }, [activeTab]);

  // --------------------------------------------------------------------------
  // BACKEND API CALLS
  // --------------------------------------------------------------------------

  /**
   * Register commitment to backend
   * Backend: POST /voting-event/:eventId/participants
   * Backend: POST /voting-event/mark-token-used/:token
   * Registers the Semaphore commitment and marks invitation token as used
   */
  const registerCommitmentToBackend = async (commitmentValue: string) => {
    try {
      // Get token from validated state
      if (!validatedToken) {
        setError('You need a valid invitation link to register for this event.');
        return;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/participants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: validatedToken,
            commitment: commitmentValue
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to register commitment to backend');
      }

      // Mark the invitation token as used
      if (validatedToken) {
        try {
          await fetch(
            `${BACKEND_API_URL}/voting-event/mark-token-used/${validatedToken}`,
            { method: 'POST' }
          );
        } catch (err) {
          console.error('Failed to mark token as used:', err);
          // Don't block registration if this fails
        }
      }

      // Mark as registered
      setIsRegistered(true);

      // Auto-switch to vote tab after successful registration
      setTimeout(() => {
        setActiveTab('vote');
      }, 1500);

    } catch (err) {
      console.error('Error registering commitment to backend:', err);
      setError('Failed to register. Please try again in a few minutes.');
    }
  };

  /**
   * Convert a raw Blockfrost/backend submission error into a short user-facing message.
   * The full error is always logged to the console for debugging.
   */
  // Turns a relay-vote error into something a voter can act on. Order matters: a tx built
  // on inputs that a pending vote already spent shows up as BadInputs/ValueNotConserved,
  // which must not be reported as "insufficient funds" (F10).
  const classifySubmissionError = (status: number, errData: any): string => {
    const raw = typeof errData?.message === 'string' ? errData.message : JSON.stringify(errData);
    if (status === 400 && raw.startsWith('Invalid vote proof')) {
      return 'Your vote could not be verified for this event. Please reload the page and try again in a few minutes.';
    }
    if (status === 503) {
      return 'The voting service is temporarily unavailable. Please try again in a few minutes.';
    }
    if (status === 402) {
      return 'The organiser\'s fee budget for this event is used up, so no more votes can be recorded right now. Please try again later — nothing is required from you.';
    }
    if (raw.includes('BadInputs') || raw.includes('UtxoFailure') || raw.includes('All inputs are spent') ||
        raw.includes('Unknown transaction input') || raw.includes('missing from UTxO set') ||
        raw.includes('CannotCreateEvaluationContext') || raw.includes('extraRedeemers')) {
      return 'Another vote is still being confirmed on the blockchain. Your vote was not counted yet — please try again in a few minutes.';
    }
    if (raw.includes('OutsideValidityInterval') || raw.includes('ValidityInterval')) {
      return 'The voting period is not open right now (it has either not started or already ended).';
    }
    if (raw.includes('PlutusFailure') || raw.includes('ValidationTagMismatch')) {
      return 'The vote was rejected by the on-chain validator. This happens when the voting period is closed or the proof does not match the current voter group. Please try again in a few minutes.';
    }
    if (raw.includes('ValueNotConserved') || raw.includes('FeeTooSmall') || raw.includes('InsufficientFunds')) {
      return 'The voting service could not pay the transaction fee. Please try again in a few minutes — nothing is required from your wallet.';
    }
    // Surface the raw backend message in dev so we can diagnose blockchain rejections.
    if (process.env.NODE_ENV === 'development') {
      return `Blockchain rejection — raw error: ${raw}`;
    }
    return 'The vote could not be recorded. Please try again in a few minutes.';
  };

  /**
   * Submit vote — 8-step ZK vote flow.
   * voteSignal: [[optionIndex, voteCount], ...]
   */
  const submitVote = async (voteSignal: Array<[number, number]>) => {
    try {
      setSubmitting(true);
      setVoteStep(null);

      if (!validatedUserId) {
        throw new Error('User ID not found. Please use a valid invitation link.');
      }
      if (!event) {
        throw new Error('Event data not loaded.');
      }
      if (!event.semaphoreAddress) {
        throw new Error('Voting not yet available — the event organiser has not completed the blockchain setup.');
      }
      // Load stored identity
      const storedIdentityStr = localStorage.getItem(`identity_${eventId}_${validatedToken}`);
      if (!storedIdentityStr) {
        throw new Error('No identity found. Please upload your identity file.');
      }
      const storedIdentity: StoredIdentity = JSON.parse(storedIdentityStr);

      // Fetch the on-chain Semaphore UTxO's group_merke_root via the backend (F8: no frontend Blockfrost key).
      // This value is frozen at SV mint time; the backend's groupMerkleRootHash can drift
      // if participants register after minting. The ZK proof and output datum must both use
      // the on-chain root, not the backend's current root.
      let onChainGroupMerkleRoot: bigint | null = null;
      try {
        const rootRes = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/on-chain-group-root`);
        if (rootRes.ok) {
          const rootData = await rootRes.json();
          onChainGroupMerkleRoot = BigInt(rootData.groupMerkleRoot);
          console.log('  onChainGroupMerkleRoot:', onChainGroupMerkleRoot.toString());
        }
      } catch (rootErr: any) {
        console.warn('⚠️ Could not fetch on-chain Semaphore root (will use backend root):', rootErr?.message);
      }

      // Step 2: Fetch Merkle proof
      // If the on-chain root differs from the backend's current root, pass targetRoot so
      // the backend reconstructs the proof for the historical tree state at SV mint time.
      setVoteStep('Fetching Merkle proof...');
      const merkleUrl = onChainGroupMerkleRoot !== null
        ? `${BACKEND_API_URL}/voting-event/${eventId}/merkle-proof/${validatedUserId}?targetRoot=${onChainGroupMerkleRoot.toString()}`
        : `${BACKEND_API_URL}/voting-event/${eventId}/merkle-proof/${validatedUserId}`;
      const merkleResponse = await fetch(merkleUrl);
      if (!merkleResponse.ok) {
        const merkleErr = await merkleResponse.json().catch(() => ({}));
        throw new Error(merkleErr.message || 'Failed to fetch Merkle proof');
      }
      const merkleData = await merkleResponse.json();

      const merkleProof = {
        root: BigInt(merkleData.root),
        siblings: (merkleData.siblings as string[]).map(BigInt),
        pathIndices: merkleData.pathIndices as number[],
      };

      // Step 3: Encode vote signal
      setVoteStep('Encoding vote signal...');
      const signalMessage = await encodeVoteSignal(voteSignal);

      // Step 4: Generate ZK proof
      setVoteStep('Generating ZK proof... (this may take ~30s)');
      const externalNullifier = BigInt('0x' + event.semaphoreNft!);
      const { zkProof, nullifierHash, publicSignals } = await generateVoteProof({
        identityNullifier: BigInt(storedIdentity.nullifier),
        identityTrapdoor: BigInt(storedIdentity.trapdoor),
        merkleProof,
        externalNullifier,
        signal: signalMessage,
      });
      const signalHash = BigInt(publicSignals[2]);

      // ── VOTE DIAGNOSTICS ────────────────────────────────────────────────────────
      const BLS12_381_R = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
      console.log('🗳️ VOTE DIAGNOSTICS:');
      console.log('  externalNullifier  :', externalNullifier.toString());
      console.log('  nullifierHash      :', nullifierHash.toString());
      console.log('  signalHash         :', signalHash.toString());
      console.log('  merkleRoot(backend):', merkleData.root);
      console.log('  merkleRoot(circuit):', publicSignals[0]);
      console.log('  groupMerkleRootHash:', event.groupMerkleRootHash);
      console.log('  publicSignals      :', publicSignals);
      console.log('  nullifierHash < 2^248?', nullifierHash < (1n << 248n), '(if true → MPF encoding edge-case)');
      console.log('  merkle root match? backend==merkleProof:', merkleData.root === event.groupMerkleRootHash);
      console.log('  merkle root match? circuit==backend:', publicSignals[0] === event.groupMerkleRootHash);
      if (nullifierHash >= BLS12_381_R) {
        console.error('❌ nullifierHash >= BLS12_381_R — invalid scalar!');
      }
      // ────────────────────────────────────────────────────────────────────────────

      // Step 5: Relay to backend — backend verifies the proof, records the nullifier,
      // then builds, signs, and submits the tx. The voter's wallet never touches the tx.
      setVoteStep('Submitting vote...');
      const submitResponse = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/relay-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piA: zkProof.pi_a,
          piB: zkProof.pi_b,
          piC: zkProof.pi_c,
          publicSignals: publicSignals.map(String),
          signalMessage,
        }),
      });
      if (submitResponse.status === 409) {
        throw new Error(
          'Your vote identity has already been used in a previous attempt. ' +
          'If that transaction was never confirmed on-chain, please contact the event organiser.'
        );
      }
      if (!submitResponse.ok) {
        // The backend rolls the nullifier back itself if building or submitting fails.
        const errData = await submitResponse.json().catch(() => ({}));
        console.error('Relay vote error (full):', JSON.stringify(errData, null, 2));
        throw new Error(classifySubmissionError(submitResponse.status, errData));
      }
      const submitResult = await submitResponse.json();
      const txHash: string = submitResult.txHash;

      // Mark as voted locally
      if (validatedToken) {
        localStorage.setItem(`has_voted_${eventId}_${validatedToken}`, 'true');
        const voteOptionIndex = voteSignal[0]?.[0] ?? null;
        if (voteOptionIndex !== null) {
          localStorage.setItem(`voted_option_${eventId}_${validatedToken}`, voteOptionIndex.toString());
        }
      }
      setHasVoted(true);
      setVotedOptionIndex(voteSignal[0]?.[0] ?? null);
      setVoteTxHash(txHash);
      setVoteStep(null);
      setSubmitting(false);

      setTimeout(() => {
        setActiveTab('results');
      }, 1500);

    } catch (err) {
      console.error('Error submitting vote:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit vote. Please try again.';
      setVoteError(errorMessage);
      setVoteStep(null);
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Download identity file to user's device
   * Creates a JSON file with identity secrets for backup
   */
  const downloadIdentityFile = (identityData: { trapdoor: string; nullifier: string; commitment: string }) => {
    const identityFile = {
      eventId: Number(eventId),
      trapdoor: identityData.trapdoor,
      nullifier: identityData.nullifier,
      commitment: identityData.commitment,
      downloadedAt: new Date().toISOString()
    };

    // Create blob and download
    const blob = new Blob([JSON.stringify(identityFile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `semaphore-identity-event-${eventId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIdentityDownloaded(true);
  };

  /**
   * Generate Semaphore identity
   * Creates new identity, stores it locally, and triggers download
   * NOTE: Does NOT register to backend - user must do that manually
   */
  const generateIdentity = async () => {
    try {
      setGenerating(true);

      if (!validatedToken) {
        setError('You need a valid invitation link to register for this event.');
        setGenerating(false);
        return;
      }

      // Generate a new Semaphore identity
      const newIdentity = new Identity();
      const newCommitment = newIdentity.commitment.toString();

      const identityData = {
        trapdoor: newIdentity.trapdoor.toString(),
        nullifier: newIdentity.nullifier.toString(),
        commitment: newCommitment
      };

      setIdentity(newIdentity);
      setCommitment(newCommitment);

      // Store identity in localStorage with eventId AND token
      localStorage.setItem(`identity_${eventId}_${validatedToken}`, JSON.stringify(identityData));

      setHasIdentity(true);

      // Download identity file automatically
      downloadIdentityFile(identityData);

      // NOTE: Registration is now a separate step - user must click "Register Commitment"
      // This allows them to save the file first before registering

      setGenerating(false);
    } catch (err) {
      console.error('Error generating identity:', err);
      setError('Failed to generate identity. Please try again.');
      setGenerating(false);
    }
  };

  /**
   * Register commitment to backend (separate from identity generation)
   * This is called manually after user has saved their identity file
   */
  const handleRegisterCommitment = async () => {
    if (!commitment) {
      setError('No commitment found. Please generate an identity first.');
      return;
    }

    try {
      setRegistering(true);
      await registerCommitmentToBackend(commitment);
      setRegistering(false);
    } catch (err) {
      console.error('Error registering commitment:', err);
      setError('Failed to register commitment. Please try again.');
      setRegistering(false);
    }
  };

  /**
   * Upload and restore identity from file
   * Allows users to restore their identity on different devices/browsers
   */
  const handleIdentityFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingIdentity(true);
    setUploadError(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const fileContent = e.target?.result as string;
        const data = JSON.parse(fileContent);

        // Validate file structure
        if (!data.eventId || !data.trapdoor || !data.nullifier || !data.commitment) {
          throw new Error('Invalid identity file format. Missing required fields.');
        }

        // Validate eventId matches current event
        if (Number(data.eventId) !== Number(eventId)) {
          throw new Error(`This identity file is for event ${data.eventId}, but you're viewing event ${eventId}.`);
        }

        // Restore identity from trapdoor and nullifier
        // Identity constructor expects a JSON string: '["trapdoor", "nullifier"]'
        const restoredIdentity = new Identity(JSON.stringify([data.trapdoor, data.nullifier]));
        const restoredCommitment = restoredIdentity.commitment.toString();

        // Verify commitment matches
        if (restoredCommitment !== data.commitment) {
          throw new Error('Identity verification failed. The file may be corrupted.');
        }

        // Set state
        setIdentity(restoredIdentity);
        setCommitment(restoredCommitment);
        setHasIdentity(true);

        // Store in localStorage
        if (validatedToken) {
          localStorage.setItem(`identity_${eventId}_${validatedToken}`, JSON.stringify({
            trapdoor: data.trapdoor,
            nullifier: data.nullifier,
            commitment: data.commitment
          }));
        }

        setUploadingIdentity(false);
      } catch (err) {
        console.error('Error uploading identity file:', err);
        setUploadError(err instanceof Error ? err.message : 'Failed to read identity file. Please try again.');
        setUploadingIdentity(false);
      }
    };

    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
      setUploadingIdentity(false);
    };

    reader.readAsText(file);
  };

  /**
   * Copy commitment to clipboard
   */
  const copyCommitmentToClipboard = async () => {
    if (!commitment) return;

    try {
      await navigator.clipboard.writeText(commitment);
      setCommitmentCopied(true);
      setTimeout(() => setCommitmentCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy commitment:', err);
    }
  };

  /**
   * Copy event link with token to clipboard
   */
  const copyEventLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setEventLinkCopied(true);
      setTimeout(() => setEventLinkCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy event link:', err);
    }
  };

  /**
   * Handle simple voting (one vote per person)
   */
  const handleSimpleVote = async () => {
    if (selectedOption === null) {
      alert('Please select an option');
      return;
    }
    await submitVote([[selectedOption, 1]]);
  };

  /**
   * Handle weighted voting (distribute points across options)
   */
  const handleWeightedVote = async () => {
    if (!event) return;

    const totalPoints = Object.values(pointsDistribution).reduce((sum, points) => sum + points, 0);

    if (totalPoints !== event.votingPower) {
      alert(`Please distribute exactly ${event.votingPower} points`);
      return;
    }

    const voteSignal: Array<[number, number]> = Object.entries(pointsDistribution)
      .filter(([_, pts]) => pts > 0)
      .map(([idx, pts]) => [parseInt(idx), pts]);

    if (voteSignal.length === 0) {
      alert('Please distribute your points');
      return;
    }

    await submitVote(voteSignal);
  };

  /**
   * Update points distribution for weighted voting
   * Ensures total doesn't exceed voting power
   */
  const updatePointsDistribution = (optionIndex: number, points: number) => {
    if (!event) return;

    const newDistribution = { ...pointsDistribution };
    newDistribution[optionIndex] = points;

    const totalPoints = Object.values(newDistribution).reduce((sum, p) => sum + p, 0);
    if (totalPoints <= event.votingPower) {
      setPointsDistribution(newDistribution);
    }
  };

  /**
   * Get total points distributed across all options
   */
  const getTotalDistributedPoints = () => {
    return Object.values(pointsDistribution).reduce((sum, points) => sum + points, 0);
  };

  /**
   * Load on-chain results from backend
   */
  const loadResults = async () => {
    setLoadingResults(true);
    try {
      const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/results`);
      if (!response.ok) throw new Error('Failed to load results');
      const data = await response.json();
      setResults(data.options);
      setResultsMeta({ status: data.status, totalVotes: data.totalVotes ?? null, registeredVoters: data.registeredVoters ?? null, resultsAvailable: !!data.resultsAvailable });
    } catch (err) {
      console.error('Failed to load results:', err);
      setResults(null);
      setResultsMeta(null);
    } finally {
      setLoadingResults(false);
    }
  };

  /**
   * POSIX timestamp in the voter's local time with the zone in brackets, so that
   * nobody mistakes it for UTC (Dominik, 2026-10-29).
   */
  const formatDate = (timestamp: number | null) => formatLocalDateTime(timestamp || null);

  // --------------------------------------------------------------------------
  // UI / RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <AppShell width="sm" center>
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner size={40} className="text-ink" />
          <div className="text-lg text-ink">Loading event...</div>
        </div>
      </AppShell>
    );
  }

  if (error || !event) {
    return (
      <AppShell width="sm" center>
        <Notice tone="danger" title={error || 'Event not found'}>
          <Button variant="dark" size="sm" onClick={() => router.push('/')} className="mt-3">
            Go Home
          </Button>
        </Notice>
      </AppShell>
    );
  }

  const isSimpleVote = event.votingPower === 1;

  // Show error page if token is invalid
  if (tokenError) {
    return (
      <AppShell width="sm" center>
        <Notice tone="danger" title="Invalid Invitation">
          <p className="mt-1">{tokenError}</p>
          <p className="mt-2 text-xs text-red-800/80">Invitation links are valid for seven days after they were sent. If yours has expired, ask the event organiser for a new one.</p>
          <Button variant="dark" size="sm" onClick={() => router.push('/')} className="mt-4">
            Go Home
          </Button>
        </Notice>
      </AppShell>
    );
  }

  return (
    <AppShell aside={<NetworkBadge network={asNetwork(event.network)} />}>
      {/* Header with Event Info */}
      <PageIntro eyebrow="VOTING EVENT" title={event.eventName} className="mb-5" />

      {/* Period, type and status at a glance */}
      <EventFacts
        className="mb-6"
        startingDate={event.startingDate}
        endingDate={event.endingDate}
        votingPower={event.votingPower}
        phase={eventPhase(event.startingDate, event.endingDate, !!event.votingNft)}
      />

      {/* Event Access Link */}
      <LinkBox
        className="mb-6"
        icon={<LinkIcon size={18} />}
        title="Your event link"
        info={<InfoButton text={INFO.eventLink} />}
        hint="Use this link + your identity file to access this event later. Keep it secure!"
        url={typeof window !== 'undefined' ? window.location.href : ''}
        copied={eventLinkCopied}
        onCopy={copyEventLinkToClipboard}
      />

      {/* Tab Navigation */}
      <div className="mb-6 rounded-2xl border border-line bg-[#fafafa] px-3 py-3 sm:px-6">
        <Steps<Tab>
          label="Voting steps"
          active={activeTab}
          onSelect={setActiveTab}
          steps={[
            { key: 'register', label: 'Register', done: isRegistered },
            { key: 'vote', label: 'Vote', done: hasVoted },
            { key: 'results', label: 'Results', done: false },
          ]}
        />
      </div>

      {/* Tab Content */}
      <div>
        {/* Register Tab */}
        {activeTab === 'register' && (
          <div>
            {isRegistered ? (
              // Already Registered Success State
              <Notice tone="success" title="Registration Complete">
                <p className="text-emerald-900/80">
                  You have successfully registered for this event.
                </p>
                {commitment && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
                    <div className="flex min-h-9 items-center gap-x-1 text-xs text-muted">
                      Your Commitment ID:
                      <InfoButton text={INFO.commitment} />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-700">
                        {commitment}
                      </p>
                      <Button variant="outline" size="sm" onClick={copyCommitmentToClipboard} className="sm:flex-none">
                        {commitmentCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                )}
              </Notice>
            ) : (
              <>
                {/* Token Validation Status */}
                {validatingToken && (
                  <Notice tone="progress" title="Validating Invitation" className="mb-6">
                    <p className="text-muted">Checking your invitation link...</p>
                  </Notice>
                )}

                {/* Secure Registration Section */}
                <section className="border-t border-line pt-7">
                  <CardHeader
                    icon={<KeyIcon size={20} />}
                    title="Registration"
                    info={<InfoButton text={INFO.registration} />}
                    description="Create your anonymous voting credentials to participate in this event."
                  />

                  {/* Step 1: Generate Identity */}
                  {!hasIdentity ? (
                    <>
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={generateIdentity}
                        disabled={generating || validatingToken || !!tokenError}
                        loading={generating}
                      >
                        {generating ? 'Generating Identity...' : (<><PlusIcon size={18} /> Generate Identity</>)}
                      </Button>
                      <div className="mt-3 flex min-h-9 items-center gap-x-1 text-xs text-muted">
                        <span>Creates your identity file on this device and downloads it. Keep the file until the vote has ended.</span>
                        <InfoButton text={INFO.identityFile} />
                      </div>
                    </>
                  ) : !isRegistered ? (
                    <>
                      {/* Identity Generated - Show Download Confirmation and Warnings */}
                      <div className="space-y-4">
                        {/* Combined: Download Success + Warnings */}
                        <Notice tone="attention" icon={<CheckIcon size={20} />} title={<>Identity File Downloaded <InfoButton text={INFO.identityFile} /></>}>
                          <div className="mt-2 flex items-start gap-2 border-t border-line pt-3">
                            <AlertIcon size={18} className="mt-0.5 flex-none text-brand-dark" />
                            <div className="flex-1">
                              <p className="mb-1 font-semibold">Keep this file safe!</p>
                              <ul className="list-inside list-disc space-y-1 text-xs text-gray-700">
                                <li>You&apos;ll need it to vote later</li>
                                <li>Never share your identity file with anyone</li>
                                <li>If you lose this file, you cannot vote</li>
                              </ul>
                            </div>
                          </div>
                        </Notice>

                        {/* Commitment Display */}
                        <div className="rounded-xl border border-line bg-[#fafafa] p-3">
                          <div className="flex min-h-9 items-center gap-x-1 text-xs text-muted">
                            Your Commitment ID:
                            <InfoButton text={INFO.commitment} />
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <p className="min-w-0 flex-1 break-all font-mono text-xs text-gray-700">
                              {commitment}
                            </p>
                            <Button variant="outline" size="sm" onClick={copyCommitmentToClipboard} className="sm:flex-none">
                              {commitmentCopied ? 'Copied!' : 'Copy'}
                            </Button>
                          </div>
                        </div>

                        {/* Step 2: Register Commitment Button */}
                        <Button
                          variant="primary"
                          size="lg"
                          onClick={handleRegisterCommitment}
                          disabled={registering}
                          loading={registering}
                        >
                          {registering ? 'Registering...' : (<><CheckIcon size={18} /> Register Commitment</>)}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </section>
              </>
            )}
          </div>
        )}

        {/* Vote Tab */}
        {activeTab === 'vote' && (
          <div>
            {/* Status Info Box */}
            {!isRegistered ? (
              // Not Registered - Show Registration Required
              <Notice tone="attention" title="Registration Required" className="mb-6">
                <p className="mb-3">You need to register before you can vote.</p>
                <Button variant="dark" size="sm" onClick={() => setActiveTab('register')}>
                  Go to Registration
                </Button>
              </Notice>
            ) : !hasIdentity ? (
              // Registered but no Identity - Show Upload
              <Notice tone="neutral" icon={<UploadIcon size={20} />} title={<>Identity File Required <InfoButton text={INFO.identityFile} /></>} className="mb-6">
                <p className="mb-3 text-gray-700">
                  You&apos;re registered, but we need your identity file to cast your vote.
                </p>

                {uploadError && (
                  <div className="mb-3 rounded-lg border border-line border-l-4 border-l-red-600 bg-white p-3">
                    <p className="text-xs text-red-800">{uploadError}</p>
                  </div>
                )}

                <label className="block">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleIdentityFileUpload}
                    disabled={uploadingIdentity}
                    className="hidden"
                    id="identity-file-upload"
                  />
                  <label
                    htmlFor="identity-file-upload"
                    className={buttonClass('dark', 'sm', 'cursor-pointer')}
                  >
                    {uploadingIdentity ? (
                      <>
                        <Spinner size={16} />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <UploadIcon size={16} />
                        Upload Identity File
                      </>
                    )}
                  </label>
                </label>
                <p className="mt-2 text-xs text-muted">
                  Upload the JSON file you downloaded during registration.
                </p>
              </Notice>
            ) : !event.startingDate || Date.now() < event.startingDate * 1000 ? (
              <Notice tone="neutral" icon={<ClockIcon size={20} />} title="Voting Hasn't Started Yet" className="mb-6">
                {event.startingDate ? (
                  <>
                    <p className="text-gray-700">The voting period will begin on {formatDate(event.startingDate)}.</p>
                    <p className="mt-1 text-xs text-muted">This page will automatically update when voting starts.</p>
                  </>
                ) : (
                  <p className="text-gray-700">The voting start date has not been set yet.</p>
                )}
              </Notice>
            ) : hasVoted ? (
              <Notice tone="success" title="Vote Submitted" className="mb-6">
                <p className="text-emerald-900/80">
                  Your vote has been recorded anonymously on-chain.
                </p>
                {votedOptionIndex !== null && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-3">
                    <p className="mb-1 text-xs text-muted">Your choice:</p>
                    <p className="text-sm font-semibold text-ink">
                      {options.find(opt => opt.index === votedOptionIndex)?.text || `Option ${votedOptionIndex}`}
                    </p>
                  </div>
                )}
                {voteTxHash && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-3">
                    <p className="mb-1 text-xs text-muted">Transaction:</p>
                    <a
                      href={explorerTxUrl(asNetwork(event?.network), voteTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px]"
                    >
                      View on Explorer
                      <ExternalIcon size={14} />
                    </a>
                  </div>
                )}
                <Button variant="dark" size="sm" onClick={() => setActiveTab('results')} className="mt-4">
                  View Results
                </Button>
              </Notice>
            ) : event.endingDate && Date.now() > event.endingDate * 1000 ? (
              <Notice tone="neutral" icon={<ClockIcon size={20} />} title="Voting Has Ended" className="mb-6">
                <p className="mb-3 text-gray-700">The voting period ended on {formatDate(event.endingDate)}.</p>
                <Button variant="dark" size="sm" onClick={() => setActiveTab('results')}>
                  View Results
                </Button>
              </Notice>
            ) : (
              <Notice tone="attention" icon={<BallotIcon size={20} />} title={<>Cast Your Vote <InfoButton text={INFO.noWallet} /></>} className="mb-6">
                {event.endingDate ? (
                  <p>Voting is open until {formatDate(event.endingDate)}.</p>
                ) : (
                  <p>Voting is now open.</p>
                )}
              </Notice>
            )}

            {/* Voting Options Section - Only show if not voted */}
            {!hasVoted && (
              <section className="border-t border-line pt-7">
                <CardHeader
                  icon={<BallotIcon size={20} />}
                  title={isSimpleVote ? 'Select Your Choice' : `Distribute ${event.votingPower} Points`}
                  info={<InfoButton text={INFO.oneVote} />}
                />

                {isSimpleVote ? (
                  // Simple Vote: Radio buttons
                  <div className="mb-6 space-y-3">
                    {options.map((option) => (
                      <label
                        key={option.index}
                        className={`flex min-h-14 cursor-pointer items-center rounded-xl border-2 p-4 transition has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${
                          selectedOption === option.index
                            ? 'border-ink'
                            : 'border-line hover:border-gray-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vote-option"
                          value={option.index}
                          checked={selectedOption === option.index}
                          onChange={() => setSelectedOption(option.index)}
                          disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted}
                          className="h-5 w-5 accent-ink"
                        />
                        <span className="ml-3 font-medium text-ink">{option.text}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  // Weighted Vote: Points distribution
                  <div className="mb-6 space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-line bg-[#fafafa] p-4">
                      <span className="font-medium text-gray-700">Points Remaining:</span>
                      <span className={`text-2xl font-bold tabular-nums ${
                        getTotalDistributedPoints() === event.votingPower
                          ? 'text-emerald-700'
                          : 'text-ink'
                      }`}>
                        {event.votingPower - getTotalDistributedPoints()}
                      </span>
                    </div>

                    {options.map((option) => (
                      <div key={option.index} className="rounded-xl border-[1.5px] border-line bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <label htmlFor={`points-${option.index}`} className="font-medium text-ink">{option.text}</label>
                          <span className="text-lg font-bold tabular-nums text-ink">
                            {pointsDistribution[option.index] || 0} pts
                          </span>
                        </div>
                        <input
                          id={`points-${option.index}`}
                          type="range"
                          min="0"
                          max={event.votingPower}
                          value={pointsDistribution[option.index] || 0}
                          onChange={(e) => updatePointsDistribution(option.index, parseInt(e.target.value))}
                          disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  onClick={isSimpleVote ? handleSimpleVote : handleWeightedVote}
                  disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted || submitting || !event.semaphoreAddress || (isSimpleVote ? selectedOption === null : getTotalDistributedPoints() !== event.votingPower)}
                  loading={submitting}
                >
                  {submitting ? 'Submitting Vote...' : (<><CheckIcon size={18} /> Submit Vote</>)}
                </Button>
                {voteStep && (
                  <div className="mt-4 rounded-xl border border-line bg-[#fafafa] p-4 text-center" role="status" aria-live="polite">
                    <div className="flex items-center justify-center gap-x-1">
                      <p className="text-sm font-semibold text-ink">{voteStep}</p>
                      {voteStep.startsWith('Generating ZK proof') && <InfoButton text={INFO.proofTime} />}
                    </div>
                    <p className="mt-1 text-xs text-muted">{voteStepHint(voteStep)}</p>
                  </div>
                )}

                {voteError && (
                  <Notice tone="danger" title="Vote Failed" className="mt-4">
                    <p className="mt-1">{voteError}</p>
                    <button
                      type="button"
                      onClick={() => setVoteError(null)}
                      className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-red-800 underline hover:no-underline"
                    >
                      Dismiss
                    </button>
                  </Notice>
                )}

                {!isSimpleVote && getTotalDistributedPoints() !== event.votingPower && (
                  <Notice tone="attention" icon={null} className="mt-4 text-center">
                    <p className="font-medium">
                      Please distribute all {event.votingPower} points before submitting
                    </p>
                  </Notice>
                )}
              </section>
            )}
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && (
          <div>
            {/* Results */}
            <section className="border-t border-line pt-7">
              <CardHeader
                icon={<ChartIcon size={20} />}
                title="Voting Results"
                info={<InfoButton text={resultsMeta?.resultsAvailable ? INFO.onChainResults : INFO.resultsTiming} />}
                action={
                  <Button variant="outline" size="sm" onClick={loadResults} disabled={loadingResults}>
                    {loadingResults ? 'Loading...' : 'Refresh Results'}
                  </Button>
                }
              />

              {loadingResults ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size={32} className="text-muted" />
                </div>
              ) : results === null ? (
                <div className="rounded-xl border border-line bg-[#fafafa] p-4 text-center">
                  <p className="text-sm text-muted">Results could not be loaded from the blockchain.</p>
                </div>
              ) : resultsMeta && !resultsMeta.resultsAvailable ? (
                <div className="rounded-xl border border-line bg-[#fafafa] px-5 py-8 text-center">
                  <p className="mb-1 font-semibold text-ink">Results are not available yet.</p>
                  <p className="text-sm text-muted">
                    They are revealed once the voting period ends{event.endingDate ? ` (${formatDate(event.endingDate)})` : ''}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {results.sort((a, b) => (b.votes || 0) - (a.votes || 0)).map((option, index) => {
                    const totalVotes = results.reduce((sum, opt) => sum + (opt.votes || 0), 0);
                    const percentage = totalVotes > 0 ? ((option.votes || 0) / totalVotes * 100).toFixed(1) : '0.0';

                    return (
                      <ResultRow
                        key={option.index}
                        rank={index + 1}
                        text={option.text}
                        percent={totalVotes > 0 ? Number(percentage) : 0}
                        value={
                          <>
                            <div className="font-bold tabular-nums text-ink">{option.votes || 0} {isSimpleVote ? 'vote' : 'point'}{(option.votes || 0) !== 1 ? 's' : ''}</div>
                            <div className="text-sm font-normal tabular-nums text-muted">{percentage}%</div>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
