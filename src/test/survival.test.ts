import { describe, expect, it } from 'vitest';
import { TRANSFORMS } from '../lib/transforms';
import { BENCHMARK_SAMPLES } from '../lib/benchmark';
import {
  SURVIVAL_BIN_COUNT,
  measureBoundarySurvival,
  measureSurvivalProfiles,
  aggregateSurvivalProfile,
  binOfBoundary,
  encodeProbe,
} from '../lib/survival';
import { encodeWatermark, countMarkers } from '../lib/watermark';

describe('binOfBoundary', () => {
  it('maps boundaries to normalized bins', () => {
    expect(binOfBoundary(0, 100)).toBe(0);
    expect(binOfBoundary(95, 100)).toBe(9);
    expect(binOfBoundary(100, 100)).toBe(9); // clamped
    expect(binOfBoundary(5, 0)).toBe(0); // empty text guard
  });
});

describe('measureBoundarySurvival (exact alignment)', () => {
  it('reports full survival when the transform keeps every marker', () => {
    const sample = BENCHMARK_SAMPLES[0];
    const marked = encodeProbe(sample);
    const measured = measureBoundarySurvival(marked, marked);
    expect(measured.alignment).toBe('exact');
    expect(measured.survivors).toBe(measured.totalMarkers);
  });

  it('reports zero survival for a marker-stripping transform', () => {
    const sample = BENCHMARK_SAMPLES[0];
    const marked = encodeProbe(sample);
    const strip = TRANSFORMS.find((t) => t.id === 'strip-zero-width');
    const measured = measureBoundarySurvival(marked, strip!.apply(marked));
    expect(measured.alignment).toBe('exact');
    expect(measured.survivors).toBe(0);
  });
});

describe('per-transformation position-survival profiles (fixed corpus)', () => {
  const profiles = measureSurvivalProfiles();
  const byId = new Map(profiles.map((p) => [p.transformId, p]));

  it('covers every registered transformation', () => {
    expect(profiles).toHaveLength(TRANSFORMS.length);
    for (const t of TRANSFORMS) expect(byId.has(t.id)).toBe(true);
  });

  it('uses exactly SURVIVAL_BIN_COUNT bins with sane values', () => {
    for (const p of profiles) {
      expect(p.binSurvival).toHaveLength(SURVIVAL_BIN_COUNT);
      for (const s of p.binSurvival) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it('marker-preserving transforms survive 100% in every occupied bin', () => {
    for (const id of ['nfc', 'nfd', 'nfkc', 'nfkd', 'whitespace-cleanup', 'format-markdown'] as const) {
      const p = byId.get(id)!;
      expect(p.survivors).toBe(p.totalMarkers);
      expect(p.totalMarkers).toBeGreaterThan(0);
    }
  });

  it('marker-destroying transforms survive 0% everywhere', () => {
    for (const id of ['strip-zero-width', 'plaintext-copy', 'format-html', 'format-pdf-like', 'retype-visible'] as const) {
      const p = byId.get(id)!;
      expect(p.survivors).toBe(0);
      expect(p.totalMarkers).toBeGreaterThan(0);
    }
  });

  it('truncate-tail kills the tail bins and preserves the head bins', () => {
    const p = byId.get('truncate-tail')!;
    expect(p.totalMarkers).toBeGreaterThan(0);
    expect(p.binMarkers[SURVIVAL_BIN_COUNT - 1]).toBeGreaterThan(0); // probes existed in the tail
    expect(p.binSurvival[0]).toBe(1); // head survives fully
    expect(p.binSurvival[SURVIVAL_BIN_COUNT - 1]).toBe(0); // tail dies fully
    expect(p.binSurvival[7]).toBeLessThan(1); // the cut region is mixed
  });

  it('delete-markers is roughly position-uniform (~50% deletion)', () => {
    const p = byId.get('delete-markers')!;
    const overall = p.survivors / p.totalMarkers;
    expect(overall).toBeGreaterThan(0.3);
    expect(overall).toBeLessThan(0.7);
    for (let bin = 0; bin < SURVIVAL_BIN_COUNT; bin++) {
      if (p.binMarkers[bin] > 0) {
        expect(p.binSurvival[bin]).toBeGreaterThan(0.15);
        expect(p.binSurvival[bin]).toBeLessThan(0.85);
      }
    }
  });
});

describe('aggregate placement profile', () => {
  const profile = aggregateSurvivalProfile(measureSurvivalProfiles());

  it('has one score per bin, all in [0, 1]', () => {
    expect(profile).toHaveLength(SURVIVAL_BIN_COUNT);
    for (const s of profile) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('ranks the head bins above the tail bins (drives safe-region selection)', () => {
    // Head bins score strictly above the tail; delete-markers' deterministic
    // hash makes bins close but not exactly equal, so no tie is assumed.
    expect(profile[0]).toBeGreaterThan(profile[SURVIVAL_BIN_COUNT - 1]);
    expect(profile[0]).toBeGreaterThanOrEqual(0.5);
    expect(profile[SURVIVAL_BIN_COUNT - 1]).toBeLessThan(profile[0]);
  });
});

describe('determinism', () => {
  it('profiles are identical across repeated measurements', () => {
    const a = measureSurvivalProfiles();
    const b = measureSurvivalProfiles();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('probes carry the expected marker count', () => {
    const sample = BENCHMARK_SAMPLES[0];
    const marked = encodeWatermark(sample.text, sample.payload, { insertion: 'distributed', stride: 6 });
    expect(countMarkers(marked.marked)).toBe((8 + new TextEncoder().encode(sample.payload).length) * 8);
    expect(encodeProbe(sample)).toBe(marked.marked);
  });
});
