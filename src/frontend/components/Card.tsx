import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, InfoIcon, Spinner } from './Icons';

/** White card with the landing-page border radius. */
export function Card({ children, className = '', soft = false }: { children: ReactNode; className?: string; soft?: boolean }) {
  return (
    <section className={`rounded-2xl border border-line ${soft ? 'bg-[#fafafa]' : 'bg-white'} p-5 md:p-6 ${className}`}>
      {children}
    </section>
  );
}

/**
 * Card title row: icon in a gold square, title, optional info button and a
 * right-hand action (refresh, copy ...). `description` sits under the title.
 */
export function CardHeader({
  icon,
  title,
  info,
  action,
  description,
  as: Tag = 'h2',
  className = '',
}: {
  icon?: ReactNode;
  title: ReactNode;
  info?: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        {icon && (
          <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-brand text-ink">
            {icon}
          </span>
        )}
        <div className="min-w-[10rem] flex-1">
          <div className="flex min-h-9 items-center gap-x-1">
            <Tag className="min-w-0 text-base font-bold text-ink md:text-[17px]">{title}</Tag>
            {info}
          </div>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {action && <div className="basis-full sm:basis-auto sm:flex-none">{action}</div>}
      </div>
    </div>
  );
}

export type NoticeTone = 'neutral' | 'attention' | 'success' | 'danger' | 'progress';

const toneClass: Record<NoticeTone, string> = {
  neutral: 'border-line bg-[#fafafa] text-ink',
  attention: 'border-brand-dark bg-[#FFF4D1] text-ink',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  danger: 'border-red-200 bg-red-50 text-red-900',
  progress: 'border-line bg-white text-ink',
};

const toneIcon: Record<NoticeTone, ReactNode> = {
  neutral: <InfoIcon size={20} />,
  attention: <AlertIcon size={20} />,
  success: <CheckIcon size={20} />,
  danger: <AlertIcon size={20} />,
  progress: <Spinner size={20} />,
};

const toneIconClass: Record<NoticeTone, string> = {
  neutral: 'bg-white text-ink border border-line',
  attention: 'bg-brand text-ink',
  success: 'bg-emerald-600 text-white',
  danger: 'bg-red-600 text-white',
  progress: 'bg-ink text-brand',
};

/**
 * Status box (replaces the coloured bordered boxes). Semantic colours stay:
 * red = error, green = done; the former yellow boxes use the gold tint.
 */
export function Notice({
  tone = 'neutral',
  title,
  children,
  icon,
  action,
  className = '',
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode | null;
  action?: ReactNode;
  className?: string;
}) {
  const shownIcon = icon === null ? null : icon ?? toneIcon[tone];
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${toneClass[tone]} ${className}`}>
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        {shownIcon && (
          <span aria-hidden="true" className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${toneIconClass[tone]}`}>
            {shownIcon}
          </span>
        )}
        <div className="min-w-[10rem] flex-1 text-sm leading-relaxed">
          {title && <div className="flex min-h-9 items-center gap-x-1 text-[15px] font-bold"><span className="min-w-0">{title}</span></div>}
          {children}
        </div>
        {action && <div className="basis-full sm:basis-auto sm:flex-none">{action}</div>}
      </div>
    </div>
  );
}

/** Label + value row for read-only data (dates, ids). */
export function DataRow({ label, children, mono = false }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line py-2.5 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium text-ink ${mono ? 'font-mono break-all' : ''}`}>{children}</span>
    </div>
  );
}

/** Monospace box for hashes, addresses and ids. */
export function CodeBox({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-[#fafafa] px-3 py-2 font-mono text-xs break-all text-ink ${className}`}>
      {children}
    </div>
  );
}
