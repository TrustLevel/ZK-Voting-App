'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NetworkBadge } from '@/components/NetworkBadge';
import { AppShell, PageIntro } from '@/components/AppShell';
import { Button } from '@/components/Button';
import { Card, CardHeader, Notice } from '@/components/Card';
import { ArrowLeftIcon, ChartIcon, RefreshIcon, Spinner } from '@/components/Icons';
import { InfoButton } from '@/components/InfoButton';
import { INFO } from '@/components/infoTexts';
import { ResultRow } from '@/components/ResultRow';
import { StatusPill } from '@/components/StatusPill';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000';
const AUTO_REFRESH_INTERVAL_MS = 30000;

interface ResultOption {
  index: number;
  text: string;
  votes: number;
}

interface ResultsData {
  status: 'not_deployed' | 'upcoming' | 'live' | 'ended';
  eventName: string;
  network?: 'mainnet' | 'preprod';
  startingDate: number | null;
  endingDate: number | null;
  registeredVoters: number | null; // null while voting is open (organiser-only)
  totalVotes: number | null;
  resultsAvailable: boolean; // per-option counts are only revealed after the end
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
    if (data?.status !== 'live' && data?.status !== 'upcoming') return;
    const id = setInterval(() => fetchResults(), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [data?.status, fetchResults]);

  const totalVotes = data?.totalVotes ?? 0;
  const sorted = data ? [...data.options].sort((a, b) => b.votes - a.votes) : [];

  if (loading) {
    return (
      <AppShell width="sm" center>
        <div className="flex items-center justify-center gap-3 text-muted">
          <Spinner size={22} />
          <span>Loading results...</span>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell width="sm" center>
        <Notice tone="danger" title="Could not load results">
          <p className="mt-1">{error}</p>
          <Button variant="dark" size="sm" onClick={() => fetchResults(true)} className="mt-4">
            Try again
          </Button>
        </Notice>
      </AppShell>
    );
  }

  return (
    <AppShell aside={<NetworkBadge network={data?.network ?? 'preprod'} />}>
      {/* Header */}
      <Link href={`/event/${eventId}`} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeftIcon size={16} />
        Back to event
      </Link>
      <PageIntro
        eyebrow="RESULTS"
        title={data?.eventName}
        lede="Voting results — on-chain data"
        className="mb-6"
      />

      {/* Status banner */}
      {data?.status === 'not_deployed' && (
        <Notice tone="attention" title="Voting not started yet" className="mb-6">
          <p>The event has not been deployed to the blockchain. Results will appear once voting begins.</p>
        </Notice>
      )}

      {data?.status === 'upcoming' && (
        <Notice tone="attention" title="Voting not started yet" className="mb-6">
          {data.startingDate && (
            <p>Starts {new Date(data.startingDate * 1000).toLocaleString()}</p>
          )}
        </Notice>
      )}

      {data?.status === 'live' && (
        <Notice
          tone="progress"
          title="Voting in progress"
          className="mb-6"
          action={<StatusPill tone="live" dot>Auto-refreshing</StatusPill>}
        >
          {data.endingDate && (
            <p>Ends {new Date(data.endingDate * 1000).toLocaleString()}</p>
          )}
        </Notice>
      )}

      {data?.status === 'ended' && (
        <Notice tone="success" title="Voting ended" className="mb-6">
          {data.endingDate && (
            <p>Closed {new Date(data.endingDate * 1000).toLocaleString()}</p>
          )}
        </Notice>
      )}

      {/* Results */}
      <Card className="mb-4">
        <CardHeader
          icon={<ChartIcon size={20} />}
          title="Results by option"
          info={<InfoButton text={data?.resultsAvailable ? INFO.onChainResults : INFO.resultsTiming} />}
          description={data?.resultsAvailable ? `${totalVotes} total vote${totalVotes !== 1 ? 's' : ''}` : undefined}
          action={
            <Button variant="outline" size="sm" onClick={() => fetchResults(true)} disabled={refreshing}>
              {refreshing ? <Spinner size={16} /> : <RefreshIcon size={16} />}
              Refresh
            </Button>
          }
        />

        {data?.status === 'not_deployed' ? (
          <p className="py-8 text-center text-sm text-muted">No data yet</p>
        ) : data && !data.resultsAvailable ? (
          <div className="rounded-xl border border-line bg-[#fafafa] px-5 py-8 text-center">
            <p className="font-semibold text-ink">Results are not available yet.</p>
            <p className="mt-1 text-sm text-muted">They are revealed when the voting period ends.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((opt, rank) => {
              const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
              const isWinner = rank === 0 && opt.votes > 0 && data?.status === 'ended';
              return (
                <ResultRow
                  key={opt.index}
                  rank={rank + 1}
                  text={opt.text}
                  percent={pct}
                  highlight={isWinner}
                  value={<span className="tabular-nums">{opt.votes} vote{opt.votes !== 1 ? 's' : ''} · {pct}%</span>}
                />
              );
            })}
          </div>
        )}

        {lastUpdated && (
          <p className="mt-4 text-right text-xs text-muted">
            Last updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </Card>

      {/* Transparency note */}
      <p className="text-center text-xs text-muted">
        Results are read directly from the Cardano blockchain and cannot be altered.
      </p>
    </AppShell>
  );
}
