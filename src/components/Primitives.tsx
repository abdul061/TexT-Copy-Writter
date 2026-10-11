import { type ReactNode } from 'react';
import { cx } from '../lib/ui';

/** A titled section container. */
export function Card({
  title,
  subtitle,
  children,
  accent,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  accent?: 'default' | 'warn' | 'experimental';
}) {
  const ring =
    accent === 'warn'
      ? 'ring-amber-500/40'
      : accent === 'experimental'
        ? 'ring-fuchsia-500/40'
        : 'ring-slate-700/60';
  return (
    <section
      className={cx(
        'rounded-xl bg-slate-900/60 ring-1 p-5 shadow-lg shadow-black/20',
        ring,
      )}
    >
      {title && (
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'experimental';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-700/50 text-slate-300 ring-slate-600/50',
  good: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  warn: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  bad: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  info: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  experimental: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
