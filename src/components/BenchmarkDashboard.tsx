import { useMemo, useState } from 'react';
import { Play, Download } from 'lucide-react';
import { Card, Badge } from './Primitives';
import { Button } from './Buttons';
import { runBenchmark, type BenchmarkReport } from '../lib/benchmark';
import { pct, cx } from '../lib/ui';
import { StatusBadge } from './StatusBadge';

/**
 * Benchmark Dashboard: run the fixed, reproducible corpus through the baseline
 * codec and every transformation, then display aggregate metrics.
 */
export function BenchmarkDashboard() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      setReport(runBenchmark());
      setRunning(false);
    }, 0);
  };

  const summaryJson = useMemo(
    () => (report ? JSON.stringify(report, null, 2) : ''),
    [report],
  );

  const download = () => {
    const blob = new Blob([summaryJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anchor-weave-benchmark.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <Card
        title="Benchmark Dashboard"
        subtitle="Run a fixed corpus of samples through the baseline watermark and every transformation. Results are deterministic and reproducible."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={running}>
            <Play size={16} /> {running ? 'Running…' : 'Run benchmark'}
          </Button>
          {report && (
            <Button variant="secondary" onClick={download}>
              <Download size={16} /> Download JSON
            </Button>
          )}
          <span className="text-xs text-slate-500">
            Uses a hard-coded corpus — no randomness, no network.
          </span>
        </div>
      </Card>
      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Valid recovery rate"
              value={pct(report.validRecoveryRate)}
              hint="decoded payload == embedded payload / total cases"
              tone={report.validRecoveryRate > 0.5 ? 'good' : 'warn'}
            />
            <MetricCard
              label="Marker evidence rate"
              value={pct(report.markerEvidenceRate)}
              hint="any marker evidence (complete/partial/invalid)"
              tone="info"
            />
            <MetricCard
              label="False positives — recovery rule"
              value={pct(report.falsePositives.recoveryRuleRate)}
              hint={`${report.falsePositives.recoveryRulePositives}/${report.falsePositives.tests} clean samples fully decoded`}
              tone={report.falsePositives.recoveryRulePositives === 0 ? 'good' : 'bad'}
            />
            <MetricCard
              label="False positives — evidence rule"
              value={pct(report.falsePositives.evidenceRuleRate)}
              hint={`${report.falsePositives.evidenceRulePositives}/${report.falsePositives.tests} clean samples with any marker evidence`}
              tone={report.falsePositives.evidenceRulePositives === 0 ? 'good' : 'warn'}
            />
            <MetricCard
              label="Marker overhead"
              value={pct(report.avgOverhead)}
              hint="avg markers / code points at encode time"
              tone="neutral"
            />
            <MetricCard
              label="Visual equivalence"
              value={pct(report.visualEquivalenceRate)}
              hint="visible text preserved on encode"
              tone={report.allVisualEquivalent ? 'good' : 'bad'}
            />
            <MetricCard
              label="Total cases"
              value={String(report.totalCases)}
              hint={`${report.completeCases} complete, ${report.partialCases} partial, ${report.invalidCases} invalid, ${report.absentCases} absent`}
              tone="neutral"
            />
          </div>

          <Card
            title="Per-transformation breakdown"
            subtitle="Valid recovery (payload equality) and marker evidence grouped by transformation."
          >
            <div className="overflow-x-auto rounded-md ring-1 ring-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Transform</th>
                    <th className="text-right px-3 py-2">Cases</th>
                    <th className="text-right px-3 py-2">Recovered</th>
                    <th className="text-right px-3 py-2">Evidence</th>
                    <th className="text-right px-3 py-2">Recovery</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byTransform.map((t) => (
                    <tr key={t.transformId} className="border-t border-slate-800">
                      <td className="px-3 py-2 font-mono text-slate-200">
                        {t.transformId}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-400">{t.total}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{t.complete}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{t.evidence}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge tone={t.validRecoveryRate > 0.5 ? 'good' : 'warn'}>
                          {pct(t.validRecoveryRate)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Case detail" subtitle="Every (sample, transform) pair.">
            <div className="max-h-96 overflow-auto rounded-md ring-1 ring-slate-700">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Sample</th>
                    <th className="text-left px-3 py-2">Transform</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Overhead</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {report.cases.map((c, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="px-3 py-1 text-slate-300">{c.sampleId}</td>
                      <td className="px-3 py-1 text-slate-400">{c.transformId}</td>
                      <td className="px-3 py-1">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-1 text-right text-slate-400">
                        {pct(c.overheadRatio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral';
}) {
  const color = {
    good: 'text-emerald-300',
    warn: 'text-amber-300',
    bad: 'text-rose-300',
    info: 'text-sky-300',
    neutral: 'text-slate-200',
  }[tone];
  return (
    <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-700/60 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={cx('text-2xl font-semibold mt-1', color)}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{hint}</div>
    </div>
  );
}
