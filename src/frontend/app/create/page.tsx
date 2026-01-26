'use client';

/**
 * CREATE EVENT PAGE
 *
 * This page allows admins to create a new voting event.
 *
 * Flow:
 * 1. Admin connects their Cardano wallet
 * 2. Backend finds or creates a user record by wallet address
 * 3. Admin configures event: name, voting options, dates, voting power
 * 4. Form submits to backend API to create the event
 * 5. Redirects to /event/{eventId}/manage with admin token
 *
 * Backend API Calls:
 * - POST /users/find-or-create-by-wallet  (find/create admin user)
 * - POST /voting-event                     (create the event)
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useWallet } from '@meshsdk/react';
import { useRouter } from 'next/navigation';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CreateEventForm() {
  const router = useRouter();
  const { connect, connected, wallet, disconnect } = useWallet();

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------

  // Wallet & User State
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [adminUserId, setAdminUserId] = useState<number | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Event Configuration State
  const [eventName, setEventName] = useState('');
  const [votingPower, setVotingPower] = useState<number>(1);
  const [options, setOptions] = useState(['', '']);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // UI State
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // --------------------------------------------------------------------------
  // BACKEND API CALLS
  // --------------------------------------------------------------------------

  /**
   * Find or create a user by wallet address
   * Backend: POST /users/find-or-create-by-wallet
   * Returns: { userId: number }
   */
  const findOrCreateUser = async (walletAddress: string) => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/users/find-or-create-by-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      });

      if (response.ok) {
        const user = await response.json();
        setAdminUserId(user.userId);
      } else {
        setAdminUserId(null);
        console.warn('Failed to find/create user, will use null adminUserId');
      }
    } catch (error) {
      console.error('Failed to find/create user:', error);
      setAdminUserId(null);
    }
  };

  // --------------------------------------------------------------------------
  // EFFECTS / LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Get wallet address when wallet connects and find/create user in backend
   * This runs automatically when user connects their Cardano wallet
   */
  useEffect(() => {
    const getWalletAddressAndUser = async () => {
      if (connected && wallet) {
        try {
          const address = await wallet.getChangeAddress();
          setWalletAddress(address);
          await findOrCreateUser(address);
        } catch (error) {
          console.error('Failed to get wallet address:', error);
          // Fallback: try getUsedAddresses
          try {
            const usedAddresses = await wallet.getUsedAddresses();
            if (usedAddresses?.[0]) {
              setWalletAddress(usedAddresses[0]);
              await findOrCreateUser(usedAddresses[0]);
            }
          } catch (err) {
            console.error('Failed to get used addresses:', err);
          }
        } finally {
          setIsConnecting(false);
        }
      }
    };

    getWalletAddressAndUser();
  }, [connected, wallet]);

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
      setError('');

      await connect(walletName);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setError('Failed to connect wallet. Please try again.');
      setIsConnecting(false);
    }
  };

  /**
   * Add a new empty voting option
   */
  const addOption = () => {
    setOptions([...options, '']);
  };

  /**
   * Remove a voting option (minimum 2 options required)
   */
  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  /**
   * Update the text of a voting option
   */
  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  /**
   * Main form submission handler - Creates a new voting event
   *
   * Backend: POST /voting-event
   * Request Body: {
   *   eventName: string,
   *   options: string[],
   *   votingPower: number,
   *   adminUserId: number | null,
   *   startingDate: number | null,  // POSIX timestamp in seconds
   *   endingDate: number | null      // POSIX timestamp in seconds
   * }
   * Response: {
   *   eventId: number,
   *   adminToken: string,
   *   ... (other event fields)
   * }
   *
   * After successful creation:
   * 1. Stores event data in sessionStorage
   * 2. Redirects to /event/{eventId}/manage?token={adminToken}
   */
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setError('');

    // Validate form
    if (!eventName.trim()) {
      setError('Please enter an event name');
      return;
    }

    // Validate Options
    const filteredOptions = options.filter(o => o.trim() !== '');
    if (filteredOptions.length < 2) {
      setError('Please provide at least 2 voting options');
      return;
    }

    // Validate dates
    if (startDate) {
      const startingTimestamp = new Date(startDate + ':00.000Z').getTime();
      const nowUtc = Date.now();
      if (startingTimestamp < nowUtc) {
        setError('Start date cannot be in the past (UTC time)');
        return;
      }
    }

    if (endDate && startDate) {
      const startingTimestamp = new Date(startDate + ':00.000Z').getTime();
      const endingTimestamp = new Date(endDate + ':00.000Z').getTime();
      if (endingTimestamp <= startingTimestamp) {
        setError('End date must be after start date');
        return;
      }
    }

    // Must be connected to create event
    if (!connected) {
      setShowWalletModal(true);
      return;
    }

    try {
      setIsCreating(true);

      // Convert datetime-local values to POSIX timestamps (seconds)
      // Note: Appending ':00.000Z' forces UTC interpretation of the input
      // Input format: "2025-12-16T15:30" -> "2025-12-16T15:30:00.000Z" (UTC)
      // Output: POSIX timestamp in seconds (not milliseconds)
      const startingDate = startDate ? Math.floor(new Date(startDate + ':00.000Z').getTime() / 1000) : null;
      const endingDate = endDate ? Math.floor(new Date(endDate + ':00.000Z').getTime() / 1000) : null;

      // Create voting event via backend API
      const response = await fetch(`${BACKEND_API_URL}/voting-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: eventName.trim(),
          options: filteredOptions,
          votingPower: votingPower,
          adminUserId,
          startingDate,
          endingDate,
        })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status} ${response.statusText}`);
      }

      const createdEvent = await response.json();
      const eventId = createdEvent.eventId;

      // Store event data in sessionStorage for /manage page to use
      // This allows the manage page to display data immediately without backend call
      // The manage page will also load from backend as a fallback
      sessionStorage.setItem('createdEvent', JSON.stringify({
        eventId,
        eventName,
        walletAddress,
        adminUserId,
        votingPower,
        options: JSON.stringify(filteredOptions),
        startingDate,
        endingDate,
        adminToken: createdEvent.adminToken,
        createdAt: Date.now(),
      }));

      // Redirect to manage page with admin token in URL
      // Admin token is required for accessing the management dashboard
      router.push(`/event/${eventId}/manage?token=${createdEvent.adminToken}`);
    } catch (error) {
      console.error('Failed to create event:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create event.';
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  // --------------------------------------------------------------------------
  // RENDER / UI
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
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

          {/* Header Section */}
          <div className="mb-12">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
              <div className="flex items-center justify-center gap-3">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Create New Voting Event</h1>
                  <p className="text-sm text-gray-600">Configure your voting event parameters</p>
                </div>
              </div>
            </div>
          </div>

          {/* Connect Wallet Section */}
          {!connected ? (
            <div className="mb-8">
              <div className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <h3 className="font-bold text-gray-900">Connect your Cardano wallet</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWalletModal(true)}
                  disabled={isConnecting}
                  className="w-full bg-gray-900 text-white py-3 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Wallet Connected</div>
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
          )}

          <form onSubmit={handleCreateEvent} className="space-y-6">
            {/* Voting Configuration */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <h3 className="font-bold text-gray-900">Voting Configuration</h3>
              </div>

              {/* Event Name */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Event Name</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:border-transparent transition text-gray-900 placeholder:text-gray-500 ${
                    error && !error.includes('date') && !error.includes('Date') ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-gray-900'
                  }`}
                  placeholder="e.g., Q1 2025 Community Feature Voting"
                />
                {error && !error.includes('date') && !error.includes('Date') && (
                  <p className="mt-2 text-sm text-red-700 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </p>
                )}
              </div>

              {/* Voting Power */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-3">Voting Type</label>
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="mt-3">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Total Voting Power
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

              {/* Voting Options */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Voting Options (minimum 2 required)
                </label>
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
                          className="px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition border-2 border-red-200"
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
            </div>

            {/* Voting Period */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="font-bold text-gray-900">Voting Period</h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Set the planned start and end dates for your voting event (UTC timezone).
              </p>

              {error && (error.includes('date') || error.includes('Date')) && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Start Date & Time (UTC)
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
                    End Date & Time (UTC)
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

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={!connected || isConnecting || isCreating}
                className="flex-1 bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold border border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Event...
                  </>
                ) : (
                  'Create Event'
                )}
              </button>
              <a
                href="/"
                className="flex-1 text-center bg-white text-gray-900 py-4 px-6 rounded-xl hover:bg-gray-50 transition-all font-semibold border-2 border-gray-300"
              >
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">Choose a wallet to create your voting event</p>

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
