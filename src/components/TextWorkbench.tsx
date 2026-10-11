import { useMemo, useState } from 'react';
import { Wand2, Eye, Braces, FileCode2 } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { CopyButton, Button } from './Buttons';
import {
  encodeWatermark,
  decodeWatermark,
  stripMarkers,
  countMarkers,
  type InsertionStrategy,
} from '../lib/watermark';
import {
  inspectCodePoints,
  summarizeInvisible,
  codePointCount,
} from '../lib/unicode';
import { cx } from '../lib/ui';

const DEFAULT_TEXT =
  'This is the original document. Paste your own text here to watermark it.';

/**
 * Text Workbench: the primary hub. Paste text, generate a marked copy, compare
 * visible text, inspect Unicode code points, and copy results.
 */
export function TextWorkbench() {
  const [original, setOriginal] = useState(DEFAULT_TEXT);
  const [payload, setPayload] = useState('owner=alice;doc=1');
  const [strategy, setStrategy] = useState<InsertionStrategy>('distributed');
  const [marked, setMarked] = useState('');
  const [tab, setTab] = useState<'compare' | 'codepoints'>('compare');

  const encodeInfo = useMemo(() => {
    if (!original) return null;
    try {
      return encodeWatermark(original, payload, { insertion: strategy, stride: 8 });
    } catch {
      return null;
    }
  }, [original, payload, strategy]);

  const handleGenerate = () => {
    if (encodeInfo) setMarked(encodeInfo.marked);
  };

  const visibleOfMarked = useMemo(
    () => (marked ? stripMarkers(marked) : ''),
    [marked],
  );
  const visibleMatch = useMemo(
    () => marked !== '' && visibleOfMarked === original,
    [marked, visibleOfMarked, original],
  );
  const codePointRows = useMemo(
    () => (marked ? inspectCodePoints(marked.slice(0, 400)) : []),
    [marked],
  );
  const invisibleSummary = useMemo(
    () => (marked ? summarizeInvisible(marked) : {}),
    [marked],
  );
  const decodeInfo = useMemo(
    () => (marked ? decodeWatermark(marked) : null),
    [marked],
  );

  return (
    <div className="space-y-5">
      <Card
        title="1 · Original text"
        subtitle="Paste or type the text you want to mark. It is processed locally and never leaves your browser."
      >
        <textarea
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-3 text-sm font-mono text-slate-200 outline-none"
          placeholder="Paste original text…"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>{codePointCount(original)} code points</span>
          <span>·</span>
          <span>{new Blob([original]).size} bytes (UTF-8)</span>
        </div>
      </Card>

      <Card
        title="2 · Payload & strategy"
        subtitle="The payload is embedded invisibly. Strategy controls where markers are woven in."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-slate-300 mb-1">Payload string</span>
            <input
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm font-mono text-slate-200 outline-none"
              placeholder="owner=…;doc=…"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-300 mb-1">Insertion strategy</span>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as InsertionStrategy)}
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm text-slate-200 outline-none"
            >
              <option value="distributed">
                Distributed (even spread across the text)
              </option>
              <option value="end">End (single run)</option>
              <option value="start">Start (single run)</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={handleGenerate} disabled={!original}>
            <Wand2 size={16} /> Generate marked copy
          </Button>
          {encodeInfo && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Badge tone="info">{encodeInfo.markerCount} markers</Badge>
              <Badge tone="neutral">{encodeInfo.payloadBytes} payload bytes</Badge>
              <Badge tone="neutral">
                overhead {(encodeInfo.overheadRatio * 100).toFixed(1)}%
              </Badge>
            </div>
          )}
        </div>
      </Card>
      {marked && (
        <Card
          title="3 · Marked copy & comparison"
          subtitle="The marked copy looks identical on screen. Compare, inspect code points, or copy it."
        >
          <div className="flex flex-wrap gap-2 mb-3">
            <TabButton active={tab === 'compare'} onClick={() => setTab('compare')}>
              <Eye size={14} /> Compare
            </TabButton>
            <TabButton active={tab === 'codepoints'} onClick={() => setTab('codepoints')}>
              <Braces size={14} /> Code points
            </TabButton>
          </div>

          {tab === 'compare' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone={visibleMatch ? 'good' : 'warn'}>
                  {visibleMatch ? 'Visible text identical' : 'Visible text differs'}
                </Badge>
                <CopyButton text={visibleOfMarked} label="Copy visible text" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ReadonlyBox label="Original" value={original} />
                <ReadonlyBox label="Visible text of marked copy" value={visibleOfMarked} />
              </div>
              <div className="rounded-md bg-slate-950 ring-1 ring-slate-700 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">
                    Marked copy (raw — contains invisible characters)
                  </span>
                  <CopyButton text={marked} label="Copy marked" />
                </div>
                <code className="block max-h-40 overflow-auto text-xs font-mono text-slate-300 break-all">
                  {escapeForDisplay(marked)}
                </code>
              </div>
              {decodeInfo && (
                <p className="text-xs text-slate-400">
                  Round-trip decode:{' '}
                  <span className="text-slate-200">{decodeInfo.status}</span> —{' '}
                  {decodeInfo.reason}
                </p>
              )}
            </div>
          ) : (
            <CodePointInspector
              rows={codePointRows}
              markerCount={countMarkers(marked)}
              invisibleSummary={invisibleSummary}
              truncated={marked.length > 400}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition-colors',
        active
          ? 'bg-sky-600/20 text-sky-200 ring-sky-500/40'
          : 'bg-slate-800/50 text-slate-300 ring-slate-600/50 hover:bg-slate-700/50',
      )}
    >
      {children}
    </button>
  );
}

function ReadonlyBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="rounded-md bg-slate-950 ring-1 ring-slate-700 p-2 max-h-40 overflow-auto text-sm text-slate-200 whitespace-pre-wrap break-words">
        {value || <span className="text-slate-600">(empty)</span>}
      </div>
    </div>
  );
}

function CodePointInspector({
  rows,
  markerCount,
  invisibleSummary,
  truncated,
}: {
  rows: ReturnType<typeof inspectCodePoints>;
  markerCount: number;
  invisibleSummary: Record<string, number>;
  truncated: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">
          <FileCode2 size={12} className="mr-1" /> {markerCount} marker chars
        </Badge>
        {Object.entries(invisibleSummary).map(([hex, n]) => (
          <Badge key={hex} tone="neutral">
            {hex} × {n}
          </Badge>
        ))}
      </div>
      {truncated && (
        <p className="text-xs text-amber-300">
          Showing the first 400 characters of the marked copy.
        </p>
      )}
      <div className="max-h-72 overflow-auto rounded-md ring-1 ring-slate-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left px-2 py-1">#</th>
              <th className="text-left px-2 py-1">Char</th>
              <th className="text-left px-2 py-1">Code point</th>
              <th className="text-left px-2 py-1">Name</th>
              <th className="text-left px-2 py-1">Flags</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map((r) => (
              <tr key={r.index} className="border-t border-slate-800">
                <td className="px-2 py-1 text-slate-500">{r.index}</td>
                <td className="px-2 py-1">
                  {r.zeroWidth ? (
                    <span className="text-fuchsia-400">␡</span>
                  ) : (
                    <span className="text-slate-200">{r.whitespace ? '␠' : r.char}</span>
                  )}
                </td>
                <td className="px-2 py-1 text-sky-300">{r.hex}</td>
                <td className="px-2 py-1 text-slate-400">{r.name ?? '—'}</td>
                <td className="px-2 py-1">
                  <span className="flex gap-1">
                    {r.zeroWidth && <Badge tone="experimental">zero-width</Badge>}
                    {r.whitespace && <Badge tone="neutral">ws</Badge>}
                    {r.control && <Badge tone="warn">ctrl</Badge>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Render invisible characters with visible placeholders for the raw view. */
function escapeForDisplay(input: string): string {
  return input;
  //  return input.replace(/\u200B/g, '⟨ZWSP⟩').replace(/\u200C/g, '⟨ZWNJ⟩');
}

