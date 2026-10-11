import { useMemo, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { CopyButton, Button } from './Buttons';
import { encodeWatermark } from '../lib/watermark';
import { TRANSFORMS, type TransformId, type TransformParams } from '../lib/transforms';
import { cx } from '../lib/ui';

const DEFAULT_TEXT =
  'The quick brown fox jumps over the lazy dog. Watermarking research requires reproducible, local tests.';

/**
 * Transformation Lab: watermark a sample, then apply one or more real-world
 * transforms (normalization, whitespace cleanup, partial deletion, plain-text
 * copy, simulated format conversions) and see whether the watermark survives.
 */
export function TransformationLab() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [payload, setPayload] = useState('owner=alice;doc=1');
  const [selected, setSelected] = useState<Set<TransformId>>(
    new Set<TransformId>(['strip-zero-width']),
  );
  const [deleteFraction, setDeleteFraction] = useState(0.5);
  const [truncateFraction, setTruncateFraction] = useState(0.25);
  const [ran, setRan] = useState(false);

  const marked = useMemo(() => {
    try {
      return encodeWatermark(text, payload, {
        insertion: 'distributed',
        stride: 6,
      }).marked;
    } catch {
      return text;
    }
  }, [text, payload]);

  const params: TransformParams = { deleteFraction, truncateFraction };

  const toggle = (id: TransformId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Apply selected transforms in catalogue order (deterministic).
  const chain = useMemo(() => {
    if (!ran) return null;
    let current = marked;
    const steps: Array<{ id: TransformId; name: string }> = [];
    for (const t of TRANSFORMS) {
      if (selected.has(t.id)) {
        current = t.apply(current, params);
        steps.push({ id: t.id, name: t.name });
      }
    }
    return { output: current, steps };
  }, [ran, marked, selected, params]);

  const activeTransforms = TRANSFORMS.filter((t) => selected.has(t.id));

  return (
    <div className="space-y-5">
      <Card
        title="Transformation Lab"
        subtitle="Watermark a sample locally, then run it through real-world editing operations to see what survives. Nothing leaves the browser."
      >
        <div className="grid gap-3">
          <label className="text-sm">
            <span className="block text-slate-300 mb-1">Original text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              spellCheck={false}
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm font-mono text-slate-200 outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-300 mb-1">Payload</span>
            <input
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="w-full rounded-md bg-slate-950 ring-1 ring-slate-700 focus:ring-sky-500 p-2 text-sm font-mono text-slate-200 outline-none"
            />
          </label>
        </div>
      </Card>

      <Card
        title="Choose transformations"
        subtitle="Select one or more operations. They are applied in the fixed order shown below, so results are reproducible."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {TRANSFORMS.map((t) => {
            const on = selected.has(t.id);
            return (
              <label
                key={t.id}
                className={cx(
                  'flex items-start gap-2 rounded-md p-2.5 ring-1 cursor-pointer transition-colors',
                  on
                    ? 'bg-sky-600/10 ring-sky-500/40'
                    : 'bg-slate-950/40 ring-slate-700 hover:ring-slate-500',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(t.id)}
                  className="mt-0.5 accent-sky-500"
                />
                <span>
                  <span className="block text-sm text-slate-200">{t.name}</span>
                  <span className="block text-xs text-slate-400">{t.description}</span>
                </span>
              </label>
            );
          })}
        </div>

        {selected.has('delete-markers') && (
          <label className="mt-3 block text-sm">
            <span className="text-slate-300">
              Delete fraction: {Math.round(deleteFraction * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={deleteFraction}
              onChange={(e) => setDeleteFraction(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </label>
        )}
        {selected.has('truncate-tail') && (
          <label className="mt-3 block text-sm">
            <span className="text-slate-300">
              Truncate fraction: {Math.round(truncateFraction * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={truncateFraction}
              onChange={(e) => setTruncateFraction(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </label>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => setRan(true)} disabled={selected.size === 0}>
            <Play size={16} /> Run transformation
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRan(false);
              setSelected(new Set());
            }}
          >
            <RotateCcw size={16} /> Reset
          </Button>
          {activeTransforms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeTransforms.map((t) => (
                <Badge key={t.id} tone={t.category === 'attack' ? 'warn' : 'info'}>
                  {t.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      {chain && (
        <Card
          title="Result"
          subtitle="Paste the output into the Decoder tab to extract whatever survived."
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {chain.steps.length > 0 ? (
              chain.steps.map((s, i) => (
                <span key={s.id} className="text-xs text-slate-400">
                  {i > 0 && <span className="mx-1 text-slate-600">→</span>}
                  {s.name}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">No transforms selected.</span>
            )}
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Transformed output (raw)</span>
            <CopyButton text={chain.output} label="Copy output" />
          </div>
          <code className="block rounded-md bg-slate-950 ring-1 ring-slate-700 p-3 max-h-48 overflow-auto text-xs font-mono text-slate-300 break-all">
            {chain.output}
          </code>
          <p className="mt-3 text-xs text-slate-400">
            Next step: open the <span className="text-slate-200">Decoder</span> tab and
            paste this output to see whether the watermark is complete, partial,
            invalid, or absent.
          </p>
        </Card>
      )}
    </div>
  );
}
