/**
 * Experimental Algorithm Interface.
 *
 * ============================================================================
 * THIS MODULE IS FOR *UNVALIDATED* RESEARCH ONLY.
 * ============================================================================
 *
 * Nothing in here is proven to work, robust, or secure. Algorithms registered
 * here are scaffolds and thought-experiments. The UI labels every one of them
 * as EXPERIMENTAL and refuses to present their output as validated evidence.
 *
 * The baseline (ZW-binary) lives in `watermark.ts` and is the ONLY codec the
 * benchmark treats as a reference. Experimental algorithms are never mixed into
 * the baseline benchmark numbers.
 *
 * An experimental algorithm implements this interface. `encode`/`decode` are
 * intentionally permissive (they may throw); callers must handle failures and
 * surface them as "unvalidated / experimental" results.
 */

import type { DecodeStatus } from './watermark';

export interface ExperimentalEncodeResult {
  marked: string;
  /** Free-form notes the algorithm wants to surface (never treated as proof). */
  notes: string[];
}

export interface ExperimentalDecodeResult {
  status: DecodeStatus;
  payload: string | null;
  notes: string[];
}

export interface ExperimentalAlgorithm {
  id: string;
  name: string;
  /** One-line status, e.g. "Prototype — not validated". */
  status: string;
  /** Longer description of the idea and why it is unproven. */
  description: string;
  /** Explicit, honest limitations. */
  limitations: string[];
  encode(text: string, payload: string): ExperimentalEncodeResult;
  decode(input: string): ExperimentalDecodeResult;
}

/**
 * PROTOTYPE #1 — "Anchor interval" encoding.
 *
 * IDEA (unvalidated): encode payload bits across a wider zero-width alphabet
 * (U+200B/C/D) with U+2060 frame sentinels, to explore redundancy. A sketch.
 *
 * WHY IT IS NOT VALIDATED: no error correction, no key, never measured against
 * the transformation suite. Included to exercise the interface only.
 */
const anchorInterval: ExperimentalAlgorithm = {
  id: 'anchor-interval',
  name: 'Anchor interval (prototype)',
  status: 'Prototype — not validated',
  description:
    'Encodes payload bits across a wider zero-width alphabet (U+200B/C/D) and ' +
    'marks frame boundaries with U+2060 sentinels. A sketch to explore ' +
    'redundancy, not a working robust scheme.',
  limitations: [
    'No error correction: a single flipped/deleted marker can break framing.',
    'No secret key: not an authorship proof.',
    'Never benchmarked; performance and robustness are unknown.',
    'May collide with legitimate U+200D (ZWJ) in real text (e.g. emoji ZWJ).',
  ],
  encode(text, payload) {
    const notes: string[] = [];
    const bytes = Array.from(new TextEncoder().encode(payload));
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    const alphabet = ['\u200B', '\u200C', '\u200D'];
    let run = '\u2060';
    for (const bit of bits) run += alphabet[Number(bit)];
    run += '\u2060';
    notes.push('Appended ' + (bits.length + 2) + ' marker chars (3-symbol alphabet).');
    notes.push('UNVALIDATED: this output is not evidence of anything.');
    return { marked: text + run, notes };
  },
  decode(input) {
    const notes: string[] = [];
    const start = input.indexOf('\u2060');
    const end = input.lastIndexOf('\u2060');
    if (start === -1 || end <= start) {
      notes.push('No sentinel pair found.');
      return { status: 'absent', payload: null, notes };
    }
    const run = input.slice(start + 1, end);
    const map: Record<string, string> = { '\u200B': '0', '\u200C': '1', '\u200D': '1' };
    let bits = '';
    for (const ch of run) if (map[ch] !== undefined) bits += map[ch];
    if (bits.length < 8 || bits.length % 8 !== 0) {
      notes.push('Collected ' + bits.length + ' bits; incomplete or corrupt.');
      return { status: 'partial', payload: null, notes };
    }
    const byteArr: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      byteArr.push(parseInt(bits.slice(i, i + 8), 2));
    }
    try {
      // fatal:true — non-fatal decoding would substitute U+FFFD and never
      // throw, making this catch unreachable. (Audit fix D1.)
      const payload = new TextDecoder('utf-8', { fatal: true }).decode(
        new Uint8Array(byteArr),
      );
      notes.push('UNVALIDATED decode: ' + byteArr.length + ' bytes recovered.');
      return { status: 'complete', payload, notes };
    } catch {
      notes.push('Recovered bytes were not valid UTF-8.');
      return { status: 'invalid', payload: null, notes };
    }
  },
};


/**
 * PROTOTYPE #2 — "Whitespace rhythm" encoding.
 *
 * IDEA (unvalidated): encode bits in the choice between a single space and a
 * double space between words. Visible glyphs are preserved but spacing changes.
 *
 * WHY IT IS NOT VALIDATED: this alters whitespace, so it is NOT visually
 * equivalent under a strict byte comparison, and it collapses the moment any
 * whitespace normalization runs. Included to show a different trade-off space.
 */
const whitespaceRhythm: ExperimentalAlgorithm = {
  id: 'whitespace-rhythm',
  name: 'Whitespace rhythm (prototype)',
  status: 'Prototype — not validated',
  description:
    'Encodes payload bits by choosing single vs. double spaces between words. ' +
    'Preserves visible glyphs but changes whitespace, so it is fragile.',
  limitations: [
    'NOT visually equivalent at the byte level (spacing changes).',
    'Destroyed by any whitespace normalization or reformatting.',
    'Requires enough word boundaries to hold the payload; silently truncates.',
    'No key, no error correction, never benchmarked.',
  ],
  encode(text, payload) {
    const notes: string[] = [];
    const bytes = Array.from(new TextEncoder().encode(payload));
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');

    const words = text.split(' ');
    let bitIndex = 0;
    const out: string[] = [];
    for (let i = 0; i < words.length; i++) {
      out.push(words[i]);
      if (i < words.length - 1) {
        const sep = bitIndex < bits.length && bits[bitIndex] === '1' ? '  ' : ' ';
        bitIndex += 1;
        out.push(sep);
      }
    }
    if (bitIndex < bits.length) {
      notes.push(
        'WARNING: payload truncated — not enough word boundaries (' +
          bitIndex + '/' + bits.length + ' bits placed).',
      );
    }
    notes.push('UNVALIDATED: spacing changes are not evidence of ownership.');
    return { marked: out.join(''), notes };
  },
  decode(input) {
    const notes: string[] = [];
    const bits: string[] = [];
    const tokens = input.split(/(\s+)/);
    for (const tok of tokens) {
      if (tok.length === 0) continue;
      if (/^\s+$/.test(tok)) bits.push(tok.length >= 2 ? '1' : '0');
    }
    const trimmed = bits.join('');
    if (trimmed.length < 8 || trimmed.length % 8 !== 0) {
      notes.push('Recovered ' + trimmed.length + ' bits; incomplete.');
      return { status: 'partial', payload: null, notes };
    }
    const byteArr: number[] = [];
    for (let i = 0; i < trimmed.length; i += 8) {
      byteArr.push(parseInt(trimmed.slice(i, i + 8), 2));
    }
    try {
      // fatal:true — non-fatal decoding would substitute U+FFFD and never
      // throw, making this catch unreachable. (Audit fix D1.)
      const payload = new TextDecoder('utf-8', { fatal: true }).decode(
        new Uint8Array(byteArr),
      );
      notes.push('UNVALIDATED decode: ' + byteArr.length + ' bytes recovered.');
      return { status: 'complete', payload, notes };
    } catch {
      notes.push('Recovered bytes were not valid UTF-8.');
      return { status: 'invalid', payload: null, notes };
    }
  },
};

/** The registry of experimental algorithms surfaced in the UI. */
export const EXPERIMENTAL_ALGORITHMS: ExperimentalAlgorithm[] = [
  anchorInterval,
  whitespaceRhythm,
];

/** Look up an experimental algorithm by id. */
export function getExperimentalAlgorithm(
  id: string,
): ExperimentalAlgorithm | undefined {
  return EXPERIMENTAL_ALGORITHMS.find((a) => a.id === id);
}

