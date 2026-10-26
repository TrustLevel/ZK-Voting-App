'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';
const AUTO_REFRESH_INTERVAL_MS = 30000;

interface ResultOption {
  index: number;
  text: string;
  votes: number;
}

interface ResultsData {
  status: 'not_deployed' | 'live' | 'ended';
  eventName: string;
  startingDate: number | null;
  endingDate: number | null;
  options: ResultOption[];
}

export default function ResultsPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResults = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch(`${BACKEND_API_URL}/voting-event/${eventId}/results`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message || `Error ${res.status}`);
      }
      const json: ResultsData = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load results');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  // Initial load
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Auto-refresh every 30s while voting is live
  useEffect(() => {
    if (data?.status !== 'live') return;
    const id = setInterval(() => fetchResults(), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [data?.status, fetchResults]);

  const totalVotes = data?.options.reduce((sum, o) => sum + o.votes, 0) ?? 0;
  const sorted = data ? [...data.options].sort((a, b) => b.votes - a.votes) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading results...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white border-2 border-red-200 rounded-xl p-8 max-w-md w-full text-center">
          <p className="text-red-700 font-semibold mb-2">Could not load results</p>
          <p className="text-sm text-red-500 mb-4">{error}</p>
          <button
            onClick={() => fetchResults(true)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link href={`/event/${eventId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">
            ← Back to event
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{data?.eventName}</h1>
          <p className="text-sm text-gray-500 mt-1">Voting results — on-chain data</p>
        </div>

        {/* Status banner */}
        {data?.status === 'not_deployed' && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-yellow-800 font-semibold text-sm">Voting not started yet</p>
            <p className="text-yellow-700 text-sm mt-1">The event has not been deployed to the blockchain. Results will appear once voting begins.</p>
          </div>
        )}

        {data?.status === 'live' && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-blue-800 font-semibold text-sm">Voting in progress</p>
              {data.endingDate && (
                <p className="text-blue-700 text-sm mt-0.5">
                  Ends {new Date(data.endingDate * 1000).toLocaleString()}
                </p>
              )}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-blue-600">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Auto-refreshing
            </span>
          </div>
        )}

        {data?.status === 'ended' && (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6">
            <p className="text-green-800 font-semibold text-sm">Voting ended</p>
            {data.endingDate && (
              <p className="text-green-700 text-sm mt-0.5">
                Closed {new Date(data.endingDate * 1000).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-gray-900">Results by option</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {totalVotes} total vote{totalVotes !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => fetchResults(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshing ? (
                <svg className="animate-spin h-3.5 w-3.5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh
            </button>
          </div>

          {data?.status === 'not_deployed' ? (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          ) : (
            <div className="space-y-4">
              {sorted.map((opt, rank) => {
                const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                const isWinner = rank === 0 && opt.votes > 0 && data?.status === 'ended';
                return (
                  <div key={opt.index}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                        {isWinner && <span className="text-yellow-500 text-xs">★</span>}
                        {opt.text}
                      </span>
                      <span className="text-sm text-gray-500">
                        {opt.votes} vote{opt.votes !== 1 ? 's' : ''} · {pct}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${isWinner ? 'bg-yellow-400' : 'bg-gray-800'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-4 text-right">
              Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Transparency note */}
        <p className="text-xs text-gray-400 text-center">
          Results are read directly from the Cardano blockchain and cannot be altered.
        </p>
      </div>
    </div>
  );
}
