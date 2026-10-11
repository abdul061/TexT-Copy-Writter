import { describe, it, expect } from 'vitest';
import { runBenchmark, BENCHMARK_SAMPLES, CLEAN_SAMPLES } from '../lib/benchmark';
import { TRANSFORMS } from '../lib/transforms';

describe('benchmark harness', () => {
  const report = runBenchmark();

  it('produces one case per (sample, transform) pair', () => {
    expect(report.totalCases).toBe(report.cases.length);
    expect(report.totalCases).toBe(BENCHMARK_SAMPLES.length * TRANSFORMS.length);
  });

  it('reports status counts consistent with the total', () => {
    const sum =
      report.completeCases +
      report.partialCases +
      report.invalidCases +
      report.absentCases;
    expect(sum).toBe(report.totalCases);
  });

  // ---------------------------------------------------------------------------
  // Decision rules (audit fix D2): valid recovery = payload equality;
  // marker evidence = complete | partial | invalid. Both false-positive rules
  // are asserted so the two metrics can never drift apart silently again.
  // ---------------------------------------------------------------------------
  it('computes valid recovery strictly by payload equality, not by status alone', () => {
    for (const c of report.cases) {
      // recovered must equal "complete AND payload matched" by construction;
      // on this corpus every complete frame matched, so the two counts agree.
      expect(c.recovered).toBe(c.status === 'complete');
    }
    const recoveredCount = report.cases.filter((c) => c.recovered).length;
    expect(report.validRecoveryRate).toBe(recoveredCount / report.totalCases);
    expect(report.completeCases).toBe(recoveredCount);
  });

  it('computes marker evidence from the same rule used for false positives', () => {
    for (const c of report.cases) {
      expect(c.markerEvidence).toBe(
        c.status === 'complete' || c.status === 'partial' || c.status === 'invalid',
      );
    }
    const evidenceCount = report.cases.filter((c) => c.markerEvidence).length;
    expect(report.markerEvidenceRate).toBe(evidenceCount / report.totalCases);
  });

  it('runs the expanded clean corpus and reports false positives under BOTH rules', () => {
    expect(report.falsePositives.tests).toBe(CLEAN_SAMPLES.length);
    expect(report.falsePositives.tests).toBe(6);
    // Valid-recovery rule: no clean text ever fully decodes as a frame.
    expect(report.falsePositives.recoveryRulePositives).toBe(0);
    expect(report.falsePositives.recoveryRuleRate).toBe(0);
    // Marker-evidence rule (measured on this corpus): clean-2 (1 stray ZWSP)
    // and clean-4 (several strays) report `partial`; clean-6 (a long run of
    // ZWNJ with no valid magic) reports `invalid`. None of them ever reach a
    // valid frame — which is exactly why both numbers must be shown together.
    expect(report.falsePositives.evidenceRulePositives).toBe(3);
    expect(report.falsePositives.evidenceRuleRate).toBe(3 / CLEAN_SAMPLES.length);
  });

  it('preserves visible text on every encode (visual equivalence)', () => {
    expect(report.allVisualEquivalent).toBe(true);
    expect(report.visualEquivalenceRate).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Claimed transform outcomes (audit fix D3): every transform in the
  // catalogue now has an explicit, pinned assertion.
  // ---------------------------------------------------------------------------
  const claimedPreserving = [
    'nfc',
    'nfd',
    'nfkc',
    'nfkd',
    'whitespace-cleanup',
    'format-markdown',
  ] as const;

  const claimedDestructive = [
    'strip-zero-width',
    'plaintext-copy',
    'format-html',
    'format-pdf-like',
    'retype-visible',
  ] as const;

  it.each(claimedPreserving)(
    '%s fully recovers every sample (recovery 1.0, evidence 1.0)',
    (id) => {
      const t = report.byTransform.find((x) => x.transformId === id);
      expect(t).toBeDefined();
      expect(t!.total).toBe(BENCHMARK_SAMPLES.length);
      expect(t!.validRecoveryRate).toBe(1);
      expect(t!.markerEvidenceRate).toBe(1);
    },
  );

  it.each(claimedDestructive)(
    '%s destroys the watermark (recovery 0.0, evidence 0.0)',
    (id) => {
      const t = report.byTransform.find((x) => x.transformId === id);
      expect(t).toBeDefined();
      expect(t!.validRecoveryRate).toBe(0);
      expect(t!.markerEvidenceRate).toBe(0);
    },
  );

  it('partial marker deletion: evidence survives, recovery never does', () => {
    const t = report.byTransform.find((x) => x.transformId === 'delete-markers');
    expect(t).toBeDefined();
    // 50% deterministic deletion corrupts the frame -> `invalid` on all
    // samples: marker evidence yes, payload recovery never.
    expect(t!.markerEvidenceRate).toBe(1);
    expect(t!.validRecoveryRate).toBe(0);
    expect(t!.complete).toBe(0);
  });

  it('tail truncation: header evidence survives, no payload is recovered (measured)', () => {
    const t = report.byTransform.find((x) => x.transformId === 'truncate-tail');
    expect(t).toBeDefined();
    // Measured on the fixed corpus: 5/5 partial, 0 recovered at a 25% trim.
    expect(t!.markerEvidenceRate).toBe(1);
    expect(t!.validRecoveryRate).toBe(0);
    expect(t!.complete).toBe(0);
  });

  it('is deterministic across runs', () => {
    const again = runBenchmark();
    expect(again.validRecoveryRate).toBe(report.validRecoveryRate);
    expect(again.markerEvidenceRate).toBe(report.markerEvidenceRate);
    expect(again.totalCases).toBe(report.totalCases);
    expect(again.falsePositives).toEqual(report.falsePositives);
  });
});
