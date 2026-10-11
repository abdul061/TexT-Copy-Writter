import { describe, it, expect } from 'vitest';
import {
  applyNormalization,
  cleanupWhitespace,
  removeZeroWidth,
  deleteMarkersFraction,
  truncateTail,
  retypeVisible,
  formatToHtml,
  plaintextCopy,
  formatToMarkdown,
  formatToPdfLike,
  TRANSFORMS,
  getTransform,
} from '../lib/transforms';
import { ZERO_CHAR, ONE_CHAR } from '../lib/watermark';
import { codePointCount } from '../lib/unicode';

describe('normalization transforms', () => {
  it('NFC composes decomposed sequences', () => {
    // 'e' + combining acute (U+0301) -> single é (U+00E9) under NFC.
    const decomposed = 'e\u0301';
    expect(applyNormalization(decomposed, 'NFC')).toBe('\u00E9');
  });

  it('NFD decomposes composed sequences', () => {
    const composed = '\u00E9';
    expect(applyNormalization(composed, 'NFD')).toBe('e\u0301');
  });

  it('normalization leaves zero-width markers intact', () => {
    const withMarkers = 'a' + ZERO_CHAR + 'b' + ONE_CHAR;
    expect(applyNormalization(withMarkers, 'NFC')).toBe(withMarkers);
    expect(applyNormalization(withMarkers, 'NFD')).toBe(withMarkers);
  });
});

describe('whitespace cleanup', () => {
  it('collapses whitespace runs and trims', () => {
    expect(cleanupWhitespace('  a   b  ')).toBe('a b');
  });

  it('does not remove zero-width markers (they are not \\s)', () => {
    const withMarkers = 'a' + ZERO_CHAR + 'b';
    expect(cleanupWhitespace(withMarkers)).toBe(withMarkers);
  });
});

describe('destructive transforms', () => {
  it('removeZeroWidth strips all invisible characters', () => {
    expect(removeZeroWidth('a' + ZERO_CHAR + 'b' + ONE_CHAR)).toBe('ab');
  });

  it('retypeVisible strips invisible characters', () => {
    expect(retypeVisible('a' + ZERO_CHAR + 'b')).toBe('ab');
  });

  it('formatToHtml strips invisible characters (pessimistic model)', () => {
    expect(formatToHtml('a' + ZERO_CHAR + 'b')).toBe('ab');
  });

  it('truncateTail drops the requested fraction', () => {
    expect(truncateTail('abcdefgh', 0.25)).toBe('abcdef');
    expect(truncateTail('abc', 0)).toBe('abc');
    expect(truncateTail('abc', 1)).toBe('');
  });
});

// Direct regression tests for the three transform functions that previously
// had no dedicated assertions anywhere (audit fix D3); they were only run
// inside the benchmark loop without being pinned.
describe('plain-text copy and simulated format conversions', () => {
  it('plaintextCopy strips zero-width markers (lossy plain-text field model)', () => {
    expect(plaintextCopy('a' + ZERO_CHAR + 'b' + ONE_CHAR)).toBe('ab');
    expect(plaintextCopy('plain visible text')).toBe('plain visible text');
    // It is exactly the zero-width strip primitive:
    expect(plaintextCopy('x' + ZERO_CHAR + 'y')).toBe(removeZeroWidth('x' + ZERO_CHAR + 'y'));
  });

  it('formatToMarkdown preserves markers and normalizes CRLF to LF', () => {
    const withMarkers = 'a' + ZERO_CHAR + 'b\r\nc' + ONE_CHAR;
    expect(formatToMarkdown(withMarkers)).toBe('a' + ZERO_CHAR + 'b\nc' + ONE_CHAR);
    expect(formatToMarkdown('no line endings here')).toBe('no line endings here');
  });

  it('formatToPdfLike strips invisible characters (pessimistic extraction model)', () => {
    expect(formatToPdfLike('a' + ZERO_CHAR + 'b' + ONE_CHAR)).toBe('ab');
    expect(formatToPdfLike('visible only')).toBe('visible only');
  });
});

describe('deleteMarkersFraction', () => {
  it('is deterministic for the same input', () => {
    const input = Array.from({ length: 100 }, () => ZERO_CHAR).join('');
    const a = deleteMarkersFraction(input, 0.5);
    const b = deleteMarkersFraction(input, 0.5);
    expect(a).toBe(b);
  });

  it('deletes roughly the requested fraction', () => {
    const input = ZERO_CHAR.repeat(1000);
    const out = deleteMarkersFraction(input, 0.5);
    const remaining = codePointCount(out);
    // Should be near half, allow generous tolerance for the hash approach.
    expect(remaining).toBeGreaterThan(400);
    expect(remaining).toBeLessThan(600);
  });

  it('returns input unchanged for fraction 0', () => {
    const input = 'a' + ZERO_CHAR + 'b';
    expect(deleteMarkersFraction(input, 0)).toBe(input);
  });
});

describe('transform catalogue', () => {
  it('exposes all transforms with metadata', () => {
    expect(TRANSFORMS.length).toBeGreaterThanOrEqual(10);
    for (const t of TRANSFORMS) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.apply).toBe('function');
    }
  });

  it('looks up transforms by id', () => {
    expect(getTransform('nfc')?.name).toBe('Unicode NFC');
    expect(getTransform('strip-zero-width')).toBeDefined();
  });
});
