import type { ReactNode } from 'react';

/**
 * One option in a results list: rank, text, a value on the right and a bar.
 * The caller decides what the value says (votes, percent); this only draws.
 * `highlight` (the winner on the public results page) only frames the row in brand
 * yellow — rank badge and bar stay the same as in every other row.
 */
export function ResultRow({ rank, text, value, percent, highlight = false }: { rank: number; text: ReactNode; value: ReactNode; percent: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl bg-white p-4 ${highlight ? 'border-2 border-brand' : 'border border-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line bg-[#fafafa] text-xs font-bold text-ink">
            {rank}
          </span>
          <span className="min-w-0 break-words text-[15px] font-medium leading-snug text-ink">{text}</span>
        </div>
        <div className="flex-none text-right text-sm font-semibold text-ink">{value}</div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className="h-2 rounded-full bg-ink transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
