/**
 * Unicode inspection utilities.
 *
 * Everything here is pure and dependency-free so it can run in the browser and
 * be unit-tested in isolation. No pasted text is ever executed as code; these
 * functions only read code points.
 */

export interface CodePointRow {
  /** Zero-based index within the string (counted in UTF-16 code units). */
  index: number;
  /** The numeric Unicode code point. */
  codePoint: number;
  /** Hex representation, e.g. "U+200B". */
  hex: string;
  /** The single character (may be a surrogate pair). */
  char: string;
  /** Human-readable name when known, otherwise null. */
  name: string | null;
  /** True when the code point renders with no visible glyph. */
  zeroWidth: boolean;
  /** True when the code point is whitespace. */
  whitespace: boolean;
  /** True when the code point is a C0/C1 control character. */
  control: boolean;
}

/**
 * A curated dictionary of code points relevant to invisible-Unicode
 * watermarking and general text inspection. Kept small and explicit on
 * purpose: we do not pull in a large Unicode database.
 */
const CODE_POINT_NAMES: Record<number, string> = {
  0x00: 'NULL',
  0x09: 'CHARACTER TABULATION (tab)',
  0x0a: 'LINE FEED (newline)',
  0x0d: 'CARRIAGE RETURN',
  0x20: 'SPACE',
  0x7f: 'DELETE',
  0x85: 'NEXT LINE',
  0xa0: 'NO-BREAK SPACE',
  0xad: 'SOFT HYPHEN',
  0xb7: 'MIDDLE DOT',
  0x200b: 'ZERO WIDTH SPACE',
  0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER',
  0x200e: 'LEFT-TO-RIGHT MARK',
  0x200f: 'RIGHT-TO-LEFT MARK',
  0x2060: 'WORD JOINER',
  0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES',
  0x2063: 'INVISIBLE SEPARATOR',
  0x2064: 'INVISIBLE PLUS',
  0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)',
};

/** Code points that render with no visible glyph. */
const ZERO_WIDTH_CODE_POINTS = new Set<number>([
  0x00ad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x2061, 0x2062,
  0x2063, 0x2064, 0xfeff,
]);

/** Code points commonly treated as whitespace (superset of JS \s). */
function isWhitespaceCodePoint(cp: number): boolean {
  // Standard whitespace plus the invisible variants that behave like spaces.
  return (
    cp === 0x20 ||
    cp === 0x09 ||
    cp === 0x0a ||
    cp === 0x0d ||
    cp === 0x0b ||
    cp === 0x0c ||
    cp === 0x85 ||
    cp === 0xa0 ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000
  );
}

function isControlCodePoint(cp: number): boolean {
  return (cp >= 0x00 && cp <= 0x1f) || (cp >= 0x7f && cp <= 0x9f);
}

/**
 * Split a string into an array of single-character strings where each entry is
 * exactly one Unicode code point (surrogate pairs are kept together).
 */
export function toCodePoints(input: string): string[] {
  return Array.from(input);
}

/** Convert a code point to its "U+XXXX" hex label. */
export function codePointToHex(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

/** True when the character is a zero-width / invisible code point. */
export function isZeroWidth(char: string): boolean {
  const cp = char.codePointAt(0);
  return cp !== undefined && ZERO_WIDTH_CODE_POINTS.has(cp);
}

/** True when the character is whitespace. */
export function isWhitespaceChar(char: string): boolean {
  const cp = char.codePointAt(0);
  return cp !== undefined && isWhitespaceCodePoint(cp);
}

/** True when the character is a C0/C1 control code point. */
export function isControlChar(char: string): boolean {
  const cp = char.codePointAt(0);
  return cp !== undefined && isControlCodePoint(cp);
}

/**
 * Produce a per-code-point breakdown of a string for the inspection panel.
 * This only reads the string; it never evaluates or transmits it.
 */
export function inspectCodePoints(input: string): CodePointRow[] {
  const rows: CodePointRow[] = [];
  let utf16Index = 0;
  for (const char of input) {
    const cp = char.codePointAt(0) as number;
    rows.push({
      index: utf16Index,
      codePoint: cp,
      hex: codePointToHex(cp),
      char,
      name: CODE_POINT_NAMES[cp] ?? null,
      zeroWidth: ZERO_WIDTH_CODE_POINTS.has(cp),
      whitespace: isWhitespaceCodePoint(cp),
      control: isControlCodePoint(cp),
    });
    utf16Index += char.length;
  }
  return rows;
}

/** Count code points (not UTF-16 units). */
export function codePointCount(input: string): number {
  let count = 0;
  for (const _char of input) {
    count += 1;
  }
  return count;
}

/**
 * Return the "visible" text: the input with all known zero-width / invisible
 * characters removed. This is used to check visual equivalence.
 */
export function stripZeroWidth(input: string): string {
  let out = '';
  for (const char of input) {
    if (!isZeroWidth(char)) out += char;
  }
  return out;
}

/**
 * A short, human-readable summary of the invisible characters present,
 * suitable for showing in the UI next to a byte/code-point count.
 */
export function summarizeInvisible(input: string): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const char of input) {
    if (isZeroWidth(char)) {
      const cp = char.codePointAt(0) as number;
      const label = codePointToHex(cp);
      summary[label] = (summary[label] ?? 0) + 1;
    }
  }
  return summary;
}
