/**
 * Transformation Survival Profiler (research prototype).
 *
 * Measures how each transform in the existing catalogue (`transforms.ts`)
 * removes markers at DIFFERENT TEXT POSITIONS, and produces a composite
 * per-position survival score that the experimental adaptive encoder
 * (`adaptive.ts`) uses to rank candidate marker locations.
 *
 * METHOD (deterministic — no randomness anywhere):
 *  1. For every sample in the fixed corpus and every position bin (deciles
 *     of code-point boundaries), place a fixed 16-bit probe run
 *     (alternating 0/1 -> U+200B/U+200C) at the FIRST boundary of that bin.
 *  2. Apply the transform and count how many probe markers survive.
 *     survival(sample, transform, bin) = surviving / PROBE_BITS.
 *  3. Aggregate per bin across samples -> per-transform per-bin survival.
 *  4. Separately record, per transform: exact payload recovery rate on the
 *     reference encoding (baseline distributed, stride 4), marker evidence
 *     without payload recovery, and the reference marker overhead.
 *  5. positionScores[bin] = weighted average of per-transform survival for
 *     that bin (weights configurable, uniform by default).
 *
 * WHAT THIS IS NOT:
 *  - Not a claim about real editors/messengers; transforms here are
 *    simulated string operations (see transforms.ts).
 *  - Marker detection is never treated as ownership recovery: the profiler
 *    records payload recovery separately from marker evidence.
 *  - Probe survival at a bin measures POSITION sensitivity only. Transforms
 *    that are position-independent (e.g. strip everything) contribute the
 *    same value to every bin and therefore do not skew the ranking.
 */

import {
  ZERO_CHAR,
  ONE_CHAR,
  countMarkers,
  encodeWatermark,
  decodeWatermark,
} from './watermark';
import { toCodePoints } from './unicode';
import { TRANSFORMS, type TransformId } from './transforms';
import { BENCHMARK_SAMPLES, type BenchmarkSample } from './benchmark';

/** Number of position bins (deciles of code-point boundaries). */
export const PROFILER_BINS = 10;

/** Fixed probe length in bits: alternating 0101... (even count). */
export const PROBE_BITS = 16;

const PROBE_CHARS = Array.from({ length: PROBE_BITS }, (_, i) =>
  i % 2 === 0 ? ZERO_CHAR : ONE_CHAR,
).join('');

/** Reference encoding options — identical to the baseline benchmark. */
const REFERENCE_ENCODE = { insertion: 'distributed', stride: 4 } as const;

export interface TransformSurvival {
  transformId: TransformId;
  transformName: string;
  /** Human-readable configuration actually exercised. */
  config: string;
  /** Fraction of probe markers surviving, averaged over all probes. */
  markerSurvivalRate: number;
  /** Per-bin probe survival (length = bins). -1 when no probe covered it. */
  perBoundarySurvival: number[];
  /** Exact payload recovery rate over the corpus (reference encoding). */
  payloadRecoveryRate: number;
  /** True when at least one sample showed marker evidence but NOT recovery. */
  evidenceWithoutRecovery: boolean;
  /** Reference encoding overhead (markers / total code points), encode-time. */
  overheadRatio: number;
}

export interface SurvivalProfile {
  bins: number;
  weights: Record<TransformId, number>;
  /** Composite survival score per bin, 0..1 (higher = safer placement). */
  positionScores: number[];
  transforms: TransformSurvival[];
  /** Marker overhead of the reference encoding used while profiling. */
  referenceOverhead: number;
  samplesUsed: number;
  /** Human-readable description of the method (surfaced in docs/notes). */
  method: string;
}

export interface ProfileOptions {
  samples?: BenchmarkSample[];
  bins?: number;
  weights?: Partial<Record<TransformId, number>>;
}

/**
 * Profile marker survival across the transformation catalogue.
 * Deterministic for a given (samples, bins, weights) triple.
 */
export function profileSurvival(options: ProfileOptions = {}): SurvivalProfile {
  const samples = options.samples ?? BENCHMARK_SAMPLES;
  const bins = options.bins ?? PROFILER_BINS;
  const weights: Record<TransformId, number> = {
    ...defaultWeights(),
    ...options.weights,
  };

  // Accumulators per transform: sum of per-(sample,bin) survival + counts.
  const survivalSum = new Map<TransformId, number[]>();
  const survivalCount = new Map<TransformId, number[]>();
  const probeTotal = new Map<TransformId, number>();
  const probeSurvived = new Map<TransformId, number>();

  for (const t of TRANSFORMS) {
    survivalSum.set(t.id, new Array(bins).fill(0));
    survivalCount.set(t.id, new Array(bins).fill(0));
    probeTotal.set(t.id, 0);
    probeSurvived.set(t.id, 0);
  }

  for (const sample of samples) {
    const cps = toCodePoints(sample.text);
    const n = cps.length;
    if (n === 0) continue;
    // Group boundaries 1..n by bin once per sample.
    const binOfBoundary = (b: number) =>
      Math.min(bins - 1, Math.floor(((b - 1) * bins) / n));
    const firstBoundaryInBin: number[] = new Array(bins).fill(-1);
    for (let b = 1; b <= n; b++) {
      const bin = binOfBoundary(b);
      if (firstBoundaryInBin[bin] === -1) firstBoundaryInBin[bin] = b;
    }

    for (const t of TRANSFORMS) {
      const sum = survivalSum.get(t.id)!;
      const count = survivalCount.get(t.id)!;
      const total = probeTotal.get(t.id)!;
      const lived = probeSurvived.get(t.id)!;

      for (let bin = 0; bin < bins; bin++) {
        const boundary = firstBoundaryInBin[bin];
        if (boundary === -1) continue; // sample too short to cover this bin
        const probe = buildProbe(sample.text, boundary);
        const after = t.apply(probe);
        const surviving = countMarkers(after);
        sum[bin] += surviving / PROBE_BITS;
        count[bin] += 1;
        probeTotal.set(t.id, total + PROBE_BITS);
        probeSurvived.set(t.id, lived + surviving);
      }
    }
  }

  // Exact payload recovery + evidence-without-recovery per transform.
  const payloadRecovered = new Map<TransformId, number>();
  const evidenceOnly = new Map<TransformId, boolean>();
  const overheadBySample = new Map<TransformId, number[]>();
  for (const t of TRANSFORMS) {
    payloadRecovered.set(t.id, 0);
    evidenceOnly.set(t.id, false);
    overheadBySample.set(t.id, []);
  }
  for (const sample of samples) {
    const { marked, markerCount } = encodeWatermark(
      sample.text,
      sample.payload,
      REFERENCE_ENCODE,
    );
    const totalCp = Array.from(marked).length;
    const sampleOverhead = totalCp > 0 ? markerCount / totalCp : 0;
    for (const t of TRANSFORMS) {
      overheadBySample.get(t.id)!.push(sampleOverhead);
      const d = decodeWatermark(t.apply(marked));
      const recovered = d.status === 'complete' && d.payload === sample.payload;
      if (recovered) payloadRecovered.set(t.id, payloadRecovered.get(t.id)! + 1);
      const evidence =
        d.status === 'complete' || d.status === 'partial' || d.status === 'invalid';
      if (evidence && !recovered) evidenceOnly.set(t.id, true);
    }
  }

  const transformRows: TransformSurvival[] = TRANSFORMS.map((t) => {
    const sum = survivalSum.get(t.id)!;
    const count = survivalCount.get(t.id)!;
    const total = probeTotal.get(t.id)!;
    const lived = probeSurvived.get(t.id)!;
    const perBin = sum.map((s, i) => (count[i] > 0 ? s / count[i] : -1));
    const overheads = overheadBySample.get(t.id)!;
    return {
      transformId: t.id,
      transformName: t.name,
      config: configOf(t.id),
      markerSurvivalRate: total > 0 ? lived / total : 0,
      perBoundarySurvival: perBin,
      payloadRecoveryRate:
        samples.length > 0
          ? payloadRecovered.get(t.id)! / samples.length
          : 0,
      evidenceWithoutRecovery: evidenceOnly.get(t.id)!,
      overheadRatio:
        overheads.length > 0
          ? overheads.reduce((a, b) => a + b, 0) / overheads.length
          : 0,
    };
  });

  // Composite score: weighted mean over transforms that cover each bin.
  const positionScores: number[] = new Array(bins).fill(0);
  for (let bin = 0; bin < bins; bin++) {
    let wSum = 0;
    let vSum = 0;
    for (const row of transformRows) {
      const w = weights[row.transformId] ?? 0;
      const v = row.perBoundarySurvival[bin];
      if (w > 0 && v >= 0) {
        wSum += w;
        vSum += w * v;
      }
    }
    positionScores[bin] = wSum > 0 ? vSum / wSum : 0;
  }

  const refOverheads = samples.map((s) => {
    const { marked, markerCount } = encodeWatermark(
      s.text,
      s.payload,
      REFERENCE_ENCODE,
    );
    const totalCp = Array.from(marked).length;
    return totalCp > 0 ? markerCount / totalCp : 0;
  });

  return {
    bins,
    weights,
    positionScores,
    transforms: transformRows,
    referenceOverhead:
      refOverheads.length > 0
        ? refOverheads.reduce((a, b) => a + b, 0) / refOverheads.length
        : 0,
    samplesUsed: samples.length,
    method:
      'Per-bin 16-bit probe runs placed at decile boundaries of the fixed ' +
      'corpus, run through the simulated transformation catalogue; ' +
      'position scores are weight-averaged per-bin marker survival.',
  };
}

/** Memoized default profile (deterministic, computed once per page load). */
let cachedDefault: SurvivalProfile | null = null;

export function getDefaultProfile(): SurvivalProfile {
  if (!cachedDefault) cachedDefault = profileSurvival();
  return cachedDefault;
}

/** Compact human-readable summary lines (for docs, notes, and debugging). */
export function describeProfile(profile: SurvivalProfile): string[] {
  const lines: string[] = [
    `Profile: ${profile.samplesUsed} samples, ${profile.bins} bins, ` +
      `reference overhead ${(profile.referenceOverhead * 100).toFixed(1)}%`,
    'position scores: ' +
      profile.positionScores
        .map((s, i) => `b${i}=${s.toFixed(2)}`)
        .join(' '),
  ];
  for (const t of profile.transforms) {
    lines.push(
      `${t.transformId}: markerSurvival=${(t.markerSurvivalRate * 100).toFixed(0)}% ` +
        `payloadRecovery=${(t.payloadRecoveryRate * 100).toFixed(0)}% ` +
        `evidenceOnly=${t.evidenceWithoutRecovery} [${t.config}]`,
    );
  }
  return lines;
}


/** Uniform default weights over the whole transformation catalogue. */
export function defaultWeights(): Record<TransformId, number> {
  const weights = {} as Record<TransformId, number>;
  for (const t of TRANSFORMS) weights[t.id] = 1;
  return weights;
}

/** Documented configuration for catalogue transforms (catalogue defaults). */
function configOf(id: TransformId): string {
  switch (id) {
    case 'delete-markers':
      return 'deleteFraction=0.5 (catalogue default, deterministic)';
    case 'truncate-tail':
      return 'truncateFraction=0.25 (catalogue default, UTF-16 units)';
    default:
      return 'catalogue default parameters';
  }
}

/** Build the probe string with PROBE_CHARS inserted after boundary `b` (1..n). */
function buildProbe(text: string, boundary: number): string {
  const cps = toCodePoints(text);
  return cps.slice(0, boundary).join('') + PROBE_CHARS + cps.slice(boundary).join('');
}
