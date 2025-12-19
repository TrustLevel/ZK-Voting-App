'use client';

import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl p-8 md:p-12 border border-gray-100">
        {/* Logo Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-8">
            <Image
              src="/TrustLevel_JPG_LOGO.jpg"
              alt="TrustLevel"
              width={400}
              height={400}
            />
          </div>
          <div className="inline-flex items-center gap-3 border-2 border-gray-300 rounded-full px-6 py-3">
            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-xl font-semibold text-gray-900">Anonymous & Verifiable Voting</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="space-y-3 max-w-sm mx-auto">
          <a
            href="/create"
            className="w-full bg-gray-900 text-white py-3 px-5 rounded-xl hover:bg-gray-800 transition-all font-semibold text-base flex items-center justify-center gap-2 border border-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Event
          </a>

          <a
            href="/info"
            className="block w-full text-center text-gray-600 hover:text-gray-900 py-2 transition font-medium text-sm mt-2"
          >
            Learn more →
          </a>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
            <span>Powered by</span>
            <Image src="/cf-logo.svg" alt="Cardano" width={20} height={20} />
            <span className="font-semibold">Cardano</span>
          </div>
        </div>
      </div>
    </div>
  );
}
