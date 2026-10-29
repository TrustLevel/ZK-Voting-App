import type { ReactNode } from 'react';

export type PillTone = 'neutral' | 'success' | 'attention' | 'live' | 'danger' | 'ink';

const tones: Record<PillTone, string> = {
  neutral: 'border-line bg-white text-gray-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  attention: 'border-line bg-white text-ink',
  live: 'border-line bg-white text-ink',
  danger: 'border-red-200 bg-red-50 text-red-900',
  ink: 'border-ink bg-ink text-white',
};

const dots: Record<PillTone, string> = {
  neutral: 'bg-gray-400',
  success: 'bg-emerald-600',
  attention: 'bg-brand',
  live: 'bg-brand animate-pulse',
  danger: 'bg-red-600',
  ink: 'bg-brand',
};

/** Small rounded status label (Registered, Pending, Voting open ...). */
export function StatusPill({ tone = 'neutral', dot = false, children, className = '' }: { tone?: PillTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  );
}
