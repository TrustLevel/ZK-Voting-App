import type { ReactNode } from 'react';

/** Shared text-input look (ink focus ring, rounded corners). */
export const inputClass =
  'w-full min-h-12 rounded-xl border-[1.5px] border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-gray-400 ' +
  'transition focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:bg-gray-50 disabled:text-muted';

export const inputErrorClass = 'border-red-400 focus:border-red-500 focus:ring-red-100';

/** Field label with an optional info button to its right. */
export function FieldLabel({ htmlFor, children, info, hint, className = '' }: { htmlFor?: string; children: ReactNode; info?: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={`mb-2 ${className}`}>
      <div className="flex min-h-7 items-center gap-x-1">
        <label htmlFor={htmlFor} className="min-w-0 text-sm font-semibold text-ink">{children}</label>
        {info}
      </div>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/** Selectable option tile (radio look-alike used for network / voting type). */
export function choiceTileClass(selected: boolean, disabled = false) {
  if (disabled) return 'border-line bg-gray-50 text-muted cursor-not-allowed opacity-60';
  return selected
    ? 'border-ink bg-white cursor-pointer'
    : 'border-line bg-white hover:border-gray-400 cursor-pointer';
}
