'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function ManageEvent() {
  const [eventCode, setEventCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleManage = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!eventCode.trim()) {
      setError('Please enter an event code');
      return;
    }

    if (!email.trim()) {
      setError('Please enter your admin email address');
      return;
    }

    // TODO: Verify with backend that this email is the admin of this event
    // For now, redirect to management page
    window.location.href = `/event/${eventCode}/manage`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h1 className="text-3xl font-bold text-gray-900">Manage Event</h1>
          </div>
          <p className="text-gray-600">Enter your event code and admin email</p>
        </div>

        {/* Form */}
        <form onSubmit={handleManage} className="space-y-5">
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
              Admin Email Address
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

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

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
