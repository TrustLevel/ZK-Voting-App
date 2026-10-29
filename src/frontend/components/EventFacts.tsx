import type { ReactNode } from 'react';
import { StatusPill, type PillTone } from './StatusPill';
import { formatLocalDateTime } from '@/lib/format';

export type EventPhase = 'unpublished' | 'upcoming' | 'open' | 'ended';

/** Where an event is in its life, from the published dates (unix seconds). */
export function eventPhase(startingDate: number | null, endingDate: number | null, published: boolean, now = Date.now()): EventPhase {
  if (!published || !startingDate || !endingDate) return 'unpublished';
  if (now < startingDate * 1000) return 'upcoming';
  if (now > endingDate * 1000) return 'ended';
  return 'open';
}

const PHASE: Record<EventPhase, { label: string; tone: PillTone; dot: boolean }> = {
  unpublished: { label: 'Not published yet', tone: 'neutral', dot: false },
  upcoming: { label: 'Upcoming', tone: 'attention', dot: true },
  open: { label: 'Voting open', tone: 'live', dot: true },
  ended: { label: 'Voting ended', tone: 'success', dot: true },
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-5 py-4">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="text-sm font-semibold leading-snug text-ink">{children}</span>
    </div>
  );
}

/**
 * The three facts a voter needs at a glance — voting period, type and where the
 * event stands — in one strip under the event title.
 */
export function EventFacts({ startingDate, endingDate, votingPower, phase, className = '' }: {
  startingDate: number | null;
  endingDate: number | null;
  votingPower: number;
  phase: EventPhase;
  className?: string;
}) {
  const p = PHASE[phase];
  return (
    <div className={`grid grid-cols-1 divide-y divide-line rounded-2xl border border-line bg-[#fafafa] sm:grid-cols-[1.6fr_1fr_1fr] sm:divide-x sm:divide-y-0 ${className}`}>
      <Fact label="Voting period">
        {startingDate && endingDate
          ? <>{formatLocalDateTime(startingDate)} <span className="font-normal text-muted">to</span> {formatLocalDateTime(endingDate)}</>
          : <span className="font-normal text-muted">Set when the organiser publishes the event</span>}
      </Fact>
      <Fact label="Type">{votingPower === 1 ? 'Simple vote' : `Weighted, ${votingPower} points`}</Fact>
      <Fact label="Status"><StatusPill tone={p.tone} dot={p.dot}>{p.label}</StatusPill></Fact>
    </div>
  );
}
