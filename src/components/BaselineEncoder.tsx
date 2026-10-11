import { useMemo, useState } from 'react';
import { Info, ShieldAlert, FlaskConical } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { CopyButton } from './Buttons';
import {
  encodeWatermark,
  decodeWatermark,
  stripMarkers,
  BASELINE_METADATA,
  type InsertionStrategy,
} from '../lib/watermark';
import { codePointCount, summarizeInvisible } from '../lib/unicode';

const LIMITATIONS = [
  'NOT steganographic against a determined analyst. The marker characters (U+200B / U+200C) are trivially detectable by scanning for zero-width code points — and this app ships exactly that scan.',
  'NOT robust. Any process that strips zero-width characters, re-types the text, or flattens it (e.g. to PDF) destroys the watermark completely.',
  'NOT a proof of authorship. There is no secret key. Anyone can embed an identical frame, so a "detected" result is a presence signal, never an identity signature.',
  'Collides with legitimate U+200B / U+200C. If the original text already contains those characters, they will be (mis)interpreted as marker bits.',
  'Fragile to truncation when using a single end-run; the distributed strategy mitigates tail-trim only partially.',
];

/**
 * Baseline Encoder: a documented, reversible invisible-Unicode watermark used
 * as the benchmark reference. Makes its limitations explicit.
 */
export function BaselineEncoder() {
  const [text, setText] = useState(
    'The baseline scheme hides a short payload in zero-width Unicode characters without changing any visible text.',
  );
  const [payload, setPayload] = useState('owner=alice;doc=1;v=1');
  const [strategy, setStrategy] = useState<InsertionStrategy>('distributed');

  const result = useMemo(() => {
    try {
      return encodeWatermark(text, payload, { insertion: strategy, stride: 8 });
    } catch {
      return null;
    }
  }, [text, payload, strategy]);

  const visible = result ? stripMarkers(result.marked) : '';
  const roundTrip = useMemo(
    () => (result ? decodeWatermark(result.marked) : null),
    [result],
  );
  const invisible = result ? summarizeInvisible(result.marked) : {};

  return (
    <div className="space-y-5">
      <Card
        title="Baseline encoder (documented, reversible)"
        subtitle={`"${BASELINE_METADATA.name}" — frame magic ${BASELINE_METADATA.magic}, version 0x0${BASELINE_METADATA.version}, alphabet ${BASELINE_METADATA.alphabet}. This is the reference the benchmark measures against.`}
      >
        <div className="grid gap-3">
          <label className="text-sm">
            <span className="block text-slate-300 mb-1">Original text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm text-slate-200 outline-none"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-slate-300 mb-1">Payload</span>
              <input
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm font-mono text-slate-200 outline-none"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-300 mb-1">Insertion strategy</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as InsertionStrategy)}
                className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm text-slate-200 outline-none"
              >
                <option value="distributed">Distributed</option>
                <option value="end">End</option>
                <option value="start">Start</option>
              </select>
            </label>
          </div>
        </div>
        {result ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={visible === text ? 'good' : 'warn'}>
                {visible === text ? 'Visually identical' : 'Visible text changed'}
              </Badge>
              <Badge tone="info">{result.markerCount} markers</Badge>
              <Badge tone="neutral">{result.frameBytes} frame bytes</Badge>
              <Badge tone="neutral">{(result.overheadRatio * 100).toFixed(1)}% overhead</Badge>
              {Object.entries(invisible).map(([hex, n]) => (
                <Badge key={hex} tone="experimental">
                  {hex}×{n}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={result.marked} label="Copy marked copy" />
              <CopyButton text={visible} label="Copy visible text" />
              <CopyButton text={JSON.stringify(result, null, 2)} label="Copy stats (JSON)" />
            </div>
            {roundTrip && (
              <p className="text-xs text-slate-400">
                Immediate round-trip:{' '}
                <span className="text-slate-200">{roundTrip.status}</span> — recovered
                payload{' '}
                <span className="font-mono text-sky-300">
                  {roundTrip.payload === null ? '(none)' : JSON.stringify(roundTrip.payload)}
                </span>
                . {codePointCount(result.marked)} total code points.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-rose-300">
            Payload too large for the 16-bit length field (max 65535 bytes).
          </p>
        )}
      </Card>

      <Card
        title="How the frame is built"
        subtitle="Transparent, on purpose. A research reference should be inspectable."
      >
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300">
          <li>Payload string → UTF-8 bytes.</li>
          <li>
            Frame (big-endian):{' '}
            <code className="text-sky-300">
              MAGIC(4) | VERSION(1) | LENGTH(2) | PAYLOAD(LENGTH) | CHECKSUM(1)
            </code>
            .
          </li>
          <li>
            Each bit → one character:{' '}
            <code className="text-fuchsia-300">0 → U+200B</code>,{' '}
            <code className="text-fuchsia-300">1 → U+200C</code>.
          </li>
          <li>Markers are woven into the text without touching any visible character.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          To reverse it: remove every U+200B / U+200C. That restores the exact
          original visible text (the Decoder's "visible text" panel does this).
        </p>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-400" /> Known limitations
          </span>
        }
        subtitle="These are not caveats we are trying to hide — they define what this baseline can and cannot be used for."
        accent="warn"
      >
        <ul className="space-y-2">
          {LIMITATIONS.map((lim, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-300">
              <Info size={15} className="mt-0.5 shrink-0 text-amber-400" />
              <span>{lim}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <FlaskConical size={18} className="text-fuchsia-400" /> Relationship to
            experimental algorithms
          </span>
        }
        subtitle="Only this baseline is treated as validated reference behaviour."
      >
        <p className="text-sm text-slate-300">
          The{' '}
          <span className="text-fuchsia-300">Experimental Algorithm Interface</span>{' '}
          holds unvalidated research prototypes. They are never folded into the
          baseline benchmark numbers, and their output is always labelled
          EXPERIMENTAL. Do not treat experimental results as evidence.
        </p>
      </Card>
    </div>
  );
}
