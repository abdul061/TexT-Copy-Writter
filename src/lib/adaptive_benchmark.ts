/**
 * Baseline-vs-adaptive comparison harness.
 *
 * Runs the untouched baseline codec (identical settings to benchmark.ts:
 * distributed weaving, stride 6) and the adaptive codec (r=1 and r=3) on the
 * EXACT same corpus: BENCHMARK_SAMPLES x TRANSFORMS, plus CLEAN_SAMPLES for
 * false-positive measurement under BOTH documented decision rules.
 *
 * Every metric is reported INDEPENDENTLY per method — recovery, marker
 * evidence, false positives, overhead and runtime are never combined into a
 * single score, and runtime is measured and reported but never asserted
 * (it is machine-dependent; all functional metrics are deterministic).
 *
 * Nothing here modifies or redefines the baseline; any difference between
 * methods comes from placement/redundancy alone.
 */

import {
  encodeWatermark,
  decodeWatermark,
  countMarkers,
  stripMarkers,
  type DecodeStatus,
} from './watermark';
import { TRANSFORMS, type TransformId } from './transforms';
import { BENCHMARK_SAMPLES, CLEAN_SAMPLES } from './benchmark';
import { encodeAdaptive, decodeAdaptive } from './adaptive';
import { codePointCount } from './unicode';

export type MethodId = 'baseline' | 'adaptive-r1' | 'adaptive-r3';

export interface MethodCaseResult {
  methodId: MethodId;
  sampleId: string;
  transformId: TransformId;
  status: DecodeStatus;
  /** Exact payload recovery: complete frame AND payload equals embedded one. */
  recovered: boolean;
  markerEvidence: boolean;
  visualEquivalent: boolean;
  decodeMs: number;
}

export interface TransformSummary {
  transformId: TransformId;
  total: number;
  recovered: number;
  evidence: number;
  recoveryRate: number;
  evidenceRate: number;
}

export interface FalsePositiveSummary {
  tests: number;
  recoveryRulePositives: number;
  recoveryRuleRate: number;
  evidenceRulePositives: number;
  evidenceRuleRate: number;
}

export interface MethodSummary {
  id: MethodId;
  label: string;
  /** Encode-time marker count per sample id. */
  markerCountBySample: Record<string, number>;
  totalCases: number;
  recoveredCases: number;
  evidenceCases: number;
  validRecoveryRate: number;
  markerEvidenceRate: number;
  /** Mean markers / visible code points over the corpus (encode time). */
  avgOverheadRatio: number;
  allVisualEquivalent: boolean;
  /** Runtime measured independently: encode total, decode total, sum. */
  encodeMs: number;
  decodeMs: number;
  runtimeMs: number;
  falsePositives: FalsePositiveSummary;
  byTransform: TransformSummary[];
  cases: MethodCaseResult[];
}

export interface ComparisonReport {
  methods: MethodSummary[];
  sampleIds: string[];
  transformIds: TransformId[];
  corpus: string;
}

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/** Per-method encode/decode so the two codecs stay interchangeable here. */
interface MethodAdapter {
  id: MethodId;
  label: string;
  encode(text: string, payload: string): { marked: string; markerCount: number };
  decode(input: string): { status: DecodeStatus; payload: string | null };
}

function adapters(): MethodAdapter[] {
  return [
    {
      id: 'baseline',
      label: 'Baseline ZW-binary (distributed, stride 6)',
      encode: (text, payload) => {
        const r = encodeWatermark(text, payload, { insertion: 'distributed', stride: 6 });
        return { marked: r.marked, markerCount: r.markerCount };
      },
      decode: (input) => {
        const r = decodeWatermark(input);
        return { status: r.status, payload: r.payload };
      },
    },
    {
      id: 'adaptive-r1',
      label: 'Adaptive placement, r=1 (same marker budget as baseline)',
      encode: (text, payload) => {
        const r = encodeAdaptive(text, payload, { repetition: 1 });
        return { marked: r.marked, markerCount: r.markerCount };
      },
      decode: (input) => {
        const r = decodeAdaptive(input, { repetition: 1 });
        return { status: r.baseline.status, payload: r.baseline.payload };
      },
    },
    {
      id: 'adaptive-r3',
      label: 'Adaptive placement + repetition r=3 (3x marker budget)',
      encode: (text, payload) => {
        const r = encodeAdaptive(text, payload, { repetition: 3 });
        return { marked: r.marked, markerCount: r.markerCount };
      },
      decode: (input) => {
        const r = decodeAdaptive(input, { repetition: 3 });
        return { status: r.baseline.status, payload: r.baseline.payload };
      },
    },
  ];
}

/** Run the full comparison over the fixed corpus. Deterministic metrics. */
export function runAdaptiveComparison(): ComparisonReport {
  const summaries: MethodSummary[] = [];

  for (const adapter of adapters()) {
    const cases: MethodCaseResult[] = [];
    const markerCountBySample: Record<string, number> = {};
    let overheadSum = 0;
    let encodeMs = 0;
    let decodeMs = 0;

    for (const sample of BENCHMARK_SAMPLES) {
      const t0 = now();
      const encoded = adapter.encode(sample.text, sample.payload);
      encodeMs += now() - t0;
      markerCountBySample[sample.id] = encoded.markerCount;
      overheadSum += encoded.markerCount / Math.max(1, codePointCount(sample.text));

      for (const transform of TRANSFORMS) {
        const transformed = transform.apply(encoded.marked);
        const d0 = now();
        const decoded = adapter.decode(transformed);
        decodeMs += now() - d0;
        cases.push({
          methodId: adapter.id,
          sampleId: sample.id,
          transformId: transform.id,
          status: decoded.status,
          recovered: decoded.status === 'complete' && decoded.payload === sample.payload,
          markerEvidence:
            decoded.status === 'complete' || decoded.status === 'partial' || decoded.status === 'invalid',
          visualEquivalent: stripMarkers(encoded.marked) === sample.text,
          decodeMs: now() - d0,
        });
      }
    }

    let recoveryRulePositives = 0;
    let evidenceRulePositives = 0;
    for (const clean of CLEAN_SAMPLES) {
      const d0 = now();
      const decoded = adapter.decode(clean.text);
      decodeMs += now() - d0;
      if (decoded.status === 'complete') recoveryRulePositives += 1;
      if (decoded.status !== 'absent') evidenceRulePositives += 1;
    }

    const total = cases.length;
    const recoveredCases = cases.filter((c) => c.recovered).length;
    const evidenceCases = cases.filter((c) => c.markerEvidence).length;
    const visualOk = cases.filter((c) => c.visualEquivalent).length;

    summaries.push({
      id: adapter.id,
      label: adapter.label,
      markerCountBySample,
      totalCases: total,
      recoveredCases,
      evidenceCases,
      validRecoveryRate: total ? recoveredCases / total : 0,
      markerEvidenceRate: total ? evidenceCases / total : 0,
      avgOverheadRatio: BENCHMARK_SAMPLES.length ? overheadSum / BENCHMARK_SAMPLES.length : 0,
      allVisualEquivalent: visualOk === total,
      encodeMs,
      decodeMs,
      runtimeMs: encodeMs + decodeMs,
      falsePositives: {
        tests: CLEAN_SAMPLES.length,
        recoveryRulePositives,
        recoveryRuleRate: CLEAN_SAMPLES.length ? recoveryRulePositives / CLEAN_SAMPLES.length : 0,
        evidenceRulePositives,
        evidenceRuleRate: CLEAN_SAMPLES.length ? evidenceRulePositives / CLEAN_SAMPLES.length : 0,
      },
      byTransform: TRANSFORMS.map((t) => {
        const rows = cases.filter((c) => c.transformId === t.id);
        const rec = rows.filter((c) => c.recovered).length;
        const ev = rows.filter((c) => c.markerEvidence).length;
        return {
          transformId: t.id,
          total: rows.length,
          recovered: rec,
          evidence: ev,
          recoveryRate: rows.length ? rec / rows.length : 0,
          evidenceRate: rows.length ? ev / rows.length : 0,
        };
      }),
      cases,
    });
  }

  return {
    methods: summaries,
    sampleIds: BENCHMARK_SAMPLES.map((s) => s.id),
    transformIds: TRANSFORMS.map((t) => t.id),
    corpus: `${BENCHMARK_SAMPLES.length} samples x ${TRANSFORMS.length} transforms (+${CLEAN_SAMPLES.length} clean FP samples)`,
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** Markdown comparison table: one row per method, metrics kept independent. */
export function formatComparisonTable(report: ComparisonReport): string {
  const header =
    '| Method | Exact recovery | Marker evidence | FP (recovery rule) | FP (evidence rule) | Overhead (markers/cp) | Encode ms | Decode ms |';
  const sep = '|---|---|---|---|---|---|---|---|';
  const rows = report.methods.map((m) => {
    const fp = m.falsePositives;
    return (
      `| ${m.id} | ${pct(m.validRecoveryRate)} (${m.recoveredCases}/${m.totalCases})` +
      ` | ${pct(m.markerEvidenceRate)} (${m.evidenceCases}/${m.totalCases})` +
      ` | ${fp.recoveryRulePositives}/${fp.tests} | ${fp.evidenceRulePositives}/${fp.tests}` +
      ` | ${m.avgOverheadRatio.toFixed(2)} | ${m.encodeMs.toFixed(2)} | ${m.decodeMs.toFixed(2)} |`
    );
  });
  return [`Corpus: ${report.corpus}`, '', header, sep, ...rows].join('\n');
}

/** Per-transform exact-recovery matrix (rows = transforms, cols = methods). */
export function formatByTransformMatrix(report: ComparisonReport): string {
  const ids = report.methods.map((m) => m.id);
  const header = `| Transform | ${ids.join(' | ')} |`;
  const sep = `|---|${ids.map(() => '---').join('|')}|`;
  const rows = report.transformIds.map((tid) => {
    const cells = report.methods.map((m) => {
      const s = m.byTransform.find((x) => x.transformId === tid);
      return s ? `${s.recovered}/${s.total}` : '-';
    });
    return `| ${tid} | ${cells.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

