/**
 * Benchmark harness.
 *
 * Runs a fixed, reproducible set of (sample, transform) pairs through the
 * baseline codec and computes aggregate metrics:
 *   - valid recovery rate : cases where the decoded payload EQUALS the
 *     originally embedded payload (checksum-valid alone is not enough)
 *   - marker evidence rate: any marker evidence (complete|partial|invalid)
 *     / total — this is the "marker presence" signal, NOT authorship
 *   - false positives     : reported under BOTH decision rules (see below)
 *   - marker overhead     : average markers-per-code-point at encode time
 *   - visual equivalence  : stripped(marked) === original, at encode time
 *
 * DECISION RULES (kept deliberately explicit; audit fix D2):
 *   - "valid recovery" rule : a positive is a fully valid frame whose
 *     payload matches what was embedded.
 *   - "marker evidence" rule: a positive is ANY marker evidence, including
 *     `partial` and `invalid`.
 *   False-positive rates are reported under both rules, because a rule that
 *   counts partial/invalid as evidence on watermarked text must not be
 *   compared against a complete-only false-positive rate.
 *
 * All samples are hard-coded so results are reproducible across runs and
 * machines. No randomness, no network, no persistent storage.
 */

import {
  encodeWatermark,
  decodeWatermark,
  stripMarkers,
  countMarkers,
  type DecodeStatus,
} from './watermark';
import { TRANSFORMS, type TransformId } from './transforms';

/** A reproducible test sample. */
export interface BenchmarkSample {
  id: string;
  label: string;
  text: string;
  payload: string;
}

/** Deterministic sample corpus. */
export const BENCHMARK_SAMPLES: BenchmarkSample[] = [
  {
    id: 'short',
    label: 'Short sentence',
    text: 'The quick brown fox jumps over the lazy dog.',
    payload: 'owner=alice;doc=1',
  },
  {
    id: 'medium',
    label: 'Two paragraphs',
    text:
      'Watermarking is the process of embedding a signal into a document. ' +
      'This signal can later be extracted to support ownership claims.\n\n' +
      'Invisible Unicode watermarks are fragile but easy to study.',
    payload: 'owner=bob;doc=42;ts=2026',
  },
  {
    id: 'unicode',
    label: 'Mixed script + accents',
    text: 'Café résumé — naïve façade. 日本語のテキスト。 Привет мир.',
    payload: 'id=xyz-777',
  },
  {
    id: 'code',
    label: 'Code-like text',
    text: 'function add(a, b) {\n  return a + b;\n}\nconst x = add(2, 3);',
    payload: 'license=internal',
  },
  {
    id: 'emoji',
    label: 'Emoji + surrogate pairs',
    text: 'Ship it 🚀🚀 — reviewed by 👩‍💻 and signed off ✅.',
    payload: 'release=v0.1',
  },
];

/**
 * Clean (never-watermarked) samples for false-positive testing.
 *
 * Expanded as part of audit fix D2: the corpus now includes texts with
 * stray zero-width characters (a realistic accident) so the "marker
 * evidence" false-positive rule is measured against inputs that can
 * actually produce a `partial` finding, instead of only plain prose.
 */
export interface CleanSample {
  id: string;
  label: string;
  text: string;
}

export const CLEAN_SAMPLES: CleanSample[] = [
  { id: 'clean-1', label: 'Plain prose', text: 'This text was never watermarked at all.' },
  {
    id: 'clean-2',
    label: 'Prose with stray zero-width present',
    text: 'A line with a stray\u200Bspace character in the middle.',
  },
  { id: 'clean-3', label: 'Whitespace only', text: '   ' },
  {
    id: 'clean-4',
    label: 'Prose with several stray mixed markers',
    text: 'Innocent\u200Ctext\u200Bwith\u200Cstray\u200Bmarkers.',
  },
  {
    id: 'clean-5',
    label: 'Prose with an emoji ZWJ sequence only',
    text: 'Reviewed by \u{1F469}\u200D\u{1F4BB} today.',
  },
  {
    id: 'clean-6',
    label: 'Prose with a long stray marker run (no valid magic)',
    text: 'Noise\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200C\u200Cin the middle here.',
  },
];

export interface CaseResult {
  sampleId: string;
  transformId: TransformId;
  status: DecodeStatus;
  /** Marker-evidence rule: true for complete | partial | invalid. */
  markerEvidence: boolean;
  /** Valid-recovery rule: true only when the decoded payload EQUALS the embedded payload. */
  recovered: boolean;
  markerCount: number;
  overheadRatio: number;
  visualEquivalent: boolean;
}

export interface TransformSummary {
  transformId: TransformId;
  total: number;
  /** Cases with a valid frame whose payload matched exactly. */
  complete: number;
  /** Cases with any marker evidence (complete | partial | invalid). */
  evidence: number;
  validRecoveryRate: number;
  markerEvidenceRate: number;
}

/**
 * False positives under BOTH documented decision rules (audit fix D2).
 * The previous report used the complete-only rule for false positives while
 * the detection rate counted partial/invalid — an asymmetric comparison that
 * flattered the false-positive number.
 */
export interface FalsePositiveSummary {
  tests: number;
  /** Valid-recovery rule: clean samples decoded as `complete`. */
  recoveryRulePositives: number;
  recoveryRuleRate: number;
  /** Marker-evidence rule: clean samples with complete | partial | invalid. */
  evidenceRulePositives: number;
  evidenceRuleRate: number;
}

export interface BenchmarkReport {
  totalCases: number;
  completeCases: number;
  partialCases: number;
  invalidCases: number;
  absentCases: number;
  /** CHANGED (audit fix D6): payload-equality based, not status-based. */
  validRecoveryRate: number;
  /** Marker-evidence rule rate (formerly "detection rate"). */
  markerEvidenceRate: number;
  avgOverhead: number;
  allVisualEquivalent: boolean;
  visualEquivalenceRate: number;
  falsePositives: FalsePositiveSummary;
  cases: CaseResult[];
  byTransform: TransformSummary[];
}

const DISTRIBUTED = { insertion: 'distributed' as const, stride: 4 };

/**
 * Run the full benchmark over the fixed corpus. Deterministic and offline.
 *
 * For each sample we produce a watermarked copy and run every transform, then
 * decode the result. There is no separate "control" case: `format-markdown`
 * (markers preserved, only line endings normalized) serves as the per-sample
 * markers-survive reference. (Previous docstring claimed a control case was
 * included; it was not — audit fix D3/README correction.)
 */
export function runBenchmark(): BenchmarkReport {
  const cases: CaseResult[] = [];

  for (const sample of BENCHMARK_SAMPLES) {
    const { marked } = encodeWatermark(sample.text, sample.payload, DISTRIBUTED);
    const overhead = overheadOf(marked);
    const visualEquivalent = stripMarkers(marked) === sample.text;

    const record = (transformId: TransformId, decoded: ReturnType<typeof decodeWatermark>) => {
      cases.push({
        sampleId: sample.id,
        transformId,
        status: decoded.status,
        // Marker-evidence rule (complete | partial | invalid), computed from
        // the status so it uses the SAME rule as markerEvidenceRate below.
        markerEvidence:
          decoded.status === 'complete' ||
          decoded.status === 'partial' ||
          decoded.status === 'invalid',
        // Valid-recovery rule: payload must equal what we embedded.
        recovered:
          decoded.status === 'complete' && decoded.payload === sample.payload,
        markerCount: countMarkers(marked),
        overheadRatio: overhead,
        visualEquivalent,
      });
    };

    // Markdown conversion preserves markers, so it doubles as the
    // "no-op / markers survive" reference case for each sample.
    for (const transform of TRANSFORMS) {
      const transformed = transform.apply(marked);
      record(transform.id, decodeWatermark(transformed));
    }
  }

  const totalCases = cases.length;
  const completeCases = cases.filter((c) => c.status === 'complete').length;
  const partialCases = cases.filter((c) => c.status === 'partial').length;
  const invalidCases = cases.filter((c) => c.status === 'invalid').length;
  const absentCases = cases.filter((c) => c.status === 'absent').length;
  const recoveredCases = cases.filter((c) => c.recovered).length;
  const evidenceCases = cases.filter((c) => c.markerEvidence).length;

  const avgOverhead =
    totalCases > 0
      ? cases.reduce((sum, c) => sum + c.overheadRatio, 0) / totalCases
      : 0;

  const visualOk = cases.filter((c) => c.visualEquivalent).length;

  // False positives under BOTH documented decision rules (audit fix D2).
  let recoveryRulePositives = 0;
  let evidenceRulePositives = 0;
  for (const clean of CLEAN_SAMPLES) {
    const result = decodeWatermark(clean.text);
    if (result.status === 'complete') recoveryRulePositives += 1;
    if (
      result.status === 'complete' ||
      result.status === 'partial' ||
      result.status === 'invalid'
    ) {
      evidenceRulePositives += 1;
    }
  }
  const tests = CLEAN_SAMPLES.length;

  return {
    totalCases,
    completeCases,
    partialCases,
    invalidCases,
    absentCases,
    validRecoveryRate: totalCases ? recoveredCases / totalCases : 0,
    markerEvidenceRate: totalCases ? evidenceCases / totalCases : 0,
    avgOverhead,
    allVisualEquivalent: visualOk === totalCases,
    visualEquivalenceRate: totalCases ? visualOk / totalCases : 0,
    falsePositives: {
      tests,
      recoveryRulePositives,
      recoveryRuleRate: tests ? recoveryRulePositives / tests : 0,
      evidenceRulePositives,
      evidenceRuleRate: tests ? evidenceRulePositives / tests : 0,
    },
    cases,
    byTransform: summarizeByTransform(cases),
  };
}

function overheadOf(marked: string): number {
  const markers = countMarkers(marked);
  const total = Array.from(marked).length;
  return total ? markers / total : 0;
}

function summarizeByTransform(cases: CaseResult[]): TransformSummary[] {
  const map = new Map<TransformId, TransformSummary>();
  for (const c of cases) {
    let entry = map.get(c.transformId);
    if (!entry) {
      entry = {
        transformId: c.transformId,
        total: 0,
        complete: 0,
        evidence: 0,
        validRecoveryRate: 0,
        markerEvidenceRate: 0,
      };
      map.set(c.transformId, entry);
    }
    entry.total += 1;
    if (c.recovered) entry.complete += 1;
    if (c.markerEvidence) entry.evidence += 1;
  }
  const summaries = Array.from(map.values());
  for (const s of summaries) {
    s.validRecoveryRate = s.total ? s.complete / s.total : 0;
    s.markerEvidenceRate = s.total ? s.evidence / s.total : 0;
  }
  return summaries;
}

