'use client';

/**
 * ADMIN DASHBOARD PAGE (MANAGE EVENT)
 *
 * This page allows event administrators to manage their voting event.
 *
 * Flow:
 * 1. Validate admin token from URL parameter
 * 2. Load event data from backend
 * 3. Admin can view parameters, invite participants, start voting event, and view results
 * 4. All changes are persisted to backend
 *
 * Backend API Calls:
 * - POST   /voting-event/:eventId/validate-admin-token    (validate access)
 * - GET    /voting-event/:eventId                          (load event data)
 * - PATCH  /voting-event/:eventId                          (update event dates)
 * - GET    /voting-event/:eventId/invited                  (get invited participants)
 * - GET    /voting-event/:eventId/participants             (get registered participants)
 * - POST   /voting-event/:eventId/invite                   (add participant to the list)
 * - DELETE /voting-event/:eventId/participants/:userId     (remove participant from event)
 * - POST   /voting-event/:eventId/send-invitations         (send invitations to all participants)
 * - POST   /voting-event/:eventId/mark-invitations-sent    (persist invitation state)
 * - POST   /voting-event/:eventId/save-blockchain-data     (persist blockchain data)
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useWallet } from '@meshsdk/react';
import { deserializeAddress } from '@meshsdk/core';
import {
  getWalletUtxos,
  selectUtxoAndCreateOutputReference,
  selectUtxoForCollateral,
} from '@/lib/blockchain-helpers';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';

// ============================================================================
// TYPES / INTERFACES
// ============================================================================

interface CreatedEvent {
  eventId: number;
  adminLink?: string;
  eventName: string;
  votingPower?: number | null;
  options?: string | null;
  startingDate?: number | null;
  endingDate?: number | null;
  walletAddress?: string;
  adminUserId?: number | null;
  groupNft?: string | null;
  groupMerkleRootHash?: string | null;
}

interface Participant {
  userId: number;
  commitment?: string; // Only exists for registered users
  email?: string;
  status?: 'pending' | 'registered';
  invitedAt?: Date;
  registeredAt?: Date;
}

type Tab = 'parameters' | 'participants' | 'start' | 'results';

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Loading spinner component for button states
 */
const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EventDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const adminToken = searchParams.get('token');
  const { connect, connected, wallet, disconnect } = useWallet();

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  // Authentication & Authorization State
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [tokenValidating, setTokenValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Wallet State
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Event Data State
  const [createdEvent, setCreatedEvent] = useState<CreatedEvent | null>(null);
  const [votingPower, setVotingPower] = useState<number>(1); // 1 = simple, >1 = weighted
  const [options, setOptions] = useState(['', '']);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Participants State
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newParticipantEmail, setNewParticipantEmail] = useState('');

  // Invitations State
  const [invitationsSent, setInvitationsSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [invitationResult, setInvitationResult] = useState<{
    success: number;
    failed: number;
    results: Array<{ email: string; status: 'sent' | 'failed'; error?: string }>;
  } | null>(null);

  // Blockchain & Voting State
  const [isStarting, setIsStarting] = useState(false);
  const [publishedData, setPublishedData] = useState<{
    signature: string;
    publicKey: string;
    eventId: string;
    eventName: string;
    startingDate: number;
    endingDate: number;
    walletAddress: string;
    timestamp: number;
  } | null>(null);

  // Group NFT Update State
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const [groupUpdateStatus, setGroupUpdateStatus] = useState<string | null>(null);
  const [groupUpdateTxHash, setGroupUpdateTxHash] = useState<string | null>(null);

  // NEW: Blockchain Minting State
  const [mintingStep, setMintingStep] = useState<'idle' | 'group' | 'voting' | 'complete'>('idle');
  const [txStatus, setTxStatus] = useState<string>('');
  const [blockchainResult, setBlockchainResult] = useState<{
    groupTxHash?: string;
    groupPolicyId?: string;
    semaphoreVotingTxHash?: string;
    semaphorePolicyId?: string;
    votingPolicyId?: string;
    votingValidatorAddress?: string;
  } | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<Tab>('parameters');
  const [copiedAdmin, setCopiedAdmin] = useState(false);

  // --------------------------------------------------------------------------
  // EFFECTS / LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Validate admin token on component mount
   * Backend: POST /voting-event/:eventId/validate-admin-token
   */
  useEffect(() => {
    const validateToken = async () => {
      // Check if token exists in URL
      if (!adminToken) {
        setTokenError('No admin token provided. Access denied.');
        setIsAuthorized(false);
        setTokenValidating(false);
        return;
      }

      try {
        // Validate token with backend
        const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/validate-admin-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: adminToken })
        });

        if (!response.ok) {
          throw new Error('Token validation failed');
        }

        const result = await response.json();

        if (result.valid) {
          setIsAuthorized(true);
          setTokenError(null);
        } else {
          setTokenError(result.error || 'Invalid admin token');
          setIsAuthorized(false);
        }
      } catch (error) {
        console.error('Error validating token:', error);
        setTokenError('Failed to validate admin token');
        setIsAuthorized(false);
      } finally {
        setTokenValidating(false);
      }
    };

    validateToken();
  }, [eventId, adminToken]);

  /**
   * Get wallet address when wallet becomes available
   */
  useEffect(() => {
    const getWalletAddress = async () => {
      if (!connected || !wallet) return;
      try {
        const address = await wallet.getChangeAddress();
        setWalletAddress(address);
      } catch (error) {
        console.error('Failed to get wallet address:', error);
      } finally {
        setIsConnecting(false);
      }
    };

    getWalletAddress();
  }, [connected, wallet]);

  /**
   * Load event data on mount after token validation
   * Backend: GET /voting-event/:eventId
   * Falls back to sessionStorage if backend fails
   */
  useEffect(() => {
    // Don't load event until token validation is complete
    if (tokenValidating) return;

    // Only load event if authorized
    if (!isAuthorized) return;

    const loadEvent = async () => {
      try {
        // 1. Try loading from backend first (has current vote counts!)
        await loadEventFromBackend();

      } catch (error) {
        console.error('Backend load failed, trying sessionStorage fallback...');

        // 2. Fallback to sessionStorage if backend fails
        const storedEvent = sessionStorage.getItem('createdEvent');
        if (storedEvent) {
          const eventData = JSON.parse(storedEvent);

          // Only use if it's the correct event
          if (eventData.eventId === parseInt(eventId as string)) {

            setCreatedEvent({
              eventId: eventData.eventId,
              eventName: eventData.eventName,
              votingPower: eventData.votingPower,
              options: eventData.options,
              startingDate: eventData.startingDate,
              endingDate: eventData.endingDate,
              walletAddress: eventData.walletAddress,
              adminUserId: eventData.adminUserId,
              adminLink: `${window.location.origin}/event/${eventId}/manage?token=${eventData.adminToken}`,
            });

            // Parse options for display
            const parsedOptions = JSON.parse(eventData.options);
            setOptions(parsedOptions);
            setVotingPower(eventData.votingPower);
            return;
          }
        }
      }
    };

    loadEvent();
  }, [eventId, tokenValidating, isAuthorized]);

  /**
   * Pre-fill start/end date inputs from loaded event
   * Converts POSIX timestamps to datetime-local format
   */
  useEffect(() => {
    if (createdEvent) {
      // Convert POSIX timestamps to datetime-local format
      if (createdEvent.startingDate) {
        const startDateTime = new Date(createdEvent.startingDate * 1000);
        setStartDate(startDateTime.toISOString().slice(0, 16));
      }
      if (createdEvent.endingDate) {
        const endDateTime = new Date(createdEvent.endingDate * 1000);
        setEndDate(endDateTime.toISOString().slice(0, 16));
      }
    }
  }, [createdEvent]);

  /**
   * Auto-refresh event data when voting ends
   * Sets up a timer to reload data from backend when voting period ends
   */
  useEffect(() => {
    if (!createdEvent?.endingDate) return;

    const endTime = createdEvent.endingDate * 1000;
    const now = Date.now();
    const timeUntilEnd = endTime - now;

    // If voting hasn't ended yet, set a timer to refresh when it does
    if (timeUntilEnd > 0 && timeUntilEnd < 24 * 60 * 60 * 1000) { // Only if within 24h
      const timer = setTimeout(() => {
        loadEventFromBackend().catch(err => console.error('Failed to reload event:', err));
      }, timeUntilEnd);

      return () => clearTimeout(timer);
    }
  }, [createdEvent?.endingDate]);

  /**
   * Load participants when switching to participants tab
   * Backend: GET /voting-event/:eventId/invited and /voting-event/:eventId/participants
   */
  useEffect(() => {
    if (activeTab === 'participants' && createdEvent) {
      loadParticipants();
    }
  }, [activeTab, createdEvent?.eventId]);

  // --------------------------------------------------------------------------
  // BACKEND API CALLS
  // --------------------------------------------------------------------------

  /**
   * Load event data from backend
   * Backend: GET /voting-event/:eventId
   * Returns: Event data with current vote counts and all configuration
   */
  const loadEventFromBackend = async () => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`);

      if (!response.ok) {
        throw new Error(`Failed to load event: ${response.status} ${response.statusText}`);
      }

      const backendEvent = await response.json();

      // Backend returns options as JSON string: '[{index: 0, text: "...", votes: N}, ...]'
      const parsedOptions = JSON.parse(backendEvent.options);
      const optionTexts = parsedOptions.map((opt: any) => opt.text);

      setCreatedEvent({
        eventId: backendEvent.eventId,
        eventName: backendEvent.eventName,
        votingPower: backendEvent.votingPower,
        options: backendEvent.options,
        startingDate: backendEvent.startingDate,
        endingDate: backendEvent.endingDate,
        adminUserId: backendEvent.adminUserId,
        adminLink: `${window.location.origin}/event/${eventId}/manage?token=${backendEvent.adminToken}`,
        groupNft: backendEvent.groupNft ?? null,
        groupMerkleRootHash: backendEvent.groupMerkleRootHash ?? null,
      });

      setOptions(optionTexts);
      setVotingPower(backendEvent.votingPower);
      setIsAuthorized(true);

      // Restore invitations sent state
      if (backendEvent.invitationsSentAt) {
        setInvitationsSent(true);
      }

      // Restore blockchain published data
      if (backendEvent.blockchainData) {
        try {
          const parsedBlockchainData = JSON.parse(backendEvent.blockchainData);
          setPublishedData(parsedBlockchainData);
        } catch (err) {
          console.error('Failed to parse blockchain data:', err);
        }
      }
    } catch (error) {
      console.error('Failed to load event from backend:', error);
      throw error;
    }
  };

  /**
   * Load participants list from backend
   * Backend: GET /voting-event/:eventId/invited (get invited participants)
   * Backend: GET /voting-event/:eventId/participants (get registered participant IDs)
   * Merges both lists to show invitation status
   */
  const loadParticipants = async () => {
    try {
      // 1. Load INVITED participants
      const invitedResponse = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/invited`
      );

      if (!invitedResponse.ok) {
        console.error('Failed to load invited participants');
        return;
      }

      const invited = await invitedResponse.json() as Array<{
        email: string;
        userId: number;
        invitedAt: number;
      }>;

      // 2. Load REGISTERED participants (nur IDs)
      const registeredResponse = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/participants`
      );

      if (!registeredResponse.ok) {
        console.error('Failed to load registered participants');
        return;
      }

      const registeredIds = await registeredResponse.json() as number[];

      // 3. Merge: Mark who is registered
      const allParticipants = invited.map(inv => {
        const isRegistered = registeredIds.includes(inv.userId);
        return {
          userId: inv.userId,
          email: inv.email,
          status: isRegistered ? ('registered' as const) : ('pending' as const),
          invitedAt: new Date(inv.invitedAt),
          registeredAt: isRegistered ? new Date() : undefined,
        };
      });

      setParticipants(allParticipants);

    } catch (error) {
      console.error('Failed to load participants:', error);
    }
  };

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  /**
   * Connect to a specific Cardano wallet by name
   */
  const connectWalletByName = async (walletName: string) => {
    try {
      setIsConnecting(true);
      setShowWalletModal(false);

      await connect(walletName);

      // Connection successful - isConnecting will be reset in the wallet address useEffect
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to connect wallet: ${errorMessage}\n\nPlease make sure the ${walletName} wallet extension is installed and enabled.`);
      setIsConnecting(false);
      setShowWalletModal(true); // Reopen modal on error
    }
  };

  /**
   * Copy text to clipboard and show temporary success indicator
   */
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAdmin(true);
      setTimeout(() => setCopiedAdmin(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  /**
   * Add a new participant by email
   * Backend: POST /voting-event/:eventId/invite
   * Validates email, checks for duplicates, then invites participant
   */
  const addParticipant = async () => {
    if (!newParticipantEmail.trim() || !newParticipantEmail.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    // Check if email already exists
    if (participants.some(p => p.email === newParticipantEmail.trim())) {
      alert('This email has already been invited');
      return;
    }

    try {
      const response = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newParticipantEmail.trim() })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to invite participant');
      }

      // Reload participants list and clear input
      await loadParticipants();
      setNewParticipantEmail('');

    } catch (error) {
      console.error('Failed to invite participant:', error);
      alert('Failed to invite participant. Please try again.');
    }
  };

  /**
   * Remove a participant from the event
   * Backend: DELETE /voting-event/:eventId/participants/:userId
   * Backend removes from groupLeafCommitments and rebuilds merkle root
   */
  const removeParticipant = async (userId: number, email?: string) => {
    try {
      const response = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/participants/${userId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove participant');
      }

      // Update local state after successful backend removal
      setParticipants(participants.filter(p => p.userId !== userId));

    } catch (error) {
      console.error('Failed to remove participant:', error);
      alert('Failed to remove participant. Please try again.');
    }
  };

  /**
   * Send email invitations to all participants
   * Backend: POST /voting-event/:eventId/send-invitations
   * Backend: POST /voting-event/:eventId/mark-invitations-sent
   * Sends unique voting links via email to all invited participants
   */
  const sendInvitations = async () => {
    if (participants.length === 0) {
      alert('Please add at least one participant before sending invitations');
      return;
    }

    // Collect all participant emails
    const emails = participants.map(p => p.email).filter((email): email is string => !!email);

    if (emails.length === 0) {
      alert('No valid email addresses found');
      return;
    }

    setIsSending(true);

    try {
      const response = await fetch(
        `${BACKEND_API_URL}/voting-event/${eventId}/send-invitations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send invitations');
      }

      const result = await response.json();

      setInvitationResult(result);
      setInvitationsSent(true);

      // Mark invitations as sent in backend
      try {
        await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/mark-invitations-sent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('Failed to mark invitations as sent in backend:', err);
        // Don't block UI on this failure
      }

    } catch (error) {
      console.error('Failed to send invitations:', error);
      alert('Failed to send invitations. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Start the voting event
   * Validates dates, signs event data with wallet, and publishes to blockchain
   * Backend: PATCH /voting-event/:eventId (update start/end dates)
   * Backend: POST /voting-event/:eventId/save-blockchain-data (persist signature)
   *
   * ============================================================================
   * ⚠️ TODO FOR BLOCKCHAIN PUBLISHING (currently Mock Implementation)
   * ============================================================================
   * 
   * CURRENT (OFF-CHAIN ONLY):
   * - Only updates dates in database
   * - Only stores wallet signature
   * - Event is NOT on blockchain
   *
   * Zbielzustand (3-Step Prozess):                                                                                                                                                                                    
   * 1. mint-group.ts: Mint Group NFT mit Merkle Root der participants                                                                                                                                                
   * 2. mint-sv.ts: Mint Semaphore NFT + Voting NFT in EINER transaction                                                                                                                                              
   * 3. Backend speichert NFT policy IDs und addresses               
   * 
   * = 2 TX STEPS TO PUBLISH VOTING EVENT ON BLOCKCHAIN:
   * - The logic of the first transaction is on mint-group.ts and the logic of the second transaction (semaphore and voting nfts) are on mint-sv.ts (most of the work would be replicating the code right there). 
   * - All the relevant files needed for the imports on the front are exposed in the index.ts file
   * - The biggest change is that we won't be using MeshJS wallet rather BrowserWallet instead
   *
   * 
   * Details: 
   * Mint-group.ts file: (1. NFT = Merkle tree of the users)
   * - generate wallet - sollte schon da sein 
   * - get available UTXOs - with browser wallet we dont need backend for this, we can get UTXOs directly from the wallet
   * = Ergbenis: Reference Input (UTXO) for this tx
   * = and then: the mint-sv.ts
   * 
   * Mint-sv.ts file: (2. Sempahore NFT and 3. voting NFT)
   * = Publish voting event data on blockchain by minting NFTs and calling smart contracts
   * 
   * 
   * ============================================================================
   */
  const handleUpdateGroupNft = async () => {
    if (!connected || !wallet) {
      alert('Please connect your wallet to update the Group NFT.');
      return;
    }

    setIsUpdatingGroup(true);
    setGroupUpdateStatus('Fetching current Merkle root...');
    setGroupUpdateTxHash(null);

    try {
      const eventResponse = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to load event data');
      const eventData = await eventResponse.json();
      const newMerkleRoot: string = eventData.groupMerkleRootHash;

      setGroupUpdateStatus('Preparing wallet...');
      const walletUtxos = await getWalletUtxos(wallet);
      const { pubKeyHash: paymentKeyHash } = deserializeAddress(walletAddress);
      const collateralUtxo = selectUtxoForCollateral(walletUtxos, 5000000);
      if (!collateralUtxo) throw new Error('No suitable collateral UTxO found (needs a pure-ADA UTxO ≥ 5 ADA).');

      setGroupUpdateStatus('Building update transaction...');
      const buildResponse = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/build-update-group-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newMerkleRoot, walletUtxos, walletAddress, paymentKeyHash, collateralUtxo }),
      });
      if (!buildResponse.ok) {
        const err = await buildResponse.json().catch(() => ({}));
        throw new Error((err as any).message || 'Failed to build update transaction');
      }
      const { unsignedTx } = await buildResponse.json();

      setGroupUpdateStatus('Waiting for wallet signature...');
      const signedTx = await wallet.signTx(unsignedTx, false);

      setGroupUpdateStatus('Submitting to blockchain...');
      const txHash = await wallet.submitTx(signedTx);

      setGroupUpdateStatus(`Waiting for confirmation… TX: ${txHash.slice(0, 16)}…`);
      let confirmed = false;
      for (let i = 0; i < 60; i++) {
        const res = await fetch(`${BACKEND_API_URL}/voting-event/tx-confirmed/${txHash}`);
        if (res.ok) {
          const { confirmed: c } = await res.json();
          if (c) { confirmed = true; break; }
        }
        await new Promise(r => setTimeout(r, 3000));
      }
      if (!confirmed) throw new Error('Transaction not confirmed after 3 minutes. Check the explorer.');

      await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/confirm-group-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newMerkleRoot, txHash }),
      });

      setGroupUpdateTxHash(txHash);
      setGroupUpdateStatus('Group NFT updated successfully.');
      await loadEventFromBackend();
    } catch (err: any) {
      setGroupUpdateStatus(`Error: ${err.message}`);
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleStartVoting = async () => {
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    const start = new Date(startDate + ':00.000Z');
    const end = new Date(endDate + ':00.000Z');
    const now = new Date();

    if (start < now) { alert('Start date cannot be in the past'); return; }
    if (end <= start) { alert('End date must be after start date'); return; }
    if (end < now) { alert('End date cannot be in the past'); return; }

    if (!connected || !wallet) {
      alert('Please connect your wallet to start the voting event');
      return;
    }
    if (!walletAddress) {
      alert('Wallet address not available. Please reconnect your wallet.');
      return;
    }

    setIsStarting(true);
    setMintingStep('idle');
    setTxStatus('Preparing blockchain transaction...');

    try {
      const startingDate = Math.floor(start.getTime() / 1000);
      const endingDate = Math.floor(end.getTime() / 1000);

      // Load event data (merkle root + options)
      setTxStatus('Loading event data from backend...');
      const eventResponse = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to load event data');
      const eventData = await eventResponse.json();
      const merkleRoot: string = eventData.groupMerkleRootHash || '0';
      const optionsArray: Array<{ text: string }> = eventData.options ? JSON.parse(eventData.options) : options;
      const optionTexts = optionsArray.map(o => o.text);

      const { pubKeyHash: paymentKeyHash } = deserializeAddress(walletAddress);

      // ─── PHASE 1: Group NFT ────────────────────────────────────────────────
      setMintingStep('group');
      setTxStatus('Step 1/2: Building Group NFT transaction...');

      const walletUtxos = await getWalletUtxos(wallet);
      const collateralUtxo1 = selectUtxoForCollateral(walletUtxos, 5000000);
      if (!collateralUtxo1) throw new Error('No suitable collateral UTxO found (needs a pure-ADA UTxO ≥ 5 ADA).');
      const { selectedUtxo: groupUtxo } = selectUtxoAndCreateOutputReference(walletUtxos, 0);

      const buildGroupRes = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/build-group-mint-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletUtxos, walletAddress, paymentKeyHash, collateralUtxo: collateralUtxo1, selectedUtxo: groupUtxo, merkleRoot }),
      });
      if (!buildGroupRes.ok) {
        const err = await buildGroupRes.json().catch(() => ({}));
        throw new Error((err as any).message || 'Failed to build Group NFT transaction');
      }
      const { unsignedTx: groupUnsignedTx, policyId: groupPolicyId, scriptAddress: groupScriptAddress, validatorCbor: groupValidatorCbor } = await buildGroupRes.json();

      setTxStatus('Step 1/2: Waiting for wallet signature (Group NFT)...');
      const groupSignedTx = await wallet.signTx(groupUnsignedTx, true);

      setTxStatus('Step 1/2: Submitting Group NFT — waiting for on-chain visibility (up to 90s)...');
      const submitGroupRes = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/submit-group-mint-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTx: groupSignedTx, policyId: groupPolicyId, scriptAddress: groupScriptAddress }),
      });
      if (!submitGroupRes.ok) {
        const err = await submitGroupRes.json().catch(() => ({}));
        throw new Error((err as any).message || 'Failed to submit Group NFT transaction');
      }
      const { txHash: groupTxHash } = await submitGroupRes.json();
      console.log('✅ Group NFT minted and visible on-chain:', groupTxHash);

      // ─── PHASE 2: Semaphore + Voting NFTs ─────────────────────────────────
      setMintingStep('voting');
      setTxStatus('Step 2/2: Building Semaphore + Voting NFT transaction...');

      const walletUtxos2 = await getWalletUtxos(wallet);
      const collateralUtxo2 = selectUtxoForCollateral(walletUtxos2, 5000000);
      if (!collateralUtxo2) throw new Error('No suitable collateral UTxO found for Phase 2 (needs a pure-ADA UTxO ≥ 5 ADA).');
      const { selectedUtxo: svUtxo } = selectUtxoAndCreateOutputReference(walletUtxos2, 0);

      const buildSvRes = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/build-sv-mint-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletUtxos: walletUtxos2,
          walletAddress,
          paymentKeyHash,
          collateralUtxo: collateralUtxo2,
          selectedUtxo: svUtxo,
          groupNftTxHash: groupTxHash,
          groupNftOutputIndex: 0,
          groupPolicyId,
          startingDate,
          endingDate,
          votingPower,
          optionTexts,
          merkleRoot,
        }),
      });
      if (!buildSvRes.ok) {
        const err = await buildSvRes.json().catch(() => ({}));
        throw new Error((err as any).message || 'Failed to build Semaphore+Voting transaction');
      }
      const svBuildData = await buildSvRes.json();

      setTxStatus('Step 2/2: Waiting for wallet signature (Semaphore + Voting NFTs)...');
      const svSignedTx = await wallet.signTx(svBuildData.unsignedTx, true);

      setTxStatus('Step 2/2: Submitting Semaphore + Voting NFTs — saving to blockchain...');
      const submitSvRes = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/submit-sv-mint-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTx: svSignedTx,
          semaphorePolicyId: svBuildData.semaphorePolicyId,
          semaphoreScriptAddr: svBuildData.semaphoreScriptAddr,
          votingPolicyId: svBuildData.votingPolicyId,
          votingScriptAddr: svBuildData.votingScriptAddr,
          groupNft: groupPolicyId,
          groupValidatorAddress: groupScriptAddress,
          groupValidatorCbor,
          mintingOrefTxHash: svBuildData.mintingOrefTxHash,
          mintingOrefIndex: svBuildData.mintingOrefIndex,
        }),
      });
      if (!submitSvRes.ok) {
        const err = await submitSvRes.json().catch(() => ({}));
        throw new Error((err as any).message || 'Failed to submit Semaphore+Voting transaction');
      }
      const { txHash: svTxHash } = await submitSvRes.json();
      console.log('✅ Semaphore + Voting NFTs minted:', svTxHash);

      // ─── BACKEND: update event dates ──────────────────────────────────────
      setMintingStep('complete');
      setTxStatus('Blockchain transactions complete! Updating backend...');

      const dateResponse = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingDate, endingDate }),
      });
      if (!dateResponse.ok) throw new Error(`Failed to update event dates: ${dateResponse.status}`);
      const updatedEvent = await dateResponse.json();
      if (createdEvent) {
        setCreatedEvent({ ...createdEvent, startingDate: updatedEvent.startingDate, endingDate: updatedEvent.endingDate });
      }

      setBlockchainResult({
        groupTxHash,
        groupPolicyId,
        semaphoreVotingTxHash: svTxHash,
        semaphorePolicyId: svBuildData.semaphorePolicyId,
        votingPolicyId: svBuildData.votingPolicyId,
        votingValidatorAddress: svBuildData.votingScriptAddr,
      });

      setTxStatus('Voting event published to blockchain! 🎉');
      alert(
        `🎉 Voting event published to blockchain!\n\n` +
        `Group NFT: ${groupTxHash.slice(0, 16)}...\n` +
        `Voting NFTs: ${svTxHash.slice(0, 16)}...\n\n` +
        `View transactions on Cardanoscan`
      );

    } catch (error) {
      console.error('❌ Error starting voting:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start voting event';
      setTxStatus(`Error: ${errorMessage}`);
      setMintingStep('idle');
      alert(`Failed to start voting event:\n\n${errorMessage}\n\nPlease check the console for details.`);
    } finally {
      setIsStarting(false);
    }
  };

  // --------------------------------------------------------------------------
  // UI / RENDER
  // --------------------------------------------------------------------------

  // Show loading while validating token
  if (tokenValidating) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="text-gray-600 mt-4">Validating access...</p>
        </div>
      </div>
    );
  }

  // Unauthorized screen
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 border border-gray-100 max-w-md">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              {tokenError || 'You need a valid admin token to access this event dashboard.'}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Please use the admin link provided when you created the event.
            </p>
            <a
              href="/"
              className="inline-block bg-gray-900 text-white py-3 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!createdEvent) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading event...</p>
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

          {/* Dashboard Header with Admin Access & Steps */}
          <div className="mb-12">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
              {/* Admin Info */}
              <div className="mb-6">
                {/* Header with Icon */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-gray-900">Admin Dashboard</h3>
                    <p className="text-sm text-gray-600 truncate">{createdEvent.eventName}</p>
                  </div>
                </div>

                {/* Admin Link */}
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-xs text-gray-600 mb-2">
                    Use this link to access your event dashboard. Keep it secure.
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs font-mono text-gray-700 truncate">
                      {createdEvent.adminLink}
                    </p>
                    <button
                      onClick={() => createdEvent.adminLink && copyToClipboard(createdEvent.adminLink)}
                      className="px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-xs font-medium"
                    >
                      {copiedAdmin ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200 my-6" />

              {/* Setup Steps - Ohne Gradient, direkt auf weiß */}
              <div className="flex items-center justify-center gap-6 max-w-2xl mx-auto py-2">
                {/* Step 1 - Parameters */}
                <button
                  onClick={() => setActiveTab('parameters')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'parameters'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : options.filter(o => o.trim()).length >= 2 ? 'bg-gray-900' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {options.filter(o => o.trim()).length >= 2 ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold text-white">1</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'parameters' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Configure Parameter</span>
                </button>

                {/* Connector Line */}
                <div className={`w-12 h-px ${options.filter(o => o.trim()).length >= 2 ? 'bg-gray-300' : 'bg-gray-200'}`}></div>

                {/* Step 2 - Invite Participants */}
                <button
                  onClick={() => setActiveTab('participants')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'participants'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : participants.length > 0 ? 'bg-gray-900' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {participants.length > 0 ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold text-white">2</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'participants' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Invite Participants</span>
                </button>

                {/* Connector Line */}
                <div className={`w-12 h-px ${participants.length > 0 ? 'bg-gray-300' : 'bg-gray-200'}`}></div>

                {/* Step 3 - Start Voting */}
                <button
                  onClick={() => setActiveTab('start')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'start'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : (blockchainResult || publishedData) ? 'bg-gray-900' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {(blockchainResult || publishedData) ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-bold text-white">3</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'start' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Start Voting</span>
                </button>

                {/* Connector Line */}
                <div className={`w-12 h-px ${(blockchainResult || publishedData) ? 'bg-gray-300' : 'bg-gray-200'}`}></div>

                {/* Step 4 - Results */}
                <button
                  onClick={() => setActiveTab('results')}
                  className="flex flex-col items-center cursor-pointer hover:opacity-80 transition"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === 'results'
                      ? 'bg-gray-900 ring-2 ring-gray-900 ring-offset-2'
                      : 'bg-gray-300 text-gray-600'
                  }`}>
                    <span className="text-sm font-bold text-white">4</span>
                  </div>
                  <span className={`text-xs font-semibold mt-2 ${
                    activeTab === 'results' ? 'text-gray-900' : 'text-gray-600'
                  }`}>Voting Results</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-8">
            {/* Parameters Tab */}
            {activeTab === 'parameters' && (
              <div>
                {/* Voting Configuration - Read Only */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Voting Configuration</h3>
                  </div>

                  {/* Voting Type Display */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Voting Type</label>
                    <div className="px-4 py-3 bg-gray-50 rounded-xl border-2 border-gray-200">
                      <span className="text-gray-900 font-medium">
                        {votingPower === 1 ? 'Simple Voting (1 vote per person)' : `Weighted Voting (${votingPower} points to distribute)`}
                      </span>
                    </div>
                    {votingPower > 1 && (
                      <p className="mt-2 text-xs text-gray-600">
                        Voters can distribute {votingPower} points across multiple options.
                      </p>
                    )}
                  </div>

                  {/* Divider */}
                  <hr className="border-gray-200 my-6" />

                  {/* Voting Options */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Voting Options</label>
                    <div className="space-y-2">
                      {options.filter(o => o.trim() !== '').map((option, index) => (
                        <div key={index} className="px-4 py-3 bg-gray-50 rounded-xl border-2 border-gray-200">
                          <div className="flex items-center gap-3">
                            <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold">
                              {index + 1}
                            </span>
                            <span className="text-gray-900 font-medium">{option}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Participants Tab */}
            {activeTab === 'participants' && (
              <div>
                {/* Invite Participants */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Invite Participants</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Enter an email address to invite a participant. Each participant will receive a unique voting link.
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="email"
                      value={newParticipantEmail}
                      onChange={(e) => setNewParticipantEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
                      placeholder="participant@example.com"
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900 placeholder:text-gray-500 bg-white"
                    />
                    <button
                      onClick={addParticipant}
                      className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add Participant
                    </button>
                  </div>
                </div>

                {/* Participants List */}
                {participants.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-900">Participant List</h3>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 bg-gray-100 rounded-lg text-gray-700 font-medium">{participants.length} Total</span>
                        <span className="px-2 py-1 bg-gray-100 rounded-lg text-gray-700 font-medium">{participants.filter(p => p.status === 'registered').length} Registered</span>
                        <span className="px-2 py-1 bg-gray-100 rounded-lg text-gray-700 font-medium">{participants.filter(p => p.status === 'pending').length} Pending</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {participants.map((participant, index) => (
                        <div
                          key={index}
                          className={`border-2 rounded-lg p-3 ${
                            participant.status === 'registered'
                              ? 'bg-linear-to-br from-green-50 to-emerald-50 border-green-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* Status Icon */}
                            {participant.status === 'registered' && (
                              <div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-green-500">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}

                            {/* Participant Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-gray-900 truncate">
                                  {participant.email || `User #${participant.userId}`}
                                </p>
                                {participant.status === 'registered' ? (
                                  <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                                    Registered
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-yellow-600 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                                    Pending
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Remove Button */}
                            <button
                              onClick={() => removeParticipant(participant.userId, participant.email)}
                              className="px-3 py-1.5 text-yellow-600 hover:bg-yellow-100 rounded-lg transition text-xs font-medium flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <p className="text-gray-600 font-medium mb-2">No participants invited yet</p>
                    <p className="text-sm text-gray-500">Add participants above to generate unique voting links.</p>
                  </div>
                )}

                {/* Send Invitations Section */}
                {participants.length > 0 && (
                  <div className="mt-8">
                    {/* Warning Box */}
                    {!invitationsSent && (
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 mb-4">
                        <div className="flex items-start gap-3">
                          <svg className="w-6 h-6 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div className="flex-1">
                            <h4 className="font-bold text-yellow-900 mb-2">Important Notice</h4>
                            <p className="text-sm text-yellow-800">
                              Invitations can only be sent <strong>once</strong>. Make sure your participant list is complete before proceeding. You won't be able to send additional invitations after clicking the button below.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Send Button */}
                    <button
                      onClick={sendInvitations}
                      disabled={invitationsSent || isSending}
                      className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isSending ? (
                        <>
                          <LoadingSpinner />
                          Sending Invitations...
                        </>
                      ) : invitationsSent ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Invitations Sent
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Send Invitations to All Participants
                        </>
                      )}
                    </button>

                    {/* Success/Error Message */}
                    {invitationResult && (
                      <div className={`mt-4 border-2 rounded-xl p-6 ${
                        invitationResult.failed === 0
                          ? 'bg-green-50 border-green-200'
                          : 'bg-yellow-50 border-yellow-200'
                      }`}>
                        <div className="flex items-start gap-3">
                          <svg className={`w-6 h-6 shrink-0 mt-0.5 ${
                            invitationResult.failed === 0 ? 'text-green-600' : 'text-yellow-600'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                              invitationResult.failed === 0
                                ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            } />
                          </svg>
                          <div className="flex-1">
                            <h4 className={`font-bold mb-2 ${
                              invitationResult.failed === 0 ? 'text-green-900' : 'text-yellow-900'
                            }`}>
                              {invitationResult.failed === 0
                                ? 'All Invitations Sent Successfully!'
                                : 'Invitations Sent with Errors'
                              }
                            </h4>
                            <p className={`text-sm mb-3 ${
                              invitationResult.failed === 0 ? 'text-green-800' : 'text-yellow-800'
                            }`}>
                              Successfully sent: <strong>{invitationResult.success}</strong>
                              {invitationResult.failed > 0 && (
                                <> | Failed: <strong>{invitationResult.failed}</strong></>
                              )}
                            </p>

                            {invitationResult.failed > 0 && (
                              <div className="mt-3 space-y-1">
                                <p className="text-xs font-semibold text-yellow-900">Failed emails:</p>
                                {invitationResult.results
                                  .filter(r => r.status === 'failed')
                                  .map((result, idx) => (
                                    <div key={idx} className="text-xs text-yellow-800 bg-white rounded p-2">
                                      <span className="font-mono">{result.email}</span>
                                      {result.error && (
                                        <span className="ml-2 text-red-600">- {result.error}</span>
                                      )}
                                    </div>
                                  ))
                                }
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sync Group NFT — only shown after the Group NFT has been minted */}
                {createdEvent?.groupNft && (
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <h3 className="font-bold text-gray-900 mb-1">Sync Group NFT</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      If participants registered after the Group NFT was minted, submit an on-chain update to sync the Merkle root with the current participant list ({participants.filter(p => p.status === 'registered').length} registered).
                    </p>
                    <button
                      onClick={handleUpdateGroupNft}
                      disabled={isUpdatingGroup || !connected}
                      className="w-full bg-gray-900 text-white py-3 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isUpdatingGroup ? (
                        <>
                          <LoadingSpinner />
                          Updating…
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Sync Group NFT on-chain
                        </>
                      )}
                    </button>
                    {groupUpdateStatus && (
                      <p className={`mt-3 text-sm text-center ${groupUpdateStatus.startsWith('Error') ? 'text-red-600' : 'text-gray-600'}`}>
                        {groupUpdateStatus}
                      </p>
                    )}
                    {groupUpdateTxHash && (
                      <div className="mt-3 bg-white rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1">Transaction ID:</p>
                        <p className="text-xs font-mono text-gray-800 break-all mb-2">{groupUpdateTxHash}</p>
                        <a
                          href={`https://preprod.cardanoscan.io/transaction/${groupUpdateTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View on Cardanoscan ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Start Voting Tab */}
            {activeTab === 'start' && (
              <div>
                {/* Blockchain Minting Status - Show during minting */}
                {isStarting && mintingStep !== 'idle' && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                      <LoadingSpinner />
                      <h3 className="font-bold text-blue-900 text-lg">
                        {mintingStep === 'group' && 'Step 1/2: Minting Group NFT'}
                        {mintingStep === 'voting' && 'Step 2/2: Minting Voting NFTs'}
                        {mintingStep === 'complete' && 'Finalizing...'}
                      </h3>
                    </div>
                    <p className="text-sm text-blue-800 mb-4">
                      {txStatus}
                    </p>
                    <div className="flex gap-2 mt-4">
                      <div className={`h-2 flex-1 rounded ${mintingStep === 'group' || mintingStep === 'voting' || mintingStep === 'complete' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                      <div className={`h-2 flex-1 rounded ${mintingStep === 'voting' || mintingStep === 'complete' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                    </div>
                    <div className="text-xs text-blue-700 mt-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Do not close this window. Blockchain transactions may take 1-2 minutes.</span>
                    </div>
                  </div>
                )}

                {/* Blockchain Result - Show after successful minting */}
                {blockchainResult ? (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="font-bold text-green-900 text-lg">Event Published to Blockchain! 🎉</h3>
                    </div>
                    <p className="text-sm text-green-800 mb-4">
                      Your voting event has been successfully minted on the Cardano blockchain. All NFTs are now live on-chain!
                    </p>

                    <div className="bg-white rounded-lg p-4 border border-green-200 space-y-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Blockchain Transaction Details</h4>

                      {/* Group NFT */}
                      <div className="pb-4 border-b border-gray-200">
                        <h5 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                          <span className="text-lg">1️⃣</span>
                          Group NFT (Participant Merkle Tree)
                        </h5>
                        <div className="space-y-2 text-xs">
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Policy ID</label>
                            <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all">
                              {blockchainResult.groupPolicyId}
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Transaction Hash</label>
                            <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all">
                              {blockchainResult.groupTxHash}
                            </div>
                          </div>
                          <a
                            href={`https://preprod.cardanoscan.io/transaction/${blockchainResult.groupTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View on Cardanoscan
                          </a>
                        </div>
                      </div>

                      {/* Semaphore + Voting NFTs */}
                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                          <span className="text-lg">2️⃣</span>
                          Semaphore + Voting NFTs
                        </h5>
                        <div className="space-y-3 text-xs">
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Semaphore Policy ID</label>
                            <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all">
                              {blockchainResult.semaphorePolicyId}
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Voting Policy ID</label>
                            <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all">
                              {blockchainResult.votingPolicyId}
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Voting Validator Address</label>
                            <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all text-[10px]">
                              {blockchainResult.votingValidatorAddress}
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Transaction Hash</label>
                            <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all">
                              {blockchainResult.semaphoreVotingTxHash}
                            </div>
                          </div>
                          <a
                            href={`https://preprod.cardanoscan.io/transaction/${blockchainResult.semaphoreVotingTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View on Cardanoscan
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start gap-2 text-xs text-green-800">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>
                        All NFTs and voting data are now immutably recorded on the Cardano blockchain and can be verified by anyone.
                      </p>
                    </div>

                    {/* Navigation to Results */}
                    <div className="mt-6 pt-6 border-t border-green-200">
                      <button
                        onClick={() => setActiveTab('results')}
                        className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        View Results
                      </button>
                    </div>
                  </div>
                ) : publishedData ? (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="font-bold text-green-900 text-lg">Event Published to Blockchain</h3>
                    </div>
                    <p className="text-sm text-green-800 mb-4">
                      Your voting event has been successfully signed and published to the Cardano blockchain. Participants can now vote using their unique voting links.
                    </p>

                    <div className="bg-white rounded-lg p-4 border border-green-200">
                      <h4 className="font-semibold text-gray-900 mb-3">Event Summary & Blockchain Transaction Data</h4>
                      <div className="space-y-3 text-xs">
                        {/* Event Details */}
                        <div>
                          <label className="block text-gray-600 font-semibold mb-1">Event ID</label>
                          <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all">
                            {publishedData.eventId}
                          </div>
                        </div>

                        <div>
                          <label className="block text-gray-600 font-semibold mb-1">Event Name</label>
                          <div className="bg-gray-50 rounded p-2 font-mono text-gray-900">
                            {publishedData.eventName}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Starting Date</label>
                            <div className="bg-gray-50 rounded p-2 text-gray-900">
                              <div className="font-medium">{new Date(publishedData.startingDate * 1000).toUTCString().replace('GMT', 'UTC')}</div>
                              <div className="text-[10px] font-mono text-gray-600 mt-1">POSIX: {publishedData.startingDate}</div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Ending Date</label>
                            <div className="bg-gray-50 rounded p-2 text-gray-900">
                              <div className="font-medium">{new Date(publishedData.endingDate * 1000).toUTCString().replace('GMT', 'UTC')}</div>
                              <div className="text-[10px] font-mono text-gray-600 mt-1">POSIX: {publishedData.endingDate}</div>
                            </div>
                          </div>
                        </div>

                        {/* Wallet Signature */}
                        <div>
                          <label className="block text-gray-600 font-semibold mb-1">Wallet Signature</label>
                          <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all text-[10px]">
                            {publishedData.signature}
                          </div>
                        </div>

                        <div>
                          <label className="block text-gray-600 font-semibold mb-1">Public Key</label>
                          <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all text-[10px]">
                            {publishedData.publicKey}
                          </div>
                        </div>

                        <div>
                          <label className="block text-gray-600 font-semibold mb-1">Wallet Address</label>
                          <div className="bg-gray-50 rounded p-2 font-mono text-gray-900 break-all text-[10px]">
                            {publishedData.walletAddress}
                          </div>
                        </div>

                        <div>
                          <label className="block text-gray-600 font-semibold mb-1">Transaction Timestamp</label>
                          <div className="bg-gray-50 rounded p-2 font-mono text-gray-900">
                            {new Date(publishedData.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start gap-2 text-xs text-green-800">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>
                        This data is now immutably recorded on the Cardano blockchain and can be verified by anyone.
                      </p>
                    </div>

                    {/* Navigation to Results */}
                    <div className="mt-6 pt-6 border-t border-green-200">
                      <button
                        onClick={() => setActiveTab('results')}
                        className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        View Results
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                {/* Blockchain Transaction Details */}
                {startDate && endDate && (
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6 mb-6">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Preview: Blockchain Transaction Data
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      The following data will be signed with your wallet and published to the Cardano blockchain:
                    </p>
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="space-y-2 text-sm font-mono">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Event ID:</span>
                          <span className="text-gray-900">{createdEvent.eventId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Event Name:</span>
                          <span className="text-gray-900">{createdEvent.eventName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Starting Date (POSIX):</span>
                          <span className="text-gray-900">{Math.floor(new Date(startDate + ':00.000Z').getTime() / 1000)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Ending Date (POSIX):</span>
                          <span className="text-gray-900">{Math.floor(new Date(endDate + ':00.000Z').getTime() / 1000)}</span>
                        </div>
                        {walletAddress && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Wallet Address:</span>
                            <span className="text-gray-900 truncate ml-2">{walletAddress.slice(0, 20)}...{walletAddress.slice(-10)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Wallet Connection Status */}
                {connected && walletAddress ? (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Wallet Connected</div>
                          <div className="text-xs text-gray-600 font-mono">
                            {walletAddress.slice(0, 12)}...{walletAddress.slice(-8)}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => disconnect()}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <h3 className="font-semibold text-yellow-900 mb-2">Wallet Not Connected</h3>
                        <p className="text-sm text-yellow-800 mb-4">
                          Connect your wallet to sign the blockchain transaction and start the voting event.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowWalletModal(true)}
                          disabled={isConnecting}
                          className="px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Start Button */}
                <button
                  onClick={handleStartVoting}
                  disabled={isStarting || !startDate || !endDate || !connected || !walletAddress}
                  className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isStarting ? (
                    <>
                      <LoadingSpinner />
                      {mintingStep === 'group' && 'Minting Group NFT...'}
                      {mintingStep === 'voting' && 'Minting Voting NFTs...'}
                      {mintingStep === 'complete' && 'Finalizing...'}
                      {mintingStep === 'idle' && 'Preparing Transaction...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Publish Voting Event to Blockchain
                    </>
                  )}
                </button>
                  </>
                )}
              </div>
            )}

            {/* Results Tab */}
            {activeTab === 'results' && (
              <div>
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-4">
                  <h3 className="font-bold text-gray-900 mb-1">Voting Results</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Results are read directly from the Cardano blockchain. The page auto-refreshes while voting is live.
                  </p>
                  <Link
                    href={`/event/${eventId}/results`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    View Live Results
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">Choose a wallet to sign the transaction</p>

            <div className="space-y-3">
              {['eternl', 'lace', 'yoroi'].map((walletName) => (
                <button
                  key={walletName}
                  onClick={() => connectWalletByName(walletName)}
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
