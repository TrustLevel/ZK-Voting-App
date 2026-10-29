import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

const GITHUB = 'https://github.com/TrustLevel/ZK-Voting-App';
const DOCS = 'https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app';

/**
 * Page frame for the organiser and voter pages: the landing-page header
 * (logo + "ZK Voting"), white ground, Geist, a centred column and a light footer.
 */
export function AppShell({
  children,
  aside,
  width = 'md',
  center = false,
}: {
  children: ReactNode;
  /** Right-hand header slot (network badge, links). */
  aside?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Vertically centre the content (loading and error screens). */
  center?: boolean;
}) {
  const maxWidth = width === 'sm' ? 'max-w-md' : width === 'lg' ? 'max-w-4xl' : 'max-w-3xl';
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-12 md:py-4">
        <Link href="/" aria-label="TrustLevel ZK Voting — home" className="flex min-h-11 items-center gap-3.5">
          <Image src="/TrustLevel_JPG_LOGO.jpg" alt="TrustLevel" width={230} height={40} className="h-9 w-auto md:h-10" priority />
          <span className="border-l border-gray-300 pl-3.5 text-[15px] font-semibold text-muted">ZK Voting</span>
        </Link>
        {aside && <div className="flex items-center gap-3">{aside}</div>}
      </header>

      <main className={`mx-auto w-full ${maxWidth} flex-1 px-4 py-8 md:px-6 md:py-12 ${center ? 'flex flex-col justify-center' : ''}`}>
        {children}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-6 text-[13px] text-muted md:px-12">
        <div className="flex flex-wrap items-center gap-2">
          <span>TrustLevel ZK Voting</span>
          <span aria-hidden="true">·</span>
          <span>Cardano</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/" className="min-h-11 inline-flex items-center hover:text-ink">Home</Link>
          <a href={DOCS} className="min-h-11 inline-flex items-center hover:text-ink">Documentation</a>
          <a href={GITHUB} className="min-h-11 inline-flex items-center hover:text-ink">GitHub</a>
        </nav>
      </footer>
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
        <h1 className="text-3xl font-bold leading-tight tracking-[-0.02em] text-ink md:text-4xl">{title}</h1>
        {lede && <p className="text-[15px] leading-relaxed text-muted md:text-base">{lede}</p>}
      </div>
      {right && <div className="flex-none">{right}</div>}
    </div>
  );
}
