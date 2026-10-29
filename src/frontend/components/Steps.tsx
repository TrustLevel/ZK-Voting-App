import { CheckIcon } from './Icons';

export interface StepItem<K extends string> {
  key: K;
  label: string;
  done: boolean;
}

/**
 * Numbered step tabs with connectors (Register → Vote → Results, or the four
 * organiser steps). Each step is a real button of at least 44 px; the labels
 * wrap on phones. Done steps are gold with an ink check, the active one ink.
 */
export function Steps<K extends string>({ steps, active, onSelect, label = 'Steps', hints }: { steps: StepItem<K>[]; active: K; /** Omit for a read-only progress strip. */ onSelect?: (key: K) => void; label?: string; /** Optional second line per step (same order). */ hints?: string[] }) {
  return (
    <nav aria-label={label}>
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, i) => {
          const isActive = step.key === active;
          const prevDone = i > 0 && steps[i - 1].done;
          return (
            <li key={step.key} className="relative flex flex-col items-center">
              {i > 0 && (
                <span aria-hidden="true" className={`absolute left-0 right-1/2 top-[22px] h-0.5 ${prevDone ? 'bg-brand' : 'bg-line'}`} />
              )}
              {i < steps.length - 1 && (
                <span aria-hidden="true" className={`absolute left-1/2 right-0 top-[22px] h-0.5 ${step.done ? 'bg-brand' : 'bg-line'}`} />
              )}
              {(() => {
                const inner = (
                  <>
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition ${
                        isActive
                          ? 'bg-ink text-white ring-2 ring-brand ring-offset-2 ring-offset-white'
                          : step.done
                            ? 'bg-brand text-ink'
                            : 'border-[1.5px] border-line bg-white text-muted'
                      }`}
                    >
                      {step.done ? <CheckIcon size={18} strokeWidth={2.5} /> : i + 1}
                    </span>
                    <span className={`text-[11px] font-semibold leading-tight sm:text-xs ${isActive ? 'text-ink' : step.done ? 'text-ink' : 'text-muted'}`}>
                      {step.label}
                    </span>
                    {hints?.[i] && <span className="text-[11px] leading-tight text-muted">{hints[i]}</span>}
                  </>
                );
                const cls = 'relative z-10 flex w-full min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-1 text-center';
                return onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(step.key)}
                    aria-current={isActive ? 'step' : undefined}
                    className={`${cls} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div aria-current={isActive ? 'step' : undefined} className={cls}>
                    {inner}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
