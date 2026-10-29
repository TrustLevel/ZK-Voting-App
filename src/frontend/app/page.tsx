'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3000';
const GITHUB = 'https://github.com/TrustLevel/ZK-Voting-App';
const DOCS = 'https://trustlevel.gitbook.io/knowledge-base/products/zk-voting-app';

// Section eyebrow with the brand bar, as on trustlevel.io.
function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 text-[13px] font-bold tracking-[0.08em] ${light ? 'text-brand' : 'text-foreground'}`}>
      <span aria-hidden="true" className="h-1 w-7 rounded-sm bg-brand" />
      {children}
    </div>
  );
}

function PrimaryLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-bold text-ink transition hover:bg-brand-dark ${className}`}
    >
      {children}
    </a>
  );
}

function OutlineLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-white px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-ink hover:text-white ${className}`}
    >
      {children}
    </a>
  );
}

export default function Home() {
  // Which networks the backend offers; shown in the status pill. Falls back to Preprod only.
  const [mainnetEnabled, setMainnetEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${BACKEND_API_URL}/voting-event/networks`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setMainnetEnabled(!!data?.mainnet?.enabled))
      .catch(() => setMainnetEnabled(false));
  }, []);

  const steps = [
    { n: '01', title: 'Create & invite', text: 'The organiser sets the question, the options and the voting window, then invites participants by e-mail. Each person gets a private link.' },
    { n: '02', title: 'Register', text: 'The browser creates a voting identity and keeps the secret on the device. Only a public commitment joins the group.' },
    { n: '03', title: 'Publish & vote', text: 'The organiser signs two transactions that freeze the group on-chain. During the window, voters pick an option; the proof is generated in the browser and submitted for them.' },
    { n: '04', title: 'Results', text: 'Counts per option stay hidden while voting is open. When the window closes, the on-chain tally is shown to everyone.' },
  ];

  const tech = [
    { title: 'Semaphore protocol', text: 'Anonymous group membership with Groth16 proofs on BLS12-381' },
    { title: 'Aiken smart contracts', text: 'Plutus v3 validators verify every proof and tally on-chain' },
    { title: 'Nullifier trie', text: 'Merkle Patricia Forestry proves a vote was not cast before' },
    { title: 'Relay submission', text: 'A service wallet pays and submits vote transactions, so voters stay off-chain' },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-foreground">
      {/* Nav */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4 md:px-12">
        <a href="#top" aria-label="TrustLevel ZK Voting — home" className="flex items-center gap-3.5">
          <Image src="/TrustLevel_JPG_LOGO.jpg" alt="TrustLevel" width={230} height={40} className="h-10 w-auto" priority />
          <span className="border-l border-gray-300 pl-3.5 text-[15px] font-semibold text-muted">ZK Voting</span>
        </a>
        <nav aria-label="Main" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium">
          <a href="#how" className="hover:text-brand-dark">How it works</a>
          <a href="#organisers" className="hover:text-brand-dark">For organisers</a>
          <a href="#voters" className="hover:text-brand-dark">For voters</a>
          <a href="#trust" className="hover:text-brand-dark">Security &amp; audit</a>
          <a href={GITHUB} className="hover:text-brand-dark">GitHub</a>
        </nav>
        <PrimaryLink href="/create">
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 4v16M4 12h16" /></svg>
          Create an event
        </PrimaryLink>
      </header>

      {/* Hero: light, gold dot grid + soft glows */}
      <section
        id="top"
        className="flex flex-wrap items-center gap-10 px-6 py-16 md:gap-14 md:px-12 md:py-22"
        style={{
          backgroundColor: '#ffffff',
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(234, 163, 7, 0.38) 1.4px, transparent 1.6px), radial-gradient(55% 60% at 88% 18%, rgba(255, 186, 1, 0.34), rgba(255, 186, 1, 0) 70%), radial-gradient(45% 50% at 8% 92%, rgba(255, 186, 1, 0.22), rgba(255, 186, 1, 0) 70%)',
          backgroundSize: '26px 26px, 100% 100%, 100% 100%',
        }}
      >
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
          <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-brand-dark bg-[#FFF4D1] px-3.5 py-1.5 text-[13px] font-semibold tracking-wide">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand" />
            {mainnetEnabled ? 'LIVE ON CARDANO MAINNET AND PREPROD' : 'LIVE ON CARDANO PREPROD TESTNET'}
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.025em] text-ink md:text-6xl">
            Anonymous, <span className="rounded-[10px] bg-brand px-2.5 text-ink [box-decoration-break:clone]">verifiable</span> voting on Cardano
          </h1>
          <p className="max-w-[600px] text-lg leading-relaxed text-gray-600 md:text-xl">
            Run a vote where nobody — not even the organiser — can see who voted for what, every member votes exactly once, and the final tally is written to the blockchain for anyone to check.
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <PrimaryLink href="/create" className="min-h-12 px-6 text-base">Create a voting event</PrimaryLink>
            <OutlineLink href="#how" className="min-h-12 px-6 text-base">See how it works</OutlineLink>
          </div>
          <p className="text-sm text-muted">Voters need only their invitation link — no wallet, no crypto, no account.</p>
        </div>
        <div className="grid min-w-0 flex-[1_1_380px] grid-cols-1 gap-3">
          {[
            { title: 'Anonymous by proof, not by promise', text: 'A zero-knowledge proof shows a vote comes from an invited member without revealing which one. The secret never leaves the voter\'s browser.', icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
            { title: 'Exactly one vote per person', text: 'A one-time cryptographic nullifier blocks any second vote — enforced by the smart contract, not by the server.', icon: <><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></> },
            { title: 'Tally on the blockchain', text: 'Every vote is a Cardano transaction verified by the voting contract. The result cannot be edited after the fact — and anyone can recount it.', icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 15l3-3 2 2 5-5" /></> },
          ].map(card => (
            <div key={card.title} className="flex items-start gap-4 rounded-2xl border border-line bg-white/90 px-5 py-5">
              <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-brand">
                <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="#0b0b0c" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">{card.icon}</svg>
              </span>
              <div>
                <div className="text-base font-semibold">{card.title}</div>
                <div className="mt-1 text-sm leading-relaxed text-gray-600">{card.text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="flex flex-col gap-9 px-6 pb-16 pt-18 md:px-12">
        <div className="flex max-w-[720px] flex-col gap-2.5">
          <Eyebrow>HOW IT WORKS</Eyebrow>
          <h2 className="text-3xl font-bold tracking-[-0.015em] md:text-4xl">Four steps from invitation to result</h2>
          <p className="text-[17px] leading-relaxed text-muted">The organiser needs a Cardano wallet; voters do not.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(s => (
            <div key={s.n} className="flex flex-col gap-3 rounded-2xl border border-line border-t-4 border-t-brand bg-[#fafafa] p-6">
              <div className="text-[40px] font-bold leading-none tracking-[-0.03em] text-brand-dark">{s.n}</div>
              <div className="text-[17px] font-semibold">{s.title}</div>
              <div className="text-sm leading-relaxed text-gray-600">{s.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section className="grid grid-cols-1 gap-6 px-6 pb-18 pt-2 md:px-12 lg:grid-cols-2">
        <div id="organisers" className="flex flex-col gap-4 rounded-[20px] bg-brand p-8 text-ink md:p-9">
          <h2 className="text-[28px] font-bold tracking-[-0.01em]">For organisers</h2>
          <p className="text-[15px] leading-relaxed text-[#3a2f08]">DAOs, stake pools, working groups, boards — any closed group that needs a decision nobody can tamper with.</p>
          <div className="mt-1.5 text-[13px] font-bold tracking-[0.06em]">WHAT YOU NEED</div>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[#1f1a05]">
            <li>A Cardano wallet (Eternl recommended) with ADA on Mainnet or free test ADA on Preprod</li>
            <li>Your participants&apos; e-mail addresses</li>
            <li>About 20 minutes before the voting window opens</li>
          </ul>
          <div className="mt-1.5 text-[13px] font-bold tracking-[0.06em]">WHAT IT COSTS</div>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[#1f1a05]">
            <li>Preprod: nothing — test ADA from the faucet</li>
            <li>Mainnet: ADA locked in the event contracts plus a fee deposit for your voters&apos; transactions — the exact amounts are shown before you publish</li>
          </ul>
          <div className="mt-2.5 flex flex-wrap gap-3">
            <a href="/create" className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4.5 py-3 text-[15px] font-semibold text-white transition hover:bg-black">Create an event</a>
            <a href={`${DOCS}/organiser-guide`} className="inline-flex min-h-11 items-center rounded-xl border-[1.5px] border-ink px-4.5 py-3 text-[15px] font-semibold text-ink transition hover:bg-ink hover:text-white">Organiser guide</a>
          </div>
        </div>
        <div id="voters" className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-8 md:p-9">
          <h2 className="text-[28px] font-bold tracking-[-0.01em]">For voters</h2>
          <p className="text-[15px] leading-relaxed text-muted">You were invited by e-mail? Everything happens in your browser.</p>
          <div className="mt-1.5 text-[13px] font-bold tracking-[0.06em]">WHAT YOU NEED</div>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
            <li>Your invitation link (valid for seven days)</li>
            <li>A modern browser — no wallet, no ADA, no account</li>
          </ul>
          <div className="mt-1.5 text-[13px] font-bold tracking-[0.06em]">WHAT HAPPENS TO YOUR VOTE</div>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
            <li>Your identity file stays on your device — keep it until the vote has ended</li>
            <li>The proof that you may vote is computed in your browser (about 30 seconds)</li>
            <li>The transaction is submitted for you; your name or address never appears on-chain</li>
          </ul>
          <div className="mt-2.5 flex flex-wrap gap-3">
            <OutlineLink href={`${DOCS}/voter-guide`}>Voter guide</OutlineLink>
          </div>
        </div>
      </section>

      {/* Guarantees and limits */}
      <section id="trust" className="flex flex-col gap-8 border-t border-line bg-[#fafafa] px-6 py-18 md:px-12">
        <div className="flex max-w-[760px] flex-col gap-2.5">
          <Eyebrow>SECURITY &amp; AUDIT</Eyebrow>
          <h2 className="text-3xl font-bold tracking-[-0.015em] md:text-4xl">What the system guarantees — and what it does not</h2>
          <p className="text-[17px] leading-relaxed text-muted">Audited smart contracts, a public test report, and limits stated in plain words.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center gap-2.5 text-base font-bold">
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="#0b0b0c" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </span>
              Guaranteed by cryptography and the contract
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
              <li>Only invited members can vote — proven with a zero-knowledge membership proof</li>
              <li>Nobody can tell which member cast a given vote</li>
              <li>Each member votes once — a second attempt is rejected on-chain</li>
              <li>The tally is on the blockchain and cannot be altered afterwards</li>
            </ul>
          </div>
          <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center gap-2.5 text-base font-bold">
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="#FFBA01" strokeWidth={3} strokeLinecap="round"><path d="M12 7v6M12 17h.01" /></svg>
              </span>
              Known limits
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
              <li>The chosen option is readable on-chain (anonymity, not ballot secrecy)</li>
              <li>Running counts are hidden by the application, not by cryptography</li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <OutlineLink href={`${DOCS}/audit-report-milestone-4`} className="text-sm">Audit report</OutlineLink>
          <OutlineLink href={`${DOCS}/test-report-milestone-4`} className="text-sm">Test report</OutlineLink>
          <OutlineLink href={GITHUB} className="text-sm">Source code (open source)</OutlineLink>
        </div>
      </section>

      {/* Technology: ink band */}
      <section className="flex flex-col gap-6 bg-ink px-6 py-14 text-white md:px-12 md:pb-16">
        <Eyebrow light>UNDER THE HOOD</Eyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tech.map(t => (
            <div key={t.title} className="rounded-xl border border-[#2a2a2e] bg-[#141416] px-5 py-4.5">
              <div className="text-[15px] font-semibold text-brand">{t.title}</div>
              <div className="mt-1.5 text-[13px] leading-relaxed text-[#c9c9cf]">{t.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-white px-6 pb-10 pt-8 text-sm text-muted md:px-12">
        <div className="flex flex-wrap items-center gap-3">
          <Image src="/TrustLevel_JPG_LOGO.jpg" alt="TrustLevel" width={150} height={26} className="h-[26px] w-auto" />
          <span>· funded by Project Catalyst (Fund 12) · powered by</span>
          <Image src="/cf-logo.svg" alt="" width={18} height={18} />
          <span className="font-semibold text-foreground">Cardano</span>
        </div>
        <div className="flex flex-wrap gap-5">
          <a href="/info" className="text-foreground hover:text-brand-dark">Learn more</a>
          <a href={DOCS} className="text-foreground hover:text-brand-dark">Documentation</a>
          <a href={GITHUB} className="text-foreground hover:text-brand-dark">GitHub</a>
          <a href="https://trustlevel.io" className="text-foreground hover:text-brand-dark">trustlevel.io</a>
        </div>
      </footer>
    </div>
  );
}
