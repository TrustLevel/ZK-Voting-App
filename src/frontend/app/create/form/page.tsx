'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useWallet } from '@meshsdk/react';
import { useRouter } from 'next/navigation';

// Generate a unique event ID (temporary - should come from backend)
const generateEventId = () => {
  return 'event_' + Math.random().toString(36).substring(2, 15) + Date.now();
};

export default function CreateEventForm() {
  const router = useRouter();
  const { connect, connected, wallet, disconnect } = useWallet();
  const [eventName, setEventName] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [error, setError] = useState('');

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

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setError('');

    // Validate form
    if (!eventName.trim()) {
      setError('Please enter an event name');
      return;
    }

    // Must be connected to create event
    if (!connected) {
      setShowWalletModal(true);
      return;
    }

    try {
      setIsCreating(true);

      // Generate event ID and admin token
      const eventId = generateEventId();

      // Generate admin token (secure random string)
      const adminToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('Creating event:', {
        eventId,
        eventName,
        walletAddress,
      });

      // TODO: Send to backend API to create event
      // const response = await fetch('/api/events/create', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     eventName,
      //     walletAddress,
      //     adminToken,
      //   })
      // });
      // const { eventId } = await response.json();

      // Store minimal event data in sessionStorage
      sessionStorage.setItem('createdEvent', JSON.stringify({
        eventId,
        eventName,
        adminToken,
        walletAddress,
        createdAt: Date.now(),
      }));

      // Navigate to dashboard
      router.push(`/manage/${eventId}?adminToken=${adminToken}`);
    } catch (error) {
      console.error('Failed to create event:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create event. Please try again.';
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-8">
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
          <div className="text-center mb-12">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Create Nsew Voting Event</h1>
              <p className="text-gray-500 text-sm max-w-2xl mx-auto">
                Connect your wallet and name your voting event to get started.
              </p>
            </div>
          </div>

          {/* Connect Wallet Section */}
          {!connected ? (
            <div className="mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-8">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Connect Your Wallet</h2>
                  <p className="text-gray-600 text-sm">Connect your Cardano wallet to create voting events</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWalletModal(true)}
                  disabled={isConnecting}
                  className="w-full bg-gray-900 text-white py-4 px-6 rounded-xl hover:bg-gray-800 transition-all font-semibold border border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-8">
              <div className="flex items-center justify-between p-4 bg-green-50 border-2 border-green-200 rounded-xl">
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
            {/* Event Name */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Event Name</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition text-gray-900 placeholder:text-gray-500 ${
                  error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-gray-900'
                }`}
                placeholder="e.g., Q1 2025 Community Feature Voting"
              />
              {error && (
                <p className="mt-2 text-sm text-red-700 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}
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
