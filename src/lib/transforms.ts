/**
 * Transformation Lab primitives.
 *
 * Each transformation is a *pure* function from string -> string that models a
 * real-world editing/copying operation a marked document might pass through.
 * They are used to stress-test watermark survivability.
 *
 * IMPORTANT: These functions never execute the input as code. They only read
 * and rewrite characters.
 */

import { stripZeroWidth, isZeroWidth } from './unicode';

export type TransformId =
  | 'nfc'
  | 'nfd'
  | 'nfkc'
  | 'nfkd'
  | 'whitespace-cleanup'
  | 'strip-zero-width'
  | 'delete-markers'
  | 'plaintext-copy'
  | 'format-markdown'
  | 'format-html'
  | 'format-pdf-like'
  | 'truncate-tail'
  | 'retype-visible';

export interface Transform {
  id: TransformId;
  name: string;
  description: string;
  category: 'normalization' | 'cleanup' | 'formatting' | 'attack';
  apply(input: string, params?: TransformParams): string;
}

export interface TransformParams {
  deleteFraction?: number;
  truncateFraction?: number;
}

type NormForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

/** NFC / NFD / NFKC / NFKD via String.prototype.normalize. */
export function applyNormalization(input: string, form: string): string {
  return input.normalize(form as NormForm);
}

/**
 * Whitespace cleanup: collapse runs of ASCII whitespace to a single space and
 * trim the ends. Zero-width markers are left untouched by this op (they are not
 * \s), which is a realistic limitation of naive cleanup.
 */
export function cleanupWhitespace(input: string): string {
  return input.replace(/[ \t\r\n\f\v]+/g, ' ').trim();
}

/** Remove all known zero-width / invisible characters. */
export function removeZeroWidth(input: string): string {
  return stripZeroWidth(input);
}

/**
 * Delete a fraction of zero-width marker characters (simulating partial marker
 * deletion / tampering). Deterministic so benchmark results are reproducible.
 */
export function deleteMarkersFraction(input: string, fraction = 0.5): string {
  const f = Math.min(1, Math.max(0, fraction));
  if (f === 0) return input;
  let out = '';
  let markerIndex = 0;
  for (const char of input) {
    if (isZeroWidth(char)) {
      const keep = ((markerIndex * 2654435761) % 1000) / 1000 >= f;
      if (keep) out += char;
      markerIndex += 1;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Simulate a "plain text copy" round-trip. Many rich-text editors drop zero
 * width characters when copying to a plain-text field. We model the *lossy*
 * case (markers stripped) as the common case.
 */
export function plaintextCopy(input: string): string {
  return removeZeroWidth(input);
}

/**
 * Simulate conversion to Markdown. Passthroughs typically preserve raw chars;
 * we model a plain re-emit that keeps zero-width chars (optimistic) but
 * normalizes line endings.
 */
export function formatToMarkdown(input: string): string {
  return input.replace(/\r\n/g, '\n');
}

/**
 * Simulate conversion to HTML. We model a serializer/sanitizer that strips
 * zero-width chars inside text nodes (common, pessimistic).
 */
export function formatToHtml(input: string): string {
  return removeZeroWidth(input);
}

/**
 * Simulate a PDF-like flatten. Text extracted from PDF often loses zero-width
 * characters entirely.
 */
export function formatToPdfLike(input: string): string {
  return removeZeroWidth(input);
}

/** Drop the last `fraction` of the string (truncation attack). */
export function truncateTail(input: string, fraction = 0.25): string {
  const f = Math.min(1, Math.max(0, fraction));
  const cut = Math.floor(input.length * (1 - f));
  return input.slice(0, cut);
}

/**
 * Simulate "re-typing" the visible text: only the visible glyphs remain and all
 * invisible characters are lost.
 */
export function retypeVisible(input: string): string {
  return stripZeroWidth(input);
}

/** The full, ordered catalogue of transformations shown in the lab. */
export const TRANSFORMS: Transform[] = [
  {
    id: 'nfc',
    name: 'Unicode NFC',
    description:
      'Canonical composition normalization. Zero-width chars are NOT removed by NFC/NFD in modern engines, but combining sequences are rewritten.',
    category: 'normalization',
    apply: (input) => applyNormalization(input, 'NFC'),
  },
  {
    id: 'nfd',
    name: 'Unicode NFD',
    description:
      'Canonical decomposition normalization. Rewrites accented characters into base + combining marks; zero-width markers survive.',
    category: 'normalization',
    apply: (input) => applyNormalization(input, 'NFD'),
  },
  {
    id: 'nfkc',
    name: 'Unicode NFKC',
    description:
      'Compatibility composition. More aggressive: can rewrite some characters and collapse compatibility code points.',
    category: 'normalization',
    apply: (input) => applyNormalization(input, 'NFKC'),
  },
  {
    id: 'nfkd',
    name: 'Unicode NFKD',
    description:
      'Compatibility decomposition. The most aggressive normalization form.',
    category: 'normalization',
    apply: (input) => applyNormalization(input, 'NFKD'),
  },
  {
    id: 'whitespace-cleanup',
    name: 'Whitespace cleanup',
    description:
      'Collapse whitespace runs and trim. Note: U+200B/U+200C are NOT \\s, so naive whitespace cleanup leaves markers intact.',
    category: 'cleanup',
    apply: (input) => cleanupWhitespace(input),
  },
  {
    id: 'strip-zero-width',
    name: 'Strip zero-width chars',
    description:
      'Explicitly removes all zero-width/invisible characters. This is the "detection + removal" attack the baseline cannot survive.',
    category: 'attack',
    apply: (input) => removeZeroWidth(input),
  },
  {
    id: 'delete-markers',
    name: 'Partial marker deletion',
    description:
      'Deterministically deletes a fraction of marker characters (default 50%), simulating partial tampering.',
    category: 'attack',
    apply: (input, params) => deleteMarkersFraction(input, params?.deleteFraction),
  },
  {
    id: 'plaintext-copy',
    name: 'Plain-text copy',
    description:
      'Simulates copying through a plain-text field that strips zero-width characters (the common lossy case).',
    category: 'formatting',
    apply: (input) => plaintextCopy(input),
  },
  {
    id: 'format-markdown',
    name: 'Convert to Markdown',
    description:
      'Re-emits text as Markdown. Optimistic model: markers are preserved (only line endings normalized).',
    category: 'formatting',
    apply: (input) => formatToMarkdown(input),
  },
  {
    id: 'format-html',
    name: 'Convert to HTML',
    description:
      'Models an HTML serializer/sanitizer that strips zero-width characters from text nodes (common, pessimistic).',
    category: 'formatting',
    apply: (input) => formatToHtml(input),
  },
  {
    id: 'format-pdf-like',
    name: 'PDF-like flatten',
    description:
      'Models text extraction from a flattened PDF, which typically loses all zero-width characters.',
    category: 'formatting',
    apply: (input) => formatToPdfLike(input),
  },
  {
    id: 'truncate-tail',
    name: 'Truncate tail',
    description:
      'Drops the last fraction of the string (default 25%), simulating an editor that trims trailing content.',
    category: 'attack',
    apply: (input, params) => truncateTail(input, params?.truncateFraction),
  },
  {
    id: 'retype-visible',
    name: 'Re-type visible text',
    description:
      'Models a human retyping the document. Only visible glyphs survive; all invisible markers are lost.',
    category: 'attack',
    apply: (input) => retypeVisible(input),
  },
];

/** Look up a transform by id. */
export function getTransform(id: TransformId): Transform | undefined {
  return TRANSFORMS.find((t) => t.id === id);
}

