import { describe, it, expect } from 'vitest';
import {
  toCodePoints,
  codePointToHex,
  isZeroWidth,
  isWhitespaceChar,
  isControlChar,
  inspectCodePoints,
  codePointCount,
  stripZeroWidth,
  summarizeInvisible,
} from '../lib/unicode';

describe('code point helpers', () => {
  it('splits surrogate pairs as single code points', () => {
    // 🚀 is a surrogate pair (2 UTF-16 units, 1 code point).
    expect(toCodePoints('a🚀b')).toEqual(['a', '🚀', 'b']);
    expect(codePointCount('a🚀b')).toBe(3);
  });

  it('formats hex labels', () => {
    expect(codePointToHex(0x200b)).toBe('U+200B');
    expect(codePointToHex(0x41)).toBe('U+0041');
  });
});

describe('character classification', () => {
  it('detects zero-width characters', () => {
    expect(isZeroWidth('\u200B')).toBe(true);
    expect(isZeroWidth('\u200C')).toBe(true);
    expect(isZeroWidth('\u00AD')).toBe(true);
    expect(isZeroWidth('a')).toBe(false);
    expect(isZeroWidth(' ')).toBe(false);
  });

  it('detects whitespace', () => {
    expect(isWhitespaceChar(' ')).toBe(true);
    expect(isWhitespaceChar('\t')).toBe(true);
    expect(isWhitespaceChar('\n')).toBe(true);
    expect(isWhitespaceChar('\u00A0')).toBe(true); // no-break space
    expect(isWhitespaceChar('a')).toBe(false);
    expect(isWhitespaceChar('\u200B')).toBe(false); // zero-width is NOT \s
  });

  it('detects control characters', () => {
    expect(isControlChar('\u0000')).toBe(true);
    expect(isControlChar('\u0007')).toBe(true);
    expect(isControlChar('\u007F')).toBe(true);
    expect(isControlChar('a')).toBe(false);
  });
});

describe('inspectCodePoints', () => {
  it('produces one row per code point with correct metadata', () => {
    const rows = inspectCodePoints('a\u200B');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      index: 0,
      codePoint: 0x61,
      hex: 'U+0061',
      char: 'a',
      zeroWidth: false,
      whitespace: false,
      control: false,
    });
    expect(rows[1]).toMatchObject({
      codePoint: 0x200b,
      hex: 'U+200B',
      zeroWidth: true,
    });
    expect(rows[1].name).toBe('ZERO WIDTH SPACE');
  });

  it('tracks UTF-16 indices correctly across surrogate pairs', () => {
    const rows = inspectCodePoints('🚀a');
    expect(rows[0].index).toBe(0); // 🚀 occupies 2 UTF-16 units
    expect(rows[1].index).toBe(2); // 'a' starts at UTF-16 index 2
  });
});

describe('stripZeroWidth and summarizeInvisible', () => {
  it('strips only zero-width characters', () => {
    expect(stripZeroWidth('a\u200Bb\u00ADc')).toBe('abc');
  });

  it('summarizes invisible characters by code point', () => {
    const summary = summarizeInvisible('a\u200Bb\u200Bc\u200Cd');
    expect(summary).toEqual({ 'U+200B': 2, 'U+200C': 1 });
  });
});
