import { useState } from 'react';
import {
  PenLine,
  BookLock,
  FlaskConical,
  ScanSearch,
  BarChart3,
  Beaker,
  ShieldCheck,
} from 'lucide-react';
import { TextWorkbench } from './components/TextWorkbench';
import { BaselineEncoder } from './components/BaselineEncoder';
import { TransformationLab } from './components/TransformationLab';
import { Decoder } from './components/Decoder';
import { BenchmarkDashboard } from './components/BenchmarkDashboard';
import { ExperimentalInterface } from './components/ExperimentalInterface';
import { AboutPanel } from './components/AboutPanel';
import { cx } from './lib/ui';

type TabId =
  | 'workbench'
  | 'baseline'
  | 'transform'
  | 'decode'
  | 'benchmark'
  | 'experimental'
  | 'about';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  experimental?: boolean;
}

const TABS: Tab[] = [
  { id: 'workbench', label: 'Workbench', icon: <PenLine size={16} /> },
  { id: 'baseline', label: 'Baseline', icon: <BookLock size={16} /> },
  { id: 'transform', label: 'Transformations', icon: <FlaskConical size={16} /> },
  { id: 'decode', label: 'Decoder', icon: <ScanSearch size={16} /> },
  { id: 'benchmark', label: 'Benchmark', icon: <BarChart3 size={16} /> },
  {
    id: 'experimental',
    label: 'Experimental',
    icon: <Beaker size={16} />,
    experimental: true,
  },
  { id: 'about', label: 'Security & Docs', icon: <ShieldCheck size={16} /> },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('workbench');

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-xl font-bold text-slate-100">
                Anchor-Weave Research Lab{' '}
                <span className="text-slate-500 font-normal">v0.1</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Browser-only research tool for evaluating invisible-Unicode text
                watermarking. All processing is local.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30 px-3 py-1 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              100% local · no network
            </span>
          </div>

          <nav className="mt-4 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id
                    ? t.experimental
                      ? 'bg-fuchsia-600/20 text-fuchsia-200 ring-1 ring-fuchsia-500/40'
                      : 'bg-sky-600/20 text-sky-200 ring-1 ring-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
                )}
              >
                {t.icon}
                {t.label}
                {t.experimental && (
                  <span className="text-[10px] uppercase tracking-wide text-fuchsia-300/80">
                    β
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === 'workbench' && <TextWorkbench />}
        {tab === 'baseline' && <BaselineEncoder />}
        {tab === 'transform' && <TransformationLab />}
        {tab === 'decode' && <Decoder />}
        {tab === 'benchmark' && <BenchmarkDashboard />}
        {tab === 'experimental' && <ExperimentalInterface />}
        {tab === 'about' && <AboutPanel />}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-slate-500 border-t border-slate-800 mt-6">
        <p>
          Anchor-Weave Research Lab v0.1 · The baseline watermark is a
          documented, reversible reference — <strong>not</strong> a secure or
          undetectable scheme, and <strong>not</strong> proof of authorship
          without a trusted identity key. Experimental algorithms are
          unvalidated prototypes.
        </p>
      </footer>
    </div>
  );
}
