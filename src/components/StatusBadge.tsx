import { Badge } from './Primitives';

const MAP: Record<string, { tone: 'good' | 'warn' | 'bad' | 'neutral'; label: string }> = {
  complete: { tone: 'good', label: 'complete' },
  partial: { tone: 'warn', label: 'partial' },
  invalid: { tone: 'bad', label: 'invalid' },
  absent: { tone: 'neutral', label: 'absent' },
};

/** A badge for a decode status. */
export function StatusBadge({ status }: { status: string }) {
  const cfg = MAP[status] ?? { tone: 'neutral' as const, label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
