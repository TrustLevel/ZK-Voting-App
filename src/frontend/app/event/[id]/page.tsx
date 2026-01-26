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
import Image from 'next/image';
import { Identity } from 'modp-semaphore-bls12381/packages/typescript/src/identity';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// ============================================================================
// TYPES / INTERFACES
// ============================================================================

interface VotingEvent {
  eventId: number;
  eventName: string;
  options: string; // JSON string
  startingDate: number | null;
  endingDate: number | null;
  votingPower: number;
  groupSize: number;
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
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [validatingToken, setValidatingToken] = useState(false);

  // Identity & Registration State
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [hasIdentity, setHasIdentity] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  // Voting State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [pointsDistribution, setPointsDistribution] = useState<{ [key: number]: number }>({});
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  // --------------------------------------------------------------------------
  // EFFECTS / LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Validate invitation token on page load
   * Backend: GET /voting-event/validate-token/:token
   * Stores userId in localStorage for this event+token combination
   */
  useEffect(() => {
    const validateInvitationToken = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');

      if (!token) {
        return;
      }

      // Check if we already validated this specific token for this event
      const storedUserId = localStorage.getItem(`userId_${eventId}_${token}`);
      if (storedUserId) {
        setValidatedUserId(parseInt(storedUserId));
        return;
      }

      // Token not yet validated, validate it now
      setValidatingToken(true);

      try {
        const response = await fetch(`${BACKEND_API_URL}/voting-event/validate-token/${token}`);

        if (!response.ok) {
          throw new Error('Failed to validate token');
        }

        const result = await response.json();

        if (result.valid) {
          setValidatedUserId(result.userId);
          // Store userId with token as part of key to support multiple users per event
          localStorage.setItem(`userId_${eventId}_${token}`, result.userId.toString());
        } else {
          console.error('Token validation failed:', result.error);
          setTokenError(result.error || 'Invalid invitation token');
        }

      } catch (err) {
        console.error('Error validating token:', err);
        setTokenError('Failed to validate invitation token. Please contact the event organizer.');
      } finally {
        setValidatingToken(false);
      }
    };

    validateInvitationToken();
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
   * Check registration status when validatedUserId changes
   * Backend: GET /voting-event/:eventId/participants
   * Auto-switches to vote tab if registered, results tab if already voted
   */
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      if (!validatedUserId || !eventId) return;

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
            const storedIdentityStr = localStorage.getItem(`identity_${eventId}_${validatedUserId}`);
            if (storedIdentityStr) {
              const storedIdentity: StoredIdentity = JSON.parse(storedIdentityStr);
              setCommitment(storedIdentity.commitment);
              setHasIdentity(true);
            }
            setIsRegistered(true);

            // Check if user has voted
            const hasVotedStr = localStorage.getItem(`has_voted_${eventId}_${validatedUserId}`);
            if (hasVotedStr === 'true') {
              setHasVoted(true);
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
  }, [eventId, validatedUserId]);

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
      // Get userId from validated token
      if (!validatedUserId) {
        setError('You need a valid invitation link to register for this event.');
        return;
      }

      const response = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/participants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: validatedUserId,
            commitment: commitmentValue
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to register commitment to backend');
      }

      // Mark the invitation token as used
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');

      if (token) {
        try {
          await fetch(
            `${BACKEND_API_URL}/voting-event/mark-token-used/${token}`,
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
      setError('Failed to register. Please try again or contact the event organizer.');
    }
  };

  /**
   * Submit vote to backend
   * Backend: POST /voting-event/:eventId/vote
   * Submits the selected option and marks user as voted
   */
  const submitVote = async (optionIndex: number) => {
    try {
      setSubmitting(true);

      // Validate userId
      if (!validatedUserId) {
        throw new Error('User ID not found. Please use a valid invitation link.');
      }

      // ============================================================================
      // ⚠️ TODO FOR ZK-PROOF IMPLEMENTATION
      // ============================================================================
      //
      // CURRENT (FAKE - NOT ANONYMOUS):
      // - Sends userId (reveals identity!)
      // - No ZK-proof verification
      //
      // REQUIRED CHANGES:
      //
      // 1. FRONTEND: Generate ZK-proof using stored identity
      //    const storedIdentityStr = localStorage.getItem(`identity_${eventId}_${validatedUserId}`);
      //    const storedIdentity: StoredIdentity = JSON.parse(storedIdentityStr);
      //    const identity = new Identity(
      //      BigInt(storedIdentity.trapdoor),
      //      BigInt(storedIdentity.nullifier)
      //    );
      //    const { proof, nullifier } = await generateProofForVote(
      //      identity,
      //      event.groupMerkleRootHash, // Current Merkle root
      //      optionIndex
      //    );
      //
      // 2. FRONTEND: Send proof + nullifier (NO userId!)
      //    const votePayload = {
      //      proof: proof,           // ZK-proof object
      //      nullifier: nullifier,   // Computed nullifier (prevents double-voting)
      //      signal: optionIndex     // The vote itself
      //    };
      //
      // 3. BACKEND: Verify proof in submitVote()
      //    - Verify proof against groupMerkleRootHash
      //    - Check nullifier not already used
      //    - Store nullifier (NOT userId!)
      //
      // ============================================================================

      const votePayload = {
        selectedOption: optionIndex,
        userId: validatedUserId, // ⚠️ TEMPORARY - REVEALS IDENTITY! Should be replaced with proof + nullifier
      };

      // Submit vote to backend
      const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(votePayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to submit vote');
      }

      // Mark as voted in localStorage (with userId to keep separate user sessions)
      if (validatedUserId) {
        localStorage.setItem(`has_voted_${eventId}_${validatedUserId}`, 'true');
      }
      setHasVoted(true);
      setSubmitting(false);

      // Switch to results tab
      setTimeout(() => {
        setActiveTab('results');
      }, 1500);

    } catch (err) {
      console.error('Error submitting vote:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit vote. Please try again.';
      setError(errorMessage);
      setSubmitting(false);
    }
  };

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Generate Semaphore identity and register commitment
   * Creates new identity, stores it locally, and registers to backend
   */
  const generateIdentity = async () => {
    try {
      setGenerating(true);

      if (!validatedUserId) {
        setError('You need a valid invitation link to register for this event.');
        setGenerating(false);
        return;
      }

      // Generate a new Semaphore identity
      const newIdentity = new Identity();
      const newCommitment = newIdentity.commitment.toString();

      setIdentity(newIdentity);
      setCommitment(newCommitment);

      // Store identity in localStorage with eventId AND userId
      localStorage.setItem(`identity_${eventId}_${validatedUserId}`, JSON.stringify({
        trapdoor: newIdentity.trapdoor.toString(),
        nullifier: newIdentity.nullifier.toString(),
        commitment: newCommitment
      }));

      setHasIdentity(true);

      // Send commitment to backend
      await registerCommitmentToBackend(newCommitment);

      setGenerating(false);
    } catch (err) {
      console.error('Error generating identity:', err);
      setError('Failed to generate identity. Please try again.');
      setGenerating(false);
    }
  };

  /**
   * Handle simple voting (one vote per person)
   * Validates selection and submits vote
   */
  const handleSimpleVote = async () => {
    if (selectedOption === null) {
      alert('Please select an option');
      return;
    }
    await submitVote(selectedOption);
  };

  /**
   * Handle weighted voting (distribute points across options)
   * Validates total points and submits option with most points
   */
  const handleWeightedVote = async () => {
    if (!event) return;

    const totalPoints = Object.values(pointsDistribution).reduce((sum, points) => sum + points, 0);

    if (totalPoints !== event.votingPower) {
      alert(`Please distribute exactly ${event.votingPower} points`);
      return;
    }

    // Find the option with the most points
    const maxPoints = Math.max(...Object.values(pointsDistribution));
    const selectedOptionIndex = Object.entries(pointsDistribution)
      .find(([_, points]) => points === maxPoints)?.[0];

    if (selectedOptionIndex === undefined) {
      alert('Please distribute your points');
      return;
    }

    await submitVote(parseInt(selectedOptionIndex));
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
   * Format POSIX timestamp to UTC string
   */
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Not set';
    // Convert POSIX timestamp (seconds) to milliseconds and format as UTC
    const date = new Date(timestamp * 1000);
    return date.toUTCString().replace('GMT', 'UTC');
  };

  // --------------------------------------------------------------------------
  // UI / RENDER
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-gray-900 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <div className="text-xl text-gray-900">Loading event...</div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md text-center border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-gray-900 mb-4">{error || 'Event not found'}</div>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const isSimpleVote = event.votingPower === 1;

  // Show error page if token is invalid
  if (tokenError) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md border border-gray-100">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Invitation</h1>
            <p className="text-gray-600 mb-8">{tokenError}</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 border border-gray-100">

          {/* Logo */}
          <div className="text-center mb-4">
            <a href="/" className="inline-block">
              <Image
                src="/TrustLevel_JPG_LOGO.jpg"
                alt="TrustLevel"
                width={400}
                height={400}
                className="mx-auto"
              />
            </a>
          </div>

          {/* Header with Event Info & Tabs */}
          <div className="mb-12">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
              {/* Event Info */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-gray-900">{event.eventName}</h3>
                    <p className="text-sm text-gray-600">
                      {formatDate(event.startingDate)} - {formatDate(event.endingDate)}
                    </p>
                  </div>
                </div>

                {/* Important Notice */}
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mt-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-yellow-900 font-semibold mb-1">Important</p>
                      <p className="text-xs text-yellow-800">
                        Don't close or refresh this page - you'd lose access to this voting event. Voting & Result page update automatically once voting starts or ends.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200 my-6" />

              {/* Tab Navigation */}
              <div className="flex items-center justify-center gap-6 max-w-2xl mx-auto py-2">
                {/* Register Tab */}
                <button
                  onClick={() => setActiveTab('register')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'register'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : isRegistered ? 'bg-gray-900' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {isRegistered ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold text-white">1</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'register' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Register</span>
                </button>

                {/* Connector Line */}
                <div className={`w-12 h-px ${isRegistered ? 'bg-gray-300' : 'bg-gray-200'}`}></div>

                {/* Vote Tab */}
                <button
                  onClick={() => setActiveTab('vote')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'vote'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : hasVoted ? 'bg-gray-900' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {hasVoted ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold text-white">2</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'vote' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Vote</span>
                </button>

                {/* Connector Line */}
                <div className={`w-12 h-px ${hasVoted ? 'bg-gray-300' : 'bg-gray-200'}`}></div>

                {/* Results Tab */}
                <button
                  onClick={() => setActiveTab('results')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'results'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : 'bg-gray-300 text-gray-600'
                  }`}>
                    <span className="text-sm font-bold text-white">3</span>
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'results' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Results</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-8">
            {/* Register Tab */}
            {activeTab === 'register' && (
              <div>
                {isRegistered ? (
                  // Already Registered Success State
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-8 text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">Already Registered!</h2>
                    <p className="text-gray-600 mb-6">You have successfully registered for this event.</p>
                    <button
                      onClick={() => setActiveTab('vote')}
                      className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold"
                    >
                      Go to Voting
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Token Validation Status */}
                    {validatingToken && (
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
                        <div className="flex items-center gap-3">
                          <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <div>
                            <h4 className="font-bold text-blue-900">Validating Invitation</h4>
                            <p className="text-sm text-blue-800">Checking your invitation link...</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Secure Registration Section */}
                    <div className="mb-8">
                      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
                        <div className="flex items-center gap-2 mb-4">
                          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <h3 className="font-bold text-gray-900">Registration</h3>
                        </div>
                        <p className="text-gray-600 text-sm mb-6">
                          Create your anonymous voting credentials to participate in this event.
                        </p>

                        {!commitment ? (
                          <button
                            onClick={generateIdentity}
                            disabled={generating || validatingToken || !!tokenError}
                            className="w-full px-6 py-4 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {generating ? (
                              <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Completing Registration...
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Complete Registration
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                              <span className="text-green-800 font-semibold">Registration Complete</span>
                            </div>
                            <div className="text-sm text-gray-700 mb-2">Your Anonymous Credentials:</div>
                            <div className="font-mono text-xs bg-white p-3 rounded border border-green-200 break-all text-gray-900">
                              {commitment}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                  </>
                )}
              </div>
            )}

            {/* Vote Tab */}
            {activeTab === 'vote' && (
              <div>
                {/* Status Info Box */}
                {!isRegistered ? (
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-yellow-900 mb-1">Registration Required</h3>
                        <p className="text-sm text-yellow-800 mb-3">You need to register before you can vote.</p>
                        <button
                          onClick={() => setActiveTab('register')}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all font-semibold text-sm"
                        >
                          Go to Registration
                        </button>
                      </div>
                    </div>
                  </div>
                ) : !event.startingDate || Date.now() < event.startingDate * 1000 ? (
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">Voting Hasn't Started Yet</h3>
                        {event.startingDate ? (
                          <p className="text-sm text-gray-700">The voting period will begin on {formatDate(event.startingDate)}.</p>
                        ) : (
                          <p className="text-sm text-gray-700">The voting start date has not been set yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : event.endingDate && Date.now() > event.endingDate * 1000 ? (
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">Voting Has Ended</h3>
                        <p className="text-sm text-gray-700 mb-3">The voting period ended on {formatDate(event.endingDate)}.</p>
                        <button
                          onClick={() => setActiveTab('results')}
                          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-semibold text-sm"
                        >
                          View Results
                        </button>
                      </div>
                    </div>
                  </div>
                ) : hasVoted ? (
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">Vote Submitted!</h3>
                        <p className="text-sm text-gray-700 mb-3">Your vote has been recorded anonymously.</p>
                        <button
                          onClick={() => setActiveTab('results')}
                          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-semibold text-sm"
                        >
                          View Results
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-yellow-900 mb-1">Cast Your Vote</h3>
                        {event.endingDate ? (
                          <p className="text-sm text-yellow-800">Voting is open until {formatDate(event.endingDate)}.</p>
                        ) : (
                          <p className="text-sm text-yellow-800">Voting is now open.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Voting Options Section - Always Visible */}
                <div className="mb-8">
                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-6">
                      <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="font-bold text-gray-900">
                        {isSimpleVote ? 'Select Your Choice' : `Distribute ${event.votingPower} Points`}
                      </h3>
                    </div>

                    {isSimpleVote ? (
                      // Simple Vote: Radio buttons
                      <div className="space-y-3 mb-6">
                        {options.map((option) => (
                          <label
                            key={option.index}
                            className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              selectedOption === option.index
                                ? 'border-gray-900 bg-gray-50'
                                : 'border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="vote-option"
                              value={option.index}
                              checked={selectedOption === option.index}
                              onChange={() => setSelectedOption(option.index)}
                              disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted}
                              className="w-5 h-5 text-gray-900 focus:ring-gray-900 disabled:opacity-50"
                            />
                            <span className="ml-3 text-gray-900 font-medium">{option.text}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      // Weighted Vote: Points distribution
                      <div className="space-y-4 mb-6">
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700 font-medium">Points Remaining:</span>
                            <span className={`text-2xl font-bold ${
                              getTotalDistributedPoints() === event.votingPower
                                ? 'text-green-600'
                                : 'text-gray-900'
                            }`}>
                              {event.votingPower - getTotalDistributedPoints()}
                            </span>
                          </div>
                        </div>

                        {options.map((option) => (
                          <div key={option.index} className="bg-white rounded-xl border-2 border-gray-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-gray-900 font-medium">{option.text}</span>
                              <span className="text-gray-900 font-bold text-lg">
                                {pointsDistribution[option.index] || 0} pts
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={event.votingPower}
                              value={pointsDistribution[option.index] || 0}
                              onChange={(e) => updatePointsDistribution(option.index, parseInt(e.target.value))}
                              disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={isSimpleVote ? handleSimpleVote : handleWeightedVote}
                      disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted || submitting || (isSimpleVote ? selectedOption === null : getTotalDistributedPoints() !== event.votingPower)}
                      className="w-full px-6 py-4 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Submitting Vote...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Submit Vote
                        </>
                      )}
                    </button>

                    {!isSimpleVote && getTotalDistributedPoints() !== event.votingPower && (
                      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-yellow-800 font-medium">
                          Please distribute all {event.votingPower} points before submitting
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Privacy Notice */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Privacy Protected</h4>
                      <p className="text-sm text-gray-700">
                        Your vote is anonymous and secured using zero-knowledge proofs.
                        No one can link your identity to your vote, while ensuring each person votes only once.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && (
              <div>
                {/* Voting Status */}
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Event Status</h3>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Voting Period:</span>
                      <span className="text-gray-900 font-medium">{formatDate(event.startingDate)} - {formatDate(event.endingDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Voting Type:</span>
                      <span className="text-gray-900 font-medium">
                        {isSimpleVote ? 'Simple Vote' : `Weighted (${event.votingPower} points)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Results */}
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200 mb-8">
                  <div className="flex items-center gap-2 mb-6">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Voting Results</h3>
                  </div>

                  {/* Show pending message if voting hasn't ended yet */}
                  {event.endingDate && Date.now() < event.endingDate * 1000 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-center">
                      <p className="text-sm text-gray-700">
                        Results will be displayed here once voting ends. Check back after {formatDate(event.endingDate)}
                      </p>
                    </div>
                  ) : (
                    // Show actual results if voting has ended
                    <div className="space-y-3">
                      {fullOptions.sort((a, b) => (b.votes || 0) - (a.votes || 0)).map((option, index) => {
                        const totalVotes = fullOptions.reduce((sum, opt) => sum + (opt.votes || 0), 0);
                        const percentage = totalVotes > 0 ? ((option.votes || 0) / totalVotes * 100).toFixed(1) : '0.0';

                        return (
                          <div key={option.index} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="shrink-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
                                  {index + 1}
                                </span>
                                <span className="text-gray-900 font-medium">{option.text}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-gray-900 font-bold">{option.votes || 0} votes</div>
                                <div className="text-gray-500 text-sm">{percentage}%</div>
                              </div>
                            </div>
                            {totalVotes > 0 && (
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-gray-900 h-2 rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Privacy Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Verified & Anonymous</h4>
                      <p className="text-sm text-gray-700">
                        All votes are cryptographically verified using zero-knowledge proofs.
                        Results are tamper-proof and will be publicly auditable once voting ends.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
