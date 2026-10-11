/**
 * ADAPTIVE PLACEMENT CODEC (research milestone: baseline vs. adaptive).
 *
 * ISOLATED MODULE — the baseline codec in `watermark.ts` is not modified and
 * is not aware of this file. The adaptive codec deliberately REUSES the
 * baseline AWL1 frame: frame bits are harvested by encoding with the untouched
 * baseline (`insertion: 'start'`) and the decoder delegates final
 * classification to the untouched `decodeWatermark()`, so any difference in
 * benchmark results is attributable to PLACEMENT and REDUNDANCY only, never
 * to a different frame format.
 *
 * PLACEMENT (profile-guided)
 * --------------------------
 * The visible text is split into SURVIVAL_BIN_COUNT normalized bins. A
 * survival profile measured by `survival.ts` over the fixed corpus scores each
 * bin. Placement selects only boundaries in the bins with the MAXIMUM measured
 * survival score ("safe region"), ordered by ascending boundary so that
 * document order equals frame order, and distributes the marker sequence
 * evenly (front-loaded, per-boundary counts differ by at most one). When the
 * text has fewer safe boundaries than markers, the overflow CLUSTERS inside
 * the safe region instead of being appended at the document end.
 *
 * Rationale: exact payload recovery requires EVERY frame marker to survive, so
 * even a partially-surviving bin is rejected in favor of clustering in a
 * fully-surviving region. This is a design choice for the exact-recovery
 * objective, not a universal optimum.
 *
 * REDUNDANCY (documented error correction)
 * ----------------------------------------
 * Repetition code with block interleaving + majority vote:
 *   - encode: the frame marker sequence F (length n) is emitted r times
 *     back-to-back — S = [F, F, ..., F] — and placed monotonically over the
 *     safe region, so a contiguous region loss (e.g. tail truncation) removes
 *     at most the LAST blocks and preserves order.
 *   - decode: for each candidate block length g (searched from floor(m/2)
 *     down to MIN_BLOCK_MARKERS = 64), the first floor(m/g) blocks vote
 *     bit-wise; the reconstructed frame is validated by the baseline
 *     AWL1 magic + checksum. The first candidate that yields a `complete`
 *     baseline decode wins. Because surviving copies in a deletion-only
 *     channel carry identical values, one surviving copy per bit suffices;
 *     the checksum makes a false validation over the ~m/2 candidates
 *     negligible (magic alone is a 2^-32 gate per candidate).
 *   - `r` should be odd (ties in a mixed channel resolve to 0, deterministic).
 *
 * HONEST LIMITATIONS
 * ------------------
 * - The default profile is measured IN-SAMPLE (same corpus that is
 *   benchmarked). Held-out validation needs a larger corpus; not done here.
 * - The redundancy corrects REGION loss (prefix-preserving deletion). RANDOM
 *   per-marker deletion misaligns the block structure and defeats the search;
 *   see the benchmark report.
 * - Marker-stripping transforms still destroy everything: payloads are
 *   reported as unrecoverable (status `absent`), never silently guessed.
 * - No key, no security, no novelty or patentability claim. Adaptive
 *   placement and repetition coding are standard ideas; this module only
 *   measures them against THIS transform suite.
 * - Browser-only, offline: no network, no storage, no eval.
 */

import {
  ZERO_CHAR,
  ONE_CHAR,
  encodeWatermark,
  decodeWatermark,
  countMarkers,
  type DecodeResult,
} from './watermark';
import { toCodePoints } from './unicode';
import {
  aggregateSurvivalProfile,
  binOfBoundary,
  isBaselineMarker,
  measureSurvivalProfiles,
} from './survival';

export const DEFAULT_REPETITION = 3;
/** Smallest frame the baseline can parse is the 8-byte (64-marker) header. */
export const MIN_BLOCK_MARKERS = 64;

/**
 * IN-SAMPLE default placement profile: uniform aggregate of the measured
 * position-survival profiles over the fixed benchmark corpus. Documented as
 * in-sample; see module docstring.
 */
export const MEASURED_PLACEMENT_PROFILE: number[] = aggregateSurvivalProfile(
  measureSurvivalProfiles(),
);

export interface AdaptiveEncodeOptions {
  /** Repetition factor r >= 1 (odd recommended). Default DEFAULT_REPETITION. */
  repetition?: number;
  /** Per-bin survival scores; default MEASURED_PLACEMENT_PROFILE. */
  profile?: number[];
}

export interface AdaptiveEncodeResult {
  marked: string;
  /** Total markers placed (== frameBits * repetition). */
  markerCount: number;
  /** Markers in ONE copy of the frame. */
  frameBitCount: number;
  repetition: number;
  /** Distinct safe boundaries available in the text. */
  safeBoundaryCount: number;
  /** True when markers per safe boundary exceeded 1 (short text / long frame). */
  clustered: boolean;
  overheadRatio: number;
  notes: string[];
}

export interface AdaptiveDecodeResult {
  /** Classification delegated to the untouched baseline decoder. */
  baseline: DecodeResult;
  repetition: number;
  markersExtracted: number;
  /** Block length that validated, or null when none did. */
  validatedBlockLength: number | null;
  notes: string[];
}

/** Harvest the AWL1 frame marker sequence using the untouched baseline codec. */
export function frameMarkersOf(text: string, payload: string): string[] {
  const probe = encodeWatermark(text, payload, { insertion: 'start' });
  const count = countMarkers(probe.marked);
  return Array.from(probe.marked.slice(0, count));
}

/**
 * Encode `payload` into `text` with profile-guided placement and optional
 * repetition redundancy. The visible text is never altered.
 */
export function encodeAdaptive(
  text: string,
  payload: string,
  options: AdaptiveEncodeOptions = {},
): AdaptiveEncodeResult {
  const repetition = Math.max(1, Math.floor(options.repetition ?? DEFAULT_REPETITION));
  const profile = options.profile ?? MEASURED_PLACEMENT_PROFILE;
  const notes: string[] = [];

  const frame = frameMarkersOf(text, payload);
  const n = frame.length;
  // Block interleaving: S = [F, F, ..., F] (r passes).
  const sequence: string[] = [];
  for (let copy = 0; copy < repetition; copy++) sequence.push(...frame);

  const cps = toCodePoints(text);
  const length = cps.length;

  // Candidate boundaries: after the 1st .. (length-1)-th visible code point.
  const boundaries: number[] = [];
  for (let b = 1; b <= length - 1; b++) boundaries.push(b);

  const binScore = (boundary: number): number =>
    profile[binOfBoundary(boundary, length, profile.length)] ?? 0;

  // Safe region = boundaries in the bins with the maximum measured score.
  let maxScore = 0;
  for (const b of boundaries) maxScore = Math.max(maxScore, binScore(b));
  let safe = boundaries.filter((b) => binScore(b) === maxScore);
  if (safe.length === 0) {
    // Degenerate profile (all zero): fall back to every boundary.
    safe = boundaries.length > 0 ? boundaries : [Math.max(0, length)];
    notes.push('Profile is all-zero; fell back to all boundaries.');
  }
  if (safe.length === 0) safe = [0];

  const clustered = sequence.length > safe.length;

  // Front-loaded even distribution over ASCENDING safe boundaries, so document
  // order equals sequence order. Overflow clusters inside the safe region.
  const perBoundary = new Map<number, string[]>();
  let cursor = 0;
  for (let i = 0; i < safe.length; i++) {
    const size = Math.floor(sequence.length / safe.length) + (i < sequence.length % safe.length ? 1 : 0);
    if (size > 0) perBoundary.set(safe[i], sequence.slice(cursor, cursor + size));
    cursor += size;
  }

  const parts: string[] = [];
  for (let i = 0; i < cps.length; i++) {
    parts.push(cps[i]);
    const markers = perBoundary.get(i + 1);
    if (markers) parts.push(...markers);
  }
  // Length-0/1 text: place everything at the end (still reversible).
  if (length < 2) parts.push(...sequence);

  const marked = parts.join('');
  const markerCount = countMarkers(marked);
  return {
    marked,
    markerCount,
    frameBitCount: n,
    repetition,
    safeBoundaryCount: safe.length,
    clustered,
    overheadRatio: length > 0 ? markerCount / length : 0,
    notes,
  };
}

/**
 * Decode an adaptively marked text. Extracts markers in document order,
 * applies the repetition/majority search (r >= 2) and delegates final
 * classification to the baseline decoder. Marker-free input reports `absent`
 * (unrecoverable payload), matching baseline semantics.
 */
export function decodeAdaptive(
  input: string,
  options: { repetition?: number } = {},
): AdaptiveDecodeResult {
  const repetition = Math.max(1, Math.floor(options.repetition ?? DEFAULT_REPETITION));
  const notes: string[] = [];

  const markers: string[] = [];
  for (const ch of input) if (isBaselineMarker(ch)) markers.push(ch);

  if (markers.length === 0) {
    return {
      baseline: decodeWatermark(input),
      repetition,
      markersExtracted: 0,
      validatedBlockLength: null,
      notes: ['No baseline markers found; payload unrecoverable.'],
    };
  }

  const tryDecode = (bitString: string): DecodeResult => decodeWatermark(bitString);

  if (repetition === 1) {
    const baseline = tryDecode(markers.join(''));
    return { baseline, repetition, markersExtracted: markers.length, validatedBlockLength: markers.length, notes };
  }

  const m = markers.length;
  const vote = (g: number): string => {
    const blocks = Math.floor(m / g);
    let out = '';
    for (let k = 0; k < g; k++) {
      let zeros = 0;
      let ones = 0;
      for (let j = 0; j < blocks; j++) {
        if (markers[j * g + k] === ONE_CHAR) ones++;
        else zeros++;
      }
      out += ones > zeros ? ONE_CHAR : ZERO_CHAR;
    }
    return out;
  };

  let validatedBlockLength: number | null = null;
  let lastResult: DecodeResult | null = null;
  for (let g = Math.floor(m / 2); g >= MIN_BLOCK_MARKERS; g--) {
    if (Math.floor(m / g) < 2) break;
    const result = tryDecode(vote(g));
    lastResult = result;
    if (result.status === 'complete') {
      validatedBlockLength = g;
      notes.push(`Block search validated at g=${g} (blocks=${Math.floor(m / g)}).`);
      return { baseline: result, repetition, markersExtracted: m, validatedBlockLength, notes };
    }
  }

  // No candidate validated: classify with the nominal block length.
  const fallbackG = Math.max(1, Math.floor(m / repetition));
  const baseline = fallbackG * repetition <= m && fallbackG >= MIN_BLOCK_MARKERS
    ? tryDecode(vote(fallbackG))
    : (lastResult ?? tryDecode(markers.join('')));
  notes.push('No block length produced a checksum-valid frame; reporting best-effort classification.');
  return { baseline, repetition, markersExtracted: m, validatedBlockLength: null, notes };
}

/** Metadata describing this experiment for reports/UI. */
export const ADAPTIVE_METADATA = {
  id: 'adaptive-placement',
  name: 'Adaptive placement + repetition (research prototype)',
  kind: 'experimental' as const,
  frame: 'AWL1 (identical to baseline; harvested via untouched encodeWatermark)',
  redundancy: `repetition x${DEFAULT_REPETITION}, block-interleaved, majority vote, checksum-validated`,
};

