import { useState } from 'react';
import { Beaker, AlertTriangle } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { CopyButton, Button } from './Buttons';
import {
  EXPERIMENTAL_ALGORITHMS,
  getExperimentalAlgorithm,
  type ExperimentalDecodeResult,
  type ExperimentalEncodeResult,
} from '../lib/experimental';
import { cx } from '../lib/ui';

/**
 * Experimental Algorithm Interface.
 *
 * STRICTLY SEPARATE from the validated baseline. Nothing here is proven. The UI
 * makes the experimental, unvalidated nature impossible to miss.
 */
export function ExperimentalInterface() {
  const [selectedId, setSelectedId] = useState(EXPERIMENTAL_ALGORITHMS[0].id);
  const algorithm = getExperimentalAlgorithm(selectedId);

  const [text, setText] = useState(
    'This is a research sandbox. Encoding here is unvalidated and not evidence of ownership.',
  );
  const [payload, setPayload] = useState('experiment=1');
  const [encodeResult, setEncodeResult] = useState<ExperimentalEncodeResult | null>(null);
  const [decodeResult, setDecodeResult] = useState<ExperimentalDecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEncode = () => {
    if (!algorithm) return;
    setError(null);
    setDecodeResult(null);
    try {
      setEncodeResult(algorithm.encode(text, payload));
    } catch (e) {
      setEncodeResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDecode = () => {
    if (!algorithm || !encodeResult) return;
    setError(null);
    try {
      setDecodeResult(algorithm.decode(encodeResult.marked));
    } catch (e) {
      setDecodeResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40 p-4 flex gap-3">
        <Beaker className="text-fuchsia-400 shrink-0 mt-0.5" size={20} />
        <div>
          <h2 className="text-lg font-semibold text-fuchsia-200">
            Experimental Algorithms — research sandbox
          </h2>
          <p className="text-sm text-fuchsia-100/80 mt-1">
            These algorithms are <strong>unvalidated prototypes</strong>. They are
            not benchmarked, not secure, and <strong>must not</strong> be used as
            evidence of ownership or authorship. They are separated from the
            validated baseline on purpose. Treat all output as exploratory.
          </p>
        </div>
      </div>

      <Card title="Select a prototype">
        <div className="grid gap-2 sm:grid-cols-2">
          {EXPERIMENTAL_ALGORITHMS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setSelectedId(a.id);
                setEncodeResult(null);
                setDecodeResult(null);
                setError(null);
              }}
              className={cx(
                'text-left rounded-md p-3 ring-1 transition-colors',
                selectedId === a.id
                  ? 'bg-fuchsia-600/15 ring-fuchsia-500/50'
                  : 'bg-slate-950/60 ring-slate-700 hover:ring-slate-500',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-200">{a.name}</span>
                <Badge tone="experimental">{a.status}</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1">{a.description}</p>
            </button>
          ))}
        </div>
      </Card>
      {algorithm && (
        <Card title={`${algorithm.name} — limitations`} accent="experimental">
          <ul className="space-y-1.5">
            {algorithm.limitations.map((lim, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <span>{lim}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {algorithm && (
        <Card title="Try it (experimental)">
          <div className="grid gap-3 sm:grid-cols-2 mb-3">
            <label className="text-sm">
              <span className="block text-slate-300 mb-1">Text</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                spellCheck={false}
                className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-fuchsia-500 p-2 text-sm font-mono text-slate-200 outline-none"
              />
            </label>
            <div className="space-y-3">
              <label className="text-sm block">
                <span className="block text-slate-300 mb-1">Payload</span>
                <input
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-fuchsia-500 p-2 text-sm font-mono text-slate-200 outline-none"
                />
              </label>
              <div className="flex gap-2">
                <Button onClick={handleEncode}>Encode (unvalidated)</Button>
                <Button
                  variant="secondary"
                  onClick={handleDecode}
                  disabled={!encodeResult}
                >
                  Decode (unvalidated)
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-rose-500/40 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {encodeResult && (
            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Encoded output</span>
                <CopyButton text={encodeResult.marked} label="Copy output" />
              </div>
              <code className="block rounded-md bg-slate-950 ring-1 ring-slate-700 p-3 text-xs font-mono text-slate-300 break-all max-h-32 overflow-auto">
                {encodeResult.marked}
              </code>
              {encodeResult.notes.map((n, i) => (
                <p key={i} className="text-xs text-amber-300/90">
                  {n}
                </p>
              ))}
            </div>
          )}

          {decodeResult && (
            <div className="mt-4 rounded-md bg-slate-950 ring-1 ring-slate-700 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge tone="experimental">unvalidated</Badge>
                <span className="text-sm text-slate-300">
                  status: <span className="font-mono">{decodeResult.status}</span>
                </span>
              </div>
              {decodeResult.payload && (
                <code className="block text-sm font-mono text-emerald-300 break-all">
                  {decodeResult.payload}
                </code>
              )}
              {decodeResult.notes.map((n, i) => (
                <p key={i} className="text-xs text-slate-400 mt-1">
                  {n}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
