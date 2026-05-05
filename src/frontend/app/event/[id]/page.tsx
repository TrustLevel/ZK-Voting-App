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
import { useWallet } from '@meshsdk/react';
import { BlockfrostProvider, deserializeAddress } from '@meshsdk/core';
import { encodeVoteSignal, generateVoteProof, buildVoteTransaction, applyOrefParamToScript } from '@/lib/vote-helpers';
import { VALIDATORS } from '@src/tx/browser';
import { createOutputReference } from '@/lib/blockchain-helpers';

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

  // Wallet
  const { connected, wallet, connect, name: walletName } = useWallet();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

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
  const [voteTxHash, setVoteTxHash] = useState<string | null>(null);

  // Results State
  const [results, setResults] = useState<VotingOption[] | null>(null);
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

  // Fetch and display the connected wallet address whenever the wallet connects/disconnects
  useEffect(() => {
    if (connected && wallet) {
      wallet.getChangeAddress().then(setConnectedAddress).catch(() => setConnectedAddress(null));
    } else {
      setConnectedAddress(null);
    }
  }, [connected, wallet]);

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
        setTokenError('Failed to validate invitation token. Please contact the event organizer.');
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
      setError('Failed to register. Please try again or contact the event organizer.');
    }
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
        throw new Error('Voting not yet available — the event organizer has not completed the blockchain setup.');
      }
      if (!connected || !wallet) {
        throw new Error('Wallet not connected. Please connect your wallet before voting.');
      }

      // Load stored identity
      const storedIdentityStr = localStorage.getItem(`identity_${eventId}_${validatedToken}`);
      if (!storedIdentityStr) {
        throw new Error('No identity found. Please upload your identity file.');
      }
      const storedIdentity: StoredIdentity = JSON.parse(storedIdentityStr);

      // Step 2: Fetch Merkle proof
      setVoteStep('Fetching Merkle proof...');
      const merkleResponse = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/merkle-proof/${validatedUserId}`
      );
      if (!merkleResponse.ok) throw new Error('Failed to fetch Merkle proof');
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

      // Step 5: Insert nullifier
      setVoteStep('Inserting nullifier...');
      const nullifierResponse = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/nullifier`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nullifier: nullifierHash.toString() }),
        }
      );
      if (!nullifierResponse.ok) {
        const errData = await nullifierResponse.json().catch(() => ({}));
        if (nullifierResponse.status === 409) {
          throw new Error(
            'Your vote identity has already been used in a previous attempt. ' +
            'If that transaction was never confirmed on-chain, please contact the event organizer.'
          );
        }
        throw new Error(errData.message || 'Nullifier insertion failed.');
      }
      const nullifierResult = await nullifierResponse.json();
      const mpfNewRoot: string = nullifierResult.newRoot;
      const mpfProofSteps: Array<object> = nullifierResult.proofSteps;
      console.log('  mpfNewRoot         :', mpfNewRoot);
      console.log('  mpfProofSteps      :', JSON.stringify(mpfProofSteps));

      // Step 6: Build vote transaction
      setVoteStep('Building transaction...');

      const walletAddress = await wallet.getChangeAddress();
      const walletUtxos = await wallet.getUtxos();
      const { pubKeyHash: paymentKeyHash } = deserializeAddress(walletAddress);

      // ── COLLATERAL DIAGNOSTICS ───────────────────────────────────────────────
      console.log('💰 Wallet UTxOs (' + walletUtxos.length + ' total):');
      walletUtxos.forEach((u, i) => {
        const units = u.output.amount.map(a => a.unit === 'lovelace' ? (parseInt(a.quantity)/1_000_000).toFixed(2) + ' ADA' : a.unit.slice(0,16) + '…');
        const isPureAda = u.output.amount.length === 1 && u.output.amount[0].unit === 'lovelace';
        const lovelace = u.output.amount.find(a => a.unit === 'lovelace')?.quantity ?? '0';
        console.log(`  [${i}] ${u.input.txHash.slice(0,12)}…#${u.input.outputIndex} pureADA=${isPureAda} lovelace=${lovelace} assets=[${units.join(', ')}]`);
      });
      const pureAdaUtxos = walletUtxos.filter(u => u.output.amount.length === 1 && u.output.amount[0].unit === 'lovelace');
      console.log('  Pure-ADA UTxOs (collateral candidates):', pureAdaUtxos.length);
      // ────────────────────────────────────────────────────────────────────────

      const mintingOref = createOutputReference(
        event.mintingOrefTxHash!,
        event.mintingOrefIndex!
      );
      const semaphoreValidatorCbor = await applyOrefParamToScript(VALIDATORS.semaphore.mint, mintingOref);
      const votingValidatorCbor = await applyOrefParamToScript(VALIDATORS.voting.mint, mintingOref);

      const provider = new BlockfrostProvider(
        process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY!
      );

      const collateralUtxo = walletUtxos.find(u =>
        u.output.amount.length === 1 &&
        u.output.amount[0].unit === 'lovelace' &&
        parseInt(u.output.amount[0].quantity) >= 5000000
      );
      if (!collateralUtxo) throw new Error('No suitable collateral UTxO found. Please ensure you have a UTxO with at least 5 ADA containing only ADA (no other tokens).');

      const unsignedTx = await buildVoteTransaction({
        provider,
        semaphoreScriptAddress: event.semaphoreAddress,
        votingScriptAddress: event.votingValidatorAddress!,
        semaphoreNftPolicyId: event.semaphoreNft!,
        votingNftPolicyId: event.votingNft!,
        groupNftPolicyId: event.groupNft!,
        groupMerkleRoot: BigInt(event.groupMerkleRootHash),
        semaphoreValidatorCbor,
        votingValidatorCbor,
        walletUtxos,
        walletAddress,
        paymentKeyHash,
        zkProof,
        nullifierHash,
        signalHash,
        signalMessage,
        mpfProofSteps,
        mpfNewRoot,
        voteSignal,
        collateralUtxo,
        // weight in UrnaDatum is 0 for simple voting (votingPower===1), votingPower for weighted.
        weight: event.votingPower > 1 ? event.votingPower : 0,
        eventStart: event.startingDate! * 1000,
        eventEnd: event.endingDate! * 1000,
      });

      // Helper: roll back nullifier if anything after insertion fails, so the voter can retry.
      const rollbackNullifier = async () => {
        try {
          await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/nullifier`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nullifier: nullifierHash.toString() }),
          });
          console.log('↩️ Nullifier rolled back — voter can retry.');
        } catch {
          console.warn('⚠️ Nullifier rollback failed — voter may need organizer help to retry.');
        }
      };

      // Step 7: Sign transaction
      setVoteStep('Waiting for wallet signature...');
      let signedTx: string;
      try {
        signedTx = await wallet.signTx(unsignedTx, true);
      } catch (signErr: any) {
        await rollbackNullifier();
        const msg = signErr?.message ?? String(signErr);
        if (msg.toLowerCase().includes('user declined') || msg.toLowerCase().includes('declined sign')) {
          throw new Error('Wallet signature declined. Your vote was not submitted.');
        }
        throw new Error('Signing failed: ' + msg);
      }

      // Step 8: Submit to blockchain via backend
      setVoteStep('Submitting to blockchain...');
      const submitResponse = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTx }),
      });
      if (!submitResponse.ok) {
        await rollbackNullifier();
        const errData = await submitResponse.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to submit transaction');
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
      setError(errorMessage);
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
    } catch (err) {
      console.error('Failed to load results:', err);
      setResults(null);
    } finally {
      setLoadingResults(false);
    }
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

              </div>

              {/* Event Access Link */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mt-6">
                <p className="text-xs text-gray-600 mb-2">
                  Use this link + your identity file to access this event later. Keep it secure!
                </p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs font-mono text-gray-700 break-all">
                    {typeof window !== 'undefined' ? window.location.href : ''}
                  </p>
                  <button
                    onClick={copyEventLinkToClipboard}
                    className="px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-xs font-medium whitespace-nowrap"
                  >
                    {eventLinkCopied ? 'Copied!' : 'Copy'}
                  </button>
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
                  onClick={() => { setActiveTab('results'); loadResults(); }}
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
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900">Registration Complete</h2>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      You have successfully registered for this event.
                    </p>
                    {commitment && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200 mt-4">
                        <p className="text-xs text-gray-600 mb-2">
                          Your Commitment ID:
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="flex-1 text-xs font-mono text-gray-700 break-all">
                            {commitment}
                          </p>
                          <button
                            onClick={copyCommitmentToClipboard}
                            className="px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-xs font-medium whitespace-nowrap"
                          >
                            {commitmentCopied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Token Validation Status */}
                    {validatingToken && (
                      <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-6">
                        <div className="flex items-center gap-3">
                          <svg className="animate-spin h-6 w-6 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

                        {/* Step 1: Generate Identity */}
                        {!hasIdentity ? (
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
                                Generating Identity...
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Generate Identity
                              </>
                            )}
                          </button>
                        ) : !isRegistered ? (
                          <>
                            {/* Identity Generated - Show Download Confirmation and Warnings */}
                            <div className="space-y-4">
                              {/* Combined: Download Success + Warnings */}
                              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                                {/* Download Confirmation */}
                                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-yellow-200">
                                  <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                  <span className="text-yellow-900 font-semibold">Identity File Downloaded</span>
                                </div>

                                {/* Warning Messages */}
                                <div className="flex items-start gap-2">
                                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  <div className="flex-1">
                                    <p className="text-sm font-semibold text-yellow-900 mb-1">Keep this file safe!</p>
                                    <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
                                      <li>You'll need it to vote later</li>
                                      <li>Never share your identity file with anyone</li>
                                      <li>If you lose this file, you cannot vote</li>
                                    </ul>
                                  </div>
                                </div>
                              </div>

                              {/* Commitment Display */}
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <div className="bg-white rounded-lg p-3 border border-gray-200">
                                  <p className="text-xs text-gray-600 mb-2">
                                    Your Commitment ID:
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <p className="flex-1 text-xs font-mono text-gray-700 break-all">
                                      {commitment}
                                    </p>
                                    <button
                                      onClick={copyCommitmentToClipboard}
                                      className="px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-xs font-medium whitespace-nowrap"
                                    >
                                      {commitmentCopied ? 'Copied!' : 'Copy'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Step 2: Register Commitment Button */}
                              <button
                                onClick={handleRegisterCommitment}
                                disabled={registering}
                                className="w-full px-6 py-4 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {registering ? (
                                  <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Registering...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Register Commitment
                                  </>
                                )}
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>

                  </>
                )}
              </div>
            )}

            {/* Vote Tab */}
            {activeTab === 'vote' && (
              <div>
                {/* Blockchain not ready */}
                {!event.semaphoreAddress && (
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">Voting Not Yet Available</h3>
                        <p className="text-sm text-gray-700">The event organizer has not completed the blockchain setup.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Wallet connected */}
                {event.semaphoreAddress && connected && (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-green-900 capitalize">{walletName} connected</p>
                        {connectedAddress && (
                          <p className="text-xs text-green-700 font-mono truncate">{connectedAddress}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Wallet not connected */}
                {event.semaphoreAddress && !connected && (
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-yellow-900 mb-1">Wallet Required</h3>
                        <p className="text-sm text-yellow-800 mb-3">Please connect your Cardano wallet to cast your vote.</p>
                        <button
                          onClick={() => setShowWalletModal(true)}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all font-semibold text-sm"
                        >
                          Connect Wallet
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Info Box */}
                {!isRegistered ? (
                  // Not Registered - Show Registration Required
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
                ) : !hasIdentity ? (
                  // Registered but no Identity - Show Upload
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">Identity File Required</h3>
                        <p className="text-sm text-gray-700 mb-3">
                          You're registered, but we need your identity file to cast your vote.
                        </p>

                        {uploadError && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                            <p className="text-xs text-yellow-900">{uploadError}</p>
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
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-semibold text-sm cursor-pointer disabled:opacity-50"
                          >
                            {uploadingIdentity ? (
                              <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Uploading...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                Upload Identity File
                              </>
                            )}
                          </label>
                        </label>
                        <p className="text-xs text-gray-600 mt-2">
                          Upload the JSON file you downloaded during registration.
                        </p>
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
                          <>
                            <p className="text-sm text-gray-700 mb-2">The voting period will begin on {formatDate(event.startingDate)}.</p>
                            <p className="text-xs text-gray-600">This page will automatically update when voting starts.</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-700">The voting start date has not been set yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : hasVoted ? (
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900">Vote Submitted</h2>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Your vote has been recorded anonymously on-chain.
                    </p>
                    {votedOptionIndex !== null && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200 mt-4">
                        <p className="text-xs text-gray-600 mb-2">Your choice:</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {options.find(opt => opt.index === votedOptionIndex)?.text || `Option ${votedOptionIndex}`}
                        </p>
                      </div>
                    )}
                    {voteTxHash && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200 mt-3">
                        <p className="text-xs text-gray-600 mb-1">Transaction:</p>
                        <a
                          href={`https://preprod.cardanoscan.io/transaction/${voteTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-blue-600 hover:underline break-all"
                        >
                          View on Explorer
                        </a>
                      </div>
                    )}
                    <button
                      onClick={() => setActiveTab('results')}
                      className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-semibold text-sm"
                    >
                      View Results
                    </button>
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

                {/* Voting Options Section - Only show if not voted */}
                {!hasVoted && (
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
                      disabled={!isRegistered || !event.startingDate || Date.now() < event.startingDate * 1000 || (event.endingDate && Date.now() > event.endingDate * 1000) || hasVoted || submitting || !connected || !event.semaphoreAddress || (isSimpleVote ? selectedOption === null : getTotalDistributedPoints() !== event.votingPower)}
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
                    {voteStep && (
                      <p className="mt-3 text-sm text-gray-600 text-center">{voteStep}</p>
                    )}

                    {!isSimpleVote && getTotalDistributedPoints() !== event.votingPower && (
                      <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-yellow-800 font-medium">
                          Please distribute all {event.votingPower} points before submitting
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && (
              <div>
                {/* Voting Status */}
                <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                      {event.endingDate && Date.now() > event.endingDate * 1000 ? (
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {event.endingDate && Date.now() > event.endingDate * 1000 ? 'Voting Ended' : 'Event Status'}
                    </h2>
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

                  {/* Load results button */}
                  <button
                    onClick={loadResults}
                    disabled={loadingResults}
                    className="mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium disabled:opacity-50"
                  >
                    {loadingResults ? 'Loading...' : 'Refresh Results'}
                  </button>

                  {loadingResults ? (
                    <div className="flex items-center justify-center py-8">
                      <svg className="animate-spin h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  ) : results === null ? (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-sm text-gray-600">Results could not be loaded from the blockchain.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {results.sort((a, b) => (b.votes || 0) - (a.votes || 0)).map((option, index) => {
                        const totalVotes = results.reduce((sum, opt) => sum + (opt.votes || 0), 0);
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
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Wallet Connect Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">Choose a wallet to cast your vote</p>

            <div className="space-y-3">
              {['eternl', 'lace', 'yoroi'].map((walletName) => (
                <button
                  key={walletName}
                  onClick={async () => {
                    try {
                      setShowWalletModal(false);
                      await connect(walletName);
                    } catch (err) {
                      console.error('Failed to connect wallet:', err);
                      alert(`Failed to connect ${walletName}. Make sure the extension is installed.`);
                    }
                  }}
                  className="w-full p-4 border-2 border-gray-300 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-700 font-semibold text-sm uppercase">{walletName[0]}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 capitalize">{walletName}</div>
                      <div className="text-sm text-gray-600">Connect with {walletName.charAt(0).toUpperCase() + walletName.slice(1)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowWalletModal(false)}
              className="w-full mt-4 py-3 text-gray-600 hover:text-gray-900 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
