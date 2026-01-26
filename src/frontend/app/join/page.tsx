// not used at the moment

'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function JoinEvent() {
  const [eventCode, setEventCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!eventCode.trim()) {
      setError('Please enter an event code');
      return;
    }

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Redirect to event page
    window.location.href = `/event/${eventCode}`;
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 md:p-10 border border-gray-100">
        {/* Logo */}
        <div className="text-center mb-8">
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

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <svg className="w-8 h-8 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <h1 className="text-3xl font-bold text-gray-900">Join Event</h1>
          </div>
          <p className="text-gray-600">Enter your event code and email to participate</p>
        </div>

        {/* Form */}
        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <label htmlFor="eventCode" className="block text-sm font-medium text-gray-700 mb-2">
              Event Code
            </label>
            <input
              id="eventCode"
              type="text"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              placeholder="Enter event code"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900 placeholder:text-gray-500"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent transition text-gray-900 placeholder:text-gray-500"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-3 px-5 rounded-xl hover:bg-gray-800 transition-all font-semibold border border-gray-800"
          >
            Continue
          </button>
        </form>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <a href="/" className="text-gray-600 hover:text-gray-900 text-sm font-medium">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}