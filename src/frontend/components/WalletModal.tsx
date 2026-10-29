'use client';

import { useEffect } from 'react';
import { Button } from './Button';

const WALLETS = ['eternl', 'lace'];

/**
 * Wallet picker shared by the create and manage pages. Calls `onSelect` with
 * the CIP-30 wallet name exactly as before; `onClose` for Cancel and Escape.
 */
export function WalletModal({ open, subtitle, onSelect, onClose }: { open: boolean; subtitle: string; onSelect: (walletName: string) => void; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(11,11,12,0.3)] md:p-8">
        <h2 id="wallet-modal-title" className="text-2xl font-bold tracking-[-0.01em] text-ink">Connect Your Wallet</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>

        <div className="mt-6 space-y-3">
          {WALLETS.map((walletName) => (
            <button
              key={walletName}
              type="button"
              onClick={() => onSelect(walletName)}
              className="flex w-full items-center gap-3 rounded-xl border-[1.5px] border-line p-4 text-left transition hover:border-ink hover:bg-[#fafafa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold uppercase text-ink">
                {walletName[0]}
              </span>
              <span>
                <span className="block font-semibold capitalize text-ink">{walletName}</span>
                <span className="block text-sm text-muted">Connect with {walletName.charAt(0).toUpperCase() + walletName.slice(1)}</span>
              </span>
            </button>
          ))}
        </div>

        <Button variant="ghost" size="md" onClick={onClose} className="mt-4 w-full text-muted hover:text-ink">
          Cancel
        </Button>
      </div>
    </div>
  );
}
