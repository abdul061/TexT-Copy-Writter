import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard, cx } from '../lib/ui';

/** A button that copies its `text` prop and shows a transient check mark. */
export function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const onClick = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
        'bg-slate-800 hover:bg-slate-700 text-slate-200 ring-1 ring-slate-600/60',
        'transition-colors disabled:opacity-50',
        className,
      )}
      aria-label={label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-sky-600 hover:bg-sky-500 text-white',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 ring-1 ring-slate-600/60',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300',
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(base, variants[variant], className)}
    >
      {children}
    </button>
  );
}
