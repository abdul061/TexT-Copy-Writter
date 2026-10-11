/**
 * One-off probe: per-sample truncate-tail outcomes for all three methods.
 *   npx vite-node scripts/probe_truncate.ts
 */
import { encodeWatermark, decodeWatermark } from '../src/lib/watermark';
import { encodeAdaptive, decodeAdaptive } from '../src/lib/adaptive';
import { getTransform } from '../src/lib/transforms';
import { BENCHMARK_SAMPLES } from '../src/lib/benchmark';
import { codePointCount } from '../src/lib/unicode';

const t = getTransform('truncate-tail')!;
for (const s of BENCHMARK_SAMPLES) {
  const base = encodeWatermark(s.text, s.payload, { insertion: 'distributed', stride: 6 });
  const bd = decodeWatermark(t.apply(base.marked));

  const a1 = encodeAdaptive(s.text, s.payload, { repetition: 1 });
  const a1d = decodeAdaptive(t.apply(a1.marked), { repetition: 1 });

  const a3 = encodeAdaptive(s.text, s.payload, { repetition: 3 });
  const a3d = decodeAdaptive(t.apply(a3.marked), { repetition: 3 });

  const cps = codePointCount(s.text);
  console.log(
    `${s.id}: cps=${cps} utf16=${s.text.length} frame=${a1.frameBitCount}` +
      ` | base=${bd.status} r1=${a1d.baseline.status}` +
      `${a1d.baseline.status === 'complete' ? '(EXACT)' : ''} r3=${a3d.baseline.status}` +
      `${a3d.baseline.status === 'complete' ? '(EXACT)' : ''}`,
  );
}
