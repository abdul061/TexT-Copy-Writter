# Adaptive placement experiment (baseline vs. adaptive)

Research milestone: *can position-dependent transformation survival profiles
guide watermark placement and redundancy to improve exact payload recovery at
comparable overhead?*

**Status: measured prototype. No novelty, patentability, or security claim is
made.** Position-aware embedding and repetition coding are standard ideas in
the watermarking/steganography literature; this document only reports what the
two codecs do against THIS lab's transform suite. Prior-art review was not
performed and none is implied.

## Isolation

The baseline codec (`src/lib/watermark.ts`) is **unchanged**. The experiment
lives in separate modules:

| File | Role |
|---|---|
| `src/lib/survival.ts` | Measures per-boundary marker survival for all 13 transforms, aggregated into 10 normalized position bins |
| `src/lib/adaptive.ts` | Profile-guided placement codec (AWL1 frame harvested via the untouched baseline encoder; classification delegated to the untouched baseline decoder) |
| `src/lib/adaptive_benchmark.ts` | Head-to-head harness on the identical corpus |
| `src/test/survival.test.ts`, `src/test/adaptive.test.ts`, `src/test/adaptive_benchmark.test.ts` | Deterministic tests over the fixed corpus |
| `scripts/run_adaptive_benchmark.ts` | CLI runner: `npx vite-node scripts/run_adaptive_benchmark.ts` |

(This workspace is not a git repository, so isolation is by module, not branch.)

## How survival is measured

For every (sample, transform) pair, the baseline probe (`distributed, stride 6`)
records the visible-code-point boundary of each marker; after the transform,
survivors are mapped back to original boundaries — exact mapping when the
transformed visible text equals or prefixes the original (covers
`delete-markers`, `truncate-tail`, and the five marker-stripping transforms),
fractional approximation otherwise (only reached for all-markers-survive
transforms, where survival is 1.0 regardless). Per-bin ratios are clamped to
[0, 1].

## Adaptive placement

The encoder selects only boundaries in the bins with the **maximum measured
survival score** ("safe region"), orders them by ascending position so document
order equals frame order, and distributes markers front-loaded and evenly;
overflow clusters inside the safe region rather than being appended at the
document end. Exact recovery requires every marker to survive, so
partial-survival bins are rejected by design.

## Redundancy (documented error correction)

Repetition code with **block interleaving + majority vote + checksum
validation**: the frame marker sequence F is emitted r times back-to-back;
at decode, candidate block lengths g are searched (largest first) and the
first reconstruction that passes the baseline AWL1 magic+checksum wins. In a
deletion-only channel surviving copies are identical, so one copy per bit
suffices; the 4-byte magic makes a false validation over the search space
negligible (≤ 2⁻³² per candidate). `r` should be odd (ties → 0, deterministic).

## Measured results (fixed corpus, deterministic metrics)

Corpus: 5 samples × 13 transforms + 6 clean FP samples.

| Method | Exact recovery | Marker evidence | FP (recovery rule) | FP (evidence rule) | Overhead (markers/cp) | Encode ms | Decode ms |
|---|---|---|---|---|---|---|---|
| baseline (distributed, stride 6) | 46.2% (30/65) | 61.5% (40/65) | 0/6 | 3/6 | 3.11 | 0.45 | 3.27 |
| adaptive-r1 | 47.7% (31/65) | 61.5% (40/65) | 0/6 | 3/6 | **3.11 (equal)** | 1.59 | 4.15 |
| adaptive-r3 | 53.8% (35/65) | 61.5% (40/65) | 0/6 | 3/6 | 9.33 (3×) | 1.15 | 147.84 |

Per-transform exact recovery: identical for all methods on the 6
marker-preserving transforms (5/5) and on `delete-markers` and the five
marker-stripping transforms (0/5). The entire difference is `truncate-tail`:
baseline 0/5 → r=1 1/5 → r=3 5/5.

Findings:

1. **At identical overhead (r=1), profile-guided placement alone yields a small
   real gain** (+1 sample on `truncate-tail`, 30→31 exact recoveries) and never
   regresses. The gain is limited because `truncate-tail` truncates by absolute
   code-point count including markers, so a frame larger than ~¼ of the marked
   text cannot fully survive regardless of placement.
2. **Interleaved redundancy (r=3) recovers all truncation cases** (35/65) at
   3× overhead and with a large decode cost (block search) — both reported
   independently, never folded into one score.
3. **Random 50% marker deletion (`delete-markers`) defeats all three methods.**
   Scattered deletion misaligns block structure, so redundancy corrects region
   loss, not random loss, at these frame sizes. Reported as a null result.
4. Marker-stripping transforms destroy everything; payloads are reported
   `absent` / `payload: null` — never guessed.
5. False positives are identical for all methods (same corpus, same decoder,
   same documented decision rules): 0 under the recovery rule, 3/6 under the
   evidence rule (clean samples containing stray zero-width characters).

## Honest limitations

- The default placement profile is measured **in-sample** (same corpus that is
  benchmarked); held-out validation needs a larger corpus.
- The fractional alignment approximation can distort bins for transforms that
  rewrite visible text; it is only reached where survival is 100% anyway
  (visible as small dips like NFD b3:80% in the printed profile — attribution
  artifacts, not real losses).
- The corpus is small (5 samples); percentages move in 20% steps per sample.
- Runtime is machine-dependent and reported, not asserted, in tests.
- Not steganographic, not robust, not keyed, not proof of authorship — same
  inherited limitations as the baseline.
- **No novelty or patentability claim**; no prior-art search was performed.
