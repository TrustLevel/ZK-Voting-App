'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';

export default function EventManagement() {
  const params = useParams();
  const eventId = params.id as string;

  // Mock event data - will be replaced with API call
  const [event] = useState({
    id: eventId,
    name: 'Community Feature Voting Q1 2025',
    votingType: 'simple',
    votingPower: 0,
    startDate: '2025-01-15T10:00',
    endDate: '2025-01-31T18:00',
    options: ['Dark Mode Support', 'Mobile App', 'Advanced Analytics'],
    status: 'upcoming', // upcoming, active, ended
    registeredVoters: 12,
    votedCount: 0,
    adminEmail: 'admin@example.com',
  });

  const [registrationLink, setRegistrationLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Set registration link after component mounts (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRegistrationLink(`${window.location.origin}/event/${eventId}`);
    }
  }, [eventId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = () => {
    switch (event.status) {
      case 'upcoming':
        return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">Upcoming</span>;
      case 'active':
        return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Active</span>;
      case 'ended':
        return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">Ended</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 border border-gray-100 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
                {getStatusBadge()}
              </div>
              <p className="text-gray-600">Event Code: <span className="font-mono font-semibold">{eventId}</span></p>
            </div>
            <a href="/" className="text-gray-600 hover:text-gray-900">
              <Image
                src="/TrustLevel_JPG_LOGO.jpg"
                alt="TrustLevel"
                width={60}
                height={60}
              />
            </a>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">{event.registeredVoters}</div>
              <div className="text-sm text-gray-600">Registered Voters</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">{event.votedCount}</div>
              <div className="text-sm text-gray-600">Votes Cast</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">{event.votingType === 'simple' ? '1' : event.votingPower}</div>
              <div className="text-sm text-gray-600">Voting Power</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">{event.options.length}</div>
              <div className="text-sm text-gray-600">Options</div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Event Details */}
            <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Event Details</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Voting Type</label>
                  <p className="text-gray-900 capitalize">{event.votingType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Start Date</label>
                  <p className="text-gray-900">{new Date(event.startDate).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">End Date</label>
                  <p className="text-gray-900">{new Date(event.endDate).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Admin Email</label>
                  <p className="text-gray-900">{event.adminEmail}</p>
                </div>
              </div>
            </div>

            {/* Voting Options */}
            <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Voting Options</h2>
              <div className="space-y-2">
                {event.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <span className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-gray-900">{option}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Registration Link */}
            <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Voter Registration</h2>
              <p className="text-gray-600 text-sm mb-4">
                Share this link with voters to allow them to register and participate in this event.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                <code className="text-sm text-gray-900 break-all">{registrationLink}</code>
              </div>
              <button
                onClick={() => copyToClipboard(registrationLink)}
                className="w-full bg-gray-900 text-white py-3 px-5 rounded-xl hover:bg-gray-800 transition-all font-semibold border border-gray-800 flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Registration Link
                  </>
                )}
              </button>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  className="w-full bg-blue-600 text-white py-3 px-5 rounded-xl hover:bg-blue-700 transition-all font-semibold"
                  disabled={event.status !== 'upcoming'}
                >
                  Deploy Smart Contracts
                </button>
                <button
                  className="w-full bg-white text-gray-900 py-3 px-5 rounded-xl hover:bg-gray-50 transition-all font-semibold border-2 border-gray-300"
                >
                  View Registered Voters
                </button>
                <button
                  className="w-full bg-white text-gray-900 py-3 px-5 rounded-xl hover:bg-gray-50 transition-all font-semibold border-2 border-gray-300"
                  disabled={event.status === 'upcoming'}
                >
                  View Results
                </button>
                {event.status === 'upcoming' && (
                  <button className="w-full bg-red-600 text-white py-3 px-5 rounded-xl hover:bg-red-700 transition-all font-semibold">
                    Delete Event
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
