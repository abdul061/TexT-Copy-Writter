# How to Use the Odd SEM Project Website

## 1. Running the project locally

```bash
cd /home/abdul/Desktop/Odd_SEM_project
npm install
npm run dev
```
The Vite dev server starts at `http://localhost:5173`. Open that URL in your browser.

## 2. Typical usage flow

| Step | Action | Component |
|------|--------|------------|
| **A** | Enter a sentence and a payload (e.g. `owner=alice;doc=1;v=1`) in the **Baseline Encoder**. | `BaselineEncoder.tsx` |
| **B** | Choose an insertion strategy: `start`, `end`, or `distributed` (with a stride). | Same component |
| **C** | Click **Encode** – the marked copy appears visually identical but contains invisible zero‑width characters. | Same component (`encodeWatermark`) |
| **D** | Copy the marked text and share it. | UI textarea |
| **E** | Paste the marked text into the **Decoder**. | `Decoder.tsx` |
| **F** | Click **Extract evidence** – the decoder scans for markers, validates the frame (magic, version, checksum) and recovers the payload. | Same component (`decodeWatermark`) |
| **G** | The recovered payload and the visible‑text (markers stripped) are shown. | Same component |

## 3. Component catalogue (quick reference)

| Component | What it does | Source file |
|-----------|--------------|-------------|
| **App** | Root component, provides layout and routing. | `src/App.tsx` |
| **BaselineEncoder** | Encode a sentence with the baseline ZW‑binary watermark. Users supply a sentence, a payload, and an insertion strategy. | `src/components/BaselineEncoder.tsx` |
| **Decoder** | Decode a marked text, report status (`complete`/`partial`/`invalid`/`absent`), show the recovered payload, and strip markers to reveal the original sentence. | `src/components/Decoder.tsx` |
| **AboutPanel** | Static information about the project. | `src/components/AboutPanel.tsx` |
| **Buttons** | Reusable buttons, including `CopyButton`. | `src/components/Buttons.tsx` |
| **Primitives** | Basic UI primitives used by other components (`Card`, `Badge`). | `src/components/Primitives.tsx` |
| **StatusBadge** | Shows the decoder’s status badge. | `src/components/StatusBadge.tsx` |
| **TextWorkbench** | Main workbench that combines encoder, decoder and other demos. | `src/components/TextWorkbench.tsx` |
| **BenchmarkDashboard** | Displays benchmark results for the baseline scheme (research use). | `src/components/BenchmarkDashboard.tsx` |
| **ExperimentalInterface** | Interface for experimental, unvalidated algorithms (labelled *EXPERIMENTAL*). | `src/components/ExperimentalInterface.tsx` |
| **TransformationLab** | Lab for testing how text transformations affect watermark survival. | `src/components/TransformationLab.tsx` |
| **`src/lib/watermark.ts`** | Core codec: `encodeWatermark`, `decodeWatermark`, `buildFrame`, `stripMarkers`, etc. | `src/lib/watermark.ts` |
| **`src/lib/unicode.ts`** | Helpers for working with zero‑width characters (`summarizeInvisible`, …). | `src/lib/unicode.ts` |

## 4. Quick links

- **Run the app** → `npm run dev` → <http://localhost:5173>
- **Baseline Encoder** panel → source: [`BaselineEncoder.tsx`](/src/components/BaselineEncoder.tsx)
- **Decoder** panel → source: [`Decoder.tsx`](/src/components/Decoder.tsx)
- **Core watermark codec** → [`watermark.ts`](/src/lib/watermark.ts)
- **Unicode helpers** → [`unicode.ts`](/src/lib/unicode.ts)

*Anchors such as `#baselineencoder` refer to the Markdown headings inside the component files when viewed on GitHub or a Markdown viewer.*

## 5. Usage notes

- The watermark is **invisible** as long as the zero‑width characters (`U+200B` / `U+200C`) are not stripped (no PDF conversion, no “cleanup” scripts, no re‑typing).
- The **distributed** strategy spreads markers every *stride* positions (default 8). Very short sentences may not have enough positions; the encoder will error.
- No secret key is used – the same payload can be embedded by anyone; the scheme only proves *presence*, not *authorship*.
- If the input sentence already contains `U+200B` or `U+200C`, the UI warns about possible collision; it’s best to avoid those characters in the original text.

---
*Generated from the project at `/home/abdul/Desktop/Odd_SEM_project` on 2025‑08‑24.*