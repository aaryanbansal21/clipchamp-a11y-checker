# Video Accessibility Checker — Design

Date: 2026-09-10

## Purpose

A browser-only tool that scans a video for content that fails WCAG 2.3.1 (flashing that can trigger photosensitive seizures) and, optionally, checks a caption file for readability. Built as a portfolio artifact for a Clipchamp (Microsoft) internship conversation. It mirrors the shape and constraints of Clipchamp's public architecture: decode → process in a Web Worker with WebCodecs, nothing uploaded.

The tool is a **compliance aid, not a certification**. The UI keeps two tiers visibly separate:

- **Compliance** — WCAG 2.3.1 general and red flash (referenced by EN 301 549 clause 9.2.3.1, the standard behind the European Accessibility Act).
- **Readability** — caption reading speed and minimum on-screen time. These come from Netflix/BBC subtitle style guides, not law.

## Stack

- Vite + React + TypeScript
- `mediabunny` — MP4/WebM demuxing (encoded packets + decoder config)
- WebCodecs `VideoDecoder` — decoding, hardware-accelerated when available
- Vitest — unit tests for the pure analysis modules
- Vercel — static hosting (no COOP/COEP headers needed)

Browser support: Chrome, Edge, recent Safari (anything with `VideoDecoder`). Firefox is not a target; the page says so.

No UI library, no state library, no FFmpeg.

## Pipeline

```
Main thread                              Worker (analyze.worker.ts)
────────────────────────────────         ─────────────────────────────────────────────
drop file ── File ──────────────▶        Mediabunny: first video track, decoder config,
                                         stream encoded packets in decode order
◀── progress {t, duration} ──────        VideoDecoder.isConfigSupported → configure
◀── event  {FlashEvent} ─────────        decode(packet) with back-pressure:
◀── done   {frames, ms} ─────────          if decodeQueueSize > 8, await 'dequeue'
◀── error  {message} ────────────        output(frame):
                                           drawImage → 64×36 OffscreenCanvas
captions .srt/.vtt parsed on               getImageData → luminance + red grids
main thread (plain text)                   frame.close()
                                           detector.push(t, lum, red) → events
```

### Worker message protocol

Main → worker:

```ts
{ type: 'analyze', file: File }
```

Worker → main:

```ts
{ type: 'progress', t: number, duration: number }   // seconds
{ type: 'event', event: FlashEvent }
{ type: 'done', frames: number, ms: number }
{ type: 'error', message: string }
```

Progress is posted at most ~10×/second (throttled in the worker). Events are posted as they are found so markers appear live.

### Frame reduction (`analysis/luminance.ts`)

Given `ImageData` from the 64×36 canvas (aspect fixed; the canvas letterboxes nothing — it just squashes, which is fine for area-fraction math), produce:

- `lum: Float32Array` — relative luminance per cell, 0–1, using the sRGB → linear formula from WCAG.
- `red: Uint8Array` — 1 if the cell is *saturated red*: `R/(R+G+B) >= 0.8` and `(R − G − B) × 320 > 20` (PEAT definition), else 0.

This function is pure (takes `{data, width, height}`), so it is unit-testable in Node.

## Flash detector (`analysis/flash.ts`)

Pure TypeScript, no browser APIs. Streaming API:

```ts
class FlashDetector {
  constructor(cells: number, opts?: Partial<Thresholds>)
  push(t: number, lum: Float32Array, red: Uint8Array): FlashEvent[]  // events newly completed
  finish(): FlashEvent[]                                             // flush open events
}

type FlashEvent = { kind: 'general' | 'red'; start: number; end: number; peakPerSecond: number }
```

Thresholds (defaults = WCAG 2.3.1):

| name | default | meaning |
|---|---|---|
| `deltaLum` | 0.10 | min luminance swing from last turning point |
| `darkBelow` | 0.80 | darker side of the swing must be below this |
| `areaFraction` | 0.25 | fraction of cells that must transition together |
| `maxFlashesPerSecond` | 3 | more than this in any 1 s window is a violation |

Algorithm:

1. **Per-cell state**: last turning-point luminance and current direction (+1, −1, 0). On each frame, a cell registers a transition when its luminance has moved ≥ `deltaLum` from the turning point in the opposite direction of the current one, and the darker of the two values is < `darkBelow`. The turning point then updates.
2. **Frame-level transition**: if ≥ `areaFraction` of cells transition in the same direction in this frame, record `{t, dir}` in the general transition list. Direction must alternate; two same-direction frame transitions in a row count once.
3. **Red channel**: same procedure, but the per-cell signal is entering or leaving saturated red (a change in the `red` bit). Kept in a separate transition list.
4. **Counting**: a flash is a pair of opposing transitions. For each list, slide a 1 s window over transitions; if `floor(count / 2) > maxFlashesPerSecond`, the window is a violation. Overlapping or touching violation windows merge into one `FlashEvent`; `peakPerSecond` is the max flashes/second seen inside it.

Deliberate simplifications (marked `// ponytail:` in code):

- Area is measured against the **whole frame**, not WCAG's 341×256 px viewport at 1024×768. Upgrade path: larger grid + sliding window.
- Colour is grid-averaged (a 64×36 cell is ~30×30 source pixels at 1080p). Fine for flash detection, which is about large-area changes.

## Caption checks (`analysis/captions.ts`)

Hand-written parser for SRT and WebVTT (both are `index?`, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, text lines, blank line). HTML-style tags are stripped from text before counting.

```ts
parseCaptions(text: string): Cue[]           // { start, end, text }
checkCaptions(cues: Cue[]): CaptionEvent[]   // { kind: 'fast' | 'brief'; start; end; cps; text }
```

| check | threshold | source |
|---|---|---|
| `fast` | > 20 characters per second (whitespace included) | Netflix Timed Text Style Guide (adult) |
| `brief` | on screen < 0.833 s | Netflix minimum duration (5/6 s) |

## UI (`App.tsx`, `ui/Timeline.tsx`, `ui/IssueList.tsx`)

Single page, top to bottom:

1. Header with title and a **Compliance / Readability** legend.
2. Drop zone (video, plus optional caption file). Also accepts click-to-browse.
3. `<video>` preview of the dropped file (object URL).
4. Progress bar while scanning, with frames/second so the speed is visible.
5. **Timeline strip** directly under the video: width = duration; markers at event positions, colour-coded (red = general flash, dark red = red flash, blue = caption). Markers appear live. Click → seek video to `start`.
6. Summary badge: **Pass** or **N compliance issues · M readability notes**.
7. Issue list: time range, kind, one-line reason (e.g. "5 flashes/s, WCAG 2.3.1 allows 3"). Click → seek.
8. Footer: "How it works" with the pipeline diagram and the pitch numbers (EAA date, 1 in 4,000, 75% watch on mute), plus the "compliance aid, not certification" line.

State lives in `App.tsx` via `useState`/`useReducer`; the worker is created once per analysis and terminated on `done`/`error`/new file.

## Errors

| condition | behaviour |
|---|---|
| `typeof VideoDecoder === 'undefined'` | Page shows "Needs Chrome, Edge or Safari 16.4+" instead of the drop zone. |
| `isConfigSupported` → false | Error state: "Codec `<codec>` not supported by this browser's decoder." |
| No video track / Mediabunny throws | Error state with the message. |
| Decoder `error` callback | Error state; worker terminated. |
| Bad caption file | Inline note under the drop zone; video analysis still runs. |

The page stays usable after any error: dropping a new file resets state.

## Testing

**Vitest (pure modules):**

- `flash.test.ts`
  - 5 Hz full-frame square wave (alternating 0.1 / 0.9) → one `general` event, `peakPerSecond` = 5.
  - 2 Hz full-frame → no events.
  - 5 Hz on 10% of cells → no events.
  - Red on/off at 5 Hz (with luminance held constant) → one `red` event, no `general` event.
  - Two 5 Hz bursts separated by 0.5 s → one merged event.
  - Swing of 0.08 at 5 Hz → no events (below `deltaLum`).
- `captions.test.ts`
  - Parses a 3-cue SRT and the same as VTT to identical `Cue[]`.
  - 40-character cue over 1 s → `fast`, `cps` = 40.
  - 0.5 s cue → `brief`.
  - Tags like `<i>` are stripped before counting.
- `luminance.test.ts`
  - Pure white / black / saturated red pixel data → expected `lum` and `red` values.

**Fixture videos** (`scripts/make-fixtures.sh`, requires `ffmpeg` CLI): `flash-5hz.mp4`, `steady.mp4`, `red-5hz.mp4`, each 5 s at 1280×720/30 fps. Used for manual browser checks and as demo files. Expected results are listed in the script header.

## Repo layout

```
index.html
package.json
vite.config.ts
tsconfig.json
src/
  main.tsx
  App.tsx
  ui/Timeline.tsx
  ui/IssueList.tsx
  analysis/types.ts
  analysis/luminance.ts
  analysis/flash.ts
  analysis/captions.ts
  analysis/*.test.ts
  worker/analyze.worker.ts
scripts/make-fixtures.sh
docs/superpowers/specs/2026-09-10-a11y-checker-design.md
README.md   ← one-page write-up: problem, numbers, architecture, how to run
```

## Out of scope (v1)

- Burned-in caption contrast (needs OCR).
- Broadcast-standard checks (ITU-R BT.1702 patterns, scene-cut rate).
- Exporting a report file.
- Analysing a Clipchamp project directly; the tool takes an exported MP4, which stands in for the compositor output. In production the checker would sit after the compositor stage so effects and titles are included.
