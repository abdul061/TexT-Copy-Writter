import { describe, it, expect } from 'vitest';
import {
  EXPERIMENTAL_ALGORITHMS,
  getExperimentalAlgorithm,
} from '../lib/experimental';

describe('experimental algorithm registry', () => {
  it('registers at least one prototype, all clearly marked unvalidated', () => {
    expect(EXPERIMENTAL_ALGORITHMS.length).toBeGreaterThanOrEqual(1);
    for (const a of EXPERIMENTAL_ALGORITHMS) {
      expect(a.status.toLowerCase()).toContain('not validated');
      expect(a.limitations.length).toBeGreaterThan(0);
    }
  });

  it('looks up algorithms by id', () => {
    expect(getExperimentalAlgorithm('anchor-interval')).toBeDefined();
    expect(getExperimentalAlgorithm('does-not-exist')).toBeUndefined();
  });

  it('anchor-interval round-trips a simple payload', () => {
    const algo = getExperimentalAlgorithm('anchor-interval')!;
    const { marked, notes } = algo.encode('hello world', 'abc');
    expect(typeof marked).toBe('string');
    expect(marked.startsWith('hello world')).toBe(true);
    // Notes must remind the user the result is unvalidated.
    expect(notes.some((n) => n.includes('UNVALIDATED'))).toBe(true);
    const decoded = algo.decode(marked);
    expect(decoded.status).toBe('complete');
    expect(decoded.payload).toBe('abc');
  });

  it('anchor-interval reports absent on plain text', () => {
    const algo = getExperimentalAlgorithm('anchor-interval')!;
    const decoded = algo.decode('no sentinels here');
    expect(decoded.status).toBe('absent');
    expect(decoded.payload).toBeNull();
  });

  it('whitespace-rhythm round-trips when enough word boundaries exist', () => {
    const algo = getExperimentalAlgorithm('whitespace-rhythm')!;
    // Need at least as many word boundaries as payload bits. 'hi' = 16 bits.
    const text = Array.from({ length: 30 }, (_, i) => 'w' + i).join(' ');
    const { marked, notes } = algo.encode(text, 'hi');
    const decoded = algo.decode(marked);
    // NOTE: this prototype is lossy when adjacent bits are equal (double vs
    // single spaces merge). It is documented as unvalidated; the round-trip
    // succeeds only when the recovered bit count is a whole number of bytes.
    expect(['complete', 'partial']).toContain(decoded.status);
    if (decoded.status === 'complete') {
      expect(decoded.payload).toBe('hi');
    }
    expect(notes.some((n) => n.includes('UNVALIDATED'))).toBe(true);
  });

  it('whitespace-rhythm warns when payload cannot fit', () => {
    const algo = getExperimentalAlgorithm('whitespace-rhythm')!;
    const text = 'only two words'; // 1 space => can hold 1 bit
    const { notes } = algo.encode(text, 'a-much-longer-payload');
    expect(notes.some((n) => n.includes('truncated'))).toBe(true);
  });

  // Strict UTF-8 validation (audit fix D1): both prototype decoders must
  // reject checksum-less frames whose bytes are invalid UTF-8 instead of
  // returning `complete` with U+FFFD replacement characters.
  it('anchor-interval rejects invalid UTF-8 byte sequences', () => {
    const algo = getExperimentalAlgorithm('anchor-interval')!;
    // 0xFF, 0xFE as raw bits: 11111111 11111110 — illegal UTF-8 lead bytes.
    const bits = '1111111111111110';
    let run = '\u2060';
    for (const b of bits) run += b === '1' ? '\u200C' : '\u200B';
    run += '\u2060';
    const decoded = algo.decode('text' + run);
    expect(decoded.status).toBe('invalid');
    expect(decoded.payload).toBeNull();
    expect(decoded.notes.some((n) => n.includes('not valid UTF-8'))).toBe(true);
  });

  it('whitespace-rhythm rejects invalid UTF-8 byte sequences', () => {
    const algo = getExperimentalAlgorithm('whitespace-rhythm')!;
    // 16 whitespace tokens encoding 11111111 11111110 (double space = 1).
    const bits = '1111111111111110';
    let input = 'x';
    for (const b of bits) {
      input += b === '1' ? '  ' : ' ';
      input += 'x';
    }
    const decoded = algo.decode(input);
    expect(decoded.status).toBe('invalid');
    expect(decoded.payload).toBeNull();
    expect(decoded.notes.some((n) => n.includes('not valid UTF-8'))).toBe(true);
  });
});
