import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

const GITHUB = 'https://github.com/TrustLevel/ZK-Voting-App';
const DOCS = 'https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app';

/**
 * Page frame for the organiser and voter pages: one white box on a quiet
 * ground (app feel), the TrustLevel logo centred at the top of the box, the
 * page inside, and "Powered by Cardano" at the bottom of the box.
 */
export function AppShell({
  children,
  aside,
  width = 'md',
  center = false,
}: {
  children: ReactNode;
  /** Shown centred under the logo (network badge). */
  aside?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Vertically centre the content (loading and error screens). */
  center?: boolean;
}) {
  const maxWidth = width === 'sm' ? 'max-w-md' : width === 'lg' ? 'max-w-4xl' : 'max-w-3xl';
  return (
    <div
      className="flex min-h-screen flex-col items-center bg-[#f6f6f7] px-4 py-6 font-sans text-ink md:px-8 md:py-10"
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(234, 163, 7, 0.22) 1.2px, transparent 1.5px)',
        backgroundSize: '26px 26px',
      }}
    >
      <div className={`flex w-full ${maxWidth} flex-1 flex-col rounded-3xl border border-line bg-white px-5 py-7 shadow-[0_18px_48px_rgba(11,11,12,0.07)] md:px-10 md:py-9`}>
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" aria-label="TrustLevel ZK Voting — home" className="inline-flex min-h-11 items-center">
            <Image src="/TrustLevel_JPG_LOGO.jpg" alt="TrustLevel" width={400} height={70} className="h-auto w-[220px] md:w-[280px]" priority />
          </Link>
          {aside}
        </div>

        <main className={`flex-1 ${center ? 'flex flex-col justify-center' : ''}`}>
          {children}
        </main>

        {/* Footer inside the box */}
        <footer className="mt-12 flex flex-col items-center gap-3 border-t border-line pt-6 text-sm text-muted">
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <Image src="/cf-logo.svg" alt="" width={20} height={20} />
            <span className="font-semibold text-ink">Cardano</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px]">
            <Link href="/" className="inline-flex min-h-11 items-center hover:text-ink">Home</Link>
            <a href={DOCS} className="inline-flex min-h-11 items-center hover:text-ink">Documentation</a>
            <a href={GITHUB} className="inline-flex min-h-11 items-center hover:text-ink">GitHub</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}

/** Section eyebrow with the gold bar, as on the landing page. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] font-bold tracking-[0.08em] text-ink">
      <span aria-hidden="true" className="h-1 w-7 rounded-sm bg-brand" />
      {children}
    </div>
  );
}

/** Page title block: eyebrow, h1, lede and an optional right-hand element. */
export function PageIntro({ eyebrow, title, lede, right, className = '' }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`mb-8 flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink md:text-4xl">{title}</h1>
        {lede && <p className="text-[15px] leading-relaxed text-muted md:text-base">{lede}</p>}
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  );
}
