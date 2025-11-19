'use client';

import { useState } from 'react';

export default function EventDetail() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [identitySecret, setIdentitySecret] = useState('');
  const [nullifierSecret, setNullifierSecret] = useState('');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const mockEvent = {
    id: '1',
    name: 'Community Feature Voting Q1 2025',
    votingType: 'simple',
    endDate: '2025-01-31',
    options: [
      { index: 0, text: 'Dark Mode Support', votes: 42 },
      { index: 1, text: 'Mobile App', votes: 38 },
      { index: 2, text: 'Advanced Analytics', votes: 25 },
    ],
  };

  const handleRegister = () => {
    // Generate secrets (placeholder)
    const genIdentity = Math.random().toString(36).substring(2, 15);
    const genNullifier = Math.random().toString(36).substring(2, 15);
    setIdentitySecret(genIdentity);
    setNullifierSecret(genNullifier);
    setIsRegistered(true);
  };

  const downloadSecrets = () => {
    const data = `Identity Secret: ${identitySecret}\nNullifier Secret: ${nullifierSecret}`;
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voting-secrets.txt';
    a.click();
  };

  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{mockEvent.name}</h1>
            <p className="text-gray-600 mb-8">Register to participate in this voting event</p>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> You will receive identity and nullifier secrets. Save them securely - you&apos;ll need them to vote!
              </p>
            </div>

            <button
              onClick={handleRegister}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Register for Event
            </button>

            <a href="/" className="inline-block mt-6 text-blue-600 hover:text-blue-700 font-medium">
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Secrets Display */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-900 mb-4">Registration Successful!</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Identity Secret</label>
              <code className="block bg-white p-3 rounded border text-sm break-all">{identitySecret}</code>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nullifier Secret</label>
              <code className="block bg-white p-3 rounded border text-sm break-all">{nullifierSecret}</code>
            </div>
          </div>
          <button
            onClick={downloadSecrets}
            className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition"
          >
            Download Secrets
          </button>
        </div>

        {/* Voting Section */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{mockEvent.name}</h1>
          <p className="text-gray-600 mb-6">Type: {mockEvent.votingType} | Ends: {mockEvent.endDate}</p>

          <div className="space-y-3 mb-8">
            {mockEvent.options.map((option) => (
              <div
                key={option.index}
                onClick={() => setSelectedOption(option.index)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                  selectedOption === option.index
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{option.text}</span>
                  <span className="text-gray-600">{option.votes} votes</span>
                </div>
              </div>
            ))}
          </div>

          <button
            disabled={selectedOption === null}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Submit Vote
          </button>
        </div>

        <a href="/" className="inline-block text-blue-600 hover:text-blue-700 font-medium">
          ← Back to Home
        </a>
      </div>
    </div>
  );
}