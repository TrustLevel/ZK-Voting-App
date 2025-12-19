'use client';

import { useEffect } from 'react';

/**
 * INFO PAGE - Redirect to GitBook Documentation
 * Automatically redirects users to the ZK Voting App knowledge base
 */
export default function Info() {
  useEffect(() => {
    // Redirect to GitBook documentation
    window.location.href = 'https://trustlevel.gitbook.io/knowledge-base/tools-and-apps/zk-voting-app';
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-gray-900 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to documentation...</p>
      </div>
    </div>
  );
}
