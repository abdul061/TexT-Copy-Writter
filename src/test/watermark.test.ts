import { describe, it, expect } from 'vitest';
import {
  encodeWatermark,
  decodeWatermark,
  stripMarkers,
  countMarkers,
  collectMarkerBits,
  ZERO_CHAR,
  ONE_CHAR,
} from '../lib/watermark';
import { codePointCount } from '../lib/unicode';
import { BENCHMARK_SAMPLES } from '../lib/benchmark';

describe('baseline watermark round-trip', () => {
  it('recovers the exact payload after encoding', () => {
    const { marked } = encodeWatermark('hello world', 'secret-payload', {
      insertion: 'end',
    });
    const result = decodeWatermark(marked);
    expect(result.status).toBe('complete');
    expect(result.detected).toBe(true);
    expect(result.payload).toBe('secret-payload');
  });

  it('preserves visible text exactly (visual equivalence)', () => {
    const original = 'The quick brown fox.\nSecond line with émojis 🚀.';
    const { marked } = encodeWatermark(original, 'owner=alice');
    expect(stripMarkers(marked)).toBe(original);
    // The marked text is longer than the original (it has markers).
    expect(codePointCount(marked)).toBeGreaterThan(codePointCount(original));
  });

  it('embeds the expected number of marker characters', () => {
    const { markerCount, frameBytes } = encodeWatermark('abc', 'xy');
    // frameBytes = 4 magic + 1 version + 2 length + 2 payload + 1 checksum = 10
    expect(frameBytes).toBe(10);
    expect(markerCount).toBe(frameBytes * 8);
  });

  it('supports the distributed strategy', () => {
    const original = 'a'.repeat(40);
    const { marked } = encodeWatermark(original, 'z', {
      insertion: 'distributed',
      stride: 4,
    });
    const result = decodeWatermark(marked);
    expect(result.status).toBe('complete');
    expect(result.payload).toBe('z');
    expect(stripMarkers(marked)).toBe(original);
  });
});

describe('decoder status classification', () => {
  it('reports absent when there are no markers', () => {
    const result = decodeWatermark('just some ordinary text');
    expect(result.status).toBe('absent');
    expect(result.detected).toBe(false);
    expect(result.payload).toBeNull();
  });

  it('reports partial when the marker run is truncated', () => {
    const { marked } = encodeWatermark('hello', 'a-longer-payload-here', {
      insertion: 'end',
    });
    // Cut off most of the trailing marker run.
    const truncated = marked.slice(0, marked.length - 40);
    const result = decodeWatermark(truncated);
    expect(result.status).toBe('partial');
    expect(result.detected).toBe(false);
  });

  it('reports invalid when a marker bit is flipped (checksum mismatch)', () => {
    const { marked } = encodeWatermark('hello', 'payload');
    // Find a marker char and flip it.
    const idx = [...marked].findIndex(
      (c) => c === ZERO_CHAR || c === ONE_CHAR,
    );
    const chars = [...marked];
    chars[idx] = chars[idx] === ZERO_CHAR ? ONE_CHAR : ZERO_CHAR;
    const corrupted = chars.join('');
    const result = decodeWatermark(corrupted);
    // Either invalid (checksum) or a different-but-valid status; must not be
    // silently "complete" with the wrong payload.
    expect(result.status === 'invalid' || result.status === 'complete').toBe(true);
    if (result.status === 'complete') {
      // Extremely unlikely a single flip yields the same checksum, but if it
      // did, the payload must still match.
      expect(result.payload).toBe('payload');
    }
  });

  it('reports invalid for unrelated zero-width characters', () => {
    // Lots of ZWNJ (U+200C) but no valid frame magic.
    const noise = 'text' + ONE_CHAR.repeat(64);
    const result = decodeWatermark(noise);
    expect(result.status).toBe('invalid');
  });
});

describe('marker utilities', () => {
  it('counts markers correctly', () => {
    expect(countMarkers(ZERO_CHAR + 'a' + ONE_CHAR)).toBe(2);
    expect(countMarkers('no markers here')).toBe(0);
  });

  it('collects marker bits in order', () => {
    expect(collectMarkerBits('a' + ONE_CHAR + 'b' + ZERO_CHAR)).toEqual([1, 0]);
  });

  it('stripMarkers removes exactly the marker characters', () => {
    const s = 'a' + ZERO_CHAR + 'b' + ONE_CHAR + 'c';
    expect(stripMarkers(s)).toBe('abc');
  });
});

describe('empty and edge cases', () => {
  it('handles empty payload', () => {
    const { marked } = encodeWatermark('text', '', { insertion: 'end' });
    const result = decodeWatermark(marked);
    expect(result.status).toBe('complete');
    expect(result.payload).toBe('');
  });

  it('handles empty text', () => {
    const { marked } = encodeWatermark('', 'payload', { insertion: 'end' });
    const result = decodeWatermark(marked);
    expect(result.status).toBe('complete');
    expect(result.payload).toBe('payload');
    expect(stripMarkers(marked)).toBe('');
  });

  it('handles multi-byte UTF-8 payloads', () => {
    const payload = 'café-日本語-🚀';
    const { marked } = encodeWatermark('text', payload, { insertion: 'end' });
    const result = decodeWatermark(marked);
    expect(result.status).toBe('complete');
    expect(result.payload).toBe(payload);
  });

  it('rejects payloads larger than the 16-bit length field', () => {
    const big = 'x'.repeat(65536);
    expect(() => encodeWatermark('t', big)).toThrow();
  });
});

describe('strict UTF-8 payload validation (regression: audit fix D1)', () => {
  /**
   * Craft a checksum-valid frame whose payload bytes are invalid UTF-8
   * (0xFF 0xFE are illegal lead bytes). Before the fix, TextDecoder ran in
   * non-fatal mode, never threw, and this decoded as `complete` with U+FFFD
   * replacement characters. It must now be reported as `invalid`.
   */
  function craftInvalidUtf8Frame(): string {
    const MAGIC = [0x41, 0x57, 0x4c, 0x31]; // "AWL1"
    const payloadBytes = [0xff, 0xfe];
    const withoutChecksum = [
      ...MAGIC,
      0x01,
      (payloadBytes.length >> 8) & 0xff,
      payloadBytes.length & 0xff,
      ...payloadBytes,
    ];
    let sum = 0;
    for (const b of withoutChecksum) sum += b;
    const frameBytes = [...withoutChecksum, sum & 0xff];
    let out = '';
    for (const byte of frameBytes) {
      for (let i = 7; i >= 0; i--) {
        out += (byte >> i) & 1 ? ONE_CHAR : ZERO_CHAR;
      }
    }
    return out;
  }

  it('reports invalid (not complete) for checksum-valid but non-UTF-8 payload', () => {
    const result = decodeWatermark(craftInvalidUtf8Frame());
    expect(result.status).toBe('invalid');
    expect(result.payload).toBeNull();
    expect(result.detected).toBe(false);
    expect(result.reason).toMatch(/not valid UTF-8/);
  });

  it('still completes round-trips for valid multi-byte UTF-8 payloads', () => {
    const payload = '日本語-🚀-café';
    const { marked } = encodeWatermark('text', payload, { insertion: 'end' });
    expect(decodeWatermark(marked).payload).toBe(payload);
  });
});

describe('distributed strategy marker distribution (audit fix D4)', () => {
  // Measurements on the fixed benchmark corpus (stride 4), recorded so any
  // regression to the old "dump leftovers in one tail run" behaviour fails:
  //   before fix: 82-95% of markers sat in a single trailing run
  //   after fix : max 10% in the trailing run, >=44% of markers in the
  //               first half of the marked string (measured values).
  const STRIDE = 4;

  function tailRunLength(marked: string): number {
    const chars = [...marked];
    let i = chars.length - 1;
    let n = 0;
    while (i >= 0 && (chars[i] === ZERO_CHAR || chars[i] === ONE_CHAR)) {
      n++;
      i--;
    }
    return n;
  }

  it('keeps the trailing run to a small share of the frame for every corpus sample', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const { marked, markerCount } = encodeWatermark(
        sample.text,
        sample.payload,
        { insertion: 'distributed', stride: STRIDE },
      );
      const tailShare = tailRunLength(marked) / markerCount;
      expect(tailShare).toBeLessThanOrEqual(0.15);
      // Frame must also be present in the first half, not only at the end.
      const firstHalfMarkers = [...marked.slice(0, Math.floor(marked.length / 2))]
        .filter((c) => c === ZERO_CHAR || c === ONE_CHAR).length;
      expect(firstHalfMarkers / markerCount).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('preserves bit order: distributed round-trips decode to the exact payload', () => {
    for (const sample of BENCHMARK_SAMPLES) {
      const { marked } = encodeWatermark(sample.text, sample.payload, {
        insertion: 'distributed',
        stride: STRIDE,
      });
      const result = decodeWatermark(marked);
      expect(result.status).toBe('complete');
      expect(result.payload).toBe(sample.payload);
      expect(stripMarkers(marked)).toBe(sample.text);
    }
  });
});

describe('tail truncation measurements (audit fix D4 — measured, not a robustness claim)', () => {
  // Exact recorded counts on the FIXED benchmark corpus (stride 4). These pin
  // measured behaviour only; they are not a general robustness claim:
  //   distributed @1%  : 1 complete / 4 partial, 1 payload recovered
  //   distributed @25% : 0 complete / 5 partial, 0 payloads recovered
  //   end         @1%  : 0 complete / 5 partial, 0 payloads recovered
  //   end         @25% : 0 complete / 5 partial, 0 payloads recovered
  function truncateFraction(marked: string, fraction: number): string {
    const cut = Math.floor(marked.length * (1 - fraction));
    return marked.slice(0, cut);
  }

  function summarize(ins: 'end' | 'distributed', fraction: number) {
    const statuses: string[] = [];
    let recovered = 0;
    for (const s of BENCHMARK_SAMPLES) {
      const { marked } = encodeWatermark(s.text, s.payload, {
        insertion: ins,
        stride: 4,
      });
      const d = decodeWatermark(truncateFraction(marked, fraction));
      statuses.push(d.status);
      if (d.status === 'complete' && d.payload === s.payload) recovered++;
    }
    return { statuses, recovered };
  }

  it('distributed @25% trim: header evidence survives on all samples, no payload is recovered', () => {
    const { statuses, recovered } = summarize('distributed', 0.25);
    expect(statuses).toEqual(Array(5).fill('partial'));
    expect(recovered).toBe(0);
  });

  it('distributed @1% trim: full payload recovery measured on exactly 1 of 5 samples', () => {
    const { statuses, recovered } = summarize('distributed', 0.01);
    // Measured: 'code' (its final boundary is not the final character) keeps
    // every marker past a 1% trim; the other four lose tail markers.
    expect(statuses.filter((s) => s === 'complete')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'partial')).toHaveLength(4);
    expect(recovered).toBe(1);
  });

  it('end @1% and @25% trim: no payload recovered, header evidence survives (measured baseline)', () => {
    for (const fraction of [0.01, 0.25]) {
      const { statuses, recovered } = summarize('end', fraction);
      expect(statuses).toEqual(Array(5).fill('partial'));
      expect(recovered).toBe(0);
    }
  });

  it('distributed never performs worse than end on this corpus (measured comparison)', () => {
    for (const fraction of [0.01, 0.05, 0.25]) {
      const dist = summarize('distributed', fraction);
      const end = summarize('end', fraction);
      expect(dist.recovered).toBeGreaterThanOrEqual(end.recovered);
      const distEvidence = dist.statuses.filter((s) => s !== 'absent').length;
      const endEvidence = end.statuses.filter((s) => s !== 'absent').length;
      expect(distEvidence).toBeGreaterThanOrEqual(endEvidence);
    }
  });
});
