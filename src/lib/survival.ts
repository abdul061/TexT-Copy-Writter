/**
 * Marker survival profiling by visible-text boundary / position bin.
 *
 * RESEARCH MODULE (milestone: adaptive placement). Pure measurement code —
 * it never modifies the baseline codec; it only calls encodeWatermark() to
 * produce probes and reads markers out of transformed strings.
 *
 * METHOD
 * ------
 * 1. Encode a probe with the baseline codec (distributed, stride 6) and record
 *    the visible-code-point boundary every marker was woven after.
 * 2. Apply a transformation and extract the surviving U+200B/U+200C markers
 *    (in document order) with their boundaries in the transformed text.
 * 3. Attribute survivors back to the original boundaries:
 *      - EXACT mode when the transformed visible text equals the original
 *        visible text, or is a strict prefix of it (covers delete-markers,
 *        truncate-tail and the five marker-stripping transforms).
 *      - FRACTIONAL fallback otherwise (normalization / whitespace collapse):
 *        a survivor at relative position f in the transformed text is
 *        attributed to the original boundary at relative position f. This is
 *        an APPROXIMATION; it is only reached for transforms that preserve
 *        every marker, where the measured survival is 1.0 in every bin
 *        regardless, so the approximation does not distort the profile.
 * 4. Survival is aggregated into SURVIVAL_BIN_COUNT normalized position bins
 *    over the visible text of the fixed benchmark corpus.
 *
 * Everything is deterministic (fixed corpus, fixed transforms, no randomness).
 * In-browser and offline: no network, no storage, no eval.
 *
 * NOVELTY CLAIMS: none. Position-aware embedding is a standard idea in the
 * watermarking literature; this module only measures OUR transform suite.
 */

import { ZERO_CHAR, ONE_CHAR, encodeWatermark } from './watermark';
import { TRANSFORMS, type TransformId } from './transforms';
import { BENCHMARK_SAMPLES, type BenchmarkSample } from './benchmark';

/** Number of normalized position bins over the visible text. */
export const SURVIVAL_BIN_COUNT = 10;

/** True for the two baseline marker code points. */
export function isBaselineMarker(char: string): boolean {
  return char === ZERO_CHAR || char === ONE_CHAR;
}

/** Visible text of a string with all baseline markers removed. */
export function visibleText(input: string): string {
  let out = '';
  for (const ch of input) if (!isBaselineMarker(ch)) out += ch;
  return out;
}

/** A marker and the visible-code-point boundary it sits after. */
export interface MarkerPosition {
  /** Number of visible code points before this marker. */
  boundary: number;
  char: string;
}

/** Walk a string and record every baseline marker with its boundary. */
export function extractMarkerPositions(input: string): MarkerPosition[] {
  const positions: MarkerPosition[] = [];
  let visible = 0;
  for (const ch of input) {
    if (isBaselineMarker(ch)) {
      positions.push({ boundary: visible, char: ch });
    } else {
      visible += 1;
    }
  }
  return positions;
}

/** Normalized bin index for a boundary over a text of `length` code points. */
export function binOfBoundary(boundary: number, length: number, bins = SURVIVAL_BIN_COUNT): number {
  if (length <= 0) return 0;
  const b = Math.floor((boundary / length) * bins);
  return Math.min(bins - 1, Math.max(0, b));
}

/** Per-boundary survival counts for one (marked, transformed) pair. */
export interface BoundarySurvival {
  /** Original marker count per boundary. */
  totalByBoundary: Map<number, number>;
  /** Surviving marker count per ORIGINAL boundary. */
  survivedByBoundary: Map<number, number>;
  totalMarkers: number;
  survivors: number;
  /** How survivors were attributed back to original boundaries. */
  alignment: 'exact' | 'prefix' | 'fractional';
}

/**
 * Measure which markers survived a transformation, per original boundary.
 * See module docstring for the alignment rules.
 */
export function measureBoundarySurvival(marked: string, transformed: string): BoundarySurvival {
  const original = extractMarkerPositions(marked);
  const survivorsInTransformed = extractMarkerPositions(transformed);

  const totalByBoundary = new Map<number, number>();
  for (const p of original) {
    totalByBoundary.set(p.boundary, (totalByBoundary.get(p.boundary) ?? 0) + 1);
  }

  const visibleOriginal = visibleText(marked);
  const visibleTransformed = visibleText(transformed);
  const survivedByBoundary = new Map<number, number>();
  const addSurvivor = (boundary: number) => {
    survivedByBoundary.set(boundary, (survivedByBoundary.get(boundary) ?? 0) + 1);
  };

  let alignment: BoundarySurvival['alignment'];
  if (visibleTransformed === visibleOriginal) {
    alignment = 'exact';
    for (const p of survivorsInTransformed) addSurvivor(p.boundary);
  } else if (
    visibleOriginal.length > 0 &&
    visibleTransformed.length <= visibleOriginal.length &&
    visibleOriginal.startsWith(visibleTransformed)
  ) {
    alignment = 'prefix';
    for (const p of survivorsInTransformed) addSurvivor(p.boundary);
  } else {
    alignment = 'fractional';
    const denom = Math.max(1, visibleTransformed.length);
    for (const p of survivorsInTransformed) {
      const frac = p.boundary / denom;
      addSurvivor(Math.round(frac * visibleOriginal.length));
    }
  }

  return {
    totalByBoundary,
    survivedByBoundary,
    totalMarkers: original.length,
    survivors: survivorsInTransformed.length,
    alignment,
  };
}


/** Survival profile for one transformation, aggregated over samples. */
export interface TransformSurvivalProfile {
  transformId: TransformId;
  totalMarkers: number;
  survivors: number;
  /** binMarkers[i] = markers observed in bin i. */
  binMarkers: number[];
  /** binSurvivors[i] = surviving markers in bin i. */
  binSurvivors: number[];
  /** binSurvival[i] = survivors/markers in bin i, or 0 when the bin is empty. */
  binSurvival: number[];
}

/** Encode a probe with the exact baseline benchmark settings. */
export function encodeProbe(sample: BenchmarkSample): string {
  return encodeWatermark(sample.text, sample.payload, {
    insertion: 'distributed',
    stride: 6,
  }).marked;
}

/**
 * Measure the position-survival profile of every transformation over a fixed
 * corpus. Deterministic: same inputs -> same profile, every run.
 */
export function measureSurvivalProfiles(
  samples: BenchmarkSample[] = BENCHMARK_SAMPLES,
  transforms = TRANSFORMS,
): TransformSurvivalProfile[] {
  return transforms.map((transform) => {
    const binMarkers = new Array<number>(SURVIVAL_BIN_COUNT).fill(0);
    const binSurvivors = new Array<number>(SURVIVAL_BIN_COUNT).fill(0);
    let totalMarkers = 0;
    let survivors = 0;

    for (const sample of samples) {
      const marked = encodeProbe(sample);
      const transformed = transform.apply(marked);
      const measured = measureBoundarySurvival(marked, transformed);
      const length = visibleText(marked).length;
      for (const [boundary, count] of measured.totalByBoundary) {
        binMarkers[binOfBoundary(boundary, length)] += count;
        totalMarkers += count;
      }
      for (const [boundary, count] of measured.survivedByBoundary) {
        binSurvivors[binOfBoundary(boundary, length)] += count;
        survivors += count;
      }
    }

    // Fractional attribution (approximate alignment) can map more survivors
    // into a sparse bin than probes were observed there; per-marker survival
    // cannot exceed certainty, so the ratio is clamped to 1.
    const binSurvival = binMarkers.map((m, i) => (m > 0 ? Math.min(1, binSurvivors[i] / m) : 0));
    return { transformId: transform.id, totalMarkers, survivors, binMarkers, binSurvivors, binSurvival };
  });
}

/**
 * Uniform aggregate over transformations (one vote per transform), used as
 * the placement prior. Transforms with no markers in a bin are skipped for
 * that bin. Marker-destroying transforms contribute 0 to every bin, which
 * scales the profile uniformly and therefore preserves the RELATIVE ranking
 * of positions — no transform is cherry-picked out.
 */
export function aggregateSurvivalProfile(
  profiles: TransformSurvivalProfile[],
  bins = SURVIVAL_BIN_COUNT,
): number[] {
  const out = new Array<number>(bins).fill(0);
  for (let bin = 0; bin < bins; bin++) {
    let sum = 0;
    let counted = 0;
    for (const p of profiles) {
      if (p.binMarkers[bin] > 0) {
        sum += p.binSurvival[bin];
        counted += 1;
      }
    }
    out[bin] = counted > 0 ? sum / counted : 0;
  }
  return out;
}
