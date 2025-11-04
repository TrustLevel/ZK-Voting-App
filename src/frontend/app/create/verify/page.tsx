'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function VerifyEmail() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // TODO: Send verification email via backend
    // For now, redirect to creation form
    window.location.href = '/create/form';
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <h1 className="text-3xl font-bold text-gray-900">Create Event</h1>
          </div>
          <p className="text-gray-600">Verify your email to create a voting event</p>
        </div>

        {/* Form */}
        <form onSubmit={handleVerify} className="space-y-5">
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
