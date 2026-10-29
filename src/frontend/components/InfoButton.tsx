'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, InfoIcon } from './Icons';
import type { InfoText } from './infoTexts';

const PANEL_WIDTH = 320;
const MARGIN = 16;

/**
 * Small "i" button next to a term. Click or Enter/Space opens a short
 * explanation in a popover; Escape, a click outside or the close button
 * dismiss it and focus returns to the button. The hit area is 44 × 44 px while
 * the icon stays compact (negative margins keep the row height unchanged).
 */
export function InfoButton({ text, label, className = '' }: { text: InfoText; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const place = () => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * MARGIN);
    const height = panel.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));
    const below = rect.bottom + 8;
    const top = below + height <= window.innerHeight - MARGIN || rect.top - 8 - height < MARGIN
      ? below
      : rect.top - 8 - height;
    setPos({ top, left });
  };

  // Position after the panel has rendered, then follow scroll and resize.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ?? `What is "${text.title}"?`}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen(o => !o)}
        className={`-my-2.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-muted transition hover:bg-gray-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-6px] focus-visible:outline-ink ${open ? 'text-ink' : ''} ${className}`}
      >
        <InfoIcon size={18} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          id={bodyId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            width: Math.min(PANEL_WIDTH, typeof window !== 'undefined' ? window.innerWidth - 2 * MARGIN : PANEL_WIDTH),
            visibility: pos ? 'visible' : 'hidden',
          }}
          className="z-[60] rounded-2xl border border-line bg-white p-4 text-left shadow-[0_12px_32px_rgba(11,11,12,0.14)] outline-none"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 h-4 w-1 flex-none rounded-sm bg-brand" />
            <h3 id={titleId} className="flex-1 text-sm font-bold text-ink">{text.title}</h3>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-2 -mt-2 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-muted hover:bg-gray-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
            >
              <CloseIcon size={16} />
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-700">{text.body}</p>
          {text.more && (
            <a href={text.more.href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center text-[13px] font-semibold text-ink underline decoration-brand decoration-2 underline-offset-[3px] hover:decoration-brand-dark">
              {text.more.label}
            </a>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export type { ReactNode };
