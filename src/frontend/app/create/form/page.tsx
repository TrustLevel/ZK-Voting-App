'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useWallet } from '@meshsdk/react';
import { BrowserWallet } from '@meshsdk/core';

export default function CreateEventForm() {
  const { connect, connected, wallet, disconnect } = useWallet();
  const [eventName, setEventName] = useState('');
  const [votingType, setVotingType] = useState<'simple' | 'weighted'>('simple');
  const [weight, setWeight] = useState(100);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous errors
    setErrors({});
    const newErrors: {[key: string]: string} = {};

    // Validate form
    if (!eventName.trim()) {
      newErrors.eventName = 'Please enter an event name';
    }
    if (!startDate) {
      newErrors.startDate = 'Please select a start date';
    }
    if (!endDate) {
      newErrors.endDate = 'Please select an end date';
    }
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      newErrors.endDate = 'End date must be after start date';
    }

    const filteredOptions = options.filter(o => o.trim() !== '');
    if (filteredOptions.length < 2) {
      newErrors.options = 'Please provide at least 2 voting options';
    }

    // Show errors if any
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // If not connected, show wallet selection modal
    if (!connected) {
      setShowWalletModal(true);
      return;
    }

    // Connected - proceed with event creation
    try {
      setIsCreating(true);

      // Prepare event data for signing
      const eventData = {
        eventName,
        votingType,
        weight: votingType === 'weighted' ? weight : 0,
        startDate,
        endDate,
        options: filteredOptions,
        creatorAddress: walletAddress,
      };

      console.log('Event data to sign:', eventData);

      // TODO: Sign the event data with wallet
      // const signature = await wallet.signData(...);

      // TODO: Send to backend API
      // await fetch('/api/events/create', { method: 'POST', body: JSON.stringify({ eventData, signature }) });

      alert('Event creation with wallet signature will be implemented with backend integration');

      // For now, redirect to manage page
      // window.location.href = '/manage';
    } catch (error) {
      console.error('Failed to create event:', error);
      alert('Failed to create event. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

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

          {/* Header Section */}
          <div className="text-center mb-12">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Create Voting Event</h1>
              <p className="text-gray-500 text-sm max-w-2xl mx-auto">
                <span className="text-gray-900 font-semibold">Step 1:</span> Configure voting parameters and publish your voting event on the Cardano blockchain.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Name */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">Event Name</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition text-gray-900 placeholder:text-gray-500 ${
                  errors.eventName ? 'border-yellow-500 focus:ring-yellow-500' : 'border-gray-300 focus:ring-gray-900'
                }`}
                placeholder="e.g., Community Feature Voting Q1 2025"
              />
              {errors.eventName && (
                <p className="mt-2 text-sm text-yellow-700 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.eventName}
                </p>
              )}
            </div>

            {/* Voting Type */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3">Voting Type</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`relative flex items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition ${
                  votingType === 'simple' ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                }`}>
                  <input
                    type="radio"
                    value="simple"
                    checked={votingType === 'simple'}
                    onChange={(e) => setVotingType(e.target.value as 'simple')}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">Simple</div>
                    <div className="text-sm text-gray-600">1 vote per person</div>
                  </div>
                </label>
                <label className={`relative flex items-center justify-center p-4 border-2 rounded-xl cursor-pointer transition ${
                  votingType === 'weighted' ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                }`}>
                  <input
                    type="radio"
                    value="weighted"
                    checked={votingType === 'weighted'}
                    onChange={(e) => setVotingType(e.target.value as 'weighted')}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">Weighted</div>
                    <div className="text-sm text-gray-600">Distribute voting power</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Weight (only for weighted voting) */}
            {votingType === 'weighted' && (
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Voting Power (total points to distribute)
                </label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900"
                  min="1"
                  required
                />
              </div>
            )}

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900 ${
                    errors.startDate ? 'border-yellow-500 focus:ring-yellow-500' : 'border-gray-300'
                  }`}
                />
                {errors.startDate && (
                  <p className="mt-2 text-sm text-yellow-700 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.startDate}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900 ${
                    errors.endDate ? 'border-yellow-500 focus:ring-yellow-500' : 'border-gray-300'
                  }`}
                />
                {errors.endDate && (
                  <p className="mt-2 text-sm text-yellow-700 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.endDate}
                  </p>
                )}
              </div>
            </div>

            {/* Voting Options */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3">Voting Options</label>
              {errors.options && (
                <p className="mb-3 text-sm text-yellow-700 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.options}
                </p>
              )}
              <div className="space-y-3">
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className={`flex-1 px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition text-gray-900 placeholder:text-gray-500 ${
                        errors.options ? 'border-yellow-500 focus:ring-yellow-500' : 'border-gray-300 focus:ring-gray-900'
                      }`}
                      placeholder={`Option ${index + 1}`}
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        className="px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition border border-red-200"
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

            {/* Wallet Status */}
            {connected && walletAddress && (
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
            )}

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={isConnecting || isCreating}
                className="flex-1 bg-gray-900 text-white py-3 px-5 rounded-xl hover:bg-gray-800 transition-all font-semibold border border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConnecting ? 'Connecting Wallet...' : isCreating ? 'Creating Event...' : connected ? 'Create Event' : 'Connect Wallet & Create'}
              </button>
              <a
                href="/"
                className="flex-1 text-center bg-white text-gray-900 py-3 px-5 rounded-xl hover:bg-gray-50 transition-all font-semibold border-2 border-gray-300"
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
            <p className="text-gray-600 mb-6">Choose a wallet to sign and create your voting event</p>

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
