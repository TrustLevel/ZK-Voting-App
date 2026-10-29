import type { ReactNode } from 'react';

/**
 * One option in a results list: rank, text, a value on the right and a bar.
 * The caller decides what the value says (votes, percent); this only draws.
 */
export function ResultRow({ rank, text, value, percent, highlight = false }: { rank: number; text: ReactNode; value: ReactNode; percent: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-brand-dark bg-[#FFF4D1]' : 'border-line bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${highlight ? 'bg-ink text-white' : 'bg-[#fafafa] border border-line text-ink'}`}>
            {rank}
          </span>
          <span className="truncate text-[15px] font-medium text-ink">{text}</span>
        </div>
        <div className="flex-none text-right text-sm font-semibold text-ink">{value}</div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className={`h-2 rounded-full transition-all duration-500 ${highlight ? 'bg-brand' : 'bg-ink'}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
