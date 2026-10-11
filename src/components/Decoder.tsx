import { useMemo, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { CopyButton, Button } from './Buttons';
import { decodeWatermark, stripMarkers, countMarkers } from '../lib/watermark';
import { summarizeInvisible } from '../lib/unicode';
import { StatusBadge } from './StatusBadge';

/**
 * Decoder: paste text that may contain a baseline watermark, extract surviving
 * markers, and report recovered data while distinguishing complete / partial /
 * invalid / absent evidence.
 */
export function Decoder() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');

  const result = useMemo(
    () => (submitted ? decodeWatermark(submitted) : null),
    [submitted],
  );
  const invisible = useMemo(
    () => (submitted ? summarizeInvisible(submitted) : {}),
    [submitted],
  );

  const statusHelp: Record<string, string> = {
    complete:
      'A full, checksum-valid baseline frame was recovered. The payload below was embedded by this tool — NOT cryptographic proof of authorship.',
    partial:
      'Marker characters are present but no complete payload could be read. This covers two distinct cases: fewer marker bits than a frame header needs (nothing was recognized), or a recognized header whose payload was truncated. See the reason line below for which case applies.',
    invalid:
      'Marker characters are present but the frame is corrupt (bad magic, version, or checksum, or payload bytes that are not valid UTF-8). Could be unrelated zero-width characters.',
    absent:
      'No baseline marker characters (U+200B/U+200C) were found in this text.',
  };

  return (
    <div className="space-y-5">
      <Card
        title="Decoder"
        subtitle="Paste text that may contain an Anchor-Weave baseline watermark. Extraction runs entirely in your browser; nothing is uploaded."
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-3 text-sm font-mono text-slate-200 outline-none"
          placeholder="Paste marked or transformed text here…"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => setSubmitted(input)} disabled={!input}>
            <ScanSearch size={16} /> Extract evidence
          </Button>
          {submitted && (
            <span className="text-xs text-slate-400">
              {submitted.length} UTF-16 units · {countMarkers(submitted)} marker chars
            </span>
          )}
        </div>
      </Card>

      {result && (
        <>
          <Card title="Evidence summary">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <StatusBadge status={result.status} />
              <Badge tone={result.detected ? 'good' : 'neutral'}>
                {result.detected ? 'watermark detected' : 'no watermark detected'}
              </Badge>
              {result.declaredPayloadBytes !== null && (
                <Badge tone="neutral">
                  declares {result.declaredPayloadBytes} payload bytes
                </Badge>
              )}
              {result.status === 'complete' && (
                <Badge tone="neutral">
                  recovered {result.recoveredPayloadBytes} bytes
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-300 mb-3">{statusHelp[result.status]}</p>
            <p className="text-xs text-slate-500">{result.reason}</p>
          </Card>

          <Card title="Recovered data">
            {result.payload !== null ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Payload string</span>
                  <CopyButton text={result.payload} label="Copy payload" />
                </div>
                <code className="block rounded-md bg-slate-950 ring-1 ring-slate-700 p-3 text-sm font-mono text-emerald-300 break-all">
                  {result.payload}
                </code>
                <p className="text-xs text-amber-300/90">
                  Presence signal only — this proves a frame was embedded and
                  survived, not who authored the document. Without a trusted
                  identity key, recovered data cannot establish authorship.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No payload recovered for this status ({result.status}).
              </p>
            )}
          </Card>

          <Card title="Invisible characters found">
            {Object.keys(invisible).length === 0 ? (
              <p className="text-sm text-slate-500">
                No known zero-width characters present.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(invisible).map(([hex, n]) => (
                  <Badge key={hex} tone="experimental">
                    {hex} × {n}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Visible text (markers stripped)
              </span>
              <CopyButton text={result.visibleText} label="Copy visible" />
            </div>
            <div className="mt-1 rounded-md bg-slate-950 ring-1 ring-slate-700 p-3 max-h-40 overflow-auto text-sm text-slate-200 whitespace-pre-wrap break-words">
              {result.visibleText || <span className="text-slate-600">(empty)</span>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
