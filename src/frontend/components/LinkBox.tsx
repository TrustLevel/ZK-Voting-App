'use client';

import type { ReactNode } from 'react';
import { CheckIcon } from './Icons';

/**
 * A link the person has to keep (admin link, event link): title with an info
 * button, one line of advice, the URL in a field with the Copy button inside it.
 * Copy state and the copy itself stay with the caller.
 */
export function LinkBox({ icon, title, info, hint, url, copied, onCopy, className = '' }: {
  icon: ReactNode;
  title: ReactNode;
  info?: ReactNode;
  hint: ReactNode;
  url: string;
  copied: boolean;
  onCopy: () => void;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-white p-4 md:p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand text-ink">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-9 items-center gap-x-1 text-[15px] font-bold text-ink">
            <span>{title}</span>
            {info}
          </div>
          <p className="text-xs leading-relaxed text-gray-700">{hint}</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-[#fafafa] py-1.5 pl-3 pr-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-700" title={url}>{url}</span>
            <button
              type="button"
              onClick={onCopy}
              className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${copied ? 'bg-ink text-white' : 'border border-ink bg-white text-ink hover:bg-ink hover:text-white'}`}
              aria-live="polite"
            >
              {copied ? <><CheckIcon size={14} /> Copied</> : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
