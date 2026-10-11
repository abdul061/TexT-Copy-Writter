/**
 * Runnable benchmark comparison (offline, browser-compatible code paths):
 *   npx vite-node scripts/run_adaptive_benchmark.ts
 * Prints the headline table, the per-transform matrix, and the measured
 * position-survival profiles that drive adaptive placement.
 */
import {
  runAdaptiveComparison,
  formatComparisonTable,
  formatByTransformMatrix,
} from '../src/lib/adaptive_benchmark';
import {
  measureSurvivalProfiles,
  aggregateSurvivalProfile,
} from '../src/lib/survival';

const report = runAdaptiveComparison();
console.log('=== Anchor-Weave: baseline vs. adaptive placement ===\n');
console.log(formatComparisonTable(report));
console.log('\n=== Exact payload recovery per transform ===\n');
console.log(formatByTransformMatrix(report));
console.log('\n=== Measured marker-survival profiles (per position bin 0..9) ===\n');
for (const p of measureSurvivalProfiles()) {
  const cells = p.binSurvival.map((s, i) => `b${i}:${(s * 100).toFixed(0)}%`).join(' ');
  console.log(`${p.transformId.padEnd(20)} ${cells}`);
}
console.log('\nAggregate placement profile (uniform over transforms):');
console.log(
  aggregateSurvivalProfile(measureSurvivalProfiles())
    .map((s, i) => `b${i}:${s.toFixed(3)}`)
    .join(' '),
);
