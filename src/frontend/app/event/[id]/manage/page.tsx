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
 * - POST   /voting-event/:eventId/build-group-mint-tx      (unsigned Group NFT mint for CIP-30 signing)
 * - POST   /voting-event/:eventId/build-semaphore-voting-mint-tx (unsigned Semaphore + Voting mint)
 * - POST   /voting-event/:eventId/build-fee-deposit-tx     (unsigned fee-deposit payment, Mainnet)
 * - POST   /voting-event/:eventId/submit-tx                (backend submits a tx it built; persists ids)
 * - GET    /voting-event/:eventId/tx/:txHash               (confirmation polling)
 *
 * The browser never talks to Blockfrost: the backend builds, submits and watches every
 * transaction with its own key for the event's network; the organiser's wallet only signs.
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useWallet } from '@meshsdk/react';
import {
  mintGroupNft,
  mintSemaphoreVotingNfts,
  sendFeeDeposit,
  waitForTxConfirmation,
} from '@/lib/blockchain-helpers';
import {
  CardanoNetwork,
  NETWORK_LABEL,
  NetworkInfo,
  asNetwork,
  assertWalletNetwork,
  explorerTxUrl,
  fetchNetworks,
  lovelaceToAda,
} from '@/lib/network';
import { NetworkBadge } from '@/components/NetworkBadge';
import { AppShell, PageIntro } from '@/components/AppShell';
import { Button, LinkButton } from '@/components/Button';
import { CardHeader, CodeBox, DataRow, Notice } from '@/components/Card';
import { FieldLabel, inputClass } from '@/components/Field';
import { BoltIcon, ChartIcon, CheckIcon, ClockIcon, ExternalIcon, KeyIcon, MailIcon, PlusIcon, RefreshIcon, SlidersIcon, Spinner, TrashIcon, UsersIcon, WalletIcon } from '@/components/Icons';
import { InfoButton } from '@/components/InfoButton';
import { INFO } from '@/components/infoTexts';
import { ResultRow } from '@/components/ResultRow';
import { StatusPill } from '@/components/StatusPill';
import { Steps } from '@/components/Steps';
import { WalletModal } from '@/components/WalletModal';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000';

// ============================================================================
// TYPES / INTERFACES
// ============================================================================

interface CreatedEvent {
  eventId: number; // Changed from string to number
  adminLink?: string;
  eventName: string;
  network: CardanoNetwork; // chosen at creation, immutable
  votingPower?: number | null; // 1 = simple, >1 = weighted
  options?: string | null; // JSON string array
  startingDate?: number | null; // POSIX timestamp
  endingDate?: number | null; // POSIX timestamp
  walletAddress?: string; // Wallet address of admin
  adminUserId?: number | null; // Admin user ID
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

// GET /voting-event/:eventId/fee-deposit — the organiser's prepaid vote-fee budget
// (fee-deposit networks only, i.e. Mainnet).
interface FeeDepositStatus {
  network: CardanoNetwork;
  required: boolean;
  relayAddress: string | null;
  feePerVoteLovelace: string;
  registeredVoters: number;
  requiredLovelace: string;
  depositTxHash: string | null;
  budgetLovelace: string | null;
  spentLovelace: string;
  missingLovelace: string;
  funded: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EventDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.id as string;
  const adminToken = searchParams.get('token');
  // Admin-only backend endpoints check this header against the event's admin token.
  const adminHeaders = { 'Content-Type': 'application/json', 'x-admin-token': adminToken ?? '' };
  // Organiser transaction endpoints (build / submit / tx status) — same admin token.
  const organiserApi = { backendApiUrl: BACKEND_API_URL, eventId, adminToken: adminToken ?? '' };
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

  // Network of the event as the backend serves it (relay address, VKey ref, deposit rule)
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [networksLoadError, setNetworksLoadError] = useState<string | null>(null);

  // Fee deposit (Mainnet): prepaid vote fees, must be funded before publishing
  const [feeDeposit, setFeeDeposit] = useState<FeeDepositStatus | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string>('');
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

  // Results State
  const [results, setResults] = useState<Array<{ index: number; text: string; votes: number }> | null>(null);
  const [resultsMeta, setResultsMeta] = useState<{ status: string; totalVotes: number; registeredVoters: number; resultsAvailable: boolean } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

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
              network: asNetwork(eventData.network),
              votingPower: eventData.votingPower,
              options: eventData.options,
              startingDate: eventData.startingDate,
              endingDate: eventData.endingDate,
              walletAddress: eventData.walletAddress,
              adminUserId: eventData.adminUserId,
              adminLink: `${window.location.origin}/event/${eventId}/manage?token=${adminToken}`,
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
    // The Start Voting tab shows the readiness checklist and the Results tab the
    // registered-voter count, so both need the list too.
    if ((activeTab === 'participants' || activeTab === 'start' || activeTab === 'results') && createdEvent) {
      loadParticipants();
    }
  }, [activeTab, createdEvent?.eventId]);

  useEffect(() => {
    if (activeTab === 'results') loadResults();
  }, [activeTab]);

  /**
   * Network info for this event (which VKey UTxO to put in the datum, where the fee
   * deposit goes, whether the server serves the network at all).
   * Backend: GET /voting-event/networks
   */
  useEffect(() => {
    if (!createdEvent) return;
    fetchNetworks(BACKEND_API_URL)
      .then(list => {
        const info = list.find(n => n.network === createdEvent.network) ?? null;
        setNetworkInfo(info);
        setNetworksLoadError(info ? null : `The server does not know the network "${createdEvent.network}".`);
      })
      .catch(err => setNetworksLoadError(`Could not load network information: ${err instanceof Error ? err.message : String(err)}`));
  }, [createdEvent?.eventId, createdEvent?.network]);

  /**
   * Fee deposit status, shown on the Start Voting tab (Mainnet events must be funded first).
   * Backend: GET /voting-event/:eventId/fee-deposit
   */
  const loadFeeDeposit = async () => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/fee-deposit`, { headers: adminHeaders });
      if (!response.ok) throw new Error(`${response.status}`);
      setFeeDeposit(await response.json());
    } catch (err) {
      console.error('Failed to load fee deposit status:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'start' && createdEvent) loadFeeDeposit();
  }, [activeTab, createdEvent?.eventId, participants.length]);

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
        network: asNetwork(backendEvent.network),
        votingPower: backendEvent.votingPower,
        options: backendEvent.options, // Keep as JSON string with vote counts
        startingDate: backendEvent.startingDate,
        endingDate: backendEvent.endingDate,
        adminUserId: backendEvent.adminUserId,
        adminLink: `${window.location.origin}/event/${eventId}/manage?token=${adminToken}`,
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
        `${BACKEND_API_URL}/voting-event/${eventId}/invited`,
        { headers: adminHeaders }
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

  const loadResults = async () => {
    setLoadingResults(true);
    try {
      const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/results`, { headers: adminHeaders });
      if (!response.ok) throw new Error('Failed to load results');
      const data = await response.json();
      setResults(data.options);
      setResultsMeta({ status: data.status, totalVotes: data.totalVotes ?? 0, registeredVoters: data.registeredVoters ?? 0, resultsAvailable: !!data.resultsAvailable });
    } catch (err) {
      console.error('Failed to load results:', err);
      setResults(null);
      setResultsMeta(null);
    } finally {
      setLoadingResults(false);
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
          headers: adminHeaders,
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
          headers: adminHeaders,
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
          headers: adminHeaders,
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
          headers: adminHeaders
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
  /**
   * Fee deposit (Mainnet): the organiser prepays the voters' transaction fees.
   * The backend builds a plain payment of the missing amount to the relay wallet address
   * (POST build-fee-deposit-tx), the organiser's wallet signs it, the backend submits it
   * (POST submit-tx) and then verifies it on-chain (POST confirm-fee-deposit).
   */
  const handleSendFeeDeposit = async () => {
    if (!feeDeposit?.required || feeDeposit.funded || !feeDeposit.relayAddress) return;
    if (!connected || !wallet || !walletAddress) {
      alert('Please connect your wallet to send the fee deposit');
      return;
    }
    const network: CardanoNetwork = createdEvent?.network ?? 'preprod';
    const amount = feeDeposit.missingLovelace;
    const ada = lovelaceToAda(amount);
    if (!window.confirm(
      `Send the fee deposit of ${ada} ADA to the voting service?\n\n` +
      `This covers your voters' transaction fees (${feeDeposit.registeredVoters} registered voters × ${lovelaceToAda(feeDeposit.feePerVoteLovelace)} ADA) ` +
      `and is the cost of running this event. Any unused remainder is not refunded.`
    )) return;

    setIsDepositing(true);
    setDepositStatus('Checking wallet network...');
    try {
      await assertWalletNetwork(wallet, network);

      setDepositStatus('Building the deposit transaction...');
      const { txHash } = await sendFeeDeposit(organiserApi, wallet, { walletAddress }, setDepositStatus);
      console.log('Fee deposit submitted:', txHash);

      // The backend verifies the tx itself; it answers 404 until Blockfrost has indexed it.
      setDepositStatus(`Deposit submitted (${txHash.slice(0, 16)}...). Waiting for confirmation...`);
      let confirmed = false;
      let lastError = '';
      for (let i = 0; i < 60 && !confirmed; i++) {
        const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/confirm-fee-deposit`, {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ txHash }),
        });
        if (response.ok) {
          confirmed = true;
          break;
        }
        const err = await response.json().catch(() => ({}));
        lastError = typeof err?.message === 'string' ? err.message : `HTTP ${response.status}`;
        if (response.status !== 404) break; // 404 = not indexed yet; anything else is final
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      if (!confirmed) {
        throw new Error(
          `The deposit was submitted (tx ${txHash}) but could not be confirmed: ${lastError}. ` +
          `Reload this page in a minute; if it is still not recorded, contact support with the tx hash.`
        );
      }
      setDepositStatus('Fee deposit recorded.');
      await loadFeeDeposit();
    } catch (error) {
      console.error('Fee deposit failed:', error);
      const message = error instanceof Error ? error.message : String(error);
      setDepositStatus(`Error: ${message}`);
      alert(`Fee deposit failed:\n\n${message}`);
    } finally {
      setIsDepositing(false);
    }
  };

  const handleStartVoting = async () => {
    // ═══════════════════════════════════════════════════════════════════════
    // A. VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    // Parse as UTC by appending 'Z' to treat input as UTC time
    const start = new Date(startDate + ':00.000Z');
    const end = new Date(endDate + ':00.000Z');
    const now = new Date();

    // Check if start date is in the past
    if (start < now) {
      alert('Start date cannot be in the past');
      return;
    }

    if (end <= start) {
      alert('End date must be after start date');
      return;
    }

    // Check if end date is in the past
    if (end < now) {
      alert('End date cannot be in the past');
      return;
    }

    // Check wallet connection
    if (!connected || !wallet) {
      alert('Please connect your wallet to start the voting event');
      return;
    }

    if (!walletAddress) {
      alert('Wallet address not available. Please reconnect your wallet.');
      return;
    }

    const network: CardanoNetwork = createdEvent?.network ?? 'preprod';

    if (!networkInfo || !networkInfo.enabled || !networkInfo.vkeyRef) {
      alert(`${NETWORK_LABEL[network]} is not enabled on this server${networksLoadError ? ` (${networksLoadError})` : ''}. The event cannot be published here.`);
      return;
    }

    // The wallet must be on the event's network — otherwise the mint txs would go to the wrong chain.
    try {
      await assertWalletNetwork(wallet, network);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      return;
    }

    // Fee-deposit networks (Mainnet): the voters' fees must be prepaid before publishing
    // (the backend enforces this too and answers 402).
    if (feeDeposit?.required && !feeDeposit.funded) {
      alert(`Send the fee deposit first (${lovelaceToAda(feeDeposit.missingLovelace)} ADA still missing). It prepays your voters' transaction fees.`);
      return;
    }

    setIsStarting(true);
    setMintingStep('idle');
    setTxStatus('Preparing blockchain transaction...');

    try {
      // Convert dates to POSIX timestamps (seconds since epoch)
      const startingDate = Math.floor(start.getTime() / 1000);
      const endingDate = Math.floor(end.getTime() / 1000);

      // ═══════════════════════════════════════════════════════════════════════
      // B. TRANSACTION 1: MINT GROUP NFT
      // ═══════════════════════════════════════════════════════════════════════
      // The backend builds the tx from the wallet's UTxOs and the event's Merkle root,
      // the wallet signs it, the backend submits it and records the Group NFT.

      setMintingStep('group');
      setTxStatus('Step 1/2: Minting Group NFT with participant merkle tree...');

      const groupResult = await mintGroupNft(organiserApi, wallet, { walletAddress }, setTxStatus);

      console.log('✅ Group NFT minted:', {
        txHash: groupResult.txHash,
        policyId: groupResult.policyId,
      });

      setTxStatus(`Group NFT minted! TX: ${groupResult.txHash.slice(0, 16)}... Waiting for confirmation...`);

      const groupConfirmed = await waitForTxConfirmation(organiserApi, groupResult.txHash, 60, 3000);
      if (!groupConfirmed) {
        throw new Error('Group NFT transaction not confirmed after 3 minutes. Please try again.');
      }
      console.log('✅ Group NFT transaction confirmed on-chain');

      // ═══════════════════════════════════════════════════════════════════════
      // C. TRANSACTION 2: MINT SEMAPHORE + VOTING NFTs
      // ═══════════════════════════════════════════════════════════════════════
      // The backend waits for the Group NFT UTxO to be indexed, spends only the change of
      // the Group mint (F11), derives the validity window and the datums, and persists the
      // Semaphore/Voting identifiers and the event dates when it submits the tx.

      setMintingStep('voting');
      setTxStatus('Step 2/2: Minting Semaphore + Voting NFTs...');

      const svResult = await mintSemaphoreVotingNfts(
        organiserApi,
        wallet,
        { walletAddress, startingDate, endingDate },
        setTxStatus,
      );

      console.log('✅ Semaphore + Voting NFTs minted:', {
        txHash: svResult.txHash,
        semaphorePolicyId: svResult.semaphorePolicyId,
        votingPolicyId: svResult.votingPolicyId,
      });

      setTxStatus(`Voting NFTs minted! TX: ${svResult.txHash.slice(0, 16)}... Waiting for confirmation...`);

      const svConfirmed = await waitForTxConfirmation(organiserApi, svResult.txHash, 30, 2000);
      if (!svConfirmed) {
        console.warn('Semaphore/Voting NFT transaction not confirmed yet, but continuing...');
      } else {
        console.log('✅ Semaphore/Voting NFT transaction confirmed on-chain');
      }

      setMintingStep('complete');
      setTxStatus('Blockchain transactions complete! Refreshing event data...');

      // ═══════════════════════════════════════════════════════════════════════
      // D. REFRESH
      // ═══════════════════════════════════════════════════════════════════════
      // Dates and on-chain identifiers were persisted by the backend at submit time.

      if (createdEvent) {
        setCreatedEvent({ ...createdEvent, startingDate, endingDate });
      }
      await loadEventFromBackend();

      // Store results for UI display
      setBlockchainResult({
        groupTxHash: groupResult.txHash,
        groupPolicyId: groupResult.policyId,
        semaphoreVotingTxHash: svResult.txHash,
        semaphorePolicyId: svResult.semaphorePolicyId,
        votingPolicyId: svResult.votingPolicyId,
        votingValidatorAddress: svResult.votingScriptAddr,
      });

      // ═══════════════════════════════════════════════════════════════════════
      // E. SUCCESS
      // ═══════════════════════════════════════════════════════════════════════

      setTxStatus('Voting event published to blockchain! 🎉');

      alert(
        `🎉 Voting event published to blockchain!\n\n` +
        `Group NFT: ${groupResult.txHash.slice(0, 16)}...\n` +
        `Voting NFTs: ${svResult.txHash.slice(0, 16)}...\n\n` +
        `View transactions on Cardanoscan`
      );

    } catch (error) {
      console.error('❌ Error starting voting:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start voting event';

      setTxStatus(`Error: ${errorMessage}`);
      setMintingStep('idle');

      alert(
        `Failed to start voting event:\n\n${errorMessage}\n\n` +
        `Please check the console for details.`
      );
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
      <AppShell width="sm" center>
        <div className="flex flex-col items-center gap-4 text-center">
          <Spinner size={40} className="text-ink" />
          <p className="text-muted">Validating access...</p>
        </div>
      </AppShell>
    );
  }

  // Unauthorized screen
  if (!isAuthorized) {
    return (
      <AppShell width="sm" center>
        <Notice tone="danger" title="Access Denied">
          <p className="mt-1">
            {tokenError || 'You need a valid admin token to access this event dashboard.'}
          </p>
          <p className="mt-2 text-xs text-red-800/80">
            Please use the admin link provided when you created the event.
          </p>
          <LinkButton href="/" variant="dark" size="sm" className="mt-4">
            Back to Home
          </LinkButton>
        </Notice>
      </AppShell>
    );
  }

  if (!createdEvent) {
    return (
      <AppShell width="sm" center>
        <div className="flex items-center justify-center gap-3 text-muted">
          <Spinner size={22} />
          <span>Loading event...</span>
        </div>
      </AppShell>
    );
  }

  const registeredCount = participants.filter(p => p.status === 'registered').length;
  const votingEnded = !createdEvent.endingDate || Date.now() >= createdEvent.endingDate * 1000;

  return (
    <AppShell aside={<NetworkBadge network={createdEvent.network} />}>
      {/* Dashboard Header with Admin Access */}
      <PageIntro
        eyebrow="ADMIN DASHBOARD"
        title={createdEvent.eventName}
        className="mb-6"
      />

      {/* Admin Link */}
      <Notice tone="neutral" icon={<KeyIcon size={18} />} className="mb-6">
        <div className="flex min-h-9 items-center gap-x-1">
          <span className="font-semibold">Your admin link</span>
          <InfoButton text={INFO.adminLink} />
        </div>
        <p className="text-xs text-muted">
          Use this link to access your event dashboard. Keep it secure.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700">
            {createdEvent.adminLink}
          </p>
          <Button variant="outline" size="sm" onClick={() => createdEvent.adminLink && copyToClipboard(createdEvent.adminLink)} className="sm:flex-none">
            {copiedAdmin ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </Notice>

      {/* Setup Steps */}
      <div className="mb-6 rounded-2xl border border-line bg-[#fafafa] px-3 py-3 sm:px-6">
        <Steps<Tab>
          label="Setup steps"
          active={activeTab}
          onSelect={setActiveTab}
          steps={[
            { key: 'parameters', label: 'Configure Parameter', done: options.filter(o => o.trim()).length >= 2 },
            { key: 'participants', label: 'Invite Participants', done: participants.length > 0 },
            { key: 'start', label: 'Start Voting', done: !!(blockchainResult || publishedData) },
            { key: 'results', label: 'Voting Results', done: false },
          ]}
        />
      </div>

      {/* Tab Content */}
      <div>
        {/* Parameters Tab */}
        {activeTab === 'parameters' && (
          <section className="border-t border-line pt-7">
            <CardHeader
              icon={<SlidersIcon size={20} />}
              title="Voting Configuration"
              info={<InfoButton text={INFO.createdEventFixed} label="What can still change?" />}
              className="mb-6"
            />

            {/* Network — fixed at creation */}
            <div className="mb-6">
              <FieldLabel info={<InfoButton text={INFO.network} />}>Cardano Network</FieldLabel>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-[#fafafa] px-4 py-3">
                <NetworkBadge network={createdEvent.network} />
                <span className="text-sm text-gray-700">
                  {createdEvent.network === 'mainnet'
                    ? 'Real ADA: publishing and voting cost real transaction fees.'
                    : 'Test network: free test ADA, no real money involved.'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">The network was chosen when the event was created and cannot be changed.</p>
            </div>

            {/* Voting Type Display */}
            <div className="mb-6">
              <FieldLabel info={<InfoButton text={INFO.votingType} />}>Voting Type</FieldLabel>
              <div className="rounded-xl border border-line bg-[#fafafa] px-4 py-3">
                <span className="font-medium text-ink">
                  {votingPower === 1 ? 'Simple Voting (1 vote per person)' : `Weighted Voting (${votingPower} points to distribute)`}
                </span>
              </div>
              {votingPower > 1 && (
                <p className="mt-2 text-xs text-muted">
                  Voters can distribute {votingPower} points across multiple options.
                </p>
              )}
            </div>

            {/* Voting Options */}
            <div>
              <FieldLabel>Voting Options</FieldLabel>
              <div className="space-y-2">
                {options.filter(o => o.trim() !== '').map((option, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl border border-line bg-[#fafafa] px-4 py-3">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="font-medium text-ink">{option}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Participants Tab */}
        {activeTab === 'participants' && (
          <div>
            {/* Invite Participants */}
            <section className="mb-8 border-t border-line pt-7">
              <CardHeader
                icon={<MailIcon size={20} />}
                title="Invite Participants"
                info={<InfoButton text={INFO.inviteValidity} />}
                description={invitationsSent ? undefined : 'Enter an email address to invite a participant. Each participant will receive a unique voting link.'}
              />
              {/* Invitations go out once; after that the list cannot grow, so the input is hidden. */}
              {invitationsSent ? (
                <p className="text-sm text-muted">Invitations have been sent. New participants can no longer be added to this event.</p>
              ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={newParticipantEmail}
                  onChange={(e) => setNewParticipantEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
                  placeholder="participant@example.com"
                  aria-label="Participant email address"
                  className={`${inputClass} sm:flex-1`}
                />
                <Button variant="dark" size="md" onClick={addParticipant} className="min-h-12 sm:flex-none">
                  <PlusIcon size={18} />
                  Add Participant
                </Button>
              </div>
              )}
            </section>

            {/* Participants List */}
            {participants.length > 0 ? (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-bold text-ink">Participant List</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="neutral">{participants.length} Total</StatusPill>
                      <StatusPill tone="success">{participants.filter(p => p.status === 'registered').length} Registered</StatusPill>
                      <StatusPill tone="attention">{participants.filter(p => p.status === 'pending').length} Pending</StatusPill>
                    </div>
                  </div>
                  {/* Same loader as the readiness box on the Start Voting tab */}
                  <Button variant="outline" size="sm" onClick={loadParticipants}>
                    <RefreshIcon size={16} />
                    Refresh
                  </Button>
                </div>

                <ul className="space-y-2">
                  {participants.map((participant, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3"
                    >
                      {/* Status Icon */}
                      <span aria-hidden="true" className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${participant.status === 'registered' ? 'bg-emerald-600 text-white' : 'border border-line bg-[#fafafa] text-muted'}`}>
                        {participant.status === 'registered' ? <CheckIcon size={16} /> : <ClockIcon size={16} />}
                      </span>

                      {/* Participant Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm text-ink">
                            {participant.email || `User #${participant.userId}`}
                          </p>
                          {participant.status === 'registered' ? (
                            <StatusPill tone="success">Registered</StatusPill>
                          ) : (
                            <StatusPill tone="attention">Pending</StatusPill>
                          )}
                        </div>
                      </div>

                      {/* Remove Button */}
                      <Button variant="danger" size="sm" onClick={() => removeParticipant(participant.userId, participant.email)} className="flex-none">
                        <TrashIcon size={16} />
                        <span className="hidden sm:inline">Remove</span>
                        <span className="sr-only sm:hidden">Remove {participant.email || `User #${participant.userId}`}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-[#fafafa] p-8 text-center">
                <span aria-hidden="true" className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white text-muted">
                  <UsersIcon size={24} />
                </span>
                <p className="mb-1 font-semibold text-ink">No participants invited yet</p>
                <p className="text-sm text-muted">Add participants above to generate unique voting links.</p>
              </div>
            )}

            {/* Send Invitations Section */}
            {participants.length > 0 && (
              <div className="mt-8">
                {/* Warning Box */}
                {!invitationsSent && (
                  <Notice tone="attention" title="Important Notice" className="mb-4">
                    <p>
                      Invitations can only be sent <strong>once</strong>. Make sure your participant list is complete before proceeding. You won&apos;t be able to send additional invitations after clicking the button below.
                    </p>
                  </Notice>
                )}

                {/* Send Button */}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={sendInvitations}
                  disabled={invitationsSent || isSending}
                  loading={isSending}
                >
                  {isSending ? 'Sending Invitations...' : invitationsSent ? (<><CheckIcon size={18} /> Invitations Sent</>) : (<><MailIcon size={18} /> Send Invitations to All Participants</>)}
                </Button>

                {/* Success/Error Message */}
                {invitationResult && (
                  <Notice
                    tone={invitationResult.failed === 0 ? 'success' : 'attention'}
                    title={invitationResult.failed === 0 ? 'All Invitations Sent Successfully!' : 'Invitations Sent with Errors'}
                    className="mt-4"
                  >
                    <p>
                      Successfully sent: <strong>{invitationResult.success}</strong>
                      {invitationResult.failed > 0 && (
                        <> | Failed: <strong>{invitationResult.failed}</strong></>
                      )}
                    </p>

                    {invitationResult.failed > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-semibold">Failed emails:</p>
                        {invitationResult.results
                          .filter(r => r.status === 'failed')
                          .map((result, idx) => (
                            <div key={idx} className="rounded-lg bg-white p-2 text-xs text-ink">
                              <span className="font-mono">{result.email}</span>
                              {result.error && (
                                <span className="ml-2 text-red-700">- {result.error}</span>
                              )}
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </Notice>
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
              <Notice
                tone="progress"
                className="mb-6"
                title={
                  <>
                    {mintingStep === 'group' && 'Step 1/2: Minting Group NFT'}
                    {mintingStep === 'voting' && 'Step 2/2: Minting Voting NFTs'}
                    {mintingStep === 'complete' && 'Finalizing...'}
                    <InfoButton text={INFO.twoSignatures} />
                  </>
                }
              >
                <p className="text-gray-700">{txStatus}</p>
                <div className="mt-4 flex gap-2" aria-hidden="true">
                  <div className={`h-2 flex-1 rounded-full ${mintingStep === 'group' || mintingStep === 'voting' || mintingStep === 'complete' ? 'bg-brand' : 'bg-gray-200'}`}></div>
                  <div className={`h-2 flex-1 rounded-full ${mintingStep === 'voting' || mintingStep === 'complete' ? 'bg-brand' : 'bg-gray-200'}`}></div>
                </div>
                <p className="mt-2 text-xs text-muted">Do not close this window. Blockchain transactions may take 1-2 minutes.</p>
              </Notice>
            )}

            {/* Blockchain Result - Show after successful minting */}
            {blockchainResult ? (
              <Notice tone="success" title="Event Published to Blockchain!">
                <p className="text-emerald-900/80">
                  Your voting event has been successfully minted on the Cardano blockchain. All NFTs are now live on-chain!
                </p>

                <div className="mt-4 space-y-4 rounded-xl border border-emerald-200 bg-white p-4 text-ink">
                  <h4 className="font-semibold">Blockchain Transaction Details</h4>

                  {/* Group NFT */}
                  <div className="border-b border-line pb-4">
                    <h5 className="mb-2 flex items-center gap-2 font-semibold">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-ink">1</span>
                      Group NFT (Participant Merkle Tree)
                    </h5>
                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="mb-1 font-semibold text-muted">Policy ID</div>
                        <CodeBox>{blockchainResult.groupPolicyId}</CodeBox>
                      </div>
                      <div>
                        <div className="mb-1 font-semibold text-muted">Transaction Hash</div>
                        <CodeBox>{blockchainResult.groupTxHash}</CodeBox>
                      </div>
                      <a
                        href={explorerTxUrl(createdEvent.network, blockchainResult.groupTxHash ?? "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px]"
                      >
                        <ExternalIcon size={14} />
                        View on Cardanoscan
                      </a>
                    </div>
                  </div>

                  {/* Semaphore + Voting NFTs */}
                  <div>
                    <h5 className="mb-2 flex items-center gap-2 font-semibold">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-ink">2</span>
                      Semaphore + Voting NFTs
                    </h5>
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="mb-1 font-semibold text-muted">Semaphore Policy ID</div>
                        <CodeBox>{blockchainResult.semaphorePolicyId}</CodeBox>
                      </div>
                      <div>
                        <div className="mb-1 font-semibold text-muted">Voting Policy ID</div>
                        <CodeBox>{blockchainResult.votingPolicyId}</CodeBox>
                      </div>
                      <div>
                        <div className="mb-1 font-semibold text-muted">Voting Validator Address</div>
                        <CodeBox className="text-[10px]">{blockchainResult.votingValidatorAddress}</CodeBox>
                      </div>
                      <div>
                        <div className="mb-1 font-semibold text-muted">Transaction Hash</div>
                        <CodeBox>{blockchainResult.semaphoreVotingTxHash}</CodeBox>
                      </div>
                      <a
                        href={explorerTxUrl(createdEvent.network, blockchainResult.semaphoreVotingTxHash ?? "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px]"
                      >
                        <ExternalIcon size={14} />
                        View on Cardanoscan
                      </a>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-xs text-emerald-900/80">
                  All NFTs and voting data are now immutably recorded on the Cardano blockchain and can be verified by anyone.
                </p>

                {/* Navigation to Results */}
                <div className="mt-6 border-t border-emerald-200 pt-6">
                  <Button variant="dark" size="lg" onClick={() => setActiveTab('results')}>
                    <ChartIcon size={18} />
                    View Results
                  </Button>
                </div>
              </Notice>
            ) : publishedData ? (
              <Notice tone="success" title="Event Published to Blockchain">
                <p className="text-emerald-900/80">
                  Your voting event has been successfully signed and published to the Cardano blockchain. Participants can now vote using their unique voting links.
                </p>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 text-ink">
                  <h4 className="mb-3 font-semibold">Event Summary &amp; Blockchain Transaction Data</h4>
                  <div className="space-y-3 text-xs">
                    {/* Event Details */}
                    <div>
                      <div className="mb-1 font-semibold text-muted">Event ID</div>
                      <CodeBox>{publishedData.eventId}</CodeBox>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-muted">Event Name</div>
                      <CodeBox>{publishedData.eventName}</CodeBox>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 font-semibold text-muted">Starting Date</div>
                        <div className="rounded-lg border border-line bg-[#fafafa] px-3 py-2">
                          <div className="font-medium">{new Date(publishedData.startingDate * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</div>
                          <div className="mt-1 font-mono text-[10px] text-muted">POSIX: {publishedData.startingDate}</div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 font-semibold text-muted">Ending Date</div>
                        <div className="rounded-lg border border-line bg-[#fafafa] px-3 py-2">
                          <div className="font-medium">{new Date(publishedData.endingDate * 1000).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</div>
                          <div className="mt-1 font-mono text-[10px] text-muted">POSIX: {publishedData.endingDate}</div>
                        </div>
                      </div>
                    </div>

                    {/* Wallet Signature */}
                    <div>
                      <div className="mb-1 font-semibold text-muted">Wallet Signature</div>
                      <CodeBox className="text-[10px]">{publishedData.signature}</CodeBox>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-muted">Public Key</div>
                      <CodeBox className="text-[10px]">{publishedData.publicKey}</CodeBox>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-muted">Wallet Address</div>
                      <CodeBox className="text-[10px]">{publishedData.walletAddress}</CodeBox>
                    </div>

                    <div>
                      <div className="mb-1 font-semibold text-muted">Transaction Timestamp</div>
                      <CodeBox>{new Date(publishedData.timestamp).toLocaleString()}</CodeBox>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-xs text-emerald-900/80">
                  This data is now immutably recorded on the Cardano blockchain and can be verified by anyone.
                </p>

                {/* Navigation to Results */}
                <div className="mt-6 border-t border-emerald-200 pt-6">
                  <Button variant="dark" size="lg" onClick={() => setActiveTab('results')}>
                    <ChartIcon size={18} />
                    View Results
                  </Button>
                </div>
              </Notice>
            ) : (
              <>
                {/* Blockchain Transaction Details */}
                {startDate && endDate && (
                  <section className="mb-6 border-t border-line pt-7">
                    <CardHeader
                      icon={<BoltIcon size={20} />}
                      title="Preview: Blockchain Transaction Data"
                      info={<InfoButton text={INFO.votingWindow} />}
                      description="The following data will be signed with your wallet and published to the Cardano blockchain:"
                    />
                    <div className="rounded-xl border border-line bg-white px-4 py-1">
                      <DataRow label="Starting Date (POSIX):" mono>{Math.floor(new Date(startDate + ':00.000Z').getTime() / 1000)}</DataRow>
                      <DataRow label="Ending Date (POSIX):" mono>{Math.floor(new Date(endDate + ':00.000Z').getTime() / 1000)}</DataRow>
                      {walletAddress && (
                        <DataRow label="Wallet Address:" mono>{walletAddress.slice(0, 20)}...{walletAddress.slice(-10)}</DataRow>
                      )}
                    </div>
                  </section>
                )}

                {/* Readiness checklist — testers asked to see who is still missing before publishing */}
                {(() => {
                  const registered = participants.filter(p => p.status === 'registered');
                  const pending = participants.filter(p => p.status !== 'registered');
                  const tone = registered.length === 0 ? 'danger' : pending.length > 0 ? 'attention' : 'success';
                  return (
                    <Notice
                      tone={tone}
                      icon={null}
                      className="mb-6"
                      title={<>Before you publish <InfoButton text={INFO.publish} /></>}
                      action={
                        <Button variant="ghost" size="sm" onClick={loadParticipants} className="-mr-2 text-xs underline">
                          Refresh
                        </Button>
                      }
                    >
                      <div className="mb-3 flex flex-wrap gap-2 text-sm">
                        <span className="rounded-lg border border-line bg-white px-2.5 py-1 text-ink"><strong>{participants.length}</strong> invited</span>
                        <span className="rounded-lg border border-line bg-white px-2.5 py-1 text-ink"><strong>{registered.length}</strong> registered</span>
                        <span className="rounded-lg border border-line bg-white px-2.5 py-1 text-ink"><strong>{pending.length}</strong> still pending</span>
                      </div>
                      <p className="mb-2">
                        Publishing freezes the voter group on-chain. <strong>Only participants who have registered by now can vote</strong> — anyone still pending will not be able to vote, even if they register later.
                      </p>
                      {registered.length === 0 && (
                        <p className="font-semibold text-red-800">No participant has registered yet. Send the invitations and wait until at least one participant has registered.</p>
                      )}
                      {pending.length > 0 && (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer py-2.5 font-medium">Who is still pending ({pending.length})</summary>
                          <ul className="ml-5 mt-1 list-disc space-y-0.5">
                            {pending.map(p => <li key={p.userId}>{p.email ?? `Participant #${p.userId}`}</li>)}
                          </ul>
                        </details>
                      )}
                      <div className="mt-4 border-t border-black/10 pt-3 text-sm">
                        <div className="mb-1 flex min-h-9 items-center gap-x-1">
                          <p className="font-semibold">What happens when you click Publish</p>
                          <InfoButton text={INFO.twoSignatures} />
                        </div>
                        <ol className="ml-5 list-decimal space-y-0.5">
                          {feeDeposit?.required && (
                            <li>Before the two transactions below, you send the <strong>fee deposit</strong> (see the box below) — this prepays your voters&apos; transaction fees.</li>
                          )}
                          <li>Your wallet asks you to sign transaction 1 of 2: the <strong>Group NFT</strong> that carries the registered voter list.</li>
                          <li>After about a minute it asks you to sign transaction 2 of 2: the <strong>Semaphore + Voting NFTs</strong> that hold the ballot.</li>
                          <li>Both need to confirm on-chain (1–2 minutes each). Keep this window open; the page shows each step.</li>
                        </ol>
                        {createdEvent.network === 'mainnet' && (
                          <p className="mt-2 rounded-lg border border-line border-l-4 border-l-brand bg-white px-3 py-2 text-xs text-ink">
                            <strong>Mainnet — real ADA.</strong> The two transactions lock 5 ADA in each of the three event contracts (15 ADA stay there) and cost about 1.5 ADA in fees.
                            Your wallet also needs one plain-ADA output of at least 5 ADA as collateral. Keep about 25 ADA plus the fee deposit available.
                          </p>
                        )}
                      </div>
                    </Notice>
                  );
                })()}

                {/* Network not served by this backend */}
                {networksLoadError && (
                  <Notice tone="danger" icon={null} className="mb-6">
                    {networksLoadError}
                  </Notice>
                )}
                {networkInfo && !networkInfo.enabled && (
                  <Notice tone="danger" icon={null} className="mb-6">
                    <strong>{NETWORK_LABEL[createdEvent.network]} is not enabled on this server.</strong> The event cannot be published here.
                  </Notice>
                )}

                {/* Fee deposit (Mainnet): prepaid vote fees */}
                {feeDeposit?.required && (
                  <Notice
                    tone={feeDeposit.funded ? 'success' : 'attention'}
                    icon={null}
                    className="mb-6"
                    title={<>Fee deposit <InfoButton text={INFO.feeDeposit} /></>}
                    action={
                      <Button variant="ghost" size="sm" onClick={loadFeeDeposit} className="-mr-2 text-xs underline">Refresh</Button>
                    }
                  >
                    <p className="mb-2">
                      Fee deposit: <strong>{lovelaceToAda(feeDeposit.requiredLovelace)} ADA</strong> ({feeDeposit.registeredVoters} registered voter{feeDeposit.registeredVoters === 1 ? '' : 's'} × {lovelaceToAda(feeDeposit.feePerVoteLovelace)} ADA).
                      This covers your voters&apos; transaction fees and is the cost of running this event; any unused remainder is not refunded.
                    </p>
                    {feeDeposit.funded ? (
                      <p className="font-medium">
                        Funded: {lovelaceToAda(feeDeposit.budgetLovelace ?? '0')} ADA deposited
                        {feeDeposit.depositTxHash && (
                          <> (<a href={explorerTxUrl(createdEvent.network, feeDeposit.depositTxHash.split(',').pop()!)} target="_blank" rel="noopener noreferrer" className="underline">view transaction</a>)</>
                        )}.
                      </p>
                    ) : (
                      <>
                        {feeDeposit.depositTxHash && (
                          <p className="mb-2">
                            {lovelaceToAda(feeDeposit.budgetLovelace ?? '0')} ADA deposited so far; more voters registered since, so {lovelaceToAda(feeDeposit.missingLovelace)} ADA are still missing.
                          </p>
                        )}
                        <p className="mb-3 text-xs text-gray-700">
                          The deposit goes to the voting service&apos;s relay wallet on {NETWORK_LABEL[createdEvent.network]}:
                          <span className="mt-1 block break-all font-mono">{feeDeposit.relayAddress ?? 'not configured'}</span>
                        </p>
                        <Button
                          variant="dark"
                          size="md"
                          onClick={handleSendFeeDeposit}
                          disabled={isDepositing || !connected || !walletAddress || !feeDeposit.relayAddress || feeDeposit.registeredVoters === 0}
                          loading={isDepositing}
                        >
                          {isDepositing ? 'Sending deposit...' : `Send fee deposit (${lovelaceToAda(feeDeposit.missingLovelace)} ADA)`}
                        </Button>
                        {!connected && <p className="mt-2 text-xs text-muted">Connect your {NETWORK_LABEL[createdEvent.network]} wallet below first.</p>}
                      </>
                    )}
                    {depositStatus && <p className="mt-2 text-xs text-gray-700">{depositStatus}</p>}
                  </Notice>
                )}

                {/* Wallet Connection Status */}
                {connected && walletAddress ? (
                  <Notice
                    tone="success"
                    className="mb-6"
                    title="Wallet Connected"
                    action={
                      <Button variant="danger" size="sm" onClick={() => disconnect()}>
                        Disconnect
                      </Button>
                    }
                  >
                    <p className="font-mono text-xs text-emerald-900/80">
                      {walletAddress.slice(0, 12)}...{walletAddress.slice(-8)}
                    </p>
                  </Notice>
                ) : (
                  <Notice tone="attention" icon={<WalletIcon size={20} />} title="Wallet Not Connected" className="mb-6">
                    <p className="mb-4">
                      Connect your wallet to sign the blockchain transaction and start the voting event.
                    </p>
                    <Button variant="dark" size="md" onClick={() => setShowWalletModal(true)} disabled={isConnecting}>
                      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                    </Button>
                  </Notice>
                )}

                {/* Start Button */}
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleStartVoting}
                  disabled={isStarting || !startDate || !endDate || !connected || !walletAddress || participants.filter(p => p.status === 'registered').length === 0 || (feeDeposit?.required && !feeDeposit.funded) || (networkInfo !== null && !networkInfo.enabled)}
                  loading={isStarting}
                >
                  {isStarting ? (
                    <>
                      {mintingStep === 'group' && 'Minting Group NFT...'}
                      {mintingStep === 'voting' && 'Minting Voting NFTs...'}
                      {mintingStep === 'complete' && 'Finalizing...'}
                      {mintingStep === 'idle' && 'Preparing Transaction...'}
                    </>
                  ) : (
                    <>
                      <BoltIcon size={18} />
                      Publish Voting Event to Blockchain
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && (
          <div>
            {/* Check if voting has ended */}
            {createdEvent.endingDate && Date.now() < createdEvent.endingDate * 1000 ? (
              <Notice tone="attention" icon={<ClockIcon size={20} />} title={<>Voting in Progress <InfoButton text={INFO.turnout} /></>} className="mb-6">
                <p>
                  Results per option will be displayed once the voting period ends on {new Date(createdEvent.endingDate * 1000).toLocaleString()}.
                </p>
                <p className="mt-3 font-semibold">
                  Turnout so far: {resultsMeta ? `${resultsMeta.totalVotes} of ${resultsMeta.registeredVoters} registered voters` : '—'}
                </p>
                <Button variant="outline" size="sm" onClick={loadResults} disabled={loadingResults} className="mt-3">
                  {loadingResults ? 'Refreshing...' : 'Refresh turnout'}
                </Button>
              </Notice>
            ) : (
              <>
                {/* Voting Statistics */}
                <section className="mb-8 border-t border-line pt-7">
                  <CardHeader
                    icon={<ChartIcon size={20} />}
                    title="Voting Statistics"
                    description="Summary of voting activity and participation."
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-line bg-[#fafafa] px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-600" />Voting ended</div>
                      <div className="mt-1 text-sm font-semibold text-ink">
                        {createdEvent.endingDate ? new Date(createdEvent.endingDate * 1000).toLocaleString() : 'Not set'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-[#fafafa] px-4 py-3">
                      <div className="text-xs text-muted">Total Votes</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">
                        {results ? results.reduce((sum, opt) => sum + (opt.votes || 0), 0) : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-line bg-[#fafafa] px-4 py-3">
                      <div className="text-xs text-muted">Registered Voters</div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">
                        {registeredCount}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* Voting Results - Only show if voting has ended */}
            {votingEnded && (
              <section className="mb-6 border-t border-line pt-7">
                <CardHeader
                  icon={<ChartIcon size={20} />}
                  title="Results by Option"
                  info={<InfoButton text={INFO.onChainResults} />}
                  description="Vote distribution across all options, sorted by popularity."
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
                ) : (
                  <div className="space-y-2">
                    {[...results].sort((a, b) => (b.votes || 0) - (a.votes || 0)).map((result, index) => {
                      const totalVotes = results.reduce((sum, opt) => sum + (opt.votes || 0), 0);
                      const votes = result.votes || 0;
                      const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0';

                      return (
                        <ResultRow
                          key={result.index}
                          rank={index + 1}
                          text={result.text}
                          percent={Number(percentage)}
                          value={<span className="tabular-nums">{votingPower > 1 ? `${percentage}%` : `${votes} vote${votes !== 1 ? 's' : ''}`}</span>}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Blockchain Verification */}
            {publishedData && votingEnded && (
              <Notice tone="neutral" icon={<CheckIcon size={20} />} title="Blockchain Verified" className="mt-6">
                <p className="text-gray-700">
                  All votes have been cryptographically verified and recorded on the Cardano blockchain.
                  Results are immutable and publicly auditable.
                </p>
              </Notice>
            )}
          </div>
        )}
      </div>

      {/* Wallet Selection Modal */}
      <WalletModal
        open={showWalletModal}
        subtitle="Choose a wallet to sign the transaction"
        onSelect={connectWalletByName}
        onClose={() => setShowWalletModal(false)}
      />
    </AppShell>
  );
}
