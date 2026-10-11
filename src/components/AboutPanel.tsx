import { ShieldCheck, Lock, Info } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { BASELINE_METADATA } from '../lib/watermark';

/** Security, threat model, and honest limitations — surfaced in the app. */
export function AboutPanel() {
  return (
    <div className="space-y-5">
      <Card title="What this is">
        <p className="text-sm text-slate-300">
          Anchor-Weave Research Lab is a <strong>local, browser-only</strong>{' '}
          playground for studying invisible-Unicode text watermarking. It ships
          one <strong>documented, reversible baseline</strong> codec
          ({BASELINE_METADATA.name}) for benchmarking, plus a clearly separated
          sandbox for <strong>experimental</strong> research algorithms.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge tone="info">Baseline: {BASELINE_METADATA.magic}</Badge>
          <Badge tone="info">v{BASELINE_METADATA.version}</Badge>
          <Badge tone="neutral">{BASELINE_METADATA.alphabet}</Badge>
        </div>
      </Card>

      <Card title="Security & privacy" accent="warn">
        <ul className="space-y-2.5">
          <SecurityItem icon={<Lock size={16} />}>
            <strong>All processing is local.</strong> Text is encoded, decoded,
            transformed, and benchmarked entirely in your browser. No document
            content is ever sent over the network.
          </SecurityItem>
          <SecurityItem icon={<ShieldCheck size={16} />}>
            <strong>Pasted text is never executed as code.</strong> The codec
            only reads and rewrites characters; it uses no <code>eval</code>, no{' '}
            <code>Function</code>, and no dynamic code paths.
          </SecurityItem>
          <SecurityItem icon={<Lock size={16} />}>
            <strong>No persistent storage by default.</strong> Document text and
            any keys live only in React component state and vanish on reload.
            Nothing is written to localStorage, cookies, or IndexedDB.
          </SecurityItem>
          <SecurityItem icon={<Info size={16} />}>
            <strong>Not proof of authorship.</strong> The baseline has no secret
            key, so a recovered frame proves a frame was <em>present</em>, not who
            created the document. Real authorship claims require a trusted
            identity key (e.g. a verifiable digital signature), which this tool
            does not implement.
          </SecurityItem>
        </ul>
      </Card>

      <Card title="Threat model (baseline)" accent="warn">
        <div className="space-y-3 text-sm text-slate-300">
          <div>
            <h3 className="font-semibold text-slate-100 mb-1">
              What it defends against (weakly)
            </h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Casual, accidental removal — the markers are invisible.</li>
              <li>Simple copy/paste that preserves raw characters.</li>
              <li>
                Truncation of the tail (if using the <em>distributed</em>{' '}
                strategy).
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-rose-200 mb-1">
              What it does NOT defend against
            </h3>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Any zero-width strip / Unicode normalization attack.</li>
              <li>Re-typing, reformatting, or HTML/PDF flattening.</li>
              <li>
                A determined analyst — the markers are trivially detectable, and
                this very tool ships the detector.
              </li>
              <li>
                Forgery — anyone can embed the same frame (no secret key).
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Known limitations">
        <ul className="space-y-1.5 text-sm text-slate-300">
          <li>
            • The baseline is <strong>not steganographic</strong> against
            inspection and <strong>not robust</strong> to editing.
          </li>
          <li>
            • It fails if the original text already contains U+200B / U+200C.
          </li>
          <li>
            • It is <strong>not patentable-safe</strong> to claim as novel; it is
            a well-known class of technique included only as a reference.
          </li>
          <li>
            • Visual equivalence means <em>rendered</em> equivalence; the raw
            bytes/characters differ (that is the point).
          </li>
          <li>
            • Benchmark numbers describe only the fixed built-in corpus, not the
            real world.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function SecurityItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 text-sm text-slate-300">
      <span className="text-sky-400 shrink-0 mt-0.5">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
