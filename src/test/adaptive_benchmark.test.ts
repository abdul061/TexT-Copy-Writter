import { describe, expect, it } from 'vitest';
import {
  runAdaptiveComparison,
  formatComparisonTable,
  formatByTransformMatrix,
} from '../lib/adaptive_benchmark';
import { TRANSFORMS } from '../lib/transforms';
import { BENCHMARK_SAMPLES, CLEAN_SAMPLES } from '../lib/benchmark';

const report = runAdaptiveComparison();

describe('comparison harness structure', () => {
  it('runs all three methods over the full corpus', () => {
    expect(report.methods).toHaveLength(3);
    const perMethod = BENCHMARK_SAMPLES.length * TRANSFORMS.length;
    for (const m of report.methods) expect(m.totalCases).toBe(perMethod);
    expect(report.corpus).toContain(`${BENCHMARK_SAMPLES.length} samples`);
  });

  it('measures false positives on the identical clean corpus for every method', () => {
    const first = report.methods[0].falsePositives;
    for (const m of report.methods) {
      expect(m.falsePositives.tests).toBe(CLEAN_SAMPLES.length);
      // Same decision rules, same corpus -> identical FP counts (parity).
      expect(m.falsePositives.recoveryRulePositives).toBe(first.recoveryRulePositives);
      expect(m.falsePositives.evidenceRulePositives).toBe(first.evidenceRulePositives);
    }
  });

  it('reports overhead independently: r=1 equals baseline, r=3 is 3x', () => {
    const [baseline, r1, r3] = report.methods;
    for (const s of BENCHMARK_SAMPLES) {
      expect(r1.markerCountBySample[s.id]).toBe(baseline.markerCountBySample[s.id]);
      expect(r3.markerCountBySample[s.id]).toBe(3 * baseline.markerCountBySample[s.id]);
    }
    expect(r1.avgOverheadRatio).toBeCloseTo(baseline.avgOverheadRatio, 10);
    expect(r3.avgOverheadRatio).toBeCloseTo(3 * baseline.avgOverheadRatio, 10);
  });

  it('reports runtime independently for every method (positive, finite)', () => {
    for (const m of report.methods) {
      expect(m.encodeMs).toBeGreaterThan(0);
      expect(m.decodeMs).toBeGreaterThan(0);
      expect(Number.isFinite(m.runtimeMs)).toBe(true);
    }
  });
});

describe('measured per-transform outcomes', () => {
  const [baseline, r1, r3] = report.methods;
  const rate = (m: typeof baseline, id: string) =>
    m.byTransform.find((x) => x.transformId === id)!.recoveryRate;

  it('marker-preserving transforms: every method recovers 100%', () => {
    for (const id of ['nfc', 'nfd', 'nfkc', 'nfkd', 'whitespace-cleanup', 'format-markdown']) {
      expect(rate(baseline, id)).toBe(1);
      expect(rate(r1, id)).toBe(1);
      expect(rate(r3, id)).toBe(1);
    }
  });

  it('marker-destroying transforms: every method recovers 0% and reports no evidence', () => {
    for (const id of ['strip-zero-width', 'plaintext-copy', 'format-html', 'format-pdf-like', 'retype-visible']) {
      expect(rate(baseline, id)).toBe(0);
      expect(rate(r1, id)).toBe(0);
      expect(rate(r3, id)).toBe(0);
      expect(baseline.byTransform.find((x) => x.transformId === id)!.evidenceRate).toBe(0);
      expect(r1.byTransform.find((x) => x.transformId === id)!.evidenceRate).toBe(0);
      expect(r3.byTransform.find((x) => x.transformId === id)!.evidenceRate).toBe(0);
    }
  });

  it('random 50% marker deletion defeats all three methods (honest null result)', () => {
    expect(rate(baseline, 'delete-markers')).toBe(0);
    expect(rate(r1, 'delete-markers')).toBe(0);
    expect(rate(r3, 'delete-markers')).toBe(0);
  });

  it('truncate-tail: recovery improves monotonically with redundancy', () => {
    // Measured on the fixed corpus (deterministic): baseline recovers none;
    // profile-guided placement alone (r=1) recovers a strict subset of the
    // samples (the long-text sample, where the safe region holds the frame);
    // interleaved redundancy (r=3) recovers all of them.
    expect(rate(baseline, 'truncate-tail')).toBe(0);
    expect(rate(r1, 'truncate-tail')).toBeGreaterThan(rate(baseline, 'truncate-tail'));
    expect(rate(r1, 'truncate-tail')).toBeLessThan(1);
    expect(rate(r3, 'truncate-tail')).toBe(1);
  });

  it('headline totals are recomputed from the corpus, never hardcoded upstream', () => {
    // Measured outcome on the fixed corpus: 6 preserve-all transforms recover
    // for every method; truncate-tail adds +1 sample at r=1 and +5 at r=3.
    expect(baseline.recoveredCases).toBe(6 * BENCHMARK_SAMPLES.length);
    expect(r1.recoveredCases).toBe(6 * BENCHMARK_SAMPLES.length + 1);
    expect(r3.recoveredCases).toBe(7 * BENCHMARK_SAMPLES.length);
  });
});

describe('report rendering', () => {
  it('prints a table with all required independent metrics', () => {
    const table = formatComparisonTable(report);
    for (const label of ['Exact recovery', 'Marker evidence', 'FP (recovery rule)', 'FP (evidence rule)', 'Overhead', 'Encode ms', 'Decode ms']) {
      expect(table).toContain(label);
    }
    for (const m of report.methods) expect(table).toContain(m.id);
  });

  it('prints a per-transform matrix covering every transform', () => {
    const matrix = formatByTransformMatrix(report);
    for (const t of TRANSFORMS) expect(matrix).toContain(t.id);
  });
});
