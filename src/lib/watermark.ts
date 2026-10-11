/**
 * Anchor-Weave baseline invisible-Unicode watermark codec.
 *
 * DOCUMENTED, REVERSIBLE BASELINE ("ZW-binary" scheme) -- a *benchmark*
 * watermark, not a novel or secure one. It gives the rest of the lab a known,
 * reversible reference to measure against.
 *
 * Encoding
 * --------
 * 1. Payload string -> UTF-8 bytes.
 * 2. Frame (all integers big-endian):
 *      MAGIC(4) | VERSION(1) | LENGTH(2) | PAYLOAD(LENGTH) | CHECKSUM(1)
 *    - MAGIC   = "AWL1" (0x41 0x57 0x4C 0x31) -- identifies our frame.
 *    - VERSION = 0x01
 *    - LENGTH  = payload length in bytes (0..65535), big-endian.
 *    - CHECKSUM= (VERSION + LENGTH_hi + LENGTH_lo + sum(payload)) mod 256.
 * 3. Each frame bit -> one zero-width char:  0 -> U+200B, 1 -> U+200C.
 * 4. The marker run is woven into the visible text WITHOUT altering any visible
 *    character, so marked text is visually identical to the original.
 *    Strategies: "start", "end", "distributed" (spread every `stride` points).
 *
 * Reversibility: removing every U+200B/U+200C restores the exact visible text.
 * See stripMarkers().
 *
 * KNOWN LIMITATIONS (kept explicit in UI + docs)
 * ----------------------------------------------
 * - NOT steganographic vs. a determined analyst; markers are trivially
 *   detectable by a zero-width scan (this tool ships that scan).
 * - NOT robust: stripping zero-width chars, normalization, or re-typing
 *   destroys it.
 * - NOT proof of authorship: there is no secret key. Anyone can embed the same
 *   frame. It is a presence signal, not an identity signature.
 * - Fails if the original text already contains U+200B / U+200C.
 */

import { toCodePoints, codePointCount } from './unicode';

/** Marker bit characters. */
export const ZERO_CHAR = '\u200B'; // ZERO WIDTH SPACE  -> bit 0
export const ONE_CHAR = '\u200C'; // ZERO WIDTH NON-JOINER -> bit 1

/** The full set of characters this codec treats as markers. */
export const MARKER_CHARS = [ZERO_CHAR, ONE_CHAR] as const;

const MAGIC = [0x41, 0x57, 0x4c, 0x31]; // "AWL1"
const VERSION = 0x01;
const HEADER_BYTES = MAGIC.length + 1 + 2; // magic + version + length
const FRAME_OVERHEAD_BYTES = HEADER_BYTES + 1; // + checksum

export type InsertionStrategy = 'start' | 'end' | 'distributed';

export interface EncodeOptions {
  insertion?: InsertionStrategy;
  stride?: number;
}

export interface EncodeResult {
  marked: string;
  markerCount: number;
  payloadBytes: number;
  frameBytes: number;
  overheadRatio: number;
}

export type DecodeStatus = 'complete' | 'partial' | 'invalid' | 'absent';

export interface DecodeResult {
  status: DecodeStatus;
  payload: string | null;
  markerCount: number;
  frameBitCount: number;
  declaredPayloadBytes: number | null;
  recoveredPayloadBytes: number;
  detected: boolean;
  reason: string;
  visibleText: string;
}

// --- low-level helpers -----------------------------------------------------

function bytesToBits(bytes: number[]): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

function bitsToBytes(bits: number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] & 1);
    }
    bytes.push(byte & 0xff);
  }
  return bytes;
}

function bitToChar(bit: number): string {
  return bit === 1 ? ONE_CHAR : ZERO_CHAR;
}

function charToBit(char: string): number | null {
  if (char === ONE_CHAR) return 1;
  if (char === ZERO_CHAR) return 0;
  return null;
}

function checksum(frameWithoutChecksum: number[]): number {
  let sum = 0;
  for (const b of frameWithoutChecksum) sum += b;
  return sum & 0xff;
}

function toUtf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function utf8BytesToString(bytes: number[]): string {
  // fatal:true makes TextDecoder THROW on invalid UTF-8 instead of silently
  // substituting U+FFFD replacement characters. Without it the "not valid
  // UTF-8" branch in decodeWatermark() is dead code and corrupt payloads are
  // misreported as complete. (Audit fix D1.)
  return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
}

function buildFrame(payloadBytes: number[]): number[] {
  const length = payloadBytes.length;
  if (length > 0xffff) {
    throw new Error(`Payload too large: ${length} bytes (max ${0xffff}).`);
  }
  const withoutChecksum = [
    ...MAGIC,
    VERSION,
    (length >> 8) & 0xff,
    length & 0xff,
    ...payloadBytes,
  ];
  return [...withoutChecksum, checksum(withoutChecksum)];
}


// --- public API ------------------------------------------------------------

/**
 * Encode a payload into the text using the documented baseline scheme.
 * The visible text is preserved exactly.
 */
export function encodeWatermark(
  text: string,
  payload: string,
  options: EncodeOptions = {},
): EncodeResult {
  const insertion = options.insertion ?? 'end';
  const stride = Math.max(1, options.stride ?? 8);

  const payloadBytes = toUtf8Bytes(payload);
  const frame = buildFrame(payloadBytes);
  const bits = bytesToBits(frame);
  const markerChars = bits.map(bitToChar);

  let marked: string;
  if (insertion === 'start') {
    marked = markerChars.join('') + text;
  } else if (insertion === 'end') {
    marked = text + markerChars.join('');
  } else {
    marked = weaveDistributed(text, markerChars, stride);
  }

  const totalCodePoints = codePointCount(marked);
  const markerCount = markerChars.length;
  return {
    marked,
    markerCount,
    payloadBytes: payloadBytes.length,
    frameBytes: frame.length,
    overheadRatio: totalCodePoints === 0 ? 0 : markerCount / totalCodePoints,
  };
}

function weaveDistributed(
  text: string,
  markerChars: string[],
  stride: number,
): string {
  const codePoints = toCodePoints(text);
  if (codePoints.length === 0) return markerChars.join('');

  // Boundary positions: insert markers after every `stride`-th code point.
  const boundaries: number[] = [];
  for (let i = stride - 1; i < codePoints.length; i += stride) {
    boundaries.push(i);
  }
  if (boundaries.length === 0) {
    // Text is shorter than one stride, so no interior boundary exists and the
    // run cannot be interleaved. It is appended as a single trailing run.
    // (Documented limitation: check the marker-distribution tests.)
    return codePoints.join('') + markerChars.join('');
  }

  // Split the marker sequence into contiguous per-boundary chunks whose sizes
  // differ by at most one, so each boundary receives a near-equal share and no
  // single trailing run holds a disproportionate share of the frame — while
  // preserving original bit order (chunk 0 holds the first markers, chunk 1
  // the next, ...). Round-robin interleave would scramble bit order and break
  // decoding. (Audit fix D4: previously all leftover markers were dumped into
  // one tail run, so 82-95% of the frame sat at the very end and the
  // "distributed" label was misleading.)
  const total = markerChars.length;
  const buckets = boundaries.map((_, b) => {
    const start = Math.floor((b * total) / boundaries.length);
    const end = Math.floor(((b + 1) * total) / boundaries.length);
    return markerChars.slice(start, end).join('');
  });

  let out = '';
  let boundaryIndex = 0;
  for (let i = 0; i < codePoints.length; i++) {
    out += codePoints[i];
    if (
      boundaryIndex < boundaries.length &&
      boundaries[boundaryIndex] === i
    ) {
      out += buckets[boundaryIndex];
      boundaryIndex += 1;
    }
  }
  return out;
}

/** Collect all marker bits present in a string, in order. */
export function collectMarkerBits(input: string): number[] {
  const bits: number[] = [];
  for (const char of input) {
    const bit = charToBit(char);
    if (bit !== null) bits.push(bit);
  }
  return bits;
}

/** Count marker characters (U+200B / U+200C) in a string. */
export function countMarkers(input: string): number {
  let count = 0;
  for (const char of input) {
    if (charToBit(char) !== null) count += 1;
  }
  return count;
}

/**
 * Remove every marker character (U+200B / U+200C) from the text.
 * This restores the exact visible text that the encoder preserved.
 */
export function stripMarkers(input: string): string {
  let out = '';
  for (const char of input) {
    if (charToBit(char) === null) out += char;
  }
  return out;
}


/**
 * Decode a (possibly transformed) string, reporting how much evidence of the
 * baseline watermark survived. Never throws on malformed input.
 */
export function decodeWatermark(input: string): DecodeResult {
  const visibleText = stripMarkers(input);
  const bits = collectMarkerBits(input);
  const markerCount = bits.length;

  const base = {
    markerCount,
    frameBitCount: bits.length,
    declaredPayloadBytes: null as number | null,
    recoveredPayloadBytes: 0,
    detected: false,
    visibleText,
  };

  if (markerCount === 0) {
    return {
      ...base,
      status: 'absent',
      payload: null,
      reason: 'No baseline marker characters (U+200B/U+200C) were found.',
    };
  }

  const minHeaderBits = HEADER_BYTES * 8;
  if (bits.length < minHeaderBits) {
    return {
      ...base,
      status: 'partial',
      payload: null,
      reason:
        `Only ${bits.length} marker bits found; at least ${minHeaderBits} ` +
        `are needed for a frame header.`,
    };
  }

  const bytes = bitsToBytes(bits);

  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) {
      return {
        ...base,
        status: 'invalid',
        payload: null,
        reason:
          'Marker bits are present but the MAGIC header does not match ' +
          '(corrupted, or unrelated zero-width characters).',
      };
    }
  }

  const version = bytes[MAGIC.length];
  if (version !== VERSION) {
    return {
      ...base,
      status: 'invalid',
      payload: null,
      reason:
        `Unsupported frame version 0x${version.toString(16).toUpperCase()}` +
        ` (expected 0x0${VERSION}).`,
    };
  }

  const declaredLength =
    (bytes[MAGIC.length + 1] << 8) | bytes[MAGIC.length + 2];
  const neededBytes = FRAME_OVERHEAD_BYTES + declaredLength;
  const withLength = { ...base, declaredPayloadBytes: declaredLength };

  if (bytes.length < neededBytes) {
    return {
      ...withLength,
      status: 'partial',
      payload: null,
      reason:
        `Frame header is intact (declares ${declaredLength} payload bytes) ` +
        `but only ${bytes.length - FRAME_OVERHEAD_BYTES} payload bytes ` +
        `survived. The marker run appears truncated.`,
    };
  }

  const payloadBytes = bytes.slice(HEADER_BYTES, HEADER_BYTES + declaredLength);
  const providedChecksum = bytes[HEADER_BYTES + declaredLength];
  // Must match buildFrame(): checksum covers MAGIC + VERSION + LENGTH + PAYLOAD.
  const expectedChecksum = checksum([
    ...MAGIC,
    VERSION,
    (declaredLength >> 8) & 0xff,
    declaredLength & 0xff,
    ...payloadBytes,
  ]);

  if (providedChecksum !== expectedChecksum) {
    return {
      ...withLength,
      status: 'invalid',
      payload: null,
      recoveredPayloadBytes: payloadBytes.length,
      reason:
        `Checksum mismatch (expected 0x${expectedChecksum
          .toString(16)
          .toUpperCase()}, got 0x${providedChecksum
          .toString(16)
          .toUpperCase()}). The payload data is corrupted.`,
    };
  }

  let payload: string;
  try {
    payload = utf8BytesToString(payloadBytes);
  } catch {
    return {
      ...withLength,
      status: 'invalid',
      payload: null,
      recoveredPayloadBytes: payloadBytes.length,
      reason: 'Payload bytes are not valid UTF-8.',
    };
  }

  return {
    ...withLength,
    status: 'complete',
    payload,
    detected: true,
    recoveredPayloadBytes: payloadBytes.length,
    reason:
      'Valid baseline frame recovered (magic, version, length, checksum).',
  };
}

/** Metadata describing this baseline for the UI. */
export const BASELINE_METADATA = {
  id: 'zw-binary',
  name: 'ZW-binary baseline',
  kind: 'baseline' as const,
  magic: 'AWL1',
  version: VERSION,
  alphabet: 'U+200B (bit 0) / U+200C (bit 1)',
};

