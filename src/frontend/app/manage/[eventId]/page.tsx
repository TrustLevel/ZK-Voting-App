'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { useWallet } from '@meshsdk/react';

// Backend API endpoint (placeholder until backend is deployed)
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';

interface CreatedEvent {
  eventId: number; // Changed from string to number
  adminLink: string;
  adminToken: string;
  eventName: string;
  votingPower?: number | null; // 1 = simple, >1 = weighted
  options?: string | null; // JSON string array
  startingDate?: number | null; // POSIX timestamp
  endingDate?: number | null; // POSIX timestamp
}

interface Participant {
  userId: number;
  commitment: string;
  email?: string; // Optional: for frontend display, fetched from User API
  status?: 'pending' | 'registered';
  registeredAt?: Date;
}

type Tab = 'parameters' | 'participants' | 'start' | 'results';

// Reusable Loading Spinner Component
const LoadingSpinner = () => (
  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export default function EventDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventId = params.eventId as string;
  const adminToken = searchParams.get('adminToken');

  // Wallet connection
  const { connect, connected, wallet, disconnect } = useWallet();
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('parameters');
  const [createdEvent, setCreatedEvent] = useState<CreatedEvent | null>(null);
  const [copiedAdmin, setCopiedAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newParticipantEmail, setNewParticipantEmail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  // Voting Parameters (editable)
  const [votingPower, setVotingPower] = useState<number>(1); // 1 = simple, >1 = weighted
  const [options, setOptions] = useState(['', '']);
  const [isSaving, setIsSaving] = useState(false);

  // Get wallet address when wallet is connected
  useEffect(() => {
    const getWalletAddress = async () => {
      if (connected && wallet) {
        try {
          const address = await wallet.getChangeAddress();
          setWalletAddress(address);
          console.log('Connected wallet address:', address);
        } catch (error) {
          console.error('Failed to get wallet address:', error);
          // Fallback: try getUsedAddresses
          try {
            const usedAddresses = await wallet.getUsedAddresses();
            if (usedAddresses && usedAddresses.length > 0) {
              setWalletAddress(usedAddresses[0]);
              console.log('Connected wallet address (used):', usedAddresses[0]);
            }
          } catch (err) {
            console.error('Failed to get used addresses:', err);
          }
        } finally {
          setIsConnecting(false);
        }
      }
    };

    getWalletAddress();
  }, [connected, wallet]);

  const connectWalletByName = async (walletName: string) => {
    try {
      setIsConnecting(true);
      setShowWalletModal(false);

      await connect(walletName);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      alert('Failed to connect wallet. Please try again.');
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    // TODO: Fetch from backend API using eventId and validate adminToken
    // Backend endpoint: GET /voting-event/:eventId
    const loadEvent = async () => {
      console.log('Loading event:', eventId);
      console.log('Admin token:', adminToken);

      try {
        // TODO: Enable backend API call when deployed
        // const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`);
        // if (!response.ok) {
        //   throw new Error('Failed to load event');
        // }
        // const eventData = await response.json();

        // Temporarily create mock data for local development
        const mockData: CreatedEvent = {
          eventId: parseInt(eventId as string) || 1, // Parse string eventId to number
          adminLink: `${window.location.origin}/manage/${eventId}?adminToken=mocktoken123`,
          adminToken: 'mocktoken123',
          eventName: 'Q1 2025 Community Feature Voting',
          votingPower: 100, // Weighted voting with 100 points
          options: JSON.stringify([
            'Add Dark Mode',
            'Implement Multi-Language Support',
            'Create Mobile App',
            'Add Export to PDF Feature'
          ]), // Store as JSON string
          startingDate: null, // Not set yet
          endingDate: null, // Not set yet
        };

        setCreatedEvent(mockData);

        // Parse options for frontend display if they exist
        if (mockData.options) {
          const parsedOptions = JSON.parse(mockData.options);
          setOptions(parsedOptions);
        }

        // Set voting power
        if (mockData.votingPower) {
          setVotingPower(mockData.votingPower);
        }

        setIsAuthorized(true);
      } catch (error) {
        console.error('Failed to load event:', error);
        setIsAuthorized(false);
      }
    };

    loadEvent();
  }, [eventId, adminToken]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAdmin(true);
      setTimeout(() => setCopiedAdmin(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

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

    // TODO: Backend integration
    // 1. Look up or create User by email → get userId
    // 2. Generate commitment for this user
    // 3. Call: POST /voting-event/:eventId/participants { userId, commitment }
    // 4. Backend will add to groupLeafCommitments and update merkle root

    // PLACEHOLDER: Generate mock userId and commitment for now
    const mockUserId = Math.floor(Math.random() * 10000);
    const mockCommitment = BigInt(Math.floor(Math.random() * 1000000)).toString();

    console.log('Adding participant (placeholder):', {
      email: newParticipantEmail.trim(),
      userId: mockUserId,
      commitment: mockCommitment,
      eventId: createdEvent?.eventId,
    });

    // Add to local state
    setParticipants([...participants, {
      userId: mockUserId,
      commitment: mockCommitment,
      email: newParticipantEmail.trim(),
      status: 'pending',
    }]);

    setNewParticipantEmail('');
  };

  const removeParticipant = async (userId: number, email?: string) => {
    // TODO: Backend integration
    // Call: DELETE /voting-event/:eventId/participants/:userId
    // Backend will remove from groupLeafCommitments and rebuild merkle root

    console.log('Removing participant (placeholder):', {
      userId,
      email,
      eventId: createdEvent?.eventId,
    });

    setParticipants(participants.filter(p => p.userId !== userId));
  };

  // Voting Parameters Functions
  const addOption = () => {
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSaveParameters = async () => {
    // Validate
    const filteredOptions = options.filter(o => o.trim() !== '');
    if (filteredOptions.length < 2) {
      alert('Please provide at least 2 voting options');
      return;
    }

    // Validate voting power
    if (votingPower < 1) {
      alert('Voting power must be at least 1');
      return;
    }

    setIsSaving(true);

    try {
      // Convert options array to JSON string for backend
      const optionsJson = JSON.stringify(filteredOptions);

      // TODO: Send to backend API
      // Backend endpoint: PATCH /voting-event/:eventId (or PUT)
      // Payload: { votingPower, options (JSON string) }
      console.log('Saving parameters to backend (placeholder):', {
        eventId: createdEvent?.eventId,
        votingPower,
        options: optionsJson,
      });

      // TODO: Enable backend API call when deployed
      // const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     votingPower,
      //     options: optionsJson,
      //     adminToken // TODO: Replace with proper auth
      //   })
      // });
      // if (!response.ok) throw new Error('Failed to save parameters');

      // Update local state
      if (createdEvent) {
        setCreatedEvent({
          ...createdEvent,
          votingPower,
          options: optionsJson,
        });
      }

      alert('Voting parameters saved successfully!');
    } catch (error) {
      console.error('Failed to save parameters:', error);
      alert('Failed to save parameters. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartVoting = async () => {
    // Validation
    if (!startDate || !endDate) {
      alert('Please select both start and end dates');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
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

    setIsStarting(true);

    try {
      // Convert dates to POSIX timestamps (seconds since epoch)
      const startingDate = Math.floor(start.getTime() / 1000);
      const endingDate = Math.floor(end.getTime() / 1000);

      // Prepare voting start data for blockchain
      const votingStartData = {
        eventId: createdEvent?.eventId,
        eventName: createdEvent?.eventName,
        startingDate, // POSIX timestamp
        endingDate, // POSIX timestamp
        walletAddress: walletAddress,
        timestamp: Date.now(),
      };

      console.log('Preparing to sign voting start data:', votingStartData);

      // Create message to sign (JSON string of the data)
      const messageToSign = JSON.stringify({
        eventId: votingStartData.eventId,
        eventName: votingStartData.eventName,
        startingDate: votingStartData.startingDate,
        endingDate: votingStartData.endingDate,
        walletAddress: votingStartData.walletAddress,
        timestamp: votingStartData.timestamp,
      });

      // Sign with wallet
      console.log('Requesting wallet signature...');

      // Convert message to hex format for signing
      const messageHex = Buffer.from(messageToSign, 'utf8').toString('hex');

      // Sign data - wallet.signData expects hex payload
      const signedData = await wallet.signData(messageHex);

      console.log('Wallet signature obtained:', {
        signature: signedData.signature,
        key: signedData.key,
      });

      // TODO: Send to backend API
      // Backend endpoint: PATCH /voting-event/:eventId
      // Payload: { startingDate (POSIX), endingDate (POSIX) }
      console.log('Sending to backend (placeholder):', {
        eventId: createdEvent?.eventId,
        startingDate,
        endingDate,
        signature: signedData.signature,
        publicKey: signedData.key,
      });

      // TODO: Enable backend API call when deployed
      // const response = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     startingDate,
      //     endingDate,
      //     signature: signedData.signature,
      //     publicKey: signedData.key,
      //     adminToken // TODO: Replace with proper auth
      //   })
      // });
      // if (!response.ok) throw new Error('Failed to start voting event');

      // Update local state
      if (createdEvent) {
        setCreatedEvent({
          ...createdEvent,
          startingDate,
          endingDate,
        });
      }

      // Store published data for display
      setPublishedData({
        signature: signedData.signature,
        publicKey: signedData.key,
        eventId: votingStartData.eventId?.toString() || '',
        eventName: votingStartData.eventName || '',
        startingDate: votingStartData.startingDate,
        endingDate: votingStartData.endingDate,
        walletAddress: walletAddress,
        timestamp: votingStartData.timestamp,
      });

      alert('Voting event started successfully! The event is now live on the blockchain.');

    } catch (error) {
      console.error('Error starting voting:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start voting event';
      alert(`Failed to start voting event: ${errorMessage}`);
    } finally {
      setIsStarting(false);
    }
  };

  // Unauthorized screen
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 border border-gray-100 max-w-md">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600 mb-6">
              You need a valid admin token to access this event dashboard. Please use the admin link provided when you created the event.
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading event...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-8">
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
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
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
                    Use this admin link to access your event dashboard. Keep it secure.
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs font-mono text-gray-700 truncate">
                      {createdEvent.adminLink}
                    </p>
                    <button
                      onClick={() => copyToClipboard(createdEvent.adminLink)}
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
                      : publishedData ? 'bg-gray-900' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {publishedData ? (
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
                <div className={`w-12 h-px ${publishedData ? 'bg-gray-300' : 'bg-gray-200'}`}></div>

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
                {/* Voting Configuration */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Voting Configuration</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Choose the voting type and configure settings for your event.
                  </p>

                  {/* Voting Power */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-900 mb-3">Voting Power</label>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <label className={`relative flex items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition ${
                        votingPower === 1 ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                        <input
                          type="radio"
                          checked={votingPower === 1}
                          onChange={() => setVotingPower(1)}
                          className="sr-only"
                        />
                        <div className="text-center">
                          <div className="font-semibold text-gray-900">Simple</div>
                          <div className="text-sm text-gray-600">1 vote per person</div>
                        </div>
                      </label>
                      <label className={`relative flex items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition ${
                        votingPower > 1 ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                        <input
                          type="radio"
                          checked={votingPower > 1}
                          onChange={() => setVotingPower(100)}
                          className="sr-only"
                        />
                        <div className="text-center">
                          <div className="font-semibold text-gray-900">Weighted</div>
                          <div className="text-sm text-gray-600">Distribute voting power</div>
                        </div>
                      </label>
                    </div>

                    {/* Voting Power Input (shown for weighted voting) */}
                    {votingPower > 1 && (
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Total Voting Power (points to distribute across options)
                        </label>
                        <input
                          type="number"
                          value={votingPower}
                          onChange={(e) => setVotingPower(parseInt(e.target.value) || 1)}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900"
                          min="2"
                          placeholder="e.g., 100"
                        />
                        <p className="mt-2 text-xs text-gray-600">
                          Voters can distribute these {votingPower} points across multiple options.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Voting Options */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Voting Options</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Add the options participants can vote for. At least 2 options are required.
                  </p>
                  <div className="space-y-3">
                    {options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updateOption(index, e.target.value)}
                          className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900 placeholder:text-gray-500"
                          placeholder={`Option ${index + 1}`}
                        />
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(index)}
                            className="px-4 py-3 text-yellow-600 hover:bg-yellow-50 rounded-xl transition border-2 border-yellow-200"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={addOption}
                    className="mt-3 text-gray-900 hover:text-gray-700 font-medium flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Option
                  </button>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveParameters}
                  disabled={isSaving}
                  className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <LoadingSpinner />
                      Saving Parameters...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Save Parameters
                    </>
                  )}
                </button>
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
                              ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* Status Icon */}
                            {participant.status === 'registered' && (
                              <div className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 bg-green-500">
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
                              {/* Show userId for debugging/reference */}
                              <p className="text-xs text-gray-500 mt-1">
                                User ID: {participant.userId} | Commitment: {participant.commitment.slice(0, 8)}...
                              </p>
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
              </div>
            )}

            {/* Start Voting Tab */}
            {activeTab === 'start' && (
              <div>
                {/* Published Data - Show after successful signing */}
                {publishedData ? (
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
                              <div className="font-medium">{new Date(publishedData.startingDate * 1000).toLocaleString()}</div>
                              <div className="text-[10px] font-mono text-gray-600 mt-1">POSIX: {publishedData.startingDate}</div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-gray-600 font-semibold mb-1">Ending Date</label>
                            <div className="bg-gray-50 rounded p-2 text-gray-900">
                              <div className="font-medium">{new Date(publishedData.endingDate * 1000).toLocaleString()}</div>
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
                      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                {/* Date Configuration */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Voting Period</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Configure start and end dates for your voting event.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Start Date */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Start Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900"
                      />
                    </div>

                    {/* End Date */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        End Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900"
                      />
                    </div>
                  </div>
                </div>

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
                          <span className="text-gray-900">{Math.floor(new Date(startDate).getTime() / 1000)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Ending Date (POSIX):</span>
                          <span className="text-gray-900">{Math.floor(new Date(endDate).getTime() / 1000)}</span>
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
                      <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      Signing with Wallet...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Sign with Wallet & Start Voting
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

                {/* Voting Statistics */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Voting Statistics</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Summary of voting activity and participation.
                  </p>

                  <div className="flex items-center text-sm gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-gray-600">Voting ended:</span>
                      <span className="font-semibold text-gray-900">
                        {publishedData ? new Date(publishedData.endingDate * 1000).toLocaleString() : 'Not ended yet'}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Total Votes:</span>
                      <span className="font-semibold text-gray-900">
                        {(() => {
                          const mockTotalVotes = 127;
                          return mockTotalVotes;
                        })()}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Registered Voters:</span>
                      <span className="font-semibold text-gray-900">
                        {participants.filter(p => p.status === 'registered').length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Voting Results */}
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <h3 className="font-bold text-gray-900">Results by Option</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Vote distribution across all options, sorted by popularity.
                  </p>

                  {(() => {
                    // Generate mock results based on options
                    const filteredOptions = options.filter(o => o.trim() !== '');
                    const mockTotalVotes = 127;

                    // Generate realistic vote distribution (winner gets most votes)
                    const mockResults = filteredOptions.map((option, index) => {
                      let votes: number;
                      if (index === 0) votes = 52; // Winner
                      else if (index === 1) votes = 38;
                      else if (index === 2) votes = 24;
                      else if (index === 3) votes = 13;
                      else votes = Math.floor(Math.random() * 10) + 5;

                      return {
                        option,
                        votes,
                        percentage: ((votes / mockTotalVotes) * 100).toFixed(1)
                      };
                    });

                    // Sort by votes (descending)
                    mockResults.sort((a, b) => b.votes - a.votes);

                    return (
                      <div className="space-y-2">
                        {mockResults.map((result, index) => {
                          return (
                            <div
                              key={index}
                              className="border-2 rounded-lg p-3 border-gray-200 bg-white"
                            >
                              {/* Option Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm text-gray-900">
                                    {result.option}
                                  </h4>
                                </div>
                                <div className="text-right">
                                  {votingPower > 1 ? (
                                    <div className="text-sm font-bold text-gray-900">
                                      {result.percentage}%
                                    </div>
                                  ) : (
                                    <div className="text-sm font-bold text-gray-900">
                                      {result.votes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Blockchain Verification */}
                {publishedData && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mt-6">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <div className="flex-1">
                        <h4 className="font-bold text-blue-900 mb-2">Blockchain Verified</h4>
                        <p className="text-sm text-blue-800 mb-3">
                          All votes have been cryptographically verified and recorded on the Cardano blockchain.
                          Results are immutable and publicly auditable.
                        </p>
                        <div className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="text-xs space-y-2">
                            <div>
                              <span className="text-blue-700 font-semibold">Event ID:</span>
                              <span className="ml-2 font-mono text-gray-900">{publishedData.eventId}</span>
                            </div>
                            <div>
                              <span className="text-blue-700 font-semibold">Signature:</span>
                              <div className="font-mono text-gray-900 break-all mt-1 text-[10px]">
                                {publishedData.signature}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Download Results */}
                <div className="mt-6 flex gap-3">
                  <button className="flex-1 bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Results (CSV)
                  </button>
                  <button className="flex-1 bg-white text-gray-900 py-4 px-6 rounded-xl hover:bg-gray-50 transition-all font-semibold border-2 border-gray-300 flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share Results
                  </button>
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
