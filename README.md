# Anchor-Weave Research Lab v0.1

A **browser-only** research application for evaluating **invisible-Unicode text
watermarking** techniques. All document processing runs locally in your browser:
there is no backend, no database, no external API, no analytics, and no file
uploads.

> ⚠️ **Honesty first.** The baseline watermark shipped here is a *documented,
> reversible reference implementation*. It is **not** undetectable, **not**
> robust to editing, and **not** a patentable or novel scheme. A recovered frame
> is a **presence signal**, never proof of authorship. See
> [Limitations](#known-limitations) and [Security](#security--privacy).

---

## Quick start

```bash
npm install        # install dependencies
npm run dev        # start the Vite dev server (http://localhost:5173)
npm test           # run the unit tests (Vitest)
npm run typecheck  # type-check the whole project (tsc --noEmit)
npm run build      # production build (type-check + vite build)
```

Requires Node 18+ (developed and tested on Node 24).

---

## Tech stack

- **React 18** + **Vite** + **TypeScript** (strict)
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Vitest** (+ jsdom, Testing Library) for unit tests

---

## Modules

| Tab                | Module                        | Purpose                                                                 |
| ------------------ | ----------------------------- | ----------------------------------------------------------------------- |
| **Workbench**      | Text Workbench                | Paste text, generate a marked copy, compare visible text, inspect code points, copy results. |
| **Baseline**       | Baseline Encoder              | The documented, reversible ZW-binary codec, with its limitations stated explicitly. |
| **Transformations**| Transformation Lab            | Apply normalization, cleanup, marker deletion, plain-text copy, and simulated format conversions; observe survivability. |
| **Decoder**        | Decoder                       | Extract surviving markers and classify evidence as **complete / partial / invalid / absent**. |
| **Benchmark**      | Benchmark Dashboard           | Measure recovery, detection, false positives, marker overhead, and visual equivalence over a reproducible corpus. |
| **Experimental β** | Experimental Algorithm Interface | A clearly separated sandbox for **unvalidated** research prototypes.     |
| **Security & Docs**| Security / threat model       | In-app statement of security posture, threat model, and limitations.    |

The Workbench and Baseline tabs both exercise the same codec; the Baseline tab
is the dedicated, documented view of the reference scheme and its limitations.

---

## The baseline codec (ZW-binary)

This is the **only** scheme the benchmark treats as validated reference
behaviour. It is fully documented here because a research reference should be
inspectable.

### Frame format (big-endian)

```
MAGIC (4 bytes) | VERSION (1 byte) | LENGTH (2 bytes) | PAYLOAD (LENGTH) | CHECKSUM (1 byte)
```

- `MAGIC`   = `0x41 0x57 0x4C 0x31` (`"AWL1"`) — identifies our frame and
  sharply reduces accidental matches.
- `VERSION` = `0x01`.
- `LENGTH`  = payload length in UTF-8 bytes (0–65535), big-endian.
- `CHECKSUM`= `(VERSION + LENGTH_hi + LENGTH_lo + sum(payload)) mod 256`.

### Bit → character

Each frame bit becomes one zero-width character:

- `0` → **U+200B** ZERO WIDTH SPACE
- `1` → **U+200C** ZERO WIDTH NON-JOINER

### Weaving (insertion strategies)

The marker run is woven into the text **without altering any visible
character**, so the marked text is *rendered* identically to the original.

- `start` — the whole run goes before the first character.
- `end` — the whole run goes after the last character.
- `distributed` — the marker run is split into near-equal contiguous chunks
  (sizes differ by at most one) placed at every `stride`-th code point, so no
  single trailing run holds more than ~1/⌈n/stride⌉ of the frame. On the
  benchmark corpus this keeps the trailing run at **0–10%** of the frame
  (measured; the previous implementation dumped all leftovers into one tail
  run — 82–95%). Measured truncation outcome on the fixed corpus: at a 1%
  tail trim, 1/5 samples still recovers the full payload (`end`: 0/5); at a
  25% tail trim **no** strategy recovers any payload — header-level `partial`
  evidence survives on all samples for both `distributed` and `end`. This is a
  measurement on the built-in corpus, **not** a general robustness claim.

### Reversibility

Removing every `U+200B` / `U+200C` restores the exact original visible text.
The `stripMarkers()` helper in `src/lib/watermark.ts` performs this, and the
Decoder's "visible text" panel shows the result.

### Decoder evidence classification

| Status      | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `complete`  | Valid MAGIC + VERSION + LENGTH + CHECKSUM; payload fully recovered **and** valid UTF-8. |
| `partial`   | Marker characters are present but no complete payload could be read. Two distinct sub-cases: **(a) insufficient bits** — fewer marker bits than the 56-bit frame header needs, so nothing was recognized (the `reason` line states this), or **(b) recognized-but-truncated** — an intact header declaring N payload bytes where fewer survived. The `reason` line distinguishes them. |
| `invalid`   | Markers are present but the frame is corrupt (bad magic/version/checksum), or the payload bytes are **not valid UTF-8** (strict `TextDecoder({ fatal: true })` — replacement characters are never silently accepted). Could also be unrelated zero-width characters. |
| `absent`    | No `U+200B` / `U+200C` marker characters were found at all.             |

`detected` is `true` only for `complete`. For aggregate benchmark metrics see
the two decision rules under [Metrics definitions](#metrics-definitions).


---

## Reproducing the benchmark results

The benchmark is **deterministic**: it uses a hard-coded corpus of samples and
transformations, with no randomness, no timers in the measurement path, and no
network. The same inputs always produce the same numbers on any machine.

### In the app

1. Open the **Benchmark** tab.
2. Click **Run benchmark**.
3. Optionally click **Download JSON** to save the full report
   (`anchor-weave-benchmark.json`).

### From the command line / in a test

The same `runBenchmark()` function backs both the UI and the unit tests, so the
numbers in `src/test/benchmark.test.ts` and the dashboard always agree:

```bash
npm test
```

The test suite asserts, among other things (this list matches
`src/test/benchmark.test.ts` and `src/test/watermark.test.ts` exactly):

- **Valid recovery rate is 1.0** (payload equality) through every
  marker-preserving transform: `nfc`, `nfd`, `nfkc`, `nfkd`,
  `whitespace-cleanup`, `format-markdown`.
- **Valid recovery and marker evidence are both 0.0** through every
  destructive transform: `strip-zero-width`, `plaintext-copy`, `format-html`,
  `format-pdf-like`, `retype-visible`.
- `delete-markers` and `truncate-tail`: marker evidence survives, payload
  recovery never does (0.0).
- **False positives under both decision rules** are pinned: 0/6 clean samples
  ever fully decode (recovery rule); 3/6 show marker-level evidence (evidence
  rule — stray zero-width characters, never a valid frame).
- **Visual equivalence is 1.0** (encode never changes visible text).
- Direct unit tests for `plaintextCopy`, `formatToMarkdown`, and
  `formatToPdfLike` in `src/test/transforms.test.ts`, plus strict-UTF-8
  rejection tests for the baseline and both experimental prototypes.

### Corpus

Samples live in `BENCHMARK_SAMPLES` and `CLEAN_SAMPLES` in
`src/lib/benchmark.ts`. Each sample is watermarked with the **distributed**
strategy (stride 4) and then passed through every entry in `TRANSFORMS`
(`src/lib/transforms.ts`). To change the corpus, edit those arrays — results
update automatically everywhere.

### Metrics definitions

Two decision rules are used throughout and are always reported side by side
(no metric is compared against another computed under a different rule):

- **Valid-recovery rule** — a positive means: a fully checksum-valid frame
  **whose decoded payload equals the originally embedded payload**.
- **Marker-evidence rule** — a positive means: any marker evidence at all
  (`complete`, `partial`, or `invalid`). This is a marker-*presence* signal.

Metrics:

- **Valid recovery rate** = cases meeting the valid-recovery rule / total
  cases. *(Changed: previously this counted `complete` status alone; payload
  equality is now required. On the fixed corpus both definitions give the
  same number today, but the equality check makes the guarantee real.)*
- **Marker evidence rate** = cases meeting the marker-evidence rule / total
  cases. *(Renamed from "detection rate"; definition unchanged.)*
- **False positives — recovery rule** = clean samples that fully decode /
  clean samples.
- **False positives — evidence rule** = clean samples showing any marker
  evidence / clean samples. *(Both rates are now reported; previously only
  the complete-only rule was shown next to an evidence-based detection rate,
  which flattered the false-positive number.)*
- **Marker overhead** = average (markers / total code points) across cases,
  measured at encode time.
- **Visual equivalence** = fraction of cases where
  `stripMarkers(marked) === original` (encode-time property).

The clean-text corpus (`CLEAN_SAMPLES`) was expanded from 3 to 6 samples and
now includes stray zero-width characters, an emoji ZWJ sequence, and a long
stray marker run without valid magic, so both false-positive rules are
exercised by realistic near-miss inputs.

> These numbers describe **only the fixed built-in corpus**. They are not a
> claim about real-world robustness.


---

## Threat model (baseline)

### Defends against (weakly)

- **Casual, accidental removal** — the markers are invisible on screen.
- **Naive copy/paste** that preserves raw characters.
- **Tail truncation** — header-level (`partial`) evidence survives on both
  strategies at a 25% tail trim, but full payload recovery does **not**:
  measured on the fixed corpus, `distributed` recovered 1/5 payloads at a 1%
  trim (`end`: 0/5) and 0/5 at a 25% trim for both. Treat payload recovery
  after any trim as unreliable — this is a measurement, not a guarantee.

### Does NOT defend against

- **Zero-width stripping / Unicode normalization** — the marker alphabet is
  known and this tool ships the detector that finds it.
- **Re-typing, reformatting, or HTML/PDF flattening** — all drop the markers.
- **A determined analyst** — the watermark is trivially detectable.
- **Forgery** — there is **no secret key**. Anyone can embed an identical frame,
  so a `complete` decode proves a frame was *present*, not who authored it.

---

## Known limitations

- **Not steganographic.** Zero-width characters are detectable by inspection,
  and this app demonstrates the detection.
- **Not robust.** Any process that strips zero-width characters, re-types the
  text, or flattens it destroys the watermark.
- **Collides with legitimate `U+200B`/`U+200C`.** If the original text already
  contains those characters, they will be misread as marker bits. (A production
  scheme would first check the source text.)
- **Not proof of authorship.** No identity key is involved; see the threat model.
- **Not patentable/novel.** This is a well-known class of technique included
  only as a benchmark reference.
- **Visual equivalence = rendered equivalence.** The raw characters differ (that
  is the point); only the *rendered* text matches.
- **Benchmarks are corpus-specific.** They do not generalize to the real world.

---

## Security & privacy

- **Pasted text is never executed as code.** The codec only reads and rewrites
  characters. There is no `eval`, no `Function`, and no dynamic code path
  anywhere in `src/lib/`.
- **No network.** Nothing is ever sent off-device; there are no `fetch`/XHR
  calls in the document-processing code paths.
- **No persistent storage by default.** Document text and payloads live only in
  React component state and vanish on reload. Nothing is written to
  `localStorage`, cookies, or IndexedDB. (The Benchmark "Download JSON" button
  writes a file only when you explicitly click it.)
- **No keys stored.** The baseline has no secret key at all, and the app stores
  no private keys.
- **Signature / authorship.** This tool does **not** implement digital
  signatures and does **not** describe frame recovery as proof of real-world
  authorship. Establishing authorship would require a trusted identity key
  (e.g. a verifiable digital signature bound to a real-world identity), which is
  out of scope here.

---

## Experimental algorithms

The **Experimental β** tab is strictly separated from the validated baseline.
Its algorithms are **unvalidated prototypes** (currently two: *Anchor interval*
and *Whitespace rhythm*). They are:

- never folded into the baseline benchmark numbers,
- always labelled EXPERIMENTAL in the UI, and
- accompanied by an explicit list of limitations.

Treat any output from that tab as exploratory only — not as working, robust, or
evidentiary.

To register a new prototype, implement the `ExperimentalAlgorithm` interface in
`src/lib/experimental.ts` and add it to `EXPERIMENTAL_ALGORITHMS`.

---

## Project structure

```
src/
  lib/
    unicode.ts        # code-point inspection & zero-width helpers
    watermark.ts      # baseline ZW-binary encoder/decoder (documented, reversible)
    transforms.ts     # Transformation Lab primitives
    benchmark.ts      # deterministic benchmark harness + corpus
    experimental.ts   # unvalidated research prototypes (separate registry)
    ui.ts             # tiny shared UI helpers (clipboard, pct, cx)
  components/
    TextWorkbench.tsx       # module 1
    BaselineEncoder.tsx     # module 2
    TransformationLab.tsx   # module 3
    Decoder.tsx             # module 4
    BenchmarkDashboard.tsx  # module 5
    ExperimentalInterface.tsx# module 6
    AboutPanel.tsx          # security / threat model / limitations
    Primitives.tsx, Buttons.tsx, StatusBadge.tsx  # shared UI
  test/               # Vitest unit tests
  App.tsx, main.tsx, index.css
```

---

## License

MIT. Provided for research and educational use. No warranty; see the limitations
above.

