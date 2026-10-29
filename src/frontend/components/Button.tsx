import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Icons';

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-ink hover:bg-brand-dark disabled:hover:bg-brand',
  dark: 'bg-ink text-white hover:bg-black disabled:hover:bg-ink',
  outline: 'border-[1.5px] border-ink bg-white text-ink hover:bg-ink hover:text-white disabled:hover:bg-white disabled:hover:text-ink',
  ghost: 'text-ink hover:bg-gray-100',
  danger: 'text-red-700 hover:bg-red-50',
};

// Every size keeps a 44 px minimum height (touch target).
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 py-2 text-sm',
  md: 'min-h-11 px-5 py-2.5 text-[15px]',
  lg: 'min-h-12 w-full px-6 py-3 text-base',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner in front of the label; does not change `disabled`. */
  loading?: boolean;
  children?: ReactNode;
};

export function Button({ variant = 'primary', size = 'md', loading = false, className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {loading && <Spinner size={18} />}
      {children}
    </button>
  );
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
};

/** Anchor styled like a button (navigation, downloads, explorer links). */
export function LinkButton({ variant = 'outline', size = 'md', className = '', children, ...rest }: LinkButtonProps) {
  return (
    <a className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
