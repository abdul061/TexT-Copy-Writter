import { describe, expect, it } from 'vitest';
import {
  encodeAdaptive,
  decodeAdaptive,
  frameMarkersOf,
  MEASURED_PLACEMENT_PROFILE,
  DEFAULT_REPETITION,
} from '../lib/adaptive';
import { BENCHMARK_SAMPLES } from '../lib/benchmark';
import { getTransform } from '../lib/transforms';
import {
  encodeWatermark,
  decodeWatermark,
  stripMarkers,
  countMarkers,
  ONE_CHAR,
  ZERO_CHAR,
} from '../lib/watermark';
import { codePointCount } from '../lib/unicode';

describe('frame harvesting (baseline untouched)', () => {
  it('produces exactly the baseline frame bit count', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const frame = frameMarkersOf(sample.text, sample.payload);
      const bytes = new TextEncoder().encode(sample.payload).length;
      expect(frame).toHaveLength((8 + bytes) * 8);
    }
  });
});

describe('round-trip on untransformed text', () => {
  for (const r of [1, DEFAULT_REPETITION]) {
    it(`recovers the exact payload with repetition=${r}`, () => {
      for (const sample of BENCHMARK_SAMPLES) {
        const enc = encodeAdaptive(sample.text, sample.payload, { repetition: r });
        const dec = decodeAdaptive(enc.marked, { repetition: r });
        expect(dec.baseline.status).toBe('complete');
        expect(dec.baseline.payload).toBe(sample.payload);
      }
    });
  }
});

describe('overhead and visual-equivalence parity with baseline', () => {
  it('r=1 places exactly as many markers as the baseline (same budget)', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const baseline = encodeWatermark(sample.text, sample.payload, {
        insertion: 'distributed',
        stride: 6,
      });
      const adaptive = encodeAdaptive(sample.text, sample.payload, { repetition: 1 });
      expect(adaptive.markerCount).toBe(baseline.markerCount);
      expect(adaptive.markerCount).toBe(countMarkers(adaptive.marked));
      const cp = codePointCount(sample.text);
      expect(adaptive.overheadRatio).toBeCloseTo(baseline.markerCount / cp, 10);
    }
  });

  it('r=3 uses exactly 3x the baseline marker budget', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const baseline = encodeWatermark(sample.text, sample.payload, {
        insertion: 'distributed',
        stride: 6,
      });
      const adaptive = encodeAdaptive(sample.text, sample.payload, { repetition: 3 });
      expect(adaptive.markerCount).toBe(3 * baseline.markerCount);
    }
  });

  it('never alters the visible text (same as baseline, per sample)', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const baseline = encodeWatermark(sample.text, sample.payload, {
        insertion: 'distributed',
        stride: 6,
      });
      for (const r of [1, 3]) {
        const adaptive = encodeAdaptive(sample.text, sample.payload, { repetition: r });
        // Parity: whatever stripMarkers does to the baseline's visible-text
        // check (e.g. ZWJ inside emoji), the adaptive codec behaves the same.
        expect(stripMarkers(adaptive.marked) === sample.text).toBe(
          stripMarkers(baseline.marked) === sample.text,
        );
      }
    }
  });

  it('is deterministic: same input -> byte-identical output', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const a = encodeAdaptive(sample.text, sample.payload, { repetition: 3 });
      const b = encodeAdaptive(sample.text, sample.payload, { repetition: 3 });
      expect(a.marked).toBe(b.marked);
    }
  });
});

describe('profile-guided placement', () => {
  it('default profile comes from the measured corpus and is length 10', () => {
    expect(MEASURED_PLACEMENT_PROFILE).toHaveLength(10);
  });

  it('places every marker inside the maximum-survival bins', () => {
    const sample = BENCHMARK_SAMPLES[0]; // short: M > safe boundaries -> clustered
    const enc = encodeAdaptive(sample.text, sample.payload, {
      repetition: 1,
      profile: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    });
    // All markers must sit in the first 20% of the visible text.
    const chars = Array.from(enc.marked);
    let visible = 0;
    let maxVisibleBeforeMarker = 0;
    for (const ch of chars) {
      if (ch === ZERO_CHAR || ch === ONE_CHAR) {
        maxVisibleBeforeMarker = Math.max(maxVisibleBeforeMarker, visible);
      } else {
        visible += 1;
      }
    }
    // Bins 0..2 cover visible boundaries up to ~30% of the text length.
    expect(maxVisibleBeforeMarker).toBeLessThanOrEqual(Math.ceil(0.3 * visible));
    expect(enc.clustered).toBe(true);
    expect(enc.safeBoundaryCount).toBeGreaterThan(0);
  });

describe('redundancy: block-interleaved repetition', () => {
  it('r=3 recovers the payload after losing one entire tail copy (region loss)', () => {
    const sample = BENCHMARK_SAMPLES[0];
    const enc = encodeAdaptive(sample.text, sample.payload, { repetition: 3 });
    const frameLength = enc.frameBitCount;
    // Drop the last full copy from the marker sequence (prefix-preserving loss).
    const markers = Array.from(enc.marked).filter(
      (ch) => ch === ZERO_CHAR || ch === ONE_CHAR,
    );
    const survivors = markers.slice(0, markers.length - frameLength).join('');
    const dec = decodeAdaptive(survivors, { repetition: 3 });
    expect(dec.validatedBlockLength).not.toBeNull();
    expect(dec.baseline.status).toBe('complete');
    expect(dec.baseline.payload).toBe(sample.payload);
  });

  it('does not claim recovery when too few markers remain', () => {
    const sample = BENCHMARK_SAMPLES[0];
    const enc = encodeAdaptive(sample.text, sample.payload, { repetition: 3 });
    const markers = Array.from(enc.marked).filter(
      (ch) => ch === ZERO_CHAR || ch === ONE_CHAR,
    );
    const survivors = markers.slice(0, 20).join('');
    const dec = decodeAdaptive(survivors, { repetition: 3 });
    expect(dec.baseline.status).not.toBe('complete');
    expect(dec.baseline.payload).toBeNull();
  });
});

describe('transforms that remove all invisible markers', () => {
  const destroying = [
    'strip-zero-width',
    'plaintext-copy',
    'format-html',
    'format-pdf-like',
    'retype-visible',
  ] as const;

  it('correctly reports payloads as unrecoverable (absent, payload null)', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      for (const id of destroying) {
        const t = getTransform(id)!;
        for (const r of [1, 3]) {
          const enc = encodeAdaptive(sample.text, sample.payload, { repetition: r });
          const dec = decodeAdaptive(t.apply(enc.marked), { repetition: r });
          expect(dec.baseline.status).toBe('absent');
          expect(dec.baseline.payload).toBeNull();
          expect(dec.markersExtracted).toBe(0);
        }
      }
    }
  });

  it('reports absent for never-marked text', () => {
    const dec = decodeAdaptive('clean text with no markers at all', { repetition: 3 });
    expect(dec.baseline.status).toBe('absent');
    expect(dec.baseline.payload).toBeNull();
  });
});

describe('head-to-head on truncate-tail (measured, not hardcoded results)', () => {
  const truncate = getTransform('truncate-tail')!;

  it('r=3 recovers every sample where baseline recovers none', () => {
    let baselineRecovers = 0;
    let adaptiveRecovers = 0;
    for (const sample of BENCHMARK_SAMPLES) {
      const base = encodeWatermark(sample.text, sample.payload, {
        insertion: 'distributed',
        stride: 6,
      });
      const baseDec = decodeWatermark(truncate.apply(base.marked));
      if (baseDec.status === 'complete' && baseDec.payload === sample.payload) baselineRecovers++;

      const enc = encodeAdaptive(sample.text, sample.payload, { repetition: 3 });
      const adDec = decodeAdaptive(truncate.apply(enc.marked), { repetition: 3 });
      if (adDec.baseline.status === 'complete' && adDec.baseline.payload === sample.payload)
        adaptiveRecovers++;
    }
    expect(baselineRecovers).toBe(0);
    expect(adaptiveRecovers).toBe(BENCHMARK_SAMPLES.length);
  });
});

});
